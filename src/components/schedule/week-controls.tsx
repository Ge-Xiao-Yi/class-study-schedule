import { Icon } from "@/components/ui/icon";
import { addDays, localDate, startOfWeek, weekLabel } from "@/domain/dates";

export function WeekControls({
  date,
  onDateChange,
  onSemester,
  onCreate,
  onManage,
  editing,
  onToggleEditing,
  onCreateTask,
  onManageTasks,
  onCopyWeek,
  onTimeSlots,
  saving,
}: {
  date: string;
  onDateChange: (date: string) => void;
  onSemester: () => void;
  onCreate: () => void;
  onManage: () => void;
  editing: boolean;
  onToggleEditing: () => void;
  onCreateTask: () => void;
  onManageTasks: () => void;
  onCopyWeek: () => void;
  onTimeSlots: () => void;
  saving: boolean;
}) {
  return (
    <section aria-label="周次控制" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.18em] text-sky-700">
            MY STUDY WEEK
          </p>
          <h1 className="text-2xl leading-snug font-bold tracking-tight sm:text-3xl">
            每一周，都有所收获<span className="text-blue-400">.</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            把课程与计划放在一起，为成长留出时间。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            role="switch"
            aria-label="编辑模式"
            aria-checked={editing}
            disabled={saving}
            className="secondary-button"
            onClick={onToggleEditing}
          >
            编辑模式 · {editing ? "开" : "关"}
          </button>
          <button
            disabled={!editing || saving}
            className="secondary-button"
            onClick={onCopyWeek}
          >
            复制上一周
          </button>
          <button
            disabled={!editing || saving}
            className="secondary-button"
            onClick={onTimeSlots}
          >
            时间段设置
          </button>
          <button
            disabled={!editing}
            className="secondary-button"
            onClick={onSemester}
          >
            学期设置
          </button>
          <button
            disabled={!editing}
            className="secondary-button"
            onClick={onManage}
          >
            课程管理
          </button>
          <button
            disabled={!editing}
            className="secondary-button"
            onClick={onManageTasks}
          >
            任务管理
          </button>
          <button
            disabled={!editing}
            className="primary-button"
            onClick={onCreate}
          >
            新增课程
          </button>
          <button
            disabled={!editing}
            className="primary-button"
            onClick={onCreateTask}
          >
            新增任务
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-100 bg-white p-3">
        <button
          aria-label="上一周"
          className="control-button"
          onClick={() => onDateChange(addDays(date, -7))}
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <p
          aria-live="polite"
          className="text-xs font-semibold tabular-nums sm:text-sm"
        >
          {weekLabel(date)}
        </p>
        <button
          aria-label="下一周"
          className="control-button"
          onClick={() => onDateChange(addDays(date, 7))}
        >
          <Icon name="chevron-right" size={18} />
        </button>
        <button
          className="secondary-button"
          onClick={() => onDateChange(localDate())}
        >
          返回本周
        </button>
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
          跳转日期
          <input
            aria-label="跳转日期"
            className="date-input"
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid)
                onDateChange(event.target.value);
            }}
          />
        </label>
        <span className="ml-auto text-[11px] text-slate-400">
          {startOfWeek(date) === startOfWeek(localDate())
            ? "当前自然周"
            : "自然周 · 周一至周日"}
        </span>
      </div>
    </section>
  );
}
