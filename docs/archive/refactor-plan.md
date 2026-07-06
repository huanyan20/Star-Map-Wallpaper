中型模組重構

建議順序：

1. 先把整理報告收尾  
   若 `walkthrough.md` 還沒提交，建議移到 `docs/walkthrough.md`，把 `file:///...` 改成相對連結，單獨 commit。不要和重構混在同一個 commit。

2. 開始第一輪重構：抽出 `frameState`  
   目標是把 `src/app.js` 裡的每幀資料計算集中成一個物件，例如：
   `ts`、`dt`、`now`、`lstDeg`、`sunCoords`、`moonCoords`、`moonPhase`、`starVisibility`、`skyColors`、`labels`、`atmosphereEnabled`。

3. 第一輪只改資料流，不改視覺  
   不碰 shader、不碰星表、不調參。完成後 `npm run test:smoke` 必須通過，畫面行為應保持一致。

4. 第二輪再拆 renderer  
   把 2D overlay、labels、entities、WebGL 呼叫逐步從 `app.js` 分離。

我會把第一個實作目標定為：**建立 `src/core/frameState.js`，讓 `app.js` 的 `render(ts)` 改成先產生 `frameState`，再交給現有繪製流程使用。**  
這一步風險低，但會為後續拆分打好邊界。

先拆三個高複雜度熱點
setupStars 在 stars.js (line 130) 有 211 行，cognitive complexity 67。
renderWebGL 在 render.js (line 3) complexity 29，而且第 168-176 行和 178-200 行有重複設定太陽位置的邏輯。
setupGrids 在 grids.js (line 79) 把 equatorial/ecliptic/alt-az 三種格線塞在一起。

優先修 renderWebGL 的重複區塊
這是最小、最安全的改善點：把 sun/moon/sky/ocean uniforms 拆成小 helper，並刪掉重複 sun celestialPos 設定。這會讓後續改 shader 或 atmosphere 比較不容易撞壞。

Bundle 可以拆
npm.cmd run test:smoke 通過了，但 Vite 警告主 bundle 約 1.25 MB，gzip 376 KB。星表/天文資料很適合 dynamic import 或 chunk split，尤其是 src/data/* 這些大資料。

測試再補一層
目前 smoke test 有過，很好；下一步我會加小型 deterministic tests：天文座標轉換、grid geometry 長度、star catalog parsing。這些不用跑瀏覽器也能抓很多回歸。
