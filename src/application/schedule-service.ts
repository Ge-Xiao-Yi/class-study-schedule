import type {
  CourseDraft,
  CourseFields,
  ScheduleSnapshot,
  Semester,
} from "../types/course";
import { applyGoalCommand, type GoalCommand } from "./goal-commands";
import { syncGoalRelations } from "../domain/goals";
import {
  applyCourseImport,
  type ImportCandidate,
} from "../domain/course-import";
import { copyPreviousWeek, type CopyWeekScope } from "../domain/copy-week";
import { validateTimeSlots, type TimeSlotDraft } from "../domain/time-slots";
import type { ScheduleRepository } from "../repositories/schedule-repository";
import {
  courseFields,
  occursOn,
  validateCourse,
  validateFields,
  validateSemester,
} from "../domain/courses";
import { dateForWeekday, startOfWeek } from "../domain/dates";
import {
  applyTaskCommand,
  isTaskCommand,
  type TaskCommand,
} from "./task-commands";

type CourseCommand =
  | { type: "import-courses"; rows: ImportCandidate[] }
  | { type: "copy-previous-week"; targetWeek: string; scope: CopyWeekScope }
  | { type: "save-time-slots"; slots: TimeSlotDraft[] }
  | {
      type: "save-semester";
      settings: Pick<Semester, "startDate" | "endDate" | "teachingWeeks">;
    }
  | { type: "save-course"; id?: string; draft: CourseDraft }
  | { type: "delete-course"; courseId: string }
  | {
      type: "modify-occurrence";
      courseId: string;
      originalDate: string;
      fields: CourseFields;
    }
  | { type: "cancel-occurrence"; courseId: string; originalDate: string }
  | { type: "restore-occurrence"; courseId: string; originalDate: string };

export type ScheduleCommand = CourseCommand | TaskCommand | GoalCommand;

export class ScheduleService {
  constructor(
    private readonly repository: ScheduleRepository,
    private readonly profileId: string,
  ) {}

  read() {
    return this.repository.read(this.profileId);
  }

  execute(command: ScheduleCommand): Promise<ScheduleSnapshot> {
    return this.repository.transact(this.profileId, (state) => {
      const timestamp = new Date().toISOString();
      if (command.type === "import-courses")
        return applyCourseImport(
          state,
          command.rows,
          this.profileId,
          timestamp,
        );
      if (command.type === "goal:save" || command.type === "goal:delete")
        return applyGoalCommand(state, command, this.profileId, timestamp);
      if (command.type === "copy-previous-week")
        return copyPreviousWeek(
          state,
          command.targetWeek,
          command.scope,
          timestamp,
        );
      if (command.type === "save-time-slots") {
        validateTimeSlots(command.slots);
        return {
          ...state,
          timeSlots: command.slots.map((slot) => ({
            ...slot,
            id:
              state.timeSlots?.find((item) => item.period === slot.period)
                ?.id ?? crypto.randomUUID(),
            profileId: this.profileId,
          })),
        };
      }
      if (isTaskCommand(command))
        return syncGoalRelations(
          state,
          applyTaskCommand(state, command, this.profileId, timestamp),
        );
      if (command.type === "save-semester") {
        const semester = { ...state.semester, ...command.settings };
        validateSemester(semester);
        // Existing templates retain their ranges; resolution intersects with the
        // new semester. Expanding it again can reveal those courses unchanged.
        return { ...state, semester };
      }
      if (command.type === "save-course") {
        validateCourse(command.draft, state.semester);
        const existing = command.id
          ? state.courses.find((item) => item.id === command.id)
          : undefined;
        if (command.id && !existing)
          throw new Error("课程不存在，请重新打开课程。");
        const course = {
          ...command.draft,
          name: command.draft.name.trim(),
          id: existing?.id ?? crypto.randomUUID(),
          profileId: this.profileId,
          semesterId: state.semester.id,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        const exceptions = state.exceptions.map((exception) => {
          if (exception.courseId !== course.id) return exception;
          // Keep per-week overrides when the template weekday changes. The
          // exception remains attached to that week's new template occurrence.
          return {
            ...exception,
            originalDate: dateForWeekday(
              exception.originalDate,
              course.weekday,
            ),
          };
        });
        return {
          ...state,
          courses: [
            ...state.courses.filter((item) => item.id !== course.id),
            course,
          ],
          exceptions,
        };
      }
      const course = state.courses.find((item) => item.id === command.courseId);
      if (!course) throw new Error("课程不存在，请重新打开课程。");
      if (command.type === "delete-course")
        return {
          ...state,
          courses: state.courses.filter((item) => item.id !== course.id),
          exceptions: state.exceptions.filter(
            (item) => item.courseId !== course.id,
          ),
        };
      const matches = (item: ScheduleSnapshot["exceptions"][number]) =>
        item.courseId === course.id &&
        item.originalDate === command.originalDate;
      if (command.type === "restore-occurrence")
        return {
          ...state,
          exceptions: state.exceptions.filter((item) => !matches(item)),
        };
      if (!occursOn(course, command.originalDate, state.semester))
        throw new Error("该日期没有原始课程安排。");
      if (command.type === "modify-occurrence") {
        validateFields(command.fields);
        const targetDate = dateForWeekday(
          command.originalDate,
          command.fields.weekday,
        );
        if (startOfWeek(targetDate) !== startOfWeek(command.originalDate))
          throw new Error("仅本周修改不能移到其他自然周。");
      }
      const existing = state.exceptions.find(matches);
      const exception = {
        id: existing?.id ?? crypto.randomUUID(),
        profileId: this.profileId,
        courseId: course.id,
        originalDate: command.originalDate,
        action:
          command.type === "cancel-occurrence"
            ? ("cancel" as const)
            : ("modify" as const),
        overrides:
          command.type === "modify-occurrence"
            ? courseFields(command.fields)
            : {},
        createdAt: existing?.createdAt ?? timestamp,
      };
      return {
        ...state,
        exceptions: [
          ...state.exceptions.filter((item) => !matches(item)),
          exception,
        ],
      };
    });
  }
}
