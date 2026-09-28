"use client";

import { useState } from "react";
import type { ArchiveRepository } from "@/repositories/archive-repository";
import type { Backup } from "@/types/archive";
import { MAX_BACKUP_BYTES, parseBackup } from "@/domain/backup";
import { Dialog } from "@/components/ui/dialog";

export function BackupDialog({
  archive,
  onClose,
  onRestored,
}: {
  archive: ArchiveRepository;
  onClose: () => void;
  onRestored: (id: string) => Promise<void>;
}) {
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function exportFile() {
    setBusy(true);
    setError("");
    try {
      const backup = await archive.exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `study-week-${backup.exportedAt.replaceAll(":", "-")}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("已生成所有档案的完整 JSON，请确认文件已下载并妥善保存。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败。");
    } finally {
      setBusy(false);
    }
  }
  async function inspect(file?: File) {
    setCandidate(null);
    setConfirm(false);
    setAcknowledged(false);
    setError("");
    setNotice("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("备份文件不能超过 20 MB。");
      setCandidate(parseBackup(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "备份验证失败。");
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!candidate || !confirm || !acknowledged) return;
    setBusy(true);
    setError("");
    try {
      await archive.restoreBackup(candidate);
    } catch (e) {
      setError(
        `恢复失败，原数据未更改。${e instanceof Error ? e.message : "请检查浏览器存储权限和剩余空间。"}`,
      );
      setBusy(false);
      return;
    }
    await onRestored(candidate.activeProfileId);
  }
  return (
    <Dialog
      title={confirm ? "确认覆盖所有本地档案" : "JSON 备份与恢复"}
      busy={busy}
      onClose={onClose}
    >
      <div className="space-y-4 text-sm">
        <p className="leading-6">
          导出包含所有档案、学期、时间段、课程与例外、任务与单次状态、目标、关联和设置。备份为明文，不含密码保护。
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void exportFile()}
        >
          导出全部 JSON 备份
        </button>
        {!confirm && (
          <label className="field-label">
            选择 JSON 恢复文件
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => void inspect(event.target.files?.[0])}
              className="max-w-full"
            />
          </label>
        )}
        {candidate && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 leading-6">
            <p>
              文件校验通过：{candidate.data.profiles.length} 个档案、
              {candidate.data.courses.length} 个课程模板、
              {candidate.data.tasks.length} 个任务模板、
              {candidate.data.taskOccurrences.length} 条任务状态。
            </p>
            <p className="break-words">
              档案：{candidate.data.profiles.map((p) => p.name).join("、")}
            </p>
            <p className="mt-2 font-medium">
              将覆盖当前浏览器此站点的全部档案，不是合并。请先导出备份；覆盖后无法撤销。
            </p>
          </div>
        )}
        {candidate && !confirm && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            继续恢复，查看最终确认
          </button>
        )}
        {confirm && (
          <>
            <label className="flex items-start gap-2 leading-6">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              我已备份或确认无需保留现有数据，理解将覆盖所有档案。
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                  setAcknowledged(false);
                }}
              >
                返回检查
              </button>
              <button
                className="danger-button"
                disabled={busy || !acknowledged}
                onClick={() => void restore()}
              >
                确认覆盖恢复
              </button>
            </div>
          </>
        )}
        {notice && (
          <p role="status" className="text-sky-700">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
