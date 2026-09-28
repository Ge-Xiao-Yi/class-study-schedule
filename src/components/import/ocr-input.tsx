/* Local image preview uses an object URL, never a server image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  defaultOcrLayout,
  recognizeCourses,
  type OcrLayout,
} from "@/lib/local-ocr";
import type { ImportCandidate } from "@/domain/course-import";
export function OcrInput({
  onRows,
  onBusy,
}: {
  onRows: (rows: ImportCandidate[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [layout, setLayout] = useState(defaultOcrLayout),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [text, setText] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  useEffect(() => () => abort.current?.abort(), []);
  async function recognize() {
    if (!file) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    onBusy(true);
    setText("");
    onRows([]);
    try {
      const result = await recognizeCourses(
        file,
        layout,
        controller.signal,
        setMessage,
      );
      if (!controller.signal.aborted) {
        setText(result.text);
        onRows(result.rows);
        setMessage(
          result.rows.length
            ? `已提取 ${result.rows.length} 行，请逐项修正并确认。`
            : "未识别到课程，请使用手动添加行。",
        );
      }
    } catch (e) {
      setMessage(
        `识别未完成：${e instanceof Error ? e.message : "无法读取图片"} 请重试或使用“手动添加课程行”。`,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="space-y-4 rounded-xl border border-sky-100 p-4">
      <p className="text-sm leading-6 text-slate-500">
        图片不上传。支持清晰的中英文印刷截图；规则网格须为周一至周日七列等宽、每格一门课程。请将区域边界设在课程内容边缘，排除星期表头和节次侧栏。无法识别的字段需手动补充。
      </p>
      <label className="field-label">
        课表截图
        <input
          disabled={busy}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            setFile(next);
            setUrl(next ? URL.createObjectURL(next) : "");
            setMessage("");
            setText("");
            onRows([]);
          }}
        />
      </label>
      {file && (
        <>
          <label className="field-label">
            识别布局
            <select
              aria-label="识别布局"
              disabled={busy}
              value={layout.mode}
              onChange={(e) =>
                setLayout({
                  ...layout,
                  mode: e.target.value as OcrLayout["mode"],
                })
              }
            >
              <option value="text">文字行 / 单个课程区域</option>
              <option value="grid">规则七天网格（每格一门课程）</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["left", "左边界"],
                ["top", "上边界"],
                ["right", "右边界"],
                ["bottom", "下边界"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="field-label">
                {label}（%）
                <input
                  disabled={busy}
                  type="number"
                  min={0}
                  max={100}
                  value={layout[key]}
                  onChange={(e) =>
                    setLayout({ ...layout, [key]: e.target.valueAsNumber })
                  }
                />
              </label>
            ))}
          </div>
          {layout.mode === "grid" && (
            <label className="field-label">
              网格课程行数
              <input
                disabled={busy}
                type="number"
                min={1}
                max={12}
                value={layout.rows}
                onChange={(e) =>
                  setLayout({ ...layout, rows: e.target.valueAsNumber })
                }
              />
            </label>
          )}
          {url && (
            <div className="relative mx-auto max-w-xl overflow-hidden">
              <img src={url} alt="待识别课表截图" className="w-full" />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute grid border-2 border-blue-500 bg-blue-200/10"
                style={{
                  left: `${layout.left}%`,
                  top: `${layout.top}%`,
                  width: `${layout.right - layout.left}%`,
                  height: `${layout.bottom - layout.top}%`,
                  gridTemplateColumns: `repeat(${layout.mode === "grid" ? 7 : 1},1fr)`,
                  gridTemplateRows: `repeat(${layout.mode === "grid" ? layout.rows : 1},1fr)`,
                }}
              >
                {Array.from(
                  {
                    length:
                      layout.mode === "grid"
                        ? 7 * Math.min(12, Math.max(1, layout.rows || 1))
                        : 1,
                  },
                  (_, i) => (
                    <span key={i} className="border border-blue-400/50" />
                  ),
                )}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              disabled={busy}
              className="secondary-button"
              onClick={() => void recognize()}
            >
              开始本地识别
            </button>
            {busy && (
              <button
                className="secondary-button"
                onClick={() => abort.current?.abort()}
              >
                取消识别
              </button>
            )}
          </div>
        </>
      )}
      {message && (
        <p role="status" className="text-sm text-sky-700">
          {message}
        </p>
      )}
      {text && (
        <details>
          <summary>识别原文（供核对）</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
            {text}
          </pre>
        </details>
      )}
    </div>
  );
}
