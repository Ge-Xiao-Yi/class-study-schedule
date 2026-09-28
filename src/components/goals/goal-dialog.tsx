import { useState } from "react";
import type { Goal } from "@/types/archive";
import type { ScheduleSnapshot } from "@/types/course";
import type { ScheduleCommand } from "@/application/schedule-service";
import { validateGoal, type GoalDraft } from "@/domain/goals";
import { Dialog } from "@/components/ui/dialog";

export function GoalDialog({
  goal,
  snapshot,
  today,
  onSave,
  onClose,
}: {
  goal?: Goal;
  snapshot: ScheduleSnapshot;
  today: string;
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GoalDraft>(
    goal ?? {
      name: "",
      description: "",
      startDate: today,
      progressMode: "manual",
      manualProgress: 0,
    },
  );
  const [taskIds, setTaskIds] = useState(
    snapshot.tasks
      .filter(
        (t) =>
          goal &&
          (t.goalId === goal.id ||
            snapshot.goalTaskRelations?.some(
              (r) => r.goalId === goal.id && r.taskId === t.id,
            )),
      )
      .map((t) => t.id),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  async function run(command: ScheduleCommand) {
    setBusy(true);
    setError("");
    try {
      await onSave(command);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={deleting ? "确认删除目标" : goal ? "编辑目标" : "新增目标"}
      busy={busy}
      onClose={onClose}
    >
      {deleting ? (
        <div className="space-y-4">
          <p>删除「{goal?.name}」并解除关联，任务及完成记录会保留。</p>
          <button
            className="danger-button"
            onClick={() => void run({ type: "goal:delete", id: goal!.id })}
          >
            确认删除目标
          </button>
          <button
            className="secondary-button"
            onClick={() => setDeleting(false)}
          >
            返回编辑
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              validateGoal(draft);
              void run({ type: "goal:save", id: goal?.id, draft, taskIds });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label className="field-label">
            目标名称
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field-label">
            目标描述
            <textarea
              maxLength={10000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <label className="field-label">
            目标开始日期
            <input
              required
              type="date"
              value={draft.startDate}
              onChange={(e) =>
                setDraft({ ...draft, startDate: e.target.value })
              }
            />
          </label>
          <label className="field-label">
            进度模式
            <select
              aria-label="进度模式"
              value={draft.progressMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  progressMode: e.target.value as GoalDraft["progressMode"],
                })
              }
            >
              <option value="manual">手动百分比</option>
              <option value="automatic">关联任务自动进度</option>
            </select>
          </label>
          {draft.progressMode === "manual" && (
            <label className="field-label">
              手动进度（%）
              <input
                required
                type="number"
                min={0}
                max={100}
                step="any"
                value={draft.manualProgress}
                onChange={(e) =>
                  setDraft({ ...draft, manualProgress: e.target.valueAsNumber })
                }
              />
            </label>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">关联任务</legend>
            <p className="text-xs text-slate-500">
              关联整个任务及其重复实例；选择已关联其他目标的任务会将其转移到本目标。
            </p>
            {snapshot.tasks.map((t) => (
              <label className="flex gap-2 text-sm" key={t.id}>
                <input
                  type="checkbox"
                  checked={taskIds.includes(t.id)}
                  onChange={(e) =>
                    setTaskIds(
                      e.target.checked
                        ? [...taskIds, t.id]
                        : taskIds.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button className="primary-button">保存目标</button>
            {goal && (
              <button
                type="button"
                className="danger-button"
                onClick={() => setDeleting(true)}
              >
                删除目标
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
