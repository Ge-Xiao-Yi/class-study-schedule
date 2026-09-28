import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  calendarDaysBetween,
  dateForWeekday,
  localDate,
  parseDate,
  startOfWeek,
  teachingWeek,
  weekDates,
  weekday,
} from "../../src/domain/dates";
import { validateSemester } from "../../src/domain/courses";
import { semester } from "./fixtures";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("本地自然日与周一开始的自然周", () => {
  it.each([
    ["2026-09-21", "2026-09-21"],
    ["2026-09-27", "2026-09-21"],
    ["2027-01-01", "2026-12-28"],
    ["2024-03-01", "2024-02-26"],
  ])("%s 的周一是 %s", (date, monday) =>
    expect(startOfWeek(date)).toBe(monday),
  );
  it("跨年和闰年跳转不丢日期", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekDates("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(dateForWeekday("2026-09-27", 1)).toBe("2026-09-21");
    expect(weekday("2026-09-27")).toBe(7);
  });
  it.each([
    "2026-02-29",
    "2024-02-30",
    "2026-13-01",
    "2026-9-01",
    "",
    "2026-09-01T00:00:00Z",
  ])("拒绝无效日期 %s", (date) => expect(() => parseDate(date)).toThrow());
  it.each(["Asia/Shanghai", "America/New_York"])(
    "%s 时区：本地午夜与夏令时不偏移",
    (zone) => {
      process.env.TZ = zone;
      expect(localDate(new Date(2026, 8, 24, 0, 5))).toBe("2026-09-24");
      expect(localDate(new Date(2026, 8, 24, 23, 55))).toBe("2026-09-24");
      expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
      expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
      expect(calendarDaysBetween("2026-03-02", "2026-03-16")).toBe(14);
      expect(calendarDaysBetween("2026-10-26", "2026-11-09")).toBe(14);
    },
  );
});

describe("教学周边界", () => {
  it("开学所在自然周为第 1 周，但开学前不排课", () => {
    expect(teachingWeek("2026-09-01", semester)).toBeNull();
    expect(teachingWeek("2026-09-02", semester)).toBe(1);
    expect(teachingWeek("2026-09-06", semester)).toBe(1);
    expect(teachingWeek("2026-09-07", semester)).toBe(2);
    expect(teachingWeek("2026-12-20", semester)).toBe(16);
    expect(teachingWeek("2026-12-21", semester)).toBeNull();
  });
  it("教学周数和结束日期都限制重复范围", () => {
    expect(
      teachingWeek("2026-09-14", { ...semester, teachingWeeks: 2 }),
    ).toBeNull();
    expect(
      teachingWeek("2026-09-10", { ...semester, endDate: "2026-09-09" }),
    ).toBeNull();
  });
  it("学期范围和教学周数验证", () => {
    expect(() => validateSemester(semester)).not.toThrow();
    expect(() =>
      validateSemester({ ...semester, endDate: "2026-09-01" }),
    ).toThrow("结束日期");
    for (const teachingWeeks of [0, 1.5, 17, NaN])
      expect(() => validateSemester({ ...semester, teachingWeeks })).toThrow(
        "教学周数",
      );
  });
});
