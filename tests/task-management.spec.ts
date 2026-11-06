import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
});

const card = (page: Page, name: string, date: string) =>
  page
    .getByRole("table")
    .getByRole("article", { name: `任务：${name} · ${date}`, exact: true });
const taskCards = (page: Page, name: string) =>
  page
    .getByRole("table")
    .getByRole("article", { name: new RegExp(`^任务：${name} ·`) });

async function createTask(
  page: Page,
  name: string,
  options: {
    date?: string;
    repeat?: string;
    start?: string;
    end?: string;
    until?: string;
    estimated?: string;
  } = {},
) {
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill(name);
  await dialog
    .getByLabel("任务日期", { exact: true })
    .fill(options.date ?? "2026-09-21");
  await dialog
    .getByLabel("任务重复规则", { exact: true })
    .selectOption(options.repeat ?? "daily");
  if (options.start)
    await dialog
      .getByLabel("开始时间（可选）", { exact: true })
      .fill(options.start);
  if (options.end)
    await dialog
      .getByLabel("结束时间（可选）", { exact: true })
      .fill(options.end);
  if (options.until)
    await dialog
      .getByLabel("重复截止日期（可选）", { exact: true })
      .fill(options.until);
  if (options.estimated)
    await dialog
      .getByLabel("预计耗时（分钟，可选）", { exact: true })
      .fill(options.estimated);
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("编辑模式空格有独立入口，浏览模式隐藏入口但可打卡", async ({ page }) => {
  const table = page.getByRole("table");
  await expect(
    table.getByRole("button", { name: "周日下午添加课程", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("button", { name: "周日下午添加任务", exact: true }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "编辑模式" }).click();
  await expect(
    table.getByRole("button", { name: "周日下午添加任务", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "新增任务", exact: true }),
  ).toBeDisabled();
  const checkbox = card(page, "完成编程练习", "2026-09-24").getByRole(
    "checkbox",
  );
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByRole("switch", { name: "编辑模式" }).click();
  await table
    .getByRole("button", { name: "周日下午添加任务", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("任务日期", { exact: true }),
  ).toHaveValue("2026-09-27");
  await expect(
    page.getByRole("dialog").getByLabel("所属时间段", { exact: true }),
  ).toHaveValue("afternoon");
});

test("周一完成不影响周二与下周；取消勾选恢复未开始，弹窗可设置进行中", async ({
  page,
}) => {
  await createTask(page, "每日打卡", { estimated: "30" });
  const monday = card(page, "每日打卡", "2026-09-21");
  const tuesday = card(page, "每日打卡", "2026-09-22");
  await expect(monday).toContainText("过去未完成");
  await monday.getByRole("checkbox").check();
  await expect(monday.getByRole("heading")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(tuesday.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(
    card(page, "每日打卡", "2026-09-28").getByRole("checkbox"),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(monday.getByRole("checkbox")).toBeChecked();
  await monday.getByRole("checkbox").uncheck();
  await expect(monday).toContainText("未开始");
  await tuesday.getByRole("button", { name: /^编辑任务/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("本次任务状态", { exact: true })
    .selectOption("in_progress");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("仅这一次");
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(tuesday).toContainText("进行中");
  await expect(monday).toContainText("未开始");
  await tuesday.getByRole("checkbox").check();
  await tuesday.getByRole("checkbox").uncheck();
  await expect(tuesday).toContainText("未开始");
});

test("单次跨周调整保持独立身份，跨时段只显示一次", async ({ page }) => {
  await createTask(page, "阅读计划");
  const original = card(page, "阅读计划", "2026-09-21");
  const taskId = await original.getAttribute("data-task-id");
  await original.getByRole("button", { name: /^编辑任务/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill("单次阅读");
  await dialog.getByLabel("任务日期", { exact: true }).fill("2026-10-01");
  await dialog.getByLabel("开始时间（可选）", { exact: true }).fill("11:00");
  await dialog.getByLabel("结束时间（可选）", { exact: true }).fill("19:00");
  await expect(dialog.getByLabel("所属时间段", { exact: true })).toHaveValue(
    "morning",
  );
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(original).toHaveCount(0);
  await expect(taskCards(page, "阅读计划")).toHaveCount(6);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  const moved = card(page, "单次阅读", "2026-10-01");
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveAttribute("data-task-id", taskId!);
  await expect(moved).toHaveAttribute("data-task-date", "2026-09-21");
  await expect(card(page, "阅读计划", "2026-10-01")).toHaveCount(1);
  await moved.getByRole("checkbox").check();
  await expect(
    card(page, "阅读计划", "2026-10-01").getByRole("checkbox"),
  ).not.toBeChecked();
});

test("单次与整体删除均确认范围，取消确认不写入，课程不受影响", async ({
  page,
}) => {
  await createTask(page, "删除练习");
  const before = await page
    .getByRole("table")
    .getByRole("button", { name: /^编辑课程/ })
    .count();
  await card(page, "删除练习", "2026-09-21")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("仅这一次");
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(taskCards(page, "删除练习")).toHaveCount(7);
  await card(page, "删除练习", "2026-09-21")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await page.getByRole("button", { name: "确认删除任务", exact: true }).click();
  await expect(taskCards(page, "删除练习")).toHaveCount(6);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(taskCards(page, "删除练习")).toHaveCount(7);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(card(page, "删除练习", "2026-09-21")).toHaveCount(0);
  await card(page, "删除练习", "2026-09-22")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("编辑或删除范围", { exact: true })
    .selectOption("all");
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("全部重复安排");
  await page.getByRole("button", { name: "确认删除任务", exact: true }).click();
  await expect(taskCards(page, "删除练习")).toHaveCount(0);
  await expect(
    page.getByRole("table").getByRole("button", { name: /^编辑课程/ }),
  ).toHaveCount(before);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(taskCards(page, "删除练习")).toHaveCount(0);
});

test("单次和整个重复任务复制均为独立未开始任务", async ({ page }) => {
  await createTask(page, "复制练习");
  const source = card(page, "复制练习", "2026-09-21");
  await source.getByRole("checkbox").check();
  await source.getByRole("button", { name: /^编辑任务/ }).click();
  await page.getByRole("button", { name: "复制任务", exact: true }).click();
  await page.getByLabel("复制目标日期", { exact: true }).fill("2026-09-28");
  await page
    .getByRole("button", { name: "下一步：确认复制范围", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("副本不重复");
  await page.getByRole("button", { name: "确认复制任务", exact: true }).click();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  const copies = card(page, "复制练习", "2026-09-28");
  await expect(copies).toHaveCount(2);
  await expect(copies.nth(0).getByRole("checkbox")).not.toBeChecked();
  await expect(copies.nth(1).getByRole("checkbox")).not.toBeChecked();
  const ids = await copies.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-task-id")),
  );
  expect(new Set(ids).size).toBe(2);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(source.getByRole("checkbox")).toBeChecked();
  await source.getByRole("button", { name: /^编辑任务/ }).click();
  await page.getByRole("button", { name: "复制任务", exact: true }).click();
  await page.getByLabel("复制范围", { exact: true }).selectOption("all");
  await page.getByLabel("复制目标日期", { exact: true }).fill("2026-10-05");
  await page
    .getByRole("button", { name: "下一步：确认复制范围", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "不复制原任务的单次状态",
  );
  await page.getByRole("button", { name: "确认复制任务", exact: true }).click();
  await page.getByLabel("跳转日期", { exact: true }).fill("2026-10-05");
  await expect(taskCards(page, "复制练习")).toHaveCount(14);
});

test("有时间课程与任务混排，无时间任务最后；耗时不是开始时间", async ({
  page,
}) => {
  await createTask(page, "早读", {
    date: "2026-09-24",
    repeat: "none",
    start: "07:00",
  });
  await createTask(page, "晚些阅读", {
    date: "2026-09-24",
    repeat: "none",
    start: "10:00",
  });
  await createTask(page, "自由阅读", {
    date: "2026-09-24",
    repeat: "none",
    estimated: "15",
  });
  const thursdayMorning = page
    .getByRole("table")
    .locator("tbody tr")
    .first()
    .locator("td")
    .nth(3);
  const buttons = thursdayMorning.getByRole("button", {
    name: /^(编辑课程|编辑任务)：/,
  });
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(0)).toHaveAccessibleName(/早读/);
  await expect(buttons.nth(1)).toHaveAccessibleName(/大学英语/);
  await expect(buttons.nth(2)).toHaveAccessibleName(/晚些阅读/);
  await expect(buttons.nth(3)).toHaveAccessibleName(/自由阅读/);
  await expect(card(page, "自由阅读", "2026-09-24")).toContainText(
    "预计 15 分钟",
  );
});

test("不重复任务可编辑日期和重复规则，整组编辑不覆盖其他实例状态", async ({
  page,
}) => {
  await createTask(page, "单次起步", { repeat: "none" });
  await card(page, "单次起步", "2026-09-21")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page.getByLabel("任务日期", { exact: true }).fill("2026-09-22");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(taskCards(page, "单次起步")).toHaveCount(1);
  await card(page, "单次起步", "2026-09-22")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page.getByLabel("任务重复规则", { exact: true }).selectOption("daily");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(taskCards(page, "单次起步")).toHaveCount(6);
  await card(page, "单次起步", "2026-09-22").getByRole("checkbox").check();
  await card(page, "单次起步", "2026-09-23")
    .getByRole("button", { name: /^编辑任务/ })
    .click();
  await page.getByLabel("编辑或删除范围", { exact: true }).selectOption("all");
  await page.getByLabel("任务名称", { exact: true }).fill("整组更新");
  await page
    .getByLabel("本次任务状态", { exact: true })
    .selectOption("in_progress");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(
    card(page, "整组更新", "2026-09-22").getByRole("checkbox"),
  ).toBeChecked();
  await expect(card(page, "整组更新", "2026-09-23")).toContainText("进行中");
});

test("每周任务在截止日显示，之后不重复；错误时间留在表单", async ({ page }) => {
  await createTask(page, "周日复盘", {
    date: "2026-09-20",
    repeat: "weekly",
    until: "2026-09-27",
  });
  await expect(card(page, "周日复盘", "2026-09-27")).toBeVisible();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(taskCards(page, "周日复盘")).toHaveCount(0);
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill("错误时间");
  await dialog.getByLabel("开始时间（可选）", { exact: true }).fill("23:00");
  await dialog.getByLabel("结束时间（可选）", { exact: true }).fill("01:00");
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("不支持跨午夜");
});

test("手机可新增任务、打卡并滚动表单完成范围确认", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page
    .getByRole("group", { name: "选择星期" })
    .getByRole("button", { name: "周六" })
    .click();
  await page
    .getByRole("button", { name: "周六下午添加任务", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill("手机任务");
  await dialog.getByLabel("预计耗时（分钟，可选）", { exact: true }).fill("45");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog.screenshot({
    path: testInfo.outputPath("task-dialog-mobile.png"),
  });
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  const checkbox = page.getByRole("checkbox", {
    name: "完成任务：手机任务（2026-09-26）",
    exact: true,
  });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page
    .getByRole("button", {
      name: "编辑任务：手机任务（2026-09-26）",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("本次任务状态", { exact: true })
    .selectOption("in_progress");
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "确认保存任务", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("彩色任务刷新后保留，手机导出整周彩色 PNG", async ({ page }) => {
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称", { exact: true }).fill("准备组会");
  await dialog.getByLabel("任务颜色").selectOption("orange");
  await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const row = page
    .getByRole("table")
    .getByRole("article", { name: /任务：准备组会/ })
    .first();
  await expect(row).toHaveCSS("background-color", "rgb(255, 244, 230)");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "导出彩色 PDF" })).toHaveCount(
    0,
  );
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出彩色周计划" }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toBe("周计划 2026-09-21 至 2026-09-27.png");
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  const colored = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] === 255 && rgba[i + 1] === 244 && rgba[i + 2] === 230)
        return true;
    return false;
  }, bytes.toString("base64"));
  expect(colored).toBe(true);
});
