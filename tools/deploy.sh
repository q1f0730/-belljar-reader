#!/usr/bin/env bash
# 构建 → 把 dist/ 上传到 SITE KV → 部署 Worker。需要 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID。
# 加 --book 时同时把 private/book/*.json 上传到 BOOK KV。
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
python3 - <<'PY'
import base64, json, pathlib
out = [{"key": str(p.relative_to("dist")), "value": base64.b64encode(p.read_bytes()).decode(), "base64": True}
       for p in pathlib.Path("dist").rglob("*") if p.is_file()]
json.dump(out, open("/tmp/belljar-site.json", "w"))
print(len(out), "files")
PY
npx wrangler kv bulk put /tmp/belljar-site.json --binding SITE --remote
if [[ "${1:-}" == "--book" ]]; then
  python3 -c "import glob,json,os;json.dump([{'key':os.path.basename(f),'value':open(f).read()} for f in sorted(glob.glob('private/book/*.json'))],open('/tmp/belljar-book.json','w'),ensure_ascii=False)"
  npx wrangler kv bulk put /tmp/belljar-book.json --binding BOOK --remote
fi
npx wrangler deploy
