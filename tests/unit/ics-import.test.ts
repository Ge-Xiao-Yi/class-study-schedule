import { describe, expect, it } from "vitest";
import { parseIcsCourses } from "../../src/lib/ics-courses";
import { parseCourseFile } from "../../src/lib/course-files";
import {
  inferMapping,
  mapRows,
  previewImport,
  applyCourseImport,
} from "../../src/domain/course-import";
import { semester, seed } from "./fixtures";
import { resolveWeek } from "../../src/domain/courses";
const calendar = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//Schedule//ZH\r\n${events}\r\nEND:VCALENDAR`;
const event = (
  extra = "",
  start = "20260907T080000",
  end = "20260907T094000",
  uid = "course",
) =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:高等数学\r\nLOCATION:A101\r\nDTSTART:${start}\r\nDTEND:${end}\r\n${extra}\r\nEND:VEVENT`;
function preview(text: string) {
  const sheet = parseIcsCourses(text, semester, "Asia/Shanghai");
  return previewImport(
    mapRows(sheet.rows, inferMapping(sheet.headers)),
    seed(),
  );
}
function imported(text: string) {
  return applyCourseImport(
    { ...seed(), courses: [] },
    preview(text).map((p) => ({ ...p.row, confirmed: true })),
    semester.profileId,
    "now",
  );
}
describe("ICS 课表", () => {
  it("单次事件、UTF-8 折行和文本转义映射到现有预览", async () => {
    const text = calendar(
      event()
        .replace("SUMMARY:高等数学", "SUMMARY:高等\r\n 数学\\,基础")
        .replace("LOCATION:A101", "LOCATION:A\\;101"),
    );
    const [sheet] = await parseCourseFile(
      "a.ICS",
      new TextEncoder().encode(text).buffer,
      "gb18030",
      semester,
    );
    const result = previewImport(
      mapRows(sheet.rows, inferMapping(sheet.headers)),
      seed(),
    );
    expect(result[0].draft).toMatchObject({
      name: "高等数学,基础",
      location: "A;101",
      repeatType: "once",
      occurrenceDate: "2026-09-07",
      weekday: 1,
      startTime: "08:00",
    });
    expect(result[0].row.confirmed).toBe(false);
  });
  it("每周 COUNT 合并为模板，不生成大量记录", () => {
    const state = imported(calendar(event("RRULE:FREQ=WEEKLY;COUNT=4")));
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0]).toMatchObject({
      repeatType: "weekly",
      startWeek: 2,
      endWeek: 5,
      occurrenceDate: null,
    });
    expect(state.exceptions).toEqual([]);
    expect(resolveWeek(state, "2026-09-28")).toHaveLength(1);
    expect(resolveWeek(state, "2026-10-05")).toHaveLength(0);
  });
  it("多星期重复和每日重复按星期压缩", () => {
    expect(
      imported(calendar(event("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6")))
        .courses,
    ).toHaveLength(2);
    expect(
      imported(calendar(event("RRULE:FREQ=DAILY;COUNT=14"))).courses,
    ).toHaveLength(7);
  });
  it("隔周和 EXDATE 只保留实际日期，重复导入幂等", () => {
    const text = calendar(
      event("RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3\r\nEXDATE:20260921T080000"),
    );
    const state = imported(text);
    expect(state.courses.map((c) => c.occurrenceDate)).toEqual([
      "2026-09-07",
      "2026-10-05",
    ]);
    expect(
      applyCourseImport(
        state,
        preview(text).map((p) => ({ ...p.row, confirmed: true })),
        semester.profileId,
        "now",
      ),
    ).toEqual(state);
  });
  it("EXDATE、RDATE 及单周调课，不影响其他 UID", () => {
    const exceptions = `BEGIN:VEVENT\r\nUID:course\r\nRECURRENCE-ID:20260914T080000\r\nDTSTART:20260915T100000\r\nDTEND:20260915T110000\r\nSUMMARY:调整数学\r\nEND:VEVENT`;
    const text = calendar(
      event(
        "RRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20260921T080000\r\nRDATE:20260928T080000",
      ) +
        "\r\n" +
        exceptions +
        "\r\n" +
        event("", "20260914T080000", "20260914T094000", "other"),
    );
    const state = imported(text);
    expect(
      resolveWeek(state, "2026-09-14").map((c) => [c.date, c.course.name]),
    ).toEqual([
      ["2026-09-14", "高等数学"],
      ["2026-09-15", "调整数学"],
    ]);
    expect(resolveWeek(state, "2026-09-21")).toHaveLength(0);
    expect(resolveWeek(state, "2026-09-28")).toHaveLength(1);
  });
  it("取消例外无 DTSTART 可跳过，学期外调课移入可显示", () => {
    const cancel = `BEGIN:VEVENT\r\nUID:course\r\nRECURRENCE-ID:20260914T080000\r\nSTATUS:CANCELLED\r\nEND:VEVENT`;
    expect(
      resolveWeek(
        imported(
          calendar(event("RRULE:FREQ=WEEKLY;COUNT=3") + "\r\n" + cancel),
        ),
        "2026-09-14",
      ),
    ).toHaveLength(0);
    const moved = event(
      "RECURRENCE-ID:20261228T080000",
      "20260914T100000",
      "20260914T110000",
    );
    const state = imported(
      calendar(
        event("RRULE:FREQ=WEEKLY", "20261228T080000", "20261228T094000") +
          "\r\n" +
          moved,
      ),
    );
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].occurrenceDate).toBe("2026-09-14");
  });
  it("UTC 日期转换与无 VTIMEZONE 的 IANA 时区", () => {
    const utc = preview(
      calendar(event("", "20260906T233000Z", "20260907T003000Z")),
    )[0].draft;
    expect(utc).toMatchObject({
      occurrenceDate: "2026-09-07",
      startTime: "07:30",
      endTime: "08:30",
    });
    const text = calendar(
      event()
        .replace("DTSTART:", "DTSTART;TZID=Asia/Shanghai:")
        .replace("DTEND:", "DTEND;TZID=Asia/Shanghai:"),
    );
    expect(preview(text)[0].draft?.startTime).toBe("08:00");
  });
  it("UNTIL 含末日，时区夏令时变化不被压成错误模板", () => {
    const text = calendar(
      event(
        "RRULE:FREQ=WEEKLY;UNTIL=20261109T140000Z",
        "20261026T090000",
        "20261026T100000",
      )
        .replace("DTSTART:", "DTSTART;TZID=America/New_York:")
        .replace("DTEND:", "DTEND;TZID=America/New_York:"),
    );
    const rows = preview(text);
    expect(rows.map((r) => r.draft?.startTime)).toEqual(["21:00", "22:00"]);
    expect(rows[1].draft?.repeatType).toBe("weekly");
    expect(rows[1].draft?.endWeek).toBe(11);
  });
  it("文件内 VTIMEZONE 和 DURATION", () => {
    const zone =
      "BEGIN:VTIMEZONE\r\nTZID:School/Local\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\nEND:STANDARD\r\nEND:VTIMEZONE";
    const e = event()
      .replace("DTSTART:", "DTSTART;TZID=School/Local:")
      .replace("DTEND:20260907T094000", "DURATION:PT100M");
    expect(preview(calendar(zone + "\r\n" + e))[0].draft).toMatchObject({
      startTime: "08:00",
      endTime: "09:40",
    });
  });
  it("无限重复仅导入当前学期内，模板截止不越界", () => {
    const state = imported(calendar(event("RRULE:FREQ=WEEKLY")));
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].endWeek).toBe(16);
    expect(resolveWeek(state, "2026-12-21")).toHaveLength(0);
  });
  it.each([
    calendar(event("", "20260931T080000", "20260931T090000")),
    calendar(event("", "20260907T250000", "20260907T260000")),
    calendar(event("RRULE:FREQ=WEEKLY;COUNT=2;UNTIL=20260921T080000")),
    "garbage",
    calendar(event("RRULE:FREQ=MONTHLY")),
    calendar(
      event().replace("DTSTART:20260907T080000", "DTSTART;VALUE=DATE:20260907"),
    ),
    calendar(event("", "20260907T230000", "20260908T010000")),
    calendar(event().replace("DTSTART:", "DTSTART;TZID=Unknown/Zone:")),
    calendar(event("RECURRENCE-ID:20260914T080000")),
    calendar(event().replace("UID:course", "UID:")),
    calendar(event("", "20260907T080030", "20260907T094000")),
    calendar(event("", "20270101T080000", "20270101T090000")),
    calendar(event("RRULE:FREQ=DAILY", "19000101T080000", "19000101T090000")),
  ])("无效或不支持的 ICS 不能返回可导入数据 %s", (text) =>
    expect(() => preview(text)).toThrow(),
  );
});
