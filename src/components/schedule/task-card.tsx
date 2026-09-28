import { useState } from "react";
import type { TaskStatus, TaskView } from "@/types/task";
import { taskRepeatLabels, taskStatuses } from "@/domain/tasks";

export function TaskCard({
  task,
  today,
  editing,
  onEdit,
  onStatus,
}: {
  task: TaskView;
  today: string;
  editing: boolean;
  onEdit: () => void;
  onStatus: (status: TaskStatus) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [pendingChecked, setPendingChecked] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const done = task.status === "done";
  async function toggle(checked: boolean) {
    setPendingChecked(checked);
    setBusy(true);
    setError("");
    try {
      await onStatus(checked ? "done" : "todo");
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新失败，请重试。");
    } finally {
      setPendingChecked(null);
      setBusy(false);
    }
  }
  const { fields } = task;
  return (
    <article
      aria-label={`任务：${fields.name} · ${task.date}`}
      data-task-id={task.taskId}
      data-task-date={task.originalDate}
      className="schedule-card border-slate-200 bg-white text-slate-600"
    >
      <label className="mb-2 flex min-h-9 cursor-pointer items-center gap-2 text-[11px] leading-5 text-slate-600">
        <input
          className="size-4 shrink-0 accent-teal-600"
          type="checkbox"
          disabled={busy}
          checked={pendingChecked ?? done}
          aria-label={`完成任务：${fields.name}（${task.originalDate}）`}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {busy ? "正在保存…" : taskStatuses[task.status]} ·{" "}
        {taskRepeatLabels[task.repeatType]}
      </label>
      <button
        type="button"
        disabled={!editing || busy}
        className="w-full text-left disabled:cursor-default"
        onClick={onEdit}
        aria-label={`编辑任务：${fields.name}（${task.originalDate}）`}
      >
        <h3
          className={`text-sm font-semibold leading-6 ${done ? "text-slate-400 line-through" : "text-slate-700"}`}
        >
          {fields.name}
        </h3>
        <p className="mt-2 text-xs tabular-nums">
          {fields.startTime && fields.endTime
            ? `${fields.startTime}–${fields.endTime}`
            : fields.startTime
              ? `开始 ${fields.startTime}`
              : fields.endTime
                ? `结束 ${fields.endTime}`
                : "未设具体时间"}
        </p>
        {fields.estimatedMinutes !== null && (
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            预计 {fields.estimatedMinutes} 分钟
          </p>
        )}
        {fields.dueDate && (
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            截止 {fields.dueDate}
          </p>
        )}
      </button>
      {!done &&
        ((fields.dueDate && fields.dueDate < today) || task.date < today) && (
          <p className="mt-2 text-[10px] leading-5 text-amber-700">
            {fields.dueDate && fields.dueDate < today
              ? "已过截止日期"
              : "过去未完成"}
          </p>
        )}
      {error && (
        <p role="alert" className="mt-2 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
