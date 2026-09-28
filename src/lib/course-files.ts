import { MAX_IMPORT_ROWS, importFields } from "../domain/course-import";
import type { Semester } from "../types/course";
export interface ImportSheet {
  notice?: string;
  name: string;
  headers: string[];
  rows: string[][];
}
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [],
    row: string[] = [];
  let cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error("CSV 引号格式错误。");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push([...row]);
        row.length = 0;
      }
    } else {
      if (closed) throw new Error("CSV 引号后存在非法字符。");
      cell += c;
    }
    if (
      rows.length > MAX_IMPORT_ROWS + 1 ||
      row.length > 50 ||
      cell.length > 10000
    )
      throw new Error("文件超过行列或单元格大小限制。");
  }
  if (quoted) throw new Error("CSV 引号未闭合。");
  if (cell || row.length || closed) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function toSheet(name: string, table: string[][]): ImportSheet {
  const nonempty = table.filter((r) => r.some((v) => v.trim()));
  if (nonempty.length < 2 || nonempty.length > MAX_IMPORT_ROWS + 1)
    throw new Error(`文件需包含表头及 1–${MAX_IMPORT_ROWS} 行数据。`);
  const headers = nonempty[0].map((v) => v.trim());
  if (
    headers.length > 50 ||
    headers.some((v) => !v) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("表头不能为空、重复或超过 50 列。");
  if (
    nonempty
      .slice(1)
      .some((r) => r.length > headers.length || r.some((v) => v.length > 10000))
  )
    throw new Error("数据列超出表头或单元格过长。");
  return { name, headers, rows: nonempty.slice(1) };
}
export async function parseCourseFile(
  name: string,
  data: ArrayBuffer,
  encoding = "utf-8",
  semester?: Semester,
): Promise<ImportSheet[]> {
  if (!data.byteLength || data.byteLength > 10 * 1024 * 1024)
    throw new Error("文件不能为空，且不能超过 10 MB。");
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "ics") {
    if (!semester) throw new Error("ICS 导入需要当前学期设置。");
    const { parseIcsCourses } = await import("./ics-courses");
    return [
      parseIcsCourses(
        new TextDecoder("utf-8", { fatal: true }).decode(data),
        semester,
      ),
    ];
  }
  if (ext === "csv")
    return [
      toSheet(
        name,
        parseCsv(new TextDecoder(encoding, { fatal: true }).decode(data)),
      ),
    ];
  if (ext !== "xlsx" && ext !== "xls")
    throw new Error("仅支持 .xlsx、.xls、.csv 和 .ics 文件。");
  const bytes = new Uint8Array(data);
  if (
    !(bytes[0] === 0x50 && bytes[1] === 0x4b) &&
    !(bytes[0] === 0xd0 && bytes[1] === 0xcf)
  )
    throw new Error("文件内容不是有效的 Excel 工作簿。");
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, {
    type: "array",
    cellFormula: true,
    sheetRows: MAX_IMPORT_ROWS + 2,
  });
  if (book.SheetNames.length > 20) throw new Error("工作表过多，最多 20 张。");
  return book.SheetNames.filter((n) => book.Sheets[n]["!ref"]).map((name) => {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]!);
    if (range.e.r > MAX_IMPORT_ROWS || range.e.c >= 50)
      throw new Error("工作表超过 500 行数据或 50 列，请拆分后导入。");
    if (sheet["!merges"]?.length)
      throw new Error("请使用一行一门课程的标准表格，不支持合并单元格。");
    if (
      Object.entries(sheet).some(
        ([key, cell]) => !key.startsWith("!") && cell.f,
      )
    )
      throw new Error("导入不支持公式，请先粘贴为值。");
    return toSheet(
      name,
      XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }),
    );
  });
}
export async function templateBytes(
  format: "csv" | "xlsx",
): Promise<Uint8Array> {
  const rows = [
    Object.values(importFields),
    [
      "示例课程",
      "A101",
      "张老师",
      "1",
      "1–2",
      "08:00",
      "09:40",
      "blue",
      "weekly",
      "1",
      "1",
      "",
    ],
  ];
  if (format === "csv")
    return new TextEncoder().encode(
      "\uFEFF" +
        rows
          .map((r) =>
            r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
          )
          .join("\r\n"),
    );
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "课表");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}
