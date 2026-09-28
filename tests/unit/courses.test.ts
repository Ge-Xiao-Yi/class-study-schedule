import { describe, expect, it } from "vitest";
import {
  courseFields,
  occurrencePeriods,
  occursOn,
  resolveWeek,
  validateCourse,
  validateFields,
} from "../../src/domain/courses";
import { course, draft, seed, semester } from "./fixtures";

describe("课程模板与单次排课", () => {
  it("重复范围首尾均包含，星期必须匹配", () => {
    const limited = { ...course, startWeek: 2, endWeek: 3 };
    expect(occursOn(limited, "2026-09-03", semester)).toBe(false);
    expect(occursOn(limited, "2026-09-10", semester)).toBe(true);
    expect(occursOn(limited, "2026-09-17", semester)).toBe(true);
    expect(occursOn(limited, "2026-09-18", semester)).toBe(false);
    expect(occursOn(limited, "2026-09-24", semester)).toBe(false);
  });
  it("仅本周只出现一次，也可在学期外", () => {
    const snapshot = seed();
    snapshot.courses[0] = {
      ...course,
      repeatType: "once",
      occurrenceDate: "2027-01-07",
    };
    expect(resolveWeek(snapshot, "2027-01-04")).toHaveLength(1);
    expect(resolveWeek(snapshot, "2027-01-11")).toHaveLength(0);
  });
  it("计算多个周从不写入或复制模板", () => {
    const snapshot = seed();
    const before = structuredClone(snapshot);
    for (let index = 0; index < 30; index++) {
      expect(resolveWeek(snapshot, "2026-09-21")).toHaveLength(1);
      expect(resolveWeek(snapshot, "2026-09-28")).toHaveLength(1);
    }
    expect(snapshot).toEqual(before);
    expect(snapshot.courses).toHaveLength(1);
  });
  it("不显示其他档案或学期的课程", () => {
    expect(
      occursOn({ ...course, profileId: "other" }, "2026-09-24", semester),
    ).toBe(false);
    expect(
      occursOn({ ...course, semesterId: "other" }, "2026-09-24", semester),
    ).toBe(false);
  });
  it("同格课程按开始时间稳定排序", () => {
    const snapshot = seed();
    snapshot.courses.push({
      ...course,
      id: "earlier",
      startTime: "07:00",
      endTime: "08:00",
    });
    expect(
      resolveWeek(snapshot, "2026-09-21").map((item) => item.courseId),
    ).toEqual(["earlier", "course-1"]);
  });
});

describe("跨时段投影和校验", () => {
  it.each([
    ["08:00", "12:00", ["morning"]],
    ["12:00", "18:00", ["afternoon"]],
    ["18:00", "23:59", ["evening"]],
    ["11:00", "14:00", ["morning", "afternoon"]],
    ["17:00", "19:00", ["afternoon", "evening"]],
    ["01:00", "20:00", ["morning", "afternoon", "evening"]],
  ])("%s–%s 覆盖 %j", (startTime, endTime, periods) =>
    expect(occurrencePeriods({ ...course, startTime, endTime })).toEqual(
      periods,
    ),
  );
  it("跨段不拆分身份或生成额外实例", () => {
    const snapshot = seed();
    snapshot.courses[0].endTime = "14:00";
    const result = resolveWeek(snapshot, "2026-09-21");
    expect(result).toHaveLength(1);
    expect(result[0].courseId).toBe(course.id);
    expect(occurrencePeriods(result[0].course)).toHaveLength(2);
  });
  it("拒绝空白名称、反向时间、跨午夜和非法重复范围", () => {
    expect(() => validateFields({ ...draft, name: "  " })).toThrow("名称");
    expect(() => validateFields({ ...draft, endTime: "08:00" })).toThrow(
      "结束时间",
    );
    expect(() =>
      validateFields({ ...draft, startTime: "23:00", endTime: "01:00" }),
    ).toThrow("跨午夜");
    expect(() => validateFields({ ...draft, startTime: "24:00" })).toThrow(
      "有效",
    );
    expect(() =>
      validateCourse({ ...draft, startWeek: 3, endWeek: 2 }, semester),
    ).toThrow("教学周");
    expect(() => validateCourse({ ...draft, endWeek: 17 }, semester)).toThrow(
      "教学周",
    );
    expect(() =>
      validateCourse({ ...draft, startWeek: 1.5 }, semester),
    ).toThrow("教学周");
    expect(() =>
      validateCourse(
        { ...draft, repeatType: "once", occurrenceDate: "2026-09-25" },
        semester,
      ),
    ).toThrow("星期");
  });
});

describe("单周例外投影", () => {
  it("改到本周另一日只显示一份，保留原身份，其他周不变", () => {
    const snapshot = seed();
    snapshot.exceptions.push({
      id: "ex-1",
      profileId: course.profileId,
      courseId: course.id,
      originalDate: "2026-09-24",
      action: "modify",
      overrides: {
        name: "调课",
        weekday: 6,
        startTime: "11:00",
        endTime: "14:00",
      },
      createdAt: course.createdAt,
    });
    const [item] = resolveWeek(snapshot, "2026-09-21");
    expect(item.date).toBe("2026-09-26");
    expect(item.originalDate).toBe("2026-09-24");
    expect(item.courseId).toBe(course.id);
    expect(item.course.name).toBe("调课");
    expect(resolveWeek(snapshot, "2026-09-28")[0].course).toEqual(course);
    expect(snapshot.courses[0]).toEqual(course);
  });
  it("取消留下可恢复投影；移除例外恢复原课程", () => {
    const snapshot = seed();
    snapshot.exceptions.push({
      id: "ex-1",
      profileId: course.profileId,
      courseId: course.id,
      originalDate: "2026-09-24",
      action: "cancel",
      overrides: {},
      createdAt: course.createdAt,
    });
    expect(resolveWeek(snapshot, "2026-09-21")[0].cancelled).toBe(true);
    expect(resolveWeek(snapshot, "2026-09-28")[0].cancelled).toBe(false);
    snapshot.exceptions = [];
    expect(courseFields(resolveWeek(snapshot, "2026-09-21")[0].course)).toEqual(
      courseFields(course),
    );
  });
});
