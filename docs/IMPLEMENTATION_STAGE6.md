# 长期目标与课表导入

本次复用现有 ScheduleService、ScheduleRepository、Dexie 事务及原生弹窗，未重建项目。数据库和 JSON 备份版本仍为 1：Goal、GoalTaskRelation 已存在，无须迁移。旧备份可以继续使用。

## 长期目标

- 周课表下方提供可折叠面板，可新增、编辑及确认删除目标，保存名称、描述、开始日期、进度模式和手动百分比。
- 自动进度为已完成实例数 / 范围内有效实例总数，四舍五入到整数百分比。范围是目标开始日期至设备本地今天，含首尾，按实例实际安排日期统计。
- 按重复规则计算截至今天应出现的未打卡实例，同时合并已保存的单次调整、跨周复制和历史实例；不会只统计已打卡记录，也不为统计预生成数据库记录。
- 已删除实例和实际日期在范围外的实例不计入；进行中不算完成；无实例显示 0%。重复规则变化后保留的历史记录仍会计入，移动实例按新日期计算。
- Task.goalId 与 GoalTaskRelation 同事务更新。任务表单选择一个目标，修改关联作用于整个任务模板。仅单次编辑时目标选择禁用并解释范围。目标编辑可勾选任务，选择其他目标的任务会转移关联。
- 删除目标只解除关联，保留任务和单次完成记录。关闭编辑模式后不能修改目标或导入课程。

## 文件格式和导入步骤

1. Excel：`.xlsx`、`.xls`，支持工作表选择。CSV：`.csv`，支持 UTF-8 BOM、引号转义、单元格换行，以及可选 GB18030/GBK 解码。
   日历：`.ics`（UTF-8 iCalendar 2.0），同样通过字段映射、可编辑预览、确认、去重及事务追加。详细规则见下文。
2. 界面可下载 `.xlsx` 和 `.csv` 标准模板。每行一门课程，第一行为唯一非空表头。模板例子重复范围为第 1 教学周，导入前可修改。
3. 标准字段：课程名称、地点、教师、星期、节次、开始时间、结束时间、颜色、重复规则、起始教学周、结束教学周、单次日期。可使用中文字段或对应模型字段名，其他表头可手动映射；同一列不能重复映射。
4. 星期支持 1–7、周一/星期一等；时间为 24 小时 `HH:mm`（允许 `8:00` 标准化为 `08:00`）；日期为 `YYYY-MM-DD`。颜色支持 blue/green/purple/orange/pink 或浅蓝/浅绿/浅紫/浅橙/浅粉。重复支持 weekly/每周、once/单次。单次日期必须与星期一致。
5. 颜色留空默认浅蓝，重复留空默认每周，教学周留空默认当前学期完整范围。缺失名称、星期或开始结束时间会标记无效，不能提交。预览支持全部字段编辑、删除错误行、手动补充行及分页；任何编辑都会撤销该行确认。
6. 文件最多 10 MB、20 张工作表、每张 500 行数据和 50 列。拒绝公式、合并单元格、非法文件签名、破损 CSV 和重复表头。暂不解析复杂学校原始网格 Excel，应先整理成标准列式模板。
7. 重复判断依据名称、地点、教师、星期、节次、起止时间、重复类型及重复范围；颜色不参与。完全相同的数据库课程或本批次课程跳过。时间重叠但其他字段不同仍可导入，符合原项目允许同格多课程的规则。
8. 所有有效行经确认，再显示最终新增/跳过数量；最终提交时在当前档案事务内重新校验、重新去重，只追加课程，不更改已有课程、例外或任务。任何校验/写入异常均回滚。

## 浏览器本地 OCR

- 支持 PNG、JPEG、WebP，最多 10 MB、1200 万像素。Tesseract.js 7 的 Web Worker、WebAssembly 核心和简体中文/英文模型全部由本项目同源提供，图片只在浏览器内处理，无上传接口。
- `npm run dev` 和 `npm run build` 会先执行 `scripts/prepare-ocr.mjs`，从已锁定依赖复制资源到 `public/ocr/v7`。生成目录不提交，构建部署需带上 public。可单独执行 `npm run prepare:ocr`。首次识别需要加载较大的本地资源，速度取决于设备。
- 文字行模式：适合一行一门课程，也可设定百分比区域识别单个单元格。可从明确文字提取星期与起止时间；其他文字先放入名称，地点、教师、节次等由用户拆分核对。
- 七天网格模式：周一至周日七列等宽、1–12 行等高、每格一门课程。使用百分比边界排除表头和侧栏，并显示分格覆盖层；按列获得星期，逐格识别内容。空白格无识别文字时不生成课程。
- 所有 OCR 字段以待确认样式展示，不能批量确认 OCR 行，必须逐行核对。无法识别时间或星期时保留空白并禁止提交；课程名称可能混入教室、教师或周次，必须人工修正。
- 手写、低清晰度、倾斜、复杂合并单元格、不等宽列、单格多门课、单双周/不连续周范围不能保证识别。不支持 PDF、HEIC 或自动推算学校节次时间。复杂截图可分区域识别并手动补充。
- 提供取消识别及三分钟超时；失败、取消均不写入数据库，可继续手动添加课程。识别原文供核对，不持久保存图片或 OCR 文本。

## ICS 追加支持

- 使用 ICAL.js 解析 VEVENT，支持 SUMMARY 名称、LOCATION 地点、DTSTART、DTEND 或 DURATION、折行和转义。教师与节次不从自由文本猜测，可在预览中补充。
- 支持单次、DAILY/WEEKLY、INTERVAL（含隔周）、COUNT、UNTIL、BYDAY 多星期、WKST、RDATE、EXDATE，以及 RECURRENCE-ID 单次调课和 STATUS:CANCELLED。取消通知不会删除数据库已有课程。
- 仅提取当前学期开始日至结束日（含首尾）的实际安排；无限重复也在学期结束截断。预览会说明范围及目标时区。无时区的浮动时间按本地时间解释；UTC、IANA TZID 和文件内 VTIMEZONE 转换为浏览器本地时区。无定义且无法识别的时区报错，不按 UTC 猜测。
- 同星期、同时间和同字段的连续周合并为每周模板；隔周、EXDATE 造成的空缺及单次调课按实际日期拆分为若干连续模板或单次课程，不提前保存大量每周记录，也不会填补原本没有课程的日期。
- 暂不支持全天事件、跨午夜课程、非零起止秒数、MONTHLY/YEARLY/小时级规则、复杂 BYxxx 条件、EXRULE、RDATE 时间段、RANGE 范围修改或同一 UID 的多个主版本。无法表达时整份解析报错，不悄悄丢弃规则。单次调课必须带对应主事件。
- 10 MB 文件上限、1000 个 VEVENT、10000 次展开保护、整理后最多 500 行。过长的历史重复序列需先缩小导出范围。ICS 导入是当前学期的静态快照，不保存源 UID 进行订阅同步；相同课程按现有字段去重，源日历后续改变不会自动更新本地课程。
- 新增 `src/lib/ics-courses.ts`、`tests/unit/ics-import.test.ts`、`tests/ics-import.spec.ts`；更新文件解析器、导入弹窗及依赖锁文件。所有解析在浏览器本地完成，不抓取附件或远程日历地址。
- 实现依据：[ICAL.js 官方解析与重复 API](https://kewisch.github.io/ical.js/api/ICAL.Event.html)。

## 修改文件

- 领域：`src/domain/goals.ts`、`src/domain/course-import.ts`。
- 应用：`src/application/goal-commands.ts`、`schedule-service.ts`、`task-commands.ts`。
- 仓库/类型：`src/types/course.ts`、`src/repositories/dexie-schedule-repository.ts`、`memory-schedule-repository.ts`。
- 目标界面：`src/components/goals/long-term-goals.tsx`、`goal-dialog.tsx`。
- 导入界面：`src/components/import/course-import-dialog.tsx`、`ocr-input.tsx`。
- 解析适配：`src/lib/course-files.ts`、`local-ocr.ts`、`scripts/prepare-ocr.mjs`。
- 接入：`src/components/schedule/schedule-workspace.tsx`、`task-dialog.tsx`、`src/components/ui/dialog.tsx`、`src/app/page.tsx`、`globals.css`。
- 依赖和配置：`package.json`、`package-lock.json`、`.gitignore`、`.prettierignore`、`eslint.config.mjs`。
- 测试：`tests/unit/goals.test.ts`、`course-import.test.ts`、`database.test.ts`、`tests/goals-import.spec.ts`。
- 文档：`README.md`、本文件。原始 PRD/架构/数据模型未修改。

## 验证命令

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

测试覆盖目标模式、开始/结束日期边界、跨年/闰年、独立打卡、移动/删除/保留历史、关联切换、跨档案引用、备份恢复、模板解析、CSV 转义、Excel 公式/合并拒绝、字段映射、批次去重、失败不修改数据。浏览器使用真实 OCR 引擎测试识别、七天网格和人工修正，不用模拟识别结果替代验收。

验收结果（2026-09-27）：TypeScript、Lint、格式检查和生产构建全部通过；9 个单元测试文件共 158 项通过；真实 Edge 浏览器 41 项通过（原有 34 项回归及新增 7 项）。已检查桌面 OCR 和手机导入预览截图：长表格在弹窗内部横向滚动，页面无横向溢出。浏览器 OCR 测试验证中英文模型从同源加载，未请求外部识别服务。未发现阻塞当前功能的问题；识别准确率受上述截图结构和清晰度限制，仍须人工确认。

依赖使用依据：[SheetJS 官方安装说明](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)、[Tesseract.js 本地资源配置](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)。SheetJS 使用官方 0.20.3 分发包，未使用 npm 上的旧版 xlsx。
