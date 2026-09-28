import type {
  Course,
  CourseDraft,
  ScheduleSnapshot,
  Semester,
} from "../../src/types/course";

export const semester: Semester = {
  id: "semester-1",
  profileId: "profile-1",
  startDate: "2026-09-02",
  endDate: "2026-12-20",
  teachingWeeks: 16,
};
export const draft: CourseDraft = {
  name: "高等数学",
  location: "A302",
  teacher: "王老师",
  weekday: 4,
  sectionText: "1–2",
  startTime: "08:00",
  endTime: "09:40",
  color: "blue",
  repeatType: "weekly",
  startWeek: 1,
  endWeek: 16,
  occurrenceDate: null,
};
export const course: Course = {
  ...draft,
  id: "course-1",
  profileId: semester.profileId,
  semesterId: semester.id,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
export function seed(): ScheduleSnapshot {
  return structuredClone({
    semester,
    courses: [course],
    exceptions: [],
    tasks: [],
    taskOccurrences: [],
  });
}
