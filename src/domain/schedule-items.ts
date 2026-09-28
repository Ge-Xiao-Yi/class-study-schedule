import type { CourseOccurrence } from "../types/course";
import type { TaskView } from "../types/task";
import type { PeriodId } from "../types/schedule";
import { occurrencePeriods } from "./courses";
import type { TimeSlot } from "../types/archive";

export type SlotItem =
  | {
      kind: "course";
      key: string;
      time: string | null;
      occurrence: CourseOccurrence;
    }
  | { kind: "task"; key: string; time: string | null; task: TaskView };

export function slotItems(
  courses: CourseOccurrence[],
  tasks: TaskView[],
  date: string,
  period: PeriodId,
  slots?: TimeSlot[],
): SlotItem[] {
  const items: SlotItem[] = [
    ...courses
      .filter(
        (item) =>
          !item.cancelled &&
          item.date === date &&
          occurrencePeriods(item.course, slots).includes(period),
      )
      .map((occurrence) => ({
        kind: "course" as const,
        key: `course:${occurrence.id}`,
        time: occurrence.course.startTime,
        occurrence,
      })),
    ...tasks
      .filter((task) => task.date === date && task.fields.period === period)
      .map((task) => ({
        kind: "task" as const,
        key: `task:${task.key}`,
        time: task.fields.startTime ?? task.fields.endTime,
        task,
      })),
  ];
  return items.sort(
    (a, b) =>
      (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
      a.kind.localeCompare(b.kind) ||
      a.key.localeCompare(b.key),
  );
}
