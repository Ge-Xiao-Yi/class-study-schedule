export function saveWeekImage(
  title: string,
  headings: string[],
  rows: string[][],
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片导出");
  const widths = [130, ...headings.slice(1).map(() => 242)];
  const font = "17px system-ui, sans-serif";
  ctx.font = font;
  function wrap(value: string, width: number) {
    return value.split("\n").flatMap((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const char of paragraph) {
        if (ctx!.measureText(line + char).width > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      return [...lines, line];
    });
  }
  const grid = [headings, ...rows].map((row) =>
    row.map((v, i) => wrap(v, widths[i] - 32)),
  );
  const heights = grid.map(
    (row) => Math.max(...row.map((lines) => lines.length)) * 26 + 34,
  );
  canvas.width = widths.reduce((a, b) => a + b, 0) + 10;
  canvas.height = heights.reduce((a, b) => a + b, 0) + 76;
  ctx.fillStyle = "#edf6fc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#193755";
  ctx.font = "bold 25px system-ui";
  ctx.fillText(title, 18, 43);
  let y = 62;
  grid.forEach((row, r) => {
    let x = 8;
    row.forEach((lines, i) => {
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.roundRect(x, y, widths[i] - 8, heights[r] - 8, 8);
      ctx.fill();
      ctx.font = r === 0 ? "bold " + font : font;
      lines.forEach((line, j) => {
        ctx.fillStyle = line.startsWith("有课") ? "#136d94" : "#334155";
        ctx.fillText(line, x + 12, y + 28 + j * 26);
      });
      x += widths[i];
    });
    y += heights[r];
  });
  return new Promise<void>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片过大或浏览器无法生成 PNG"));
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = title + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      resolve();
    }, "image/png"),
  );
}
