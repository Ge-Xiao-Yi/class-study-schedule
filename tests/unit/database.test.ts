import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDatabase } from "../../src/repositories/local-database";
import { DexieArchiveRepository } from "../../src/repositories/dexie-archive-repository";
import { DexieScheduleRepository } from "../../src/repositories/dexie-schedule-repository";
import { ScheduleService } from "../../src/application/schedule-service";
import { parseBackup, validateBackup } from "../../src/domain/backup";
import { resolveTasks } from "../../src/domain/tasks";
import type { Backup } from "../../src/types/archive";
import { blankImportRow } from "../../src/domain/course-import";

let db: LocalDatabase;
let archive: DexieArchiveRepository;
let profileId: string;
async function adapter(id = profileId) {
  return new DexieScheduleRepository(
    archive,
    id,
    (await db.metadata.get("workspace"))!.epoch,
  );
}
async function service(id = profileId) {
  return new ScheduleService(await adapter(id), id);
}
const draft = {
  name: "每天阅读",
  startDate: "2026-09-21",
  period: "morning" as const,
  startTime: null,
  endTime: null,
  estimatedMinutes: 25,
  dueDate: null,
  repeatType: "daily" as const,
  repeatUntil: null,
  goalId: null,
};
beforeEach(async () => {
  db = new LocalDatabase(`test-${crypto.randomUUID()}`);
  archive = new DexieArchiveRepository(db, "2026-09-24");
  profileId = await archive.initialize();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe("数据库与档案", () => {
  it("目标关联、导入档案隔离、刷新和备份恢复", async () => {
    const app = await service();
    const other = await archive.createProfile("独立导入");
    const initial = await app.read();
    const g = await app.execute({
      type: "goal:save",
      draft: {
        name: "长期阅读",
        description: "说明",
        startDate: "2026-09-21",
        progressMode: "automatic",
        manualProgress: 0,
      },
      taskIds: [],
    });
    const goal = g.goals![0];
    const linked = await app.execute({
      type: "task:create",
      draft: { ...draft, goalId: goal.id },
      status: "done",
    });
    expect(linked.goalTaskRelations).toHaveLength(1);
    const otherApp = await service(other.id);
    await expect(
      otherApp.execute({
        type: "task:create",
        draft: { ...draft, goalId: goal.id },
        status: "todo",
      }),
    ).rejects.toThrow();
    const row = {
      id: "row",
      source: "file" as const,
      confirmed: true,
      values: {
        ...blankImportRow(),
        name: "导入课程",
        weekday: "4",
        startTime: "10:00",
        endTime: "11:00",
      },
    };
    await app.execute({
      type: "import-courses",
      rows: [row, row],
    });
    const imported = await app.read();
    expect(imported.courses).toHaveLength(initial.courses.length + 1);
    expect(
      (await otherApp.read()).courses.some((c) => c.name === "导入课程"),
    ).toBe(false);
    expect((await otherApp.read()).goals).toEqual([]);
    await expect(
      app.execute({
        type: "import-courses",
        rows: [
          { ...row, values: { ...row.values, name: "合法新课" } },
          { ...row, values: { ...row.values, startTime: "99:99" } },
        ],
      }),
    ).rejects.toThrow();
    expect(await app.read()).toEqual(imported);
    db.close();
    await db.open();
    expect(await app.read()).toEqual(imported);
    const backup = await archive.exportBackup();
    await archive.restoreBackup(backup);
    expect(await (await service()).read()).toEqual(imported);
    const deleted = await (
      await service()
    ).execute({ type: "goal:delete", id: goal.id });
    expect(deleted.tasks).toHaveLength(imported.tasks.length);
    expect(deleted.taskOccurrences).toEqual(imported.taskOccurrences);
    expect(deleted.goalTaskRelations).toEqual([]);
  });
  it("自定义时段按档案持久化，备份恢复后边界不变", async () => {
    const app = await service();
    const other = await archive.createProfile("时段独立");
    const slots = [
      { period: "morning" as const, startTime: "08:00", endTime: "11:00" },
      { period: "afternoon" as const, startTime: "14:00", endTime: "17:00" },
      { period: "evening" as const, startTime: "19:00", endTime: "22:00" },
    ];
    const previous = await app.read();
    await app.execute({ type: "save-time-slots", slots });
    const saved = await app.read();
    expect(saved.timeSlots?.map((s) => s.id)).toEqual(
      previous.timeSlots?.map((s) => s.id),
    );
    expect(saved.timeSlots?.find((s) => s.period === "morning")?.endTime).toBe(
      "11:00",
    );
    expect(
      (await (await service(other.id)).read()).timeSlots?.find(
        (s) => s.period === "morning",
      )?.endTime,
    ).toBe("12:00");
    const backup = await archive.exportBackup();
    await archive.restoreBackup(backup);
    expect((await (await service()).read()).timeSlots).toEqual(saved.timeSlots);
  });
  it("跨周复制数据库记录幂等，任务模板不增加，任务实例未完成", async () => {
    const app = await service();
    const before = await app.read();
    await app.execute({
      type: "copy-previous-week",
      targetWeek: "2026-09-28",
      scope: "all",
    });
    const once = await app.read();
    expect(once.courses).toEqual(before.courses);
    expect(once.tasks).toEqual(before.tasks);
    expect(resolveTasks(once, "2026-09-28")).toHaveLength(5);
    expect(
      resolveTasks(once, "2026-09-28").every((t) => t.status === "todo"),
    ).toBe(true);
    await app.execute({
      type: "copy-previous-week",
      targetWeek: "2026-09-28",
      scope: "all",
    });
    expect(await app.read()).toEqual(once);
    db.close();
    await db.open();
    expect(await app.read()).toEqual(once);
  });
  it("使用版本 1，初始化幂等，不重复生成模板", async () => {
    expect(db.verno).toBe(1);
    await Promise.all([archive.initialize(), archive.initialize()]);
    expect(await archive.profiles()).toHaveLength(1);
    expect((await archive.readProfile(profileId)).courses).toHaveLength(8);
    expect((await archive.readProfile(profileId)).timeSlots).toHaveLength(3);
  });
  it("缺失元数据时不重新播种或清除现有数据", async () => {
    const tasks = await db.records("tasks").toArray();
    await db.metadata.clear();
    await expect(archive.initialize()).rejects.toThrow("保护原数据");
    expect(await db.records("tasks").toArray()).toEqual(tasks);
  });
  it("数据库唯一索引拒绝重复任务实例", async () => {
    const instance = (await db.records("taskOccurrences").toArray())[0];
    await expect(
      db
        .records("taskOccurrences")
        .add({ ...instance, id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ name: "ConstraintError" });
    expect(
      (await db.records("taskOccurrences").toArray()).filter(
        (r) => r.taskId === instance.taskId,
      ),
    ).toHaveLength(1);
  });
  it("关闭并重新打开数据库后仍可读取课程和任务状态", async () => {
    const app = await service();
    const next = await app.execute({
      type: "task:create",
      draft,
      status: "done",
    });
    const task = next.tasks.find((t) => t.name === draft.name)!;
    db.close();
    await db.open();
    const restored = await (await service()).read();
    expect(restored.tasks.find((t) => t.id === task.id)).toEqual(task);
    expect(
      restored.taskOccurrences.find((t) => t.taskId === task.id)?.status,
    ).toBe("done");
  });
  it("档案创建、改名、删除级联且不能删除最后一个档案", async () => {
    const second = await archive.createProfile("第二档案");
    await archive.renameProfile(second.id, "新名称");
    expect(
      (await archive.profiles()).find((p) => p.id === second.id)?.name,
    ).toBe("新名称");
    await archive.selectProfile(second.id);
    expect(await archive.deleteProfile(second.id)).toBe(profileId);
    expect(
      await db
        .records("semesters")
        .where("profileId")
        .equals(second.id)
        .count(),
    ).toBe(0);
    await expect(archive.deleteProfile(profileId)).rejects.toThrow("至少保留");
  });
  it("新档案为空，读写不会混入其他档案", async () => {
    const other = await archive.createProfile("独立档案");
    const before = await archive.readProfile(profileId);
    const otherApp = await service(other.id);
    expect((await otherApp.read()).courses).toEqual([]);
    await otherApp.execute({ type: "task:create", draft, status: "todo" });
    expect((await otherApp.read()).tasks).toHaveLength(1);
    expect(await archive.readProfile(profileId)).toEqual(before);
    await expect(
      otherApp.execute({
        type: "delete-course",
        courseId: before.courses[0].id,
      }),
    ).rejects.toThrow("课程不存在");
  });
  it("拒绝跨档案 ID 覆写，失败不改变任一档案", async () => {
    const other = await archive.createProfile("另一档案");
    const before = await archive.exportBackup();
    const stolen = before.data.tasks[0];
    await expect(
      archive.updateProfile(other.id, (data) => ({
        ...data,
        tasks: [{ ...stolen, profileId: other.id }],
      })),
    ).rejects.toThrow("ID 已属于");
    expect((await archive.exportBackup()).data).toEqual(before.data);
  });
  it("跨档案字段和外键被拒绝", async () => {
    const other = await archive.createProfile("B");
    const foreign = (await archive.readProfile(other.id)).semesters[0];
    await expect(
      archive.updateProfile(profileId, (data) => ({
        ...data,
        courses: data.courses.map((c) => ({ ...c, semesterId: foreign.id })),
      })),
    ).rejects.toThrow("关联");
    await expect(
      archive.updateProfile(profileId, (data) => ({
        ...data,
        tasks: data.tasks.map((t) => ({ ...t, profileId: other.id })),
      })),
    ).rejects.toThrow("档案");
  });
  it("撤销会话后拒绝旧界面的查询与写入", async () => {
    const repo = await adapter();
    const app = new ScheduleService(repo, profileId);
    repo.revoke();
    await expect(app.read()).rejects.toThrow("档案已切换");
    await expect(
      app.execute({ type: "task:create", draft, status: "todo" }),
    ).rejects.toThrow("档案已切换");
  });
  it("写入过程中撤销会话也会回滚旧档案的更改", async () => {
    const repo = await adapter();
    const before = await archive.exportBackup();
    const hook = () => {
      repo.revoke();
    };
    db.records("tasks").hook("creating", hook);
    try {
      await expect(
        new ScheduleService(repo, profileId).execute({
          type: "task:create",
          draft,
          status: "todo",
        }),
      ).rejects.toThrow("档案已切换");
    } finally {
      db.records("tasks").hook("creating").unsubscribe(hook);
    }
    expect((await archive.exportBackup()).data).toEqual(before.data);
  });
  it("同一连接和不同连接并发更新不会丢失任务", async () => {
    const connection = new LocalDatabase(db.name);
    try {
      const otherArchive = new DexieArchiveRepository(connection);
      const otherRepo = new DexieScheduleRepository(
        otherArchive,
        profileId,
        (await db.metadata.get("workspace"))!.epoch,
      );
      const a = await service();
      const b = new ScheduleService(otherRepo, profileId);
      await Promise.all([
        a.execute({
          type: "task:create",
          draft: { ...draft, name: "A" },
          status: "todo",
        }),
        b.execute({
          type: "task:create",
          draft: { ...draft, name: "B" },
          status: "todo",
        }),
      ]);
      expect((await a.read()).tasks.map((t) => t.name)).toEqual(
        expect.arrayContaining(["A", "B"]),
      );
    } finally {
      connection.close();
    }
  });
  it("课程、例外、单次状态写入与删除级联", async () => {
    const app = await service();
    const initial = await app.read();
    const course = initial.courses.find((c) => c.weekday === 1)!;
    await app.execute({
      type: "cancel-occurrence",
      courseId: course.id,
      originalDate: "2026-09-21",
    });
    expect((await app.read()).exceptions).toHaveLength(1);
    await app.execute({
      type: "restore-occurrence",
      courseId: course.id,
      originalDate: "2026-09-21",
    });
    expect((await app.read()).exceptions).toHaveLength(0);
    await app.execute({ type: "delete-course", courseId: course.id });
    expect((await app.read()).courses).toHaveLength(7);
  });
  it("重复任务每次完成状态独立且唯一，浏览周不生成记录", async () => {
    const app = await service();
    const created = await app.execute({
      type: "task:create",
      draft,
      status: "todo",
    });
    const task = created.tasks.find((t) => t.name === draft.name)!;
    await app.execute({
      type: "task:status",
      taskId: task.id,
      originalDate: "2026-09-21",
      status: "done",
    });
    await app.execute({
      type: "task:status",
      taskId: task.id,
      originalDate: "2026-09-21",
      status: "done",
    });
    const current = await app.read();
    expect(
      resolveTasks(current, "2026-09-21")
        .filter((t) => t.taskId === task.id)
        .map((t) => t.status),
    ).toEqual(["done", "todo", "todo", "todo", "todo", "todo", "todo"]);
    resolveTasks(current, "2027-01-04");
    expect(
      (await app.read()).taskOccurrences.filter((t) => t.taskId === task.id),
    ).toHaveLength(1);
  });
  it("目标、关联、设置 DAL 可往返，删除任务清理关联", async () => {
    const goalId = crypto.randomUUID();
    const now = new Date().toISOString();
    const data = await archive.updateProfile(profileId, (data) => {
      const taskId = data.tasks[0].id;
      return {
        ...data,
        goals: [
          {
            id: goalId,
            profileId,
            name: "目标",
            description: "",
            startDate: "2026-09-21",
            progressMode: "manual",
            manualProgress: 25,
            createdAt: now,
            updatedAt: now,
          },
        ],
        goalTaskRelations: [
          { id: crypto.randomUUID(), profileId, goalId, taskId },
        ],
        tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, goalId } : t)),
      };
    });
    expect((await archive.readProfile(profileId)).goals).toEqual(data.goals);
    const backup = await archive.exportBackup();
    await archive.restoreBackup(backup);
    expect((await archive.exportBackup()).data).toEqual(backup.data);
    await (
      await service()
    ).execute({
      type: "task:delete",
      taskId: data.tasks[0].id,
      originalDate: data.tasks[0].startDate,
      scope: "all",
    });
    expect((await archive.readProfile(profileId)).goalTaskRelations).toEqual(
      [],
    );
    expect((await archive.readProfile(profileId)).goals).toHaveLength(1);
  });
});

describe("完整 JSON 备份恢复", () => {
  it("多档案、课程例外与任务状态完整往返，旧会话不可再写", async () => {
    const app = await service();
    const created = await app.execute({
      type: "task:create",
      draft,
      status: "done",
    });
    const course = created.courses.find((c) => c.weekday === 1)!;
    await app.execute({
      type: "cancel-occurrence",
      courseId: course.id,
      originalDate: "2026-09-21",
    });
    const second = await archive.createProfile("第二档案");
    await archive.selectProfile(second.id);
    const backup = parseBackup(JSON.stringify(await archive.exportBackup()));
    await app.execute({ type: "delete-course", courseId: course.id });
    await archive.restoreBackup(backup);
    expect((await archive.exportBackup()).data).toEqual(backup.data);
    expect(await archive.initialize()).toBe(second.id);
    await expect(
      app.execute({ type: "delete-course", courseId: course.id }),
    ).rejects.toThrow("重新加载");
    expect((await (await service()).read()).exceptions).toHaveLength(1);
  });
  it("恢复写入途中发生异常，清空和已写入内容全部回滚", async () => {
    const before = await archive.exportBackup();
    const backup = structuredClone(before);
    backup.data.profiles[0].name = "即将恢复";
    const hook = () => {
      throw new Error("模拟磁盘写入失败");
    };
    db.records("tasks").hook("creating", hook);
    try {
      await expect(archive.restoreBackup(backup)).rejects.toThrow("模拟磁盘");
    } finally {
      db.records("tasks").hook("creating").unsubscribe(hook);
    }
    expect((await archive.exportBackup()).data).toEqual(before.data);
    expect(await (await service()).read()).toBeDefined();
  });
  it("正常写入失败也回滚，不返回虚假的成功", async () => {
    const before = await archive.exportBackup();
    await expect(
      archive.updateProfile(profileId, () => {
        throw new Error("失败");
      }),
    ).rejects.toThrow("失败");
    expect((await archive.exportBackup()).data).toEqual(before.data);
  });
  it("缩短学期后的旧课程范围仍能备份恢复", async () => {
    const app = await service();
    const { semester } = await app.read();
    await app.execute({
      type: "save-semester",
      settings: { ...semester, teachingWeeks: 2 },
    });
    const backup = await archive.exportBackup();
    await archive.restoreBackup(backup);
    expect((await (await service()).read()).courses[0].endWeek).toBe(20);
  });
  const invalidCases: [string, (backup: Backup) => unknown][] = [
    ["未知格式版本", (b) => ({ ...b, formatVersion: 2 })],
    ["未知数据库版本", (b) => ({ ...b, databaseVersion: 2 })],
    [
      "缺少数据表",
      (b) => {
        delete (b.data as Partial<Backup["data"]>).goals;
        return b;
      },
    ],
    ["未知字段", (b) => ({ ...b, password: "fake" })],
    [
      "无效 UUID",
      (b) => {
        b.data.profiles[0].id = "abc";
        return b;
      },
    ],
    [
      "无效日期",
      (b) => {
        b.data.tasks[0].startDate = "2026-02-30";
        return b;
      },
    ],
    [
      "无效时间",
      (b) => {
        b.data.courses[0].startTime = "25:00";
        return b;
      },
    ],
    [
      "跨午夜",
      (b) => {
        b.data.courses[0].startTime = "23:00";
        b.data.courses[0].endTime = "01:00";
        return b;
      },
    ],
    [
      "孤立任务实例",
      (b) => {
        b.data.taskOccurrences[0].taskId = crypto.randomUUID();
        return b;
      },
    ],
    [
      "重复主键",
      (b) => {
        b.data.tasks.push(b.data.tasks[0]);
        return b;
      },
    ],
    [
      "重复任务日期",
      (b) => {
        b.data.taskOccurrences.push({
          ...b.data.taskOccurrences[0],
          id: crypto.randomUUID(),
        });
        return b;
      },
    ],
    [
      "状态时间矛盾",
      (b) => {
        b.data.taskOccurrences[0].status = "done";
        b.data.taskOccurrences[0].completedAt = null;
        return b;
      },
    ],
    [
      "无效单次修改",
      (b) => {
        b.data.taskOccurrences[0].overrides = {
          startTime: "23:00",
          endTime: "01:00",
        };
        return b;
      },
    ],
    [
      "孤立目标关联",
      (b) => {
        b.data.goalTaskRelations.push({
          id: crypto.randomUUID(),
          profileId,
          taskId: b.data.tasks[0].id,
          goalId: crypto.randomUUID(),
        });
        return b;
      },
    ],
    ["错误当前档案", (b) => ({ ...b, activeProfileId: crypto.randomUUID() })],
    [
      "缺少时间段",
      (b) => {
        b.data.timeSlots.pop();
        return b;
      },
    ],
  ];
  it.each(invalidCases)("拒绝%s且保留原始数据", async (_label, mutate) => {
    const before = await archive.exportBackup();
    const invalid = mutate(structuredClone(before));
    expect(() => validateBackup(invalid)).toThrow();
    await expect(archive.restoreBackup(invalid as Backup)).rejects.toThrow();
    expect((await archive.exportBackup()).data).toEqual(before.data);
  });
  it("拒绝跨档案关联", async () => {
    const other = await archive.createProfile("另一档案");
    const backup = await archive.exportBackup();
    backup.data.taskOccurrences[0].profileId = other.id;
    expect(() => validateBackup(backup)).toThrow("跨越档案");
  });
  it("拒绝损坏 JSON、非对象和超大文件", () => {
    expect(() => parseBackup("{broken")).toThrow("JSON");
    expect(() => parseBackup("null")).toThrow("格式");
    expect(() => parseBackup(" ".repeat(20 * 1024 * 1024 + 1))).toThrow(
      "20 MB",
    );
  });
});
