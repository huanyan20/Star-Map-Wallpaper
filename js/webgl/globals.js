let scene, camera, renderer;
let starsMaterial;
let fieldStarsGeo, namedStarsGeo;
let fieldStarsMesh, namedStarsMesh;
let starCatalogPromise = null;
let labelFontPromise = null;
let labelLayer = null;
let skyW = 0,
  skyH = 0;
