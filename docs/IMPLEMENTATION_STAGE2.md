# 自然周与课程管理交付记录

## 已完成

- 自然周的上一周、下一周、日期跳转和返回本周；主页面使用日期范围，不显示教学周编号。
- 学期开始日期、结束日期、教学周数设置，含日期与范围校验。
- 课程新增、编辑、删除确认弹窗，包含名称、地点、教师、星期、节次、时间、颜色、重复规则及教学周范围。
- 默认每周重复，可改为具体日期上的“仅本周”；每门重复课程仅保存一个模板。
- 独立 CourseException 支持仅修改本周、取消本周及恢复；取消后仍有恢复入口。
- 同格多个课程按开始时间排序；跨时段展示共用同一课程及发生实例身份。
- 当前周之外的课程可从“课程管理”列表访问。
- 异步仓库接口、应用服务、纯日期/课程逻辑与内存适配器分离。所有实际课程、学期和例外使用 UUID 与 profileId。
- 保留既有主题、任务示例、长期目标占位和响应式布局。

## 文件清单

新增：

- `src/types/course.ts`：课程、学期、例外与发生实例类型。
- `src/domain/dates.ts`：本地日期、自然周、教学周计算。
- `src/domain/courses.ts`：字段校验、重复解析、例外合并、时段投影。
- `src/application/schedule-service.ts`：课程及学期命令与原子更新。
- `src/repositories/schedule-repository.ts`：存储接口契约。
- `src/repositories/memory-schedule-repository.ts`：临时内存实现。
- `src/lib/create-schedule-session.ts`：浏览器端依赖装配与样例初始化。
- `src/components/ui/dialog.tsx`：模态框、焦点恢复、滚动锁定。
- `src/components/schedule/schedule-workspace.tsx`：加载状态、应用控制器和服务调用。
- `src/components/schedule/course-dialog.tsx`：课程表单、修改范围和删除确认。
- `src/components/schedule/semester-dialog.tsx`：学期设置。
- `src/components/schedule/course-list-dialog.tsx`：全部课程管理。
- `tests/unit/fixtures.ts`：独立测试数据。
- `tests/unit/dates.test.ts`：日期和教学周测试。
- `tests/unit/courses.test.ts`：课程重复、例外、时段与校验测试。
- `tests/unit/repository.test.ts`：事务、隔离、恢复与去重测试。
- `tests/course-management.spec.ts`：完整课程管理浏览器流程。
- `vitest.config.mts`：单元测试配置。
- `docs/IMPLEMENTATION_STAGE2.md`：本记录。

修改：

- `src/app/page.tsx`：接入课程工作区。
- `src/app/globals.css`：可用按钮、表单与响应式弹窗样式。
- `src/components/layout/header.tsx`：标明内存试用。
- `src/components/schedule/week-controls.tsx`：自然周操作和管理入口。
- `src/components/schedule/today-status.tsx`：实际本地日期、实例去重后的今日课程数。
- `src/components/schedule/schedule-grid.tsx`：由计算结果驱动网格、恢复入口和新增按钮。
- `src/components/schedule/course-card.tsx`：可编辑卡片、跨段标记、教师和节次。
- `src/components/schedule/empty-slot.tsx`：可新增课程的空白格。
- `src/lib/demo-data.ts`：保留样例，移除旧的固定周与时段配置。
- `tests/schedule.spec.ts`：改为动态自然周、弹窗及键盘验收。
- `playwright.config.ts`：分离浏览器和单元用例，固定测试时区。
- `tsconfig.json`：包含 `.mts` 测试配置的类型检查。
- `package.json`、`package-lock.json`：添加 Vitest、测试命令及匹配的 Node 版本约束。
- `README.md`：运行命令、使用方式、日期规则、分层契约与阶段边界。

原始 `docs/PRD.txt`、`docs/ARCHITECTURE.txt`、`docs/DATA_MODEL.txt` 保持不变。

## 验证结果

测试环境：Windows、Node.js 24.19.0、Microsoft Edge（Playwright）。

| 检查                   | 结果                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `npm test`             | 3 个文件，39 项单元测试通过                                       |
| `npm run lint`         | 通过，零警告                                                      |
| `npm run typecheck`    | 通过                                                              |
| `npm run build`        | 通过，首页可静态预渲染，业务状态在客户端初始化                    |
| `npm run format:check` | 通过                                                              |
| 浏览器测试             | 首轮修复后 11 项全量通过，追加手机完整编辑用例 1 项通过；共 12 项 |
| 开发预览               | `http://127.0.0.1:3001` 返回 HTTP 200                             |
| 视觉检查               | 已检查桌面、320px 手机页面及课程弹窗；五档宽度无横向溢出          |

覆盖范围包括周日/周一边界、跨月/跨年、闰年、上海与纽约时区及夏令时、学期首尾、教学周范围、单次课程、切周不产生记录、单周修改/取消/恢复、模板改星期后的例外、事务失败回滚、档案隔离、同格排序、跨段身份、删除整门课、错误提示、键盘关闭与焦点恢复、手机滚动保存。

## 问题清单与阶段边界

- 当前没有已知阻塞本阶段验收的问题。
- 按本阶段要求使用临时内存；刷新或重新加载页面会重置数据，界面已明确提示。持久化未开发。
- 学期第 1 周从开学日所在的自然周计算，学期首尾日期均生效；缩短学期会隐藏超出范围的重复课程，但不删除模板。
- 单次课程按具体日期显示，可排在学期外；跨午夜不支持。
- 单周调整限定在同一自然周；跨自然周移动、导入、任务编辑/打卡、倒计时、备份恢复、多档案界面、云端同步和长期目标管理未开发。
- 任务仍为静态样例，长期目标仍为占位，不以课程管理逻辑模拟这些功能。
- 既有 ESLint 9 结束支持提示仍存在，为兼容 Next.js 配套插件而保留；Vitest 5 的 Node 支持范围已同步到 package.json，推荐 Node.js 24 LTS。

本阶段未实现任何下一阶段的数据库或持久化功能。
