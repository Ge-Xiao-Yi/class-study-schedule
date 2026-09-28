import { useState, type FormEvent } from "react";
import type {
  Course,
  CourseDraft,
  CourseOccurrence,
  Semester,
  Weekday,
} from "@/types/course";
import type { PeriodId } from "@/types/schedule";
import type { ScheduleCommand } from "@/application/schedule-service";
import { courseColors, courseFields } from "@/domain/courses";
import { getTimePeriods } from "@/domain/time-slots";
import type { TimeSlot } from "@/types/archive";
import { dateForWeekday, teachingWeek } from "@/domain/dates";
import { Dialog } from "@/components/ui/dialog";

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export interface CourseEditorTarget {
  template?: Course;
  occurrence?: CourseOccurrence;
  weekday: Weekday;
  period: PeriodId;
}

export function CourseDialog({
  target,
  week,
  semester,
  timeSlots,
  onSave,
  onClose,
}: {
  target: CourseEditorTarget;
  week: string;
  semester: Semester;
  timeSlots?: TimeSlot[];
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { template, occurrence } = target;
  const period = getTimePeriods(timeSlots).find(
    (item) => item.id === target.period,
  )!;
  const defaultDraft: CourseDraft = {
    name: "",
    location: "",
    teacher: "",
    sectionText: "",
    weekday: target.weekday,
    startTime: period.defaultStart,
    endTime: period.defaultEnd,
    color: "blue",
    repeatType: "weekly",
    startWeek:
      teachingWeek(dateForWeekday(week, target.weekday), semester) ?? 1,
    endWeek: semester.teachingWeeks,
    occurrenceDate: null,
  };
  const [scope, setScope] = useState<"week" | "all">(
    occurrence && template?.repeatType === "weekly" ? "week" : "all",
  );
  const [draft, setDraft] = useState<CourseDraft>(
    occurrence?.course ?? template ?? defaultDraft,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const singleEdit = scope === "week" && !!occurrence;
  const update = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) =>
    setDraft({ ...draft, [key]: value });
  async function run(command: ScheduleCommand) {
    setBusy(true);
    setError("");
    try {
      await onSave(command);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (singleEdit)
      void run({
        type: "modify-occurrence",
        courseId: template!.id,
        originalDate: occurrence!.originalDate,
        fields: courseFields(draft),
      });
    else
      void run({
        type: "save-course",
        id: template?.id,
        draft: {
          ...draft,
          occurrenceDate:
            draft.repeatType === "once"
              ? dateForWeekday(
                  template?.repeatType === "once" && template.occurrenceDate
                    ? template.occurrenceDate
                    : week,
                  draft.weekday,
                )
              : null,
        },
      });
  }
  return (
    <Dialog
      title={confirmDelete ? "删除课程" : template ? "编辑课程" : "新增课程"}
      onClose={onClose}
      busy={busy}
    >
      {confirmDelete ? (
        <div className="space-y-5">
          <p className="text-sm leading-7">
            确定删除「{template?.name}
            」吗？这会删除该课程模板及其全部单周例外，所有周均不再显示。只想取消本周，请返回编辑并选择“取消本周课程”。
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="danger-button"
              onClick={() =>
                void run({ type: "delete-course", courseId: template!.id })
              }
            >
              确认删除全部安排
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary-button"
              onClick={() => setConfirmDelete(false)}
            >
              返回编辑
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {occurrence && template?.repeatType === "weekly" && (
            <fieldset className="flex flex-wrap gap-4 rounded-xl bg-sky-50 p-3 text-sm">
              <legend className="sr-only">修改范围</legend>
              {(["week", "all"] as const).map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="edit-scope"
                    checked={scope === value}
                    onChange={() => {
                      setScope(value);
                      setDraft(value === "week" ? occurrence.course : template);
                      setError("");
                    }}
                  />
                  {value === "week" ? "仅修改本周" : "修改整个课程"}
                </label>
              ))}
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field-label sm:col-span-2">
              课程名称
              <input
                autoFocus
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label className="field-label">
              地点
              <input
                maxLength={100}
                value={draft.location}
                onChange={(event) => update("location", event.target.value)}
                placeholder="例如：教学楼 A · 302"
              />
            </label>
            <label className="field-label">
              教师
              <input
                maxLength={100}
                value={draft.teacher}
                onChange={(event) => update("teacher", event.target.value)}
              />
            </label>
            <label className="field-label">
              星期
              <select
                aria-label="星期"
                value={draft.weekday}
                onChange={(event) =>
                  update("weekday", Number(event.target.value) as Weekday)
                }
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              节次
              <input
                maxLength={100}
                value={draft.sectionText}
                onChange={(event) => update("sectionText", event.target.value)}
                placeholder="例如：第 1–2 节"
              />
            </label>
            <label className="field-label">
              开始时间
              <input
                required
                type="time"
                value={draft.startTime}
                onChange={(event) => update("startTime", event.target.value)}
              />
            </label>
            <label className="field-label">
              结束时间
              <input
                required
                type="time"
                value={draft.endTime}
                onChange={(event) => update("endTime", event.target.value)}
              />
            </label>
            <label className="field-label">
              颜色
              <select
                aria-label="颜色"
                value={draft.color}
                onChange={(event) =>
                  update("color", event.target.value as CourseDraft["color"])
                }
              >
                {Object.entries(courseColors).map(([value, color]) => (
                  <option key={value} value={value}>
                    {color.label}
                  </option>
                ))}
              </select>
            </label>
            {!singleEdit && (
              <label className="field-label">
                重复规则
                <select
                  aria-label="重复规则"
                  value={draft.repeatType}
                  onChange={(event) =>
                    update(
                      "repeatType",
                      event.target.value as CourseDraft["repeatType"],
                    )
                  }
                >
                  <option value="weekly">每周重复</option>
                  <option value="once">仅本周（一次）</option>
                </select>
              </label>
            )}
            {!singleEdit && draft.repeatType === "weekly" && (
              <>
                <label className="field-label">
                  开始教学周
                  <input
                    required
                    type="number"
                    min={1}
                    max={semester.teachingWeeks}
                    step={1}
                    value={draft.startWeek}
                    onChange={(event) =>
                      update("startWeek", Number(event.target.value))
                    }
                  />
                </label>
                <label className="field-label">
                  结束教学周
                  <input
                    required
                    type="number"
                    min={1}
                    max={semester.teachingWeeks}
                    step={1}
                    value={draft.endWeek}
                    onChange={(event) =>
                      update("endWeek", Number(event.target.value))
                    }
                  />
                </label>
              </>
            )}
          </div>
          <p className="text-xs leading-6 text-slate-500">
            {singleEdit
              ? "本次变动只作用于当前自然周，不改变课程模板。"
              : draft.repeatType === "once"
                ? `单次日期：${dateForWeekday(template?.repeatType === "once" && template.occurrenceDate ? template.occurrenceDate : week, draft.weekday)}。`
                : `学期 ${semester.startDate} 至 ${semester.endDate}，共 ${semester.teachingWeeks} 个教学周。`}{" "}
            结束时间必须晚于开始时间；跨时间段课程会在各对应格显示。
          </p>
          {template && !singleEdit && (
            <p className="text-xs leading-6 text-slate-500">
              修改整个课程会影响所有符合重复规则的周；已有单周例外保留，改变星期时仍关联原自然周。
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} className="primary-button">
              {busy ? "保存中…" : "保存课程"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary-button"
              onClick={onClose}
            >
              放弃修改
            </button>
          </div>
          {template && (
            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              {occurrence && !occurrence.cancelled && (
                <button
                  type="button"
                  disabled={busy}
                  className="secondary-button"
                  onClick={() =>
                    void run({
                      type: "cancel-occurrence",
                      courseId: template.id,
                      originalDate: occurrence.originalDate,
                    })
                  }
                >
                  取消本周课程
                </button>
              )}
              {occurrence?.exception && (
                <button
                  type="button"
                  disabled={busy}
                  className="secondary-button"
                  onClick={() =>
                    void run({
                      type: "restore-occurrence",
                      courseId: template.id,
                      originalDate: occurrence.originalDate,
                    })
                  }
                >
                  恢复原安排
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className="danger-button"
                onClick={() => {
                  setConfirmDelete(true);
                  setError("");
                }}
              >
                删除整个课程
              </button>
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}
