import type { ScheduleSnapshot } from "../types/course";
import {
  syncGoalRelations,
  validateGoal,
  type GoalDraft,
} from "../domain/goals";

export type GoalCommand =
  | { type: "goal:save"; id?: string; draft: GoalDraft; taskIds: string[] }
  | { type: "goal:delete"; id: string };
export function applyGoalCommand(
  state: ScheduleSnapshot,
  command: GoalCommand,
  profileId: string,
  timestamp: string,
): ScheduleSnapshot {
  const goals = state.goals ?? [];
  const old = goals.find(
    (g) => g.id === command.id && g.profileId === profileId,
  );
  if (command.id && !old) throw new Error("目标不存在。");
  if (command.type === "goal:delete")
    return syncGoalRelations(state, {
      ...state,
      goals: goals.filter((g) => g.id !== command.id),
      tasks: state.tasks.map((t) =>
        t.goalId === command.id
          ? { ...t, goalId: null, updatedAt: timestamp }
          : t,
      ),
    });
  validateGoal(command.draft);
  if (
    command.taskIds.some(
      (id) =>
        !state.tasks.some((t) => t.id === id && t.profileId === profileId),
    )
  )
    throw new Error("关联任务不存在或不属于当前档案。");
  const goal = {
    ...command.draft,
    name: command.draft.name.trim(),
    id: old?.id ?? crypto.randomUUID(),
    profileId,
    createdAt: old?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const tasks = state.tasks.map((t) =>
    command.taskIds.includes(t.id)
      ? { ...t, goalId: goal.id, updatedAt: timestamp }
      : t.goalId === goal.id
        ? { ...t, goalId: null, updatedAt: timestamp }
        : t,
  );
  return syncGoalRelations(state, {
    ...state,
    goals: [...goals.filter((g) => g.id !== goal.id), goal],
    tasks,
    goalTaskRelations: state.goalTaskRelations?.filter(
      (r) => r.goalId !== goal.id || command.taskIds.includes(r.taskId),
    ),
  });
}
