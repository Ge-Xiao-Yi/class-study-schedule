import { describe, it, expect } from "vitest";
import { goalProgress, validateGoal } from "../../src/domain/goals";
import type { Goal } from "../../src/types/archive";
import { taskSeed, task } from "./task-fixtures";
import { MemoryScheduleRepository } from "../../src/repositories/memory-schedule-repository";
import { ScheduleService } from "../../src/application/schedule-service";
const goal: Goal = {
  id: "goal-1",
  profileId: task.profileId,
  name: "阅读目标",
  description: "",
  startDate: "2026-09-21",
  progressMode: "automatic",
  manualProgress: 42,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
};
function state() {
  return {
    ...taskSeed(),
    goals: [goal],
    tasks: [{ ...task, goalId: goal.id }],
  };
}
describe("长期目标进度", () => {
  it("重复规则更改后的历史实例仍统计，单次修改目标被隔离，整组修改同步关联表", async () => {
    const s = state();
    s.tasks[0].repeatType = "weekly";
    s.taskOccurrences = [
      {
        id: "history",
        profileId: task.profileId,
        taskId: task.id,
        occurrenceDate: "2026-09-22",
        status: "done",
        completedAt: task.createdAt,
        overrides: null,
      },
    ];
    expect(goalProgress(goal, s, "2026-09-23")).toEqual({
      total: 2,
      done: 1,
      percent: 50,
    });
    const app = new ScheduleService(
      new MemoryScheduleRepository([s]),
      task.profileId,
    );
    const next = await app.execute({
      type: "goal:save",
      draft: { ...goal, name: "新目标" },
      taskIds: [],
    });
    const id = next.goals!.find((g) => g.name === "新目标")!.id;
    await app.execute({
      type: "task:edit",
      scope: "single",
      taskId: task.id,
      originalDate: task.startDate,
      draft: { ...s.tasks[0], goalId: id },
      status: "todo",
    });
    expect((await app.read()).tasks[0].goalId).toBe(goal.id);
    const updated = await app.execute({
      type: "task:edit",
      scope: "all",
      taskId: task.id,
      originalDate: task.startDate,
      draft: { ...s.tasks[0], goalId: id },
      status: "todo",
    });
    expect(updated.tasks[0].goalId).toBe(id);
    expect(updated.goalTaskRelations?.map((r) => r.goalId)).toEqual([id]);
  });
  it("未打卡重复实例进入分母，未访问日期不写入数据库", () => {
    const s = state();
    const before = structuredClone(s);
    expect(goalProgress(goal, s, "2026-09-23")).toEqual({
      total: 3,
      done: 0,
      percent: 0,
    });
    expect(s).toEqual(before);
  });
  it("开始日及今日含边界，每次完成独立，未来状态不计入", () => {
    const s = state();
    s.taskOccurrences = ["2026-09-21", "2026-09-24"].map((date) => ({
      id: date,
      profileId: task.profileId,
      taskId: task.id,
      occurrenceDate: date,
      status: "done",
      completedAt: task.createdAt,
      overrides: null,
    }));
    expect(goalProgress(goal, s, "2026-09-23")).toEqual({
      total: 3,
      done: 1,
      percent: 33,
    });
    expect(
      goalProgress({ ...goal, startDate: "2026-09-22" }, s, "2026-09-23"),
    ).toEqual({ total: 2, done: 0, percent: 0 });
  });
  it("移动实例按实际日期，删除排除，保留历史实例不重复计数", () => {
    const s = state();
    s.taskOccurrences = [
      {
        id: "m",
        profileId: task.profileId,
        taskId: task.id,
        occurrenceDate: "2026-09-21",
        status: "done",
        completedAt: task.createdAt,
        overrides: { startDate: "2026-09-25" },
      },
      {
        id: "d",
        profileId: task.profileId,
        taskId: task.id,
        occurrenceDate: "2026-09-22",
        status: "todo",
        completedAt: null,
        overrides: { deleted: true },
      },
    ];
    expect(goalProgress(goal, s, "2026-09-23")).toEqual({
      total: 1,
      done: 0,
      percent: 0,
    });
    expect(goalProgress(goal, s, "2026-09-25")).toEqual({
      total: 4,
      done: 1,
      percent: 25,
    });
  });
  it("每周、跨年、闰年、重复截止和空范围", () => {
    const s = state();
    s.tasks[0] = {
      ...s.tasks[0],
      startDate: "2024-02-28",
      repeatType: "daily",
      repeatUntil: "2024-03-01",
    };
    expect(
      goalProgress({ ...goal, startDate: "2024-02-29" }, s, "2024-03-04").total,
    ).toBe(2);
    s.tasks[0] = {
      ...s.tasks[0],
      startDate: "2025-12-29",
      repeatType: "weekly",
      repeatUntil: null,
    };
    expect(
      goalProgress({ ...goal, startDate: "2025-12-30" }, s, "2026-01-12").total,
    ).toBe(2);
    expect(
      goalProgress({ ...goal, startDate: "2027-01-01" }, s, "2026-01-12").total,
    ).toBe(0);
  });
  it("进行中不计完成；关系表和 goalId 不重复，其他档案不计入", () => {
    const s = {
      ...state(),
      goalTaskRelations: [
        {
          id: "r",
          profileId: task.profileId,
          goalId: goal.id,
          taskId: task.id,
        },
      ],
    };
    s.tasks.push({ ...s.tasks[0], id: "foreign", profileId: "foreign" });
    s.taskOccurrences = [
      {
        id: "p",
        profileId: task.profileId,
        taskId: task.id,
        occurrenceDate: "2026-09-21",
        status: "in_progress",
        completedAt: null,
        overrides: null,
      },
    ];
    expect(goalProgress(goal, s, "2026-09-21")).toEqual({
      total: 1,
      done: 0,
      percent: 0,
    });
    expect(
      goalProgress({ ...goal, progressMode: "manual" }, s, "2026-09-21")
        .percent,
    ).toBe(42);
  });
  it.each([-1, 101, NaN, Infinity])("拒绝非法进度 %s", (value) =>
    expect(() => validateGoal({ ...goal, manualProgress: value })).toThrow(),
  );
  it("创建目标、关联转移、删除保留任务与状态，拒绝跨档案关联", async () => {
    const repo = new MemoryScheduleRepository([taskSeed()]);
    const app = new ScheduleService(repo, task.profileId);
    const a = await app.execute({
      type: "goal:save",
      draft: goal,
      taskIds: [task.id],
    });
    expect(a.tasks[0].goalId).toBe(a.goals![0].id);
    expect(a.goalTaskRelations).toHaveLength(1);
    await expect(
      app.execute({ type: "goal:save", draft: goal, taskIds: ["foreign"] }),
    ).rejects.toThrow();
    expect(await app.read()).toEqual(a);
    const b = await app.execute({
      type: "goal:save",
      draft: { ...goal, name: "第二目标" },
      taskIds: [task.id],
    });
    expect(b.goalTaskRelations).toHaveLength(1);
    const c = await app.execute({
      type: "goal:delete",
      id: b.tasks[0].goalId!,
    });
    expect(c.tasks[0].goalId).toBeNull();
    expect(c.taskOccurrences).toEqual(a.taskOccurrences);
    expect(c.goalTaskRelations).toEqual([]);
  });
});
