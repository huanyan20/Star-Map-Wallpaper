# Unified Tone-Mapping Pipeline Refactor

將分散在 sky/ocean 的 per-material tone-mapping 抽掉，統一搬到 bloom composite pass 做一次性 ACES tone-mapping + sRGB 編碼。

## Background

目前 pipeline 有三個互相矛盾的 tone-mapping 點：

| 位置 | 做了什麼 | 問題 |
|------|---------|------|
| [skyFragment.frag.glsl:223](file:///c:/Users/ggini/Desktop/STAR/src/shaders/skyFragment.frag.glsl#L223) | `physColor = 1.0 - exp(-physColor * 1.5)` | Reinhard-ish 壓縮，提前把 HDR → [0,1] |
| [skyFragment.frag.glsl:285](file:///c:/Users/ggini/Desktop/STAR/src/shaders/skyFragment.frag.glsl#L285) | `physOcean = 1.0 - exp(-physOcean * 1.5)` | 同上，sky 的 ocean-base 分支 |
| [oceanFragment.frag.glsl:377](file:///c:/Users/ggini/Desktop/STAR/src/shaders/oceanFragment.frag.glsl#L377) | `waterColor = ACESFilm(waterColor)` | Narkowicz ACES fit |
| [init.js:28](file:///c:/Users/ggini/Desktop/STAR/src/webgl/init.js#L28) | `renderer.toneMapping = ACESFilmicToneMapping` | **對 ShaderMaterial 無效** |
| [bloom.js:170](file:///c:/Users/ggini/Desktop/STAR/src/webgl/bloom.js#L170) | 註解說 renderer 會做 → **錯誤** | composite 直接輸出 linear 到 canvas |

另外，`renderer.outputColorSpace` 沒有設定（預設 `SRGBColorSpace`），但對手寫 `ShaderMaterial` 同樣不會自動注入 `#include <colorspace_fragment>`，所以 composite 輸出的 linear 值沒有做 sRGB OETF，顏色會偏暗/偏灰。

## Proposed Changes

### Sky Shader — 移除內建 tone-mapping

#### [MODIFY] [skyFragment.frag.glsl](file:///c:/Users/ggini/Desktop/STAR/src/shaders/skyFragment.frag.glsl)

**Line 223** — 移除 `1.0 - exp(-physColor * 1.5)`，讓 atmosphere 結果維持 linear HDR：

```diff
-                physColor = 1.0 - exp(-physColor * 1.5);
+                // Exposure scale only — tone-mapping moved to composite pass
+                physColor = physColor * 1.5;
```

> [!IMPORTANT]
> 移除 tone-mapping 後，`physColor` 不再被壓進 [0,1]。後續的 `mix(nightGrad, physColor, atmosphereBlend)` 在白天時 `physColor` 可能 > 1.0，這正是我們想要的——讓它以 HDR 形式進入 `rtScene`，最後由 composite 做統一壓縮。但 `* 1.5` 這個 exposure 倍數需要保留（或調整），因為 atmosphere 原始值的量級需要它。

**Line 285** — 同理，sky 的 ocean-base 分支：

```diff
-                physOcean = 1.0 - exp(-physOcean * 1.5);
+                // Exposure scale only — tone-mapping moved to composite pass
+                physOcean = physOcean * 1.5;
```

> [!WARNING]
> 這個分支的結果馬上被 `* 0.15`（line 290）壓得非常暗，所以 HDR 值幾乎不可能爆，但語義上一致比較乾淨。

---

### Ocean Shader — 移除 ACESFilm

#### [MODIFY] [oceanFragment.frag.glsl](file:///c:/Users/ggini/Desktop/STAR/src/shaders/oceanFragment.frag.glsl)

**Line 377** — 移除 `ACESFilm(waterColor)` 呼叫：

```diff
-            // 套用 ACES 色調映射，讓高光更自然，提升對比
-            waterColor = ACESFilm(waterColor);
+            // Tone-mapping moved to composite pass (bloom.js).
+            // waterColor stays in linear HDR here.
```

ACESFilm 函式定義（L170-177）**先保留不刪**，避免未來被其他地方引用時找不到。只是不再呼叫。

---

### Bloom Composite — 加入 ACES + sRGB

#### [MODIFY] [bloom.js](file:///c:/Users/ggini/Desktop/STAR/src/webgl/bloom.js)

`matComposite` 的 fragment shader（L161-173）改為：

```glsl
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uStrength;
varying vec2 vUv;

// Narkowicz 2015 ACES fit (same coefficients as ocean.frag had)
vec3 ACESFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

// sRGB OETF (IEC 61966-2-1) — linear → sRGB
vec3 linearToSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
    return mix(lo, hi, step(0.0031308, c));
}

void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 hdr = scene + bloom * uStrength;

    // Unified tone-mapping: single point for the entire pipeline
    vec3 ldr = ACESFilm(hdr);

    // sRGB encoding (ShaderMaterial doesn't get automatic colorspace_fragment)
    gl_FragColor = vec4(linearToSRGB(ldr), 1.0);
}
```

---

### Renderer Config — 移除無效設定

#### [MODIFY] [init.js](file:///c:/Users/ggini/Desktop/STAR/src/webgl/init.js)

```diff
-  window.renderer.toneMapping = THREE.ACESFilmicToneMapping;
-  window.renderer.toneMappingExposure = 1.0;
+  // Tone-mapping & sRGB encoding are handled manually in the bloom composite
+  // shader (bloom.js), since all scene materials use ShaderMaterial which
+  // bypasses Three.js automatic toneMapping/colorspace injection.
+  window.renderer.toneMapping = THREE.NoToneMapping;
```

---

## User Review Required

> [!IMPORTANT]
> **Exposure 調整**：移除 sky 的 `1.0 - exp(-x)` 後，atmosphere 輸出從 Reinhard 壓縮的 [0,1) 變成 linear（可能 > 1.0），由 composite 的 ACESFilm 統一壓縮。視覺差異主要出現在：
> - **白天天空**：可能變亮或 saturation 改變（ACES S-curve 與 `1-exp(-x)` 的 roll-off 曲線不同）
> - **月光高光**：moonGlow 加在 tonemapped 後面（L229）→ 現在加在 linear HDR 上，行為不同但更正確
> - **Ocean specular**：之前被 ACES 壓過一次再加 bloom 再沒壓 → 現在 linear 加完 bloom 後統一壓一次
>
> 這些差異需要肉眼盯著畫面調 `* 1.5` 之類的 exposure 常數。我的計劃是**先做結構修改、跑起來看畫面**，再根據視覺反饋微調。

> [!WARNING]
> **sRGB 編碼**：加上 `linearToSRGB()` 後，原本直接寫 canvas 的 linear 值會被正確編碼，**整體亮度會上升**（之前偏暗是因為 linear 值被當 sRGB 顯示）。如果你覺得調完之後太亮，是正常的——之前沒做 sRGB 編碼本來就是偏暗的。

## Open Questions

1. **Milky Way / Nebula / Stars 的輸出**：這些都是 `AdditiveBlending` 的 `ShaderMaterial`，它們的 fragment 輸出本來就可能 > 1.0，會被 additive blending 疊加到 `rtScene` 裡。現在有了 composite 的 ACES 壓縮，它們的高光會被優雅地 roll off 而不是 clamp。這應該是一個純正向改善，不需要額外修改。你同意嗎？

2. **`* 1.5` exposure 常數**：sky 裡的 `physColor * 1.5` 和 `physOcean * 1.5` 原本是搭配 `1-exp(-x)` 曲線的。搬到 ACES 之後，同樣的 `* 1.5` 出來的亮度和 roll-off 會不同。你希望我先用原值上去看看，還是直接改一個比較接近的值？

## Verification Plan

### Automated Tests
```bash
npm run test:smoke
```
Smoke test 確認 build 通過、無 console error。

### Manual Verification
- `npm run dev` 開 local server，肉眼比對白天/黃昏/夜間三個時段的天空、海面、星星亮度
- 確認星星 bloom 高光不再被 flat clamp，而是平滑 roll-off
- 確認海面月光 specular 不再過曝
- 確認整體色調沒有明顯偏色（sRGB 編碼加上後可能需要微調 exposure）
