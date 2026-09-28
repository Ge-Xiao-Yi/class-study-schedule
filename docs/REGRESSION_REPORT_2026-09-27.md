# 课表项目回归与视觉优化报告

测试日期：2026-09-27。范围：现有 PRD 功能、用户已要求的 ICS 导入和响应式交互；未增加无关业务功能。

## 结论

最终 Lint、TypeScript、格式检查、181 项单元测试、49 项 Playwright 测试及生产构建均通过。最终浏览器测试没有失败、跳过或重试后通过的项目。修复了页面区域间距、弹窗滚动后的关闭操作和极端日期跳转防护，并统一基础控件视觉。

**未完成参考图比对**：当前对话及项目内未找到用户提到的 4 张参考截图。下文截图是项目自身运行截图，不是用户参考图；不能据此声称实现了参考图还原。

## 实际执行环境与命令

- Windows / PowerShell；Node.js 24.19.0、npm 11.17.0。
- Next.js 16.3.6、React 19.3.0、TypeScript 5.9；修改前阅读了 Next.js 本地 CSS 和 Playwright 指南。
- Playwright 使用本机 Microsoft Edge（Chromium），运行生产构建。重复和日期场景使用固定浏览器时间，避免测试受实际日期影响。
- 上一阶段浏览器启动的审批阻塞在本轮已解除，以下浏览器测试均实际执行。

| 检查 | 命令 | 最终结果 |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | 通过 |
| ESLint | `npm run lint` | 通过，零警告 |
| 单元测试 | `npm test` | 10 个文件，181 项通过 |
| 格式 | `npm run format:check` | 通过 |
| 生产构建 | `npm run build` | 通过，生成 `/` 和 `/_not-found` |
| 浏览器回归 | 下方 PowerShell 命令 | 49 项通过，0 失败、0 跳过、0 flaky；45.7 秒 |

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:CI='1'
npm run test:e2e
```

最终 Playwright 开始时间为 `2026-09-27T12:59:22.738Z`。原始结果存档：[playwright-results.json](qa-2026-09-27/playwright-results.json)。

## 功能验收矩阵

| 范围 | 实际覆盖与结果 | 对应文件 |
| --- | --- | --- |
| 课程 | 每周与单次、教学周范围、单周编辑/取消/恢复、跨段身份与排序，通过 | `tests/course-management.spec.ts`（7 项）；`tests/unit/courses.test.ts` |
| 任务 | 每天/每周重复、单次独立完成、编辑/删除/复制范围、过去未完成保留、跨段显示与排序，通过 | `tests/task-management.spec.ts`（9 项）；`tests/unit/tasks.test.ts`、`task-commands.test.ts` |
| 周次与交互 | 自然周切换、秒级倒计时及跨午夜、编辑模式、上一周复制去重和状态重置、独立时段边界、方向键切日与焦点，通过 | `tests/time-interactions.spec.ts`（6 项）；`tests/unit/time-interactions.test.ts` |
| 档案与持久化 | 刷新、页面重开、整个浏览器关闭后重开；隔离、改名/删除；JSON 导出/二次确认/覆盖恢复；错误文件与取消恢复；跨标签页旧写入拒绝，通过 | `tests/persistence.spec.ts`（7 项）；`tests/unit/database.test.ts`、`repository.test.ts` |
| 数据库失败 | 单元测试使用 fake-indexeddb，包括写入失败及事务回滚；浏览器持久化测试使用真实 IndexedDB，通过 | `tests/unit/database.test.ts`；`tests/persistence.spec.ts` |
| 长期目标 | 关联任务自动进度、单次状态、手动进度、刷新与折叠，通过 | `tests/goals-import.spec.ts`；`tests/unit/goals.test.ts` |
| Excel / CSV | 标准文件导入、字段映射、校验、预览修改、重复导入和无效文件不写入，通过 | `tests/goals-import.spec.ts`；`tests/unit/course-import.test.ts` |
| OCR | 真实本地识别、中文模型加载、逐行确认、人工修改、失败后手动补充、七天规则网格、空白格不生成课程，通过；网络检查未发现离站 OCR 请求 | `tests/goals-import.spec.ts`（目标和导入合计 7 项） |
| ICS | 预览、确认、重复导入；不支持规则拒绝后重新上传有效文件，通过 | `tests/ics-import.spec.ts`（2 项）；`tests/unit/ics-import.test.ts` |
| 响应式 | 320、390、768、1024、1440 宽度的现有布局测试通过 | `tests/schedule.spec.ts`（5 项） |
| 新增视觉回归 | 320×740、768×1024、1440×1000、844×390 页面与 7 类弹窗；无页面横向溢出、关闭按钮无遮挡、滚动后可点击、焦点恢复，通过 | `tests/regression-visual.spec.ts`（6 项，包括下述边界测试） |
| 日期/空数据/冲突 | 新档案空课表、无课程倒计时；闰日跳转；1000/9999 年周边界拒绝并可恢复导航；重叠课程及任务共存，有时间先排序、无时间排后，通过 | `tests/regression-visual.spec.ts`；`tests/unit/dates.test.ts` |

## 失败记录与修复

1. 首次浏览器基线为 **42/43 通过**。ICS 无效文件测试用全页面 `getByRole("alert")`，同时匹配错误提示和 Next.js 路由播报节点，触发严格模式错误。页面本身已正确拒绝文件。将定位范围限制在导入弹窗，并补充真实的有效文件重新上传步骤。最终两项 ICS 浏览器测试通过。
2. 格式检查曾提示新测试文件格式问题；已格式化，最终检查通过。
3. 视觉检查发现状态栏与周次区域的间距容器失效；将 `contents` 改为实际带间距的容器，新测试验证相邻区域至少 20px 间距。
4. 窄屏/横屏长弹窗需要滚动后仍可关闭；改为固定在滚动容器顶部的标题栏，四种视口对全部七类弹窗验证点击命中和焦点恢复。
5. 日期跳转增加整周有效范围验证，防止极端日期导致周内日期越界。错误提示可见，下一次有效跳转清除提示。

以上修复后，最终自动检查无失败项。

## 视觉调整与截图

- 保持浅蓝背景、白色卡片、浅边框和原有课程分类颜色；统一系统中文字体栈、正文行高、输入框圆角及按钮状态。
- 主要按钮和表单控件最小高度 44px，手机输入字号 16px；任务状态标签最小高度 36px，增强文字可读性。
- 缩窄周次标题在手机上的字号，增加长弹窗的滚动间距，避免焦点内容紧贴标题。
- 人工查看了桌面、平板、窄手机页面、手机课程弹窗、横屏任务弹窗及 OCR 预览截图。自动检查没有发现页面横向溢出或关闭按钮遮挡；320px 页面纵向较长，按钮会正常换行。

| 截图 | 链接 |
| --- | --- |
| 修改前项目截图 | [桌面](qa-2026-09-27/before/schedule-1440.png)、[手机](qa-2026-09-27/before/schedule-320.png) |
| 最终页面 | [桌面](qa-2026-09-27/after/page-1440x1000.png)、[平板](qa-2026-09-27/after/page-768x1024.png)、[手机](qa-2026-09-27/after/page-320x740.png) |
| 编辑弹窗 | [手机课程弹窗](qa-2026-09-27/after/新增课程-320x740.png)、[横屏任务弹窗](qa-2026-09-27/after/新增任务-844x390.png) |
| 导入 | [手机预览](qa-2026-09-27/after/import-mobile.png)、[OCR 人工确认](qa-2026-09-27/after/ocr-preview.png) |

截图为测试数据和固定日期，不是用户真实档案。备份在 docs 下，后续重跑 test-results 不会覆盖本轮证据。

## 本轮修改文件

| 文件 | 变更 |
| --- | --- |
| `src/app/globals.css` | 字体、按钮/表单尺寸、颜色、禁用状态及滚动间距 |
| `src/components/ui/dialog.tsx` | 吸顶标题、关闭按钮布局、响应式内边距 |
| `src/components/schedule/persistent-workspace.tsx` | 恢复区域间距容器 |
| `src/components/schedule/week-controls.tsx` | 周次标题层级 |
| `src/components/schedule/task-card.tsx` | 状态标签大小和文字颜色 |
| `src/components/schedule/empty-slot.tsx` | 添加课程/任务按钮尺寸 |
| `src/components/schedule/schedule-workspace.tsx` | 日期跳转整周边界校验和提示清理 |
| `tests/ics-import.spec.ts` | 错误提示定位修复及重新上传验证 |
| `tests/regression-visual.spec.ts` | 新增 6 项回归用例 |
| `playwright.config.ts` | JSON 报告、失败截图和 trace 留存 |
| `README.md` | 本报告入口 |
| `docs/REGRESSION_REPORT_2026-09-27.md` | 本报告 |
| `docs/qa-2026-09-27/` | 修改前后截图及最终机器测试结果 |

## 尚未解决或未验证的事项

| 项目 | 状态与限制 | 对应文件/范围 |
| --- | --- | --- |
| 4 张用户参考图逐项比对 | 缺少原图，未执行；收到图片后才能完成参考还原验收 | 页面和编辑弹窗组件；上述截图目录 |
| 跨浏览器/真机 | 本轮只测 Edge/Chromium，手机和平板为视口模拟；未执行 Safari、Firefox 或真实移动设备测试 | `playwright.config.ts` |
| 无障碍完整审计 | 已验证核心键盘导航、焦点恢复及按钮可操作性；未进行屏幕阅读器实测或正式 WCAG 审计 | `src/components/ui/dialog.tsx` 等 |
| OCR 泛化准确率 | 已通过固定清晰样本及规则网格测试；手写、模糊图、复杂合并格不能保证识别准确，仍须人工确认，不代表任意截图都可识别 | `tests/goals-import.spec.ts`、现有 OCR 导入模块 |
| 本地数据安全边界 | 档案隔离不是身份认证；本地数据与 JSON 未加密，清除浏览器数据可能丢失；本轮未新增账号安全或云同步 | 数据库/备份模块，README 现有限制说明 |

当前没有复现后仍未修复的阻断性功能失败；这不等于穷尽所有浏览器、文件或输入组合。
