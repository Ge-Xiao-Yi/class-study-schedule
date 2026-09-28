# 学习任务管理交付记录

本阶段在既有自然周与课程管理基础上实现任务管理，保留原有 Next.js 项目、仓库接口、浅蓝主题及响应式布局。原始 PRD、ARCHITECTURE、DATA_MODEL 文档未修改。

## 实现范围

1. 编辑模式默认开启；空白格及已有内容的格子均有独立的添加课程、添加任务按钮。浏览模式隐藏新增入口、禁用编辑，保留任务勾选。
2. 任务表单包含名称、日期、所属时间段、可选开始/结束时间、预计耗时、截止日期、状态、重复规则和可选重复截止日期。
3. 支持不重复、每天重复、每周重复；每天按自然日、每周按起始日期的星期计算，重复截止日包含当天。
4. Task 保存定义，TaskOccurrence 保存单次 todo / in_progress / done 状态、完成时间与单次覆盖。不重复任务也使用实例保存状态。
5. 勾选只完成当前实例，取消勾选回到未开始并清空完成时间。进行中在弹窗设置。完成名称显示删除线，过去未完成留在原日期。
6. 跨时间段任务只在开始时段出现；课程仍按原有规则跨段显示。起始时间为空时使用手选时段。
7. 同格课程与任务按开始时间混排；任务仅有结束时间时按结束时间排序；两者均无时排到最后，预计耗时不参与排序。同一时刻先课程后任务，再按稳定身份排序。
8. 编辑、删除、复制均提供作用范围与确认页面。支持仅这一次及整个重复任务，打卡保持直接操作。
9. 单次删除使用 TaskOccurrence.overrides.deleted 墓碑，避免重新计算重复时复活；没有扩展状态枚举。整个删除清理模板与所有实例。
10. 单次修改用 overrides.startDate 保存显示日期，occurrenceDate 保持原发生日期，因此跨周移动仍具有同一身份。整组编辑保留已记录状态与单次覆盖；仅更新当前实例的状态。
11. 不重复任务改变日期时移动同一 UUID 实例，不生成第二份。改变重复规则时，已记录实例仍保留为历史记录。
12. 单次复制取有效字段并创建不重复副本；整组复制取模板规则。新任务和记录均使用新 UUID，状态重置为未开始，不复制单次覆盖；截止日期和重复截止日期随目标日期平移。
13. “任务管理”可找到当前周以外的任务模板。原有任务样例已转为可编辑的正式任务实体。

## 仓库与数据边界

- 沿用 ScheduleRepository 的异步 read/transact，不让组件访问内存实现。
- 扩展快照容纳 tasks 和 taskOccurrences；保持 profileId 隔离、事务失败回滚和独立返回快照。
- 仓库禁止同一 taskId + occurrenceDate 重复保存，也禁止孤立实例与跨档案写入。
- 创建任务仅保存起始实例，后续周视图计算虚拟实例；只有显式打卡/编辑/删除才按需写入记录，不提前生成长期重复数据。
- 数据仍在本页内存中；刷新会重置，界面已提示。没有开发 IndexedDB、localStorage 或服务器持久化。

## 修改文件

新增：

- `src/types/task.ts`：Task、TaskOccurrence、覆盖信息和展示类型。
- `src/domain/tasks.ts`：任务日期重复、时段归属、输入验证和周投影。
- `src/domain/schedule-items.ts`：课程/任务混合排序与时间格筛选。
- `src/application/task-commands.ts`：创建、状态、单次/整组编辑、删除及复制命令。
- `src/components/schedule/task-fields.tsx`：任务表单字段。
- `src/components/schedule/task-dialog.tsx`：编辑、复制和作用范围确认。
- `src/components/schedule/task-list-dialog.tsx`：所有任务定义管理。
- `tests/unit/task-fixtures.ts`：任务测试数据。
- `tests/unit/tasks.test.ts`：重复、日期边界、时段、排序和验证测试。
- `tests/unit/task-commands.test.ts`：状态隔离、作用范围、复制、仓库一致性与回滚。
- `tests/task-management.spec.ts`：任务浏览器验收。
- `docs/IMPLEMENTATION_STAGE3.md`：本记录。

修改：

- `src/types/course.ts`：扩展共用快照。
- `src/types/schedule.ts`：明确旧类型仅用于样例初始化。
- `src/repositories/schedule-repository.ts`：补充任务实例的仓库约束说明。
- `src/repositories/memory-schedule-repository.ts`：任务档案、关联和唯一性验证。
- `src/application/schedule-service.ts`：事务内接入任务命令。
- `src/lib/create-schedule-session.ts`：将任务样例初始化为模板与实例。
- `src/components/schedule/schedule-workspace.tsx`：任务管理状态、服务调用和编辑模式。
- `src/components/schedule/week-controls.tsx`：编辑模式、新增任务及任务管理入口。
- `src/components/schedule/schedule-grid.tsx`：真实任务投影、混排和独立新增入口。
- `src/components/schedule/empty-slot.tsx`：独立添加课程/任务按钮。
- `src/components/schedule/course-card.tsx`：浏览模式禁用课程编辑。
- `src/components/schedule/task-card.tsx`：独立勾选、状态、删除线、耗时、截止与过去未完成提示。
- `tests/unit/fixtures.ts`：共用测试快照包含任务集合。
- `README.md`：使用方式、任务规则、分层与阶段边界。

未更换框架或引入新依赖；课程规则与课程测试保持原样。

## 验收结果

环境：Windows、Node.js 24.19.0、Microsoft Edge。浏览器测试固定本地日期，避免运行日期变化影响断言。

| 验收项                 | 结果                                                      |
| ---------------------- | --------------------------------------------------------- |
| `npm test`             | 5 个测试文件、67 项通过，含原有 39 项及新增 28 项         |
| `npm run test:e2e`     | 21 项通过，含原有 12 项课程/响应式回归及新增 9 项任务流程 |
| `npm run typecheck`    | 通过                                                      |
| `npm run lint`         | 通过，零警告                                              |
| `npm run build`        | 通过                                                      |
| `npm run format:check` | 通过                                                      |
| 页面与弹窗             | 已检查桌面、320px 手机及任务弹窗截图；五档宽度无横向溢出  |

已验证：周一完成不影响周二或下周；切周返回保留状态；取消勾选清空完成时间；进行中仅影响当前实例；单次编辑跨周移动无源副本；单次删除不复活；整组删除不影响课程；单次/整组复制使用独立状态；整组编辑不覆盖其他日期状态；不重复任务改期不重复；课程 CRUD、单周例外、恢复和跨段行为未回归。

## 尚未开发

持久化、目标管理、导入/OCR、备份恢复、多档案界面、倒计时、访问保护与云端同步均未开发。跨午夜任务继续按数据模型限制拒绝。本阶段没有推进下一阶段功能。
