import { validateTimeSlots } from "./time-slots";
import { z } from "zod";
import type { ArchiveData, Backup } from "../types/archive";
import { parseDate } from "./dates";
import { validateCourse, validateFields, validateSemester } from "./courses";
import { validateTask, validateTaskFields } from "./tasks";

const id = z.uuid();
const timestamp = z.iso.datetime();
const date = z.string().refine((value) => {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}, "无效日期");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const name = z.string().trim().min(1).max(80);
const owned = { id, profileId: id };
const stamps = { createdAt: timestamp, updatedAt: timestamp };
const courseFields = z.strictObject({
  name,
  location: z.string().max(100),
  teacher: z.string().max(100),
  sectionText: z.string().max(100),
  weekday: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  startTime: time,
  endTime: time,
  color: z.enum(["blue", "green", "purple", "orange", "pink"]),
});
const taskFields = z.strictObject({
  name,
  color: courseFields.shape.color.nullable().optional(),
  startDate: date,
  period: z.enum(["morning", "afternoon", "evening"]),
  startTime: time.nullable(),
  endTime: time.nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  dueDate: date.nullable(),
});
const schema = z.strictObject({
  profiles: z
    .array(z.strictObject({ id, name: name.max(40), ...stamps }))
    .min(1),
  semesters: z.array(
    z.strictObject({
      ...owned,
      startDate: date,
      endDate: date,
      teachingWeeks: z.number().int().positive(),
    }),
  ),
  timeSlots: z.array(
    z.strictObject({
      ...owned,
      period: taskFields.shape.period,
      startTime: time,
      endTime: z.union([time, z.literal("24:00")]),
    }),
  ),
  courses: z.array(
    z.strictObject({
      ...owned,
      ...courseFields.shape,
      semesterId: id,
      repeatType: z.enum(["weekly", "once"]),
      startWeek: z.number().int().positive(),
      endWeek: z.number().int().positive(),
      occurrenceDate: date.nullable(),
      ...stamps,
    }),
  ),
  courseExceptions: z.array(
    z.strictObject({
      ...owned,
      courseId: id,
      originalDate: date,
      action: z.enum(["modify", "cancel"]),
      overrides: courseFields.partial(),
      createdAt: timestamp,
    }),
  ),
  tasks: z.array(
    z.strictObject({
      ...owned,
      ...taskFields.shape,
      repeatType: z.enum(["none", "daily", "weekly"]),
      repeatUntil: date.nullable(),
      goalId: id.nullable(),
      ...stamps,
    }),
  ),
  taskOccurrences: z.array(
    z.strictObject({
      ...owned,
      taskId: id,
      occurrenceDate: date,
      status: z.enum(["todo", "in_progress", "done"]),
      completedAt: timestamp.nullable(),
      overrides: taskFields
        .partial()
        .extend({ deleted: z.boolean().optional() })
        .nullable(),
    }),
  ),
  goals: z.array(
    z.strictObject({
      ...owned,
      name,
      description: z.string().max(10000),
      startDate: date,
      progressMode: z.enum(["manual", "automatic"]),
      manualProgress: z.number().min(0).max(100),
      ...stamps,
    }),
  ),
  goalTaskRelations: z.array(
    z.strictObject({ ...owned, goalId: id, taskId: id }),
  ),
  appSettings: z.array(z.strictObject({ ...owned, activeSemesterId: id })),
});
const backupSchema = z.strictObject({
  format: z.literal("study-week-backup"),
  formatVersion: z.literal(1),
  databaseVersion: z.literal(1),
  exportedAt: timestamp,
  activeProfileId: id,
  data: schema,
});

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function unique<T>(rows: T[], key: (row: T) => string, label: string) {
  assert(new Set(rows.map(key)).size === rows.length, `${label}含重复记录。`);
}

/** Validates historical overrides too, without demanding they match today's repeat rule. */
export function validateArchive(input: unknown): ArchiveData {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `数据结构无效：${result.error.issues[0]?.path.join(".")}。`,
    );
  const data = result.data;
  const profiles = new Set(data.profiles.map((p) => p.id));
  for (const [table, rows] of Object.entries(data)) {
    unique<{ id: string }>(rows, (row) => row.id, table);
    if (table !== "profiles")
      for (const row of rows)
        assert(
          "profileId" in row && profiles.has(row.profileId),
          "记录所属档案不存在。",
        );
  }
  const semesters = new Map(data.semesters.map((r) => [r.id, r]));
  const courses = new Map(data.courses.map((r) => [r.id, r]));
  const tasks = new Map(data.tasks.map((r) => [r.id, r]));
  const goals = new Map(data.goals.map((r) => [r.id, r]));
  const link = (parent: { profileId: string } | undefined, profileId: string) =>
    assert(
      parent && parent.profileId === profileId,
      "关联记录缺失或跨越档案。",
    );
  for (const semester of data.semesters) validateSemester(semester);
  unique(data.appSettings, (r) => r.profileId, "档案设置");
  unique(data.timeSlots, (r) => `${r.profileId}:${r.period}`, "时间段");
  for (const profile of data.profiles) {
    assert(
      data.appSettings.some((r) => r.profileId === profile.id),
      "档案缺少设置。",
    );
    assert(
      data.timeSlots.filter((r) => r.profileId === profile.id).length === 3,
      "档案需要三个时间段。",
    );
  }
  for (const setting of data.appSettings)
    link(semesters.get(setting.activeSemesterId), setting.profileId);
  for (const profile of data.profiles)
    validateTimeSlots(
      data.timeSlots.filter((slot) => slot.profileId === profile.id),
    );
  for (const course of data.courses) {
    const semester = semesters.get(course.semesterId);
    link(semester, course.profileId);
    // Shortening a semester intentionally preserves dormant template ranges.
    validateCourse(course, {
      ...semester!,
      teachingWeeks: Math.max(semester!.teachingWeeks, course.endWeek),
    });
  }
  unique(
    data.courseExceptions,
    (r) => `${r.profileId}:${r.courseId}:${r.originalDate}`,
    "课程例外",
  );
  for (const item of data.courseExceptions) {
    const course = courses.get(item.courseId);
    link(course, item.profileId);
    validateFields({ ...course!, ...item.overrides });
    if (item.action === "cancel")
      assert(
        Object.keys(item.overrides).length === 0,
        "取消课程不能同时修改字段。",
      );
  }
  for (const task of data.tasks) {
    validateTask(task);
    if (task.goalId) {
      link(goals.get(task.goalId), task.profileId);
      assert(
        data.goalTaskRelations.some(
          (r) => r.taskId === task.id && r.goalId === task.goalId,
        ),
        "任务目标缺少对应关联记录。",
      );
    }
  }
  unique(
    data.taskOccurrences,
    (r) => `${r.profileId}:${r.taskId}:${r.occurrenceDate}`,
    "任务实例",
  );
  for (const item of data.taskOccurrences) {
    const task = tasks.get(item.taskId);
    link(task, item.profileId);
    assert(
      (item.status === "done") === (item.completedAt !== null),
      "任务状态与完成时间不一致。",
    );
    validateTaskFields({
      ...task!,
      startDate: item.occurrenceDate,
      ...item.overrides,
    });
  }
  unique(
    data.goalTaskRelations,
    (r) => `${r.profileId}:${r.goalId}:${r.taskId}`,
    "目标关联",
  );
  for (const relation of data.goalTaskRelations) {
    link(goals.get(relation.goalId), relation.profileId);
    link(tasks.get(relation.taskId), relation.profileId);
  }
  return data;
}

export function validateBackup(input: unknown): Backup {
  const result = backupSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      "备份格式、版本或字段无效，仅支持 study-week-backup 格式版本 1 / 数据库版本 1。",
    );
  const backup = result.data;
  backup.data = validateArchive(backup.data);
  assert(
    backup.data.profiles.some((r) => r.id === backup.activeProfileId),
    "备份的当前档案不存在。",
  );
  return backup;
}
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error("备份文件不能超过 20 MB。");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }
  return validateBackup(value);
}
