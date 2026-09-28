import type { ScheduleSnapshot } from "../types/course";
import type { ScheduleRepository } from "./schedule-repository";

export class MemoryScheduleRepository implements ScheduleRepository {
  private readonly profiles = new Map<string, ScheduleSnapshot>();

  constructor(seeds: ScheduleSnapshot[]) {
    for (const seed of seeds)
      this.profiles.set(seed.semester.profileId, structuredClone(seed));
  }

  private get(profileId: string): ScheduleSnapshot {
    const value = this.profiles.get(profileId);
    if (!value) throw new Error("找不到当前档案。");
    return structuredClone(value);
  }

  async read(profileId: string): Promise<ScheduleSnapshot> {
    return this.get(profileId);
  }

  async transact(
    profileId: string,
    update: (current: ScheduleSnapshot) => ScheduleSnapshot,
  ): Promise<ScheduleSnapshot> {
    // No await between read and commit: memory writes are atomic and serialized.
    const next = update(this.get(profileId));
    if (
      next.semester.profileId !== profileId ||
      next.goals?.some((g) => g.profileId !== profileId) ||
      next.goalTaskRelations?.some(
        (r) =>
          r.profileId !== profileId ||
          !next.goals?.some((g) => g.id === r.goalId) ||
          !next.tasks.some((t) => t.id === r.taskId),
      ) ||
      next.timeSlots?.some((slot) => slot.profileId !== profileId) ||
      next.courses.some((course) => course.profileId !== profileId) ||
      next.exceptions.some((exception) => exception.profileId !== profileId) ||
      next.tasks.some((task) => task.profileId !== profileId) ||
      next.taskOccurrences.some(
        (item) =>
          item.profileId !== profileId ||
          !next.tasks.some((task) => task.id === item.taskId),
      )
    )
      throw new Error("不能写入其他档案的数据。");
    const keys = next.taskOccurrences.map(
      (item) => `${item.taskId}:${item.occurrenceDate}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new Error("同一任务日期不能重复保存实例。");
    this.profiles.set(profileId, structuredClone(next));
    return structuredClone(next);
  }
}
