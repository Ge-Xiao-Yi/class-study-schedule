# 生产部署与数据迁移

当前发布目标为 GitHub Pages，仓库为 `Ge-Xiao-Yi/class-study-schedule`。是否已经上线以仓库 Actions 的部署结果为准。

## GitHub Pages

1. 在仓库 Settings → Pages → Build and deployment 中，将 Source 设置为 **GitHub Actions**。
2. 将代码推送到 `main`，工作流 `.github/workflows/pages.yml` 会安装锁定依赖、检查类型和 Lint、运行单元测试、构建静态文件，再执行浏览器测试；全部成功后发布 `out/`。
3. 部署成功后访问 `https://ge-xiao-yi.github.io/class-study-schedule/`。没有成功部署前，该地址可能为 404。
4. 后续修改提交并推送到 `main` 即可触发更新。失败时查看 Actions 日志，未通过检查不会发布新的构建。

本地验证相同静态版本：

```powershell
npm run build:pages
$env:PAGES_BUILD='1'
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:CI='1'
npm run test:e2e
npm run preview:pages
```

预览地址 `http://127.0.0.1:3000/class-study-schedule/`。构建脚本自动准备 OCR、启用 `output: 'export'`、设置 basePath 并生成 `.nojekyll`。OCR worker 和模型均使用相同子路径。若仓库改名或改用自定义域名，需要同时调整 next.config.ts 和静态预览脚本中的路径并重新测试。

`PAGES_BUILD` 是构建/测试开关，`NEXT_PUBLIC_BASE_PATH` 由 Next 配置写入浏览器包，不含密钥。普通 `npm run build` 仍生成以下 Node 托管版本；两种构建共享 `.next`，切换方式时需要重新构建。`next start` 不能启动静态导出，应使用静态预览命令。

GitHub Pages 发布的是程序，不包含浏览器 IndexedDB。请从本地地址导出 JSON，再在正式网址恢复。GitHub Pages 同一域名下不同项目路径共享浏览器 origin；该账号下若部署了其他使用相同数据库名的应用，可能共享数据。路径不是数据安全隔离边界。

## 可选方案：Node.js 托管

当前 `next.config.ts` 保持 Next.js 默认输出，支持 `next build` + `next start`。选择支持 Node.js 24 和 Next.js 的托管环境，或者在自己的服务器运行 Node.js 服务。数据库仍在每个用户浏览器中，服务器只提供应用及 OCR 静态资源；不需要 PostgreSQL、Redis、账号数据库或数据库环境变量。

### 环境与构建

- 使用 Node.js 24（本地验证版本 24.19.0）、npm 和锁文件 `package-lock.json`。
- 构建环境安装开发依赖，不要在构建前使用 `npm ci --omit=dev`，也不要用 `--ignore-scripts` 跳过资源准备。
- 安装需访问 npm registry 与 SheetJS 官方 `cdn.sheetjs.com`。OCR 模型来自锁定的 npm 开发依赖，生成后由网站同源提供。
- 无必填业务环境变量，无 API 密钥。不要给本地档案添加虚假的账号登录说明。

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

本机打开 `http://127.0.0.1:3001/`。进程必须持续运行；关闭进程后链接会拒绝连接。若进程管理器或容器要求监听所有网卡，改用 `--hostname 0.0.0.0` 并配置网络访问规则和 HTTPS 入口。

托管平台配置：构建命令 `npm ci && npm run build`（若平台已自动执行锁文件安装则只需 `npm run build`），启动命令 `npm run start -- --hostname 0.0.0.0`。端口使用平台注入的 `PORT`，或显式 `--port`。发布根目录使用项目根目录，不要把 `.next` 当作普通静态站点目录上传。

自管主机应由进程管理器维护 `next start`，前置 HTTPS 反向代理。监听地址、证书和域名均属于实际发布阶段配置，本轮未修改。访问域名根路径；当前 OCR 资源使用绝对路径 `/ocr/v7/...`，未经适配不要部署到 `/schedule/` 一类子路径。

### 必须保留的文件与资源

- Node 托管保留 `.next`、`public`、运行依赖、`package.json` 和所需配置；最简单是从完整项目安装并构建。
- `npm run build` 的 `prebuild` 自动运行 `scripts/prepare-ocr.mjs`，生成 `public/ocr/v7` 中的 worker、WASM 包装资源、英文/简体中文模型和许可证。
- `public/ocr` 被 Git 忽略是正常的，部署必须在构建阶段生成，不能因忽略规则而漏发。完成构建之后才可裁剪开发依赖；以后重新构建需恢复开发依赖。
- 不要上传 `test-results`、`playwright-report`、个人 JSON 备份、`.env` 或开发机器用户目录。测试报告在 docs 下仅用于交付审阅，不必作为公开资源发布。
- 不要自行给所有 HTML 设置长期不可变缓存；沿用 Next.js 响应头。OCR 模型的 `.gz` 文件是供 OCR 库下载解压的数据，不要误配置为服务器已透明解压后的另一种响应内容。

### 上线前验收

1. 使用独立测试档案打开网站，确认自动保存、刷新保留、切换档案隔离及备份恢复。
2. 确认 `/ocr/v7/worker.min.js` 和语言模型可下载，并用一张清晰截图实际识别；若启用 CSP，检查 worker、WASM 和同源模型请求未被拦截。
3. 执行生产 E2E。先构建，确保 3000 端口空闲；Playwright 自动启动并结束测试服务器：

```powershell
# Windows 上已有 Edge，可免安装测试 Chromium
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:CI='1'
npm run test:e2e
```

无 Edge 的环境先执行 `npx playwright install chromium`，不设置 `PLAYWRIGHT_CHANNEL`；Linux 可能需要 `npx playwright install --with-deps chromium` 安装系统依赖。结果写入 `test-results/regression-results.json`，失败保留截图和 trace。

4. 检查手机主操作、文件选择、下载及弹窗键盘操作。真正发布前仍需目标域名和目标浏览器验收，本地 Edge 测试不能代替它们。

## 浏览器存储、备份与手动迁移

- IndexedDB 数据按协议、域名、端口及浏览器配置文件隔离。开发地址和正式域名的数据不会自动转移；不同浏览器、设备也不会自动同步。
- 本地档案只是数据分类，不是安全账号，无密码、加密或服务端访问控制。同一浏览器的使用者可访问所有档案。
- 定期在编辑模式下导出完整 JSON，包含全部档案和关联数据。备份格式版本及数据库结构版本目前均为 1；恢复先验证版本、字段、关联和唯一性。
- 换设备/域名前：在原地址导出 JSON → 安全传到新设备 → 在目标地址先备份已有数据 → 选择恢复文件 → 核对摘要 → 二次确认覆盖 → 检查课程、例外、任务状态和目标。
- 恢复是对目标网站全部本地数据的事务替换，不做合并；失败回滚。多标签页下，恢复前打开的旧页面需重新加载，旧会话写入会被拒绝。
- JSON 明文应按个人数据保护；不要放入公开仓库或静态站点目录。清理站点数据、浏览器配额回收、隐私窗口关闭都可能造成数据丢失，服务器备份无法备份用户浏览器数据库。
- 使用正式 HTTPS；本机 `localhost`/`127.0.0.1` 可用于本地测试。系统日期/时区影响“今天”、重复日期和倒计时；后台标签页定时器可能被降频。

## 更新和回滚

更新前保留上一个可运行版本与锁文件，提醒用户导出 JSON。先在独立测试地址验证新构建，再切换流量；普通服务器代码更新不会主动清除浏览器数据。后续数据库结构升级须添加 Dexie 版本迁移并测试，不能只改旧版本表定义。若新版本已升级用户本地数据库，旧代码未必能打开新结构，不能把回滚服务器视为数据回滚；应先验证版本兼容性，必要时用兼容版本恢复事先导出的备份。

本轮检查结果和限制见 [生产交付清单](docs/PRODUCTION_DELIVERY.md)。
