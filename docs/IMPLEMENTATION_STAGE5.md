# 时间信息与核心交互交付

## 功能与规则

1. 今日状态位于周导航上方，显示当前本地日期、星期、正在进行的所有课程和地点。课程时间按开始包含、结束不包含处理，支持重叠课程；排除取消记录并应用单周调整。
2. 倒计时基于当天最晚课程结束的实际时间，每秒读取当前时钟重算。覆盖无课、尚未上课、正在上课、课间休息和当天结束；不出现负数，午夜切换今日。浏览周与今日独立，恢复可见/窗口焦点时立即校正。屏幕阅读器不会每秒播报计时数字。
3. 浏览模式允许日期/周导航、视图切换和任务勾选，禁用课程/任务编辑、学期/时段设置、跨周复制，以及档案操作和备份恢复入口；命令提交还有编辑模式检查。保存中禁止切换编辑模式。
4. “复制上一周”来源为目标自然周前七天。弹窗可选课程、任务、全部，并预览数量。课程固定模板和教学范围保持原样，不复制固定课程的单周例外；仅将未取消的单次课程平移七天，目标相同日期和课程字段已存在则跳过。
5. 任务复制保留 Task 模板，创建目标日期的 TaskOccurrence，不复制完成/进行中状态，截止日期同步后移七天。已有状态、调整或删除记录全部跳过，不重置、不复活。复制不改变源实例；不重复任务存在多个实例时，弹窗提供单次/整个任务范围，副本默认单次编辑。相同来源与目标重复执行不会再新增记录。
6. 三段时间保持上午、下午、晚上身份，开始与结束均可独立设置，允许空隙，无需覆盖 00:00–24:00；每段结束须晚于开始，三个时段按先后排列且不能重叠。课程跨段保持同一身份，有开始时间的任务按新边界定位，仅显示一次；无开始时间或开始位于空隙内时保留手选时段，完全位于时段外的课程单独列出。表单默认课程时间会适应选中时段。
7. 时段使用已有 TimeSlot 表及档案隔离，保留记录 UUID；数据库/备份结构未改变，无需新版本迁移。导入校验允许合法自定义边界，旧默认时段备份仍兼容。
8. 桌面默认七天，可切换单日；平板/手机为可切换日期的单日视图。方向键、Home/End、Enter/Space 可操作，缩放保留当前选中日期。手机档案选择框占完整一行。
9. 共用弹窗限制 Tab/Shift+Tab 在内部循环，Escape 关闭，关闭后恢复原触发按钮焦点；异步保存后在 DOM 更新完成时再次恢复焦点。保存期间禁用整组控件，领域错误通过 alert 显示。

## 文件范围

新增：

- src/domain/today-status.ts
- src/domain/time-slots.ts
- src/domain/copy-week.ts
- src/components/schedule/time-slots-dialog.tsx
- src/components/schedule/copy-week-dialog.tsx
- tests/unit/time-interactions.test.ts
- tests/time-interactions.spec.ts
- docs/IMPLEMENTATION_STAGE5.md

更新：

- src/types/course.ts：课表快照携带 TimeSlot。
- src/application/schedule-service.ts、task-commands.ts：时段和复制命令、任务自定义时段归属。
- src/repositories/dexie-schedule-repository.ts、memory-schedule-repository.ts：快照读写时段并校验档案归属。
- src/domain/courses.ts、tasks.ts、schedule-items.ts、backup.ts：动态时段投影与备份校验。
- src/components/schedule/schedule-workspace.tsx、persistent-workspace.tsx：实时状态、编辑模式及操作入口。
- src/components/schedule/today-status.tsx、week-controls.tsx、schedule-grid.tsx、course-card.tsx：状态显示、响应式与键盘操作。
- src/components/schedule/course-dialog.tsx、task-dialog.tsx、task-fields.tsx：动态时段表单和复制实例操作范围。
- src/components/ui/dialog.tsx：焦点循环、恢复与保存禁用。
- tests/unit/database.test.ts：自定义时段隔离/恢复、跨周复制幂等持久化测试。
- README.md：实际使用规则和限制。

## 验证

命令：

```powershell
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:CI='1'
npm run test:e2e
```

最终验收（2026-09-26）：TypeScript、Lint、格式检查、生产构建全部通过；7 个单元测试文件共 130 项通过（取消空隙和一分钟时段的旧拒绝用例，新增独立边界用例）；真实 Edge 浏览器 34 项通过，包括原有回归及六个边界独立保存、刷新保留和空隙课程/任务展示。

单元测试包含时钟边界、重叠课程、午夜、时段空隙/重叠验证、跨年复制、源状态保留、目标状态/删除保留、重复执行幂等，以及数据库时段隔离和 JSON 恢复。真实浏览器覆盖秒级更新、浏览周独立、编辑限制、复制三种范围、单次实例操作、手机/平板操作与键盘焦点。320px 手机截图已检查，主要操作与表单无横向溢出。未发现阻塞本阶段使用的问题。

## 剩余限制

- 倒计时依赖设备本地时钟；后台标签页可能限频，回到页面后会即时校正。跨午夜课程仍不支持。
- 三个时段支持独立设置和空隙，不支持增加第四段或时段跨午夜；固定课程复制不会延长教学周，也不会复制单周例外，弹窗已说明。
- 本地档案仍不是安全账号，无密码保护、云端同步或跨标签页实时推送。目标编辑、Excel/CSV/OCR 等本阶段之外的功能未开发。
