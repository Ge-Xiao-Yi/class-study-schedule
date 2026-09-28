import { addDays, localDate, startOfWeek } from "../domain/dates";
import { days, scheduleItems } from "./demo-data";
import type {
  Course,
  CourseColor,
  ScheduleSnapshot,
  Weekday,
} from "../types/course";
import type { Task, TaskOccurrence } from "../types/task";

/** Seed data only. Called once per newly created profile by the database. */
export function createScheduleSeed(
  profileId: string,
  today = localDate(),
  demo = false,
) {
  const semesterId = crypto.randomUUID();
  const startDate = addDays(startOfWeek(today), -21);
  const timestamp = new Date().toISOString();
  const colors: Record<string, CourseColor> = {
    math: "blue",
    language: "green",
    computer: "purple",
  };
  const courses: Course[] = scheduleItems
    .filter((item) => item.kind === "course")
    .map((item) => ({
      id: crypto.randomUUID(),
      profileId,
      semesterId,
      name: item.title,
      location: item.location,
      teacher: "",
      weekday: (days.findIndex((day) => day.id === item.day) + 1) as Weekday,
      sectionText: "",
      startTime: item.time.split("–")[0],
      endTime: item.time.split("–")[1],
      color: colors[item.category],
      repeatType: "weekly",
      startWeek: 1,
      endWeek: 20,
      occurrenceDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  const taskSamples = scheduleItems.filter((item) => item.kind === "task");
  const tasks: Task[] = taskSamples.map((item) => ({
    id: crypto.randomUUID(),
    profileId,
    name: item.title,
    startDate: addDays(
      startOfWeek(today),
      days.findIndex((day) => day.id === item.day),
    ),
    period: item.period,
    startTime: item.time.split("–")[0],
    endTime: item.time.split("–")[1],
    estimatedMinutes: null,
    dueDate: null,
    repeatType: "none",
    repeatUntil: null,
    goalId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const taskOccurrences: TaskOccurrence[] = tasks.map((task, index) => ({
    id: crypto.randomUUID(),
    profileId,
    taskId: task.id,
    occurrenceDate: task.startDate,
    status: taskSamples[index].completed ? "done" : "todo",
    completedAt: taskSamples[index].completed ? timestamp : null,
    overrides: null,
  }));
  const seed: ScheduleSnapshot = {
    semester: {
      id: semesterId,
      profileId,
      startDate,
      endDate: addDays(startDate, 139),
      teachingWeeks: 20,
    },
    courses,
    exceptions: [],
    tasks,
    taskOccurrences,
  };
  return demo ? seed : { ...seed, courses: [], tasks: [], taskOccurrences: [] };
}
