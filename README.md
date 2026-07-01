# 高雄星空觀測儀 (STAR)

這是一個以高雄為觀測點的即時互動星圖 Web 應用程式。展示恆星位置、星座連線與亮度，並支援流暢的動畫與互動。

## 開發與建置指令

- **啟動開發伺服器**：
  ```bash
  npm run dev
  ```
  這會啟動 Vite 本機伺服器並支援 Hot Module Replacement (HMR)。

- **建置正式版本 (Production Build)**：
  ```bash
  npm run build
  ```
  這會將專案打包並輸出到 `dist/` 目錄。**請注意：`dist/` 目錄不會被提交到 Git (已在 `.gitignore` 與 `.cbmignore` 忽略)**，發布流程請以 source build 自動產生為主。

- **執行端到端 (E2E) 煙霧測試 (Smoke Test)**：
  ```bash
  npm run test:smoke
  ```
  這會自動先執行 `npm run build` 打包應用程式，接著啟動輕量化的 Node.js HTTP Server 提供 `dist/` 產物，最後使用 Puppeteer 開啟無頭瀏覽器驗證整個 App 載入與渲染過程中沒有任何致命錯誤 (Page Errors 或 404)。

## 後續優化事項

- 渲染器 Warning 清理：目前 `test:smoke` 會出現以下非阻塞型的 WebGL 警告，將於後續視覺與渲染優化時處理：
  - `THREE.Material: 'derivatives' is not a property of THREE.ShaderMaterial.`
  - `THREE.WebGLProgram: Program Info Log: warning X4000: use of potentially uninitialized variable (f_getProceduralSkyline)`
