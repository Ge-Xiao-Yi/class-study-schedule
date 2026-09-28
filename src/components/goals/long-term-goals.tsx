import { useMemo, useState } from "react";
import type { ScheduleSnapshot } from "@/types/course";
import type { Goal } from "@/types/archive";
import type { ScheduleCommand } from "@/application/schedule-service";
import { goalProgress } from "@/domain/goals";
import { GoalDialog } from "./goal-dialog";

export function LongTermGoals({
  snapshot,
  today,
  editing,
  onSave,
}: {
  snapshot: ScheduleSnapshot;
  today: string;
  editing: boolean;
  onSave: (command: ScheduleCommand) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [editor, setEditor] = useState<Goal | "new" | null>(null);
  const items = useMemo(
    () =>
      (snapshot.goals ?? []).map((goal) => ({
        goal,
        progress: goalProgress(goal, snapshot, today),
      })),
    [snapshot, today],
  );
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="长期目标"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold" aria-label="长期目标">
          <button
            aria-expanded={open}
            aria-controls="goal-panel"
            onClick={() => setOpen(!open)}
          >
            长期目标 {open ? "▾" : "▸"} · {items.length}
          </button>
        </h2>
        <button
          disabled={!editing}
          className="secondary-button"
          onClick={() => setEditor("new")}
        >
          新增目标
        </button>
      </div>
      <div id="goal-panel" hidden={!open} className="mt-4 space-y-3">
        {!items.length && (
          <p className="text-sm text-slate-500">
            把每一天的学习，连接到更长远的目标。
          </p>
        )}
        {items.map(({ goal, progress }) => (
          <article
            key={goal.id}
            aria-label={`目标：${goal.name}`}
            className="rounded-xl border border-sky-100 bg-sky-50/40 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="break-words font-semibold">{goal.name}</h3>
              <button
                disabled={!editing}
                className="secondary-button"
                onClick={() => setEditor(goal)}
                aria-label={`编辑目标：${goal.name}`}
              >
                编辑
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-500">
              {goal.description}
            </p>
            <p className="mt-3 text-sm">
              {progress.percent}% ·{" "}
              {goal.progressMode === "manual"
                ? "手动进度"
                : `已完成 ${progress.done} / ${progress.total} 次`}
            </p>
            <progress
              aria-label={`${goal.name}进度`}
              className="mt-2 h-2 w-full accent-blue-500"
              max={100}
              value={progress.percent}
            />
            <p className="mt-2 text-xs leading-6 text-slate-500">
              {goal.progressMode === "automatic"
                ? `统计范围：${goal.startDate} 至 ${today}（含首尾），按实际安排日期统计关联任务；包含按重复规则计算的未打卡实例和保留记录，排除已删除及未来实例。进行中不计完成。`
                : `开始日期：${goal.startDate}。进度由你手动维护。`}
            </p>
            <p className="text-xs leading-6 text-slate-500">
              关联任务：
              {snapshot.tasks
                .filter(
                  (t) =>
                    t.goalId === goal.id ||
                    snapshot.goalTaskRelations?.some(
                      (r) => r.goalId === goal.id && r.taskId === t.id,
                    ),
                )
                .map((t) => t.name)
                .join("、") || "暂无"}
            </p>
          </article>
        ))}
      </div>
      {editor && editing && (
        <GoalDialog
          goal={editor === "new" ? undefined : editor}
          snapshot={snapshot}
          today={today}
          onSave={onSave}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}
