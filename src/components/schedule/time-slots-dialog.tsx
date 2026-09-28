import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { TimeSlot } from "@/types/archive";
import {
  getTimePeriods,
  timePeriods,
  validateTimeSlots,
} from "@/domain/time-slots";
import type { ScheduleCommand } from "@/application/schedule-service";
export function TimeSlotsDialog({
  slots,
  onSave,
  onClose,
}: {
  slots?: TimeSlot[];
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const periods = getTimePeriods(slots);
  const [draft, setDraft] = useState(
    periods.map((period) => ({
      period: period.id,
      startTime: period.start,
      endTime: period.end,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    try {
      const next = draft;
      validateTimeSlots(next);
      setBusy(true);
      await onSave({ type: "save-time-slots", slots: next });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="时间段设置" busy={busy} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm leading-6 text-slate-500">
          分别设置三个时段的开始和结束时间，可以留空隙，无需覆盖全天；时段须按先后排列且不能重叠。结束时间支持
          24:00。时段外课程会单独列出，时段外任务保留手选时段。
        </p>
        {timePeriods.map((period, index) => (
          <div
            key={period.id}
            className="rounded-xl border border-slate-100 p-3"
          >
            <h3 className="mb-3 text-sm font-semibold">{period.label}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                {period.label}开始时间
                <input
                  required
                  type="time"
                  value={draft[index].startTime}
                  onChange={(event) =>
                    setDraft((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, startTime: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="field-label">
                {period.label}结束时间
                <input
                  required
                  type="text"
                  placeholder="HH:mm"
                  aria-label={period.label + "结束时间"}
                  value={draft[index].endTime}
                  onChange={(event) =>
                    setDraft((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, endTime: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
          </div>
        ))}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button className="primary-button" disabled={busy}>
            保存时间段
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setDraft(
                timePeriods.map((period) => ({
                  period: period.id,
                  startTime: period.start,
                  endTime: period.end,
                })),
              );
              setError("");
            }}
          >
            填入默认时间
          </button>
        </div>
      </form>
    </Dialog>
  );
}
