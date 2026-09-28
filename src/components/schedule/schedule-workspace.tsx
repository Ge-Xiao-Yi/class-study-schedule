"use client";

import { useEffect, useState } from "react";
import type {
  ScheduleService,
  ScheduleCommand,
} from "@/application/schedule-service";
import type {
  CourseOccurrence,
  ScheduleSnapshot,
  Weekday,
} from "@/types/course";
import {
  addDays,
  localDate,
  parseDate,
  startOfWeek,
  weekday,
  weekDates,
} from "@/domain/dates";
import { resolveWeek } from "@/domain/courses";
import { resolveTasks, taskView } from "@/domain/tasks";
import type { TaskView, TaskStatus } from "@/types/task";
import { PersistentWorkspace } from "./persistent-workspace";
import { WeekControls } from "./week-controls";
import { TodayStatus } from "./today-status";
import { ScheduleGrid } from "./schedule-grid";
import { CourseDialog, type CourseEditorTarget } from "./course-dialog";
import { SemesterDialog } from "./semester-dialog";
import { CourseListDialog } from "./course-list-dialog";
import { TaskDialog, type TaskEditorTarget } from "./task-dialog";
import { TaskListDialog } from "./task-list-dialog";
import { CopyWeekDialog } from "./copy-week-dialog";
import { TimeSlotsDialog } from "./time-slots-dialog";
import { LongTermGoals } from "../goals/long-term-goals";
import { CourseImportDialog } from "../import/course-import-dialog";

interface ReadySession {
  service: ScheduleService;
  snapshot: ScheduleSnapshot;
  today: string;
}

export function ScheduleWorkspace() {
  return (
    <PersistentWorkspace
      render={(session, onSavingChange, editing, onToggleEditing) => (
        <ScheduleController
          session={session}
          onSavingChange={onSavingChange}
          editing={editing}
          onToggleEditing={onToggleEditing}
        />
      )}
    />
  );
}
export function ScheduleController({
  session,
  onSavingChange,
  editing,
  onToggleEditing,
}: {
  session: ReadySession;
  onSavingChange: (saving: boolean) => void;
  editing: boolean;
  onToggleEditing: () => void;
}) {
  const [snapshot, setSnapshot] = useState(session.snapshot);
  const [date, setDate] = useState(session.today);
  const [now, setNow] = useState(() => new Date());
  const today = localDate(now);
  const [editor, setEditor] = useState<CourseEditorTarget | null>(null);
  const [settings, setSettings] = useState(false);
  const [managing, setManaging] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);
  const [timeSettings, setTimeSettings] = useState(false);
  const [saving, setSaving] = useState(0);
  const [taskEditor, setTaskEditor] = useState<TaskEditorTarget | null>(null);
  const [managingTasks, setManagingTasks] = useState(false);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const week = startOfWeek(date);
  const occurrences = resolveWeek(snapshot, week);
  const tasks = resolveTasks(snapshot, week);
  function jump(next: string) {
    try {
      parseDate(next);
      weekDates(next).forEach(parseDate);
      setDate(next);
      setNotice("");
    } catch {
      setNotice("请输入有效日期，且整周均在 1000–9999 年范围内。");
    }
  }
  async function save(command: ScheduleCommand) {
    if (!editing && command.type !== "task:status")
      throw new Error("请先开启编辑模式。");
    setSaving((count) => count + 1);
    onSavingChange(true);
    try {
      const next = await session.service.execute(command);
      setSnapshot(next);
      setNotice(
        command.type === "restore-occurrence"
          ? "已恢复原安排。"
          : command.type === "cancel-occurrence"
            ? "已取消本周课程，可在课表下方恢复。"
            : command.type === "delete-course"
              ? "已删除整个课程及单周例外。"
              : "已自动保存到当前本地档案。",
      );
    } finally {
      setSaving((count) => Math.max(0, count - 1));
      onSavingChange(false);
    }
  }
  function edit(item: CourseOccurrence) {
    setEditor({
      template: snapshot.courses.find((course) => course.id === item.courseId)!,
      occurrence: item,
      weekday: item.course.weekday,
      period: "morning",
    });
  }
  function editTask(view: TaskView) {
    setTaskEditor({
      template: snapshot.tasks.find((task) => task.id === view.taskId)!,
      view,
      date: view.date,
      period: view.fields.period,
    });
  }
  async function setTaskStatus(task: TaskView, status: TaskStatus) {
    await save({
      type: "task:status",
      taskId: task.taskId,
      originalDate: task.originalDate,
      status,
    });
  }
  return (
    <>
      <TodayStatus now={now} occurrences={resolveWeek(snapshot, today)} />
      <WeekControls
        date={date}
        onDateChange={jump}
        onSemester={() => setSettings(true)}
        onManage={() => setManaging(true)}
        editing={editing}
        onToggleEditing={onToggleEditing}
        saving={saving > 0}
        onCopyWeek={() => setCopyingWeek(true)}
        onTimeSlots={() => setTimeSettings(true)}
        onCreateTask={() => setTaskEditor({ date, period: "morning" })}
        onManageTasks={() => setManagingTasks(true)}
        onCreate={() =>
          setEditor({ weekday: weekday(date), period: "morning" })
        }
      />
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-sky-100 bg-white px-4 py-3 text-xs text-sky-700"
        >
          {notice}
        </p>
      )}
      <div className="flex justify-end">
        <button
          className="secondary-button"
          disabled={!editing || saving > 0}
          onClick={() => setImporting(true)}
        >
          导入课表
        </button>
      </div>
      {importing && editing && (
        <CourseImportDialog
          snapshot={snapshot}
          onSave={save}
          onClose={() => setImporting(false)}
        />
      )}
      <ScheduleGrid
        timeSlots={snapshot.timeSlots}
        week={week}
        today={today}
        selectedDay={weekday(date)}
        onSelectDay={(day: Weekday) => setDate(addDays(week, day - 1))}
        occurrences={occurrences}
        tasks={tasks}
        editing={editing}
        onEditTask={editTask}
        onTaskStatus={setTaskStatus}
        onCreateTask={(day, period) =>
          setTaskEditor({ date: addDays(week, day - 1), period })
        }
        onEdit={edit}
        onCreate={(day, period) => setEditor({ weekday: day, period })}
      />
      <LongTermGoals
        snapshot={snapshot}
        today={today}
        editing={editing}
        onSave={save}
      />
      {copyingWeek && editing && (
        <CopyWeekDialog
          snapshot={snapshot}
          week={week}
          onSave={save}
          onClose={() => setCopyingWeek(false)}
        />
      )}
      {timeSettings && editing && (
        <TimeSlotsDialog
          slots={snapshot.timeSlots}
          onSave={save}
          onClose={() => setTimeSettings(false)}
        />
      )}
      {taskEditor && editing && (
        <TaskDialog
          goals={snapshot.goals}
          timeSlots={snapshot.timeSlots}
          hasInstances={
            snapshot.taskOccurrences.filter(
              (item) => item.taskId === taskEditor.template?.id,
            ).length > 1 ||
            (!!taskEditor.template &&
              taskEditor.view?.originalDate !== taskEditor.template.startDate)
          }
          target={taskEditor}
          onSave={save}
          onClose={() => setTaskEditor(null)}
        />
      )}
      {managingTasks && editing && (
        <TaskListDialog
          tasks={snapshot.tasks}
          onClose={() => setManagingTasks(false)}
          onEdit={(template) => {
            const view = taskView(
              template,
              template.startDate,
              snapshot.taskOccurrences.find(
                (item) =>
                  item.taskId === template.id &&
                  item.occurrenceDate === template.startDate,
              ),
              snapshot.timeSlots,
            );
            setManagingTasks(false);
            setTaskEditor({
              template,
              view,
              date: view.date,
              period: view.fields.period,
              manage: true,
            });
          }}
        />
      )}
      {editor && editing && (
        <CourseDialog
          timeSlots={snapshot.timeSlots}
          target={editor}
          week={week}
          semester={snapshot.semester}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {settings && editing && (
        <SemesterDialog
          semester={snapshot.semester}
          onSave={save}
          onClose={() => setSettings(false)}
        />
      )}
      {managing && editing && (
        <CourseListDialog
          courses={snapshot.courses}
          onClose={() => setManaging(false)}
          onEdit={(template) => {
            setManaging(false);
            setEditor({
              template,
              weekday: template.weekday,
              period: "morning",
            });
          }}
        />
      )}
    </>
  );
}
