import { LocalDatabase } from "../repositories/local-database";
import { DexieArchiveRepository } from "../repositories/dexie-archive-repository";
import { DexieScheduleRepository } from "../repositories/dexie-schedule-repository";
import { ScheduleService } from "../application/schedule-service";
import type { LocalWorkspace } from "../application/local-workspace";
import { localDate } from "../domain/dates";

/** Called after hydration only; IndexedDB is never opened during server rendering. */
export function createLocalWorkspace(): LocalWorkspace {
  if (typeof window === "undefined") {
    throw new Error("本地数据库只能在浏览器客户端挂载后初始化。");
  }
  const db = new LocalDatabase();
  const archive = new DexieArchiveRepository(db);
  let repository: DexieScheduleRepository | undefined;
  let generation = 0;
  return {
    archive,
    async openProfile(profileId) {
      const opening = ++generation;
      repository?.revoke();
      await archive.selectProfile(profileId);
      const meta = (await db.metadata.get("workspace"))!;
      if (opening !== generation) throw new Error("档案加载已取消。");
      repository = new DexieScheduleRepository(archive, profileId, meta.epoch);
      const service = new ScheduleService(repository, profileId);
      const snapshot = await service.read();
      if (opening !== generation) throw new Error("档案加载已取消。");
      return {
        profileId,
        service,
        snapshot,
        today: localDate(),
      };
    },
    close() {
      generation++;
      repository?.revoke();
      db.close();
    },
  };
}
