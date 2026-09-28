import { rowsFromOcr, type ImportCandidate } from "../domain/course-import";
export interface OcrLayout {
  mode: "text" | "grid";
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: number;
}
export const defaultOcrLayout: OcrLayout = {
  mode: "text",
  left: 0,
  top: 0,
  right: 100,
  bottom: 100,
  rows: 3,
};
export async function recognizeCourses(
  file: File,
  layout: OcrLayout,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<{ text: string; rows: ImportCandidate[] }> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("请选择 10 MB 内的 PNG、JPEG 或 WebP 截图。");
  if (
    ![layout.left, layout.top, layout.right, layout.bottom].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 100,
    ) ||
    layout.left >= layout.right ||
    layout.top >= layout.bottom ||
    !Number.isInteger(layout.rows) ||
    layout.rows < 1 ||
    layout.rows > 12
  )
    throw new Error("请设置有效的识别区域及 1–12 行网格。");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 12000000) {
    bitmap.close();
    throw new Error("截图不能超过 1200 万像素，请先缩小。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { createWorker, PSM } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let cancelled = false;
  let rejectAbort: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => {
    cancelled = true;
    void worker?.terminate();
    rejectAbort(new Error("识别已取消，可手动补充课程。"));
  };
  const timeout = setTimeout(cancel, 180000);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new Error("识别已取消。");
    const work = async () => {
      worker = await createWorker(["chi_sim", "eng"], 1, {
        workerPath: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ocr/v7/worker.min.js`,
        corePath: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ocr/v7`,
        langPath: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ocr/v7`,
        errorHandler: (error: unknown) => {
          cancelled = true;
          rejectAbort(
            new Error(`识别失败：${String(error)}。可手动补充课程。`),
          );
        },
        logger: (m) =>
          progress(`本地识别 ${Math.round(m.progress * 100)}% · ${m.status}`),
      });
      if (signal.aborted || cancelled) {
        await worker.terminate();
        throw new Error("识别已取消。");
      }
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      const left = (canvas.width * layout.left) / 100,
        top = (canvas.height * layout.top) / 100,
        width = (canvas.width * (layout.right - layout.left)) / 100,
        height = (canvas.height * (layout.bottom - layout.top)) / 100;
      const cols = layout.mode === "grid" ? 7 : 1,
        rowCount = layout.mode === "grid" ? layout.rows : 1;
      let text = "";
      const rows: ImportCandidate[] = [];
      for (let r = 0; r < rowCount; r++)
        for (let c = 0; c < cols; c++) {
          if (signal.aborted) throw new Error("识别已取消。");
          progress(`识别区域 ${r * cols + c + 1}/${rowCount * cols}`);
          const result = await worker.recognize(canvas, {
            rectangle: {
              left: Math.round(left + (c * width) / cols),
              top: Math.round(top + (r * height) / rowCount),
              width: Math.max(1, Math.floor(width / cols)),
              height: Math.max(1, Math.floor(height / rowCount)),
            },
          });
          const content = result.data.text.trim();
          text += `${layout.mode === "grid" ? `[周${c + 1} 第${r + 1}行] ` : ""}${content}\n`;
          const extracted = rowsFromOcr(
            layout.mode === "grid"
              ? content.replace(/\s*\n\s*/g, " ")
              : content,
          );
          rows.push(
            ...extracted.map((item) => ({
              ...item,
              id: crypto.randomUUID(),
              values: {
                ...item.values,
                weekday:
                  layout.mode === "grid" ? String(c + 1) : item.values.weekday,
              },
            })),
          );
        }
      return { text, rows };
    };
    return await Promise.race([work(), interrupted]);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    await worker?.terminate();
    canvas.width = 0;
    canvas.height = 0;
  }
}
