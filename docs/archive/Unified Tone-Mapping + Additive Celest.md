# Unified Tone-Mapping + Additive Celestial Shader Refactor

## Summary
把 Milky Way、Nebula、Stars 明確納入本輪 tone-mapping / bloom 重構，不再當成 open question。目標是讓所有 additive sky-space shader 以一致方式輸出 linear HDR emission，最後只在 bloom composite pass 做一次 ACES tone mapping 與 sRGB encoding。

## Key Changes
- 調整 tone-mapping 主線：`src/webgl/bloom.js` 的 composite pass 負責 `scene + bloom` 後的 ACES + sRGB；`src/webgl/init.js` 改為 `THREE.NoToneMapping`；sky/ocean shader 移除各自的內部 tone mapping。
- 新增 `src/webgl/additiveSkyMaterial.js` 作為 additive celestial layer helper，提供：
  - `createAdditiveSkyUniforms(overrides)`
  - `createAdditiveSkyMaterial(options)`
  - `registerAdditiveSkyMaterial(material)`
  - `syncAdditiveSkyMaterials(frameUniforms)`
- 納入並統一這些 material：`window.starsMaterial`、Star LOD chunk clone materials、`window.mwMaterial`、`window.mwGlowMaterial`、`window.nebulaMaterials`。
- Stars / Milky Way / Nebula fragment shaders 不做 tone mapping、不做 sRGB 輸出、不 clamp HDR；texture-backed Milky Way glow 與 Nebula 在 shader 內把 sampled PNG RGB 視為 sRGB 並轉回 linear 後再算 luminance/alpha。
- `src/webgl/render.js` 改由 registry 同步 additive sky materials 的 `eqToHoriz`、`lookAz`、`lookEl`、`focalLen`、`time`、`starVisibility`、`dpr`，取代手動拼 `mats` 陣列；Star LOD chunk material 建立後立即 register。
- 修正 Milky Way visibility：`window.toggles.milkyway` 同時控制 `window.mwMesh` 與 `window.mwGlowMesh`。

## Test Plan
- 跑 `npm run test:unit`、`npm run build`、`npm run test:smoke`。
- 手動驗證夜空畫面：Stars、Star LOD、Milky Way particles、Milky Way glow、Nebula decals 都可見，無黑色貼圖方塊、無 WebGL shader warning。
- 手動切換 Milky Way button，確認 particles 與 glow 同步顯示/隱藏。
- 在廣角與 zoom-in 狀態確認 star LOD chunk 載入後仍收到 uniform 更新。
- 比對 bloom 開關或 threshold 調整時，additive layers 不被雙重 tone-map，也不出現整片過曝 washout。

## Assumptions
- 「這次重構」指 `implementation_plan.md` 的 unified tone-mapping pipeline refactor；`docs/refactor-plan.md` 的 frameState/module 拆分可另行進行。
- 本輪只處理 active `src/webgl/*` 路徑，不動 `.archive/` 與 legacy `src/initWebGL.js`。
- 不重新產生 Milky Way / Nebula / Star assets；視覺常數先以維持現有觀感為準，只在 linearization 後明顯過亮或過暗時做最小調整。
