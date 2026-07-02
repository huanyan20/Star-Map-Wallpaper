# STAR 後續品質整理計畫

## Summary

- 目前倉庫瘦身已完成；下一階段聚焦「讓測試輸出乾淨、讓 memory map 可信、把大型資產與渲染熱點文件化」。
- 本階段不做大型視覺重構，不改互動行為，只清理已知 WebGL warning 與維護文件。
- 優先順序：渲染警告清零 → smoke test 變嚴格 → memory map 重建 → 資產/架構文件補齊。

## Key Changes

- 修正 `src/webgl/init.js` 的 `ShaderMaterial` 設定：移除無效的頂層 `derivatives: true`，改用 `extensions: { derivatives: true }` 或在確認 shader 不需要 derivative functions 後直接移除。
- 修正 `src/shaders/skyFragment.frag.glsl` 與 `src/shaders/oceanFragment.frag.glsl` 的 `getProceduralSkyline`：確保回傳值在所有 branch 都初始化，消除 `f_getProceduralSkyline` uninitialized warning。
- 更新 `scripts/smoke-test.js`：修完 warning 後，把已知 WebGL warning pattern 視為測試失敗；仍只忽略 favicon 404。
- 新增 `docs/assets.md`：說明 `public/assets/` 保留追蹤的理由、`build:assets` / `build:tycho2` 的輸入輸出、`STAR_LABEL_FONT` 前提，以及 `dist/` 不提交。
- 重建 codebase-memory index 後新增 `docs/architecture-memory-map.md`：記錄目前主架構、忽略規則已生效、剩餘複雜熱點如 `src/webgl/sky.js`、`src/webgl/render.js`、`src/webgl/stars.js`、`src/app.js`。

## Test Plan

- `Get-ChildItem -Path src,scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`
- `npm.cmd run test:smoke`
- 驗收標準：smoke test 通過，且不再輸出 `THREE.Material: 'derivatives'` 或 `f_getProceduralSkyline` warning。
- `git status --short --untracked-files=all` 確認乾淨或只包含本階段預期變更。
- 重建 memory map 後確認索引不包含 `.archive/`、`dist/`、`node_modules/`、`public/assets/`。

## Assumptions

- `public/assets/` 本階段繼續追蹤，不導入 Git LFS。
- 渲染效果必須保持現狀；shader 只修初始化與材質設定警告。
- 大型模組拆分與效能重構留到下一輪，等 warning 與 memory map 乾淨後再做。
