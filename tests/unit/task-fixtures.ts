import type { Task, TaskDraft } from "../../src/types/task";
import { seed, semester } from "./fixtures";

export const taskDraft: TaskDraft = {
  name: "每日阅读",
  startDate: "2026-09-21",
  period: "morning",
  startTime: null,
  endTime: null,
  estimatedMinutes: 30,
  dueDate: null,
  repeatType: "daily",
  repeatUntil: null,
  goalId: null,
};
export const task: Task = {
  ...taskDraft,
  id: "task-1",
  profileId: semester.profileId,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};
export function taskSeed() {
  return { ...seed(), tasks: [structuredClone(task)] };
}
