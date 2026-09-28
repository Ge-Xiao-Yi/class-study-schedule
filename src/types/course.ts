import type { Task, TaskOccurrence } from "./task";
import type { TimeSlot, Goal, GoalTaskRelation } from "./archive";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CourseColor = "blue" | "green" | "purple" | "orange" | "pink";

export interface Semester {
  id: string;
  profileId: string;
  startDate: string;
  endDate: string;
  teachingWeeks: number;
}

export interface CourseFields {
  name: string;
  location: string;
  teacher: string;
  weekday: Weekday;
  sectionText: string;
  startTime: string;
  endTime: string;
  color: CourseColor;
}

export interface CourseDraft extends CourseFields {
  repeatType: "weekly" | "once";
  startWeek: number;
  endWeek: number;
  occurrenceDate: string | null;
}

export interface Course extends CourseDraft {
  id: string;
  profileId: string;
  semesterId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseException {
  id: string;
  profileId: string;
  courseId: string;
  originalDate: string;
  action: "modify" | "cancel";
  overrides: Partial<CourseFields>;
  createdAt: string;
}

export interface CourseOccurrence {
  // One identity even when the UI renders this occurrence in two period cells.
  id: string;
  courseId: string;
  originalDate: string;
  date: string;
  course: Course;
  exception?: CourseException;
  cancelled: boolean;
}

export interface ScheduleSnapshot {
  goals?: Goal[];
  goalTaskRelations?: GoalTaskRelation[];
  timeSlots?: TimeSlot[];
  semester: Semester;
  courses: Course[];
  exceptions: CourseException[];
  tasks: Task[];
  taskOccurrences: TaskOccurrence[];
}
