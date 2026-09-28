# 本地生产交付清单

日期：2026-09-27。未发布网站，未修改远程仓库。依赖和生产输出模式保持不变。

## 本轮交付

| 文件 | 内容 |
| --- | --- |
| `README.md` | 环境、锁文件安装、启动、测试、使用方法、环境变量、备份及跨设备迁移；纠正 CI 下 Playwright 自动启动服务器的说明 |
| `DEPLOYMENT.md` | 当前已验证的 Node.js 托管、OCR 资源、HTTPS/域名、上线检查、回滚和存储限制；单独标明静态导出未执行 |
| `src/lib/create-local-workspace.ts` | 增加服务端误调用防护，在创建数据库前拒绝非浏览器初始化 |
| `tests/unit/client-boundary.test.ts` | Node 环境导入安全、初始化拒绝且数据库构造器未执行的回归测试 |
| `docs/PRODUCTION_DELIVERY.md` | 本清单 |
| `docs/production-evidence/playwright-results.json` | 本轮完整浏览器测试原始结果 |

## 配置与客户端边界

- `package.json` 和锁文件根依赖声明一致，`npm ls --depth=0` 无缺失或无效依赖。Node 24.19.0、npm 11.17.0、Next 16.3.6、React 19.3.0、TypeScript 5.9.3。
- `next.config.ts` 使用默认生产输出；没有忽略类型或构建错误的配置。本轮生成 `/` 和 `/_not-found` 的预渲染内容，运行方式为 `next start`，不是静态 `out/` 导出。
- 当前无必填业务环境变量，无 API 路由、Server Actions、后端数据库连接或认证服务。Next 是当前托管方式所需服务端依赖；Dexie、SheetJS、ical.js、Tesseract 和 Zod 各有现有业务用途，未发现需要删除的额外服务端数据库依赖。
- `PersistentWorkspace` 在 `useEffect` 内调用 `createLocalWorkspace`，仓库随后执行初始化/查询；渲染和模块顶层不构造数据库。工厂新增 `typeof window` 防护。数据库单元测试使用 fake-indexeddb 属于测试适配，不是应用 SSR 路径。
- 导出下载 DOM 操作只在按钮事件中发生；OCR 在用户操作后创建 canvas 并动态导入 Tesseract；页面监听和弹窗 DOM 操作在 effect 或事件内。生产预渲染与浏览器水合回归通过。
- `prebuild` 实际准备了同源 OCR 资源，`public/ocr/v7` 共 11 个文件、30,583,489 字节；构建时需要开发依赖中的语言包。

## 实际执行与结果

| 命令/检查 | 结果 |
| --- | --- |
| `npm ls --depth=0` | 通过，无依赖树错误 |
| PowerShell 比较 package.json / package-lock.json 根依赖 | 通过；首次读取因锁文件空字符串键失败，改用 `ConvertFrom-Json -AsHashtable` 后校验通过，非依赖不一致 |
| `npm audit --omit=dev --json` | 首次受网络/沙箱限制失败，不作为审计通过依据 |
| `npm audit --json` | 获准联网后完整审计成功，生产及开发依赖共 0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，零警告 |
| `npm test` | 11 个文件、182 项全部通过，包含新增客户端边界测试 |
| `npx prettier --write README.md DEPLOYMENT.md src/lib/create-local-workspace.ts tests/unit/client-boundary.test.ts` | 通过 |
| `npm run format:check` | 通过 |
| `npm run build` | 通过，包含 OCR 资源生成、编译、类型检查及静态预渲染 |
| `$env:PLAYWRIGHT_CHANNEL='msedge'; $env:CI='1'; npm run test:e2e` | 49 项全部通过，约 1.1 分钟，无失败、跳过或 flaky |
| 当前文件密钥模式与环境文件扫描 | 无常见私钥、AWS/GitHub/API 密钥模式命中；未发现 `.env` 文件 |

本轮没有清空并重新安装 node_modules：`npm ci` 是 README 中给出的干净安装步骤，不能将其列作已执行。使用现有完整依赖树、锁文件一致性检查及实际生产构建验证交付。

Playwright 自动启动生产测试服务器，覆盖课程重复及单周恢复、任务独立状态、跨周复制、档案隔离、完整 JSON 覆盖与失败保护、浏览器进程重开、目标进度、CSV/XLSX/ICS、真实 OCR、响应式弹窗和日期边界。详见 [机器结果](production-evidence/playwright-results.json)。输出中的 NO_COLOR/FORCE_COLOR 冲突为终端颜色警告，不影响断言结果。

## 密钥与敏感信息检查边界

扫描当前项目源文件和配置中的常见私钥及令牌格式，只输出匹配文件名，没有输出潜在秘密值；排除了第三方依赖、构建产物和生成 OCR 资源。`.gitignore` 已忽略 `.env*`（允许示例文件）、node_modules、构建和测试输出。

当前目录无 `.git`，无法证明历史提交从未包含秘密；本轮没有远程或提交历史审计。正则扫描不是全面安全审计，npm 的零漏洞结果只代表当时已知公告，不代表绝对安全。测试 JSON 报告含开发机绝对路径，是交付证据，不建议放进网站公开目录。个人 JSON 备份不应提交仓库。

## 已知限制与发布前剩余事项

1. 仅完成本地生产验证，没有部署平台、正式域名、HTTPS 证书或线上烟测；静态导出方案未启用/执行。
2. 实测浏览器为 Edge/Chromium，手机和平板为视口模拟；Safari、Firefox 和真实移动设备未验证。
3. 本地档案不提供身份认证或加密，所有 JSON 备份为明文；不同来源/浏览器/设备间必须手动迁移，恢复覆盖目标的全部本地档案。
4. 浏览器存储可能被清理或回收，不能以自动保存代替外部备份；网站没有完整离线缓存保证。
5. OCR 需要约 30 MB 同源资源，清晰规则截图仍需人工确认；复杂截图不保证准确。当前绝对资源路径要求部署在域名根路径。
6. 数据库及备份版本仍为 1；未来变更必须测试迁移与回滚兼容性。普通多标签页编辑不实时推送。
7. ESLint 9 分支已有结束支持提示，本轮兼容检查通过但未升级工具链；后续升级需单独验证。
8. 上轮提及的 4 张参考截图仍缺失，本轮没有新增参考图还原结论。

发布前应由用户选定托管位置和正式域名后再开展远程操作。
