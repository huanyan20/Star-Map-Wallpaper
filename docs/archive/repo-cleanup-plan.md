# STAR 瘦身收尾計畫

## Summary

- 問題集中在：一個漏掉的舊腳本、smoke test 會卡住、memory map ignore 規則還不夠完整。

## Remaining Changes

- 刪除 `scripts/split_webgl.js`，它仍指向不存在的 `js/webgl_engine.js` 與 `js/webgl/*`。
- 將根目錄 `STAR 倉庫瘦身整理計畫.md` 移到 `docs/repo-cleanup-plan.md`，保持根目錄乾淨。
- 擴充 `.cbmignore`：加入 `node_modules/`、`dist/`、`temp/`、`public/assets/`、`assets/`、`*.bak`，避免重新索引大型資產或產物。
- 重寫 `scripts/smoke-test.js`：不用 `npx http-server` 子程序，改用 Node `http.createServer`；加入 Chrome/Edge executable fallback，因目前 Puppeteer 預設 chrome 路徑不存在。
- 保持 `package.json` 的 `test:smoke` 指向 `node scripts/smoke-test.js`。

## Verification

- 已確認：`npm.cmd run build -- --outDir temp/codex-plan-build --emptyOutDir` 通過。
- 已確認：`node --check` 跑過 `src/` 與 `scripts/` 目前通過。
- 修完後再跑：`npm.cmd run test:smoke`，預期不逾時、不殘留 port 8081。
- 最後確認：`git status --short` 只包含上述收尾變更，`git ls-files .archive dist src/app.js.bak` 皆為 0。
- 重新刷新 codebase-memory 索引，確認 architecture 不再出現 `.archive`、`dist`、`codebase-memory-mcp-main`、舊補丁腳本。

## Assumptions

- `public/assets/` 與 `src/data/` 仍保留追蹤，因它們是目前執行需要的正式資產。
- `dist/` 不再提交；發布流程由 source build 產生。
