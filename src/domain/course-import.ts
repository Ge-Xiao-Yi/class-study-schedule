import type { CourseDraft, ScheduleSnapshot, Semester } from "../types/course";
import { validateCourse } from "./courses";

export const importFields = {
  name: "课程名称",
  location: "地点",
  teacher: "教师",
  weekday: "星期",
  sectionText: "节次",
  startTime: "开始时间",
  endTime: "结束时间",
  color: "颜色",
  repeatType: "重复规则",
  startWeek: "起始教学周",
  endWeek: "结束教学周",
  occurrenceDate: "单次日期",
} as const;
export type ImportField = keyof typeof importFields;
export type ImportRow = Record<ImportField, string>;
export interface ImportCandidate {
  id: string;
  values: ImportRow;
  confirmed: boolean;
  source: "file" | "ocr" | "manual";
}
export type FieldMapping = Partial<Record<ImportField, number>>;
export const MAX_IMPORT_ROWS = 500;
export function blankImportRow(): ImportRow {
  return Object.fromEntries(
    Object.keys(importFields).map((k) => [k, ""]),
  ) as ImportRow;
}
export function inferMapping(headers: string[]): FieldMapping {
  const aliases: Partial<Record<ImportField, string[]>> = {
    name: ["名称", "课程"],
    location: ["教室", "上课地点"],
    weekday: ["星期几"],
    startWeek: ["开始周", "起始周"],
    endWeek: ["结束周"],
    teacher: ["任课教师"],
  };
  return Object.fromEntries(
    Object.entries(importFields).flatMap(([key, label]) => {
      const i = headers.findIndex((h) =>
        [label, key, ...(aliases[key as ImportField] ?? [])].includes(h.trim()),
      );
      return i < 0 ? [] : [[key, i]];
    }),
  );
}
export function mapRows(
  rows: string[][],
  mapping: FieldMapping,
): ImportCandidate[] {
  const indexes = Object.values(mapping).filter((i) => i !== undefined);
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= 50))
    throw new Error("字段映射列号无效。");
  if (new Set(indexes).size !== indexes.length)
    throw new Error("同一文件列不能映射到多个字段。");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(`每次最多导入 ${MAX_IMPORT_ROWS} 行。`);
  return rows.map((row, index) => ({
    id: `file-${index}`,
    source: "file",
    confirmed: false,
    values: Object.fromEntries(
      Object.keys(importFields).map((key) => [
        key,
        mapping[key as ImportField] === undefined
          ? ""
          : (row[mapping[key as ImportField]!] ?? "").trim(),
      ]),
    ) as ImportRow,
  }));
}
export function draftFromRow(row: ImportRow, semester: Semester): CourseDraft {
  const day = row.weekday.replace(/^(星期|周)/, " ").trim();
  const weekday = /^[1-7]$/.test(day)
    ? Number(day)
    : (
        { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 } as Record<
          string,
          number
        >
      )[day];
  const time = (v: string) => v.replace(/：/g, ":").replace(/^(\d):/, "0$1:");
  const repeat =
    (
      {
        每周: "weekly",
        每周重复: "weekly",
        单次: "once",
        仅本周: "once",
      } as Record<string, string>
    )[row.repeatType] ??
    (row.repeatType || "weekly");
  const color =
    (
      {
        浅蓝: "blue",
        浅绿: "green",
        浅紫: "purple",
        浅橙: "orange",
        浅粉: "pink",
      } as Record<string, string>
    )[row.color] ??
    (row.color || "blue");
  const draft: CourseDraft = {
    name: row.name.trim(),
    location: row.location.trim(),
    teacher: row.teacher.trim(),
    weekday: weekday as CourseDraft["weekday"],
    sectionText: row.sectionText.trim(),
    startTime: time(row.startTime),
    endTime: time(row.endTime),
    color: color as CourseDraft["color"],
    repeatType: repeat as CourseDraft["repeatType"],
    startWeek: row.startWeek ? Number(row.startWeek) : 1,
    endWeek: row.endWeek ? Number(row.endWeek) : semester.teachingWeeks,
    occurrenceDate: row.occurrenceDate || null,
  };
  validateCourse(draft, semester);
  if (
    ![draft.startWeek, draft.endWeek].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new Error("教学周必须是正整数，或留空使用默认值。");
  return draft;
}
// Color is cosmetic. Timing/range, name, teacher, room and section define duplicates.
export function courseImportKey(d: CourseDraft) {
  return JSON.stringify([
    d.name.trim(),
    d.location.trim(),
    d.teacher.trim(),
    d.weekday,
    d.sectionText.trim(),
    d.startTime,
    d.endTime,
    d.repeatType,
    d.repeatType === "once" ? d.occurrenceDate : [d.startWeek, d.endWeek],
  ]);
}
export function previewImport(
  rows: ImportCandidate[],
  state: ScheduleSnapshot,
) {
  const seen = new Set(state.courses.map(courseImportKey));
  return rows.map((row) => {
    try {
      const draft = draftFromRow(row.values, state.semester);
      const key = courseImportKey(draft),
        duplicate = seen.has(key);
      seen.add(key);
      return { row, draft, duplicate, error: "" };
    } catch (e) {
      return {
        row,
        draft: undefined,
        duplicate: false,
        error: e instanceof Error ? e.message : "无效课程",
      };
    }
  });
}
export function applyCourseImport(
  state: ScheduleSnapshot,
  rows: ImportCandidate[],
  profileId: string,
  timestamp: string,
): ScheduleSnapshot {
  if (
    !rows.length ||
    rows.length > MAX_IMPORT_ROWS ||
    rows.some((row) => row.confirmed !== true)
  )
    throw new Error("请逐行确认预览，且每次导入 1–500 行。");
  const preview = previewImport(rows, state);
  if (preview.some((r) => r.error))
    throw new Error("导入包含无效课程，未写入任何数据。");
  const courses = preview
    .filter((r) => !r.duplicate)
    .map((r) => ({
      ...r.draft!,
      id: crypto.randomUUID(),
      profileId,
      semesterId: state.semester.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  return { ...state, courses: [...state.courses, ...courses] };
}

/** Conservative OCR line extraction. Never guesses a missing weekday or time.
 * Grid screenshots can be recognized one selected cell at a time. All fields
 * remain editable and every OCR row needs explicit human confirmation. */
export function rowsFromOcr(text: string): ImportCandidate[] {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > MAX_IMPORT_ROWS)
    throw new Error("识别内容超过 500 行，请缩小识别区域后重试。");
  return lines.map((line, i) => {
    const values = blankImportRow();
    const day = line.match(/(?:星期|周)([一二三四五六日天1-7])/);
    const times = [...line.matchAll(/\b([0-2]?\d)[:：]([0-5]\d)\b/g)];
    values.weekday = day?.[0] ?? "";
    values.startTime = times[0]
      ? `${times[0][1].padStart(2, "0")}:${times[0][2]}`
      : "";
    values.endTime = times[1]
      ? `${times[1][1].padStart(2, "0")}:${times[1][2]}`
      : "";
    values.name = line
      .replace(/(?:星期|周)[一二三四五六日天1-7]/g, "")
      .replace(/\b[0-2]?\d[:：][0-5]\d\b/g, "")
      .replace(/[|–—~-]/g, " ")
      .trim();
    return { id: `ocr-${i}`, values, source: "ocr", confirmed: false };
  });
}
