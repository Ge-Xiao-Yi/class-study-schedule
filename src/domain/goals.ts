import type { Goal } from "../types/archive";
import type { ScheduleSnapshot } from "../types/course";
import { calendarDaysBetween, parseDate } from "./dates";
import { taskOccursOn } from "./tasks";

export type GoalDraft = Pick<
  Goal,
  "name" | "description" | "startDate" | "progressMode" | "manualProgress"
>;
export function validateGoal(draft: GoalDraft) {
  if (!draft.name.trim() || draft.name.length > 80)
    throw new Error("目标名称必填，最多 80 字。");
  if (draft.description.length > 10000)
    throw new Error("目标描述最多 10000 字。");
  parseDate(draft.startDate);
  if (
    !["manual", "automatic"].includes(draft.progressMode) ||
    !Number.isFinite(draft.manualProgress) ||
    draft.manualProgress < 0 ||
    draft.manualProgress > 100
  )
    throw new Error("请选择进度模式，手动进度须为 0–100。");
}

/** Count logical occurrences, including untouched repeats, without materializing days.
 * Explicit history replaces the original candidate; moved/deleted instances are
 * evaluated by effective date, exactly as the timetable resolver does. */
export function goalProgress(
  goal: Goal,
  state: ScheduleSnapshot,
  today: string,
) {
  parseDate(today);
  let total = 0,
    done = 0;
  const within = (date: string) => date >= goal.startDate && date <= today;
  const ids = new Set(
    (state.goalTaskRelations ?? [])
      .filter((r) => r.profileId === goal.profileId && r.goalId === goal.id)
      .map((r) => r.taskId),
  );
  for (const task of state.tasks.filter(
    (t) =>
      t.profileId === goal.profileId && (t.goalId === goal.id || ids.has(t.id)),
  )) {
    const lo =
      goal.startDate > task.startDate ? goal.startDate : task.startDate;
    const hi =
      task.repeatUntil && task.repeatUntil < today ? task.repeatUntil : today;
    if (lo <= hi) {
      if (task.repeatType === "none") total += within(task.startDate) ? 1 : 0;
      else {
        const step = task.repeatType === "daily" ? 1 : 7;
        total += Math.max(
          0,
          Math.floor(calendarDaysBetween(task.startDate, hi) / step) -
            Math.ceil(calendarDaysBetween(task.startDate, lo) / step) +
            1,
        );
      }
    }
    for (const record of state.taskOccurrences.filter(
      (r) => r.profileId === goal.profileId && r.taskId === task.id,
    )) {
      if (
        within(record.occurrenceDate) &&
        taskOccursOn(task, record.occurrenceDate)
      )
        total--;
      if (
        !record.overrides?.deleted &&
        within(record.overrides?.startDate ?? record.occurrenceDate)
      ) {
        total++;
        if (record.status === "done") done++;
      }
    }
  }
  return {
    total,
    done,
    percent:
      goal.progressMode === "manual"
        ? goal.manualProgress
        : total
          ? Math.round((done / total) * 100)
          : 0,
  };
}

export function syncGoalRelations(
  before: ScheduleSnapshot,
  next: ScheduleSnapshot,
): ScheduleSnapshot {
  const goals = next.goals ?? [];
  const changed = new Set(
    next.tasks
      .filter(
        (t) => before.tasks.find((b) => b.id === t.id)?.goalId !== t.goalId,
      )
      .map((t) => t.id),
  );
  const relations = (next.goalTaskRelations ?? []).filter(
    (r) =>
      !changed.has(r.taskId) &&
      next.tasks.some((t) => t.id === r.taskId) &&
      goals.some((g) => g.id === r.goalId),
  );
  for (const task of next.tasks) {
    if (!task.goalId) continue;
    if (
      !goals.some((g) => g.id === task.goalId && g.profileId === task.profileId)
    )
      throw new Error("关联目标不属于当前档案或已删除。");
    if (
      !relations.some((r) => r.taskId === task.id && r.goalId === task.goalId)
    )
      relations.push({
        id: crypto.randomUUID(),
        profileId: task.profileId,
        taskId: task.id,
        goalId: task.goalId,
      });
  }
  return { ...next, goalTaskRelations: relations };
}
