import type { CourseOccurrence } from "../types/course";
import { localDate, parseDate, weekday } from "./dates";

export function todayCourseStatus(occurrences: CourseOccurrence[], now: Date) {
  const date = localDate(now);
  const courses = [
    ...new Map(
      occurrences
        .filter((c) => !c.cancelled && c.date === date)
        .map((c) => [c.id, c]),
    ).values(),
  ];
  const instant = (time: string) => {
    const value = parseDate(date);
    value.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
    return value.getTime();
  };
  const current = courses.filter(
    (c) =>
      instant(c.course.startTime) <= now.getTime() &&
      now.getTime() < instant(c.course.endTime),
  );
  const lastEnd = courses.length
    ? Math.max(...courses.map((c) => instant(c.course.endTime)))
    : null;
  const firstStart = courses.length
    ? Math.min(...courses.map((c) => instant(c.course.startTime)))
    : null;
  const seconds =
    lastEnd === null
      ? null
      : Math.max(0, Math.ceil((lastEnd - now.getTime()) / 1000));
  const state: "empty" | "finished" | "ongoing" | "not_started" | "break" =
    !courses.length
      ? "empty"
      : now.getTime() >= lastEnd!
        ? "finished"
        : current.length
          ? "ongoing"
          : now.getTime() < firstStart!
            ? "not_started"
            : "break";
  return {
    date,
    weekday: weekday(date),
    courses,
    current,
    lastEnd,
    seconds,
    state,
  };
}
export function formatCountdown(seconds: number) {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
