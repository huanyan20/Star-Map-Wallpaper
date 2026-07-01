async function loadLabelFont() {
  if (labelFontPromise) return labelFontPromise;
  labelFontPromise = Promise.all([
    fetch('assets/labels.json').then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load assets/labels.json: ${resp.status}`);
      return resp.json();
    }),
    new Promise((resolve, reject) => {
      new THREE.TextureLoader().load('assets/labels.png', resolve, undefined, reject);
    }),
  ]).then(([font, texture]) => {
    texture.flipY = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return { font, texture };
  });
  return labelFontPromise;
}

function setupLabelLayer(labelFont) {
  labelLayer = new LabelLayer(labelFont.font, labelFont.texture);
}
