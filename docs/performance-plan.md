# STAR 效能最佳化藍圖 (Performance Plan)

## 核心目標
因應 250 萬顆恆星 (Tycho-2 星表) 的極端資料量，以及桌布應用程式 (Lively/Wallpaper Engine) 的特殊使用情境，我們需要將現有的渲染機制升級為「GPU 完全接管」加上「智慧休眠」架構。核心目標是將 CPU 負荷降至最低，並解決潛在的 Draw Call 瓶頸。

## 具體實作方向

### 1. 恆星渲染的 GPU 完全接管
星星的圓形光暈、閃爍效果與座標轉換，是目前最大的效能熱點。
- **單一 BufferGeometry**：確保同一個 LOD Chunk 內的星星全數合併為一個 `THREE.Points` 物件，絕不能逐顆建立 mesh 或 sprite，以將 Draw Call 降至最低。
- **Vertex Shader 座標轉換**：持續完善目前的 `eqToHoriz` 矩陣轉換邏輯。確保從赤道座標 (Equatorial) 轉到螢幕座標 (Screen) 的純粹數學運算都在 GPU 端完成。
- **GPU 閃爍邏輯 (Twinkling)**：
  - 取消在 CPU 端逐幀修改 Buffer 的做法。
  - 在建置星表幾何體時，為每顆星附加一個固定的隨機種子 `attribute float seed`。
  - 將統一的時間變數 `uniform float uTime` 傳入 Shader。
  - 在 Fragment/Vertex Shader 內部利用 `sin(uTime * speed + seed)` 來計算每顆星的獨立閃爍亮度，達成 CPU 零介入。

### 2. 光暈與大氣效果最佳化
全螢幕或 4K/多螢幕環境下，Fragment Shader 的逐像素計算 (fill-rate) 是顯卡殺手。
- **預烘焙貼圖 (Baked Texture)**：針對星星的光暈 (Glow) 或銀河霧光，改用預先渲染好的柔光點貼圖 (Sprite Texture) 搭配 Additive Blending 進行繪製，取代 Fragment 裡的距離衰減 (Distance Falloff) 數學公式。
- **全域環境貼圖**：確認 `milkyway.png` 是否已妥善做為 Equirectangular Skybox 或疊圖使用，以減少即時大氣散射計算。

### 3. 桌布引擎智慧節流機制 (Lively / Wallpaper Engine)
作為桌布軟體，應用程式常常處於背景或被其他全螢幕程式覆蓋，我們必須避免無效運算。
- **Lively Wallpaper 支援**：
  - 監聽 `livelyWallpaperPlaybackChanged` 事件。
  - 當收到 `IsPaused === true` 時，主動暫停 `requestAnimationFrame` 迴圈，避免 JavaScript 在背後空轉。
  - 可利用 `livelyPropertyListener(name, val)` 監聽使用者設定檔 (如 LivelyProperties.json)，動態提供「星星密度」、「FPS 上限」等滑桿功能。


### 4. 模組唯一性與雙重渲染排查
- 確保沒有遺留的舊引擎 (如原有的 `webgl_engine.js` 加上 C/WASM 編譯的 Stellarium Web Engine) 在背景同時運作。
- 已知目前 `app.js` 與 `src/webgl/` 的架構重構已經剔除了大部分的舊腳本，未來在導入新模組時仍須注意避免同一時間建立多個 WebGL Context，這會讓 FPS 直接腰斬。

### 5. HEALPix LOD 的持續微調
- 目前 `stars.js` 已經實作了基於視角載入分塊的機制，後續需針對其載入釋放 (Garbage Collection) 與視錐剔除 (Frustum Culling) 做細微效能分析。
- 裝飾性桌布狀態下，可考慮只渲染較亮的星（約 < 6.5 等，約 9000 顆），而 Tycho-2 全量 250 萬星表僅在使用者縮放互動時才觸發，大幅減少日常常駐的頂點數。

### 6. 大氣散射 (Atmospheric Scattering) 最佳化計畫
大氣散射的暴力光線步進 (Brute-force Raymarching) 已在 2026-07-07 的 A/B 測試中被證實為效能瓶頸（將 96 步降為 16 步後 FPS 巨幅提升至 200+）。未來的大規模重構請依循以下工程藍圖（依工程量與 CP 值排序）：
1. **[已實作] 低成本過渡方案**：將積分步數降至 16-24 步，並採用非均勻分佈（Exponential Sampling，靠近地平線密集，高空稀疏）來彌補低步數造成的漸層斷層；同時消除海面分支的二次 `getAtmosphere()` 呼叫。
2. **LUT 烘焙 (Precomputed Look-Up Tables)**：當太陽仰角發生實質改變（或固定頻率如每 0.5 秒）時，將大氣散射結果算進一張低解析度紋理 (如 128x32)，畫面每幀渲染只需簡單查表 `texture2D()` 加上現有漸層底色即可。這能徹底切開「昂貴的積分」與「便宜的取樣」。
3. **降解析度上採樣 (Downsampled Rendering)**：將天空 Pass 畫到 1/2 或 1/4 解析度的 Render Target，再運用 `bloom.js` 的現有邏輯做雙線性放大，大氣漸層屬於低頻資訊，降解析度後視覺差異極小。
