import type { Backup, Profile, ProfileData } from "../types/archive";

/** UI/application port. No Dexie or browser storage types escape this boundary. */
export interface ArchiveRepository {
  initialize(): Promise<string>;
  profiles(): Promise<Profile[]>;
  selectProfile(id: string): Promise<void>;
  createProfile(name: string): Promise<Profile>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<string>;
  readProfile(id: string): Promise<ProfileData>;
  updateProfile(
    id: string,
    update: (data: ProfileData) => ProfileData,
  ): Promise<ProfileData>;
  exportBackup(): Promise<Backup>;
  restoreBackup(backup: Backup): Promise<void>;
}
