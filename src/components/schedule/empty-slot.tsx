export function EmptySlot({
  onCreate,
  onCreateTask,
  label,
  editing,
  compact = false,
}: {
  onCreate: () => void;
  onCreateTask: () => void;
  label: string;
  editing: boolean;
  compact?: boolean;
}) {
  if (!editing)
    return compact ? null : (
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 text-[11px] text-slate-400">
        自由安排
      </div>
    );
  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-1"
          : "flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200"
      }
    >
      <button
        type="button"
        onClick={onCreate}
        aria-label={`${label}添加课程`}
        className="min-h-11 rounded-lg px-2 py-2 text-xs text-sky-700 hover:bg-sky-50"
      >
        ＋ 添加课程
      </button>
      <button
        type="button"
        onClick={onCreateTask}
        aria-label={`${label}添加任务`}
        className="min-h-11 rounded-lg px-2 py-2 text-xs text-teal-700 hover:bg-teal-50"
      >
        ＋ 添加任务
      </button>
    </div>
  );
}
