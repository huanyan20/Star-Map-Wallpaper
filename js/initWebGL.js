function initWebGL() {
    const webglCanvas = document.createElement('canvas');
    webglCanvas.id = 'webgl-canvas';
    webglCanvas.style.position = 'absolute';
    webglCanvas.style.top = '0';
    webglCanvas.style.left = '0';
    webglCanvas.style.width = '100vw';
    webglCanvas.style.height = '100vh';
    webglCanvas.style.zIndex = '0'; // Behind 2D canvas

    // ensure 2D canvas is above and transparent
    const canvas2d = document.getElementById('canvas');
    canvas2d.style.position = 'absolute';
    canvas2d.style.zIndex = '1';
    canvas2d.style.background = 'transparent'; // so we can see WebGL behind it
    canvas2d.parentElement.insertBefore(webglCanvas, canvas2d);

    renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    
    // listen for resize
    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth/2;
        camera.right = window.innerWidth/2;
        camera.top = window.innerHeight/2;
        camera.bottom = -window.innerHeight/2;
        camera.updateProjectionMatrix();
    });

    scene = new THREE.Scene();

    camera = new THREE.OrthographicCamera( -window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0.1, 1000 );
    camera.position.z = 100;

    setupShaders();
    setupStars();
    setupMoon();
}
window.initWebGL = initWebGL;
