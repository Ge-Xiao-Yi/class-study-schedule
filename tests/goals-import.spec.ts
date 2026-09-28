import { test, expect, type Page } from "@playwright/test";
import { templateBytes } from "../src/lib/course-files";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
});
async function openImport(page: Page) {
  await page.getByRole("button", { name: "导入课表", exact: true }).click();
  return page.getByRole("dialog");
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "下一步：确认导入", exact: true })
    .click();
  await page.getByRole("button", { name: "确认导入课程", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("长期目标关联、独立完成、刷新、手动进度和折叠", async ({ page }) => {
  await page.getByRole("button", { name: "新增目标", exact: true }).click();
  await page.getByLabel("目标名称", { exact: true }).fill("阅读计划");
  await page.getByLabel("目标开始日期", { exact: true }).fill("2026-09-21");
  await page.getByLabel("进度模式", { exact: true }).selectOption("automatic");
  await page.getByRole("button", { name: "保存目标", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("目标每日阅读");
  await page.getByLabel("任务日期", { exact: true }).fill("2026-09-21");
  await page.getByLabel("任务重复规则", { exact: true }).selectOption("daily");
  await page
    .getByLabel("所属长期目标", { exact: true })
    .selectOption({ label: "阅读计划" });
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const goal = page.getByRole("article", {
    name: "目标：阅读计划",
    exact: true,
  });
  await expect(goal).toContainText("已完成 0 / 4 次");
  await page
    .getByRole("table")
    .getByRole("article", {
      name: "任务：目标每日阅读 · 2026-09-21",
      exact: true,
    })
    .getByRole("checkbox")
    .check();
  await expect(goal).toContainText("25%");
  await expect(goal).toContainText("已完成 1 / 4 次");
  await page.reload();
  await expect(goal).toContainText("25%");
  await page
    .getByRole("button", { name: "编辑目标：阅读计划", exact: true })
    .click();
  await page.getByLabel("进度模式", { exact: true }).selectOption("manual");
  await page.getByLabel("手动进度（%）", { exact: true }).fill("42");
  await page.getByRole("button", { name: "保存目标", exact: true }).click();
  await expect(goal).toContainText("42%");
  await page.getByRole("button", { name: /长期目标 ▾/ }).click();
  await expect(goal).toBeHidden();
  await page.getByRole("button", { name: /长期目标 ▸/ }).click();
  await expect(goal).toBeVisible();
  await page.getByRole("switch", { name: "编辑模式" }).click();
  await expect(
    page.getByRole("button", { name: "新增目标", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "导入课表", exact: true }),
  ).toBeDisabled();
});

for (const format of ["csv", "xlsx"] as const)
  test(`${format} 模板下载、预览确认、导入和重复跳过`, async ({ page }) => {
    const dialog = await openImport(page);
    const downloadPromise = page.waitForEvent("download");
    await dialog
      .getByRole("button", {
        name: format === "csv" ? "下载 CSV 模板" : "下载 Excel 模板",
        exact: true,
      })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`课表标准模板.${format}`);
    const file = {
      name: `template.${format}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(await templateBytes(format)),
    };
    await page.getByLabel("课表文件", { exact: true }).setInputFiles(file);
    await page
      .getByRole("button", { name: "生成导入预览", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "下一步：确认导入", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("确认第 1 行", { exact: true }).check();
    await finish(page);
    await page.getByRole("button", { name: "课程管理", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("示例课程");
    await page.keyboard.press("Escape");
    await openImport(page);
    await page.getByLabel("课表文件", { exact: true }).setInputFiles(file);
    await page
      .getByRole("button", { name: "生成导入预览", exact: true })
      .click();
    await expect(dialog).toContainText("重复课程，将跳过");
    await page.getByLabel("确认第 1 行", { exact: true }).check();
    await expect(
      page.getByRole("button", { name: "下一步：确认导入", exact: true }),
    ).toBeDisabled();
  });

test("映射、无效文件、人工修正和手机预览不溢出", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openImport(page);
  await page.getByLabel("课表文件", { exact: true }).setInputFiles({
    name: "坏.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("bad"),
  });
  await expect(dialog.getByRole("alert")).toContainText("不是有效");
  await expect(
    page.getByRole("button", { name: "下一步：确认导入", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("课表文件", { exact: true }).setInputFiles({
    name: "自定义.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("标题,周几,开课,下课\n修正课程,4,08:00,07:00"),
  });
  for (const [label, value] of [
    ["课程名称对应列", "0"],
    ["星期对应列", "1"],
    ["开始时间对应列", "2"],
    ["结束时间对应列", "3"],
  ])
    await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.getByRole("button", { name: "生成导入预览", exact: true }).click();
  await expect(dialog).toContainText("结束时间必须晚于");
  await expect(page.getByLabel("确认第 1 行", { exact: true })).toBeDisabled();
  await page.getByLabel("第 1 行结束时间", { exact: true }).fill("09:40");
  await page.getByLabel("确认第 1 行", { exact: true }).check();
  await page.getByLabel("第 1 行教师", { exact: true }).fill("李老师");
  await expect(
    page.getByLabel("确认第 1 行", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("确认第 1 行", { exact: true }).check();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("import-mobile.png"),
    fullPage: true,
  });
  await finish(page);
});

test("真实浏览器本地 OCR、逐行确认与人工修正", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1100;
    c.height = 130;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    ctx.fillText("Math 周四 08:00-09:40", 30, 80);
    return c.toDataURL("image/png").split(",")[1];
  });
  const dialog = await openImport(page);
  await page.getByRole("button", { name: "截图本地 OCR", exact: true }).click();
  await page.getByLabel("课表截图", { exact: true }).setInputFiles({
    name: "课程.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await page.getByRole("button", { name: "开始本地识别", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "导入课程预览", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await expect(page.getByLabel("第 1 行课程名称", { exact: true })).toHaveValue(
    /Math/i,
  );
  await expect(
    page.getByLabel("确认第 1 行", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "下一步：确认导入", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("第 1 行课程名称", { exact: true })
    .fill("人工修正课程");
  await page.getByLabel("第 1 行星期", { exact: true }).fill("4");
  await page.getByLabel("第 1 行开始时间", { exact: true }).fill("08:00");
  await page.getByLabel("第 1 行结束时间", { exact: true }).fill("09:40");
  await page.getByLabel("确认第 1 行", { exact: true }).check();
  await page.screenshot({
    path: testInfo.outputPath("ocr-preview.png"),
    fullPage: true,
  });
  await finish(page);
  expect(
    requested.some((url) => url.includes("/ocr/v7/chi_sim.traineddata.gz")),
  ).toBe(true);
  expect(
    requested.filter(
      (url) =>
        url.startsWith("http") && !url.startsWith("http://127.0.0.1:3000"),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "课程管理", exact: true }).click();
  await expect(dialog).toContainText("人工修正课程");
});

test("截图识别失败后手动补充，不直接写入", async ({ page }) => {
  await openImport(page);
  await page.getByRole("button", { name: "截图本地 OCR", exact: true }).click();
  await page.getByLabel("课表截图", { exact: true }).setInputFiles({
    name: "损坏.png",
    mimeType: "image/png",
    buffer: Buffer.from("bad"),
  });
  await page.getByRole("button", { name: "开始本地识别", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "手动添加课程行", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "手动添加课程行", exact: true })
    .click();
  for (const [key, value] of [
    ["课程名称", "手动补充"],
    ["星期", "5"],
    ["开始时间", "10:00"],
    ["结束时间", "11:00"],
  ])
    await page.getByLabel(`第 1 行${key}`, { exact: true }).fill(value);
  await page.getByLabel("确认第 1 行", { exact: true }).check();
  await finish(page);
});

test("规则七天网格按列识别星期，空白格不生成课程", async ({ page }) => {
  test.setTimeout(180000);
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2100;
    c.height = 180;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "black";
    ctx.font = "30px Arial";
    ctx.fillText("Math", 20, 60);
    ctx.fillText("08:00-09:40", 20, 120);
    return c.toDataURL("image/png").split(",")[1];
  });
  await openImport(page);
  await page.getByRole("button", { name: "截图本地 OCR", exact: true }).click();
  await page.getByLabel("课表截图", { exact: true }).setInputFiles({
    name: "网格.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await page.getByLabel("识别布局", { exact: true }).selectOption("grid");
  await page.getByLabel("网格课程行数", { exact: true }).fill("1");
  await page.getByRole("button", { name: "开始本地识别", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "导入课程预览", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await expect(page.getByLabel("第 1 行星期", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("第 1 行课程名称", { exact: true })).toHaveValue(
    /Math/i,
  );
  await expect(
    page
      .getByRole("table", { name: "导入课程预览", exact: true })
      .getByRole("row"),
  ).toHaveCount(2);
  await expect(
    page.getByLabel("确认第 1 行", { exact: true }),
  ).not.toBeChecked();
});
