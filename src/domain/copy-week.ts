import type { CourseDraft, ScheduleSnapshot } from "../types/course";
import type { TaskOccurrence } from "../types/task";
import { addDays, parseDate, startOfWeek } from "./dates";
import { courseFields, resolveWeek } from "./courses";
import { resolveTasks } from "./tasks";

export type CopyWeekScope = "courses" | "tasks" | "all";
export function planPreviousWeek(
  snapshot: ScheduleSnapshot,
  targetDate: string,
  scope: CopyWeekScope,
) {
  if (!["courses", "tasks", "all"].includes(scope))
    throw new Error("请选择课程、任务或全部。");
  const targetWeek = startOfWeek(targetDate);
  const sourceWeek = addDays(targetWeek, -7);
  parseDate(sourceWeek);
  const shiftDate = (date: string) => {
    const next = addDays(date, 7);
    parseDate(next);
    return next;
  };
  const courses: CourseDraft[] = [];
  const tasks: Omit<TaskOccurrence, "id">[] = [];
  let fixedCourses = 0;
  let existingCourses = 0;
  let existingTasks = 0;
  const signature = (date: string, fields: CourseDraft) =>
    JSON.stringify([date, courseFields(fields)]);
  const targets = new Set(
    resolveWeek(snapshot, targetWeek).map((item) =>
      signature(item.date, item.course),
    ),
  );
  if (scope !== "tasks")
    for (const item of resolveWeek(snapshot, sourceWeek)) {
      if (item.cancelled) continue;
      // A recurring course keeps its own teaching range and target-week exceptions.
      if (item.course.repeatType === "weekly") {
        fixedCourses++;
        continue;
      }
      const date = shiftDate(item.date);
      const draft: CourseDraft = {
        ...courseFields(item.course),
        repeatType: "once",
        occurrenceDate: date,
        startWeek: 1,
        endWeek: 1,
      };
      const key = signature(date, draft);
      if (targets.has(key)) {
        existingCourses++;
        continue;
      }
      targets.add(key);
      courses.push(draft);
    }
  const keys = new Set(
    snapshot.taskOccurrences.map(
      (item) => `${item.taskId}:${item.occurrenceDate}`,
    ),
  );
  // A moved or deleted destination is also intentional; do not reset/recreate it.
  for (const item of snapshot.taskOccurrences)
    keys.add(
      `${item.taskId}:${item.overrides?.startDate ?? item.occurrenceDate}`,
    );
  if (scope !== "courses")
    for (const view of resolveTasks(snapshot, sourceWeek)) {
      const date = shiftDate(view.date);
      const key = `${view.taskId}:${date}`;
      if (keys.has(key)) {
        existingTasks++;
        continue;
      }
      keys.add(key);
      tasks.push({
        profileId: snapshot.semester.profileId,
        taskId: view.taskId,
        occurrenceDate: date,
        status: "todo",
        completedAt: null,
        overrides: {
          ...view.fields,
          startDate: date,
          dueDate: view.fields.dueDate ? shiftDate(view.fields.dueDate) : null,
        },
      });
    }
  return {
    sourceWeek,
    targetWeek,
    courses,
    tasks,
    fixedCourses,
    existingCourses,
    existingTasks,
  };
}

export function copyPreviousWeek(
  snapshot: ScheduleSnapshot,
  targetWeek: string,
  scope: CopyWeekScope,
  timestamp: string,
): ScheduleSnapshot {
  const plan = planPreviousWeek(snapshot, targetWeek, scope);
  return {
    ...snapshot,
    courses: [
      ...snapshot.courses,
      ...plan.courses.map((draft) => ({
        ...draft,
        id: crypto.randomUUID(),
        profileId: snapshot.semester.profileId,
        semesterId: snapshot.semester.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    ],
    taskOccurrences: [
      ...snapshot.taskOccurrences,
      ...plan.tasks.map((item) => ({ ...item, id: crypto.randomUUID() })),
    ],
  };
}
