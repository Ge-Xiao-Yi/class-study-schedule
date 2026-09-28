import { chromium, expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function ready(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
}
test.beforeEach(async ({ page }) => ready(page));
const checkbox = (page: Page, name = "持久化阅读", date = "2026-09-21") =>
  page.getByRole("table").getByRole("checkbox", {
    name: `完成任务：${name}（${date}）`,
    exact: true,
  });
async function task(page: Page) {
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill("持久化阅读");
  await dialog.getByLabel("任务日期", { exact: true }).fill("2026-09-21");
  await dialog
    .getByLabel("任务重复规则", { exact: true })
    .selectOption("daily");
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(dialog).toBeHidden();
  await checkbox(page).check();
  await expect(
    page.getByRole("button", { name: "新建档案", exact: true }),
  ).toBeEnabled();
}
async function createProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "新建档案", exact: true }).click();
  await page.getByRole("dialog").getByLabel("档案名称").fill(name);
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("当前本地档案")).toHaveValue(/.+/);
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
}
async function download(page: Page) {
  await page.getByRole("button", { name: "备份与恢复", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出全部 JSON 备份", exact: true })
    .click();
  const result = await pending;
  return readFile((await result.path())!, "utf8");
}

test("刷新与关闭页面后重新打开：课程及每日独立状态保留", async ({
  page,
  context,
}) => {
  await task(page);
  await page.reload();
  await expect(checkbox(page)).toBeChecked();
  await expect(checkbox(page, "持久化阅读", "2026-09-22")).not.toBeChecked();
  await page.close();
  const reopened = await context.newPage();
  await ready(reopened);
  await expect(checkbox(reopened)).toBeChecked();
  await expect(
    reopened.getByRole("table").getByRole("button", { name: /^编辑课程：/ }),
  ).toHaveCount(8);
  await reopened.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(
    checkbox(reopened, "持久化阅读", "2026-09-28"),
  ).not.toBeChecked();
});

test("档案隔离、当前选择保留、改名与删除确认", async ({ page }) => {
  const original = await page.getByLabel("当前本地档案").inputValue();
  await task(page);
  await createProfile(page, "独立学习档案");
  const second = await page.getByLabel("当前本地档案").inputValue();
  expect(second).not.toBe(original);
  await expect(page.getByRole("table").getByRole("article")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("当前本地档案")).toHaveValue(second);
  await page.getByRole("button", { name: "重命名档案", exact: true }).click();
  await page.getByRole("dialog").getByLabel("档案名称").fill("独立档案已改名");
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByLabel("当前本地档案").selectOption(original);
  await expect(checkbox(page)).toBeChecked();
  await page.getByLabel("当前本地档案").selectOption(second);
  await expect(checkbox(page)).toHaveCount(0);
  await page.getByRole("button", { name: "删除档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("建议先");
  await page.getByRole("button", { name: "确认删除档案", exact: true }).click();
  await expect(checkbox(page)).toBeChecked();
  await expect(page.getByLabel("当前本地档案").locator("option")).toHaveCount(
    1,
  );
});

test("完整 JSON 导出、二次确认、覆盖恢复保留课程例外与任务状态", async ({
  page,
}) => {
  await task(page);
  const original = await page.getByLabel("当前本地档案").inputValue();
  const firstCourse = page
    .getByRole("table")
    .getByRole("button", { name: /^编辑课程：/ })
    .first();
  const occurrenceId = await firstCourse.getAttribute("data-occurrence-id");
  await firstCourse.click();
  await page.getByRole("button", { name: "取消本周课程", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await createProfile(page, "备份中的另一档案");
  await page.getByLabel("当前本地档案").selectOption(original);
  await expect(checkbox(page)).toBeChecked();
  const json = await download(page);
  const backup = JSON.parse(json);
  expect(backup.formatVersion).toBe(1);
  expect(backup.data.profiles).toHaveLength(2);
  expect(backup.data.courseExceptions).toHaveLength(1);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await checkbox(page).uncheck();
  await expect(
    page.getByRole("button", { name: "备份与恢复", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "备份与恢复", exact: true }).click();
  await page.getByLabel("选择 JSON 恢复文件").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await expect(page.getByRole("dialog")).toContainText("文件校验通过");
  await page
    .getByRole("button", { name: "继续恢复，查看最终确认", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "确认覆盖恢复", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /我已备份/ }).check();
  await page.getByRole("button", { name: "确认覆盖恢复", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(checkbox(page)).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "本周已取消的课程" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").locator(`[data-occurrence-id="${occurrenceId}"]`),
  ).toHaveCount(0);
  await page.reload();
  await expect(checkbox(page)).toBeChecked();
});

test("错误文件不允许恢复，取消确认不改变数据", async ({ page }) => {
  await task(page);
  const json = await download(page);
  const picker = page.getByLabel("选择 JSON 恢复文件");
  for (const invalid of [
    "not-json",
    JSON.stringify({ ...JSON.parse(json), formatVersion: 99 }),
  ]) {
    await picker.setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(invalid),
    });
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "继续恢复，查看最终确认", exact: true }),
    ).toHaveCount(0);
  }
  await picker.setInputFiles({
    name: "good.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page
    .getByRole("button", { name: "继续恢复，查看最终确认", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.reload();
  await expect(checkbox(page)).toBeChecked();
});

test("320px 档案与备份弹窗无明显横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await createProfile(page, "很长的档案名称".repeat(5));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "备份与恢复", exact: true }).click();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/persistence-mobile.png",
    fullPage: true,
  });
});

test("关闭整个浏览器进程后，使用同一浏览器数据目录重开仍保留任务", async ({}, testInfo) => {
  const directory = testInfo.outputPath("browser-profile");
  const options = {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    timezoneId: "Asia/Shanghai",
    baseURL: "http://127.0.0.1:3000",
  };
  let browser = await chromium.launchPersistentContext(directory, options);
  try {
    const page = await browser.newPage();
    await ready(page);
    await task(page);
    await browser.close();
    browser = await chromium.launchPersistentContext(directory, options);
    const reopened = await browser.newPage();
    await ready(reopened);
    await expect(checkbox(reopened)).toBeChecked();
    await expect(
      checkbox(reopened, "持久化阅读", "2026-09-22"),
    ).not.toBeChecked();
  } finally {
    await browser.close();
  }
});

test("另一标签页恢复后，旧页面写入被拒绝且复选框回退", async ({
  page,
  context,
}) => {
  await task(page);
  const json = await download(page);
  const other = await context.newPage();
  await ready(other);
  await page.getByLabel("选择 JSON 恢复文件").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page
    .getByRole("button", { name: "继续恢复，查看最终确认", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /我已备份/ }).check();
  await page.getByRole("button", { name: "确认覆盖恢复", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await checkbox(other).click();
  await expect(other.getByRole("table").getByRole("alert")).toContainText(
    "重新加载",
  );
  await expect(checkbox(other)).toBeChecked();
  await other
    .getByRole("button", { name: "重新加载数据", exact: true })
    .click();
  await expect(checkbox(other)).toBeChecked();
  await expect(other.getByRole("table").getByRole("alert")).toHaveCount(0);
});
