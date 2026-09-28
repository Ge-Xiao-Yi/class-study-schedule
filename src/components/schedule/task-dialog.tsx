import { useState, type FormEvent } from "react";
import type {
  Task,
  TaskDraft,
  TaskScope,
  TaskStatus,
  TaskView,
} from "@/types/task";
import type { PeriodId } from "@/types/schedule";
import type { ScheduleCommand } from "@/application/schedule-service";
import type { TaskCommand } from "@/application/task-commands";
import { addDays, parseDate } from "@/domain/dates";
import {
  taskRepeatLabels,
  taskStatuses,
  validateTask,
  validateTaskFields,
} from "@/domain/tasks";
import { Dialog } from "@/components/ui/dialog";
import { TaskFieldsForm } from "./task-fields";
import type { TimeSlot, Goal } from "@/types/archive";

export interface TaskEditorTarget {
  template?: Task;
  view?: TaskView;
  date: string;
  period: PeriodId;
  manage?: boolean;
}

export function TaskDialog({
  target,
  timeSlots,
  goals = [],
  hasInstances = false,
  onSave,
  onClose,
}: {
  target: TaskEditorTarget;
  timeSlots?: TimeSlot[];
  goals?: Goal[];
  hasInstances?: boolean;
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { template, view } = target;
  const defaults: TaskDraft = {
    name: "",
    startDate: target.date,
    period: target.period,
    startTime: null,
    endTime: null,
    estimatedMinutes: null,
    dueDate: null,
    repeatType: "none",
    repeatUntil: null,
    goalId: null,
  };
  const [scope, setScope] = useState<TaskScope>(
    target.manage || (template?.repeatType === "none" && !hasInstances)
      ? "all"
      : "single",
  );
  const [draft, setDraft] = useState<TaskDraft>(
    template
      ? { ...template, ...(!target.manage && view ? view.fields : {}) }
      : defaults,
  );
  const [status, setStatus] = useState<TaskStatus>(view?.status ?? "todo");
  const [pending, setPending] = useState<TaskCommand | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyScope, setCopyScope] = useState<TaskScope>(
    view?.deleted ? "all" : "single",
  );
  const [copyDate, setCopyDate] = useState(addDays(target.date, 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const originalDate = view?.originalDate ?? template?.startDate ?? target.date;
  async function run(command: TaskCommand) {
    setBusy(true);
    setError("");
    try {
      await onSave(command);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (template && scope === "single") validateTaskFields(draft);
      else validateTask(draft);
      if (!template) void run({ type: "task:create", draft, status });
      else
        setPending({
          type: "task:edit",
          taskId: template.id,
          originalDate,
          scope,
          draft,
          status,
        });
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const pendingScope = pending && "scope" in pending ? pending.scope : "single";
  return (
    <Dialog
      title={
        pending
          ? "确认任务操作范围"
          : copying
            ? "复制任务"
            : template
              ? "编辑任务"
              : "新增任务"
      }
      onClose={onClose}
      busy={busy}
    >
      {pending ? (
        <div className="space-y-5">
          <p className="break-words text-sm font-semibold">
            {pending.type === "task:delete"
              ? "删除"
              : pending.type === "task:copy"
                ? "复制"
                : "修改"}
            「{template?.name}」
          </p>
          <p className="rounded-xl bg-sky-50 p-4 text-sm leading-7">
            {pendingScope === "single"
              ? `作用范围：仅这一次（原日期 ${originalDate}）。其他日期的任务与状态不变。`
              : pending.type === "task:delete"
                ? "作用范围：整个任务及全部重复安排，包括已完成记录，均会删除。"
                : pending.type === "task:copy"
                  ? "作用范围：整个重复任务的定义。创建独立的新任务，不复制原任务的单次状态或调整。"
                  : "作用范围：整个任务的定义与重复规则。保留已有单次调整和已记录实例；本次状态只影响当前实例。"}
          </p>
          {pending.type === "task:edit" && (
            <p className="text-sm leading-7">
              任务名称：{pending.draft.name}
              <br />
              {pending.scope === "all" ? "模板开始日期" : "安排日期"}：
              {pending.draft.startDate}
              <br />
              当前实例状态：{taskStatuses[pending.status]}
              <br />
              {pending.scope === "all" &&
                (template?.repeatType === "none" &&
                pending.draft.repeatType === "none"
                  ? "这是不重复任务：修改日期将移动同一个任务实例，不生成副本。"
                  : `重复规则：${taskRepeatLabels[pending.draft.repeatType]}。改变日期或重复规则后，已有实例仍保留在其记录日期。`)}
            </p>
          )}
          {pending.type === "task:copy" && (
            <p className="text-sm leading-7">
              复制目标日期：{pending.targetDate}
              。新任务状态为未开始；截止日期及重复截止日期按日期差同步平移。
              {pending.scope === "single" && "副本不重复。"}
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              autoFocus
              type="button"
              disabled={busy}
              className={
                pending.type === "task:delete"
                  ? "danger-button"
                  : "primary-button"
              }
              onClick={() => void run(pending)}
            >
              {pending.type === "task:delete"
                ? "确认删除任务"
                : pending.type === "task:copy"
                  ? "确认复制任务"
                  : "确认保存任务"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary-button"
              onClick={() => {
                setPending(null);
                setError("");
              }}
            >
              返回修改
            </button>
          </div>
        </div>
      ) : copying ? (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              parseDate(copyDate);
              setError("");
              setPending({
                type: "task:copy",
                taskId: template!.id,
                originalDate,
                scope: copyScope,
                targetDate: copyDate,
              });
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          <p className="text-sm leading-6 text-slate-500">
            复制已保存的任务，不包含表单中尚未保存的修改。
          </p>
          <label className="field-label">
            复制范围
            <select
              aria-label="复制范围"
              value={copyScope}
              onChange={(event) =>
                setCopyScope(event.target.value as TaskScope)
              }
            >
              <option value="single" disabled={view?.deleted}>
                仅这一次（副本不重复）
              </option>
              <option value="all">整个重复任务（保留规则）</option>
            </select>
          </label>
          <label className="field-label">
            复制目标日期
            <input
              required
              type="date"
              value={copyDate}
              onChange={(event) => setCopyDate(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="primary-button">下一步：确认复制范围</button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCopying(false)}
            >
              返回编辑
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {template && (template.repeatType !== "none" || hasInstances) && (
            <label className="field-label">
              编辑或删除范围
              <select
                aria-label="编辑或删除范围"
                value={scope}
                onChange={(event) => {
                  const next = event.target.value as TaskScope;
                  setScope(next);
                  setDraft(
                    next === "single" && view
                      ? { ...template, ...view.fields }
                      : template,
                  );
                  setError("");
                }}
              >
                <option value="single" disabled={view?.deleted}>
                  仅这一次
                </option>
                <option value="all">整个重复任务</option>
              </select>
            </label>
          )}
          {view?.deleted && (
            <p className="text-sm text-slate-500">
              起始实例已删除；此处管理任务定义，不恢复该实例。
            </p>
          )}
          <TaskFieldsForm
            timeSlots={timeSlots}
            draft={draft}
            setDraft={setDraft}
            status={status}
            setStatus={setStatus}
            statusDisabled={view?.deleted}
            showRepeat={!template || scope === "all"}
          />
          <label className="field-label">
            所属长期目标
            <select
              disabled={!!template && scope === "single"}
              aria-label="所属长期目标"
              value={draft.goalId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, goalId: e.target.value || null })
              }
            >
              <option value="">不关联目标</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            目标关联作用于整个任务；重复任务请选“整个重复任务”后修改。
          </p>
          <p className="text-xs leading-6 text-slate-500">
            开始时间在已设时段内时自动匹配，跨时间段只显示一次；在时段外或未填开始时间时，可手选所属时间段。截止日期用于提醒，不自动结束重复。
          </p>
          {template && (
            <p className="text-xs leading-6 text-slate-500">
              当前实例原日期：{originalDate}
              。状态始终只影响这一次。保存、删除和复制前会再次确认范围。
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} className="primary-button">
              保存任务
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary-button"
              onClick={onClose}
            >
              放弃修改
            </button>
          </div>
          {template && (
            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setCopying(true);
                  setError("");
                }}
              >
                复制任务
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setError("");
                  setPending({
                    type: "task:delete",
                    taskId: template.id,
                    originalDate,
                    scope:
                      template.repeatType === "none" && !hasInstances
                        ? "all"
                        : scope,
                  });
                }}
              >
                删除任务
              </button>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}
