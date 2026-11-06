import type { TaskDraft, TaskStatus } from "@/types/task";
import {
  normalizeTaskFields,
  taskRepeatLabels,
  taskStatuses,
} from "@/domain/tasks";
import { courseColors, timePeriods } from "@/domain/courses";
import { getTimePeriods } from "@/domain/time-slots";
import type { TimeSlot } from "@/types/archive";

export function TaskFieldsForm({
  draft,
  setDraft,
  status,
  setStatus,
  showRepeat,
  statusDisabled = false,
  timeSlots,
}: {
  draft: TaskDraft;
  setDraft: (draft: TaskDraft) => void;
  status: TaskStatus;
  setStatus: (status: TaskStatus) => void;
  showRepeat: boolean;
  statusDisabled?: boolean;
  timeSlots?: TimeSlot[];
}) {
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft({ ...draft, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="field-label sm:col-span-2">
        任务名称
        <input
          autoFocus
          required
          maxLength={80}
          value={draft.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </label>
      <label className="field-label">
        任务颜色
        <select
          value={draft.color ?? ""}
          onChange={(event) =>
            update("color", (event.target.value || null) as TaskDraft["color"])
          }
        >
          <option value="">默认（白色）</option>
          {Object.entries(courseColors).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        任务日期
        <input
          required
          type="date"
          value={draft.startDate}
          onChange={(event) => update("startDate", event.target.value)}
        />
      </label>
      <label className="field-label">
        所属时间段
        <select
          aria-label="所属时间段"
          value={normalizeTaskFields(draft, timeSlots).period}
          disabled={
            !!draft.startTime &&
            getTimePeriods(timeSlots).some(
              (period) =>
                draft.startTime! >= period.start &&
                draft.startTime! < period.end,
            )
          }
          onChange={(event) =>
            update("period", event.target.value as TaskDraft["period"])
          }
        >
          {timePeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        开始时间（可选）
        <input
          type="time"
          value={draft.startTime ?? ""}
          onChange={(event) => {
            const next = { ...draft, startTime: event.target.value || null };
            setDraft({
              ...next,
              period: normalizeTaskFields(next, timeSlots).period,
            });
          }}
        />
      </label>
      <label className="field-label">
        结束时间（可选）
        <input
          type="time"
          value={draft.endTime ?? ""}
          onChange={(event) => update("endTime", event.target.value || null)}
        />
      </label>
      <label className="field-label">
        预计耗时（分钟，可选）
        <input
          type="number"
          min={1}
          step={1}
          value={draft.estimatedMinutes ?? ""}
          onChange={(event) =>
            update(
              "estimatedMinutes",
              event.target.value ? Number(event.target.value) : null,
            )
          }
        />
      </label>
      <label className="field-label">
        截止日期（可选）
        <input
          type="date"
          value={draft.dueDate ?? ""}
          onChange={(event) => update("dueDate", event.target.value || null)}
        />
      </label>
      {showRepeat && (
        <>
          <label className="field-label">
            任务重复规则
            <select
              aria-label="任务重复规则"
              value={draft.repeatType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  repeatType: event.target.value as TaskDraft["repeatType"],
                  repeatUntil:
                    event.target.value === "none" ? null : draft.repeatUntil,
                })
              }
            >
              {Object.entries(taskRepeatLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {draft.repeatType !== "none" && (
            <label className="field-label">
              重复截止日期（可选）
              <input
                type="date"
                value={draft.repeatUntil ?? ""}
                onChange={(event) =>
                  update("repeatUntil", event.target.value || null)
                }
              />
            </label>
          )}
        </>
      )}
      <label className="field-label">
        本次任务状态
        <select
          aria-label="本次任务状态"
          disabled={statusDisabled}
          value={status}
          onChange={(event) => setStatus(event.target.value as TaskStatus)}
        >
          {Object.entries(taskStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
