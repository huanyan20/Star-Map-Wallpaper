
**藝術借鑑**

1. 天文攝影：用星等控制亮度/半徑，用 B-V 色指數控制冷暖色，並加入很輕的 seeing/twinkle。不要平均閃爍，而是依高度角、濕度感、地平線霧化去變化。

2. 星圖製圖：網格、黃道、赤道、地平座標不要同等權重。可以做 FOV-aware opacity：縮小視野時網格淡出，選中物件附近的輔助線才變亮。

3. 博物館/天象館視覺：加入「導覽模式」。例如選中月亮時，太陽方向、月相 terminator、黃道線、附近亮星依敘事順序浮現，而不是全部同時開。

4. 日式/歐洲古星圖：星座線可以有兩套風格，一套科學線框，一套手繪/神話輪廓。現有 `setupConstellationLines()` 可以延伸成多 style layer。

5. 遊戲天空盒：你的天空 shader 已經有時間、太陽、月亮、海面光照。可以借鑑遊戲引擎的 color grading：清晨偏青金，黃昏偏橙粉，深夜降低飽和但提高星光對比。

**演算法借鑑**

1. 星表切片：目前 `setupStars` 有 chunk 可視判斷與閒置卸載。可借鑑 HEALPix / HTM sky partition，把天空切成等面積區塊，讓 LOD 更穩定，避免某些方向星點密度爆量。

2. 標籤避讓：借鑑地圖 label placement。用螢幕空間 priority queue：亮星、行星、月亮優先，低優先級標籤若碰撞就淡出或延後顯示。

3. 線條渲染：`buildThickLineGeo` 現在 CPU 建厚線 geometry。若網格/星座線變多，可以借鑑 GPU polyline/impostor 技術，把線寬、淡入、地平線遮罩更多交給 shader。

4. 星光美術：借鑑 HDR bloom pipeline，但分層 bloom。太陽/月亮/亮星/銀河不要用同一套 bloom 強度，否則畫面會糊。可以建立 `bloomLayer: sun | moon | brightStar | nebula`。

5. 效能：圖譜顯示主專案熱點集中在 `setupStars`、`renderWebGL`、`setupGrids`。建議先做三件事：減少 render loop 裡的新物件配置、把固定網格預生成或快取、把星點材質 uniform 更新集中到一個狀態同步器。

我的直覺排序是：先做「星等/色溫/高度角驅動的星光美術」，再做「標籤避讓」，最後再改「HEALPix/LOD」。前兩個會最明顯提升作品感，第三個是資料量變大後的底盤升級。
