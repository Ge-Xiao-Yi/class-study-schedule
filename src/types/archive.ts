import type { Course, CourseException, Semester } from "./course";
import type { Task, TaskOccurrence } from "./task";
import type { PeriodId } from "./schedule";

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface TimeSlot {
  id: string;
  profileId: string;
  period: PeriodId;
  startTime: string;
  endTime: string;
}
export interface Goal {
  id: string;
  profileId: string;
  name: string;
  description: string;
  startDate: string;
  progressMode: "manual" | "automatic";
  manualProgress: number;
  createdAt: string;
  updatedAt: string;
}
export interface GoalTaskRelation {
  id: string;
  profileId: string;
  goalId: string;
  taskId: string;
}
export interface AppSettings {
  id: string;
  profileId: string;
  activeSemesterId: string;
}
export interface ArchiveData {
  profiles: Profile[];
  semesters: Semester[];
  timeSlots: TimeSlot[];
  courses: Course[];
  courseExceptions: CourseException[];
  tasks: Task[];
  taskOccurrences: TaskOccurrence[];
  goals: Goal[];
  goalTaskRelations: GoalTaskRelation[];
  appSettings: AppSettings[];
}
export type OwnedTable = Exclude<keyof ArchiveData, "profiles">;
export type ProfileData = { [K in OwnedTable]: ArchiveData[K] };
export interface Backup {
  format: "study-week-backup";
  formatVersion: 1;
  databaseVersion: 1;
  exportedAt: string;
  activeProfileId: string;
  data: ArchiveData;
}
