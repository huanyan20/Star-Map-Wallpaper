STAR 倉庫瘦身整理計畫

## Summary

- 目標是降低 repo 體積與噪音：刪除已追蹤的 `.archive/` 約 837 檔與 `dist/` 約 51 MB，讓 memory map 之後只反映 STAR 主應用。
- 本輪不做大型 runtime 重構；只修正與瘦身直接相關的工具鏈、測試入口、忽略規則與文件位置。
- 目前基準：`node --check` 全部 `src/**/*.js` 通過；`npm.cmd run build -- --outDir temp/codex-plan-build --emptyOutDir` 通過，僅有大 chunk 警告。

## Key Changes

- 刪除追蹤中的歷史/產物資料：移除 `.archive/`、`dist/`，並在 `.gitignore` 加入 `.archive/`、`dist/`、`*.bak`、根目錄 `assets/`，避免再次提交。
- 清理舊遷移與一次性檔案：刪除 `scripts/archive/`、`scripts/tools/`、`scripts/clean_app.js`、`scripts/split_app.js`、`scripts/extract*.js`、`scripts/replace.js`、根目錄 `extract.js`、`run_jsdom.js`、`puppeteer_test.js`、`test.glsl`、`src/app.js.bak`。
- 保留並修正正式工具入口：保留 `scripts/build_assets.js`、`scripts/build_tycho2.js`，改為讀 `src/data/real_stars.js` 並輸出到 `public/assets/`。
- 修正 npm scripts：把 `test:smoke` 改成 `node scripts/smoke-test.js`，由新的 smoke script 啟動本地靜態伺服器並從專案根目錄載入 `index.html`。
- 文件整理：將 `# 修復黃昏幾何色塊.md` 移到 `docs/twilight-artifacts.md`，更新舊 `js/...` 路徑為目前 `src/...` 路徑。

## Test Plan

- `git status --short` 確認只有預期刪除、移動與設定檔變更。
- `node --check` 跑過 `src/**/*.js`、保留的 `scripts/*.js`、新的 `scripts/smoke-test.js`。
- `npm.cmd run build -- --outDir temp/codex-plan-build --emptyOutDir`，確認不改動追蹤中的 build 產物。
- `npm.cmd run test:smoke`，確認頁面可載入、主要按鈕可點、console/pageerror 沒有非 favicon 錯誤。
- 刪除後重新建立或刷新 codebase-memory 索引，確認 architecture 不再被 `.archive`、`dist`、舊補丁腳本污染。

## Assumptions

- `dist/` 不再作為部署來源提交；部署流程改為每次從 source build。
- `.archive/` 不保留在 repo 內；若未來仍需要歷史參考，改從 git history 或外部備份取得。
- 本輪瘦身不移除 `public/assets/` 與 `src/data/`，因為它們是目前執行與 build 需要的正式資產。
