import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
}

for (const size of [
  { width: 320, height: 740 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
  { width: 844, height: 390 },
])
  test(`${size.width}x${size.height} 页面层级和全部弹窗，滚动后关闭可点击`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size);
    await ready(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const today = await page
      .getByRole("region", { name: "今日状态" })
      .boundingBox();
    const controls = await page
      .getByRole("region", { name: "周次控制" })
      .boundingBox();
    expect(controls!.y - (today!.y + today!.height)).toBeGreaterThanOrEqual(20);
    await page.screenshot({
      path: testInfo.outputPath(`page-${size.width}x${size.height}.png`),
      fullPage: true,
    });
    for (const name of [
      "新增课程",
      "新增任务",
      "学期设置",
      "时间段设置",
      "新增目标",
      "导入课表",
      "备份与恢复",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await dialog.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const close = dialog.getByRole("button", {
        name: "关闭弹窗",
        exact: true,
      });
      await expect(close).toBeInViewport();
      const box = await close.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      // Hit-test the close button: visible does not necessarily mean unobstructed.
      expect(
        await close.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return node.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      ).toBe(true);
      if (name === "新增课程" || name === "新增任务")
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${size.width}x${size.height}.png`),
        });
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeFocused();
    }
    expect(errors).toEqual([]);
  });

test("新档案空数据、无课程及日期上下限不会崩溃", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "新建档案", exact: true }).click();
  await page.getByRole("dialog").getByLabel("档案名称").fill("空白回归档案");
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("region", { name: "今日状态" })).toContainText(
    "今天没有课程",
  );
  await expect(page.getByRole("timer")).toHaveText("—");
  await expect(
    page.getByRole("table").getByRole("button", { name: /^编辑课程：/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("article")).toHaveCount(0);
  await page.getByLabel("跳转日期", { exact: true }).fill("2024-02-29");
  await expect(page.getByRole("region", { name: "周次控制" })).toContainText(
    "2024.02.26 — 2024.03.03",
  );
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(page.getByRole("region", { name: "周次控制" })).toContainText(
    "2024.03.04 — 2024.03.10",
  );
  for (const date of ["1000-01-01", "9999-12-31"]) {
    await page.getByLabel("跳转日期", { exact: true }).fill(date);
    await expect(
      page.getByText("请输入有效日期，且整周均在 1000–9999 年范围内。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
  }
  await page.getByRole("button", { name: "返回本周", exact: true }).click();
  await expect(page.getByRole("region", { name: "周次控制" })).toContainText(
    "2026.09.21 — 2026.09.27",
  );
  expect(errors).toEqual([]);
});

test("同格时间冲突允许并存、混合排序、今日同时进行课程", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  for (const [name, start, end] of [
    ["重叠A", "14:00", "16:00"],
    ["重叠B", "14:30", "15:30"],
  ]) {
    await page.getByRole("button", { name: "新增课程", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("课程名称", { exact: true }).fill(name);
    await dialog.getByLabel("开始时间", { exact: true }).fill(start);
    await dialog.getByLabel("结束时间", { exact: true }).fill(end);
    await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  for (const [name, time] of [
    ["定时学习", "14:15"],
    ["自由学习", ""],
  ]) {
    await page.getByRole("button", { name: "新增任务", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("任务名称", { exact: true }).fill(name);
    if (time)
      await dialog.getByLabel("开始时间（可选）", { exact: true }).fill(time);
    else
      await dialog
        .getByLabel("所属时间段", { exact: true })
        .selectOption("afternoon");
    await dialog.getByRole("button", { name: "保存任务", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  const cell = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: /下午/ }) })
    .locator("td")
    .nth(3);
  const items = await cell
    .locator(".schedule-card")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label") ?? ""),
    );
  const position = (name: string) =>
    items.findIndex((label) => label.includes(name));
  expect(position("重叠A")).toBeLessThan(position("定时学习"));
  expect(position("定时学习")).toBeLessThan(position("重叠B"));
  expect(position("自由学习")).toBe(items.length - 1);
  await page.clock.setFixedTime(new Date("2026-09-24T06:45:00Z"));
  await expect(page.getByRole("region", { name: "今日状态" })).toContainText(
    "重叠A",
  );
  await expect(page.getByRole("region", { name: "今日状态" })).toContainText(
    "重叠B",
  );
});
