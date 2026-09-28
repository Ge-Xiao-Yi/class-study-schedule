import type { CourseOccurrence } from "@/types/course";
import { formatCountdown, todayCourseStatus } from "@/domain/today-status";

const labels = {
  empty: "今天没有课程",
  not_started: "尚未上课",
  ongoing: "正在上课",
  break: "课间休息",
  finished: "当天课程已结束",
};
export function TodayStatus({
  now,
  occurrences,
}: {
  now: Date;
  occurrences: CourseOccurrence[];
}) {
  const status = todayCourseStatus(occurrences, now);
  return (
    <section
      aria-label="今日状态"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-sky-50/80 px-5 py-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {status.date} ·{" "}
          {
            ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][
              status.weekday - 1
            ]
          }
        </p>
        <p role="status" className="mt-2 break-words text-sm text-sky-800">
          {labels[status.state]}
          {status.current.length > 0 &&
            `：${status.current.map((item) => item.course.name).join("、")}`}
        </p>
        {status.current.length > 0 && (
          <p className="mt-1 break-words text-xs text-slate-600">
            {status.current
              .map(
                (item) =>
                  `${item.course.startTime}–${item.course.endTime}${item.course.location ? " · " + item.course.location : ""}`,
              )
              .join("；")}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          今日 {status.courses.length} 节课程 · 不随浏览周改变 · 本地自动保存
        </p>
      </div>
      <div className="text-sm text-sky-800">
        <p className="mb-1 text-xs text-slate-600">
          {status.seconds === null
            ? "没有课程倒计时"
            : status.state === "finished"
              ? "今天的课程已全部结束"
              : "距离当天最后一门课结束"}
        </p>
        <p
          role="timer"
          aria-label="今日课程结束倒计时"
          aria-live="off"
          className="text-2xl font-semibold tabular-nums"
        >
          {status.seconds === null ? "—" : formatCountdown(status.seconds)}
        </p>
      </div>
    </section>
  );
}
