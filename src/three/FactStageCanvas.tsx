import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { CameraPreset, FactChapter, LightingMood, SceneTheme } from '../types/video';
import { deriveContentCue } from '../utils/contentCue';
import { createThemeDiorama, type DioramaRig } from './dioramas';
import { createStudioMaterials } from './materials';
import {
  createArchipelagoDiscTexture,
  createBrushedMetalBumpTexture,
  createCircuitBoardTexture,
  createContactShadowTexture,
  createEarthGlobeTexture,
  createSolarCellTexture,
  createStageGridTexture,
} from './proceduralTextures';

export interface FactStageCanvasProps {
  activeTheme: SceneTheme;
  cameraPreset: CameraPreset;
  lightingMood: LightingMood;
  explodeAmount: number;
  isPlaying: boolean;
  chapter?: FactChapter | null;
  chapterProgress?: number;
  onFrameDraw?: (canvas: HTMLCanvasElement) => void;
}

export interface FactStageCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _targetColor = new THREE.Color();

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  utama: { pos: [4.6, 2.8, 5.4], target: [0, 1.5, 0] },
  sinematik: { pos: [-5.2, 2.1, 4.4], target: [0, 1.65, 0] },
  dekat: { pos: [2.8, 2.25, 3.3], target: [0, 1.85, 0] },
  atas: { pos: [0.4, 6.4, 3.6], target: [0, 1.1, 0] },
};

const MOOD_COLORS: Record<LightingMood, { bg: string; key: string; keyInt: number; hemiSky: string }> = {
  studio: { bg: '#0b1019', key: '#fff2dc', keyInt: 2.6, hemiSky: '#93c5fd' },
  senja: { bg: '#130e17', key: '#ffbe7b', keyInt: 2.8, hemiSky: '#c4b5fd' },
  malam: { bg: '#060911', key: '#d6e8ff', keyInt: 2.3, hemiSky: '#38bdf8' },
};

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const FactStageCanvas = forwardRef<FactStageCanvasHandle, FactStageCanvasProps>(
  function FactStageCanvas(
    {
      activeTheme,
      cameraPreset,
      lightingMood,
      explodeAmount,
      isPlaying,
      chapter = null,
      chapterProgress = 0,
      onFrameDraw,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [contextLost, setContextLost] = useState(false);
    const [webglUnavailable, setWebglUnavailable] = useState(false);

    // Live mutable state refs so WebGL scene never tears down on React updates
    const stateRef = useRef({
      activeTheme,
      cameraPreset,
      lightingMood,
      explodeAmount,
      isPlaying,
      chapter,
      chapterProgress,
      cue: deriveContentCue(activeTheme, chapter),
      onFrameDraw,
      cameraTransitionActive: false,
      cameraGoalPos: new THREE.Vector3(...CAMERA_PRESETS[cameraPreset].pos),
      cameraGoalTarget: new THREE.Vector3(...CAMERA_PRESETS[cameraPreset].target),
    });

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
    }));

    // Sync props into mutable ref
    useEffect(() => {
      stateRef.current.activeTheme = activeTheme;
      stateRef.current.lightingMood = lightingMood;
      stateRef.current.explodeAmount = explodeAmount;
      stateRef.current.isPlaying = isPlaying;
      stateRef.current.chapter = chapter;
      stateRef.current.chapterProgress = chapterProgress;
      stateRef.current.cue = deriveContentCue(activeTheme, chapter);
      stateRef.current.onFrameDraw = onFrameDraw;
    }, [activeTheme, lightingMood, explodeAmount, isPlaying, chapter, chapterProgress, onFrameDraw]);

    useEffect(() => {
      const preset = CAMERA_PRESETS[cameraPreset];
      stateRef.current.cameraGoalPos.set(...preset.pos);
      stateRef.current.cameraGoalTarget.set(...preset.target);
      stateRef.current.cameraTransitionActive = true;
    }, [cameraPreset]);

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      canvasRef.current = renderer.domElement;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      container.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      const initialMood = MOOD_COLORS[stateRef.current.lightingMood];
      scene.background = new THREE.Color(initialMood.bg);
      scene.fog = new THREE.FogExp2(initialMood.bg, 0.042);

      // Mandatory Studio Environment Reflections (PMREM + RoomEnvironment) on every device
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmremGenerator.dispose();

      const camera = new THREE.PerspectiveCamera(
        42,
        container.clientWidth / Math.max(container.clientHeight, 1),
        0.1,
        120
      );
      camera.position.set(...CAMERA_PRESETS[stateRef.current.cameraPreset].pos);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.06;
      controls.minDistance = 2.6;
      controls.maxDistance = 12.5;
      controls.minPolarAngle = 0.2;
      controls.maxPolarAngle = Math.PI / 2 - 0.04;
      controls.target.set(...CAMERA_PRESETS[stateRef.current.cameraPreset].target);
      controls.update();

      // Cancel scripted camera transition immediately when user interacts
      const onControlsStart = () => {
        stateRef.current.cameraTransitionActive = false;
      };
      controls.addEventListener('start', onControlsStart);

      // 3-Point Studio Lighting Rig
      const hemiLight = new THREE.HemisphereLight(initialMood.hemiSky, '#111622', 0.85);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(initialMood.key, initialMood.keyInt);
      keyLight.position.set(5.5, 8.5, 5.2);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 24;
      const d = 5.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight('#60a5fa', 1.15);
      rimLight.position.set(-5.0, 4.5, -5.5);
      scene.add(rimLight);

      // Studio softboxes (RectAreaLight) skipped only on software WebGL
      let rectLightLeft: THREE.RectAreaLight | null = null;
      let rectLightRight: THREE.RectAreaLight | null = null;
      if (!isSoftwareGl) {
        RectAreaLightUniformsLib.init();
        rectLightLeft = new THREE.RectAreaLight('#fff7ed', 2.4, 4, 3);
        rectLightLeft.position.set(-4.5, 3.8, 2.5);
        rectLightLeft.lookAt(0, 1.4, 0);
        scene.add(rectLightLeft);

        rectLightRight = new THREE.RectAreaLight('#bae6fd', 1.8, 4, 3);
        rectLightRight.position.set(4.5, 3.2, -2.5);
        rectLightRight.lookAt(0, 1.4, 0);
        scene.add(rectLightRight);
      }

      // Procedural Textures & PBR Materials
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const stageGridTex = createStageGridTexture(maxAniso);
      const brushedBumpTex = createBrushedMetalBumpTexture(maxAniso);
      const contactShadowTex = createContactShadowTexture();
      const archipelagoTex = createArchipelagoDiscTexture(maxAniso);
      const earthTex = createEarthGlobeTexture(maxAniso);
      const solarCellTex = createSolarCellTexture(maxAniso);
      const circuitTex = createCircuitBoardTexture(maxAniso);
      const materials = createStudioMaterials(
        { brushedBump: brushedBumpTex, earthTex, solarCellTex, circuitTex },
        isSoftwareGl
      );

      // Studio Cyclorama Stage Floor
      const floorGeo = new THREE.CircleGeometry(28, 64);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({
        map: stageGridTex,
        roughness: 0.78,
        metalness: 0.14,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.y = 0;
      floor.receiveShadow = true;
      scene.add(floor);

      // Contact Shadow Disc directly beneath hero diorama
      const contactGeo = new THREE.PlaneGeometry(5.6, 5.6);
      contactGeo.rotateX(-Math.PI / 2);
      const contactMat = new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.7,
      });
      const contactShadow = new THREE.Mesh(contactGeo, contactMat);
      contactShadow.position.y = 0.008;
      scene.add(contactShadow);

      // Ambient InstancedMesh data particles (48 motes)
      const particleCount = 48;
      const particleGeo = new THREE.OctahedronGeometry(0.036, 0);
      const particleMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#d97706',
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.4,
      });
      const particles = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
      particles.frustumCulled = false;
      const particleSeeds = Array.from({ length: particleCount }, (_, i) => ({
        radius: 2.5 + ((i * 19) % 100) / 38,
        angle: (i / particleCount) * Math.PI * 2,
        speed: 0.12 + (i % 5) * 0.04,
        yBase: 0.4 + ((i * 29) % 100) / 34,
        bobAmp: 0.15 + (i % 4) * 0.06,
        scale: 0.65 + (i % 6) * 0.14,
      }));
      scene.add(particles);

      // Build all 5 theme dioramas once and cross-scale smoothly on theme switch
      const themes: SceneTheme[] = ['nusantara', 'teknologi', 'sains', 'ekonomi', 'antariksa'];
      const dioramas: Record<SceneTheme, DioramaRig> = {
        nusantara: createThemeDiorama('nusantara', materials, archipelagoTex),
        teknologi: createThemeDiorama('teknologi', materials, archipelagoTex),
        sains: createThemeDiorama('sains', materials, archipelagoTex),
        ekonomi: createThemeDiorama('ekonomi', materials, archipelagoTex),
        antariksa: createThemeDiorama('antariksa', materials, archipelagoTex),
      };

      const themeScaleProgress: Record<SceneTheme, number> = {
        nusantara: 0,
        teknologi: 0,
        sains: 0,
        ekonomi: 0,
        antariksa: 0,
      };
      themeScaleProgress[stateRef.current.activeTheme] = 1;

      for (const t of themes) {
        const rig = dioramas[t];
        rig.group.visible = t === stateRef.current.activeTheme;
        rig.group.scale.setScalar(t === stateRef.current.activeTheme ? 1 : 0.001);
        scene.add(rig.group);
      }

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Resize handler
      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = Math.max(container.clientHeight, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      // Render Loop with software WebGL afterDraw pacing
      let frameId = 0;
      let disposed = false;
      let lastTime = performance.now();
      let animElapsed = 0;
      let currentExplode = stateRef.current.explodeAmount;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function tick() {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const st = stateRef.current;
        animElapsed += dt * (st.isPlaying ? 1.0 : 0.35);

        // Smooth camera preset damping
        if (st.cameraTransitionActive) {
          const k = 1 - Math.exp(-4.5 * dt);
          camera.position.lerp(st.cameraGoalPos, k);
          controls.target.lerp(st.cameraGoalTarget, k);
          if (
            camera.position.distanceToSquared(st.cameraGoalPos) < 0.001 &&
            controls.target.distanceToSquared(st.cameraGoalTarget) < 0.001
          ) {
            st.cameraTransitionActive = false;
          }
        } else if (st.isPlaying && !isSoftwareGl) {
          // Subtle documentary camera slow-orbit while playing
          const orbitSpeed = 0.065 * dt;
          _vec3A.copy(camera.position).sub(controls.target);
          _vec3A.applyAxisAngle(_vec3B.set(0, 1, 0), orbitSpeed);
          camera.position.copy(controls.target).add(_vec3A);
        }

        controls.update();

        // Smooth lighting mood transition
        const mood = MOOD_COLORS[st.lightingMood];
        _targetColor.set(mood.bg);
        (scene.background as THREE.Color).lerp(_targetColor, 1 - Math.exp(-3.5 * dt));
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(scene.background as THREE.Color);
        }
        _targetColor.set(mood.key);
        keyLight.color.lerp(_targetColor, 1 - Math.exp(-3.5 * dt));
        keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, mood.keyInt, 3.5, dt);
        _targetColor.set(mood.hemiSky);
        hemiLight.color.lerp(_targetColor, 1 - Math.exp(-3.5 * dt));

        // Smooth explode interpolation
        currentExplode = THREE.MathUtils.damp(currentExplode, st.explodeAmount, 6.0, dt);

        // Smooth cross-scale transition between dioramas
        for (const t of themes) {
          const targetS = t === st.activeTheme ? 1 : 0;
          const nextS = THREE.MathUtils.damp(themeScaleProgress[t], targetS, 7.5, dt);
          themeScaleProgress[t] = nextS;
          const rig = dioramas[t];
          if (nextS < 0.01) {
            rig.group.visible = false;
          } else {
            rig.group.visible = true;
            rig.group.scale.setScalar(nextS);
            rig.animate(animElapsed, dt, currentExplode, st.cue, st.chapterProgress);
          }
        }

        // Animate instanced ambient particles (zero GC)
        for (let i = 0; i < particleCount; i++) {
          const seed = particleSeeds[i];
          const a = seed.angle + animElapsed * seed.speed;
          const y = seed.yBase + Math.sin(animElapsed * 1.3 + i) * seed.bobAmp;
          _vec3A.set(Math.cos(a) * seed.radius, y, Math.sin(a) * seed.radius);
          _euler.set(animElapsed * 0.6 + i, animElapsed * 0.9, 0);
          _quat.setFromEuler(_euler);
          _vec3B.setScalar(seed.scale);
          _mat4.compose(_vec3A, _quat, _vec3B);
          particles.setMatrixAt(i, _mat4);
        }
        particles.instanceMatrix.needsUpdate = true;

        renderer.render(scene, camera);

        // Notify video recorder if active in same frame
        st.onFrameDraw?.(renderer.domElement);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      }

      if (isSoftwareGl) {
        tick();
      } else {
        frameId = requestAnimationFrame(tick);
      }

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        controls.removeEventListener('start', onControlsStart);
        controls.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

        for (const t of themes) {
          const rig = dioramas[t];
          for (const g of rig.disposables) g.dispose();
          for (const m of rig.extraMaterials) m.dispose();
        }
        floorGeo.dispose();
        floorMat.dispose();
        contactGeo.dispose();
        contactMat.dispose();
        particleGeo.dispose();
        particleMat.dispose();
        stageGridTex.dispose();
        brushedBumpTex.dispose();
        contactShadowTex.dispose();
        archipelagoTex.dispose();
        earthTex.dispose();
        solarCellTex.dispose();
        circuitTex.dispose();
        materials.dispose();
        envRT.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    if (webglUnavailable) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#090c12] text-slate-300 p-8 text-center">
          <div className="max-w-md space-y-2">
            <h2 className="font-display text-xl font-semibold text-white">
              Tampilan 3D Tidak Tersedia
            </h2>
            <p className="text-sm text-slate-400">
              Peramban Anda belum mendukung WebGL2 untuk merender panggung diorama 3D secara langsung.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-[#090c12]">
        <div ref={mountRef} className="w-full h-full" />
        {contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090c12]/90 text-slate-200 z-30">
            <p className="text-sm font-medium">Memulihkan konteks grafis 3D...</p>
          </div>
        )}
      </div>
    );
  }
);
