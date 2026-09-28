import { mkdir, copyFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const dest = resolve(root, "public/ocr/v7");
await mkdir(dest, { recursive: true });
await copyFile(
  resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
  resolve(dest, "worker.min.js"),
);
for (const name of await readdir(
  resolve(root, "node_modules/tesseract.js-core"),
)) {
  if (name.endsWith(".wasm.js"))
    await copyFile(
      resolve(root, "node_modules/tesseract.js-core", name),
      resolve(dest, name),
    );
}
for (const lang of ["eng", "chi_sim"])
  await copyFile(
    resolve(
      root,
      `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    ),
    resolve(dest, `${lang}.traineddata.gz`),
  );
for (const [pkg, file, name] of [
  ["tesseract.js", "LICENSE.md", "LICENSE-tesseract"],
  ["tesseract.js-core", "LICENSE", "LICENSE-core"],
])
  await copyFile(
    resolve(root, `node_modules/${pkg}/${file}`),
    resolve(dest, name),
  );
