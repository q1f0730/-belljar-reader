# belljar-reader

把一本英文小说做成网页书，帮英文不够好的读者读懂原著。by Q1f730

## 功能
- 翻页阅读（宽屏双页、窄屏单页），键盘 ← → / 点两侧 / 手机左右滑
- 侧边栏「译」弹出三个字：
  - **词**：悬停预选，点一下在单词上方出中文小注，并弹出词典气泡（音标、原形、释义）；切到别的翻译方式时全部复原
  - **句**：点一句换成对应中文，再点换回；单词模式下点中文句子也会复原
  - **全**：整本一键切换中英
- 划线：英文、中文各自划。句子换成另一种语言时，划线隐藏，句中留一个小点，点一下把相关句子换回划线时的语言
- 中译本自带的译注以「注」标出
- 进度、划线、笔记存本机 IndexedDB（申请持久存储），可导出/导入备份

## 数据
书本原文与译文 **不在本仓库**。`tools/` 里的脚本把你自己的两本 EPUB 处理成按章 JSON（段落、句子对齐），输出到 `private/book/`（已 gitignore）。线上放在私有 Cloudflare KV，由 `worker/index.ts` 读取，并且只对中国大陆请求开放。

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）。

## 开发
```bash
npm i
python3 tools/parse.py && python3 tools/align.py && python3 tools/dict.py   # 生成数据（需要自备 EPUB）
npm run dev
```

## 部署

Cloudflare Worker（`worker/index.ts`）：网页文件放 KV `SITE`，书本数据放私有 KV `BOOK`，绑定域名见 `wrangler.toml`。

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… ./tools/deploy.sh          # 只更新网页
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… ./tools/deploy.sh --book   # 同时更新书本数据
```
