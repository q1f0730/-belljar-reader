# 阅间 · 网页书库

把英文小说做成可以阅读、翻译和记笔记的网页书。by Q1f730

公开站点：[阅间书库](https://yuejian-library-q1f.stillriver129.chatgpt.site/)。使用 ChatGPT Sites 托管。

## 功能

- 书库首页、书名和作者搜索、阅读状态筛选、最近阅读排序。
- 电脑双页、手机单页阅读；支持键盘翻页和手机左右滑动。
- 逐词和逐句翻译、中英全文切换、原书译注。
- 每本书独立保存进度、划线和笔记，使用当前浏览器的 IndexedDB。
- 按书导入、导出备份；拒绝将其他书的备份导入当前书。
- 无需登录。AI 陪读尚未接入，界面会明确显示。
- 每本书根据书名、实际内容与核心意象，用 AI 单独生成古典油画封面。

## 视觉设计

沿用《钟形罩》阅读器的白灰点阵、白色浮层、黑色胶囊按钮与少量珊瑚红。油画用于书籍封面。

封面制作规则见 `design/LIBRARY.md`；《钟形罩》的完整生图提示词与内容依据见 `design/covers/belljar.md`。

## 书籍数据

延续本仓库的原有规则：**原著与译文不提交到 GitHub**。本次同步包含源码、界面和封面，站点所用的 20 章中英对照数据继续保留在现有 Sites 项目中。阅读进度与笔记也不提交到仓库。

本地运行阅读器时，请自行准备书籍数据，放在 `public/books/<book-id>/toc.json` 和 `ch01.json` 等文件中。此目录已被 `.gitignore` 排除。

`tools/` 保留原有 EPUB 处理工具，需要自行提供书籍。词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）。

## 继续添加书籍

1. 分配稳定的编号，例如 `new-book`，并将章节 JSON 放在 `public/books/new-book/`。
2. 阅读书籍内容，结合书名、人物、核心意象和情绪，用内置生图工具制作独立的古典油画封面。画作不含文字，优化后放在 `public/covers/`。
3. 在 `design/covers/` 记录完整提示词与内容依据。
4. 在 `src/library.ts` 的 `BOOKS` 中添加标题、作者、章数、`cover.src`、`cover.alt` 等元数据。
5. 构建并更新现有 ChatGPT Sites 项目，不需要重新创建站点。

## 本地开发与检查

- `npm ci`：安装依赖。
- `npm run dev`：启动开发。
- `npm run build`：类型检查并构建到 `dist/`。
- `node scripts/verify-book-storage.mjs`：验证书籍数据隔离与备份。
- `node scripts/verify-books.mjs`：准备本地书籍 JSON 后，验证章节与词典数据。

## 部署

当前站点使用 ChatGPT Sites；`.openai/hosting.json` 保留现有项目身份与静态部署目录。已有的 `worker/`、`wrangler.toml` 和 `tools/deploy.sh` 是历史部署文件，当前站点不使用它们。
