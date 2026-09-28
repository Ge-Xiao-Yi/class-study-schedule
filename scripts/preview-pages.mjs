// Local verification only. Production static files are served by GitHub Pages.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("out");
const prefix = "/class-study-schedule";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
  ".gz": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (path === "/" || path === prefix) {
      res.writeHead(302, { Location: `${prefix}/` });
      return res.end();
    }
    if (!path.startsWith(`${prefix}/`)) throw new Error("Not found");
    let file = resolve(root, `.${path.slice(prefix.length)}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error("Not found");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(Number(process.env.PORT || 3000), "127.0.0.1", () => {
  console.log(
    `Pages preview: http://127.0.0.1:${process.env.PORT || 3000}${prefix}/`,
  );
});
