import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OrbitalObject, RiskAssessment } from '../types';
import { RotateCcw } from 'lucide-react';

export type CameraPresetMode = 
  | 'GLOBAL'          // 1. Earth Overview
  | 'LEO'             // 2. Low Earth Orbit
  | 'MEO'             // 3. Medium Earth Orbit
  | 'GEO'             // 4. Geostationary Orbit
  | 'FOLLOW_SENTINEL' // 5. Satellite Close-up
  | 'COLLISION'       // 6. Collision Scenario View
  | 'PROXIMITY'
  | 'FOLLOW_TARGET'
  | 'FREE';

interface OrbitalCanvasProps {
  objects: OrbitalObject[];
  sentinel: OrbitalObject | null;
  target: OrbitalObject | null;
  risks: RiskAssessment[];
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
  cameraMode: CameraPresetMode | any;
  onResetCamera?: () => void;
  onChangeCameraMode?: (mode: any) => void;
  predictedWaypoints?: Array<{ x: number; y: number; z: number }>;
  interceptWaypoints?: Array<{ x: number; y: number; z: number }>;
  maneuverVector?: { x: number; y: number; z: number };
  simTime?: number;
  isRunning?: boolean;
  timeScale?: number;
  theme?: 'light' | 'dark';
  hideControls?: boolean;
}

export const OrbitalCanvas: React.FC<OrbitalCanvasProps> = ({
  objects,
  sentinel,
  target,
  risks,
  selectedObjectId,
  onSelectObject,
  cameraMode,
  onResetCamera,
  onChangeCameraMode,
  predictedWaypoints,
  interceptWaypoints,
  maneuverVector,
  simTime = 0,
  isRunning = true,
  timeScale = 25,
  theme = 'light',
  hideControls = true
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const isLight = theme !== 'dark';

  // Viewport display toggles
  const [showOrbits, setShowOrbits] = useState<boolean>(true);
  const [showTags, setShowTags] = useState<boolean>(true);
  const [showTrajectory, setShowTrajectory] = useState<boolean>(true);
  const [showAtmosphere, setShowAtmosphere] = useState<boolean>(true);

  // 2D Screen Tag Coordinates for HUD projection
  const [tagCoords, setTagCoords] = useState<{
    sentinel?: { x: number; y: number; visible: boolean; distToTarget?: string };
    target?: { x: number; y: number; visible: boolean; name: string };
    selected?: { x: number; y: number; visible: boolean; name: string };
    rangeMid?: { x: number; y: number; visible: boolean; distStr: string };
  }>({});

  // Object references in 3D Scene
  const objectMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const orbitLinesRef = useRef<Map<string, THREE.Line>>(new Map());
  const predLineRef = useRef<THREE.Line | null>(null);
  const interceptLineRef = useRef<THREE.Line | null>(null);
  const rangeLineRef = useRef<THREE.Line | null>(null);
  const scanConeRef = useRef<THREE.Mesh | null>(null);
  const patrolConeRef = useRef<THREE.Mesh | null>(null);
  const tetherLineRef = useRef<THREE.Line | null>(null);
  const riskMarkersRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const thrusterPlumeRef = useRef<THREE.Mesh | null>(null);
  const thrusterLightRef = useRef<THREE.PointLight | null>(null);
  const targetBeaconRef = useRef<THREE.PointLight | null>(null);
  const maneuverArrowRef = useRef<THREE.ArrowHelper | null>(null);

  // Lights & Environment refs
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const starsPointsRef = useRef<THREE.Points | null>(null);
  const simTimeRef = useRef<number>(simTime);
  simTimeRef.current = simTime;
  const isRunningRef = useRef<boolean>(isRunning);
  isRunningRef.current = isRunning;
  const timeScaleRef = useRef<number>(timeScale);
  timeScaleRef.current = timeScale;
  const cameraModeRef = useRef<CameraPresetMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const livePropsRef = useRef({ objects, sentinel, target, selectedObjectId });
  livePropsRef.current = { objects, sentinel, target, selectedObjectId };
  const baseStatesRef = useRef<Map<string, {
    rxKm: number; ryKm: number; rzKm: number;
    vxKms: number; vyKms: number; vzKms: number;
    tumble: boolean;
    orientToVel: boolean;
  }>>(new Map());
  const baseSimTimeRef = useRef<number>(simTime);
  const lastSnapshotNowRef = useRef<number>(performance.now());
  const lastTagSigRef = useRef<string>('');

  // Smooth camera interpolation
  const targetCamPos = useRef<THREE.Vector3>(new THREE.Vector3(14, 8, 14));
  const targetLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const isTransitioningRef = useRef<boolean>(false);

  const SCALE = 1.0 / 1000.0;
  const EARTH_RADIUS = 6.378;

  // ───────────────────────────────────────────────────────────
  // High-Fidelity Realistic Procedural Earth Texture Generator
  // ───────────────────────────────────────────────────────────
  const createPhotorealisticEarthTexture = (): { dayMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } => {
    const W = 2048;
    const H = 1024;

    // 1. Day Map Canvas
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 2. Roughness Canvas
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = W;
    roughCanvas.height = H;
    const rCtx = roughCanvas.getContext('2d')!;

    // A. Deep vibrant ocean gradient
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
    oceanGrad.addColorStop(0, '#0d3268');
    oceanGrad.addColorStop(0.2, '#144c8c');
    oceanGrad.addColorStop(0.5, '#1e68b8');
    oceanGrad.addColorStop(0.8, '#144c8c');
    oceanGrad.addColorStop(1, '#0d3268');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, W, H);

    rCtx.fillStyle = '#111111';
    rCtx.fillRect(0, 0, W, H);

    const toXY = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * W,
      y: ((90 - lat) / 180) * H
    });

    const drawLandmass = (
      points: Array<[number, number]>,
      baseColor: string,
      shelfColor: string = '#1da0c4'
    ) => {
      if (points.length < 3) return;

      // 1. Continental shelf (vibrant turquoise coastline)
      ctx.beginPath();
      const first = toXY(points[0][0], points[0][1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const pt = toXY(points[i][0], points[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.lineWidth = 14;
      ctx.strokeStyle = shelfColor;
      ctx.stroke();

      // 2. Fill continent
      ctx.fillStyle = baseColor;
      ctx.fill();

      // 3. Roughness
      rCtx.beginPath();
      rCtx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const pt = toXY(points[i][0], points[i][1]);
        rCtx.lineTo(pt.x, pt.y);
      }
      rCtx.closePath();
      rCtx.fillStyle = '#dddddd';
      rCtx.fill();
    };

    // Continents
    drawLandmass([
      [-168, 65], [-160, 71], [-140, 70], [-130, 69], [-120, 69],
      [-95, 69], [-85, 65], [-80, 52], [-65, 45], [-70, 42],
      [-75, 35], [-80, 25], [-81, 24], [-84, 28], [-97, 26],
      [-105, 20], [-95, 16], [-85, 12], [-78, 8], [-80, 9],
      [-90, 14], [-105, 22], [-115, 30], [-124, 40], [-125, 50],
      [-135, 57], [-150, 60], [-165, 60]
    ], '#28632e');

    drawLandmass([
      [-77, 8], [-70, 11], [-60, 8], [-50, -1], [-35, -5],
      [-37, -12], [-40, -22], [-50, -30], [-58, -37], [-65, -45],
      [-67, -54], [-74, -52], [-74, -42], [-72, -32], [-70, -18],
      [-80, -4], [-78, 2]
    ], '#22552d');

    drawLandmass([
      [-9, 36], [-9, 43], [-1, 44], [-4, 48], [2, 51],
      [8, 55], [10, 57], [20, 60], [25, 71], [40, 68],
      [60, 73], [80, 74], [105, 77], [130, 72], [170, 66],
      [180, 64], [170, 60], [150, 50], [140, 45], [130, 35],
      [122, 30], [115, 22], [105, 10], [100, 3], [98, 10],
      [90, 22], [80, 12], [77, 8], [72, 20], [60, 25],
      [50, 27], [43, 13], [35, 28], [28, 41], [15, 40],
      [0, 38], [-5, 36]
    ], '#316937');

    drawLandmass([
      [-6, 35], [10, 37], [25, 32], [32, 31], [43, 12],
      [51, 11], [45, 0], [40, -15], [35, -25], [28, -33],
      [18, -34], [12, -20], [9, -5], [3, 5], [-15, 12],
      [-17, 15], [-12, 28]
    ], '#4a5d30');

    // Sahara Desert overlay
    drawLandmass([
      [-15, 17], [35, 17], [32, 30], [-10, 30]
    ], '#b09455', '#166ba2');

    // Australia
    drawLandmass([
      [114, -22], [122, -16], [130, -12], [136, -12], [142, -10],
      [145, -15], [153, -28], [150, -36], [140, -38], [130, -32],
      [116, -34], [113, -26]
    ], '#a67d3e');

    drawLandmass([
      [120, -28], [140, -28], [136, -20], [124, -20]
    ], '#b87532', '#166ba2');

    // Greenland (Ice sheet)
    drawLandmass([
      [-50, 60], [-40, 60], [-25, 70], [-20, 80], [-40, 83], [-55, 78], [-50, 70]
    ], '#f0f9ff', '#1da0c4');

    // Antarctica
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, H * 0.88, W, H * 0.12);
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, H * 0.88, W, H * 0.12);

    // Subtle coordinate grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 64; y < H; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = 64; x < W; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    const dayMap = new THREE.CanvasTexture(canvas);
    dayMap.generateMipmaps = true;
    dayMap.minFilter = THREE.LinearMipmapLinearFilter;

    const roughnessMap = new THREE.CanvasTexture(roughCanvas);

    return { dayMap, roughnessMap };
  };

  // ───────────────────────────────────────────────────────────
  // High-Fidelity Procedural Cloud Deck Texture
  // ───────────────────────────────────────────────────────────
  const createPhotorealisticCloudTexture = (): THREE.CanvasTexture => {
    const W = 2048;
    const H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    // Equatorial cloud band (ITCZ)
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W;
      const y = H * 0.45 + (Math.random() - 0.5) * 80;
      const rx = 50 + Math.random() * 140;
      const ry = 15 + Math.random() * 35;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mid-latitude cyclone swirls
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * W;
      const isNorth = Math.random() > 0.5;
      const y = isNorth ? H * 0.22 + Math.random() * 120 : H * 0.72 + Math.random() * 120;
      const rx = 40 + Math.random() * 110;
      const ry = 20 + Math.random() * 60;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, (Math.random() - 0.5) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    const cloudTex = new THREE.CanvasTexture(canvas);
    cloudTex.generateMipmaps = true;
    return cloudTex;
  };

  // ───────────────────────────────────────────────────────────
  // Atmosphere Rim Glow Shader
  // ───────────────────────────────────────────────────────────
  const createAtmosphereShaderMaterial = () => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(vPosition);
          float intensity = pow(0.72 - dot(vNormal, viewDir), 2.2);
          gl_FragColor = vec4(0.14, 0.65, 0.98, 1.0) * intensity * 0.85;
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
  };

  // ───────────────────────────────────────────────────────────
  // Dynamic Theme Updates
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const isL = theme !== 'dark';
    sceneRef.current.background = new THREE.Color(isL ? 0xf0f4f9 : 0x02050f);

    if (ambientLightRef.current) {
      ambientLightRef.current.color.setHex(isL ? 0xffffff : 0x0c192e);
      ambientLightRef.current.intensity = isL ? 1.25 : 0.95;
    }
    if (fillLightRef.current) {
      fillLightRef.current.visible = isL;
    }
    if (starsPointsRef.current) {
      starsPointsRef.current.visible = !isL;
    }
  }, [theme]);

  // ───────────────────────────────────────────────────────────
  // Initialize Three.js Scene, Camera, OrbitControls & Lighting
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const initRect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(initRect.width || container.clientWidth || 600));
    const height = Math.max(1, Math.round(initRect.height || container.clientHeight || 400));

    // 1. Scene with theme-responsive background
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isLight ? 0xf0f4f9 : 0x02050f);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 2000.0);
    camera.position.set(15, 9, 15);
    cameraRef.current = camera;

    // 3. Renderer with ACES Tone Mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Smooth OrbitControls with Damping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 6.6;
    controls.maxDistance = 75.0;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controlsRef.current = controls;

    // 5. Starfield (visible in dark mode)
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 4500;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const r = 400.0 + Math.random() * 500.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);

      starColors[i * 3] = 0.85;
      starColors[i * 3 + 1] = 0.9;
      starColors[i * 3 + 2] = 1.0;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, sizeAttenuation: false });
    const starsPoints = new THREE.Points(starsGeo, starMat);
    starsPoints.visible = !isLight;
    scene.add(starsPoints);
    starsPointsRef.current = starsPoints;

    // 6. Photorealistic Procedural Earth Mesh
    const { dayMap, roughnessMap } = createPhotorealisticEarthTexture();
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: dayMap,
      roughnessMap: roughnessMap,
      roughness: 0.7,
      metalness: 0.12
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    earthMeshRef.current = earth;

    // 7. Rotating Cloud Sphere
    const cloudTex = createPhotorealisticCloudTexture();
    const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.016, 48, 48);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.52,
      blending: THREE.NormalBlending
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(clouds);
    cloudsRef.current = clouds;

    // 8. Atmospheric Rayleigh Scattering Glow
    const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.05, 48, 48);
    const atmosMat = createAtmosphereShaderMaterial();
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);
    atmosphereRef.current = atmosphere;

    // 9. Equatorial Reference Grid
    const eqGeo = new THREE.RingGeometry(EARTH_RADIUS * 1.002, EARTH_RADIUS * 1.008, 64);
    const eqMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const eqRing = new THREE.Mesh(eqGeo, eqMat);
    eqRing.rotation.x = Math.PI / 2;
    scene.add(eqRing);

    // 10. Lighting (Sunlight + Fill Light + Ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 2.7);
    sun.position.set(45, 18, 30);
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.2);
    fillLight.position.set(-45, -15, -30);
    fillLight.visible = isLight;
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    const ambient = new THREE.AmbientLight(isLight ? 0xffffff : 0x0c192e, isLight ? 1.25 : 0.95);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    // 11. Conjunction Spheres Group
    const riskGroup = new THREE.Group();
    scene.add(riskGroup);
    riskMarkersRef.current = riskGroup;

    // 12. Object Click Raycasting
    const dom = renderer.domElement;
    const onClick = (e: MouseEvent) => {
      if (!cameraRef.current || !sceneRef.current) return;
      const rect = dom.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

      const hitCandidates: THREE.Object3D[] = [];
      objectMeshesRef.current.forEach(m => hitCandidates.push(m));
      const hits = raycaster.intersectObjects(hitCandidates, true);

      if (hits.length > 0) {
        let cur: THREE.Object3D | null = hits[0].object;
        while (cur) {
          let matched = false;
          objectMeshesRef.current.forEach((mesh, id) => {
            if (mesh === cur) {
              onSelectObject(id);
              matched = true;
            }
          });
          if (matched) break;
          cur = cur.parent;
        }
      }
    };
    dom.addEventListener('click', onClick);

    // 13. Window & Container Resize Handler (rAF-debounced & size-diff guarded to prevent ResizeObserver loops)
    let resizeRafId: number | null = null;
    let lastW = Math.round(width);
    let lastH = Math.round(height);
    const onResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const w = Math.round(rect.width || mountRef.current.clientWidth || 0);
      const h = Math.round(rect.height || mountRef.current.clientHeight || 0);
      if (w <= 1 || h <= 1 || (w === lastW && h === lastH)) return;
      lastW = w;
      lastH = h;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
    };
    const scheduleResize = () => {
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(onResize);
    };
    window.addEventListener('resize', scheduleResize);

    const ro = new ResizeObserver(() => {
      scheduleResize();
    });
    ro.observe(container);

    const t1 = setTimeout(scheduleResize, 50);
    const t2 = setTimeout(scheduleResize, 250);

    // 14. Render Animation Loop (60 FPS smooth Keplerian interpolation + live workflows)
    let animId: number;
    const startTime = performance.now();
    let lastTime = performance.now();

    const MU_ECI = 398600.4418;
    const _vTmp = new THREE.Vector3();
    const _dirTmp = new THREE.Vector3();
    const _rOutTmp = new THREE.Vector3();
    const _vHatTmp = new THREE.Vector3();
    const _perpTmp = new THREE.Vector3();
    const _midTmp = new THREE.Vector3();
    const _upVec = new THREE.Vector3(0, 1, 0);
    const _downVec = new THREE.Vector3(0, -1, 0);

    const propagateStateRk2 = (
      rx: number, ry: number, rz: number,
      vx: number, vy: number, vz: number,
      totalDt: number
    ) => {
      if (totalDt <= 0) {
        return { rx, ry, rz, vx, vy, vz };
      }
      const steps = totalDt > 12 ? 4 : 2;
      const h = totalDt / steps;
      const halfH = 0.5 * h;
      let px = rx, py = ry, pz = rz;
      let vvx = vx, vvy = vy, vvz = vz;
      for (let s = 0; s < steps; s++) {
        const r2 = px * px + py * py + pz * pz;
        const r1 = Math.sqrt(r2) || 1;
        const c1 = -MU_ECI / (r2 * r1);
        const ax1 = c1 * px, ay1 = c1 * py, az1 = c1 * pz;

        const mx = px + halfH * vvx;
        const my = py + halfH * vvy;
        const mz = pz + halfH * vvz;
        const mvx = vvx + halfH * ax1;
        const mvy = vvy + halfH * ay1;
        const mvz = vvz + halfH * az1;

        const mr2 = mx * mx + my * my + mz * mz;
        const mr1 = Math.sqrt(mr2) || 1;
        const c2 = -MU_ECI / (mr2 * mr1);
        const ax2 = c2 * mx, ay2 = c2 * my, az2 = c2 * mz;

        px += h * mvx;
        py += h * mvy;
        pz += h * mvz;
        vvx += h * ax2;
        vvy += h * ay2;
        vvz += h * az2;
      }
      return { rx: px, ry: py, rz: pz, vx: vvx, vy: vvy, vz: vvz };
    };

    const onControlStart = () => {
      const m = cameraModeRef.current;
      if (m !== 'FOLLOW_SENTINEL' && m !== 'FOLLOW_TARGET' && m !== 'PROXIMITY' && m !== 'COLLISION') {
        isTransitioningRef.current = false;
      }
    };
    controls.addEventListener('start', onControlStart);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min(0.1, Math.max(0.001, (now - lastTime) * 0.001));
      lastTime = now;
      const elapsedTime = (now - startTime) * 0.001;

      const dtSim = isRunningRef.current
        ? Math.min(0.45, Math.max(0, (now - lastSnapshotNowRef.current) * 0.001)) * (timeScaleRef.current || 1)
        : 0;

      // Earth sidereal rotation coupled directly to live simulation time (+ subtle cloud wind shear)
      const liveSimTime = baseSimTimeRef.current + dtSim;
      const earthSiderealRad = (liveSimTime * Math.PI * 2) / 86164.0905;
      if (earthMeshRef.current) earthMeshRef.current.rotation.y = earthSiderealRad;
      if (cloudsRef.current) cloudsRef.current.rotation.y = earthSiderealRad + elapsedTime * 0.008;

      const {
        objects: curObjects,
        sentinel: curSentinel,
        target: curTarget,
        selectedObjectId: curSelectedId
      } = livePropsRef.current;

      // Smooth 60 FPS Keplerian interpolation of every mesh between backend polls
      let sentVxScene = 0, sentVyScene = 1, sentVzScene = 0;
      objectMeshesRef.current.forEach((mesh, id) => {
        const st = baseStatesRef.current.get(id);
        if (!st) return;
        const prop = dtSim > 0
          ? propagateStateRk2(st.rxKm, st.ryKm, st.rzKm, st.vxKms, st.vyKms, st.vzKms, dtSim)
          : { rx: st.rxKm, ry: st.ryKm, rz: st.rzKm, vx: st.vxKms, vy: st.vyKms, vz: st.vzKms };

        mesh.position.set(prop.rx * SCALE, prop.rz * SCALE, prop.ry * SCALE);
        if (id === curSentinel?.id) {
          sentVxScene = prop.vx;
          sentVyScene = prop.vz;
          sentVzScene = prop.vy;
        }
        if (st.tumble) {
          mesh.rotation.x += delta * 1.1;
          mesh.rotation.y += delta * 0.75;
          mesh.rotation.z += delta * 0.55;
        } else if (st.orientToVel) {
          _vTmp.set(prop.vx, prop.vz, prop.vy);
          if (_vTmp.lengthSq() > 0.01) {
            _vTmp.normalize();
            mesh.quaternion.setFromUnitVectors(_upVec, _vTmp);
          }
        }
      });

      const sentMesh = curSentinel ? objectMeshesRef.current.get(curSentinel.id) : null;
      const tgtMesh = curTarget ? objectMeshesRef.current.get(curTarget.id) : null;

      // Animate thruster plume flicker at 60 FPS while firing
      if (thrusterPlumeRef.current && thrusterPlumeRef.current.visible) {
        const s = 0.85 + Math.sin(elapsedTime * 25.0) * 0.3;
        thrusterPlumeRef.current.scale.set(s, s * 1.4, s);
      }
      if (thrusterLightRef.current && thrusterPlumeRef.current?.visible) {
        thrusterLightRef.current.intensity = 1.5 + Math.sin(elapsedTime * 25.0) * 0.5;
      }
      if (targetBeaconRef.current) {
        targetBeaconRef.current.intensity = Math.sin(elapsedTime * 6.0) > 0 ? 2.5 : 0.0;
      }

      // Keep maneuver delta-V arrow attached to moving SAT-01
      if (maneuverArrowRef.current && sentMesh) {
        maneuverArrowRef.current.position.copy(sentMesh.position);
      }

      // Keep nadir-forward orbital patrol sweep cone attached & sweeping with SAT-01
      if (patrolConeRef.current && sentMesh) {
        _rOutTmp.copy(sentMesh.position);
        _vHatTmp.set(sentVxScene, sentVyScene, sentVzScene);
        if (_rOutTmp.lengthSq() > 1e-4 && _vHatTmp.lengthSq() > 1e-4) {
          _rOutTmp.normalize();
          _vHatTmp.normalize();
          _dirTmp.copy(_vHatTmp).multiplyScalar(0.78).addScaledVector(_rOutTmp, -0.55).normalize();
          patrolConeRef.current.position.copy(sentMesh.position);
          patrolConeRef.current.quaternion.setFromUnitVectors(_downVec, _dirTmp);
          const sweepPulse = 0.28 + 0.1 * Math.sin(elapsedTime * 3.0);
          (patrolConeRef.current.material as THREE.MeshBasicMaterial).opacity = sweepPulse;
          patrolConeRef.current.visible = true;
        }
      }

      // Keep LiDAR scan cone locked between SAT-01 (apex) and Target
      if (scanConeRef.current && sentMesh && tgtMesh) {
        _dirTmp.copy(tgtMesh.position).sub(sentMesh.position);
        const dist = _dirTmp.length();
        if (dist > 1e-4) {
          _dirTmp.divideScalar(dist);
          scanConeRef.current.position.copy(sentMesh.position);
          scanConeRef.current.quaternion.setFromUnitVectors(_downVec, _dirTmp);
          const baseR = Math.min(0.65, Math.max(0.14, dist * 0.16));
          scanConeRef.current.scale.set(baseR, dist, baseR);
          scanConeRef.current.visible = true;
        } else {
          scanConeRef.current.visible = false;
        }
      }

      // Keep dashed laser range line & tether synchronized at 60 FPS
      if (rangeLineRef.current && sentMesh && tgtMesh) {
        const p1 = sentMesh.position;
        const p2 = tgtMesh.position;
        _dirTmp.copy(p2).sub(p1);
        const segLenSq = _dirTmp.lengthSq();
        const tProj = segLenSq > 1e-8 ? Math.max(0, Math.min(1, -p1.dot(_dirTmp) / segLenSq)) : 0;
        const closestDist = _midTmp.copy(p1).addScaledVector(_dirTmp, tProj).length();
        if (closestDist > EARTH_RADIUS * 0.995) {
          const posAttr = rangeLineRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
          posAttr.setXYZ(0, p1.x, p1.y, p1.z);
          posAttr.setXYZ(1, p2.x, p2.y, p2.z);
          posAttr.needsUpdate = true;
          rangeLineRef.current.computeLineDistances();
          rangeLineRef.current.visible = true;
        } else {
          rangeLineRef.current.visible = false;
        }
      }

      if (tetherLineRef.current && sentMesh && tgtMesh) {
        const posAttr = tetherLineRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, sentMesh.position.x, sentMesh.position.y, sentMesh.position.z);
        posAttr.setXYZ(1, tgtMesh.position.x, tgtMesh.position.y, tgtMesh.position.z);
        posAttr.needsUpdate = true;
      }

      // Continuous chase-camera tracking at 60 FPS for chase presets
      const mode = cameraModeRef.current;
      const isChaseMode =
        (mode === 'FOLLOW_SENTINEL' && !!sentMesh) ||
        (mode === 'FOLLOW_TARGET' && !!tgtMesh) ||
        ((mode === 'PROXIMITY' || mode === 'COLLISION') && !!sentMesh && !!tgtMesh);

      if (mode === 'FOLLOW_SENTINEL' && sentMesh) {
        _vTmp.set(sentVxScene, sentVyScene, sentVzScene);
        if (_vTmp.lengthSq() < 0.01) _vTmp.set(0, 1, 0);
        else _vTmp.normalize();
        targetCamPos.current.copy(sentMesh.position).addScaledVector(_vTmp, -1.8).add(_perpTmp.set(0, 0.8, 0.5));
        targetLookAt.current.copy(sentMesh.position);
      } else if (mode === 'FOLLOW_TARGET' && tgtMesh) {
        targetCamPos.current.set(tgtMesh.position.x + 1.2, tgtMesh.position.y + 0.8, tgtMesh.position.z + 1.4);
        targetLookAt.current.copy(tgtMesh.position);
      } else if ((mode === 'PROXIMITY' || mode === 'COLLISION') && sentMesh && tgtMesh) {
        _midTmp.copy(sentMesh.position).add(tgtMesh.position).multiplyScalar(0.5);
        _dirTmp.copy(tgtMesh.position).sub(sentMesh.position);
        const span = Math.max(2.2, _dirTmp.length() * 1.6);
        if (_dirTmp.lengthSq() > 1e-6) _dirTmp.normalize();
        else _dirTmp.set(1, 0, 0);
        _perpTmp.set(-_dirTmp.z, 0.4, _dirTmp.x).normalize();
        targetCamPos.current.copy(_midTmp).addScaledVector(_perpTmp, span);
        targetLookAt.current.copy(_midTmp);
      }

      // Smooth camera interpolation for static transitions or active chase cameras
      if ((isTransitioningRef.current || isChaseMode) && cameraRef.current && controlsRef.current) {
        const lerpAlpha = isChaseMode ? 0.15 : 0.045;
        cameraRef.current.position.lerp(targetCamPos.current, lerpAlpha);
        controlsRef.current.target.lerp(targetLookAt.current, lerpAlpha);
        controlsRef.current.update();

        if (!isChaseMode && cameraRef.current.position.distanceTo(targetCamPos.current) < 0.1) {
          isTransitioningRef.current = false;
        }
      } else if (controlsRef.current) {
        controlsRef.current.update();
      }

      // 2D Screen Projection for High-Tech HUD Tags (uses live refs & signature diff to avoid 60fps React re-renders)
      if (mountRef.current && cameraRef.current) {
        const rect = mountRef.current.getBoundingClientRect();
        const w = Math.round(rect.width || mountRef.current.clientWidth || 0);
        const h = Math.round(rect.height || mountRef.current.clientHeight || 0);
        if (w > 1 && h > 1) {
          const cam = cameraRef.current;

          const toScreen = (pos: THREE.Vector3) => {
            const v = pos.clone().project(cam);
            const isFront = v.z < 1.0;
            return {
              x: ((v.x + 1) * w) / 2,
              y: ((-v.y + 1) * h) / 2,
              visible: isFront && v.x >= -1.1 && v.x <= 1.1 && v.y >= -1.1 && v.y <= 1.1
            };
          };

          const newCoords: typeof tagCoords = {};

          // Sentinel
          if (sentMesh) {
            const liveDistKm = curTarget && tgtMesh
              ? sentMesh.position.distanceTo(tgtMesh.position) / SCALE
              : curSentinel?.target_distance_km;
            const sDist = curTarget && liveDistKm !== undefined
              ? liveDistKm < 1.0
                ? `${(liveDistKm * 1000).toFixed(0)}m`
                : `${liveDistKm.toFixed(1)}km`
              : undefined;
            newCoords.sentinel = {
              ...toScreen(sentMesh.position),
              distToTarget: sDist
            };
          }

          // Target
          if (tgtMesh && curTarget) {
            newCoords.target = {
              ...toScreen(tgtMesh.position),
              name: curTarget.name
            };
          }

          // Selected Object (if different)
          if (curSelectedId && curSelectedId !== curSentinel?.id && curSelectedId !== curTarget?.id) {
            const selMesh = objectMeshesRef.current.get(curSelectedId);
            if (selMesh) {
              const found = curObjects.find(o => o.id === curSelectedId);
              newCoords.selected = {
                ...toScreen(selMesh.position),
                name: found?.name || curSelectedId
              };
            }
          }

          // Distance range midpoint
          if (sentMesh && tgtMesh) {
            const midPos = _midTmp.copy(sentMesh.position).add(tgtMesh.position).multiplyScalar(0.5);
            const distKm = sentMesh.position.distanceTo(tgtMesh.position) / SCALE;
            const distStr = distKm < 1.0 ? `${(distKm * 1000).toFixed(0)} m` : `${distKm.toFixed(1)} km`;
            newCoords.rangeMid = {
              ...toScreen(midPos),
              distStr
            };
          }

          const sig = [
            newCoords.sentinel ? `${newCoords.sentinel.visible ? 1 : 0}:${Math.round(newCoords.sentinel.x)}:${Math.round(newCoords.sentinel.y)}:${newCoords.sentinel.distToTarget || ''}` : '-',
            newCoords.target ? `${newCoords.target.visible ? 1 : 0}:${Math.round(newCoords.target.x)}:${Math.round(newCoords.target.y)}:${newCoords.target.name}` : '-',
            newCoords.selected ? `${newCoords.selected.visible ? 1 : 0}:${Math.round(newCoords.selected.x)}:${Math.round(newCoords.selected.y)}:${newCoords.selected.name}` : '-',
            newCoords.rangeMid ? `${newCoords.rangeMid.visible ? 1 : 0}:${Math.round(newCoords.rangeMid.x)}:${Math.round(newCoords.rangeMid.y)}:${newCoords.rangeMid.distStr}` : '-',
          ].join('|');

          if (sig !== lastTagSigRef.current) {
            lastTagSigRef.current = sig;
            setTagCoords(newCoords);
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', scheduleResize);
      dom.removeEventListener('click', onClick);
      controls.removeEventListener('start', onControlStart);
      if (container.contains(dom)) {
        container.removeChild(dom);
      }
      objectMeshesRef.current.clear();
      orbitLinesRef.current.clear();
      baseStatesRef.current.clear();
      predLineRef.current = null;
      interceptLineRef.current = null;
      rangeLineRef.current = null;
      scanConeRef.current = null;
      patrolConeRef.current = null;
      tetherLineRef.current = null;
      riskMarkersRef.current = null;
      earthMeshRef.current = null;
      cloudsRef.current = null;
      atmosphereRef.current = null;
      thrusterPlumeRef.current = null;
      thrusterLightRef.current = null;
      targetBeaconRef.current = null;
      maneuverArrowRef.current = null;
      ambientLightRef.current = null;
      fillLightRef.current = null;
      starsPointsRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // ───────────────────────────────────────────────────────────
  // Camera Presets & Dynamic Tracking Updates
  // ───────────────────────────────────────────────────────────
  // Camera presets trigger transition when selected; chase modes continue tracking at 60 FPS inside animate()
  useEffect(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    if (cameraMode === 'GLOBAL' || cameraMode === 'TOP_DOWN') {
      targetCamPos.current.set(16, 12, 16);
      targetLookAt.current.set(0, 0, 0);
      isTransitioningRef.current = true;
    } else if (cameraMode === 'LEO') {
      targetCamPos.current.set(8.5, 3.8, 8.5);
      targetLookAt.current.set(0, 0, 0);
      isTransitioningRef.current = true;
    } else if (cameraMode === 'MEO') {
      targetCamPos.current.set(19.0, 9.5, 19.0);
      targetLookAt.current.set(0, 0, 0);
      isTransitioningRef.current = true;
    } else if (cameraMode === 'GEO') {
      targetCamPos.current.set(45.0, 16.0, 45.0);
      targetLookAt.current.set(0, 0, 0);
      isTransitioningRef.current = true;
    } else if (
      cameraMode === 'FOLLOW_SENTINEL' ||
      cameraMode === 'FOLLOW_TARGET' ||
      cameraMode === 'PROXIMITY' ||
      cameraMode === 'COLLISION'
    ) {
      isTransitioningRef.current = true;
    }
  }, [cameraMode]);

  // ───────────────────────────────────────────────────────────
  // Synchronize 3D Orbital Objects & Detailed Spacecraft Meshes
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const isL = theme !== 'dark';

    baseSimTimeRef.current = simTimeRef.current;
    lastSnapshotNowRef.current = performance.now();

    objects.forEach(obj => {
      const isSentinel = obj.id === sentinel?.id;
      const isTarget = obj.id === target?.id;
      const isSelected = obj.id === selectedObjectId;

      const posX = obj.position_x * SCALE;
      const posY = obj.position_z * SCALE;
      const posZ = obj.position_y * SCALE;

      const isTumbling = Boolean(
        obj.health_status === 'CRITICAL' ||
        obj.status?.includes('TUMBLE') ||
        obj.status === 'UNCONTROLLED DRIFT'
      );
      const vSqVal = obj.velocity_x * obj.velocity_x + obj.velocity_y * obj.velocity_y + obj.velocity_z * obj.velocity_z;

      baseStatesRef.current.set(obj.id, {
        rxKm: obj.position_x,
        ryKm: obj.position_y,
        rzKm: obj.position_z,
        vxKms: obj.velocity_x,
        vyKms: obj.velocity_y,
        vzKms: obj.velocity_z,
        tumble: isTumbling,
        orientToVel: !isTumbling && vSqVal > 0.01
      });

      const desiredRole = isSentinel ? 'sentinel' : isTarget ? 'target' : obj.object_type;
      let mesh = objectMeshesRef.current.get(obj.id);
      if (mesh && mesh.userData.role !== desiredRole) {
        scene.remove(mesh);
        objectMeshesRef.current.delete(obj.id);
        if (mesh.userData.role === 'target') {
          targetBeaconRef.current = null;
        }
        mesh = undefined;
      }

      if (!mesh) {
        if (isSentinel) {
          // Detailed SENTINEL Autonomous Service Craft
          const group = new THREE.Group();

          // 1. Octagonal Gold Thermal Foil Main Bus
          const busGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.46, 8);
          const busMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            metalness: 0.95,
            roughness: 0.22
          });
          const bus = new THREE.Mesh(busGeo, busMat);
          group.add(bus);

          // 2. Photovoltaic Solar Array Wings (Dual)
          const wingGeo = new THREE.BoxGeometry(1.2, 0.02, 0.34);
          const wingMat = new THREE.MeshStandardMaterial({
            color: 0x0f2b5c,
            metalness: 0.85,
            roughness: 0.2
          });
          const wings = new THREE.Mesh(wingGeo, wingMat);
          group.add(wings);

          // Solar wing gold trim borders
          const trimGeo = new THREE.BoxGeometry(1.24, 0.024, 0.02);
          const trimMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9 });
          const trim1 = new THREE.Mesh(trimGeo, trimMat);
          trim1.position.z = 0.17;
          wings.add(trim1);
          const trim2 = new THREE.Mesh(trimGeo, trimMat);
          trim2.position.z = -0.17;
          wings.add(trim2);

          // 3. High-Gain Parabolic Communications Dish
          const dishGeo = new THREE.ConeGeometry(0.16, 0.08, 18);
          const dishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.2 });
          const dish = new THREE.Mesh(dishGeo, dishMat);
          dish.position.y = 0.28;
          dish.rotation.x = Math.PI / 4;
          group.add(dish);

          // Feed horn
          const hornGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.09);
          const horn = new THREE.Mesh(hornGeo, dishMat);
          horn.position.y = 0.32;
          group.add(horn);

          // 4. Dual Articulated Robotic Grapple Arms
          const armGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.26);
          const armMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.3 });

          const arm1 = new THREE.Mesh(armGeo, armMat);
          arm1.position.set(0.18, -0.12, 0.1);
          arm1.rotation.z = Math.PI / 3.5;
          group.add(arm1);

          const arm2 = new THREE.Mesh(armGeo, armMat);
          arm2.position.set(-0.18, -0.12, 0.1);
          arm2.rotation.z = -Math.PI / 3.5;
          group.add(arm2);

          // 5. Dynamic Glowing Ion Engine Exhaust Plume
          const plumeGeo = new THREE.ConeGeometry(0.14, 0.55, 18);
          const plumeMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
          });
          const plume = new THREE.Mesh(plumeGeo, plumeMat);
          plume.position.y = -0.45;
          plume.rotation.x = Math.PI;
          group.add(plume);
          thrusterPlumeRef.current = plume;

          // Ion engine light emission
          const ionLight = new THREE.PointLight(0x0284c7, 2.0, 3.5);
          ionLight.position.y = -0.45;
          group.add(ionLight);
          thrusterLightRef.current = ionLight;

          mesh = group;
        } else if (isTarget) {
          // Detailed Target Satellite with Hazard Warning Beacon
          const group = new THREE.Group();

          const busGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
          const busMat = new THREE.MeshStandardMaterial({
            color: 0xd97706,
            metalness: 0.8,
            roughness: 0.3
          });
          group.add(new THREE.Mesh(busGeo, busMat));

          const panelGeo = new THREE.BoxGeometry(0.85, 0.02, 0.24);
          const panelMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.8 });
          group.add(new THREE.Mesh(panelGeo, panelMat));

          const ringGeo = new THREE.RingGeometry(0.44, 0.54, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xdc2626,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = Math.PI / 2;
          group.add(ring);

          const beaconLight = new THREE.PointLight(0xdc2626, 2.5, 4.0);
          beaconLight.position.y = 0.28;
          group.add(beaconLight);
          targetBeaconRef.current = beaconLight;

          mesh = group;
        } else if (obj.object_type === 'ACTIVE_SATELLITE') {
          const group = new THREE.Group();
          const satGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
          const satMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.7, roughness: 0.3 });
          group.add(new THREE.Mesh(satGeo, satMat));

          const panelGeo = new THREE.BoxGeometry(0.65, 0.02, 0.18);
          const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a });
          group.add(new THREE.Mesh(panelGeo, panelMat));

          mesh = group;
        } else {
          const group = new THREE.Group();
          const debGeo = new THREE.DodecahedronGeometry(0.14, 0);
          const debMat = new THREE.MeshStandardMaterial({
            color: 0x64748b,
            roughness: 0.7,
            metalness: 0.5
          });
          const shard = new THREE.Mesh(debGeo, debMat);
          group.add(shard);
          mesh = group;
        }

        mesh.userData.role = desiredRole;
        scene.add(mesh);
        objectMeshesRef.current.set(obj.id, mesh);
      }

      // Compute authentic Keplerian orbital conic in ECI from live state vectors (r, v)
      const MU_EARTH_KM3_S2 = 398600.4418;
      const rVec = new THREE.Vector3(obj.position_x, obj.position_y, obj.position_z);
      const vVec = new THREE.Vector3(obj.velocity_x, obj.velocity_y, obj.velocity_z);
      const rMag = rVec.length();
      const vSq = vVec.lengthSq();
      const hVec = new THREE.Vector3().crossVectors(rVec, vVec);
      const hMag = hVec.length();
      const pSemi = hMag > 1e-3 ? (hMag * hMag) / MU_EARTH_KM3_S2 : rMag;
      const rDotV = rVec.dot(vVec);
      const eVec = hMag > 1e-3 && rMag > 100
        ? rVec.clone().multiplyScalar(vSq - MU_EARTH_KM3_S2 / rMag)
            .sub(vVec.clone().multiplyScalar(rDotV))
            .divideScalar(MU_EARTH_KM3_S2)
        : new THREE.Vector3();
      const ecc = Math.min(0.85, eVec.length());
      const orbSig = `${Math.round(pSemi * 2)}_${Math.round(ecc * 1000)}_${Math.round(hVec.x / 10)}_${Math.round(hVec.y / 10)}_${Math.round(hVec.z / 10)}`;

      let line = orbitLinesRef.current.get(obj.id);
      if (!line || line.userData.orbSig !== orbSig) {
        const pts: THREE.Vector3[] = [];
        const segs = 144;
        if (hMag > 1e-3 && rMag > 100) {
          const pHat = ecc > 1e-4 ? eVec.clone().normalize() : rVec.clone().normalize();
          const wHat = hVec.clone().normalize();
          const qHat = new THREE.Vector3().crossVectors(wHat, pHat).normalize();
          for (let i = 0; i <= segs; i++) {
            const nu = (i / segs) * Math.PI * 2;
            const rNu = pSemi / Math.max(0.15, 1 + ecc * Math.cos(nu));
            const eci = pHat.clone().multiplyScalar(rNu * Math.cos(nu)).add(qHat.clone().multiplyScalar(rNu * Math.sin(nu)));
            pts.push(new THREE.Vector3(eci.x * SCALE, eci.z * SCALE, eci.y * SCALE));
          }
        } else {
          const orbitRadius = EARTH_RADIUS + (obj.altitude || 600) * SCALE;
          for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push(new THREE.Vector3(orbitRadius * Math.cos(a), 0, orbitRadius * Math.sin(a)));
          }
        }

        if (!line) {
          const orbitGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const orbitMat = new THREE.LineBasicMaterial({
            color: isSentinel ? (isL ? 0x2563eb : 0x00f0ff) : isTarget ? (isL ? 0xd97706 : 0xf59e0b) : (isL ? 0x94a3b8 : 0x254b77),
            transparent: true,
            opacity: isSentinel ? 0.9 : isTarget ? 0.85 : (isL ? 0.38 : 0.25)
          });
          line = new THREE.Line(orbitGeo, orbitMat);
          line.userData.orbSig = orbSig;
          scene.add(line);
          orbitLinesRef.current.set(obj.id, line);
        } else {
          line.geometry.setFromPoints(pts);
          line.userData.orbSig = orbSig;
        }
      }

      // Update position & non-tumbling orientation immediately on state sync
      mesh.position.set(posX, posY, posZ);
      if (!isTumbling && vSq > 0.01) {
        const vScene = new THREE.Vector3(obj.velocity_x, obj.velocity_z, obj.velocity_y).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vScene);
      }

      // Activate ion thrusters strictly during active propulsion maneuvers
      if (isSentinel && thrusterPlumeRef.current) {
        const isThrusting = ['INTERCEPTING', 'MANEUVER', 'MANEUVERING', 'ENGAGED'].includes(obj.status || '');
        thrusterPlumeRef.current.visible = isThrusting;
        if (thrusterLightRef.current) {
          thrusterLightRef.current.visible = isThrusting;
        }
      }

      mesh.scale.setScalar(isSelected ? 1.4 : 1.0);
    });

    // Toggle orbit trails
    orbitLinesRef.current.forEach(l => {
      l.visible = showOrbits;
    });

    if (atmosphereRef.current) atmosphereRef.current.visible = showAtmosphere;
    if (cloudsRef.current) cloudsRef.current.visible = showAtmosphere;

    // Cleanup stale objects
    const liveIds = new Set(objects.map(o => o.id));
    objectMeshesRef.current.forEach((m, id) => {
      if (!liveIds.has(id)) {
        scene.remove(m);
        objectMeshesRef.current.delete(id);
        baseStatesRef.current.delete(id);
        const l = orbitLinesRef.current.get(id);
        if (l) {
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
          scene.remove(l);
          orbitLinesRef.current.delete(id);
        }
      }
    });

    // ── 3D Laser Distance Range Line, Patrol Radar Cone, LiDAR Scan Cone & Capture Tether ──
    if (rangeLineRef.current) {
      rangeLineRef.current.geometry.dispose();
      (rangeLineRef.current.material as THREE.Material).dispose();
      scene.remove(rangeLineRef.current);
      rangeLineRef.current = null;
    }
    if (scanConeRef.current) {
      scanConeRef.current.geometry.dispose();
      (scanConeRef.current.material as THREE.Material).dispose();
      scene.remove(scanConeRef.current);
      scanConeRef.current = null;
    }
    if (patrolConeRef.current) {
      patrolConeRef.current.geometry.dispose();
      (patrolConeRef.current.material as THREE.Material).dispose();
      scene.remove(patrolConeRef.current);
      patrolConeRef.current = null;
    }
    if (tetherLineRef.current) {
      tetherLineRef.current.geometry.dispose();
      (tetherLineRef.current.material as THREE.Material).dispose();
      scene.remove(tetherLineRef.current);
      tetherLineRef.current = null;
    }

    // Nadir-forward Orbital Patrol Sweep Cone (active during PATROL)
    if (sentinel && sentinel.status === 'PATROL') {
      const pSent = new THREE.Vector3(sentinel.position_x * SCALE, sentinel.position_z * SCALE, sentinel.position_y * SCALE);
      const rOut = pSent.clone().normalize();
      const vHat = new THREE.Vector3(sentinel.velocity_x, sentinel.velocity_z, sentinel.velocity_y).normalize();
      const patrolGeo = new THREE.ConeGeometry(0.32, 0.88, 16, 1, true);
      patrolGeo.translate(0, -0.44, 0); // Apex sits at (0,0,0) = SAT-01, opens along (0,-1,0)
      const patrolMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.3,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const patrolCone = new THREE.Mesh(patrolGeo, patrolMat);
      patrolCone.position.copy(pSent);
      if (rOut.lengthSq() > 0.1 && vHat.lengthSq() > 0.1) {
        const aimDir = vHat.multiplyScalar(0.78).addScaledVector(rOut, -0.55).normalize();
        patrolCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aimDir);
      }
      scene.add(patrolCone);
      patrolConeRef.current = patrolCone;
    }

    if (sentinel && target) {
      const p1 = new THREE.Vector3(sentinel.position_x * SCALE, sentinel.position_z * SCALE, sentinel.position_y * SCALE);
      const p2 = new THREE.Vector3(target.position_x * SCALE, target.position_z * SCALE, target.position_y * SCALE);
      const seg = p2.clone().sub(p1);
      const segLenSq = seg.lengthSq();
      const tProj = segLenSq > 1e-8 ? Math.max(0, Math.min(1, -p1.dot(seg) / segLenSq)) : 0;
      const closestToCenter = p1.clone().add(seg.multiplyScalar(tProj)).length();

      const rGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const rMat = new THREE.LineDashedMaterial({
        color: 0xd97706,
        dashSize: 0.3,
        gapSize: 0.15,
        linewidth: 2
      });
      const rLine = new THREE.Line(rGeo, rMat);
      rLine.computeLineDistances();
      rLine.visible = closestToCenter > EARTH_RADIUS * 0.995;
      scene.add(rLine);
      rangeLineRef.current = rLine;

      // Holographic LiDAR Scan Cone (apex at SAT-01 fanning toward Target)
      if (['INSPECTING', 'RENDEZVOUS', 'INSPECTION'].includes(sentinel.status || '')) {
        const dist = p1.distanceTo(p2);
        const dir = p2.clone().sub(p1).normalize();
        const coneGeo = new THREE.ConeGeometry(1.0, 1.0, 18, 1, true);
        coneGeo.translate(0, -0.5, 0); // Apex at local (0,0,0), opens along (0,-1,0)
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.35,
          wireframe: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.copy(p1);
        if (dist > 1e-4) {
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
          const baseR = Math.min(0.65, Math.max(0.14, dist * 0.16));
          cone.scale.set(baseR, dist, baseR);
        }
        scene.add(cone);
        scanConeRef.current = cone;
      }

      // Robotic Grapple Tether Line (strictly when target is physically captured)
      const isTargetCaptured =
        ['CAPTURED', 'CAPTURE'].includes(sentinel.status || '') ||
        sentinel.mission_phase === 'CAPTURE' ||
        (target.status || '').includes('CAPTURED');
      if (isTargetCaptured) {
        const tGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const tMat = new THREE.LineBasicMaterial({ color: 0x059669, linewidth: 3 });
        const tLine = new THREE.Line(tGeo, tMat);
        scene.add(tLine);
        tetherLineRef.current = tLine;
      }
    }

    // ── Conjunction Collision Warning Spheres (only when unoccluded outside Earth radius) ──
    if (riskMarkersRef.current) {
      riskMarkersRef.current.clear();
      risks.filter(r => r.risk_level === 'CRITICAL' || r.risk_level === 'HIGH').forEach(risk => {
        const objA = objects.find(o => o.id === risk.object_a_id);
        const objB = objects.find(o => o.id === risk.object_b_id);
        if (objA && objB) {
          const midVec = new THREE.Vector3(
            ((objA.position_x + objB.position_x) / 2.0) * SCALE,
            ((objA.position_z + objB.position_z) / 2.0) * SCALE,
            ((objA.position_y + objB.position_y) / 2.0) * SCALE
          );
          if (midVec.length() > EARTH_RADIUS * 1.01) {
            const sGeo = new THREE.SphereGeometry(0.42, 16, 16);
            const sMat = new THREE.MeshBasicMaterial({
              color: risk.risk_level === 'CRITICAL' ? 0xdc2626 : 0xd97706,
              wireframe: true,
              transparent: true,
              opacity: 0.8
            });
            const marker = new THREE.Mesh(sGeo, sMat);
            marker.position.copy(midVec);
            riskMarkersRef.current!.add(marker);
          }
        }
      });
    }

  }, [objects, sentinel, target, selectedObjectId, risks, showOrbits, showAtmosphere, theme]);

  // ───────────────────────────────────────────────────────────
  // Predicted Waypoints & Intercept Trajectory Splines
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    if (predLineRef.current) {
      predLineRef.current.geometry.dispose();
      (predLineRef.current.material as THREE.Material).dispose();
      scene.remove(predLineRef.current);
      predLineRef.current = null;
    }
    if (showTrajectory && predictedWaypoints && predictedWaypoints.length > 1) {
      const pts = predictedWaypoints.map(w => new THREE.Vector3(w.x * SCALE, w.z * SCALE, w.y * SCALE));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: 0x0284c7, dashSize: 0.35, gapSize: 0.15 });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      scene.add(line);
      predLineRef.current = line;
    }

    if (interceptLineRef.current) {
      interceptLineRef.current.geometry.dispose();
      (interceptLineRef.current.material as THREE.Material).dispose();
      scene.remove(interceptLineRef.current);
      interceptLineRef.current = null;
    }
    if (showTrajectory && interceptWaypoints && interceptWaypoints.length > 1) {
      const pts = interceptWaypoints.map(w => new THREE.Vector3(w.x * SCALE, w.z * SCALE, w.y * SCALE));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 3 });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      interceptLineRef.current = line;
    }
  }, [predictedWaypoints, interceptWaypoints, showTrajectory]);

  // 3D Maneuver Impulsive Velocity Vector Arrow (position follows SAT-01 at 60 FPS in animate())
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    if (maneuverArrowRef.current) {
      scene.remove(maneuverArrowRef.current);
      maneuverArrowRef.current = null;
    }
    const { sentinel: curSentinel } = livePropsRef.current;
    if (maneuverVector && curSentinel) {
      const sentMesh = objectMeshesRef.current.get(curSentinel.id);
      const origin = sentMesh
        ? sentMesh.position.clone()
        : new THREE.Vector3(curSentinel.position_x * SCALE, curSentinel.position_z * SCALE, curSentinel.position_y * SCALE);
      const dir = new THREE.Vector3(maneuverVector.x, maneuverVector.z, maneuverVector.y).normalize();
      const mag = Math.sqrt(maneuverVector.x ** 2 + maneuverVector.y ** 2 + maneuverVector.z ** 2);
      if (mag > 0.05) {
        const len = Math.max(0.6, Math.min(2.5, (mag / 10.0) * 1.5));
        const arrow = new THREE.ArrowHelper(dir, origin, len, 0x2563eb, 0.35, 0.2);
        scene.add(arrow);
        maneuverArrowRef.current = arrow;
      }
    }
  }, [maneuverVector?.x, maneuverVector?.y, maneuverVector?.z, Boolean(sentinel)]);

  const handleReset = useCallback(() => {
    if (controlsRef.current && cameraRef.current) {
      targetCamPos.current.set(15, 9, 15);
      targetLookAt.current.set(0, 0, 0);
      isTransitioningRef.current = true;
    }
    if (onChangeCameraMode) onChangeCameraMode('FREE');
    if (onResetCamera) onResetCamera();
  }, [onChangeCameraMode, onResetCamera]);

  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' }} ref={mountRef}>

      {/* Floating 3D HUD Projected Screen Tags */}
      {showTags && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>
          {/* Sentinel 3D Tag */}
          {sentinel && tagCoords.sentinel?.visible && (
            <div style={{
              position: 'absolute',
              left: `${tagCoords.sentinel.x}px`,
              top: `${tagCoords.sentinel.y - 36}px`,
              transform: 'translate(-50%, -100%)',
              background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(3, 8, 20, 0.88)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${isLight ? '#2563eb' : '#00f0ff'}`,
              boxShadow: isLight ? '0 4px 14px rgba(37, 99, 235, 0.15)' : '0 0 16px rgba(0,240,255,0.4)',
              padding: '4px 10px',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: isLight ? '#0f172a' : '#00f0ff',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isLight ? '#2563eb' : '#00f0ff' }} />
              <strong style={{ letterSpacing: '0.04em' }}>SENTINEL-01</strong>
              {tagCoords.sentinel.distToTarget && (
                <span style={{ color: '#d97706', paddingLeft: 6, borderLeft: '1px solid rgba(0,0,0,0.1)' }}>
                  Δ {tagCoords.sentinel.distToTarget}
                </span>
              )}
            </div>
          )}

          {/* Target 3D Tag */}
          {target && tagCoords.target?.visible && (
            <div style={{
              position: 'absolute',
              left: `${tagCoords.target.x}px`,
              top: `${tagCoords.target.y - 36}px`,
              transform: 'translate(-50%, -100%)',
              background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 8, 5, 0.88)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${isLight ? '#d97706' : '#f59e0b'}`,
              boxShadow: isLight ? '0 4px 14px rgba(217, 119, 6, 0.15)' : '0 0 16px rgba(245,158,11,0.4)',
              padding: '4px 10px',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: isLight ? '#0f172a' : '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />
              <strong style={{ letterSpacing: '0.04em' }}>TARGET: {tagCoords.target.name}</strong>
            </div>
          )}

          {/* Range Line Distance Readout at Midpoint */}
          {tagCoords.rangeMid?.visible && (
            <div style={{
              position: 'absolute',
              left: `${tagCoords.rangeMid.x}px`,
              top: `${tagCoords.rangeMid.y}px`,
              transform: 'translate(-50%, -50%)',
              background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(8, 14, 28, 0.92)',
              border: `1px dashed ${isLight ? '#d97706' : 'rgba(245,158,11,0.6)'}`,
              padding: '2px 8px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: isLight ? '#b45309' : '#f59e0b',
              fontWeight: 700,
              letterSpacing: '0.05em',
              boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}>
              RNG: {tagCoords.rangeMid.distStr}
            </div>
          )}
        </div>
      )}

      {/* Visual Scale Indicator (Bottom-Left) */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 10,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        background: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(10, 16, 32, 0.85)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(56, 189, 248, 0.25)'}`,
        borderRadius: 8,
        padding: '5px 10px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: isLight ? '#475569' : '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 48, height: 2, background: isLight ? '#2563eb' : '#00f0ff', borderRadius: 1 }} />
          <span style={{ fontWeight: 700, color: isLight ? '#0f172a' : '#f8fafc' }}>1,000 km</span>
        </div>
        <span style={{ fontSize: '9px', opacity: 0.8 }}>Scale: 1.0 unit = 1,000 km</span>
      </div>

      {/* Floating 3D Camera Angles & Layer Toggles Bar (Optional) */}
      {!hideControls && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(8, 14, 28, 0.85)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${isLight ? 'rgba(203, 213, 225, 0.9)' : 'rgba(56, 189, 248, 0.25)'}`,
          borderRadius: 12,
          padding: '6px 10px',
          boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.08)' : '0 8px 32px rgba(0,0,0,0.45)'
        }}>
          {/* Camera Preset Quick Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderRight: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`, paddingRight: 8 }}>
            <button
              onClick={() => onChangeCameraMode?.('FOLLOW_SENTINEL')}
              className={`cam-pill-btn ${cameraMode === 'FOLLOW_SENTINEL' ? 'active' : ''}`}
              title="Lock Camera onto Sentinel Spacecraft"
            >
              🛰️ Sentinel
            </button>
            <button
              onClick={() => onChangeCameraMode?.('LEO')}
              className={`cam-pill-btn ${cameraMode === 'LEO' ? 'active' : ''}`}
              title="Low Earth Orbit"
            >
              LEO
            </button>
            <button
              onClick={() => onChangeCameraMode?.('MEO')}
              className={`cam-pill-btn ${cameraMode === 'MEO' ? 'active' : ''}`}
              title="Medium Earth Orbit"
            >
              MEO
            </button>
            <button
              onClick={() => onChangeCameraMode?.('GEO')}
              className={`cam-pill-btn ${cameraMode === 'GEO' ? 'active' : ''}`}
              title="Geostationary Orbit"
            >
              GEO
            </button>
            <button
              onClick={() => onChangeCameraMode?.('COLLISION')}
              className={`cam-pill-btn ${cameraMode === 'COLLISION' || cameraMode === 'PROXIMITY' ? 'active' : ''}`}
              title="Collision Rendezvous View"
            >
              ⚡ Collision
            </button>
            <button
              onClick={() => onChangeCameraMode?.('GLOBAL')}
              className={`cam-pill-btn ${cameraMode === 'GLOBAL' ? 'active' : ''}`}
              title="Global Earth View"
            >
              🌍 Earth
            </button>
            <button
              onClick={handleReset}
              className={`cam-pill-btn ${cameraMode === 'FREE' ? 'active' : ''}`}
              title="Free Orbit Camera (Rotate & Zoom freely)"
            >
              <RotateCcw style={{ width: 11, height: 11 }} /> Free
            </button>
          </div>

          {/* 3D Visual Layer Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => setShowOrbits(!showOrbits)}
              className={`layer-toggle-btn ${showOrbits ? 'active' : ''}`}
              title="Toggle Orbital Path Lines"
            >
              Orbits
            </button>
            <button
              onClick={() => setShowTrajectory(!showTrajectory)}
              className={`layer-toggle-btn ${showTrajectory ? 'active' : ''}`}
              title="Toggle Intercept Trajectory Splines"
            >
              Trajectory
            </button>
            <button
              onClick={() => setShowTags(!showTags)}
              className={`layer-toggle-btn ${showTags ? 'active' : ''}`}
              title="Toggle 3D HUD Tracking Tags"
            >
              Labels
            </button>
            <button
              onClick={() => setShowAtmosphere(!showAtmosphere)}
              className={`layer-toggle-btn ${showAtmosphere ? 'active' : ''}`}
              title="Toggle Atmospheric Glow & Clouds"
            >
              Atmosphere
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
