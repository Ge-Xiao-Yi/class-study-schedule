import type {
  Task,
  TaskDraft,
  TaskFields,
  TaskOccurrence,
  TaskStatus,
  TaskView,
} from "../types/task";
import type { ScheduleSnapshot } from "../types/course";
import { calendarDaysBetween, parseDate, weekDates } from "./dates";
import { timePeriods } from "./courses";
import { getTimePeriods } from "./time-slots";
import type { TimeSlot } from "../types/archive";

export const taskStatuses: Record<TaskStatus, string> = {
  todo: "未开始",
  in_progress: "进行中",
  done: "已完成",
};
export const taskRepeatLabels = {
  none: "不重复",
  daily: "每天重复",
  weekly: "每周重复",
};

export function normalizeTaskFields(
  fields: TaskFields,
  slots?: TimeSlot[],
): TaskFields {
  return {
    name: fields.name.trim(),
    startDate: fields.startDate,
    // A specified start time is authoritative. Crossing periods does not split tasks.
    period: fields.startTime
      ? (getTimePeriods(slots).find(
          (period) =>
            fields.startTime! >= period.start && fields.startTime! < period.end,
        )?.id ?? fields.period)
      : fields.period,
    startTime: fields.startTime,
    endTime: fields.endTime,
    estimatedMinutes: fields.estimatedMinutes,
    dueDate: fields.dueDate,
  };
}

export function validateTaskFields(fields: TaskFields): void {
  if (!fields.name.trim() || fields.name.length > 80)
    throw new Error("任务名称必填，且不超过 80 个字。");
  parseDate(fields.startDate);
  if (!timePeriods.some((period) => period.id === fields.period))
    throw new Error("请选择任务所属时间段。");
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const time of [fields.startTime, fields.endTime])
    if (time !== null && !timePattern.test(time))
      throw new Error("请输入有效的 24 小时制时间。");
  if (fields.startTime && fields.endTime && fields.endTime <= fields.startTime)
    throw new Error("结束时间必须晚于开始时间，不支持跨午夜任务。");
  if (
    fields.estimatedMinutes !== null &&
    (!Number.isSafeInteger(fields.estimatedMinutes) ||
      fields.estimatedMinutes <= 0)
  )
    throw new Error("预计耗时应为正整数分钟，或留空。");
  if (fields.dueDate !== null) parseDate(fields.dueDate);
}

export function validateTask(draft: TaskDraft): void {
  validateTaskFields(draft);
  if (!Object.hasOwn(taskRepeatLabels, draft.repeatType))
    throw new Error("请选择有效的任务重复规则。");
  if (draft.repeatUntil !== null) {
    parseDate(draft.repeatUntil);
    if (draft.repeatUntil < draft.startDate)
      throw new Error("重复截止日期不能早于任务开始日期。");
    if (draft.repeatType === "none")
      throw new Error("不重复任务无需重复截止日期。");
  }
}

export function validateTaskStatus(status: TaskStatus): void {
  if (!Object.hasOwn(taskStatuses, status))
    throw new Error("请选择有效的任务状态。");
}

export function taskOccursOn(task: Task, date: string): boolean {
  parseDate(date);
  if (date < task.startDate || (task.repeatUntil && date > task.repeatUntil))
    return false;
  if (task.repeatType === "none") return date === task.startDate;
  return (
    task.repeatType === "daily" ||
    calendarDaysBetween(task.startDate, date) % 7 === 0
  );
}

export function taskView(
  task: Task,
  originalDate: string,
  record?: TaskOccurrence,
  slots?: TimeSlot[],
): TaskView {
  const fields = normalizeTaskFields(
    {
      ...task,
      startDate: originalDate,
      ...record?.overrides,
    },
    slots,
  );
  return {
    key: `${task.id}:${originalDate}`,
    taskId: task.id,
    originalDate,
    date: fields.startDate,
    fields,
    status: record?.status ?? "todo",
    completedAt: record?.completedAt ?? null,
    repeatType: task.repeatType,
    deleted: record?.overrides?.deleted === true,
  };
}

export function resolveTasks(
  snapshot: ScheduleSnapshot,
  week: string,
): TaskView[] {
  const dates = weekDates(week);
  const inWeek = (date: string) => date >= dates[0] && date <= dates[6];
  return snapshot.tasks
    .filter((task) => task.profileId === snapshot.semester.profileId)
    .flatMap((task) => {
      const records = snapshot.taskOccurrences.filter(
        (record) =>
          record.taskId === task.id && record.profileId === task.profileId,
      );
      const byDate = new Map(
        records.map((record) => [record.occurrenceDate, record]),
      );
      const candidates = new Set(
        dates.filter((date) => taskOccursOn(task, date)),
      );
      // Includes moved-in occurrences and history retained after changing a rule.
      for (const record of records)
        if (
          inWeek(record.occurrenceDate) ||
          inWeek(record.overrides?.startDate ?? record.occurrenceDate)
        )
          candidates.add(record.occurrenceDate);
      return [...candidates]
        .map((date) =>
          taskView(task, date, byDate.get(date), snapshot.timeSlots),
        )
        .filter((view) => !view.deleted && inWeek(view.date));
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.fields.startTime ?? a.fields.endTime ?? "99:99").localeCompare(
          b.fields.startTime ?? b.fields.endTime ?? "99:99",
        ) ||
        a.key.localeCompare(b.key),
    );
}
