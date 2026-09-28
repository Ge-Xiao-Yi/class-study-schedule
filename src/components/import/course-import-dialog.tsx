import { useState } from "react";
import type { ScheduleSnapshot } from "@/types/course";
import type { ScheduleCommand } from "@/application/schedule-service";
import {
  blankImportRow,
  importFields,
  inferMapping,
  mapRows,
  previewImport,
  type FieldMapping,
  type ImportCandidate,
  type ImportField,
} from "@/domain/course-import";
import {
  parseCourseFile,
  templateBytes,
  type ImportSheet,
} from "@/lib/course-files";
import { Dialog } from "@/components/ui/dialog";
import { OcrInput } from "./ocr-input";

export function CourseImportDialog({
  snapshot,
  onSave,
  onClose,
}: {
  snapshot: ScheduleSnapshot;
  onSave: (command: ScheduleCommand) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"file" | "ocr">("file"),
    [sheets, setSheets] = useState<ImportSheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [mapping, setMapping] = useState<FieldMapping>({}),
    [rows, setRows] = useState<ImportCandidate[]>([]),
    [encoding, setEncoding] = useState("utf-8");
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [page, setPage] = useState(0);
  const preview = previewImport(rows, snapshot),
    fresh = preview.filter((r) => !r.error && !r.duplicate).length;
  const ready =
    rows.length > 0 &&
    preview.every((r) => !r.error && r.row.confirmed) &&
    fresh > 0;
  function replace(next: ImportCandidate[]) {
    setRows(next);
    setConfirm(false);
    setPage(0);
  }
  async function fileSelected(file?: File) {
    setError("");
    setSheets([]);
    replace([]);
    if (!file) return;
    setLoading(true);
    try {
      const next = await parseCourseFile(
        file.name,
        await file.arrayBuffer(),
        encoding,
        snapshot.semester,
      );
      if (!next.length) throw new Error("没有可导入的数据表。");
      setSheets(next);
      setSheetIndex(0);
      setMapping(inferMapping(next[0].headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败。");
    } finally {
      setLoading(false);
    }
  }
  async function download(format: "csv" | "xlsx") {
    try {
      const bytes = await templateBytes(format);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `课表标准模板.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function commit() {
    setSaving(true);
    setError("");
    try {
      await onSave({ type: "import-courses", rows });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败，原课程未更改。");
      setConfirm(false);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title="导入课表" wide busy={saving} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          仅追加到当前档案的当前学期，不覆盖已有课程。完全相同的课程自动跳过。所有行均需确认，错误行需修正或删除后才能提交。
        </p>
        {confirm ? (
          <div className="space-y-4">
            <p>
              将新增 {fresh} 门课程，跳过{" "}
              {preview.filter((r) => r.duplicate).length}{" "}
              门重复课程。原有课程、单周调整及任务均保留。
            </p>
            <button
              className="primary-button"
              disabled={!ready}
              onClick={() => void commit()}
            >
              确认导入课程
            </button>
            <button
              className="secondary-button"
              onClick={() => setConfirm(false)}
            >
              返回预览
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={loading}
                className="secondary-button"
                aria-pressed={mode === "file"}
                onClick={() => {
                  setMode("file");
                  replace([]);
                  setSheets([]);
                  setError("");
                }}
              >
                Excel / CSV / ICS 文件
              </button>
              <button
                disabled={loading}
                className="secondary-button"
                aria-pressed={mode === "ocr"}
                onClick={() => {
                  setMode("ocr");
                  replace([]);
                  setSheets([]);
                  setError("");
                }}
              >
                截图本地 OCR
              </button>
              <button
                disabled={loading}
                className="secondary-button"
                onClick={() => void download("xlsx")}
              >
                下载 Excel 模板
              </button>
              <button
                disabled={loading}
                className="secondary-button"
                onClick={() => void download("csv")}
              >
                下载 CSV 模板
              </button>
            </div>
            {mode === "file" ? (
              <div className="space-y-4">
                <p className="text-xs leading-6 text-slate-500">
                  支持 .xlsx / .xls / .csv / .ics，10 MB 内、每表最多 500
                  行数据和 50
                  列。一行一门课程，首行为表头；不支持合并单元格和公式。CSV 可选
                  UTF-8 或 GB18030 编码。时间使用 HH:mm，日期使用 YYYY-MM-DD。
                </p>
                <p className="text-xs leading-6 text-slate-500">
                  ICS 为 UTF-8
                  日历文件，按当前学期导入单次、每天或每周安排（支持隔周、排除日期及单次调课）。全天、跨午夜及不支持的重复规则会报错；请在预览中核对日期和时间。
                </p>
                <label className="field-label">
                  CSV 编码
                  <select
                    aria-label="CSV 编码"
                    disabled={loading}
                    value={encoding}
                    onChange={(e) => {
                      setEncoding(e.target.value);
                      setSheets([]);
                      replace([]);
                    }}
                  >
                    <option value="utf-8">UTF-8</option>
                    <option value="gb18030">GB18030 / GBK</option>
                  </select>
                </label>
                <label className="field-label">
                  课表文件
                  <input
                    disabled={loading}
                    type="file"
                    accept=".xlsx,.xls,.csv,.ics,text/calendar"
                    onChange={(e) => {
                      void fileSelected(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {!!sheets.length && (
                  <>
                    <label className="field-label">
                      工作表
                      <select
                        aria-label="工作表"
                        value={sheetIndex}
                        onChange={(e) => {
                          const i = Number(e.target.value);
                          setSheetIndex(i);
                          setMapping(inferMapping(sheets[i].headers));
                          replace([]);
                        }}
                      >
                        {sheets.map((s, i) => (
                          <option key={i} value={i}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <h3 className="font-semibold">字段映射</h3>
                    {sheets[sheetIndex].notice && (
                      <p
                        role="status"
                        className="rounded-xl bg-sky-50 p-3 text-sm leading-6"
                      >
                        {sheets[sheetIndex].notice}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {Object.entries(importFields).map(([key, label]) => (
                        <label key={key} className="field-label">
                          {label}对应列
                          <select
                            aria-label={`${label}对应列`}
                            value={mapping[key as ImportField] ?? ""}
                            onChange={(e) => {
                              setMapping({
                                ...mapping,
                                [key]:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              });
                              replace([]);
                            }}
                          >
                            <option value="">未映射 / 留空</option>
                            {sheets[sheetIndex].headers.map((h, i) => (
                              <option value={i} key={i}>
                                {h} ·{" "}
                                {sheets[sheetIndex].rows[0]?.[i]?.slice(0, 30)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        try {
                          replace(mapRows(sheets[sheetIndex].rows, mapping));
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      生成导入预览
                    </button>
                  </>
                )}
              </div>
            ) : (
              <OcrInput onRows={replace} onBusy={setLoading} />
            )}
            {loading && (
              <p role="status">正在本地解析，请稍候。此时不会写入课程。</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="secondary-button"
                disabled={loading || rows.length >= 500}
                onClick={() => {
                  setRows([
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      source: "manual",
                      confirmed: false,
                      values: blankImportRow(),
                    },
                  ]);
                  setPage(Math.floor(rows.length / 20));
                }}
              >
                手动添加课程行
              </button>
              {rows.some((r) => r.source === "file") && (
                <button
                  className="secondary-button"
                  disabled={loading}
                  onClick={() =>
                    setRows(
                      rows.map((r, i) =>
                        r.source === "file" && !preview[i].error
                          ? { ...r, confirmed: true }
                          : r,
                      ),
                    )
                  }
                >
                  确认全部有效文件行
                </button>
              )}
            </div>
            {!!rows.length && (
              <>
                <h3 className="font-semibold">
                  可编辑导入预览 · {rows.length} 行
                </h3>
                <p className="text-xs leading-6 text-slate-500">
                  空白颜色默认浅蓝，空白重复规则默认每周，空白教学周范围默认当前学期全部周。OCR
                  行的所有字段均待人工确认，尤其是课程名称、地点、节次和时间。修改任意字段后需重新确认该行。
                </p>
                <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs" aria-label="导入课程预览">
                    <thead>
                      <tr>
                        <th className="p-2">确认与校验</th>
                        {Object.values(importFields).map((label) => (
                          <th className="p-2 whitespace-nowrap" key={label}>
                            {label}
                          </th>
                        ))}
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview
                        .slice(page * 20, page * 20 + 20)
                        .map(({ row, error, duplicate }, i) => (
                          <tr
                            key={row.id}
                            className="border-t border-slate-100"
                          >
                            <td className="min-w-44 p-2">
                              <label className="flex gap-2">
                                <input
                                  type="checkbox"
                                  aria-label={`确认第 ${page * 20 + i + 1} 行`}
                                  checked={row.confirmed}
                                  disabled={!!error || loading}
                                  onChange={(e) =>
                                    setRows(
                                      rows.map((r) =>
                                        r.id === row.id
                                          ? {
                                              ...r,
                                              confirmed: e.target.checked,
                                            }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                                {row.confirmed ? "已确认" : "待确认"}
                              </label>
                              <p
                                className={
                                  error ? "text-red-700" : "text-slate-500"
                                }
                              >
                                {error ||
                                  (duplicate
                                    ? "重复课程，将跳过"
                                    : row.source === "ocr" && !row.confirmed
                                      ? "OCR：全部字段待核对"
                                      : "有效，可追加")}
                              </p>
                            </td>
                            {Object.entries(importFields).map(
                              ([key, label]) => (
                                <td key={key} className="p-1">
                                  <input
                                    className={`w-28 rounded border p-2 ${row.source === "ocr" && !row.confirmed ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
                                    title={
                                      row.source === "ocr" && !row.confirmed
                                        ? "OCR 字段待人工确认"
                                        : undefined
                                    }
                                    disabled={loading}
                                    aria-label={`第 ${page * 20 + i + 1} 行${label}`}
                                    value={row.values[key as ImportField]}
                                    onChange={(e) =>
                                      setRows(
                                        rows.map((r) =>
                                          r.id === row.id
                                            ? {
                                                ...r,
                                                confirmed: false,
                                                values: {
                                                  ...r.values,
                                                  [key]: e.target.value,
                                                },
                                              }
                                            : r,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              ),
                            )}
                            <td className="p-2">
                              <button
                                disabled={loading}
                                className="secondary-button"
                                aria-label={`删除第 ${page * 20 + i + 1} 行`}
                                onClick={() => {
                                  setRows(rows.filter((r) => r.id !== row.id));
                                  setPage(
                                    Math.min(
                                      page,
                                      Math.max(
                                        0,
                                        Math.floor((rows.length - 2) / 20),
                                      ),
                                    ),
                                  );
                                }}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    disabled={page === 0}
                    className="secondary-button"
                    onClick={() => setPage(page - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {page + 1}/{Math.ceil(rows.length / 20)}
                  </span>
                  <button
                    disabled={(page + 1) * 20 >= rows.length}
                    className="secondary-button"
                    onClick={() => setPage(page + 1)}
                  >
                    下一页
                  </button>
                  <span className="text-sm">
                    新增 {fresh} · 重复{" "}
                    {preview.filter((r) => r.duplicate).length} · 无效{" "}
                    {preview.filter((r) => r.error).length} · 未确认{" "}
                    {rows.filter((r) => !r.confirmed).length}
                  </span>
                </div>
              </>
            )}
            <button
              disabled={!ready || loading}
              className="primary-button"
              onClick={() => setConfirm(true)}
            >
              下一步：确认导入
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
