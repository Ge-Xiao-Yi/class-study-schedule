import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsv,
  parseCourseFile,
  templateBytes,
} from "../../src/lib/course-files";
import {
  blankImportRow,
  inferMapping,
  mapRows,
  previewImport,
  applyCourseImport,
  rowsFromOcr,
} from "../../src/domain/course-import";
import { seed, semester } from "./fixtures";
const buffer = (s: string) => new TextEncoder().encode(s).buffer;
describe("文件解析与映射", () => {
  it("RFC CSV BOM、引号、逗号、换行与空值", () =>
    expect(parseCsv('\uFEFF名称,地点\r\n"阅读,写作","A""1\n教室"\r\n')).toEqual(
      [
        ["名称", "地点"],
        ["阅读,写作", 'A"1\n教室'],
      ],
    ));
  it.each(['a,b\n"未闭合', 'a,b\n"a"x,b', 'a,b\na"b,c'])(
    "拒绝破损引号 %s",
    (csv) => expect(() => parseCsv(csv)).toThrow(),
  );
  it.each(["csv", "xlsx"] as const)(
    "标准 %s 模板可解析、映射、预览",
    async (format) => {
      const bytes = await templateBytes(format);
      const [sheet] = await parseCourseFile(
        `模板.${format}`,
        new Uint8Array(bytes).buffer,
      );
      const rows = mapRows(sheet.rows, inferMapping(sheet.headers));
      expect(previewImport(rows, seed())[0].error).toBe("");
      expect(previewImport(rows, seed())[0].draft?.weekday).toBe(1);
    },
  );
  it("XLS 及多工作表选择，不按列位置猜字段", async () => {
    const book = XLSX.utils.book_new();
    for (const name of ["甲", "乙"])
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          ["时间结束", "课程", "星期", "开始时间"],
          ["10:00", name, "周二", "8:00"],
        ]),
        name,
      );
    const sheets = await parseCourseFile(
      "a.xls",
      XLSX.write(book, { type: "array", bookType: "biff8" }),
    );
    expect(sheets).toHaveLength(2);
    const m = { ...inferMapping(sheets[1].headers), endTime: 0 };
    const p = previewImport(mapRows(sheets[1].rows, m), seed());
    expect(p[0].draft?.name).toBe("乙");
    expect(p[0].draft?.startTime).toBe("08:00");
    expect(() => mapRows(sheets[0].rows, { name: 0, location: 0 })).toThrow(
      "多个字段",
    );
  });
  it.each([
    ["坏.xlsx", "garbage"],
    ["a.csv", "课程,课程\nx,y"],
    ["a.csv", "课程\n"],
    ["a.json", "{}"],
    ["a.csv", ""],
    ["a.csv", "a,b\nx,y,z"],
  ])("拒绝无效文件 %s", async (name, text) => {
    await expect(parseCourseFile(name, buffer(text))).rejects.toThrow();
  });
  it("拒绝公式、合并、超大文件和过多数据行", async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["课程"], ["abc"]]);
    sheet.A2 = { t: "n", v: 2, f: "1+1" };
    XLSX.utils.book_append_sheet(book, sheet, "a");
    await expect(
      parseCourseFile(
        "a.xlsx",
        XLSX.write(book, { type: "array", bookType: "xlsx" }),
      ),
    ).rejects.toThrow("公式");
    delete sheet.A2.f;
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    await expect(
      parseCourseFile(
        "a.xlsx",
        XLSX.write(book, { type: "array", bookType: "xlsx" }),
      ),
    ).rejects.toThrow("合并");
    await expect(
      parseCourseFile("a.csv", new ArrayBuffer(10 * 1024 * 1024 + 1)),
    ).rejects.toThrow();
    await expect(
      parseCourseFile(
        "a.csv",
        buffer("课程\n" + Array(501).fill("abc").join("\n")),
      ),
    ).rejects.toThrow();
  });
  it("OCR 全部待确认，缺失字段不猜测，确认之前无法写入", () => {
    const rows = rowsFromOcr("Math 周一 08:00-09:40\n只有名称");
    expect(rows[0].values.startTime).toBe("08:00");
    expect(rows.every((r) => !r.confirmed)).toBe(true);
    expect(previewImport(rows, seed())[1].error).not.toBe("");
    expect(() =>
      applyCourseImport(seed(), rows, semester.profileId, "now"),
    ).toThrow("确认");
  });
  it("整批校验失败不改变输入，重复批次幂等且不覆盖现有课程", () => {
    const state = seed(),
      before = structuredClone(state);
    const row = {
      id: "a",
      source: "manual" as const,
      confirmed: true,
      values: {
        ...blankImportRow(),
        name: "导入",
        weekday: "四",
        startTime: "08:00",
        endTime: "09:00",
      },
    };
    expect(() =>
      applyCourseImport(
        state,
        [row, { ...row, id: "b", values: { ...row.values, endTime: "07:00" } }],
        semester.profileId,
        "now",
      ),
    ).toThrow("无效");
    expect(state).toEqual(before);
    const next = applyCourseImport(
      state,
      [row, { ...row, id: "b" }],
      semester.profileId,
      "now",
    );
    expect(next.courses).toHaveLength(2);
    expect(next.courses[0]).toEqual(before.courses[0]);
    expect(applyCourseImport(next, [row], semester.profileId, "now")).toEqual(
      next,
    );
  });
});
