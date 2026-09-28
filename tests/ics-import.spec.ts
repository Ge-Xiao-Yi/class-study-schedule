import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
});
const text =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ics-test\r\nSUMMARY:日历导入测试课\r\nLOCATION:A103\r\nDTSTART;TZID=Asia/Shanghai:20260924T100000\r\nDTEND;TZID=Asia/Shanghai:20260924T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR";
test("ICS 预览、日期时区、模板保存、跨周和重复检查", async ({ page }) => {
  const file = {
    name: "schedule.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(text),
  };
  await page.getByRole("button", { name: "导入课表", exact: true }).click();
  await page.getByLabel("课表文件", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText(
    "时区转换为 Asia/Shanghai",
  );
  await page.getByRole("button", { name: "生成导入预览", exact: true }).click();
  await expect(page.getByLabel("第 1 行开始时间", { exact: true })).toHaveValue(
    "10:00",
  );
  await expect(page.getByLabel("第 1 行重复规则", { exact: true })).toHaveValue(
    "weekly",
  );
  await expect(
    page.getByRole("button", { name: "下一步：确认导入", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("确认第 1 行", { exact: true }).check();
  await page
    .getByRole("button", { name: "下一步：确认导入", exact: true })
    .click();
  await page.getByRole("button", { name: "确认导入课程", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const card = page.getByRole("table").getByRole("button", {
    name: "编辑课程：日历导入测试课，10:00–11:00",
    exact: true,
  });
  await expect(card).toHaveCount(1);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(card).toHaveCount(1);
  await page.reload();
  await expect(card).toHaveCount(1);
  await page.getByRole("button", { name: "导入课表", exact: true }).click();
  await page.getByLabel("课表文件", { exact: true }).setInputFiles(file);
  await page.getByRole("button", { name: "生成导入预览", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("重复课程，将跳过");
  await expect(
    page.getByRole("button", { name: "下一步：确认导入", exact: true }),
  ).toBeDisabled();
});
test("不支持的 ICS 不写入，之后可重新上传有效文件", async ({ page }) => {
  const cards = page
    .getByRole("table")
    .getByRole("button", { name: /^编辑课程：/ });
  const count = await cards.count();
  await page.getByRole("button", { name: "导入课表", exact: true }).click();
  await page.getByLabel("课表文件", { exact: true }).setInputFiles({
    name: "bad.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(text.replace("FREQ=WEEKLY", "FREQ=MONTHLY")),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "重复规则仅支持",
  );
  await expect(
    page.getByRole("button", { name: "下一步：确认导入", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("课表文件", { exact: true }).setInputFiles({
    name: "valid.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(text),
  });
  await page.getByRole("button", { name: "生成导入预览", exact: true }).click();
  await expect(page.getByLabel("第 1 行课程名称", { exact: true })).toHaveValue(
    "日历导入测试课",
  );
  await expect(
    page.getByLabel("确认第 1 行", { exact: true }),
  ).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(cards).toHaveCount(count);
  await page.reload();
  await expect(cards).toHaveCount(count);
});
