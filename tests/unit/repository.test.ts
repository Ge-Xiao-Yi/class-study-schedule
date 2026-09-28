import { beforeEach, describe, expect, it } from "vitest";
import { ScheduleService } from "../../src/application/schedule-service";
import { MemoryScheduleRepository } from "../../src/repositories/memory-schedule-repository";
import { courseFields, resolveWeek } from "../../src/domain/courses";
import { course, draft, seed, semester } from "./fixtures";

describe("仓库接口与课程命令", () => {
  let repository: MemoryScheduleRepository;
  let service: ScheduleService;
  beforeEach(() => {
    repository = new MemoryScheduleRepository([seed()]);
    service = new ScheduleService(repository, semester.profileId);
  });

  it("新增/编辑存储一个稳定 UUID，跨周读取不新增记录", async () => {
    const added = await service.execute({ type: "save-course", draft });
    const newCourse = added.courses[1];
    expect(newCourse.id).toMatch(/^[\da-f]{8}-[\da-f-]{27}$/i);
    await service.execute({
      type: "save-course",
      id: newCourse.id,
      draft: { ...draft, name: "已修改" },
    });
    for (const date of ["2026-09-21", "2026-09-28", "2026-09-21"])
      expect(resolveWeek(await service.read(), date)).toHaveLength(2);
    expect((await service.read()).courses).toHaveLength(2);
    expect(
      (await service.read()).courses.find((item) => item.id === newCourse.id)
        ?.name,
    ).toBe("已修改");
  });
  it("修改同一周多次更新同一个例外；恢复后模板不变", async () => {
    for (const name of ["临时调整", "再次调整"])
      await service.execute({
        type: "modify-occurrence",
        courseId: course.id,
        originalDate: "2026-09-24",
        fields: { ...courseFields(course), name, weekday: 6 },
      });
    let state = await service.read();
    expect(state.exceptions).toHaveLength(1);
    expect(state.courses).toEqual([course]);
    expect(resolveWeek(state, "2026-09-21")[0].course.name).toBe("再次调整");
    expect(resolveWeek(state, "2026-09-28")[0].course.name).toBe(course.name);
    state = await service.execute({
      type: "restore-occurrence",
      courseId: course.id,
      originalDate: "2026-09-24",
    });
    expect(state.exceptions).toHaveLength(0);
    expect(resolveWeek(state, "2026-09-21")[0].date).toBe("2026-09-24");
  });
  it("取消只影响一周；恢复和删除整门课都清理对应例外", async () => {
    await service.execute({
      type: "cancel-occurrence",
      courseId: course.id,
      originalDate: "2026-09-24",
    });
    await service.execute({
      type: "cancel-occurrence",
      courseId: course.id,
      originalDate: "2026-10-01",
    });
    let state = await service.execute({
      type: "restore-occurrence",
      courseId: course.id,
      originalDate: "2026-09-24",
    });
    expect(resolveWeek(state, "2026-09-21")[0].cancelled).toBe(false);
    expect(resolveWeek(state, "2026-09-28")[0].cancelled).toBe(true);
    state = await service.execute({
      type: "delete-course",
      courseId: course.id,
    });
    expect(state.courses).toHaveLength(0);
    expect(state.exceptions).toHaveLength(0);
  });
  it("改变模板星期保留同一自然周的例外，并可恢复到新模板", async () => {
    await service.execute({
      type: "modify-occurrence",
      courseId: course.id,
      originalDate: "2026-09-24",
      fields: { ...courseFields(course), weekday: 6, name: "周六调课" },
    });
    let state = await service.execute({
      type: "save-course",
      id: course.id,
      draft: { ...draft, weekday: 2 },
    });
    expect(state.exceptions[0].originalDate).toBe("2026-09-22");
    expect(resolveWeek(state, "2026-09-21")[0].date).toBe("2026-09-26");
    state = await service.execute({
      type: "restore-occurrence",
      courseId: course.id,
      originalDate: "2026-09-22",
    });
    expect(resolveWeek(state, "2026-09-21")[0].date).toBe("2026-09-22");
  });
  it("缩短学期不删除模板，恢复设置后课程重新出现", async () => {
    await service.execute({
      type: "save-semester",
      settings: { ...semester, teachingWeeks: 2 },
    });
    expect(resolveWeek(await service.read(), "2026-09-21")).toHaveLength(0);
    expect((await service.read()).courses).toHaveLength(1);
    await service.execute({ type: "save-semester", settings: semester });
    expect(resolveWeek(await service.read(), "2026-09-21")).toHaveLength(1);
  });
  it("错误写入原子回滚，取消不存在的发生日期被拒绝", async () => {
    const before = await service.read();
    await expect(
      service.execute({
        type: "save-course",
        draft: { ...draft, endTime: "01:00" },
      }),
    ).rejects.toThrow();
    await expect(
      service.execute({
        type: "cancel-occurrence",
        courseId: course.id,
        originalDate: "2026-09-25",
      }),
    ).rejects.toThrow("没有原始课程");
    await expect(
      repository.transact(semester.profileId, (state) => {
        state.courses = [];
        throw new Error("失败");
      }),
    ).rejects.toThrow("失败");
    expect(await service.read()).toEqual(before);
  });
  it("返回值不能修改仓库；并发命令不会丢失其他课程", async () => {
    const read = await service.read();
    read.courses.length = 0;
    expect((await service.read()).courses).toHaveLength(1);
    await Promise.all([
      service.execute({
        type: "save-course",
        draft: { ...draft, name: "课程 A" },
      }),
      service.execute({
        type: "save-course",
        draft: { ...draft, name: "课程 B" },
      }),
    ]);
    expect((await service.read()).courses).toHaveLength(3);
  });
  it("按 profileId 隔离数据，不能写入其他档案", async () => {
    await expect(repository.read("other")).rejects.toThrow("找不到");
    await expect(
      repository.transact(semester.profileId, (state) => ({
        ...state,
        courses: [{ ...course, profileId: "other" }],
      })),
    ).rejects.toThrow("其他档案");
    expect((await service.read()).courses).toEqual([course]);
  });
});
