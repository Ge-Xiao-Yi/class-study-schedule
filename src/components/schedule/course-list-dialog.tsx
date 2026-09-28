import type { Course } from "@/types/course";
import { Dialog } from "@/components/ui/dialog";

export function CourseListDialog({
  courses,
  onEdit,
  onClose,
}: {
  courses: Course[];
  onEdit: (course: Course) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="全部课程" onClose={onClose}>
      <p className="mb-4 text-sm leading-6 text-slate-500">
        包含当前自然周未排课的课程，可在此编辑或删除整个课程。
      </p>
      <ul className="space-y-3">
        {courses.map((course) => (
          <li key={course.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 p-4 text-left hover:bg-sky-50"
              onClick={() => onEdit(course)}
            >
              <span className="block break-words font-medium">
                {course.name}
              </span>
              <span className="mt-2 block text-xs leading-6 text-slate-500">
                {course.repeatType === "weekly"
                  ? "每周重复"
                  : `单次 · ${course.occurrenceDate}`}{" "}
                · {course.startTime}–{course.endTime} · 点击编辑
              </span>
            </button>
          </li>
        ))}
      </ul>
      {courses.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          还没有课程，请先新增课程。
        </p>
      )}
    </Dialog>
  );
}
