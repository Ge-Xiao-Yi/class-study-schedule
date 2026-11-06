"use client";

import { days as dayLabels } from "@/lib/demo-data";
import { getTimePeriods } from "@/domain/time-slots";
import { occurrencePeriods } from "@/domain/courses";
import type { TimeSlot } from "@/types/archive";
import { useState } from "react";
import { slotItems } from "@/domain/schedule-items";
import type { TaskView, TaskStatus } from "@/types/task";
import { weekDates, weekLabel } from "@/domain/dates";
import type { CourseOccurrence, Weekday } from "@/types/course";
import type { PeriodId } from "@/types/schedule";
import { CourseCard } from "./course-card";
import { TaskCard } from "./task-card";
import { EmptySlot } from "./empty-slot";
import { Icon } from "@/components/ui/icon";

interface GridProps {
  timeSlots?: TimeSlot[];
  week: string;
  today: string;
  selectedDay: Weekday;
  onSelectDay: (day: Weekday) => void;
  occurrences: CourseOccurrence[];
  tasks: TaskView[];
  editing: boolean;
  onCreateTask: (day: Weekday, period: PeriodId) => void;
  onEditTask: (task: TaskView) => void;
  onTaskStatus: (task: TaskView, status: TaskStatus) => Promise<void>;
  onEdit: (item: CourseOccurrence) => void;
  onCreate: (day: Weekday, period: PeriodId) => void;
}

export function ScheduleGrid({
  timeSlots,
  week,
  today,
  selectedDay,
  onSelectDay,
  occurrences,
  tasks,
  editing,
  onCreateTask,
  onEditTask,
  onTaskStatus,
  onEdit,
  onCreate,
}: GridProps) {
  const timePeriods = getTimePeriods(timeSlots);
  const [singleDay, setSingleDay] = useState(false);
  const days = weekDates(week).map((date, index) => ({
    ...dayLabels[index],
    date,
    weekday: (index + 1) as Weekday,
  }));
  const selected = days[selectedDay - 1];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const { saveWeekImage } = await import("@/lib/week-image");
      const rows = timePeriods.map((p) => [
        p.label + "\n" + p.time,
        ...days.map((d) => {
          const items = slotItems(occurrences, tasks, d.date, p.id, timeSlots);
          const lines = items.map((i) =>
            i.kind === "course"
              ? [
                  "有课 · " + i.occurrence.course.name,
                  i.occurrence.course.location,
                  i.occurrence.course.sectionText,
                  i.occurrence.course.startTime +
                    "–" +
                    i.occurrence.course.endTime,
                ]
                  .filter(Boolean)
                  .join("\n")
              : (i.task.status === "done" ? "☑ " : "☐ ") +
                i.task.fields.name +
                " " +
                [i.task.fields.startTime, i.task.fields.endTime]
                  .filter(Boolean)
                  .join("–") +
                (i.task.fields.estimatedMinutes
                  ? " · " + i.task.fields.estimatedMinutes + "分钟"
                  : ""),
          );
          if (!items.some((i) => i.kind === "course"))
            lines.unshift("自由时间");
          return lines.join("\n");
        }),
      ]);
      const extra = days.map((d) =>
        occurrences
          .filter(
            (o) =>
              !o.cancelled &&
              o.date === d.date &&
              !occurrencePeriods(o.course, timeSlots).length,
          )
          .map(
            (o) =>
              o.course.name + " " + o.course.startTime + "–" + o.course.endTime,
          )
          .join("\n"),
      );
      if (extra.some(Boolean)) rows.push(["时段外课程", ...extra]);
      await saveWeekImage(
        "周计划 " + days[0].date + " 至 " + days[6].date,
        ["时间", ...days.map((d) => d.label + " (" + d.date.slice(5) + ")")],
        rows,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片导出失败");
    } finally {
      setBusy(false);
    }
  }
  function outside(date?: string) {
    const items = occurrences.filter(
      (item) =>
        !item.cancelled &&
        (!date || item.date === date) &&
        occurrencePeriods(item.course, timeSlots).length === 0,
    );
    if (!items.length) return null;
    return (
      <section
        aria-label="时段外课程"
        className="space-y-3 border-t border-slate-100 p-4"
      >
        <h3 className="text-sm font-semibold">时段外课程</h3>
        <p className="text-xs text-slate-500">
          以下课程不在已设时段内，原安排仍保留。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id}>
              <p className="mb-1 text-xs text-slate-500">{item.date}</p>
              <CourseCard
                occurrence={item}
                timeSlots={timeSlots}
                readOnly={!editing}
                onEdit={() => onEdit(item)}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }
  function slot(day: typeof selected, period: PeriodId) {
    const items = slotItems(occurrences, tasks, day.date, period, timeSlots);
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {items.some((i) => i.kind === "course") ? (
          <span className="slot-course-tag">有课</span>
        ) : (
          <span className="slot-free">☕ 自由时间</span>
        )}
        {items.some((i) => i.kind === "task") && (
          <small className="text-right text-slate-500">
            {
              items.filter((i) => i.kind === "task" && i.task.status === "done")
                .length
            }
            /{items.filter((i) => i.kind === "task").length}
          </small>
        )}
        {items.map((item) =>
          item.kind === "course" ? (
            <CourseCard
              timeSlots={timeSlots}
              key={item.key}
              occurrence={item.occurrence}
              readOnly={!editing}
              onEdit={() => onEdit(item.occurrence)}
            />
          ) : (
            <TaskCard
              key={item.key}
              task={item.task}
              today={today}
              editing={editing}
              onEdit={() => onEditTask(item.task)}
              onStatus={(status) => onTaskStatus(item.task, status)}
            />
          ),
        )}
        <EmptySlot
          editing={editing}
          compact={items.length > 0}
          onCreate={() => onCreate(day.weekday, period)}
          onCreateTask={() => onCreateTask(day.weekday, period)}
          label={`${day.label}${timePeriods.find((item) => item.id === period)!.label}`}
        />
      </div>
    );
  }
  return (
    <section
      aria-labelledby="schedule-title"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_24px_-12px_#90b2cd40]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-sky-600">
            <Icon name="calendar" />
          </span>
          <div>
            <h2 id="schedule-title" className="text-base font-semibold">
              我的一周
            </h2>
            <p className="mt-1 text-xs text-slate-500">{weekLabel(week)}</p>
          </div>
        </div>
        <div
          role="group"
          aria-label="桌面视图"
          className="hidden gap-2 lg:flex"
        >
          <button
            className="secondary-button"
            aria-pressed={!singleDay}
            onClick={() => setSingleDay(false)}
          >
            七天视图
          </button>
          <button
            className="secondary-button"
            aria-pressed={singleDay}
            onClick={() => setSingleDay(true)}
          >
            单日视图
          </button>
        </div>
        <button className="secondary-button" disabled={busy} onClick={download}>
          {busy ? "正在导出…" : "导出周计划 PNG"}
        </button>
        <button className="secondary-button" onClick={() => window.print()}>
          导出彩色 PDF
        </button>
        {error && <span role="alert">{error}</span>}
        <p className="text-[11px] leading-6 text-slate-500">
          {editing
            ? "点击卡片编辑 · 课程与任务可独立添加"
            : "浏览模式 · 勾选任务即可完成"}
        </p>
      </div>
      <div className={`p-3 sm:p-5 ${singleDay ? "" : "lg:hidden"}`}>
        <div
          className="grid grid-cols-7 gap-1 rounded-xl bg-slate-50 p-1"
          role="group"
          aria-label="选择星期"
        >
          {days.map((day) => (
            <button
              key={day.id}
              onClick={() => onSelectDay(day.weekday)}
              aria-pressed={selectedDay === day.weekday}
              aria-controls="day-schedule"
              onKeyDown={(event) => {
                const index = day.weekday - 1;
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % 7
                    : event.key === "ArrowLeft"
                      ? (index + 6) % 7
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 6
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  onSelectDay((next + 1) as Weekday);
                  (
                    event.currentTarget.parentElement?.children[
                      next
                    ] as HTMLButtonElement
                  )?.focus();
                }
              }}
              className={`min-w-0 rounded-lg py-3 text-xs ${selectedDay === day.weekday ? "bg-blue-500 font-semibold text-white shadow-sm" : "text-slate-500 hover:bg-sky-100"}`}
            >
              <span className="block">{day.label}</span>
              <span className="mt-1 block text-[10px]">
                {day.date.slice(5).replace("-", ".")}
              </span>
            </button>
          ))}
        </div>
        <div
          id="day-schedule"
          className="mt-5"
          aria-label={`${selected.label}课程与任务`}
        >
          <h3 className="mb-4 text-sm font-semibold">
            {selected.label}{" "}
            <span className="ml-1 text-xs font-normal text-slate-500">
              {selected.date}
              {selected.date === today && " · 今天"}
            </span>
          </h3>
          {timePeriods.map((period) => (
            <div
              key={period.id}
              className="mb-5 grid grid-cols-[68px_minmax(0,1fr)] gap-3"
            >
              <div className="pt-3">
                <p className="text-sm font-medium">{period.label}</p>
                <p className="mt-1 text-[9px] text-slate-400">{period.time}</p>
              </div>
              {slot(selected, period.id)}
            </div>
          ))}
        </div>
      </div>
      <div className={singleDay ? "" : "lg:hidden"}>
        {outside(selected.date)}
      </div>
      <div
        className={"print-week " + (singleDay ? "hidden" : "hidden lg:block")}
      >
        <h2 className="hidden print:block">周计划 · {weekLabel(week)}</h2>
        <table className="planner-table w-full table-fixed">
          <caption className="sr-only">
            {weekLabel(week)}课程和学习计划，按星期及上午、下午、晚上排列
          </caption>
          <colgroup>
            <col className="w-[84px]" />
            {days.map((day) => (
              <col key={day.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="p-4 text-[11px] font-normal text-slate-400"
              >
                时间段
              </th>
              {days.map((day) => (
                <th
                  scope="col"
                  key={day.id}
                  className={`border-l border-slate-100 px-2 py-4 ${day.date === today ? "bg-sky-50/80" : ""}`}
                >
                  <span
                    className={`text-sm font-semibold ${day.date === today ? "text-blue-600" : "text-slate-600"}`}
                  >
                    {day.label}
                  </span>
                  {day.date === today && (
                    <span className="ml-1 rounded bg-blue-500 px-1 py-0.5 text-[9px] font-normal text-white">
                      今
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    {day.date.slice(5).replace("-", ".")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timePeriods.map((period) => (
              <tr key={period.id}>
                <th
                  scope="row"
                  className="border-t border-slate-100 px-2 py-7 align-top"
                >
                  <span
                    aria-hidden="true"
                    className="mb-2 block text-xl font-normal text-sky-500"
                  >
                    {period.symbol}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {period.label}
                  </span>
                  <span className="mt-2 block text-[9px] font-normal text-slate-400">
                    {period.time}
                  </span>
                </th>
                {days.map((day) => (
                  <td
                    key={day.id}
                    className={`border-l border-t border-slate-100 p-2 align-top xl:p-3 ${day.date === today ? "bg-sky-50/50" : day.weekday > 5 ? "bg-slate-50/50" : ""}`}
                  >
                    {slot(day, period.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {outside()}
      </div>
      {occurrences.some((item) => item.cancelled) && (
        <div className="space-y-2 border-t border-slate-100 px-5 py-4">
          <h3 className="text-xs font-semibold text-slate-600">
            本周已取消的课程
          </h3>
          {occurrences
            .filter((item) => item.cancelled)
            .map((item) => (
              <button
                key={item.id}
                disabled={!editing}
                onClick={() => onEdit(item)}
                className="mr-2 mb-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500"
              >
                {item.course.name} · {item.originalDate} · 查看 / 恢复
              </button>
            ))}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-400">
        <span>给重要的事留出时间，也给自己留一点余地。</span>
        <span>按具体时间排序 · 无时间任务排在后面</span>
      </div>
    </section>
  );
}
