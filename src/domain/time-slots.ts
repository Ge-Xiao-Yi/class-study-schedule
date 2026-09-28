import type { TimeSlot } from "../types/archive";
import type { PeriodId } from "../types/schedule";

export type TimeSlotDraft = Pick<TimeSlot, "period" | "startTime" | "endTime">;
export interface TimePeriod {
  id: PeriodId;
  label: string;
  symbol: string;
  start: string;
  end: string;
  time: string;
  defaultStart: string;
  defaultEnd: string;
}
export const timePeriods: TimePeriod[] = [
  {
    id: "morning",
    label: "上午",
    symbol: "◔",
    start: "00:00",
    end: "12:00",
    time: "00:00–12:00",
    defaultStart: "08:00",
    defaultEnd: "09:40",
  },
  {
    id: "afternoon",
    label: "下午",
    symbol: "☀",
    start: "12:00",
    end: "18:00",
    time: "12:00–18:00",
    defaultStart: "14:00",
    defaultEnd: "15:40",
  },
  {
    id: "evening",
    label: "晚上",
    symbol: "☾",
    start: "18:00",
    end: "24:00",
    time: "18:00–24:00",
    defaultStart: "19:00",
    defaultEnd: "20:40",
  },
];
export function validateTimeSlots(slots: TimeSlotDraft[]) {
  if (slots.length !== 3 || new Set(slots.map((s) => s.period)).size !== 3)
    throw new Error("必须设置上午、下午、晚上三个时间段。");
  let previous = "00:00";
  for (const period of timePeriods) {
    const slot = slots.find((s) => s.period === period.id);
    if (
      !slot ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) ||
      !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(slot.endTime)
    )
      throw new Error("请输入有效的时间段边界。");
    if (slot.endTime <= slot.startTime)
      throw new Error("每个时间段的结束时间必须晚于开始时间，不支持跨午夜。");
    if (slot.startTime < previous)
      throw new Error(
        "上午、下午、晚上须按时间先后排列，不能重叠；可以留空隙。",
      );
    previous = slot.endTime;
  }
}
export function getTimePeriods(slots?: TimeSlotDraft[]): TimePeriod[] {
  if (!slots) return timePeriods;
  validateTimeSlots(slots);
  return timePeriods.map((period) => {
    const slot = slots.find((s) => s.period === period.id)!;
    const start =
      period.defaultStart >= slot.startTime &&
      period.defaultStart < slot.endTime
        ? period.defaultStart
        : slot.startTime;
    const latestEnd = slot.endTime === "24:00" ? "23:59" : slot.endTime;
    const defaultStart = start < latestEnd ? start : slot.startTime;
    const defaultEnd =
      latestEnd <= defaultStart
        ? ""
        : period.defaultEnd > defaultStart && period.defaultEnd <= latestEnd
          ? period.defaultEnd
          : latestEnd;
    return {
      ...period,
      start: slot.startTime,
      end: slot.endTime,
      time: `${slot.startTime}–${slot.endTime}`,
      defaultStart,
      defaultEnd,
    };
  });
}
