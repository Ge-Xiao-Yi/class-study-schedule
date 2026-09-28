import ICAL from "ical.js";
import type { Semester } from "../types/course";
import {
  addDays,
  calendarDaysBetween,
  parseDate,
  teachingWeek,
  weekday,
} from "../domain/dates";
import {
  blankImportRow,
  importFields,
  MAX_IMPORT_ROWS,
  type ImportRow,
} from "../domain/course-import";
import type { ImportSheet } from "./course-files";

const pad = (n: number) => String(n).padStart(2, "0");
const civilDate = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
const civilNumber = (t: ICAL.Time) =>
  Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
function formatter(zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}
function fields(f: Intl.DateTimeFormat, instant: number) {
  const p = Object.fromEntries(
    f.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    seconds: Number(p.second),
    number: Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    ),
  };
}
/** Bridge missing IANA definitions with the browser's timezone database. For a
 * DST overlap use the first occurrence; reject nonexistent local wall times. */
function ianaZone(id: string) {
  const f = formatter(id),
    zone = new ICAL.Timezone({ tzid: id });
  zone.utcOffset = (time: ICAL.Time) => {
    const wall = civilNumber(time);
    const offsets = new Set(
      [-36, 0, 36].map((h) => {
        const instant = wall + h * 3600000;
        return fields(f, instant).number - instant;
      }),
    );
    const matches = [...offsets]
      .map((offset) => wall - offset)
      .filter((instant) => fields(f, instant).number === wall)
      .sort((a, b) => a - b);
    if (!matches.length) throw new Error(`时区 ${id} 中存在无效的夏令时时间。`);
    return (wall - matches[0]) / 1000;
  };
  return zone;
}
function validateTime(time: ICAL.Time) {
  parseDate(civilDate(time));
  if (time.isDate)
    throw new Error("全天事件没有课程起止时间，请改为带时间的事件后导入。");
  if (
    time.hour < 0 ||
    time.hour > 23 ||
    time.minute < 0 ||
    time.minute > 59 ||
    time.second < 0 ||
    time.second > 59
  )
    throw new Error("ICS 日期或时间无效。");
}

export function parseIcsCourses(
  text: string,
  semester: Semester,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): ImportSheet {
  const restored = new Map<string, ICAL.Timezone | undefined>();
  try {
    text = text.replace(/^\uFEFF/, "").trim();
    if (
      !/^BEGIN:VCALENDAR\r?\n/i.test(text) ||
      !/\r?\nEND:VCALENDAR$/i.test(text)
    )
      throw new Error("不是完整的 VCALENDAR 文件。");
    const calendar = new ICAL.Component(ICAL.parse(text));
    if (
      calendar.name !== "vcalendar" ||
      calendar.getFirstPropertyValue("version") !== "2.0"
    )
      throw new Error("仅支持 iCalendar 2.0。");
    if (calendar.getFirstPropertyValue("method") === "CANCEL")
      throw new Error("取消通知不是可导入课表，不会删除已有课程。");
    const components = calendar.getAllSubcomponents("vevent");
    if (!components.length || components.length > 1000)
      throw new Error("ICS 需包含 1–1000 个课程事件。");
    const local = formatter(timeZone);
    // Register only missing zones and restore global state even when validation fails.
    for (const component of components)
      for (const property of component.getAllProperties()) {
        const tzid = property.getParameter("tzid");
        if (
          typeof tzid === "string" &&
          !calendar.getTimeZoneByID(tzid) &&
          !restored.has(tzid)
        ) {
          restored.set(tzid, ICAL.TimezoneService.get(tzid));
          try {
            ICAL.TimezoneService.register(ianaZone(tzid), tzid);
          } catch {
            throw new Error(
              `无法识别时区 ${tzid}，请导出含 VTIMEZONE 定义的文件。`,
            );
          }
        }
        if (
          ["dtstart", "dtend", "recurrence-id", "exdate", "rdate"].includes(
            property.name,
          )
        ) {
          if (property.type !== "date-time")
            throw new Error("暂不支持全天事件或 RDATE 时间段值。");
          // Validate raw jCal values before ICAL.Time can normalize overflow.
          for (const raw of property.toJSON().slice(3) as unknown[]) {
            if (
              typeof raw !== "string" ||
              !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ?$/.test(raw)
            )
              throw new Error("ICS 日期或时间格式无效。");
            parseDate(raw.slice(0, 10));
          }
          for (const value of property.getValues())
            validateTime(value as ICAL.Time);
        }
      }
    const masters = new Map<string, ICAL.Component>(),
      exceptions = new Map<string, ICAL.Component[]>();
    for (const c of components) {
      const uid = c.getFirstPropertyValue("uid");
      if (typeof uid !== "string" || !uid)
        throw new Error("课程事件缺少 UID。");
      if (c.hasProperty("recurrence-id")) {
        if (c.getFirstProperty("recurrence-id")!.getParameter("range"))
          throw new Error("暂不支持 RANGE 范围调课，请导出具体单次调整。");
        exceptions.set(uid, [...(exceptions.get(uid) ?? []), c]);
      } else {
        if (masters.has(uid))
          throw new Error("文件含同一 UID 的多个版本，请先整理日历。");
        masters.set(uid, c);
      }
    }
    for (const uid of exceptions.keys())
      if (!masters.has(uid)) throw new Error("单次调课缺少原始重复事件。");
    const groups = new Map<string, ImportRow[]>();
    let iterations = 0,
      occurrenceCount = 0,
      cancelled = 0;
    const inRange = (date: string) =>
      date >= semester.startDate && date <= semester.endDate;
    const toLocal = (t: ICAL.Time) => {
      validateTime(t);
      if (t.zone === ICAL.Timezone.localTimezone)
        return {
          date: civilDate(t),
          time: `${pad(t.hour)}:${pad(t.minute)}`,
          seconds: t.second,
        };
      return fields(local, t.toUnixTime() * 1000);
    };
    function add(
      uid: string,
      component: ICAL.Component,
      start: ICAL.Time,
      end: ICAL.Time,
      base: ICAL.Component,
    ) {
      const from = toLocal(start),
        to = toLocal(end);
      if (!inRange(from.date)) return;
      if (from.seconds || to.seconds)
        throw new Error("课程仅支持分钟精度，请将 ICS 起止秒数设为 00。");
      if (from.date !== to.date || to.time <= from.time)
        throw new Error("ICS 包含跨午夜或结束不晚于开始的课程。");
      const values = {
        ...blankImportRow(),
        name: String(
          component.getFirstPropertyValue("summary") ??
            base.getFirstPropertyValue("summary") ??
            "",
        ),
        location: String(
          component.getFirstPropertyValue("location") ??
            base.getFirstPropertyValue("location") ??
            "",
        ),
        weekday: String(weekday(from.date)),
        startTime: from.time,
        endTime: to.time,
        color: "blue",
        repeatType: "once",
        startWeek: "1",
        endWeek: "1",
        occurrenceDate: from.date,
      };
      const key = JSON.stringify([
        uid,
        values.name,
        values.location,
        values.weekday,
        values.startTime,
        values.endTime,
      ]);
      groups.set(key, [...(groups.get(key) ?? []), values]);
      if (++occurrenceCount > 10000)
        throw new Error("学期内日历实例超过 10000 条，请缩小导出范围。");
    }
    for (const [uid, component] of masters) {
      if (component.getFirstPropertyValue("status") === "CANCELLED") {
        cancelled++;
        continue;
      }
      if (
        !component.hasProperty("dtstart") ||
        (!component.hasProperty("dtend") && !component.hasProperty("duration"))
      )
        throw new Error("课程需有 DTSTART 和 DTEND 或 DURATION。");
      if (component.hasProperty("dtend") && component.hasProperty("duration"))
        throw new Error("DTEND 与 DURATION 不能同时出现。");
      if (component.hasProperty("exrule"))
        throw new Error("暂不支持 EXRULE，请使用 EXDATE 排除日期。");
      const rules = component.getAllProperties("rrule");
      if (rules.length > 1) throw new Error("每个课程仅支持一条 RRULE。");
      for (const property of rules) {
        const rule = property.getFirstValue() as ICAL.Recur;
        if (rule.count !== null && rule.until)
          throw new Error("RRULE 的 COUNT 和 UNTIL 不能同时使用。");
        if (
          !["DAILY", "WEEKLY"].includes(rule.freq) ||
          Object.keys(rule.parts).some((p) => p !== "BYDAY") ||
          rule
            .getComponent("BYDAY")
            .some((d) => !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(String(d)))
        )
          throw new Error(
            "重复规则仅支持 DAILY/WEEKLY、INTERVAL、COUNT、UNTIL、BYDAY 和 WKST。",
          );
        if (
          !Number.isSafeInteger(rule.interval) ||
          rule.interval < 1 ||
          (rule.count !== null &&
            (!Number.isSafeInteger(rule.count) || rule.count < 1))
        )
          throw new Error("重复次数或间隔无效。");
      }
      const event = new ICAL.Event(component, { exceptions: [] });
      const changes = exceptions.get(uid) ?? [];
      const changed = new Set<string>();
      for (const c of changes) {
        const id = (c.getFirstPropertyValue("recurrence-id") as ICAL.Time)
          .toUnixTime()
          .toString();
        if (changed.has(id)) throw new Error("同一天的课程例外重复。");
        changed.add(id);
      }
      const iterator = event.iterator();
      let next: ICAL.Time | undefined;
      while ((next = iterator.next())) {
        if (++iterations > 10000)
          throw new Error("日历重复范围过大，请缩小导出范围后导入。");
        // A two-day margin covers UTC offsets without relying on machine timezone.
        if (civilDate(next) > addDays(semester.endDate, 2)) break;
        if (changed.has(next.toUnixTime().toString())) continue;
        const occurrence = event.getOccurrenceDetails(next);
        add(
          uid,
          component,
          occurrence.startDate,
          occurrence.endDate,
          component,
        );
      }
      for (const c of changes) {
        if (c.getFirstPropertyValue("status") === "CANCELLED") {
          cancelled++;
          continue;
        }
        if (
          !c.hasProperty("dtstart") ||
          (!c.hasProperty("dtend") && !c.hasProperty("duration"))
        )
          throw new Error("单次调课缺少起止时间。");
        const exception = new ICAL.Event(c, { exceptions: [] });
        add(uid, c, exception.startDate, exception.endDate, component);
      }
    }
    // Compress consecutive seven-day runs. Gaps (EXDATE/interval changes) never
    // create phantom lessons. Isolated dates stay once; no stored recurrence expansion.
    const result: ImportRow[] = [];
    for (const items of groups.values()) {
      const dates = [
        ...new Map(items.map((r) => [r.occurrenceDate, r])).values(),
      ].sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
      let run: ImportRow[] = [];
      const flush = () => {
        if (!run.length) return;
        const first = run[0],
          last = run.at(-1)!;
        const a = teachingWeek(first.occurrenceDate, semester),
          b = teachingWeek(last.occurrenceDate, semester);
        if (run.length > 1 && a && b)
          result.push({
            ...first,
            repeatType: "weekly",
            startWeek: String(a),
            endWeek: String(b),
            occurrenceDate: "",
          });
        else result.push(...run);
        run = [];
      };
      for (const row of dates) {
        if (
          run.length &&
          calendarDaysBetween(
            run.at(-1)!.occurrenceDate,
            row.occurrenceDate,
          ) !== 7
        )
          flush();
        run.push(row);
      }
      flush();
    }
    if (!result.length)
      throw new Error(
        "当前学期内没有可导入的有效课程（可能已取消或在学期外）。",
      );
    if (result.length > MAX_IMPORT_ROWS)
      throw new Error("整理后超过 500 行课程，请缩小导出范围。");
    return {
      name: "ICS 课程",
      headers: Object.values(importFields),
      rows: result.map((r) =>
        Object.keys(importFields).map((k) => r[k as keyof ImportRow]),
      ),
      notice: `ICS 仅导入 ${semester.startDate} 至 ${semester.endDate} 的安排，时区转换为 ${timeZone}；无时区时间按本地时间。连续周合并为模板，隔周、排除日和调课按实际日期拆分；取消事件跳过（${cancelled} 条）。教师和节次请按需补充，导入后不与源日历同步。`,
    };
  } catch (e) {
    throw new Error(
      `ICS 导入失败：${e instanceof Error ? e.message : "无效文件"}`,
    );
  } finally {
    for (const [id, zone] of restored) {
      ICAL.TimezoneService.remove(id);
      if (zone) ICAL.TimezoneService.register(zone, id);
    }
  }
}
