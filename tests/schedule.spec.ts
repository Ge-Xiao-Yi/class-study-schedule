import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`${width}px: layout fits and single-day navigation works`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "长期目标", exact: true }),
    ).toBeVisible();
    const picker = page.getByRole("group", { name: "选择星期" });
    if (width < 1024) {
      await expect(picker).toBeVisible();
      await expect(page.getByRole("table")).toBeHidden();
      await expect(
        picker.getByRole("button", { name: "周四" }),
      ).toHaveAttribute("aria-pressed", "true");
      await picker.getByRole("button", { name: "周六" }).click();
      await expect(
        page
          .getByRole("heading", { name: "本周知识复盘" })
          .filter({ visible: true }),
      ).toBeVisible();
      await picker.getByRole("button", { name: "周日" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        picker.getByRole("button", { name: "周日" }),
      ).toHaveAttribute("aria-pressed", "true");
    } else {
      await expect(picker).toBeHidden();
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("columnheader")).toHaveCount(8);
      await expect(page.getByRole("rowheader")).toHaveCount(3);
    }
    await expect(
      page.getByRole("button", { name: "上一周", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "新增课程", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await expect(dialog.getByLabel("重复规则")).toHaveValue("weekly");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "新增课程", exact: true }),
    ).toBeFocused();
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`schedule-${width}.png`),
      fullPage: true,
    });
  });
}
