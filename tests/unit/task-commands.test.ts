import { beforeEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../src/application/schedule-service";
import { MemoryScheduleRepository } from "../../src/repositories/memory-schedule-repository";
import { resolveTasks } from "../../src/domain/tasks";
import { resolveWeek } from "../../src/domain/courses";
import { task, taskDraft, taskSeed } from "./task-fixtures";
import { semester } from "./fixtures";

describe("任务命令与单次状态", () => {
  let service: ScheduleService;
  let repository: MemoryScheduleRepository;
  beforeEach(() => {
    repository = new MemoryScheduleRepository([taskSeed()]);
    service = new ScheduleService(repository, semester.profileId);
  });
  const status = (date: string, value: "todo" | "done" | "in_progress") =>
    service.execute({
      type: "task:status",
      taskId: task.id,
      originalDate: date,
      status: value,
    });

  it("完成周一不影响周二或下周，返回后仍完成", async () => {
    await status("2026-09-21", "done");
    const snapshot = await service.read();
    expect(resolveTasks(snapshot, "2026-09-21")[0].status).toBe("done");
    expect(resolveTasks(snapshot, "2026-09-21")[1].status).toBe("todo");
    expect(
      resolveTasks(snapshot, "2026-09-28").every(
        (item) => item.status === "todo",
      ),
    ).toBe(true);
    expect(resolveTasks(await service.read(), "2026-09-21")[0].status).toBe(
      "done",
    );
    expect(snapshot.tasks).toEqual([task]);
    expect(snapshot.taskOccurrences).toHaveLength(1);
  });
  it("进行中、勾选与取消勾选只更新同一 UUID；取消清空完成时间", async () => {
    await status("2026-09-21", "in_progress");
    const first = (await service.read()).taskOccurrences[0];
    expect(first.completedAt).toBeNull();
    await status("2026-09-21", "done");
    const done = (await service.read()).taskOccurrences[0];
    expect(done.id).toBe(first.id);
    expect(done.completedAt).not.toBeNull();
    await status("2026-09-21", "done");
    expect((await service.read()).taskOccurrences[0].completedAt).toBe(
      done.completedAt,
    );
    await status("2026-09-21", "todo");
    expect((await service.read()).taskOccurrences[0]).toMatchObject({
      id: first.id,
      status: "todo",
      completedAt: null,
    });
    expect((await service.read()).taskOccurrences).toHaveLength(1);
  });
  it("不重复任务同样由实例保存状态，创建不批量生成重复记录", async () => {
    const created = await service.execute({
      type: "task:create",
      draft: { ...taskDraft, repeatType: "none" },
      status: "in_progress",
    });
    const added = created.tasks[1];
    expect(added.id).toMatch(/^[\da-f]{8}-[\da-f-]{27}$/i);
    expect(added).not.toHaveProperty("status");
    expect(created.taskOccurrences[0]).toMatchObject({
      taskId: added.id,
      status: "in_progress",
    });
    const repeated = await service.execute({
      type: "task:create",
      draft: taskDraft,
      status: "todo",
    });
    expect(repeated.taskOccurrences).toHaveLength(2);
  });
  it("单次编辑跨周移入只显示一份，其他发生不变", async () => {
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: "2026-09-21",
      scope: "single",
      draft: { ...taskDraft, name: "临时阅读", startDate: "2026-10-01" },
      status: "in_progress",
    });
    const state = await service.read();
    expect(resolveTasks(state, "2026-09-21")).toHaveLength(6);
    const target = resolveTasks(state, "2026-09-28").filter(
      (item) => item.date === "2026-10-01",
    );
    expect(target).toHaveLength(2);
    expect(
      target.find((item) => item.originalDate === "2026-09-21"),
    ).toMatchObject({ status: "in_progress", fields: { name: "临时阅读" } });
    expect(
      target.find((item) => item.originalDate === "2026-10-01")?.status,
    ).toBe("todo");
    expect(state.tasks).toEqual([task]);
  });
  it("单次删除使用墓碑，切周和编辑模板不会复活", async () => {
    await service.execute({
      type: "task:delete",
      taskId: task.id,
      originalDate: "2026-09-21",
      scope: "single",
    });
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: "2026-09-22",
      scope: "all",
      draft: { ...taskDraft, name: "全部更新" },
      status: "todo",
    });
    const state = await service.read();
    expect(resolveTasks(state, "2026-09-21")).toHaveLength(6);
    expect(resolveTasks(state, "2026-09-28")).toHaveLength(7);
    expect(state.tasks).toHaveLength(1);
    expect(state.taskOccurrences[0].overrides?.deleted).toBe(true);
    await expect(status("2026-09-21", "done")).rejects.toThrow("已删除");
  });
  it("整个任务编辑保留其他日期状态和单次调整", async () => {
    await status("2026-09-21", "done");
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: "2026-09-23",
      scope: "single",
      draft: { ...taskDraft, name: "特殊安排", startDate: "2026-09-23" },
      status: "todo",
    });
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: "2026-09-22",
      scope: "all",
      draft: { ...taskDraft, name: "新版阅读" },
      status: "in_progress",
    });
    const views = resolveTasks(await service.read(), "2026-09-21");
    expect(views[0].status).toBe("done");
    expect(views[1].status).toBe("in_progress");
    expect(views[2].fields.name).toBe("特殊安排");
    expect(views[3]).toMatchObject({
      status: "todo",
      fields: { name: "新版阅读" },
    });
  });
  it("改变重复日期后，已记录的历史状态仍在原日期", async () => {
    await status("2026-09-21", "done");
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: "2026-09-21",
      scope: "all",
      draft: { ...taskDraft, startDate: "2026-10-01", repeatType: "weekly" },
      status: "done",
    });
    const state = await service.read();
    expect(resolveTasks(state, "2026-09-21")).toHaveLength(1);
    expect(resolveTasks(state, "2026-09-21")[0].status).toBe("done");
    expect(resolveTasks(state, "2026-09-28")[0]).toMatchObject({
      date: "2026-10-01",
      status: "todo",
    });
  });
  it("单次任务修改日期移动原 UUID，不产生两个任务", async () => {
    const created = await service.execute({
      type: "task:create",
      draft: { ...taskDraft, repeatType: "none" },
      status: "todo",
    });
    const added = created.tasks[1];
    const occurrence = created.taskOccurrences[0];
    const state = await service.execute({
      type: "task:edit",
      taskId: added.id,
      originalDate: added.startDate,
      scope: "all",
      draft: { ...added, startDate: "2026-09-22" },
      status: "done",
    });
    const result = resolveTasks(state, "2026-09-21").filter(
      (view) => view.taskId === added.id,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "2026-09-22", status: "done" });
    expect(state.taskOccurrences[0].id).toBe(occurrence.id);
  });
  it("删除全部级联清理记录，不影响课程", async () => {
    const courseBefore = resolveWeek(await service.read(), "2026-09-21");
    await status("2026-09-21", "done");
    await status("2026-09-22", "in_progress");
    const state = await service.execute({
      type: "task:delete",
      taskId: task.id,
      originalDate: "2026-09-21",
      scope: "all",
    });
    expect(state.tasks).toHaveLength(0);
    expect(state.taskOccurrences).toHaveLength(0);
    expect(resolveWeek(state, "2026-09-21")).toEqual(courseBefore);
  });
  it.each(["single", "all"] as const)(
    "复制 %s 为独立 UUID，状态重置且不复制历史",
    async (scope) => {
      await status("2026-09-21", "done");
      const state = await service.execute({
        type: "task:copy",
        taskId: task.id,
        originalDate: "2026-09-21",
        scope,
        targetDate: "2026-09-28",
      });
      const copy = state.tasks[1];
      expect(copy.id).not.toBe(task.id);
      expect(copy.repeatType).toBe(scope === "single" ? "none" : "daily");
      expect(copy.startDate).toBe("2026-09-28");
      expect(
        state.taskOccurrences.filter((item) => item.taskId === copy.id),
      ).toHaveLength(1);
      expect(
        state.taskOccurrences.find((item) => item.taskId === copy.id),
      ).toMatchObject({ status: "todo", completedAt: null, overrides: null });
      expect(
        state.taskOccurrences.find((item) => item.taskId === task.id)?.status,
      ).toBe("done");
    },
  );
  it("复制整个规则时平移截止日期，单次复制只取有效字段", async () => {
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: task.startDate,
      scope: "all",
      draft: { ...taskDraft, dueDate: "2026-09-25", repeatUntil: "2026-09-30" },
      status: "todo",
    });
    let state = await service.execute({
      type: "task:copy",
      taskId: task.id,
      originalDate: task.startDate,
      scope: "all",
      targetDate: "2026-09-28",
    });
    expect(state.tasks[1]).toMatchObject({
      dueDate: "2026-10-02",
      repeatUntil: "2026-10-07",
    });
    await service.execute({
      type: "task:edit",
      taskId: task.id,
      originalDate: task.startDate,
      scope: "single",
      draft: { ...taskDraft, name: "单次调整", dueDate: "2026-09-23" },
      status: "todo",
    });
    state = await service.execute({
      type: "task:copy",
      taskId: task.id,
      originalDate: task.startDate,
      scope: "single",
      targetDate: "2026-09-22",
    });
    expect(state.tasks[2]).toMatchObject({
      name: "单次调整",
      dueDate: "2026-09-24",
      repeatType: "none",
      repeatUntil: null,
    });
  });
  it("无效写入回滚，未知日期不能打卡", async () => {
    const before = await service.read();
    await expect(
      service.execute({
        type: "task:create",
        draft: { ...taskDraft, estimatedMinutes: -1 },
        status: "todo",
      }),
    ).rejects.toThrow();
    await expect(status("2026-09-20", "done")).rejects.toThrow("没有任务");
    expect(await service.read()).toEqual(before);
  });
  it("仓库禁止其他档案、孤立实例和同日期重复实例", async () => {
    await status("2026-09-21", "done");
    await expect(
      repository.transact(semester.profileId, (state) => ({
        ...state,
        tasks: [{ ...task, profileId: "other" }],
      })),
    ).rejects.toThrow();
    await expect(
      repository.transact(semester.profileId, (state) => ({
        ...state,
        tasks: [],
      })),
    ).rejects.toThrow();
    await expect(
      repository.transact(semester.profileId, (state) => ({
        ...state,
        taskOccurrences: [
          ...state.taskOccurrences,
          { ...state.taskOccurrences[0], id: "duplicate" },
        ],
      })),
    ).rejects.toThrow("重复");
    expect((await service.read()).taskOccurrences).toHaveLength(1);
  });
});
