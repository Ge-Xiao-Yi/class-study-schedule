import type { PeriodId } from "./schedule";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskScope = "single" | "all";

export interface TaskFields {
  name: string;
  startDate: string;
  period: PeriodId;
  startTime: string | null;
  endTime: string | null;
  estimatedMinutes: number | null;
  dueDate: string | null;
}

export interface TaskDraft extends TaskFields {
  repeatType: "none" | "daily" | "weekly";
  repeatUntil: string | null;
  goalId: string | null;
}

export interface Task extends TaskDraft {
  id: string;
  profileId: string;
  createdAt: string;
  updatedAt: string;
}

// occurrenceDate stays the original scheduled date. An override startDate moves
// only this occurrence; deleted is a tombstone within DATA_MODEL's overrides.
export interface TaskOverrides extends Partial<TaskFields> {
  deleted?: boolean;
}

export interface TaskOccurrence {
  id: string;
  profileId: string;
  taskId: string;
  occurrenceDate: string;
  status: TaskStatus;
  completedAt: string | null;
  overrides: TaskOverrides | null;
}

// Computed view keys are not persisted record IDs. UUID records are created only
// on creation or explicit changes; week navigation never creates stored rows.
export interface TaskView {
  key: string;
  taskId: string;
  originalDate: string;
  date: string;
  fields: TaskFields;
  status: TaskStatus;
  completedAt: string | null;
  repeatType: Task["repeatType"];
  deleted: boolean;
}
