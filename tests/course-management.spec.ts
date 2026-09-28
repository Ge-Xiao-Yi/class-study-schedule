import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T04:00:00Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的一周" })).toBeVisible();
});

const cards = (page: Page, name: string) =>
  page
    .getByRole("table")
    .getByRole("button", { name: new RegExp(`^编辑课程：${name}，`) });

async function createCourse(page: Page, name: string, once = false) {
  await page.getByRole("button", { name: "新增课程", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("课程名称", { exact: true }).fill(name);
  await dialog.getByLabel("地点", { exact: true }).fill("实验室 A");
  await dialog.getByLabel("教师", { exact: true }).fill("陈老师");
  await dialog.getByLabel("星期", { exact: true }).selectOption("1");
  await dialog.getByLabel("节次", { exact: true }).fill("第 3–5 节");
  await dialog.getByLabel("开始时间", { exact: true }).fill("11:00");
  await dialog.getByLabel("结束时间", { exact: true }).fill("13:00");
  await dialog.getByLabel("颜色", { exact: true }).selectOption("orange");
  if (once) await dialog.getByLabel("重复规则").selectOption("once");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("自然周跳转跨年、返回本周，主页不显示教学周编号", async ({ page }) => {
  await page.getByLabel("跳转日期", { exact: true }).fill("2027-01-01");
  await expect(page.getByLabel("周次控制")).toContainText(
    "2026.12.28 — 2027.01.03",
  );
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(page.getByLabel("周次控制")).toContainText(
    "2027.01.04 — 2027.01.10",
  );
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await page.getByRole("button", { name: "返回本周", exact: true }).click();
  await expect(page.getByLabel("周次控制")).toContainText(
    "2026.09.21 — 2026.09.27",
  );
  await expect(page.getByLabel("周次控制")).not.toContainText("第 4 周");
});

test("重复课程跨周保留；跨段共用身份；单周修改、取消与恢复互不污染", async ({
  page,
}) => {
  await createCourse(page, "跨段课程");
  await expect(cards(page, "跨段课程")).toHaveCount(2);
  const ids = await cards(page, "跨段课程").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-occurrence-id")),
  );
  expect(new Set(ids).size).toBe(1);
  await expect(cards(page, "跨段课程").first()).toContainText("陈老师");
  for (const action of ["下一周", "上一周"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(cards(page, "跨段课程")).toHaveCount(2);
  }
  await cards(page, "跨段课程").first().click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("仅修改本周", { exact: true })).toBeChecked();
  await dialog.getByLabel("课程名称", { exact: true }).fill("本周临时课程");
  await dialog.getByLabel("星期", { exact: true }).selectOption("2");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(0);
  await expect(cards(page, "本周临时课程")).toHaveCount(2);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(2);
  await expect(cards(page, "本周临时课程")).toHaveCount(0);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await cards(page, "本周临时课程").first().click();
  await page.getByRole("button", { name: "恢复原安排", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(2);
  await cards(page, "跨段课程").first().click();
  await page.getByRole("button", { name: "取消本周课程", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "本周已取消的课程" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(2);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await page
    .getByRole("button", {
      name: "跨段课程 · 2026-09-21 · 查看 / 恢复",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "恢复原安排", exact: true }).click();
  await expect(cards(page, "跨段课程")).toHaveCount(2);
});

test("修改整个课程对其他周生效；删除弹窗确认后所有周消失", async ({ page }) => {
  await createCourse(page, "系列课程");
  await cards(page, "系列课程").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("修改整个课程", { exact: true }).check();
  await dialog.getByLabel("课程名称", { exact: true }).fill("全周更新");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(cards(page, "全周更新")).toHaveCount(2);
  await cards(page, "全周更新").first().click();
  await page.getByRole("button", { name: "删除整个课程", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "删除课程" })).toBeVisible();
  await page
    .getByRole("button", { name: "确认删除全部安排", exact: true })
    .click();
  await expect(cards(page, "全周更新")).toHaveCount(0);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(cards(page, "全周更新")).toHaveCount(0);
});

test("仅本周课程不重复；同格多个课程按时间排序", async ({ page }) => {
  await createCourse(page, "单次课程", true);
  await expect(cards(page, "单次课程")).toHaveCount(2);
  const mondayMorning = page
    .getByRole("table")
    .locator("tbody tr")
    .first()
    .locator("td")
    .first();
  await expect(
    mondayMorning.getByRole("button", { name: /^编辑课程/ }).first(),
  ).toHaveAccessibleName(/高等数学/);
  await expect(
    mondayMorning.getByRole("button", { name: /^编辑课程/ }).nth(1),
  ).toHaveAccessibleName(/单次课程/);
  await page.getByRole("button", { name: "下一周", exact: true }).click();
  await expect(cards(page, "单次课程")).toHaveCount(0);
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(cards(page, "单次课程")).toHaveCount(2);
});

test("学期设置限制重复范围，课程管理可找回隐藏模板", async ({ page }) => {
  await page.getByRole("button", { name: "学期设置", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("学期开始日期").fill("2026-09-02");
  await dialog.getByLabel("学期结束日期").fill("2026-09-01");
  await dialog.getByRole("button", { name: "保存学期", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("结束日期");
  await dialog.getByLabel("学期结束日期").fill("2026-12-20");
  await dialog.getByLabel("教学周数").fill("2");
  await dialog.getByRole("button", { name: "保存学期", exact: true }).click();
  await expect(
    page.getByRole("table").getByRole("button", { name: /^编辑课程/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "课程管理", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "全部课程" }).getByRole("listitem"),
  ).toHaveCount(8);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.getByRole("button", { name: "学期设置", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("教学周数").fill("16");
  await dialog.getByRole("button", { name: "保存学期", exact: true }).click();
  await expect(
    page.getByRole("table").getByRole("button", { name: /^编辑课程/ }),
  ).toHaveCount(8);
});

test("无效时间不能保存；错误提示留在弹窗；空白格可新增", async ({ page }) => {
  await page
    .getByRole("table")
    .getByRole("button", { name: "周六下午添加课程", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("星期", { exact: true })).toHaveValue("6");
  await expect(dialog.getByLabel("开始时间", { exact: true })).toHaveValue(
    "14:00",
  );
  await dialog.getByLabel("课程名称", { exact: true }).fill("错误时间");
  await dialog.getByLabel("结束时间", { exact: true }).fill("13:00");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "结束时间必须晚于开始时间",
  );
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("结束时间", { exact: true }).fill("16:00");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(cards(page, "错误时间")).toHaveCount(1);
});

test("手机可以滚动完整表单保存跨段课程，再切换单日查看", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.getByRole("button", { name: "新增课程", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("课程名称", { exact: true }).fill("移动端课程");
  await dialog.getByLabel("星期", { exact: true }).selectOption("7");
  await dialog.getByLabel("开始时间", { exact: true }).fill("17:00");
  await dialog.getByLabel("结束时间", { exact: true }).fill("19:00");
  await dialog.getByLabel("重复规则").selectOption("once");
  await dialog.getByRole("button", { name: "保存课程", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("group", { name: "选择星期" })
    .getByRole("button", { name: "周日" })
    .click();
  const visibleCards = page.getByRole("button", {
    name: /^编辑课程：移动端课程，/,
  });
  await expect(visibleCards).toHaveCount(2);
  await expect(visibleCards.first()).toContainText("跨时段");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
