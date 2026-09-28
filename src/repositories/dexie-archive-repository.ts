import type { ArchiveRepository } from "./archive-repository";
import type {
  ArchiveData,
  Backup,
  Profile,
  ProfileData,
} from "../types/archive";
import { LocalDatabase, ownedTables } from "./local-database";
import { validateArchive, validateBackup } from "../domain/backup";
import { createScheduleSeed } from "../lib/create-schedule-session";
import { timePeriods } from "../domain/courses";
import { localDate } from "../domain/dates";

function profileName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40)
    throw new Error("档案名称应为 1–40 个字。");
  return trimmed;
}

export class DexieArchiveRepository implements ArchiveRepository {
  constructor(
    readonly db: LocalDatabase,
    private readonly today = localDate(),
  ) {}
  async initialize(): Promise<string> {
    return this.db.transaction("rw", this.db.tables, async () => {
      const meta = await this.db.metadata.get("workspace");
      if (meta) {
        if (!(await this.db.records("profiles").get(meta.activeProfileId)))
          throw new Error("当前档案缺失，请恢复有效备份。");
        return meta.activeProfileId;
      }
      if (
        (await Promise.all(this.db.tables.map((table) => table.count()))).some(
          (count) => count > 0,
        )
      )
        throw new Error("档案元数据缺失，已停止初始化以保护原数据。");
      const profile = await this.insertProfile("我的学习档案", true);
      await this.db.metadata.add({
        key: "workspace",
        activeProfileId: profile.id,
        epoch: crypto.randomUUID(),
      });
      return profile.id;
    });
  }
  profiles() {
    return this.db.records("profiles").toArray();
  }
  async selectProfile(id: string) {
    await this.db.transaction("rw", this.db.tables, async () => {
      await this.requireProfile(id);
      await this.db.metadata.update("workspace", { activeProfileId: id });
    });
  }
  async createProfile(name: string) {
    return this.db.transaction("rw", this.db.tables, () =>
      this.insertProfile(name, false),
    );
  }
  private async insertProfile(name: string, demo: boolean) {
    const now = new Date().toISOString();
    const profile: Profile = {
      id: crypto.randomUUID(),
      name: profileName(name),
      createdAt: now,
      updatedAt: now,
    };
    const seed = createScheduleSeed(profile.id, this.today, demo);
    const data: ProfileData = {
      semesters: [seed.semester],
      courses: seed.courses,
      courseExceptions: seed.exceptions,
      tasks: seed.tasks,
      taskOccurrences: seed.taskOccurrences,
      goals: [],
      goalTaskRelations: [],
      timeSlots: timePeriods.map((period) => ({
        id: crypto.randomUUID(),
        profileId: profile.id,
        period: period.id,
        startTime: period.start,
        endTime: period.end,
      })),
      appSettings: [
        {
          id: crypto.randomUUID(),
          profileId: profile.id,
          activeSemesterId: seed.semester.id,
        },
      ],
    };
    validateArchive({ profiles: [profile], ...data });
    await this.db.records("profiles").add(profile);
    await this.replaceOwned(profile.id, data);
    return profile;
  }
  async renameProfile(id: string, name: string) {
    await this.db.transaction("rw", this.db.records("profiles"), async () => {
      await this.requireProfile(id);
      await this.db.records("profiles").update(id, {
        name: profileName(name),
        updatedAt: new Date().toISOString(),
      });
    });
  }
  async deleteProfile(id: string) {
    return this.db.transaction("rw", this.db.tables, async () => {
      await this.requireProfile(id);
      const remaining = (await this.profiles()).filter((p) => p.id !== id);
      if (!remaining.length) throw new Error("至少保留一个本地档案。");
      for (const table of ownedTables)
        await this.db.records(table).where("profileId").equals(id).delete();
      await this.db.records("profiles").delete(id);
      const meta = (await this.db.metadata.get("workspace"))!;
      const activeProfileId =
        meta.activeProfileId === id ? remaining[0].id : meta.activeProfileId;
      await this.db.metadata.put({
        ...meta,
        activeProfileId,
        epoch: crypto.randomUUID(),
      });
      return activeProfileId;
    });
  }
  private async requireProfile(id: string) {
    const profile = await this.db.records("profiles").get(id);
    if (!profile) throw new Error("档案不存在，请重新加载。");
    return profile;
  }
  async readProfile(id: string): Promise<ProfileData> {
    return this.db.transaction("r", this.db.tables, async () => {
      const profile = await this.requireProfile(id);
      const entries = await Promise.all(
        ownedTables.map(async (table) => [
          table,
          await this.db.records(table).where("profileId").equals(id).toArray(),
        ]),
      );
      const { profiles: _profiles, ...data } = validateArchive({
        profiles: [profile],
        ...Object.fromEntries(entries),
      });
      void _profiles;
      return data;
    });
  }
  async updateProfile(id: string, update: (data: ProfileData) => ProfileData) {
    return this.db.transaction("rw", this.db.tables, async () => {
      const profile = await this.requireProfile(id);
      const next = update(await this.readProfile(id));
      const checked = validateArchive({ profiles: [profile], ...next });
      await this.replaceOwned(id, checked);
      const { profiles: _profiles, ...result } = checked;
      void _profiles;
      return result;
    });
  }
  private async replaceOwned(id: string, data: ProfileData) {
    for (const table of ownedTables) {
      const records = data[table];
      for (const record of records) {
        if (record.profileId !== id) throw new Error("禁止跨档案写入。");
        const previous = await this.db.records(table).get(record.id);
        if (previous && previous.profileId !== id)
          throw new Error("记录 ID 已属于其他档案。");
      }
      await this.db.records(table).where("profileId").equals(id).delete();
      await this.db.records(table).bulkAdd(records);
    }
  }
  async exportBackup(): Promise<Backup> {
    return this.db.transaction("r", this.db.tables, async () => {
      const entries = await Promise.all(
        (["profiles", ...ownedTables] as const).map(async (table) => [
          table,
          await this.db.records(table).toArray(),
        ]),
      );
      const meta = await this.db.metadata.get("workspace");
      return validateBackup({
        format: "study-week-backup",
        formatVersion: 1,
        databaseVersion: 1,
        exportedAt: new Date().toISOString(),
        activeProfileId: meta?.activeProfileId,
        data: Object.fromEntries(entries) as ArchiveData,
      });
    });
  }
  async restoreBackup(input: Backup) {
    // Parse/validate BEFORE opening a write transaction; validate again even if
    // a caller bypasses the UI. Never catch write failures inside this transaction.
    const backup = validateBackup(input);
    await this.db.transaction("rw", this.db.tables, async () => {
      for (const table of this.db.tables) await table.clear();
      for (const table of ["profiles", ...ownedTables] as const)
        await this.db.records(table).bulkAdd(backup.data[table]);
      await this.db.metadata.add({
        key: "workspace",
        activeProfileId: backup.activeProfileId,
        epoch: crypto.randomUUID(),
      });
    });
  }
}
