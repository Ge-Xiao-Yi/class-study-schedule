import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { ScheduleSnapshot } from "@/types/course";
import type { ScheduleCommand } from "@/application/schedule-service";
import { planPreviousWeek, type CopyWeekScope } from "@/domain/copy-week";
import { weekLabel } from "@/domain/dates";
export function CopyWeekDialog({
  snapshot,
  week,
  onSave,
  onClose,
}: {
  snapshot: ScheduleSnapshot;
  week: string;
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<CopyWeekScope>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useMemo(() => {
    try {
      return { plan: planPreviousWeek(snapshot, week, scope), error: "" };
    } catch (e) {
      return {
        plan: null,
        error: e instanceof Error ? e.message : "日期超出支持范围。",
      };
    }
  }, [snapshot, week, scope]);
  const plan = result.plan;
  async function copy() {
    setBusy(true);
    setError("");
    try {
      await onSave({ type: "copy-previous-week", targetWeek: week, scope });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "复制失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="复制上一周" busy={busy} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <label className="field-label">
          复制内容
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as CopyWeekScope)}
          >
            <option value="all">全部</option>
            <option value="courses">课程</option>
            <option value="tasks">任务</option>
          </select>
        </label>
        {plan && (
          <div className="rounded-xl bg-sky-50 p-4 leading-7">
            <p>来源：{weekLabel(plan.sourceWeek)}</p>
            <p>目标：{weekLabel(plan.targetWeek)}</p>
            <p>
              将新增 {plan.courses.length} 门单次课程、{plan.tasks.length}{" "}
              条任务实例。
            </p>
            <p>
              沿用 {plan.fixedCourses} 门固定课程；跳过 {plan.existingCourses}{" "}
              门重复课程、{plan.existingTasks} 条已有任务记录。
            </p>
          </div>
        )}
        <p className="leading-6 text-slate-500">
          固定课程沿用已有模板及教学周范围，不延长范围、不复制单周调整或取消。仅复制未取消的单次课程；目标周已有相同安排时跳过。
        </p>
        <p className="leading-6 text-slate-500">
          任务按原显示日期后移 7
          天，截止日期同步后移；复用任务定义，新增目标周单次实例，状态为未开始。已有状态、调整或删除记录不会被覆盖。单次修改副本不影响原日期；修改整个任务仍会影响其定义。
        </p>
        {(error || result.error) && (
          <p role="alert" className="form-error">
            {error || result.error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={busy || !plan || !(plan.courses.length + plan.tasks.length)}
          onClick={() => void copy()}
        >
          确认复制上一周
        </button>
        {plan && !(plan.courses.length + plan.tasks.length) && (
          <p role="status" className="text-slate-500">
            没有需要新增的安排，现有记录保持不变。
          </p>
        )}
      </div>
    </Dialog>
  );
}
