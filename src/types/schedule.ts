// Legacy seed-only shapes used by demo-data; not persisted domain entities.
// Live courses use types/course.ts; live tasks and states use types/task.ts.
export type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type PeriodId = "morning" | "afternoon" | "evening";
export type CourseCategory = "math" | "language" | "computer";

interface ScheduleItemBase {
  id: string;
  day: DayId;
  period: PeriodId;
  title: string;
  time: string;
}

export interface CourseOccurrenceView extends ScheduleItemBase {
  kind: "course";
  category: CourseCategory;
  location: string;
}

export interface TaskOccurrenceView extends ScheduleItemBase {
  kind: "task";
  detail: string;
  completed: boolean;
}

export type ScheduleItem = CourseOccurrenceView | TaskOccurrenceView;
