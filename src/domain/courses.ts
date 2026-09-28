import { getTimePeriods } from "./time-slots";
export { timePeriods } from "./time-slots";
import type { TimeSlot } from "../types/archive";
import type {
  Course,
  CourseDraft,
  CourseFields,
  CourseOccurrence,
  ScheduleSnapshot,
  Semester,
} from "../types/course";
import type { PeriodId } from "../types/schedule";
import {
  calendarDaysBetween,
  dateForWeekday,
  parseDate,
  startOfWeek,
  teachingWeek,
  weekday,
} from "./dates";

export const courseColors = {
  blue: {
    label: "浅蓝",
    background: "#eaf1ff",
    border: "#cfdef7",
    text: "#3b609e",
  },
  green: {
    label: "浅绿",
    background: "#ecf6ef",
    border: "#d6e7de",
    text: "#3d7359",
  },
  purple: {
    label: "浅紫",
    background: "#f2eefe",
    border: "#e3dcf5",
    text: "#755899",
  },
  orange: {
    label: "浅橙",
    background: "#fff4e6",
    border: "#f2ddba",
    text: "#916022",
  },
  pink: {
    label: "浅粉",
    background: "#fff0f4",
    border: "#f4d5e0",
    text: "#99516e",
  },
};

export function validateSemester(semester: Semester): void {
  parseDate(semester.startDate);
  parseDate(semester.endDate);
  if (semester.endDate < semester.startDate)
    throw new Error("学期结束日期不能早于开始日期。");
  const available =
    Math.floor(
      calendarDaysBetween(startOfWeek(semester.startDate), semester.endDate) /
        7,
    ) + 1;
  if (
    !Number.isInteger(semester.teachingWeeks) ||
    semester.teachingWeeks < 1 ||
    semester.teachingWeeks > available
  ) {
    throw new Error(`教学周数应为 1 至 ${available} 之间的整数。`);
  }
}

export function validateFields(fields: CourseFields): void {
  if (!fields.name.trim() || fields.name.length > 80)
    throw new Error("课程名称必填，且不超过 80 个字。");
  if (
    [fields.location, fields.teacher, fields.sectionText].some(
      (value) => value.length > 100,
    )
  )
    throw new Error("地点、教师和节次各不能超过 100 个字。");
  if (
    !Number.isInteger(fields.weekday) ||
    fields.weekday < 1 ||
    fields.weekday > 7
  )
    throw new Error("请选择有效的星期。");
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(fields.startTime) || !timePattern.test(fields.endTime))
    throw new Error("请输入有效的 24 小时制时间。");
  if (fields.endTime <= fields.startTime)
    throw new Error("结束时间必须晚于开始时间，不支持跨午夜课程。");
  if (!Object.hasOwn(courseColors, fields.color))
    throw new Error("请选择有效的课程颜色。");
}

export function validateCourse(course: CourseDraft, semester: Semester): void {
  validateFields(course);
  if (course.repeatType === "weekly") {
    if (
      !Number.isInteger(course.startWeek) ||
      !Number.isInteger(course.endWeek) ||
      course.startWeek < 1 ||
      course.endWeek < course.startWeek ||
      course.endWeek > semester.teachingWeeks
    )
      throw new Error(
        `教学周范围应位于 1–${semester.teachingWeeks} 周，结束周不能早于开始周。`,
      );
    if (course.occurrenceDate !== null)
      throw new Error("每周课程不应带有单次日期。");
  } else if (course.repeatType === "once") {
    if (!course.occurrenceDate) throw new Error("仅本周课程需要具体日期。");
    parseDate(course.occurrenceDate);
    if (weekday(course.occurrenceDate) !== course.weekday)
      throw new Error("单次课程日期与星期不一致。");
  } else throw new Error("请选择有效的重复规则。");
}

export function occursOn(
  course: Course,
  date: string,
  semester: Semester,
): boolean {
  if (
    course.profileId !== semester.profileId ||
    course.semesterId !== semester.id
  )
    return false;
  if (course.repeatType === "once") return course.occurrenceDate === date;
  const week = teachingWeek(date, semester);
  return (
    weekday(date) === course.weekday &&
    week !== null &&
    week >= course.startWeek &&
    week <= course.endWeek
  );
}

export function resolveWeek(
  snapshot: ScheduleSnapshot,
  date: string,
): CourseOccurrence[] {
  const start = startOfWeek(date);
  return snapshot.courses
    .flatMap((template): CourseOccurrence[] => {
      const originalDate =
        template.repeatType === "once"
          ? template.occurrenceDate!
          : dateForWeekday(start, template.weekday);
      if (
        startOfWeek(originalDate) !== start ||
        !occursOn(template, originalDate, snapshot.semester)
      )
        return [];
      const exception = snapshot.exceptions.find(
        (item) =>
          item.profileId === template.profileId &&
          item.courseId === template.id &&
          item.originalDate === originalDate,
      );
      const course =
        exception?.action === "modify"
          ? { ...template, ...exception.overrides }
          : template;
      return [
        {
          id: `${template.id}:${originalDate}`,
          courseId: template.id,
          originalDate,
          date: dateForWeekday(start, course.weekday),
          course,
          exception,
          cancelled: exception?.action === "cancel",
        },
      ];
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.course.startTime.localeCompare(b.course.startTime) ||
        a.courseId.localeCompare(b.courseId),
    );
}

export function occurrencePeriods(
  course: CourseFields,
  slots?: TimeSlot[],
): PeriodId[] {
  return getTimePeriods(slots)
    .filter(
      (period) =>
        course.startTime < period.end && course.endTime > period.start,
    )
    .map((period) => period.id);
}

export function courseFields(course: CourseFields): CourseFields {
  const {
    name,
    location,
    teacher,
    weekday,
    sectionText,
    startTime,
    endTime,
    color,
  } = course;
  return {
    name,
    location,
    teacher,
    weekday,
    sectionText,
    startTime,
    endTime,
    color,
  };
}
