import type { ScheduleSnapshot } from "../types/course";

/** UI/application code depends on this port, not IndexedDB or memory.
 * transact must serialize writes per profile, commit atomically, return detached
 * snapshots and leave storage untouched when update throws.
 * Task instances are unique per (profileId, taskId, occurrenceDate), reference
 * an existing same-profile task, and must be removed with their deleted template. */
export interface ScheduleRepository {
  read(profileId: string): Promise<ScheduleSnapshot>;
  transact(
    profileId: string,
    update: (current: ScheduleSnapshot) => ScheduleSnapshot,
  ): Promise<ScheduleSnapshot>;
}
