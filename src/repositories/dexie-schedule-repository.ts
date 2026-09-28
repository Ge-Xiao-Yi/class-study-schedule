import type { ScheduleRepository } from "./schedule-repository";
import type { ScheduleSnapshot } from "../types/course";
import type { ProfileData } from "../types/archive";
import { DexieArchiveRepository } from "./dexie-archive-repository";

function snapshot(data: ProfileData): ScheduleSnapshot {
  const semester = data.semesters.find(
    (r) => r.id === data.appSettings[0]?.activeSemesterId,
  );
  if (!semester) throw new Error("当前学期不存在。");
  const courses = data.courses.filter((r) => r.semesterId === semester.id);
  const courseIds = new Set(courses.map((r) => r.id));
  return {
    goals: data.goals,
    goalTaskRelations: data.goalTaskRelations,
    timeSlots: data.timeSlots,
    semester,
    courses,
    exceptions: data.courseExceptions.filter((r) => courseIds.has(r.courseId)),
    tasks: data.tasks,
    taskOccurrences: data.taskOccurrences,
  };
}

/** A session is pinned to one profile and restore epoch; it can be revoked on switch. */
export class DexieScheduleRepository implements ScheduleRepository {
  private active = true;
  constructor(
    private readonly archive: DexieArchiveRepository,
    private readonly profileId: string,
    private readonly epoch: string,
  ) {}
  revoke() {
    this.active = false;
  }
  private async check(id: string) {
    if (!this.active || id !== this.profileId)
      throw new Error("档案已切换，请重新打开编辑窗口。");
    const meta = await this.archive.db.metadata.get("workspace");
    if (meta?.epoch !== this.epoch)
      throw new Error("本地数据已恢复或档案已删除，请重新加载数据。");
    if (!this.active) throw new Error("档案已切换。");
  }
  async read(id: string) {
    return this.archive.db.transaction(
      "r",
      this.archive.db.tables,
      async () => {
        await this.check(id);
        const data = await this.archive.readProfile(id);
        await this.check(id);
        return snapshot(data);
      },
    );
  }
  async transact(
    id: string,
    update: (current: ScheduleSnapshot) => ScheduleSnapshot,
  ) {
    return this.archive.db.transaction(
      "rw",
      this.archive.db.tables,
      async () => {
        await this.check(id);
        const data = await this.archive.updateProfile(id, (current) => {
          if (!this.active) throw new Error("档案已切换。");
          const before = snapshot(current);
          const next = update(structuredClone(before));
          if (next.semester.id !== before.semester.id)
            throw new Error("不能替换当前学期身份。");
          const otherCourses = current.courses.filter(
            (r) => r.semesterId !== before.semester.id,
          );
          const otherIds = new Set(otherCourses.map((r) => r.id));
          const taskIds = new Set(next.tasks.map((r) => r.id));
          return {
            ...current,
            timeSlots: next.timeSlots ?? current.timeSlots,
            semesters: current.semesters.map((r) =>
              r.id === next.semester.id ? next.semester : r,
            ),
            courses: [...otherCourses, ...next.courses],
            courseExceptions: [
              ...current.courseExceptions.filter((r) =>
                otherIds.has(r.courseId),
              ),
              ...next.exceptions,
            ],
            tasks: next.tasks,
            taskOccurrences: next.taskOccurrences,
            goals: next.goals ?? current.goals,
            goalTaskRelations: (
              next.goalTaskRelations ?? current.goalTaskRelations
            ).filter((r) => taskIds.has(r.taskId)),
          };
        });
        await this.check(id);
        return snapshot(data);
      },
    );
  }
}
