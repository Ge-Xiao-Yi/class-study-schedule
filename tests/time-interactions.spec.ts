import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
}
const cards = (page: Page) =>
  page.getByRole("table").getByRole("button", { name: /^编辑课程：/ });
const taskCard = (page: Page, name: string, date: string) =>
  page
    .getByRole("table")
    .getByRole("article", { name: `任务：${name} · ${date}`, exact: true });

test("当前课程与秒级倒计时，跳周不改变今天；跨午夜自动切日", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-24T07:39:58Z") });
  await page.clock.pauseAt(new Date("2026-09-24T07:39:59Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.getByLabel("今日状态");
  await expect(today).toContainText("2026-09-24 · 周四");
  await expect(today).toContainText("正在上课：程序设计基础");
  await expect(today.getByRole("timer")).toHaveText("00:00:01");
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(today.getByRole("timer")).toHaveText("00:00:01");
  await page.clock.runFor(1000);
  await expect(today).toContainText("当天课程已结束");
  await expect(today.getByRole("timer")).toHaveText("00:00:00");
  await page.clock.setSystemTime(new Date("2026-09-24T23:59:59+08:00"));
  await page.clock.runFor(1000);
  await expect(today).toContainText("2026-09-25 · 周五");
  await expect(today).toContainText("尚未上课");
  await page.clock.setSystemTime(new Date("2026-09-27T12:00:00+08:00"));
  await page.clock.runFor(1000);
  await expect(today).toContainText("今天没有课程");
  await expect(today.getByRole("timer")).toHaveText("—");
});

test("关闭编辑模式只允许浏览、周次切换与任务打卡", async ({ page }) => {
  await ready(page);
  const toggle = page.getByRole("switch", { name: "编辑模式" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  for (const name of [
    "时间段设置",
    "复制上一周",
    "新增课程",
    "新增任务",
    "学期设置",
    "课程管理",
    "任务管理",
    "新建档案",
    "重命名档案",
    "备份与恢复",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(page.getByLabel("当前本地档案")).toBeDisabled();
  await expect(cards(page).first()).toBeDisabled();
  const checkbox = taskCard(page, "完成编程练习", "2026-09-24").getByRole(
    "checkbox",
  );
  await checkbox.check();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "时间段设置", exact: true }),
  ).toBeEnabled();
});

test("复制上一周预览、课程去重、任务实例重置与单次范围", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "新增课程", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("课程名称", { exact: true }).fill("仅一次实验");
  await dialog.getByLabel("重复规则", { exact: true }).selectOption("once");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await page.getByRole("button", { name: "复制上一周", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("将新增 1 门单次课程、5 条任务实例");
  await dialog.getByLabel("复制内容").selectOption("courses");
  await expect(dialog).toContainText("将新增 1 门单次课程、0 条任务实例");
  await dialog.getByLabel("复制内容").selectOption("tasks");
  await expect(dialog).toContainText("将新增 0 门单次课程、5 条任务实例");
  await dialog.getByLabel("复制内容").selectOption("all");
  await dialog
    .getByRole("button", { name: "确认复制上一周", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(cards(page)).toHaveCount(9);
  const copied = taskCard(page, "整理数学笔记", "2026-09-28");
  await expect(copied.getByRole("checkbox")).not.toBeChecked();
  await copied.getByRole("button", { name: /^编辑任务/ }).click();
  await expect(page.getByLabel("编辑或删除范围", { exact: true })).toHaveValue(
    "single",
  );
  await page.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("仅这一次");
  await page.getByRole("button", { name: "确认删除任务", exact: true }).click();
  await expect(copied).toHaveCount(0);
  await page.getByRole("button", { name: "复制上一周", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("没有需要新增的安排");
  await expect(
    page.getByRole("button", { name: "确认复制上一周", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(
    taskCard(page, "整理数学笔记", "2026-09-21").getByRole("checkbox"),
  ).toBeChecked();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(cards(page)).toHaveCount(9);
  await expect(copied).toHaveCount(0);
});

test("自定义时间段校验、按新边界显示、刷新保留与键盘焦点", async ({ page }) => {
  await ready(page);
  const trigger = page.getByRole("button", { name: "时间段设置", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("上午结束时间", { exact: true }).fill("19:00");
  await dialog.getByRole("button", { name: "保存时间段", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("不能重叠");
  await dialog.getByLabel("上午结束时间", { exact: true }).fill("09:00");
  await dialog.getByLabel("下午开始时间", { exact: true }).fill("09:00");
  await dialog.getByLabel("下午结束时间", { exact: true }).fill("20:00");
  await dialog.getByLabel("晚上开始时间", { exact: true }).fill("20:00");
  await dialog.getByRole("button", { name: "保存时间段", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  const rowHeaders = page.getByRole("rowheader");
  await expect(rowHeaders.nth(0)).toContainText("00:00–09:00");
  await expect(rowHeaders.nth(1)).toContainText("09:00–20:00");
  const mondayCourse = page.getByRole("table").getByRole("button", {
    name: "编辑课程：高等数学，08:00–09:40",
    exact: true,
  });
  await expect(mondayCourse).toHaveCount(4); // Two different weekdays, each rendered in two periods.
  const ids = await mondayCourse.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-occurrence-id")),
  );
  expect(new Set(ids).size).toBe(2);
  const afternoon = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: /下午/ }) });
  await expect(
    afternoon.getByRole("article", {
      name: "任务：完成编程练习 · 2026-09-24",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("rowheader").nth(1)).toContainText("09:00–20:00");
  await trigger.click();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("六个边界独立保存，允许空隙且时段外课程仍可查看", async ({ page }) => {
  await ready(page);
  const trigger = page.getByRole("button", { name: "时间段设置", exact: true });
  await trigger.click();
  const values = {
    上午开始时间: "08:00",
    上午结束时间: "09:00",
    下午开始时间: "14:00",
    下午结束时间: "17:00",
    晚上开始时间: "19:00",
    晚上结束时间: "22:00",
  };
  for (const [name, value] of Object.entries(values)) {
    await page
      .getByRole("dialog")
      .getByLabel(name, { exact: true })
      .fill(value);
  }
  for (const [name, value] of Object.entries(values)) {
    await expect(
      page.getByRole("dialog").getByLabel(name, { exact: true }),
    ).toHaveValue(value);
  }
  await page.getByRole("button", { name: "保存时间段", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("region", { name: "时段外课程" })).toContainText(
    "大学英语",
  );
  await page.reload();
  await trigger.click();
  for (const [name, value] of Object.entries(values)) {
    await expect(
      page.getByRole("dialog").getByLabel(name, { exact: true }),
    ).toHaveValue(value);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "新增任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("午间任务");
  await page.getByLabel("开始时间（可选）", { exact: true }).fill("12:30");
  await expect(page.getByLabel("所属时间段", { exact: true })).toBeEnabled();
  await page
    .getByLabel("所属时间段", { exact: true })
    .selectOption("afternoon");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: /下午/ }) }),
  ).toContainText("午间任务");
});

test("桌面视图和方向键切日，平板手机保留选中日期且功能可操作", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole("button", { name: "单日视图", exact: true }).click();
  await expect(page.getByRole("table")).toBeHidden();
  const picker = page.getByRole("group", { name: "选择星期" });
  await picker.getByRole("button", { name: "周四" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("button", { name: "周五" })).toBeFocused();
  await expect(picker.getByRole("button", { name: "周五" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "七天视图", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: "周五" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "时间段设置", exact: true }).click();
    await page.getByLabel("上午结束时间", { exact: true }).fill("11:00");
    await page.getByRole("button", { name: "保存时间段", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "下一周", exact: true }).click();
    await page.getByRole("button", { name: "复制上一周", exact: true }).click();
    await page.getByLabel("复制内容").selectOption("tasks");
    await page
      .getByRole("button", { name: "确认复制上一周", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "复制上一周", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("core-interactions-mobile.png"),
    fullPage: true,
  });
});
