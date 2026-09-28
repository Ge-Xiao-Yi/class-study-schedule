import { courseColors, occurrencePeriods } from "@/domain/courses";
import type { CourseOccurrence } from "@/types/course";
import type { TimeSlot } from "@/types/archive";

export function CourseCard({
  occurrence,
  onEdit,
  readOnly = false,
  timeSlots,
}: {
  occurrence: CourseOccurrence;
  onEdit: () => void;
  readOnly?: boolean;
  timeSlots?: TimeSlot[];
}) {
  const { course } = occurrence;
  const color = courseColors[course.color];
  return (
    <button
      type="button"
      disabled={readOnly}
      data-course-id={occurrence.courseId}
      data-occurrence-id={occurrence.id}
      onClick={onEdit}
      className="schedule-card w-full text-left transition-shadow hover:shadow-md"
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text,
      }}
      aria-label={`编辑课程：${course.name}，${course.startTime}–${course.endTime}`}
    >
      <span className="mb-2 block text-[10px] leading-5">
        {occurrence.exception
          ? "本周已调整"
          : course.repeatType === "weekly"
            ? "每周课程"
            : "单次课程"}
        {occurrencePeriods(course, timeSlots).length > 1 && " · 跨时段"}
      </span>
      <span className="block text-sm font-semibold leading-6">
        {course.name}
      </span>
      <span className="mt-2 block text-xs tabular-nums">
        {course.startTime}–{course.endTime}
      </span>
      {course.sectionText && (
        <span className="mt-1 block text-[11px] leading-5">
          {course.sectionText}
        </span>
      )}
      <span className="mt-1.5 block text-[11px] leading-5">
        {course.location || "地点待定"}
        {course.teacher && ` · ${course.teacher}`}
      </span>
    </button>
  );
}
