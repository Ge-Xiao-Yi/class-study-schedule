"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  LocalSession,
  LocalWorkspace,
} from "@/application/local-workspace";
import type { Profile } from "@/types/archive";
import type { ArchiveRepository } from "@/repositories/archive-repository";
import { createLocalWorkspace } from "@/lib/create-local-workspace";
import { Dialog } from "@/components/ui/dialog";
import { BackupDialog } from "./backup-dialog";

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "本地存储操作失败，请检查浏览器存储权限和剩余空间。";

export function PersistentWorkspace({
  render,
}: {
  render: (
    session: LocalSession,
    onSavingChange: (saving: boolean) => void,
    editing: boolean,
    onToggleEditing: () => void,
  ) => ReactNode;
}) {
  const workspace = useRef<LocalWorkspace | null>(null);
  const [archive, setArchive] = useState<ArchiveRepository | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [editing, setEditing] = useState(true);
  const [mode, setMode] = useState<
    "create" | "rename" | "delete" | "backup" | null
  >(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    const current = createLocalWorkspace();
    workspace.current = current;
    async function load() {
      try {
        const id = await current.archive.initialize();
        if (!active) return;
        const next = await current.openProfile(id);
        const list = await current.archive.profiles();
        if (active) {
          setArchive(current.archive);
          setSession(next);
          setProfiles(list);
          setError("");
        }
      } catch (e) {
        if (active) {
          setArchive(current.archive);
          setError(message(e));
        }
      }
    }
    void load();
    return () => {
      active = false;
      current.close();
    };
  }, [attempt]);

  async function switchProfile(id: string) {
    setBusy(true);
    setSession(null); // Unmount forms, date selection, and pending UI state.
    try {
      const current = workspace.current!;
      const next = await current.openProfile(id);
      setProfiles(await current.archive.profiles());
      setSession(next);
      setGeneration((value) => value + 1);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function open(mode: "create" | "rename" | "delete" | "backup") {
    setMode(mode);
    setFormError("");
    setName(profiles.find((p) => p.id === session?.profileId)?.name ?? "");
    if (mode === "create") setName("");
  }
  async function submitProfile() {
    setBusy(true);
    setFormError("");
    try {
      const archive = workspace.current!.archive;
      let id = session!.profileId;
      if (mode === "create") id = (await archive.createProfile(name)).id;
      if (mode === "rename") await archive.renameProfile(id, name);
      if (mode === "delete") id = await archive.deleteProfile(id);
      setMode(null);
      await switchProfile(id);
    } catch (e) {
      setFormError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || saving > 0;
  return (
    <>
      <section
        aria-label="本地档案与备份"
        className="rounded-2xl border border-sky-100 bg-white p-4"
      >
        <fieldset
          disabled={locked || !session || !editing}
          className="flex min-w-0 flex-wrap items-end gap-3"
        >
          <label className="field-label w-full min-w-0 sm:w-auto sm:flex-1">
            当前本地档案
            <select
              className="w-full"
              value={session?.profileId ?? ""}
              onChange={(event) => void switchProfile(event.target.value)}
            >
              {!session && <option value="">正在加载…</option>}
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" onClick={() => open("create")}>
            新建档案
          </button>
          <button className="secondary-button" onClick={() => open("rename")}>
            重命名档案
          </button>
          <button
            className="secondary-button"
            disabled={profiles.length < 2}
            onClick={() => open("delete")}
          >
            删除档案
          </button>
          <button className="secondary-button" onClick={() => open("backup")}>
            备份与恢复
          </button>
          <button
            className="secondary-button"
            onClick={() => void switchProfile(session!.profileId)}
          >
            重新加载数据
          </button>
        </fieldset>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          本地档案用于区分学习安排，不是安全账号。使用此浏览器的人可访问全部档案。JSON
          备份包含所有档案。
        </p>
        <p role="status" className="mt-2 text-xs text-sky-700">
          {saving
            ? "正在保存，请稍候…"
            : session
              ? "本地数据已就绪 · 每次修改自动保存"
              : error
                ? "本地数据未载入"
                : "正在打开本地数据库…"}
        </p>
      </section>
      {error && (
        <div role="alert" className="rounded-xl bg-white p-4">
          <p>{error}</p>
          <button
            className="secondary-button mt-3"
            disabled={locked}
            onClick={() => {
              setSession(null);
              setAttempt((value) => value + 1);
            }}
          >
            重试加载
          </button>
          <p className="mt-2 text-xs">未切换到临时内存，也未清除原数据。</p>
          {archive && (
            <button
              className="secondary-button mt-3"
              disabled={locked}
              onClick={() => open("backup")}
            >
              从 JSON 恢复
            </button>
          )}
        </div>
      )}
      {session && (
        <div key={`${session.profileId}:${generation}`} className="space-y-6">
          {render(
            session,
            (value) =>
              setSaving((count) => Math.max(0, count + (value ? 1 : -1))),
            editing,
            () => setEditing((value) => !value),
          )}
        </div>
      )}
      {mode && mode !== "backup" && (
        <Dialog
          title={
            mode === "create"
              ? "新建本地档案"
              : mode === "rename"
                ? "重命名本地档案"
                : "删除本地档案"
          }
          busy={busy}
          onClose={() => setMode(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitProfile();
            }}
            className="space-y-4"
          >
            {mode === "delete" ? (
              <p className="text-sm leading-6">
                确定删除「{name}
                」及其全部课程、任务、状态、目标和设置？无法撤销，建议先关闭弹窗并导出备份。其他档案会保留。
              </p>
            ) : (
              <label className="field-label">
                档案名称
                <input
                  required
                  maxLength={40}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            {mode === "create" && (
              <p className="text-xs text-slate-500">
                新档案使用空课表，不复制其他档案的数据。
              </p>
            )}
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={mode === "delete" ? "danger-button" : "primary-button"}
            >
              {mode === "delete" ? "确认删除档案" : "保存档案"}
            </button>
          </form>
        </Dialog>
      )}
      {mode === "backup" && archive && (
        <BackupDialog
          archive={archive}
          onClose={() => setMode(null)}
          onRestored={async (id) => {
            setMode(null);
            await switchProfile(id);
          }}
        />
      )}
    </>
  );
}
