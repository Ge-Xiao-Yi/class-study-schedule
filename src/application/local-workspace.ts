import { ScheduleService } from "./schedule-service";
import type { ScheduleSnapshot } from "../types/course";
import type { ArchiveRepository } from "../repositories/archive-repository";

export interface LocalSession {
  profileId: string;
  service: ScheduleService;
  snapshot: ScheduleSnapshot;
  today: string;
}
export interface LocalWorkspace {
  archive: ArchiveRepository;
  openProfile(id: string): Promise<LocalSession>;
  close(): void;
}
