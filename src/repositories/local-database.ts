import Dexie, { type Table } from "dexie";
import type { ArchiveData, OwnedTable } from "../types/archive";

export const DATABASE_VERSION = 1;
export const ownedTables: OwnedTable[] = [
  "semesters",
  "timeSlots",
  "courses",
  "courseExceptions",
  "tasks",
  "taskOccurrences",
  "goals",
  "goalTaskRelations",
  "appSettings",
];
export interface DatabaseMeta {
  key: "workspace";
  activeProfileId: string;
  epoch: string;
}

export class LocalDatabase extends Dexie {
  constructor(name = "study-week-local") {
    super(name);
    this.version(DATABASE_VERSION).stores({
      profiles: "id",
      semesters: "id, profileId",
      timeSlots: "id, profileId, &[profileId+period]",
      courses: "id, profileId, [profileId+semesterId]",
      courseExceptions: "id, profileId, &[profileId+courseId+originalDate]",
      tasks: "id, profileId",
      taskOccurrences: "id, profileId, &[profileId+taskId+occurrenceDate]",
      goals: "id, profileId",
      goalTaskRelations: "id, profileId, &[profileId+goalId+taskId]",
      appSettings: "id, &profileId",
      metadata: "key",
    });
    // Do not block upgrades from another tab. A closed connection surfaces a
    // recoverable load/save error; never replace it with an empty database.
    this.on("versionchange", () => this.close());
  }
  records<K extends keyof ArchiveData>(
    name: K,
  ): Table<ArchiveData[K][number], string> {
    return this.table(name);
  }
  get metadata(): Table<DatabaseMeta, string> {
    return this.table("metadata");
  }
}
