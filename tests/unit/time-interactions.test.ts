import { describe, expect, it } from "vitest";
import { seed, course } from "./fixtures";
import { taskSeed, task } from "./task-fixtures";
import {
  todayCourseStatus,
  formatCountdown,
} from "../../src/domain/today-status";
import { resolveWeek, occurrencePeriods } from "../../src/domain/courses";
import {
  getTimePeriods,
  validateTimeSlots,
  type TimeSlotDraft,
} from "../../src/domain/time-slots";
import { resolveTasks, normalizeTaskFields } from "../../src/domain/tasks";
import { copyPreviousWeek, planPreviousWeek } from "../../src/domain/copy-week";
import { MemoryScheduleRepository } from "../../src/repositories/memory-schedule-repository";
import { ScheduleService } from "../../src/application/schedule-service";
import type { TaskOccurrence } from "../../src/types/task";

const slots: TimeSlotDraft[] = [
  { period: "morning", startTime: "00:00", endTime: "11:00" },
  { period: "afternoon", startTime: "11:00", endTime: "19:00" },
  { period: "evening", startTime: "19:00", endTime: "24:00" },
];
const storedSlots = slots.map((s, i) => ({
  ...s,
  id: `slot-${i}`,
  profileId: course.profileId,
}));
const now = (time: string) => new Date(`2026-09-24T${time}`);
describe("今日课程状态与时钟", () => {
  const state = seed();
  state.courses.push({
    ...course,
    id: "second",
    name: "下午课",
    startTime: "14:00",
    endTime: "16:00",
  });
  const occurrences = resolveWeek(state, "2026-09-24");
  it.each([
    ["07:59:59", "not_started", 28801],
    ["08:00:00", "ongoing", 28800],
    ["09:40:00", "break", 22800],
    ["14:00:00", "ongoing", 7200],
    ["15:59:59", "ongoing", 1],
    ["16:00:00", "finished", 0],
    ["23:59:59", "finished", 0],
  ])("%s 的状态和距最后下课的秒数", (time, status, seconds) => {
    const result = todayCourseStatus(occurrences, now(time));
    expect(result.state).toBe(status);
    expect(result.seconds).toBe(seconds);
    expect(formatCountdown(result.seconds!)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
  it("无课、全部取消和跨午夜不沿用昨天倒计时", () => {
    expect(todayCourseStatus([], now("12:00:00")).seconds).toBeNull();
    expect(
      todayCourseStatus(
        occurrences.map((c) => ({ ...c, cancelled: true })),
        now("12:00:00"),
      ).state,
    ).toBe("empty");
    expect(
      todayCourseStatus(occurrences, new Date("2026-09-25T00:00:00")).state,
    ).toBe("empty");
  });
  it("重叠课程均列出，跨段重复卡片不重复计数；采用最大结束时间", () => {
    const overlap = {
      ...occurrences[0],
      id: "overlap",
      course: { ...course, name: "重叠", startTime: "08:30", endTime: "17:00" },
    };
    const result = todayCourseStatus(
      [...occurrences, occurrences[0], overlap],
      now("08:30:00"),
    );
    expect(result.current).toHaveLength(2);
    expect(result.courses).toHaveLength(3);
    expect(result.seconds).toBe(30600);
  });
  it("调课和取消影响今日时钟，非浏览周", () => {
    const modified = seed();
    modified.exceptions = [
      {
        id: "e",
        profileId: course.profileId,
        courseId: course.id,
        originalDate: "2026-09-24",
        action: "modify",
        overrides: { endTime: "10:00" },
        createdAt: course.createdAt,
      },
    ];
    expect(
      todayCourseStatus(resolveWeek(modified, "2026-09-24"), now("09:40:00"))
        .seconds,
    ).toBe(1200);
  });
});

describe("可配置时段", () => {
  it("连续覆盖全天；课程跨边界共用身份，任务只在开始时段", () => {
    validateTimeSlots(slots);
    expect(
      occurrencePeriods(
        { ...course, startTime: "10:30", endTime: "12:00" },
        storedSlots,
      ),
    ).toEqual(["morning", "afternoon"]);
    expect(
      occurrencePeriods(
        { ...course, startTime: "10:30", endTime: "11:00" },
        storedSlots,
      ),
    ).toEqual(["morning"]);
    expect(
      normalizeTaskFields(
        { ...task, startTime: "11:00", endTime: "20:00" },
        storedSlots,
      ).period,
    ).toBe("afternoon");
    expect(
      normalizeTaskFields({ ...task, period: "evening" }, storedSlots).period,
    ).toBe("evening");
  });
  it.each(["overlap", "reverse", "missing", "invalid"])(
    "拒绝非法时段 %s",
    (kind) => {
      const bad = structuredClone(slots);
      if (kind === "overlap") bad[1].startTime = "10:00";
      if (kind === "reverse") bad[1].endTime = "10:00";
      if (kind === "missing") bad.pop();
      if (kind === "invalid") bad[0].startTime = "25:00";
      expect(() => validateTimeSlots(bad)).toThrow();
    },
  );
  it("支持六个独立边界、空隙和不覆盖全天，空隙任务保留手选时段", () => {
    const independent = [
      { ...storedSlots[0], startTime: "08:00", endTime: "11:30" },
      { ...storedSlots[1], startTime: "14:00", endTime: "17:00" },
      { ...storedSlots[2], startTime: "19:00", endTime: "22:00" },
    ];
    expect(() => validateTimeSlots(independent)).not.toThrow();
    expect(
      occurrencePeriods(
        { ...course, startTime: "12:00", endTime: "13:00" },
        independent,
      ),
    ).toEqual([]);
    expect(
      normalizeTaskFields(
        { ...task, startTime: "12:30", period: "afternoon" },
        independent,
      ).period,
    ).toBe("afternoon");
    expect(() =>
      validateTimeSlots([
        { ...independent[0], endTime: "08:01" },
        ...independent.slice(1),
      ]),
    ).not.toThrow();
  });
  it("时段变化后表单默认时间有效并位于所选时段", () => {
    const tiny = [
      { ...slots[0], endTime: "01:00" },
      { ...slots[1], startTime: "01:00", endTime: "23:58" },
      { ...slots[2], startTime: "23:58" },
    ];
    for (const period of getTimePeriods(tiny)) {
      expect(period.defaultStart >= period.start).toBe(true);
      expect(period.defaultEnd > period.defaultStart).toBe(true);
      expect(period.defaultEnd <= period.end).toBe(true);
    }
  });
  it("历史任务和单次覆盖根据新时段展示，记录和状态不变", () => {
    const state = taskSeed();
    state.timeSlots = storedSlots;
    state.tasks[0].startTime = "11:30";
    const original = structuredClone(state);
    expect(resolveTasks(state, "2026-09-21")[0].fields.period).toBe(
      "afternoon",
    );
    expect(state).toEqual(original);
  });
});

describe("复制上一周", () => {
  const stamp = "2026-09-28T00:00:00.000Z";
  const record = (
    date: string,
    status: TaskOccurrence["status"],
  ): TaskOccurrence => ({
    id: crypto.randomUUID(),
    profileId: task.profileId,
    taskId: task.id,
    occurrenceDate: date,
    status,
    completedAt: status === "done" ? stamp : null,
    overrides: null,
  });
  it("固定课程不生成模板或例外，不延长教学范围", () => {
    const state = seed();
    state.courses[0].endWeek = 4;
    const result = copyPreviousWeek(state, "2026-09-28", "courses", stamp);
    expect(result).toEqual(state);
    expect(planPreviousWeek(state, "2026-09-28", "courses").fixedCourses).toBe(
      1,
    );
  });
  it("单次课程复制一次，再次执行幂等；源取消的课程不复制", () => {
    const state = seed();
    state.courses[0] = {
      ...course,
      repeatType: "once",
      occurrenceDate: "2026-09-24",
    };
    const result = copyPreviousWeek(state, "2026-09-28", "courses", stamp);
    expect(result.courses).toHaveLength(2);
    expect(result.courses[1].occurrenceDate).toBe("2026-10-01");
    expect(copyPreviousWeek(result, "2026-09-28", "courses", stamp)).toEqual(
      result,
    );
    state.exceptions = [
      {
        id: "cancel",
        profileId: course.profileId,
        courseId: course.id,
        originalDate: "2026-09-24",
        action: "cancel",
        overrides: {},
        createdAt: stamp,
      },
    ];
    expect(copyPreviousWeek(state, "2026-09-28", "courses", stamp)).toEqual(
      state,
    );
  });
  it("重复任务新增目标实例，源完成状态不复制，不生成任务模板", () => {
    const state = taskSeed();
    state.taskOccurrences = [record("2026-09-21", "done")];
    const result = copyPreviousWeek(state, "2026-09-28", "tasks", stamp);
    expect(result.tasks).toEqual(state.tasks);
    expect(result.taskOccurrences).toHaveLength(8);
    expect(
      resolveTasks(result, "2026-09-28").every((t) => t.status === "todo"),
    ).toBe(true);
    expect(result.taskOccurrences[0]).toEqual(state.taskOccurrences[0]);
    expect(copyPreviousWeek(result, "2026-09-28", "tasks", stamp)).toEqual(
      result,
    );
  });
  it("目标已完成、删除或移走的实例均保留", () => {
    const state = taskSeed();
    state.taskOccurrences = [
      record("2026-09-28", "done"),
      { ...record("2026-09-29", "todo"), overrides: { deleted: true } },
      {
        ...record("2026-09-30", "todo"),
        overrides: { startDate: "2026-10-06" },
      },
    ];
    const result = copyPreviousWeek(state, "2026-09-28", "tasks", stamp);
    expect(result.taskOccurrences.slice(0, 3)).toEqual(state.taskOccurrences);
    expect(result.taskOccurrences).toHaveLength(7);
  });
  it("不重复任务通过新实例出现在目标周；日期、截止日期跨年平移", () => {
    const state = taskSeed();
    state.tasks = [
      {
        ...task,
        repeatType: "none",
        startDate: "2026-12-28",
        dueDate: "2026-12-31",
      },
    ];
    const result = copyPreviousWeek(state, "2027-01-04", "all", stamp);
    expect(result.tasks).toHaveLength(1);
    const copied = resolveTasks(result, "2027-01-04");
    expect(copied).toHaveLength(1);
    expect(copied[0].date).toBe("2027-01-04");
    expect(copied[0].fields.dueDate).toBe("2027-01-07");
  });
  it("复制按修改后的显示日期取来源，仅指定范围被复制", () => {
    const state = taskSeed();
    state.tasks[0].repeatType = "none";
    state.taskOccurrences = [
      {
        ...record("2026-09-21", "done"),
        overrides: { startDate: "2026-09-29", name: "移动后" },
      },
    ];
    expect(planPreviousWeek(state, "2026-09-28", "tasks").tasks).toHaveLength(
      0,
    );
    const result = copyPreviousWeek(state, "2026-10-05", "tasks", stamp);
    expect(resolveTasks(result, "2026-10-05")[0].fields.name).toBe("移动后");
    expect(
      copyPreviousWeek(state, "2026-10-05", "courses", stamp).taskOccurrences,
    ).toEqual(state.taskOccurrences);
  });
  it("命令原子写入时段和复制结果，日期非法不会提交", async () => {
    const repository = new MemoryScheduleRepository([taskSeed()]);
    const app = new ScheduleService(repository, task.profileId);
    await app.execute({ type: "save-time-slots", slots });
    const changed = await app.read();
    expect(changed.timeSlots).toHaveLength(3);
    await expect(
      app.execute({
        type: "copy-previous-week",
        targetWeek: "1000-01-01",
        scope: "all",
      }),
    ).rejects.toThrow();
    expect(await app.read()).toEqual(changed);
    await app.execute({
      type: "copy-previous-week",
      targetWeek: "2026-09-28",
      scope: "all",
    });
    expect((await app.read()).taskOccurrences).toHaveLength(7);
  });
});
