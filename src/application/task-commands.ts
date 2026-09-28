import type { ScheduleSnapshot } from "../types/course";
import type {
  Task,
  TaskDraft,
  TaskOccurrence,
  TaskScope,
  TaskStatus,
} from "../types/task";
import { addDays, calendarDaysBetween } from "../domain/dates";
import {
  normalizeTaskFields,
  taskOccursOn,
  taskView,
  validateTask,
  validateTaskFields,
  validateTaskStatus,
} from "../domain/tasks";

export type TaskCommand =
  | { type: "task:create"; draft: TaskDraft; status: TaskStatus }
  | {
      type: "task:edit";
      taskId: string;
      originalDate: string;
      scope: TaskScope;
      draft: TaskDraft;
      status: TaskStatus;
    }
  | {
      type: "task:status";
      taskId: string;
      originalDate: string;
      status: TaskStatus;
    }
  | {
      type: "task:delete";
      taskId: string;
      originalDate: string;
      scope: TaskScope;
    }
  | {
      type: "task:copy";
      taskId: string;
      originalDate: string;
      scope: TaskScope;
      targetDate: string;
    };

export function isTaskCommand(command: {
  type: string;
}): command is TaskCommand {
  return command.type.startsWith("task:");
}

function writeOccurrence(
  state: ScheduleSnapshot,
  task: Task,
  date: string,
  status: TaskStatus,
  timestamp: string,
  overrides?: TaskOccurrence["overrides"],
): ScheduleSnapshot {
  validateTaskStatus(status);
  const existing = state.taskOccurrences.find(
    (item) => item.taskId === task.id && item.occurrenceDate === date,
  );
  const record: TaskOccurrence = {
    id: existing?.id ?? crypto.randomUUID(),
    profileId: task.profileId,
    taskId: task.id,
    occurrenceDate: date,
    status,
    completedAt:
      status === "done" ? (existing?.completedAt ?? timestamp) : null,
    overrides:
      overrides === undefined ? (existing?.overrides ?? null) : overrides,
  };
  return {
    ...state,
    taskOccurrences: [
      ...state.taskOccurrences.filter(
        (item) => !(item.taskId === task.id && item.occurrenceDate === date),
      ),
      record,
    ],
  };
}

function createTask(
  state: ScheduleSnapshot,
  draft: TaskDraft,
  status: TaskStatus,
  profileId: string,
  timestamp: string,
): ScheduleSnapshot {
  validateTask(draft);
  const task: Task = {
    ...normalizeTaskFields(draft, state.timeSlots),
    repeatType: draft.repeatType,
    repeatUntil: draft.repeatUntil,
    goalId: draft.goalId,
    id: crypto.randomUUID(),
    profileId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return writeOccurrence(
    { ...state, tasks: [...state.tasks, task] },
    task,
    task.startDate,
    status,
    timestamp,
  );
}

export function applyTaskCommand(
  state: ScheduleSnapshot,
  command: TaskCommand,
  profileId: string,
  timestamp: string,
): ScheduleSnapshot {
  if (command.type === "task:create")
    return createTask(
      state,
      command.draft,
      command.status,
      profileId,
      timestamp,
    );
  const task = state.tasks.find(
    (item) => item.id === command.taskId && item.profileId === profileId,
  );
  if (!task) throw new Error("任务不存在，请重新打开任务。");
  const record = state.taskOccurrences.find(
    (item) =>
      item.taskId === task.id &&
      item.profileId === profileId &&
      item.occurrenceDate === command.originalDate,
  );
  if (!record && !taskOccursOn(task, command.originalDate))
    throw new Error("该日期没有任务安排。");
  const view = taskView(task, command.originalDate, record, state.timeSlots);
  if (command.type === "task:delete") {
    if (command.scope === "all")
      return {
        ...state,
        tasks: state.tasks.filter((item) => item.id !== task.id),
        taskOccurrences: state.taskOccurrences.filter(
          (item) => item.taskId !== task.id,
        ),
      };
    return writeOccurrence(
      state,
      task,
      command.originalDate,
      view.status,
      timestamp,
      { ...record?.overrides, deleted: true },
    );
  }
  if (command.type === "task:copy") {
    if (command.scope === "single" && view.deleted)
      throw new Error("该次任务已删除，不能单次复制。");
    const source = command.scope === "single" ? view.fields : task;
    const shift = calendarDaysBetween(source.startDate, command.targetDate);
    return createTask(
      state,
      {
        ...normalizeTaskFields(source, state.timeSlots),
        startDate: command.targetDate,
        dueDate: source.dueDate ? addDays(source.dueDate, shift) : null,
        repeatType: command.scope === "single" ? "none" : task.repeatType,
        repeatUntil:
          command.scope === "all" && task.repeatUntil
            ? addDays(task.repeatUntil, shift)
            : null,
        goalId: null,
      },
      "todo",
      profileId,
      timestamp,
    );
  }
  if (command.type === "task:status") {
    if (view.deleted) throw new Error("该次任务已删除。");
    return writeOccurrence(
      state,
      task,
      command.originalDate,
      command.status,
      timestamp,
    );
  }
  if (command.scope === "single") {
    if (view.deleted) throw new Error("该次任务已删除。");
    validateTaskFields(command.draft);
    return writeOccurrence(
      state,
      task,
      command.originalDate,
      command.status,
      timestamp,
      normalizeTaskFields(command.draft, state.timeSlots),
    );
  }
  validateTask(command.draft);
  // Explicit whole-series edits keep all recorded per-date states and overrides.
  // A status in the editor always belongs to the selected occurrence only.
  const updated: Task = {
    ...task,
    ...normalizeTaskFields(command.draft, state.timeSlots),
    repeatType: command.draft.repeatType,
    repeatUntil: command.draft.repeatUntil,
    goalId: command.draft.goalId,
    updatedAt: timestamp,
  };
  let next = {
    ...state,
    tasks: state.tasks.map((item) => (item.id === task.id ? updated : item)),
  };
  if (task.repeatType === "none" && updated.repeatType === "none" && record) {
    // Move a one-off's existing UUID record with its template, never create a
    // second occurrence at the new date. Explicit history from older rules stays.
    if (
      state.taskOccurrences.some(
        (item) =>
          item.taskId === task.id &&
          item.id !== record.id &&
          item.occurrenceDate === updated.startDate,
      )
    )
      throw new Error("目标日期已有该任务的实例，请仅修改这一次。");
    validateTaskStatus(command.status);
    const moved: TaskOccurrence = {
      ...record,
      occurrenceDate: updated.startDate,
      status: command.status,
      completedAt:
        command.status === "done" ? (record.completedAt ?? timestamp) : null,
      overrides: record.overrides?.deleted ? { deleted: true } : null,
    };
    return {
      ...next,
      taskOccurrences: next.taskOccurrences.map((item) =>
        item.id === record.id ? moved : item,
      ),
    };
  }
  // Don't create phantom history just by editing a template from its manager.
  if (!view.deleted && (record || command.status !== "todo"))
    next = writeOccurrence(
      next,
      updated,
      command.originalDate,
      command.status,
      timestamp,
    );
  return next;
}
