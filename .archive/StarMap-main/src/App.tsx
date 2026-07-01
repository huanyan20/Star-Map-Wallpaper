import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Search, X, ChevronDown, RotateCcw } from 'lucide-react';

const InteractiveStarMap = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const raycasterRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false); // To distinguish between a click and a drag
  const previousMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });
  const celestialBodiesRef = useRef([]);
  const starsRef = useRef([]);
  const searchInputRef = useRef(null);
  const initialCameraPosition = useRef(new THREE.Vector3(0, 100, 500));
  
  const [neoData, setNeoData] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [dataFreshness, setDataFreshness] = useState(0);
  const [apodData, setApodData] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);

  // NASA API configuration
  const NASA_API_KEY = 'DEMO_KEY';
  const NEO_API_URL = `https://api.nasa.gov/neo/rest/v1/feed?api_key=${NASA_API_KEY}`;
  const APOD_API_URL = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;

  // Detailed planet data with proper NASA/space imagery
  const planetDatabase = {
    'Sun': {
      type: 'Star',
      classification: 'G-type main-sequence star (G2V)',
      distance: '0 AU (Center of Solar System)',
      diameter: '1,391,000 km',
      mass: '1.989 × 10^30 kg',
      temperature: 'Core: 15 million°C, Surface: 5,500°C',
      composition: '73% Hydrogen, 25% Helium, 2% heavier elements',
      age: '4.6 billion years',
      facts: [
        'Contains 99.86% of the Solar System\'s mass',
        'Light takes 8 minutes 20 seconds to reach Earth',
        'Rotates once every 25-35 days (differential rotation)',
        'Produces energy through nuclear fusion',
        'Will become a red giant in ~5 billion years'
      ],
      atmosphere: 'Corona extends millions of kilometers into space',
      moons: 'N/A',
      dayLength: '~25 Earth days at equator',
      yearLength: 'N/A (orbits galactic center every 230 million years)',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg/290px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg'
    },
    'Mercury': {
      type: 'Terrestrial Planet',
      classification: 'Rocky planet, smallest in Solar System',
      distance: '0.39 AU from Sun (57.9 million km)',
      diameter: '4,879 km',
      mass: '3.285 × 10^23 kg',
      temperature: 'Day: 430°C, Night: -180°C',
      composition: 'Large iron core, thin rocky mantle',
      age: '4.5 billion years',
      facts: [
        'Closest planet to the Sun',
        'No atmosphere to retain heat',
        'One day on Mercury = 59 Earth days',
        'Has water ice at its poles despite extreme heat',
        'Most cratered planet in the Solar System'
      ],
      atmosphere: 'Trace amounts of oxygen, sodium, hydrogen',
      moons: '0',
      dayLength: '58.6 Earth days',
      yearLength: '88 Earth days',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Mercury_in_color_-_Prockter07-edit1.jpg/290px-Mercury_in_color_-_Prockter07-edit1.jpg'
    },
    'Venus': {
      type: 'Terrestrial Planet',
      classification: 'Rocky planet with thick atmosphere',
      distance: '0.72 AU from Sun (108.2 million km)',
      diameter: '12,104 km',
      mass: '4.867 × 10^24 kg',
      temperature: 'Average surface: 462°C',
      composition: 'Iron core, rocky mantle, volcanic surface',
      age: '4.5 billion years',
      facts: [
        'Hottest planet in the Solar System',
        'Rotates backwards (retrograde rotation)',
        'Atmospheric pressure 90x Earth\'s',
        'Rains sulfuric acid in upper atmosphere',
        'Often called Earth\'s "evil twin"'
      ],
      atmosphere: '96.5% CO2, 3.5% Nitrogen, traces of SO2',
      moons: '0',
      dayLength: '243 Earth days (retrograde)',
      yearLength: '225 Earth days',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Venus_from_Mariner_10.jpg/290px-Venus_from_Mariner_10.jpg'
    },
    'Earth': {
      type: 'Terrestrial Planet',
      classification: 'Rocky planet with life',
      distance: '1 AU from Sun (149.6 million km)',
      diameter: '12,742 km',
      mass: '5.972 × 10^24 kg',
      temperature: 'Average surface: 15°C',
      composition: 'Iron core, rocky mantle, 71% water surface',
      age: '4.54 billion years',
      facts: [
        'Only known planet with life',
        'Largest terrestrial planet',
        '71% covered by water',
        'Protective magnetic field shields from solar wind',
        'Perfect distance from Sun for liquid water'
      ],
      atmosphere: '78% Nitrogen, 21% Oxygen, 1% other gases',
      moons: '1 (The Moon)',
      dayLength: '24 hours',
      yearLength: '365.25 days',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/290px-The_Earth_seen_from_Apollo_17.jpg'
    },
    'Mars': {
      type: 'Terrestrial Planet',
      classification: 'Rocky planet with polar ice caps',
      distance: '1.52 AU from Sun (227.9 million km)',
      diameter: '6,779 km',
      mass: '6.39 × 10^23 kg',
      temperature: 'Average: -60°C',
      composition: 'Iron core, basaltic rock surface',
      age: '4.6 billion years',
      facts: [
        'Known as the "Red Planet" due to iron oxide',
        'Has the largest volcano in Solar System (Olympus Mons)',
        'Evidence of ancient river valleys',
        'Has seasons like Earth',
        'Target for human colonization'
      ],
      atmosphere: '95% CO2, 3% Nitrogen, 2% Argon',
      moons: '2 (Phobos and Deimos)',
      dayLength: '24 hours 37 minutes',
      yearLength: '687 Earth days',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/290px-OSIRIS_Mars_true_color.jpg'
    },
    'Jupiter': {
      type: 'Gas Giant',
      classification: 'Largest planet in Solar System',
      distance: '5.20 AU from Sun (778.5 million km)',
      diameter: '139,820 km',
      mass: '1.898 × 10^27 kg',
      temperature: 'Cloud tops: -108°C',
      composition: '90% Hydrogen, 10% Helium, traces of methane',
      age: '4.6 billion years',
      facts: [
        'Has a Great Red Spot storm lasting 400+ years',
        'Acts as "vacuum cleaner" protecting inner planets',
        'Has faint ring system',
        'Emits more heat than it receives from Sun',
        'Could fit all other planets inside it'
      ],
      atmosphere: 'Hydrogen, Helium, with colorful cloud bands',
      moons: '95 known (4 large Galilean moons)',
      dayLength: '9 hours 56 minutes',
      yearLength: '11.86 Earth years',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/290px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg'
    },
    'Saturn': {
      type: 'Gas Giant',
      classification: 'Ringed gas giant',
      distance: '9.54 AU from Sun (1.43 billion km)',
      diameter: '116,460 km',
      mass: '5.683 × 10^26 kg',
      temperature: 'Cloud tops: -139°C',
      composition: '96% Hydrogen, 3% Helium, traces of methane',
      age: '4.5 billion years',
      facts: [
        'Spectacular ring system made of ice and rock',
        'Less dense than water (would float!)',
        'Has hexagonal storm at north pole',
        'Rings are only 10 meters thick',
        'Takes 29.5 years to orbit the Sun'
      ],
      atmosphere: 'Hydrogen, Helium, with ammonia crystals',
      moons: '146 known (Titan is larger than Mercury)',
      dayLength: '10 hours 42 minutes',
      yearLength: '29.5 Earth years',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/290px-Saturn_during_Equinox.jpg'
    }
  };

  // Reset view function
  const resetView = () => {
    if (cameraRef.current) {
      cameraRef.current.position.copy(initialCameraPosition.current);
      cameraRef.current.lookAt(0, 0, 0);
      rotationRef.current = { x: 0, y: 0 };
      setSelectedObject(null);
    }
  };

  // Search functionality - now searches ALL celestial bodies
  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.length > 0) {
      // Search through ALL celestial bodies in the scene
      const allObjects = celestialBodiesRef.current
        .filter(obj => obj.userData && obj.userData.name)
        .map(obj => ({
          name: obj.userData.name,
          lowerName: obj.userData.name.toLowerCase()
        }));
      
      const lowerQuery = query.toLowerCase();
      const suggestions = allObjects
        .filter(obj => obj.lowerName.includes(lowerQuery))
        .map(obj => obj.name);
      
      // Limit suggestions to 10 for better UX
      setSearchSuggestions(suggestions.slice(0, 10));
    } else {
      setSearchSuggestions([]);
    }
  };

  const navigateToObject = (objectName) => {
    // Find the object in celestialBodiesRef by searching userData.name
    const targetObject = celestialBodiesRef.current.find(
      obj => obj.userData && obj.userData.name === objectName
    );
    
    if (targetObject && cameraRef.current) {
      // Calculate direction to object
      const objectPosition = new THREE.Vector3();
      targetObject.getWorldPosition(objectPosition);
      
      // Set camera to look at object
      const distance = targetObject.userData.type === 'star' ? 200 : 100;
      const direction = objectPosition.clone().normalize();
      cameraRef.current.position.copy(direction.multiplyScalar(-distance).add(objectPosition));
      cameraRef.current.lookAt(objectPosition);
      
      // Select the object using its userData
      setSelectedObject(targetObject.userData);
      setImageLoadError(false);
      
      // Close search
      setShowSearch(false);
      setSearchQuery('');
      setSearchSuggestions([]);
    }
  };

  // Fetch NASA data
  const fetchNASAData = useCallback(async () => {
    try {
      setIsLoading(true);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const startDate = today.toISOString().split('T')[0];
      const endDate = tomorrow.toISOString().split('T')[0];
      
      const neoResponse = await fetch(`${NEO_API_URL}&start_date=${startDate}&end_date=${endDate}`);
      const neoJson = await neoResponse.json();
      
      const apodResponse = await fetch(APOD_API_URL);
      const apodJson = await apodResponse.json();
      
      if (neoJson.near_earth_objects) {
        const allNeos = [];
        Object.values(neoJson.near_earth_objects).forEach(dateNeos => {
          allNeos.push(...dateNeos);
        });
        setNeoData(allNeos);
        setApodData(apodJson);
        setDataFreshness(100);
        
        sessionStorage.setItem('neoData', JSON.stringify(allNeos));
        sessionStorage.setItem('apodData', JSON.stringify(apodJson));
        sessionStorage.setItem('dataTimestamp', Date.now());
      }
    } catch (error) {
      console.error('Error fetching NASA data:', error);
      const cachedNeo = sessionStorage.getItem('neoData');
      const cachedApod = sessionStorage.getItem('apodData');
      if (cachedNeo && cachedApod) {
        setNeoData(JSON.parse(cachedNeo));
        setApodData(JSON.parse(cachedApod));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create planet shader material
  const createPlanetMaterial = (planetName) => {
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        baseColor: { value: new THREE.Color(
          planetName === 'Mercury' ? 0x8c7853 :
          planetName === 'Venus' ? 0xfdbcb4 :
          planetName === 'Earth' ? 0x0066cc :
          planetName === 'Mars' ? 0xcd5c5c :
          planetName === 'Jupiter' ? 0xd4a574 :
          0xf4e7d1
        )},
        secondaryColor: { value: new THREE.Color(
          planetName === 'Earth' ? 0x00aa44 :
          planetName === 'Jupiter' ? 0x8b6914 :
          planetName === 'Mars' ? 0x8b4513 :
          0xffffff
        )}
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 baseColor;
        uniform vec3 secondaryColor;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vec3 light = normalize(vec3(0.5, 0.5, 1.0));
          float intensity = dot(vNormal, light) * 0.5 + 0.5;
          
          ${planetName === 'Earth' ? `
            // Earth with continents
            float landmass = sin(vUv.x * 20.0) * sin(vUv.y * 10.0);
            vec3 color = mix(baseColor, secondaryColor, landmass * 0.5 + 0.5);
            color = color * intensity;
            
            // Atmosphere glow
            float atmosphere = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
            atmosphere = pow(atmosphere, 3.0);
            color += vec3(0.3, 0.6, 1.0) * atmosphere * 0.5;
          ` : planetName === 'Jupiter' ? `
            // Jupiter with bands
            float bands = sin(vUv.y * 30.0 + time * 0.1) * 0.5 + 0.5;
            vec3 color = mix(baseColor, secondaryColor, bands);
            color = color * intensity;
            
            // Storm effect
            float storm = sin(vUv.x * 40.0 + vUv.y * 20.0 + time * 0.2) * 0.1;
            color += vec3(1.0, 0.5, 0.0) * storm;
          ` : planetName === 'Saturn' ? `
            // Saturn with subtle bands
            float bands = sin(vUv.y * 20.0) * 0.3 + 0.7;
            vec3 color = baseColor * bands * intensity;
            
            // Slight shimmer
            float shimmer = sin(time * 0.5 + vUv.x * 10.0) * 0.05 + 1.0;
            color *= shimmer;
          ` : planetName === 'Mars' ? `
            // Mars with polar caps
            float polar = smoothstep(0.8, 1.0, abs(vUv.y - 0.5) * 2.0);
            vec3 color = mix(baseColor, vec3(1.0, 1.0, 1.0), polar);
            color = color * intensity;
            
            // Surface features
            float features = sin(vUv.x * 30.0) * sin(vUv.y * 20.0) * 0.1;
            color *= 1.0 + features;
          ` : `
            // Default planet shader
            vec3 color = baseColor * intensity;
            float detail = sin(vUv.x * 20.0) * sin(vUv.y * 20.0) * 0.1;
            color *= 1.0 + detail;
          `}
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    
    return shaderMaterial;
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000033, 0.00025);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
    camera.position.copy(initialCameraPosition.current);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Raycaster for mouse interaction
    raycasterRef.current = new THREE.Raycaster();

    // Create background stars
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    const starsVertices = [];
    for (let i = 0; i < 15000; i++) {
      const x = (Math.random() - 0.5) * 4000;
      const y = (Math.random() - 0.5) * 4000;
      const z = (Math.random() - 0.5) * 4000;
      starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
    starsRef.current = stars;

    // Create sun with better shader
    const sunGeometry = new THREE.SphereGeometry(50, 64, 64);
    const sunMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vNormal;
        
        void main() {
          vec3 color = vec3(1.0, 0.9, 0.3);
          
          // Surface detail
          float noise = sin(vUv.x * 30.0 + time) * sin(vUv.y * 30.0 + time) * 0.1;
          color += vec3(noise * 0.5, noise * 0.3, 0.0);
          
          // Rim glow
          float rim = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
          rim = pow(rim, 0.5);
          color += vec3(1.0, 0.5, 0.0) * rim;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(0, 0, 0);
    sun.userData = { 
      type: 'star', 
      name: 'Sun',
      ...planetDatabase['Sun']
    };
    scene.add(sun);
    celestialBodiesRef.current.push(sun);

    // Add multiple sun glow layers
    for (let i = 1; i <= 3; i++) {
      const glowGeometry = new THREE.SphereGeometry(50 + i * 20, 32, 32);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1 - i * 0.1, 0.3),
        transparent: true,
        opacity: 0.3 / i,
        blending: THREE.AdditiveBlending
      });
      const sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
      sunGlow.raycastable = false; // <<< FIX: Make the glow non-clickable
      sun.add(sunGlow);
    }

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // Point light from sun
    const sunLight = new THREE.PointLight(0xffffff, 3, 3000);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // Create planets with realistic orbital positions
    const planets = [
      { name: 'Mercury', radius: 5, distance: 100, speed: 0.04, startAngle: Math.random() * Math.PI * 2 },
      { name: 'Venus', radius: 12, distance: 150, speed: 0.015, startAngle: Math.random() * Math.PI * 2 },
      { name: 'Earth', radius: 13, distance: 200, speed: 0.01, startAngle: Math.random() * Math.PI * 2 },
      { name: 'Mars', radius: 7, distance: 250, speed: 0.008, startAngle: Math.random() * Math.PI * 2 },
      { name: 'Jupiter', radius: 30, distance: 400, speed: 0.002, startAngle: Math.random() * Math.PI * 2 },
      { name: 'Saturn', radius: 25, distance: 500, speed: 0.001, startAngle: Math.random() * Math.PI * 2 }
    ];

    planets.forEach(planetData => {
      const geometry = new THREE.SphereGeometry(planetData.radius, 64, 64);
      const material = createPlanetMaterial(planetData.name);
      const planet = new THREE.Mesh(geometry, material);
      
      // Set initial position based on start angle
      planet.position.x = Math.cos(planetData.startAngle) * planetData.distance;
      planet.position.z = Math.sin(planetData.startAngle) * planetData.distance;
      
      planet.userData = {
        type: 'planet',
        name: planetData.name,
        orbitRadius: planetData.distance,
        orbitSpeed: planetData.speed,
        startAngle: planetData.startAngle,
        material: material,
        ...planetDatabase[planetData.name]
      };
      scene.add(planet);
      celestialBodiesRef.current.push(planet);

      // Add atmosphere for Earth
      if (planetData.name === 'Earth') {
        const atmosphereGeometry = new THREE.SphereGeometry(planetData.radius * 1.1, 32, 32);
        const atmosphereMaterial = new THREE.MeshBasicMaterial({
          color: 0x4444ff,
          transparent: true,
          opacity: 0.1,
          blending: THREE.AdditiveBlending
        });
        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        atmosphere.raycastable = false; // <<< FIX: Make the atmosphere non-clickable
        planet.add(atmosphere);
      }

      // Add rings for Saturn
      if (planetData.name === 'Saturn') {
        const ringGeometry = new THREE.RingGeometry(
          planetData.radius * 1.5,
          planetData.radius * 2.5,
          64
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xffcc99,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const rings = new THREE.Mesh(ringGeometry, ringMaterial);
        rings.rotation.x = Math.PI / 2;
        planet.add(rings);
      }

      // Add orbit line
      const orbitGeometry = new THREE.BufferGeometry();
      const orbitPoints = [];
      for (let i = 0; i <= 100; i++) {
        const angle = (i / 100) * Math.PI * 2;
        orbitPoints.push(
          Math.cos(angle) * planetData.distance,
          0,
          Math.sin(angle) * planetData.distance
        );
      }
      orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitPoints, 3));
      const orbitMaterial = new THREE.LineBasicMaterial({ 
        color: 0x444444, 
        transparent: true, 
        opacity: 0.3 
      });
      const orbit = new THREE.Line(orbitGeometry, orbitMaterial);
      scene.add(orbit);
    });

    // Animation loop
    let animationId;
    const clock = new THREE.Clock();
    
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Update shader uniforms
      celestialBodiesRef.current.forEach(body => {
        if (body.userData.material && body.userData.material.uniforms) {
          body.userData.material.uniforms.time.value = elapsedTime;
        }
      });

      // Rotate sun
      const sunObject = celestialBodiesRef.current.find(obj => obj.userData.type === 'star');
      if (sunObject) {
        sunObject.rotation.y += 0.001;
      }

      // Rotate background stars
      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001;
      }

      // Orbit and rotate planets with their start angles
      celestialBodiesRef.current.forEach(body => {
        if (body.userData.orbitRadius) {
          const time = elapsedTime;
          const angle = body.userData.startAngle + (time * body.userData.orbitSpeed);
          body.position.x = Math.cos(angle) * body.userData.orbitRadius;
          body.position.z = Math.sin(angle) * body.userData.orbitRadius;
          body.rotation.y += 0.01;
        }
      });

      // Apply rotation based on mouse drag
      if (sceneRef.current) {
        sceneRef.current.rotation.x = rotationRef.current.x;
        sceneRef.current.rotation.y = rotationRef.current.y;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Add NEOs to scene
  useEffect(() => {
    if (!sceneRef.current || neoData.length === 0) return;

    neoData.forEach((neo, index) => {
      const size = Math.max(2, Math.min(10, neo.estimated_diameter.kilometers.estimated_diameter_max * 10));
      const geometry = new THREE.SphereGeometry(size, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color: neo.is_potentially_hazardous_asteroid ? 0xff0000 : 0x00ff00,
        emissive: neo.is_potentially_hazardous_asteroid ? 0xff0000 : 0x00ff00,
        emissiveIntensity: 0.5
      });
      
      const asteroid = new THREE.Mesh(geometry, material);
      const angle = (index / neoData.length) * Math.PI * 2;
      const distance = 300 + Math.random() * 200;
      asteroid.position.set(
        Math.cos(angle) * distance,
        (Math.random() - 0.5) * 100,
        Math.sin(angle) * distance
      );
      
      // Clean up NEO name for better searchability
      const cleanName = neo.name.replace(/[()]/g, '').trim();
      
      asteroid.userData = {
        type: 'neo',
        name: cleanName,
        originalName: neo.name,
        classification: neo.is_potentially_hazardous_asteroid ? 'Potentially Hazardous Asteroid' : 'Near-Earth Object',
        distance: `${parseFloat(neo.close_approach_data[0]?.miss_distance.kilometers).toLocaleString()} km from Earth`,
        diameter: `${neo.estimated_diameter.kilometers.estimated_diameter_max.toFixed(2)} km`,
        velocity: `${parseFloat(neo.close_approach_data[0]?.relative_velocity.kilometers_per_hour).toLocaleString()} km/h`,
        temperature: 'Varies with solar distance',
        composition: 'Rocky or metallic composition (specific type unknown)',
        facts: [
          `Absolute magnitude: ${neo.absolute_magnitude_h}`,
          `First observed: ${neo.orbital_data?.first_observation_date || 'Unknown'}`,
          `Orbit determination: ${neo.orbital_data?.orbit_determination_date || 'Unknown'}`,
          `Closest approach: ${neo.close_approach_data[0]?.close_approach_date_full || 'Unknown'}`,
          neo.is_potentially_hazardous_asteroid 
            ? 'Classified as potentially hazardous due to size and orbit'
            : 'Not considered a threat to Earth',
          'Part of ongoing NASA monitoring program'
        ],
        imageUrl: neo.is_potentially_hazardous_asteroid 
          ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Bennu_mosaic_OSIRIS-REx.jpg/290px-Bennu_mosaic_OSIRIS-REx.jpg' 
          : 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Eros_-_PIA02923.jpg/290px-Eros_-_PIA02923.jpg'
      };
      
      sceneRef.current.add(asteroid);
      celestialBodiesRef.current.push(asteroid);
    });
  }, [neoData]);

  // Mouse event handlers
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    previousMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (isDraggingRef.current) {
      const deltaX = e.clientX - previousMouseRef.current.x;
      const deltaY = e.clientY - previousMouseRef.current.y;
      
      // If the mouse has moved more than a small threshold, consider it a drag
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        hasDraggedRef.current = true;
      }
      
      rotationRef.current.y += deltaX * 0.005;
      rotationRef.current.x += deltaY * 0.005;
      
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    // If the mouse was not dragged, treat it as a click
    if (!hasDraggedRef.current) {
      handleClick();
    }
    isDraggingRef.current = false;
  };

  const handleClick = () => {
    if (!raycasterRef.current || !cameraRef.current) return;
  
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Check for intersections recursively to include child objects like atmospheres or glows
    const intersects = raycasterRef.current.intersectObjects(celestialBodiesRef.current, true);
  
    if (intersects.length > 0) {
      let object = intersects[0].object;
      
      // Traverse up the object's parents to find the main celestial body,
      // which we identify by the 'name' property in its userData.
      // Child objects like atmospheres or glows won't have this property.
      while (object.parent && !object.userData.name) {
        object = object.parent;
      }
      
      // If we found a valid object with data, select it.
      if (object.userData && object.userData.name) {
        setSelectedObject(object.userData);
        setImageLoadError(false);
      }
    }
  };

  const handleWheel = (e) => {
    if (!cameraRef.current) return;
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    cameraRef.current.position.multiplyScalar(delta);
  };

  // Update time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update data freshness indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setDataFreshness(prev => Math.max(0, prev - 1));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchNASAData();
    const refreshInterval = setInterval(fetchNASAData, 30 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [fetchNASAData]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Close selected object and reset view
  const handleCloseSelectedObject = () => {
    setSelectedObject(null);
    setImageLoadError(false);
    resetView();
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Scene Container */}
      <div 
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { isDraggingRef.current = false; }} // Reset drag on leave
        onWheel={handleWheel}
      />

      {/* Live Data Indicator */}
      <div className="absolute top-4 left-4 flex items-center space-x-2">
        <div className="relative">
          <div 
            className={`w-3 h-3 rounded-full transition-all duration-1000 ${
              dataFreshness > 50 ? 'bg-green-500' : 'bg-green-400'
            }`}
            style={{
              animation: 'breathe 2s ease-in-out infinite',
              boxShadow: `0 0 20px ${dataFreshness > 50 ? '#10b981' : '#4ade80'}`
            }}
          />
        </div>
        <span className="text-white text-sm font-medium">
          {isLoading ? 'Loading NASA Data...' : 'Live NASA Data'}
        </span>
      </div>

      {/* Title and Search */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-center">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-wider">
          Interactive Star Map
        </h1>
        <p className="text-gray-300 text-sm mb-3">
          Click and drag to explore • Scroll to zoom • Click objects for details
        </p>
        {neoData.length > 0 && (
          <p className="text-gray-400 text-xs">
            {neoData.length} asteroids loaded from NASA
          </p>
        )}
        
        {/* Dynamic Search Component */}
        <div className="relative mx-auto flex justify-center">
          {!showSearch ? (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full hover:bg-white/20 transition-all duration-300"
            >
              <Search className="w-5 h-5 text-white" />
              <span className="text-white">Search Celestial Bodies</span>
            </button>
          ) : (
            <div className="relative w-80 mx-auto">
              <div className="bg-white/10 backdrop-blur-md border border-gray-600 rounded-full px-4 py-2 flex items-center">
                <Search className="w-5 h-5 text-gray-400 mr-2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchSuggestions.length > 0) {
                      navigateToObject(searchSuggestions[0]);
                    } else if (e.key === 'Escape') {
                      setShowSearch(false);
                      setSearchQuery('');
                      setSearchSuggestions([]);
                    }
                  }}
                  placeholder={`Search ${celestialBodiesRef.current.length} celestial bodies...`}
                  className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none"
                />
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                    setSearchSuggestions([]);
                  }}
                  className="text-gray-400 hover:text-white ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Search Suggestions */}
              {searchQuery.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-black/90 backdrop-blur-md border border-gray-600 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {searchSuggestions.length > 0 ? (
                    <>
                      {searchSuggestions.map(suggestion => {
                        // Find the object to get its type
                        const obj = celestialBodiesRef.current.find(
                          o => o.userData && o.userData.name === suggestion
                        );
                        const type = obj?.userData?.type || 'Object';
                        const isHazardous = obj?.userData?.classification?.includes('Hazardous');
                        
                        return (
                          <button
                            key={suggestion}
                            onClick={() => navigateToObject(suggestion)}
                            className="w-full text-left px-4 py-3 text-white hover:bg-white/20 transition-colors flex items-center justify-between group"
                          >
                            <div className="flex items-center space-x-2">
                              <div>
                                <span className="block">{suggestion}</span>
                                <span className="text-xs text-gray-400 capitalize">{type}</span>
                              </div>
                              {isHazardous && (
                                <span className="text-xs text-red-400">⚠️</span>
                              )}
                            </div>
                            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transform -rotate-90" />
                          </button>
                        );
                      })}
                      {searchSuggestions.length === 10 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center">
                          Showing first 10 results...
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-gray-400 text-center">
                      <p>No celestial bodies found</p>
                      <p className="text-xs mt-1">Try searching for planets, the Sun, or asteroid names/numbers</p>
                      {neoData.length > 0 && (
                        <p className="text-xs mt-1 text-green-400">{neoData.length} NEOs loaded - try searching by name!</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reset View Button */}
      <button
        onClick={resetView}
        className="absolute bottom-4 left-4 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-white/20 transition-colors flex items-center space-x-2 text-white"
      >
        <RotateCcw className="w-5 h-5" />
        <span>Reset View</span>
      </button>

      {/* Time Display */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-sm px-6 py-3 rounded-full border border-gray-600">
        <div className="text-white text-center">
          <div className="text-2xl font-mono tracking-wider">
            {currentTime.toLocaleTimeString()}
          </div>
          <div className="text-sm text-gray-300">
            {currentTime.toLocaleDateString(undefined, { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </div>

      {/* Enhanced Object Info Panel */}
      {selectedObject && (
        <div className="absolute top-20 right-4 w-96 max-h-[80vh] overflow-y-auto bg-black/90 backdrop-blur-md border border-gray-600 rounded-lg p-6 text-white">
          <button
            onClick={handleCloseSelectedObject}
            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
          
          {/* Header with Image */}
          <div className="mb-4">
            {selectedObject.imageUrl && !imageLoadError ? (
              <div className="relative w-full h-48 bg-gray-900 rounded-lg mb-4 overflow-hidden">
                <img 
                  src={selectedObject.imageUrl} 
                  alt={selectedObject.name}
                  className="w-full h-full object-cover"
                  onError={() => setImageLoadError(true)}
                />
              </div>
            ) : (
              <div className="w-full h-48 bg-gray-900 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-6xl">{
                  selectedObject.type === 'Star' ? '☀️' :
                  selectedObject.type === 'neo' && selectedObject.classification?.includes('Hazardous') ? '☄️' :
                  selectedObject.type === 'neo' ? '🪨' :
                  selectedObject.name === 'Earth' ? '🌍' :
                  selectedObject.name === 'Mars' ? '🔴' :
                  selectedObject.name === 'Saturn' ? '🪐' :
                  '🌌'
                }</span>
              </div>
            )}
            <h2 className="text-3xl font-bold text-yellow-400">
              {selectedObject.name}
            </h2>
            {selectedObject.originalName && selectedObject.originalName !== selectedObject.name && (
              <p className="text-sm text-gray-400 mt-1">({selectedObject.originalName})</p>
            )}
            <p className="text-lg text-gray-300 mt-1">{selectedObject.type || 'Celestial Object'}</p>
          </div>

          {/* Quick Facts */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="bg-white/10 rounded p-2">
              <span className="text-gray-400 block text-xs">Distance</span>
              <span className="text-white">{selectedObject.distance}</span>
            </div>
            <div className="bg-white/10 rounded p-2">
              <span className="text-gray-400 block text-xs">Diameter</span>
              <span className="text-white">{selectedObject.diameter}</span>
            </div>
            {selectedObject.temperature && (
              <div className="bg-white/10 rounded p-2 col-span-2">
                <span className="text-gray-400 block text-xs">Temperature</span>
                <span className="text-white">{selectedObject.temperature}</span>
              </div>
            )}
          </div>

          {/* Detailed Information */}
          <div className="space-y-3 text-sm">
            {selectedObject.classification && (
              <div>
                <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Classification</span>
                <p>{selectedObject.classification}</p>
              </div>
            )}
            
            {selectedObject.composition && (
              <div>
                <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Composition</span>
                <p>{selectedObject.composition}</p>
              </div>
            )}
            
            {selectedObject.atmosphere && (
              <div>
                <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Atmosphere</span>
                <p>{selectedObject.atmosphere}</p>
              </div>
            )}
            
            {selectedObject.moons && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Moons</span>
                  <p>{selectedObject.moons}</p>
                </div>
                {selectedObject.dayLength && (
                  <div>
                    <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Day Length</span>
                    <p>{selectedObject.dayLength}</p>
                  </div>
                )}
              </div>
            )}
            
            {selectedObject.yearLength && (
              <div>
                <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Year Length</span>
                <p>{selectedObject.yearLength}</p>
              </div>
            )}
            
            {selectedObject.velocity && (
              <div>
                <span className="text-gray-400 block text-xs uppercase tracking-wider mb-1">Velocity</span>
                <p>{selectedObject.velocity}</p>
              </div>
            )}
          </div>

          {/* Facts */}
          {selectedObject.facts && (
            <div className="mt-4 pt-4 border-t border-gray-600">
              <h3 className="text-lg font-semibold mb-2 text-yellow-400">Fascinating Facts</h3>
              <ul className="space-y-2 text-sm">
                {selectedObject.facts.map((fact, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-yellow-400 mr-2">•</span>
                    <span className="text-gray-300">{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Additional Educational Info */}
          <div className="mt-4 pt-4 border-t border-gray-600 text-xs text-gray-400">
            {selectedObject.type === 'neo' ? (
              <p>Near-Earth Objects are tracked by NASA's Center for NEO Studies to monitor potential impact threats and study the formation of our Solar System.</p>
            ) : (
              <p>Data provided by NASA APIs and astronomical databases. Distances and sizes not to scale for visualization purposes.</p>
            )}
          </div>
        </div>
      )}

      {/* Controls Legend */}
      <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg text-white text-sm">
        <div className="flex items-center space-x-4">
          <span>🖱️ Drag to rotate</span>
          <span>📜 Scroll to zoom</span>
          <span>👆 Click for info</span>
        </div>
      </div>

      {/* NEO Counter */}
      <div className="absolute top-20 left-4 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg text-white">
        <div className="text-sm">
          <span className="text-gray-400">Near-Earth Objects Today:</span>
          <span className="text-xl font-bold ml-2">{neoData.length}</span>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          <span className="text-red-400">●</span> Potentially Hazardous
          <span className="text-green-400 ml-2">●</span> Safe
        </div>
        {neoData.length > 0 && (
          <div className="text-xs text-green-400 mt-2">
            ✓ All objects searchable by name
          </div>
        )}
        {isLoading && (
          <div className="text-xs text-yellow-400 mt-2 animate-pulse">
            Loading more objects...
          </div>
        )}
      </div>

      {/* APOD Info */}
      {apodData && (
        <div className="absolute bottom-20 left-4 max-w-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg text-white">
          <div className="text-xs text-gray-400">NASA Picture of the Day:</div>
          <div className="text-sm font-medium">{apodData.title}</div>
        </div>
      )}

      <style jsx>{`
        @keyframes breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.5);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default InteractiveStarMap;