import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeTaskFields,
  resolveTasks,
  taskOccursOn,
  validateTask,
} from "../../src/domain/tasks";
import { slotItems } from "../../src/domain/schedule-items";
import { resolveWeek } from "../../src/domain/courses";
import { task, taskDraft, taskSeed } from "./task-fixtures";

const timezone = process.env.TZ;
afterEach(() => {
  if (timezone === undefined) delete process.env.TZ;
  else process.env.TZ = timezone;
});

describe("任务重复与日期边界", () => {
  it.each([
    ["none", 1],
    ["daily", 7],
    ["weekly", 1],
  ] as const)("%s 在首周有 %i 次", (repeatType, count) => {
    const state = taskSeed();
    state.tasks[0].repeatType = repeatType;
    expect(resolveTasks(state, "2026-09-21")).toHaveLength(count);
    expect(resolveTasks(state, "2026-09-28")).toHaveLength(
      repeatType === "none" ? 0 : count,
    );
  });
  it("每日重复包含开始日和截止日，截止日期不等于重复截止日期", () => {
    const state = taskSeed();
    state.tasks[0].repeatUntil = "2026-09-23";
    state.tasks[0].dueDate = "2026-09-22";
    expect(resolveTasks(state, "2026-09-21").map((view) => view.date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
    expect(taskOccursOn(state.tasks[0], "2026-09-20")).toBe(false);
    expect(taskOccursOn(state.tasks[0], "2026-09-24")).toBe(false);
  });
  it("每周重复以开始日星期为锚点，跨年不偏移", () => {
    const weekly = {
      ...task,
      startDate: "2026-12-27",
      repeatType: "weekly" as const,
      repeatUntil: "2027-01-03",
    };
    expect(taskOccursOn(weekly, "2026-12-27")).toBe(true);
    expect(taskOccursOn(weekly, "2026-12-28")).toBe(false);
    expect(taskOccursOn(weekly, "2027-01-03")).toBe(true);
    expect(taskOccursOn(weekly, "2027-01-10")).toBe(false);
  });
  it("闰年、跨月和非闰年均按本地日历重复", () => {
    const state = taskSeed();
    state.tasks[0] = {
      ...task,
      startDate: "2024-02-28",
      repeatUntil: "2024-03-01",
    };
    expect(resolveTasks(state, "2024-02-29").map((view) => view.date)).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
    state.tasks[0] = {
      ...task,
      startDate: "2025-02-28",
      repeatUntil: "2025-03-01",
    };
    expect(resolveTasks(state, "2025-03-01").map((view) => view.date)).toEqual([
      "2025-02-28",
      "2025-03-01",
    ]);
  });
  it.each(["Asia/Shanghai", "America/New_York"])(
    "%s：跨夏令时的每周任务仍相隔七个自然日",
    (zone) => {
      process.env.TZ = zone;
      const weekly = {
        ...task,
        startDate: "2026-03-01",
        repeatType: "weekly" as const,
      };
      expect(taskOccursOn(weekly, "2026-03-08")).toBe(true);
      expect(taskOccursOn(weekly, "2026-03-15")).toBe(true);
      expect(
        taskOccursOn({ ...weekly, startDate: "2026-10-25" }, "2026-11-01"),
      ).toBe(true);
    },
  );
  it("未来无限重复只计算当前周，不创建实例或改变模板", () => {
    const state = taskSeed();
    const before = structuredClone(state);
    expect(resolveTasks(state, "2040-01-02")).toHaveLength(7);
    expect(state).toEqual(before);
    expect(state.taskOccurrences).toHaveLength(0);
  });
  it("过去未完成仍在原日期，不按今天搬移", () => {
    const state = taskSeed();
    state.tasks[0].repeatType = "none";
    expect(resolveTasks(state, "2026-09-21")[0]).toMatchObject({
      date: "2026-09-21",
      status: "todo",
    });
    expect(resolveTasks(state, "2026-09-28")).toHaveLength(0);
  });
});

describe("任务时段、混排与输入验证", () => {
  it("跨时段任务只显示在开始时段", () => {
    const state = taskSeed();
    state.tasks[0] = {
      ...task,
      startDate: "2026-09-24",
      repeatType: "none",
      period: "evening",
      startTime: "11:00",
      endTime: "19:00",
    };
    const tasks = resolveTasks(state, "2026-09-21");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].fields.period).toBe("morning");
    expect(slotItems([], tasks, "2026-09-24", "morning")).toHaveLength(1);
    expect(slotItems([], tasks, "2026-09-24", "afternoon")).toHaveLength(0);
    expect(slotItems([], tasks, "2026-09-24", "evening")).toHaveLength(0);
  });
  it("有时间的课程和任务一起排序，无时间任务最后，结束时间可独立填写", () => {
    const state = taskSeed();
    state.tasks = [
      { ...task, id: "untimed", startDate: "2026-09-24", repeatType: "none" },
      {
        ...task,
        id: "later",
        startDate: "2026-09-24",
        repeatType: "none",
        startTime: "09:00",
      },
      {
        ...task,
        id: "earlier",
        startDate: "2026-09-24",
        repeatType: "none",
        startTime: "07:00",
      },
      {
        ...task,
        id: "end-only",
        startDate: "2026-09-24",
        repeatType: "none",
        endTime: "10:00",
      },
    ];
    const result = slotItems(
      resolveWeek(state, "2026-09-21"),
      resolveTasks(state, "2026-09-21"),
      "2026-09-24",
      "morning",
    );
    expect(
      result.map((item) =>
        item.kind === "task" ? item.task.taskId : item.occurrence.courseId,
      ),
    ).toEqual(["earlier", "course-1", "later", "end-only", "untimed"]);
  });
  it("时间可单独留空；时间段边界使用开始时间", () => {
    expect(() => validateTask(taskDraft)).not.toThrow();
    expect(() =>
      validateTask({ ...taskDraft, startTime: "12:00" }),
    ).not.toThrow();
    expect(() =>
      validateTask({ ...taskDraft, endTime: "15:00" }),
    ).not.toThrow();
    expect(
      normalizeTaskFields({ ...taskDraft, startTime: "12:00" }).period,
    ).toBe("afternoon");
    expect(
      normalizeTaskFields({ ...taskDraft, startTime: "18:00" }).period,
    ).toBe("evening");
  });
  it("拒绝非法日期、反向时间、跨午夜与无效耗时", () => {
    expect(() => validateTask({ ...taskDraft, name: "  " })).toThrow("名称");
    expect(() =>
      validateTask({ ...taskDraft, startDate: "2026-02-29" }),
    ).toThrow("日期");
    expect(() =>
      validateTask({ ...taskDraft, startTime: "23:00", endTime: "01:00" }),
    ).toThrow("跨午夜");
    expect(() =>
      validateTask({ ...taskDraft, startTime: "10:00", endTime: "10:00" }),
    ).toThrow("晚于");
    expect(() => validateTask({ ...taskDraft, startTime: "24:00" })).toThrow(
      "时间",
    );
    for (const estimatedMinutes of [0, -1, 1.5, Infinity])
      expect(() => validateTask({ ...taskDraft, estimatedMinutes })).toThrow(
        "耗时",
      );
    expect(() =>
      validateTask({ ...taskDraft, repeatUntil: "2026-09-20" }),
    ).toThrow("重复截止");
    expect(() => validateTask({ ...taskDraft, dueDate: "bad" })).toThrow(
      "日期",
    );
  });
});
