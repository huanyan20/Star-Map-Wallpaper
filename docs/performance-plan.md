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
大氣散射的暴力光線步進 (Brute-force Raymarching) 曾經是本專案最嚴重的效能瓶頸。根據 2026-07-07 的美術與效能雙重評估，我們已決定放棄追求在桌布引擎中實作完全物理準確的 Rayleigh/Mie 積分。

**[已實作] 零迴圈解析式天空 (Zero-loop Analytical Sky Model)**：
我們全面採用了類似天文軟體 (Stellarium / SkySafari) 的做法：
1. **動態時間漸層底色**：由 CPU (`frameState.js`) 依據太陽仰角，即時插值 `topRGB`, `midRGB`, `horRGB`。
2. **解析式光暈 (Analytical Glow)**：在 Fragment Shader 中，不再執行任何 `for` 迴圈，而是單純使用視線與太陽/月亮向量的內積 (Dot Product) 搭配 `pow()` 函數，模擬出 Mie 散射的日暈與月暈效果。
3. **美術風格統一**：此種「手調色標 + 解析光暈」的做法，不僅與現有的高雄光害 (Kaohsiung Skyglow) 及手刻建築天際線的美術風格更為契合（更貼近「觀星 App」的調性），同時將 GPU 運算負載降至最低（O(1) 取代 O(N)），徹底解決了高解析度螢幕下的 Fill-rate 瓶頸。
