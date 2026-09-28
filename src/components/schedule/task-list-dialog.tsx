import type { Task } from "@/types/task";
import { taskRepeatLabels } from "@/domain/tasks";
import { Dialog } from "@/components/ui/dialog";

export function TaskListDialog({
  tasks,
  onEdit,
  onClose,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="全部任务" onClose={onClose}>
      <p className="mb-4 text-sm leading-6 text-slate-500">
        管理所有任务定义，包括当前周未安排的任务。单次删除不删除重复模板。
      </p>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 p-4 text-left hover:bg-sky-50"
              onClick={() => onEdit(task)}
            >
              <span className="block break-words font-medium">{task.name}</span>
              <span className="mt-2 block text-xs text-slate-500">
                {taskRepeatLabels[task.repeatType]} · 从 {task.startDate} 开始 ·
                点击编辑
              </span>
            </button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          还没有任务，请先新增任务。
        </p>
      )}
    </Dialog>
  );
}
