import { useState, type FormEvent } from "react";
import type { Semester } from "@/types/course";
import type { ScheduleCommand } from "@/application/schedule-service";
import { Dialog } from "@/components/ui/dialog";

export function SemesterDialog({
  semester,
  onSave,
  onClose,
}: {
  semester: Semester;
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState({
    startDate: semester.startDate,
    endDate: semester.endDate,
    teachingWeeks: semester.teachingWeeks,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSave({ type: "save-semester", settings });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="学期设置" onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm leading-6 text-slate-500">
          开学日期所在自然周为教学第 1
          周，开学前和结束日之后不排重复课程。教学周仅用于课程重复范围，主页始终显示自然周。
        </p>
        <label className="field-label">
          学期开始日期
          <input
            required
            type="date"
            value={settings.startDate}
            onChange={(event) =>
              setSettings({ ...settings, startDate: event.target.value })
            }
          />
        </label>
        <label className="field-label">
          学期结束日期
          <input
            required
            type="date"
            value={settings.endDate}
            onChange={(event) =>
              setSettings({ ...settings, endDate: event.target.value })
            }
          />
        </label>
        <label className="field-label">
          教学周数
          <input
            required
            type="number"
            min={1}
            step={1}
            value={settings.teachingWeeks}
            onChange={(event) =>
              setSettings({
                ...settings,
                teachingWeeks: Number(event.target.value),
              })
            }
          />
        </label>
        <p className="text-xs leading-6 text-slate-500">
          修改设置会重新计算重复课程的显示范围，不删除已有课程；仅本周课程按具体日期显示，不受学期范围限制。
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary-button">
          {busy ? "保存中…" : "保存学期"}
        </button>
      </form>
    </Dialog>
  );
}
