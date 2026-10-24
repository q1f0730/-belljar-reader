# 阅间 · 双语网页书库

在 ChatGPT Sites 中阅读、翻译、记笔记，并用 Mercury-3 自动把上传的书整理成网页书。

公开站点：https://yuejian-library-q1f.stillriver129.chatgpt.site/

## 上书 Agent

点击「添加书籍」，使用书库主人的 ChatGPT 账号登录。上传 EPUB 或 UTF-8 TXT，可同时上传中文译本与英文原著。双版本先用代码按段落、句长对齐现有文字，再由 AI 检查疑似错配；单版本生成另一种语言。Agent 识别正文目录、分批整理、保存进度，完成后生成仅主人可见的草稿。预览后点击「加入公开书库」才会向所有访客开放。

- EPUB：每个文件最多 20 MB；TXT：最多 5 MB。每个版本正文最多 200 万字符。
- 目前支持可提取文字的 EPUB / TXT，不支持 DRM、扫描图片或 PDF。
- 请保持任务页面打开。关闭页面会暂停后续批次，回来点击继续；已完成批次不重复调用模型。
- 原著和已有译文保留原样。代码保证每个源句按顺序恰好使用一次，AI 只能返回需要复核的单元编号。模型标出问题、内容受限或检查结果无效时，保留代码对齐结果并标记对应章节供复核。
- 单版本的另一种语言标记为 AI 翻译；模型限制内容时暂停，不生成替代文字。自动对齐仍应通过草稿预览抽查。
- 新书先使用代码生成的书名封面。已有《钟形罩》油画封面保持原样。
- 上传内容、任务进度、网页书数据保存在 Sites 的私有文件存储与数据库中，书籍正文不推送 GitHub。

## 原有阅读功能

白灰点阵、白色浮层、黑色胶囊按钮与少量珊瑚红。支持书库搜索和筛选、电脑双页/手机单页、翻页、单词注释、逐句中英切换、全文翻译、划线和笔记。阅读记录按书隔离保存在当前浏览器，可导入与导出备份。AI 陪读聊天尚未开启；上书 Agent 是独立功能。

## 模型与权限

服务端固定使用 `https://api.inceptionlabs.ai/v1/chat/completions` 和 `mercury-3`，不接受访客提供的上游地址。使用 ChatGPT Sites 的密钥设置配置：

- `INCEPTION_API_KEY`：模型密钥，标记为 secret。
- `LIBRARY_ADMIN_EMAIL`：书库主人的 ChatGPT 登录邮箱，标记为 secret。

不要在前端、仓库、hosting manifest 或日志中写入密钥。公开访客可以阅读；只有管理员可上传、调用模型、预览草稿和发布。写操作校验同源、身份与任务状态。每批有持久锁和结果缓存，避免重复执行。

## 本地开发与验证

`npm ci` 安装依赖；`npm run dev` 启动原生 Sites 开发环境；`npm run build` 执行类型检查和正式构建。

`npm run db:generate` 生成数据库迁移。迁移由 Sites 在正式部署时应用。

`npm run test:agent` 验证 EPUB 解析、原文覆盖、无效对齐拒绝、权限、同源校验、重复上传、失败续跑、草稿隔离、发布与导出。此测试使用自写样例和模拟模型响应，不消耗 API 额度。真实 EPUB 测试结果另行记录。

原有存储检查：`node scripts/verify-book-storage.mjs`。静态书籍检查：准备数据后运行 `node scripts/verify-books.mjs`。

## 数据与部署

保留 `.openai/hosting.json` 中的现有 Sites 项目身份，以及 `DB` / `BUCKET` 逻辑绑定。使用 Sites 的源码同步、构建、保存与发布流程。`worker/legacy.ts`、`tools/legacy-wrangler.toml` 与 `tools/deploy.sh` 仅为历史部署文件，当前部署不调用它们。

已有《钟形罩》的静态 JSON 由既有 Sites 项目保留。GitHub 不包含小说原著与译文。词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）。
