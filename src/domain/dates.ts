import type { Semester, Weekday } from "../types/course";

const pad = (value: number) => String(value).padStart(2, "0");

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请输入有效日期。");
  const [year, month, day] = value.split("-").map(Number);
  // Local noon avoids DST midnight transitions; never parse a date as UTC.
  const date = new Date(year, month - 1, day, 12);
  if (year < 1000 || localDate(date) !== value)
    throw new Error("请输入有效日期。");
  return date;
}

export function addDays(value: string, count: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + count);
  return localDate(date);
}

export function weekday(value: string): Weekday {
  return (parseDate(value).getDay() || 7) as Weekday;
}

export function startOfWeek(value: string): string {
  return addDays(value, 1 - weekday(value));
}

export function weekDates(value: string): string[] {
  const start = startOfWeek(value);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function dateForWeekday(value: string, day: Weekday): string {
  return addDays(startOfWeek(value), day - 1);
}

export function calendarDaysBetween(start: string, end: string): number {
  // UTC is used only as a civil-date ordinal, never to derive a local date string.
  const ordinal = (value: string) => {
    const date = parseDate(value);
    return (
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
    );
  };
  return ordinal(end) - ordinal(start);
}

export function teachingWeek(date: string, semester: Semester): number | null {
  parseDate(date);
  if (date < semester.startDate || date > semester.endDate) return null;
  const week =
    Math.floor(calendarDaysBetween(startOfWeek(semester.startDate), date) / 7) +
    1;
  return week <= semester.teachingWeeks ? week : null;
}

export function weekLabel(date: string): string {
  const start = startOfWeek(date);
  return `${start.replaceAll("-", ".")} — ${addDays(start, 6).replaceAll("-", ".")}`;
}
