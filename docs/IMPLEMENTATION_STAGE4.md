# 本地持久化与档案管理交付

在现有项目中接入持久化，保留课程和任务业务命令及仓库契约。已重新阅读原始 PRD、ARCHITECTURE、DATA_MODEL，原文未修改。

## 数据库结构

数据库名 `study-week-local`，Dexie 结构版本 1。后续变更应追加版本及升级逻辑；当前没有需要迁移的旧 IndexedDB 数据库。

| 表 | 实体与主要索引 |
| --- | --- |
| profiles | Profile：id，名称、创建/更新时间 |
| semesters | Semester：id、profileId |
| timeSlots | TimeSlot：id、profileId、唯一 [profileId+period] |
| courses | Course：id、profileId、[profileId+semesterId] |
| courseExceptions | CourseException：id、profileId、唯一 [profileId+courseId+originalDate] |
| tasks | Task：id、profileId |
| taskOccurrences | TaskOccurrence：id、profileId、唯一 [profileId+taskId+occurrenceDate] |
| goals | Goal：id、profileId |
| goalTaskRelations | GoalTaskRelation：id、profileId、唯一 [profileId+goalId+taskId] |
| appSettings | AppSettings：id、唯一 profileId，保存 activeSemesterId |
| metadata | 内部设备状态：key=workspace、activeProfileId、epoch |

用户实体使用稳定 UUID。除 Profile 本身和内部设备状态外，每条记录都带 profileId。每个档案至少有学期、设置和三个固定时间段。Goal 字段沿用文档；Task.goalId 非空时必须有对应目标及关联，关联不得跨档案。删除任务会同时清理关联，保留目标。

## 访问与恢复设计

- ScheduleRepository 的 read/transact 接口不变，注入 DexieScheduleRepository；课程、单周例外、任务模板和单次状态均持久化。
- ArchiveRepository 提供档案 CRUD、选择、ProfileData 类型化读取/原子更新及完整备份恢复，覆盖全部实体。UI 不直接查询 Dexie 表。
- 事务内读取最新数据，校验归属和关系，再写入。并发连接串行提交，失败不返回成功。首次演示数据只播种一次，新档案为空；元数据缺失时拒绝重置，保留原数据并提供恢复入口。
- 切换档案卸载旧课表和表单、撤销旧会话；保存期间禁止切换。仓库在事务前后检查会话，切换中的旧写入也能回滚。
- 打卡立即显示待保存勾选并禁止重复操作；成功后更新完成效果，失败回退原值并提示。
- 完整 JSON 顶层包含 format=study-week-backup、formatVersion=1、databaseVersion=1、exportedAt、activeProfileId、data。data 含全部十张用户表。内部 epoch 不导出，恢复后重新生成。
- 导入上限 20 MB；严格验证未知字段、格式版本、UUID、日期时间、重复规则、状态、唯一性、设置和时间段完整性、同档案外键及目标关联。允许学期缩短后的历史课程范围及修改重复规则后保留的历史状态。
- 选择文件后展示档案和记录摘要；继续后另有最终确认与明确勾选，提示先备份。恢复覆盖全部档案，不是合并。
- 恢复入口再次校验，在一个全表读写事务中清空并插入，任何写入失败都会回滚。事务内不等待文件读取或用户确认，遵循 [Dexie 事务语义](https://dexie.org/docs/Dexie/Dexie.transaction())。
- 恢复/删除档案更换 epoch，其他标签页旧会话的读写被拒绝，用户需重新加载；普通跨标签页编辑不实时推送。

## 修改文件

新增：

- src/types/archive.ts
- src/domain/backup.ts
- src/repositories/archive-repository.ts
- src/repositories/local-database.ts
- src/repositories/dexie-archive-repository.ts
- src/repositories/dexie-schedule-repository.ts
- src/application/local-workspace.ts
- src/lib/create-local-workspace.ts
- src/components/schedule/persistent-workspace.tsx
- src/components/schedule/backup-dialog.tsx
- tests/unit/database.test.ts
- tests/persistence.spec.ts
- docs/IMPLEMENTATION_STAGE4.md

修改：

- package.json、package-lock.json：Dexie 4.4.6、Zod 4.6.5、fake-indexeddb 6.2.5。
- src/lib/create-schedule-session.ts：仅提供首次建档案的初始数据。
- src/components/schedule/schedule-workspace.tsx：持久化会话、保存反馈。
- src/components/schedule/task-card.tsx：异步打卡反馈及失败回退。
- src/components/schedule/today-status.tsx、src/components/layout/header.tsx：移除过期的内存提示。
- README.md：使用说明和实际存储限制。

## 运行与验证

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:CI='1'
npm run test:e2e
```

浏览器验收使用 3000 端口的独立生产服务，不修改 3001 开发站点的数据。测试包括数据库关闭重开、实际浏览器进程关闭重开、不同档案读写、模板和状态恢复、旧会话撤销、恢复中途故障回滚、异常文件拒绝及原有课程/任务回归。

最终验收（2026-09-26）：TypeScript、Lint、生产构建通过；6 个单元测试文件共 103 项通过；真实 Edge 浏览器 28 项通过（包含原有 21 项课程、任务和响应式回归，以及新增 7 项持久化验收）。格式检查发现测试文件尾部格式差异，已统一格式，复检通过。

新增验收覆盖刷新与页面关闭重开、整个浏览器进程退出后使用同一数据目录重开、档案隔离与选择保留、JSON 全量恢复、错误文件与取消确认不改变原数据、320px 弹窗无横向溢出，以及另一标签页恢复后的旧写入拒绝与复选框回退。数据库测试还模拟恢复清空后发生写入故障，确认事务回滚，原数据保留。

## 安全限制及未实现范围

- 档案是本地分类，不是安全账号。无密码、加密或身份验证；同一浏览器的使用者及同源代码能够访问全部数据，备份为明文。
- IndexedDB 按浏览器和站点源隔离。localhost 与 127.0.0.1、3000 与 3001 均不是同一份存储。清除网站数据、隐私模式结束、浏览器空间回收和设备损坏都可能导致丢失，重要内容应另存备份。
- 只接受完整 v1 JSON，不支持部分合并、未知版本降级或自定义时段边界。没有承诺浏览器永久保留或云端容灾。
- Goal 及关联具有数据访问和备份能力，目标界面仍为占位；Excel/CSV/OCR、账号、访问保护和云端同步等下一阶段功能未开发。
- 前一阶段已随刷新丢失的内存数据无法追溯恢复。
