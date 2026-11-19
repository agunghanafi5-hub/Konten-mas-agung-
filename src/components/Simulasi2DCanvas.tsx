import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { FactChapter, LightingMood, SceneTheme } from '../types/video';
import { getSafeCanvasPhoto } from '../utils/chapterPhotos';
import { deriveContentCue, type ContentSimulationCue } from '../utils/contentCue';

export interface Simulasi2DCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export interface Simulasi2DCanvasProps {
  activeTheme: SceneTheme;
  lightingMood: LightingMood;
  isPlaying: boolean;
  chapter?: FactChapter | null;
  chapterProgress?: number;
  onFrameDraw?: (canvas: HTMLCanvasElement) => void;
}

interface MoodPalette {
  skyTop: string;
  skyMid: string;
  skyBot: string;
  horizonGlow: string;
  celestialColor: string;
  celestialHalo: string;
  grid: string;
  isNight: boolean;
}

const PALETTE_BY_MOOD: Record<LightingMood, MoodPalette> = {
  studio: {
    skyTop: '#0b1526',
    skyMid: '#13243b',
    skyBot: '#09111d',
    horizonGlow: 'rgba(56, 189, 248, 0.16)',
    celestialColor: '#e0f2fe',
    celestialHalo: 'rgba(56, 189, 248, 0.24)',
    grid: 'rgba(148, 163, 184, 0.06)',
    isNight: false,
  },
  senja: {
    skyTop: '#160d24',
    skyMid: '#311a34',
    skyBot: '#0e0914',
    horizonGlow: 'rgba(251, 146, 60, 0.28)',
    celestialColor: '#fde68a',
    celestialHalo: 'rgba(245, 158, 11, 0.34)',
    grid: 'rgba(251, 191, 36, 0.06)',
    isNight: false,
  },
  malam: {
    skyTop: '#03060f',
    skyMid: '#081022',
    skyBot: '#02040a',
    horizonGlow: 'rgba(14, 165, 233, 0.16)',
    celestialColor: '#e2e8f0',
    celestialHalo: 'rgba(125, 211, 252, 0.2)',
    grid: 'rgba(56, 189, 248, 0.05)',
    isNight: true,
  },
};

// Precomputed deterministic starfield for night & space backdrops
const STARS = Array.from({ length: 68 }, (_, i) => {
  const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const s2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
  const s3 = Math.sin(i * 419.2 + 71.9) * 43758.5453;
  return {
    nx: s1 - Math.floor(s1),
    ny: (s2 - Math.floor(s2)) * 0.78,
    r: 0.7 + (s3 - Math.floor(s3)) * 1.5,
    phase: i * 0.9,
  };
});

export const Simulasi2DCanvas = forwardRef<Simulasi2DCanvasHandle, Simulasi2DCanvasProps>(
  function Simulasi2DCanvas(
    { activeTheme, lightingMood, isPlaying, chapter = null, chapterProgress = 0, onFrameDraw },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stateRef = useRef({
      activeTheme,
      lightingMood,
      isPlaying,
      chapter,
      chapterProgress,
      cue: deriveContentCue(activeTheme, chapter),
      onFrameDraw,
    });

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
    }));

    useEffect(() => {
      stateRef.current = {
        activeTheme,
        lightingMood,
        isPlaying,
        chapter,
        chapterProgress,
        cue: deriveContentCue(activeTheme, chapter),
        onFrameDraw,
      };
    }, [activeTheme, lightingMood, isPlaying, chapter, chapterProgress, onFrameDraw]);

    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(container.clientWidth, 320);
        const h = Math.max(container.clientHeight, 200);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      let rafId = 0;
      let lastTime = performance.now();
      let t = 0;

      const draw = () => {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const st = stateRef.current;
        const speedMul = (st.isPlaying ? 1.0 : 0.3) * (st.cue?.tempoMultiplier ?? 1);
        t += dt * speedMul;

        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const scale = Math.min(W, H) / 600;
        const prog = Math.max(0, Math.min(1, st.chapterProgress));

        drawAtmosphere2D(ctx, W, H, scale, st.lightingMood, st.activeTheme, t, st.chapter, prog);

        ctx.save();
        ctx.translate(cx, cy - 22 * scale);
        ctx.scale(scale, scale);

        const cue = st.cue;

        if (st.activeTheme === 'nusantara') {
          drawNusantara2D(ctx, t, prog, cue, st.lightingMood);
        } else if (st.activeTheme === 'teknologi') {
          drawTeknologi2D(ctx, t, prog, cue);
        } else if (st.activeTheme === 'sains') {
          drawSains2D(ctx, t, prog, cue, st.lightingMood);
        } else if (st.activeTheme === 'ekonomi') {
          drawEkonomi2D(ctx, t, prog, cue);
        } else {
          drawAntariksa2D(ctx, t, prog, cue);
        }

        ctx.restore();

        st.onFrameDraw?.(canvas);
        rafId = requestAnimationFrame(draw);
      };

      rafId = requestAnimationFrame(draw);

      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }, []);

    return (
      <div ref={containerRef} className="w-full h-full bg-[#060911]">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    );
  }
);

function drawAtmosphere2D(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  mood: LightingMood,
  theme: SceneTheme,
  t: number,
  chapter: FactChapter | null,
  progress: number
) {
  const palette = PALETTE_BY_MOOD[mood];
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, palette.skyTop);
  grad.addColorStop(0.55, palette.skyMid);
  grad.addColorStop(1, palette.skyBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle Ken Burns documentary illustration photograph (same-origin untainted image)
  const photo = getSafeCanvasPhoto(chapter?.fotoUrl, theme);
  if (photo && photo.naturalWidth > 0 && photo.naturalHeight > 0) {
    const zoom = 1.05 + 0.08 * progress + 0.02 * Math.sin(t * 0.4);
    const imgRatio = photo.naturalWidth / photo.naturalHeight;
    const canvasRatio = W / H;
    let drawW = W * zoom;
    let drawH = H * zoom;
    if (imgRatio > canvasRatio) {
      drawH = H * zoom;
      drawW = drawH * imgRatio;
    } else {
      drawW = W * zoom;
      drawH = drawW / imgRatio;
    }
    const panX = Math.sin(t * 0.25) * Math.max(0, (drawW - W) * 0.35);
    const panY = Math.cos(t * 0.2) * Math.max(0, (drawH - H) * 0.25);

    ctx.save();
    ctx.globalAlpha = mood === 'malam' ? 0.26 : 0.34;
    ctx.drawImage(photo, (W - drawW) / 2 + panX, (H - drawH) / 2 + panY, drawW, drawH);
    ctx.globalAlpha = 1;

    // Cinematic vignette & mood tint so vector simulation and bottom subtitles remain crisp
    const vignette = ctx.createLinearGradient(0, 0, 0, H);
    vignette.addColorStop(0, 'rgba(6, 10, 18, 0.56)');
    vignette.addColorStop(0.45, 'rgba(6, 10, 18, 0.32)');
    vignette.addColorStop(1, 'rgba(5, 8, 14, 0.78)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Subtle horizon glow
  const horizonY = H * 0.54;
  const hGlow = ctx.createRadialGradient(W * 0.5, horizonY, 10, W * 0.5, horizonY, Math.max(W, H) * 0.55);
  hGlow.addColorStop(0, palette.horizonGlow);
  hGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = hGlow;
  ctx.fillRect(0, 0, W, H);

  // Stars for space theme or night mood
  if (theme === 'antariksa' || palette.isNight) {
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + s.phase));
      ctx.fillStyle = `rgba(226, 232, 240, ${twinkle * (theme === 'antariksa' ? 0.88 : 0.5)})`;
      ctx.beginPath();
      ctx.arc(s.nx * W, s.ny * H, s.r * Math.max(scale, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sun / Moon orb (non-teknologi terrestrial/space scenes)
  if (theme !== 'teknologi') {
    const sunX = mood === 'senja' ? W * 0.72 : W * 0.78;
    const sunY = mood === 'senja' ? H * 0.38 : H * 0.22;
    const sunR = (mood === 'senja' ? 38 : 24) * scale;
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 4.2);
    halo.addColorStop(0, palette.celestialHalo);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.celestialColor;
    ctx.globalAlpha = mood === 'malam' ? 0.75 : 0.85;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Drifting atmospheric clouds for outdoor themes
  if (theme === 'nusantara' || theme === 'sains' || theme === 'ekonomi') {
    ctx.fillStyle = mood === 'senja' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(226, 232, 240, 0.07)';
    for (let c = 0; c < 4; c++) {
      const cxPos = (((c * 0.28 + t * (0.012 + c * 0.003)) % 1.3) - 0.15) * W;
      const cyPos = H * (0.16 + c * 0.07);
      const cw = (110 + c * 22) * scale;
      const ch = 20 * scale;
      ctx.beginPath();
      ctx.ellipse(cxPos, cyPos, cw * 0.55, ch * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(cxPos - cw * 0.28, cyPos + ch * 0.14, cw * 0.34, ch * 0.42, 0, 0, Math.PI * 2);
      ctx.ellipse(cxPos + cw * 0.3, cyPos + ch * 0.16, cw * 0.32, ch * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle architectural grid
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const step = Math.max(40, Math.round(54 * scale));
  for (let x = (W / 2) % step; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = (H / 2) % step; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#94a3b8', size = 11) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

/* ============================================================================
 * 1. NUSANTARA: Kepulauaan, Jembatan Kabel, Kereta Cepat, Kapal & Sinyal Satelit
 * ============================================================================ */
function drawNusantara2D(
  ctx: CanvasRenderingContext2D,
  t: number,
  progress: number,
  cue: ContentSimulationCue,
  mood: LightingMood
) {
  const isRail = cue.focus === 'rail';
  const isMaritime = cue.focus === 'maritime';
  const isTelecom = cue.focus === 'telecom';

  // Distant volcanic mountain silhouette horizon
  ctx.fillStyle = mood === 'senja' ? 'rgba(58, 35, 62, 0.72)' : 'rgba(22, 38, 60, 0.78)';
  ctx.beginPath();
  ctx.moveTo(-300, 38);
  ctx.lineTo(-245, -18);
  ctx.lineTo(-195, 10);
  ctx.lineTo(-140, -34);
  ctx.lineTo(-85, 22);
  ctx.lineTo(-30, 38);
  ctx.lineTo(45, 38);
  ctx.lineTo(105, -8);
  ctx.lineTo(160, -42);
  ctx.lineTo(220, 8);
  ctx.lineTo(265, -12);
  ctx.lineTo(300, 38);
  ctx.closePath();
  ctx.fill();

  // Sea Strait Band with depth gradient & animated shimmer waves
  const seaGrad = ctx.createLinearGradient(0, 35, 0, 145);
  seaGrad.addColorStop(0, '#0c3659');
  seaGrad.addColorStop(0.5, '#082542');
  seaGrad.addColorStop(1, '#051529');
  ctx.fillStyle = seaGrad;
  ctx.beginPath();
  ctx.roundRect(-290, 36, 580, 108, 16);
  ctx.fill();

  // Specular sea waves
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.24)';
  ctx.lineWidth = 1.5;
  for (let row = 0; row < 4; row++) {
    const yBase = 55 + row * 21;
    ctx.beginPath();
    for (let x = -270; x <= 270; x += 14) {
      const y = yBase + Math.sin(x * 0.04 + t * (1.8 + row * 0.25) + row) * 2.5;
      if (x === -270) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // West & East Island Port Platforms + Lush Terraces
  const drawIslandHub = (xCenter: number, flip: number) => {
    const landGrad = ctx.createLinearGradient(0, 12, 0, 62);
    landGrad.addColorStop(0, '#166534');
    landGrad.addColorStop(0.45, '#14532d');
    landGrad.addColorStop(1, '#334155');
    ctx.fillStyle = landGrad;
    ctx.beginPath();
    ctx.moveTo(xCenter - 82, 48);
    ctx.quadraticCurveTo(xCenter - 45, 6, xCenter, 16);
    ctx.quadraticCurveTo(xCenter + 48, 8, xCenter + 82, 48);
    ctx.lineTo(xCenter + 76, 60);
    ctx.lineTo(xCenter - 76, 60);
    ctx.closePath();
    ctx.fill();

    // Concrete harbor quay wall
    ctx.fillStyle = '#475569';
    ctx.fillRect(xCenter - 70, 46, 140, 12);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(xCenter - 66, 46, 132, 2);

    // Coastal hub buildings
    const bOffsets = [-42, -22, 16, 36];
    const bHeights = [22, 32, 26, 18];
    for (let i = 0; i < bOffsets.length; i++) {
      const bx = xCenter + bOffsets[i] * flip;
      const bh = bHeights[i];
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx - 7, 46 - bh, 14, bh);
      ctx.fillStyle = '#fde047';
      for (let wy = 46 - bh + 4; wy < 42; wy += 6) {
        ctx.fillRect(bx - 4, wy, 3, 2);
        ctx.fillRect(bx + 1, wy, 3, 2);
      }
    }
  };

  drawIslandHub(-198, 1);
  drawIslandHub(198, -1);

  // Cable-Stayed Suspension Bridge (connecting West & East hubs)
  const deckY = 16;
  const pylonXs = [-96, 96];

  // Stay cables
  ctx.strokeStyle = isRail ? 'rgba(251, 191, 36, 0.72)' : 'rgba(148, 163, 184, 0.48)';
  ctx.lineWidth = 1.2;
  for (const px of pylonXs) {
    const topY = -62;
    for (let c = 1; c <= 5; c++) {
      const span = c * 17;
      ctx.beginPath();
      ctx.moveTo(px, topY + c * 4);
      ctx.lineTo(px - span, deckY);
      ctx.moveTo(px, topY + c * 4);
      ctx.lineTo(px + span, deckY);
      ctx.stroke();
    }
  }

  // Bridge A-Frame Pylons
  for (const px of pylonXs) {
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(px - 8, 46);
    ctx.lineTo(px - 2, -66);
    ctx.lineTo(px + 2, -66);
    ctx.lineTo(px + 8, 46);
    ctx.closePath();
    ctx.fill();
    // Aviation warning beacon
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ef4444' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(px, -68, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bridge Deck Girder
  ctx.fillStyle = '#334155';
  ctx.fillRect(-205, deckY, 410, 8);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-205, deckY, 410, 2);

  // Streamlined High-Speed Bullet Train ("Whoosh" style)
  const trainSpeed = isRail ? 1.35 : 0.8;
  const trainU = 0.5 - 0.44 * Math.cos(t * trainSpeed + progress * 2);
  const trainX = -175 + trainU * 350;
  const dir = Math.sin(t * trainSpeed + progress * 2) >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(trainX, deckY - 1);
  if (isRail) {
    const glow = ctx.createRadialGradient(0, -6, 4, 0, -6, 56);
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.36)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -6, 56, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(dir, 1);
  // 3-car aerodynamic body
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.lineTo(-42, -11);
  ctx.lineTo(28, -11);
  ctx.quadraticCurveTo(46, -10, 48, 0);
  ctx.closePath();
  ctx.fill();
  // Red-amber stripe & cockpit visor
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-40, -5, 76, 2.5);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(31, -9);
  ctx.lineTo(42, -4);
  ctx.lineTo(31, -4);
  ctx.closePath();
  ctx.fill();
  // Lit passenger windows
  ctx.fillStyle = '#38bdf8';
  for (let wx = -36; wx <= 20; wx += 8) {
    ctx.fillRect(wx, -9, 5, 3);
  }
  // Headlight beam
  ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
  ctx.beginPath();
  ctx.moveTo(48, -2);
  ctx.lineTo(82, -7);
  ctx.lineTo(82, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Contoured Container Vessel sailing through the strait
  const shipSpeed = isMaritime ? 0.85 : 0.48;
  const shipX = Math.sin(t * shipSpeed + progress) * 145;
  const shipDir = Math.cos(t * shipSpeed + progress) >= 0 ? 1 : -1;
  const shipY = 92 + Math.sin(t * 2.2) * 3.5;

  ctx.save();
  ctx.translate(shipX, shipY);
  if (isMaritime) {
    const sGlow = ctx.createRadialGradient(0, -10, 6, 0, -10, 64);
    sGlow.addColorStop(0, 'rgba(56, 189, 248, 0.36)');
    sGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = sGlow;
    ctx.beginPath();
    ctx.arc(0, -10, 64, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(shipDir, 1);

  // Wake foam V-trail behind stern
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.52)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-42, 4);
  ctx.lineTo(-82 - Math.sin(t * 6) * 4, -2);
  ctx.moveTo(-42, 6);
  ctx.lineTo(-88 - Math.cos(t * 6) * 4, 11);
  ctx.stroke();

  // Tapered hull
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(-42, 4);
  ctx.lineTo(38, 4);
  ctx.lineTo(48, -8);
  ctx.lineTo(-40, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-40, -12, 86, 4);

  // Stacked shipping containers
  const contColors = ['#f59e0b', '#0ea5e9', '#10b981', '#e11d48'];
  for (let c = 0; c < 4; c++) {
    ctx.fillStyle = contColors[c];
    ctx.fillRect(-20 + c * 14, -21, 12, 9);
    if (c < 3) {
      ctx.fillStyle = contColors[(c + 2) % 4];
      ctx.fillRect(-16 + c * 14, -30, 12, 9);
    }
  }
  // White bridge tower
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(-36, -32, 13, 20);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(-33, -29, 8, 4);
  ctx.restore();

  // Twin Telecom Towers + Satellite Relay Link
  const drawTower = (tx: number) => {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx - 8, 18);
    ctx.lineTo(tx, -54);
    ctx.lineTo(tx + 8, 18);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 6, 0);
    ctx.lineTo(tx + 5, -18);
    ctx.moveTo(tx + 6, 0);
    ctx.lineTo(tx - 5, -18);
    ctx.stroke();

    // Pulsing RF rings
    for (let r = 0; r < 2; r++) {
      const rp = (t * (isTelecom ? 0.95 : 0.55) + r * 0.5) % 1;
      ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - rp) * (isTelecom ? 0.85 : 0.45)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tx, -56, 6 + rp * 26, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  };
  drawTower(-215);
  drawTower(215);

  // Orbital Relay Satellite Node & Data Beam Arcs
  const satY = -126 + Math.sin(t * 1.4) * 4;
  ctx.strokeStyle = isTelecom ? 'rgba(56, 189, 248, 0.6)' : 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = isTelecom ? 2 : 1.4;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(-215, -56);
  ctx.quadraticCurveTo(-110, -130, 0, satY);
  ctx.quadraticCurveTo(110, -130, 215, -56);
  ctx.stroke();
  ctx.setLineDash([]);

  // Racing photon packets along sky arc
  for (let p = 0; p < 3; p++) {
    const u = (t * (isTelecom ? 0.8 : 0.45) + p * 0.33) % 1;
    const px = -215 + u * 430;
    const py = -56 - Math.sin(u * Math.PI) * 72;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(px, py, isTelecom ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mini relay satellite icon at apex
  ctx.fillStyle = '#eab308';
  ctx.fillRect(-7, satY - 5, 14, 10);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(-23, satY - 3, 14, 6);
  ctx.fillRect(9, satY - 3, 14, 6);
}

/* ============================================================================
 * 2. TEKNOLOGI: Server AI, Pendingin Cairan & Prosesor Inti Neural
 * ============================================================================ */
function drawTeknologi2D(
  ctx: CanvasRenderingContext2D,
  t: number,
  progress: number,
  cue: ContentSimulationCue
) {
  const isDataCenter = cue.focus === 'datacenter';
  const isAI = cue.focus === 'ai';

  // Gold PCB trace lines radiating on backdrop
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(i * 42, -55);
    ctx.lineTo(i * 75, -55);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(i * 42, 65);
    ctx.lineTo(i * 75, 65);
    ctx.stroke();
  }

  // Left & Right Perspective AI Server Racks with Liquid Cooling Pipes
  const rackPositions = [
    { x: -205, y: -58, label: 'KLUSTER-01' },
    { x: -205, y: 42, label: 'MEMORI-02' },
    { x: 205, y: -58, label: 'GPU-ARRAY' },
    { x: 205, y: 42, label: 'CLOUD-HUB' },
  ];

  for (let r = 0; r < rackPositions.length; r++) {
    const rp = rackPositions[r];

    // Fiber conduit curve to core
    ctx.strokeStyle = isDataCenter ? 'rgba(56, 189, 248, 0.58)' : 'rgba(56, 189, 248, 0.34)';
    ctx.lineWidth = isDataCenter ? 3 : 2.2;
    ctx.beginPath();
    ctx.moveTo(rp.x, rp.y);
    ctx.quadraticCurveTo(rp.x * 0.45, rp.y * 0.25, 0, 0);
    ctx.stroke();

    // Racing optical data packets
    for (let p = 0; p < 3; p++) {
      const u = (t * (isAI ? 0.95 : 0.7) + r * 0.22 + p * 0.33) % 1;
      const mu = 1 - u;
      const px = mu * mu * rp.x + 2 * mu * u * (rp.x * 0.45);
      const py = mu * mu * rp.y + 2 * mu * u * (rp.y * 0.25);
      ctx.fillStyle = p === 0 ? '#fbbf24' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Server rack chassis
    ctx.save();
    ctx.translate(rp.x, rp.y);
    if (isDataCenter) {
      ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = isDataCenter ? '#38bdf8' : '#475569';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-44, -34, 88, 68, 7);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Rack blade units + blinking telemetry LEDs
    for (let b = 0; b < 4; b++) {
      const by = -26 + b * 14;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-37, by, 74, 10);
      // Blinking LED dots
      for (let led = 0; led < 4; led++) {
        const active = Math.sin(t * 5.2 + r * 1.7 + b * 2.1 + led * 1.3) > 0;
        ctx.fillStyle = led === 3 ? (active ? '#fbbf24' : '#78350f') : active ? '#22d3ee' : '#0e7490';
        ctx.beginPath();
        ctx.arc(-30 + led * 7, by + 5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Vent grille bars
      ctx.fillStyle = '#334155';
      ctx.fillRect(4, by + 3, 26, 4);
    }

    // Side coolant manifold glass tube with rising bubbles
    const pipeX = rp.x < 0 ? 48 : -54;
    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(pipeX, -30, 6, 60);
    ctx.strokeRect(pipeX, -30, 6, 60);
    for (let k = 0; k < 3; k++) {
      const bp = (t * 0.8 + k * 0.33 + r * 0.2) % 1;
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(pipeX + 3, 28 - bp * 56, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    drawLabel(ctx, rp.label, 0, 46, '#94a3b8', 9.5);
    ctx.restore();
  }

  // Central Silicon Neural Processor Die
  const pulse = (t * 0.72) % 1;
  ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - pulse) * 0.6})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 64 + pulse * 86, 0, Math.PI * 2);
  ctx.stroke();

  // Outer rotating gyroscope ring
  ctx.save();
  ctx.rotate(t * (isAI ? 1.15 : 0.75));
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([22, 10, 6, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Counter-rotating telemetry ring
  ctx.save();
  ctx.rotate(-t * 0.6);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Square substrate & gold contact pins
  ctx.fillStyle = '#0b1324';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-44, -44, 88, 88, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eab308';
  for (let p = -30; p <= 30; p += 10) {
    ctx.fillRect(p - 2, -50, 4, 6);
    ctx.fillRect(p - 2, 44, 4, 6);
    ctx.fillRect(-50, p - 2, 6, 4);
    ctx.fillRect(44, p - 2, 6, 4);
  }

  // Inner crystalline silicon die + pulsing neural core
  const coreGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
  coreGlow.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
  coreGlow.addColorStop(0.6, 'rgba(14, 165, 233, 0.25)');
  coreGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-24, -24, 48, 48, 7);
  ctx.fill();
  ctx.stroke();
  drawLabel(ctx, 'INTI AI', 0, 4, '#e0f2fe', 11);

  // Live Oscilloscope Waveform Strip at bottom
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-150, 96, 300, 36, 8);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let x = -138; x <= 138; x += 4) {
    const wave =
      Math.sin(x * 0.08 + t * 5.2) * (6 + progress * 4) +
      Math.cos(x * 0.16 - t * 3.1) * 4;
    const y = 114 + wave;
    if (x === -138) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* ============================================================================
 * 3. SAINS: Gelombang Laut Dinamis, Turbin Angin Lepas Pantai, PLTS & Buoy
 * ============================================================================ */
function drawSains2D(
  ctx: CanvasRenderingContext2D,
  t: number,
  progress: number,
  cue: ContentSimulationCue,
  mood: LightingMood
) {
  const isWind = cue.focus === 'wind';
  const isSolar = cue.focus === 'solar';
  const isOcean = cue.focus === 'ocean';

  // Wind Streamline Ribbons sweeping across sky
  ctx.strokeStyle = isWind ? 'rgba(125, 211, 252, 0.42)' : 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = isWind ? 2 : 1.3;
  for (let w = 0; w < 4; w++) {
    const y0 = -115 + w * 26;
    const xStart = -270 + ((t * (75 + w * 14) + w * 130) % 420);
    ctx.beginPath();
    ctx.moveTo(xStart, y0);
    ctx.bezierCurveTo(xStart + 35, y0 - 8, xStart + 65, y0 + 8, xStart + 100, y0);
    ctx.stroke();
  }

  // Offshore Wind Turbines mounted on yellow steel monopiles
  const turbines = [-155, 155];
  for (let idx = 0; idx < turbines.length; idx++) {
    const tx = turbines[idx];
    const hubY = -58;

    // Yellow offshore splash jacket
    ctx.fillStyle = '#d97706';
    ctx.fillRect(tx - 6, 18, 12, 44);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(tx - 8, 18, 16, 5);

    // Tapered white mast
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(tx - 5, 18);
    ctx.lineTo(tx - 2.5, hubY);
    ctx.lineTo(tx + 2.5, hubY);
    ctx.lineTo(tx + 5, 18);
    ctx.closePath();
    ctx.fill();

    // Rotating 3-blade airfoil rotor
    ctx.save();
    ctx.translate(tx, hubY);
    ctx.rotate(t * ((isWind ? 3.2 : 2.1) - idx * 0.25));
    for (let b = 0; b < 3; b++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-4.5, 22);
      ctx.lineTo(-1, 60);
      ctx.lineTo(1.5, 60);
      ctx.lineTo(3, 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Back Ocean Wave Layer
  const waveYAt = (x: number, phaseShift: number, amp: number, speed: number) =>
    44 + Math.sin(x * 0.024 + t * speed + phaseShift) * amp + Math.cos(x * 0.015 - t * 1.4) * (amp * 0.4);

  ctx.fillStyle = 'rgba(14, 116, 144, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-290, 142);
  for (let x = -290; x <= 290; x += 10) {
    ctx.lineTo(x, waveYAt(x, 1.4, 8, 2.0) - 8);
  }
  ctx.lineTo(290, 142);
  ctx.closePath();
  ctx.fill();

  // Floating Offshore Photovoltaic Solar Platform
  const solarY = waveYAt(-68, 0.4, 7, 2.2) - 4;
  ctx.save();
  ctx.translate(-68, solarY);
  ctx.rotate(Math.cos(-68 * 0.024 + t * 2.2) * 0.05);
  if (isSolar) {
    const sGlow = ctx.createRadialGradient(0, -4, 8, 0, -4, 62);
    sGlow.addColorStop(0, 'rgba(250, 204, 21, 0.35)');
    sGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = sGlow;
    ctx.beginPath();
    ctx.arc(0, -4, 62, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pontoon floats
  ctx.fillStyle = '#334155';
  ctx.fillRect(-44, 2, 88, 7);
  // Tilted crystalline solar panels
  ctx.fillStyle = '#1e3a8a';
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-40, 2);
  ctx.lineTo(-32, -16);
  ctx.lineTo(40, -16);
  ctx.lineTo(32, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Solar cell grid lines
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
  ctx.lineWidth = 1;
  for (let gx = -24; gx <= 24; gx += 12) {
    ctx.beginPath();
    ctx.moveTo(gx, 2);
    ctx.lineTo(gx + 8, -16);
    ctx.stroke();
  }
  ctx.restore();

  // Wave-Slope Pitching Oceanographic Sensor Buoy
  const bx = 42;
  const by = waveYAt(bx, 0.4, 9, 2.2);
  const byNext = waveYAt(bx + 6, 0.4, 9, 2.2);
  const buoyPitch = Math.atan2(byNext - by, 6);

  // Underwater sonar rings from buoy
  if (isOcean || progress > 0) {
    for (let r = 0; r < 2; r++) {
      const sp = (t * 0.7 + r * 0.5) % 1;
      ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - sp) * 0.65})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(bx, by + 16, 8 + sp * 34, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(buoyPitch);
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(-18, -8, 36, 15, 5);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(-3, -34, 6, 26);
  ctx.fillStyle = Math.sin(t * 4.5) > 0 ? '#38bdf8' : '#0284c7';
  ctx.beginPath();
  ctx.arc(0, -37, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Foreground Translucent Sea Layer + Specular Crest Line
  const seaFrontGrad = ctx.createLinearGradient(0, 36, 0, 144);
  seaFrontGrad.addColorStop(0, mood === 'senja' ? 'rgba(14, 116, 144, 0.62)' : 'rgba(2, 132, 199, 0.56)');
  seaFrontGrad.addColorStop(1, 'rgba(6, 24, 46, 0.92)');
  ctx.fillStyle = seaFrontGrad;
  ctx.beginPath();
  ctx.moveTo(-290, 144);
  for (let x = -290; x <= 290; x += 8) {
    ctx.lineTo(x, waveYAt(x, 0.4, 9, 2.2) + 6);
  }
  ctx.lineTo(290, 144);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -290; x <= 290; x += 8) {
    const wy = waveYAt(x, 0.4, 9, 2.2) + 6;
    if (x === -290) ctx.moveTo(x, wy);
    else ctx.lineTo(x, wy);
  }
  ctx.stroke();

  // Rising thermal / atmospheric vapor particles
  for (let i = 0; i < 14; i++) {
    const ph = (t * 0.38 + i / 14) % 1;
    const px = -210 + ((i * 67) % 420) + Math.sin(t * 2 + i) * 8;
    const py = 42 - ph * 165;
    ctx.fillStyle = `rgba(52, 211, 153, ${(1 - ph) * 0.72})`;
    ctx.beginPath();
    ctx.arc(px, py, 3.2 * (1 - ph * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ============================================================================
 * 4. EKONOMI: Distrik Finansial, Derek Pelabuhan Kontainer & Kurva Tren Pasar
 * ============================================================================ */
function drawEkonomi2D(
  ctx: CanvasRenderingContext2D,
  t: number,
  progress: number,
  cue: ContentSimulationCue
) {
  const isLogistics = cue.focus === 'logistics';
  const isFinance = cue.focus === 'finance';

  // Harbor concrete deck & water reflection base
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-280, 62, 560, 22);
  ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
  ctx.fillRect(-280, 84, 560, 56);

  // Financial Skyline Skyscrapers with glowing windows & crowns
  const towers = [
    { x: -195, w: 38, baseH: 78 },
    { x: -145, w: 42, baseH: 108 },
    { x: -92, w: 40, baseH: 92 },
    { x: -38, w: 46, baseH: 136 },
    { x: 18, w: 42, baseH: 120 },
    { x: 74, w: 48, baseH: 158 },
  ];

  const trendPts: [number, number][] = [];
  for (let i = 0; i < towers.length; i++) {
    const tw = towers[i];
    const dynH =
      tw.baseH * (0.78 + 0.22 * Math.min(1, progress + 0.35)) +
      Math.sin(t * 1.9 + i * 0.85) * 8;
    const topY = 62 - dynH;
    trendPts.push([tw.x, topY - 14]);

    const tGrad = ctx.createLinearGradient(0, topY, 0, 62);
    if (i >= 4 && isFinance) {
      tGrad.addColorStop(0, '#f59e0b');
      tGrad.addColorStop(1, '#78350f');
    } else {
      tGrad.addColorStop(0, '#334155');
      tGrad.addColorStop(1, '#0f172a');
    }

    ctx.fillStyle = tGrad;
    ctx.strokeStyle = i >= 4 ? 'rgba(251, 191, 36, 0.7)' : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(tw.x - tw.w / 2, topY, tw.w, dynH, [5, 5, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Tower spire & lit glass window grid
    ctx.fillStyle = i >= 4 ? '#fde047' : '#38bdf8';
    ctx.fillRect(tw.x - 1, topY - 10, 2, 10);

    ctx.fillStyle = i >= 4 ? 'rgba(254, 240, 138, 0.75)' : 'rgba(125, 211, 252, 0.45)';
    for (let wy = topY + 8; wy < 54; wy += 9) {
      for (let wx = tw.x - tw.w / 2 + 6; wx <= tw.x + tw.w / 2 - 10; wx += 9) {
        ctx.fillRect(wx, wy, 5, 4);
      }
    }
  }

  // Market Area Chart Overlay & Live Growth Pin
  const lineColor = cue.isGrowth ? '#38bdf8' : '#fb7185';
  const fillGrad = ctx.createLinearGradient(0, -135, 0, 62);
  fillGrad.addColorStop(0, cue.isGrowth ? 'rgba(56, 189, 248, 0.25)' : 'rgba(251, 113, 133, 0.25)');
  fillGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');

  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.moveTo(trendPts[0][0], 62);
  for (const [px, py] of trendPts) ctx.lineTo(px, py);
  ctx.lineTo(trendPts[trendPts.length - 1][0], 62);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = isFinance ? 3.2 : 2.4;
  ctx.beginPath();
  trendPts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Pulsing live tracker pin along trend line
  const pinIdx = Math.min(trendPts.length - 1, Math.floor(((t * 0.45 + progress) % 1) * trendPts.length));
  const [pinX, pinY] = trendPts[pinIdx];
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(pinX, pinY, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Automated Harbor Gantry Crane on the Right
  const craneX = 185;
  ctx.strokeStyle = isLogistics ? '#f59e0b' : '#d97706';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(craneX - 24, 62);
  ctx.lineTo(craneX - 16, -65);
  ctx.lineTo(craneX + 24, -65);
  ctx.lineTo(craneX + 32, 62);
  ctx.stroke();
  // Horizontal boom arm
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(craneX - 64, -70, 128, 7);

  // Hoisting trolley & dangling shipping container
  const hoistCycle = Math.sin(t * (isLogistics ? 1.5 : 0.95));
  const trolleyX = craneX - 18 + hoistCycle * 26;
  const cableLen = 58 + Math.cos(t * 1.5) * 18;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(trolleyX - 8, -63, 16, 6);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(trolleyX - 4, -57);
  ctx.lineTo(trolleyX - 4, -57 + cableLen);
  ctx.moveTo(trolleyX + 4, -57);
  ctx.lineTo(trolleyX + 4, -57 + cableLen);
  ctx.stroke();

  ctx.fillStyle = '#10b981';
  ctx.fillRect(trolleyX - 18, -57 + cableLen, 36, 16);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 1;
  ctx.strokeRect(trolleyX - 18, -57 + cableLen, 36, 16);

  // Logistics Freight Rail Shuttle gliding along bottom viaduct
  ctx.fillStyle = '#334155';
  ctx.fillRect(-260, 72, 520, 4);
  const shuttleX = Math.sin(t * (isLogistics ? 1.1 : 0.75)) * 185;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(shuttleX - 38, 66, 76, 6);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(shuttleX - 34, 52, 28, 14);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(shuttleX - 2, 52, 28, 14);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(shuttleX + 28, 55, 8, 11);
}

/* ============================================================================
 * 5. ANTARIKSA: Kelengkungan Bumi Atmosferik, Menara Peluncuran, Roket & Satelit
 * ============================================================================ */
function drawAntariksa2D(
  ctx: CanvasRenderingContext2D,
  t: number,
  progress: number,
  cue: ContentSimulationCue
) {
  const isRocket = cue.focus === 'rocket';
  const isSatellite = cue.focus === 'satellite';

  // Curved Earth Limb with Atmospheric Halo & Continents
  const earthCY = 335;
  const earthR = 255;

  const atmoGlow = ctx.createRadialGradient(0, earthCY, earthR - 6, 0, earthCY, earthR + 34);
  atmoGlow.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
  atmoGlow.addColorStop(0.6, 'rgba(14, 165, 233, 0.16)');
  atmoGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = atmoGlow;
  ctx.beginPath();
  ctx.arc(0, earthCY, earthR + 34, Math.PI * 1.12, Math.PI * 1.88);
  ctx.fill();

  const earthGrad = ctx.createLinearGradient(0, 75, 0, 160);
  earthGrad.addColorStop(0, '#0284c7');
  earthGrad.addColorStop(0.55, '#0c4a6e');
  earthGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = earthGrad;
  ctx.beginPath();
  ctx.arc(0, earthCY, earthR, Math.PI * 1.12, Math.PI * 1.88);
  ctx.fill();

  // Clip continental archipelago silhouettes & swirling clouds inside Earth limb
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, earthCY, earthR, Math.PI * 1.12, Math.PI * 1.88);
  ctx.clip();

  ctx.fillStyle = '#15803d';
  const drift = ((t * 14) % 180) - 90;
  ctx.beginPath();
  ctx.ellipse(-65 + drift * 0.4, 108, 48, 16, -0.15, 0, Math.PI * 2);
  ctx.ellipse(25 + drift * 0.4, 114, 58, 18, 0.1, 0, Math.PI * 2);
  ctx.ellipse(112 + drift * 0.4, 122, 34, 12, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Swirling orbital clouds
  ctx.fillStyle = 'rgba(241, 245, 249, 0.25)';
  ctx.beginPath();
  ctx.ellipse(-30 + drift * 0.65, 96, 66, 9, 0.05, 0, Math.PI * 2);
  ctx.ellipse(75 - drift * 0.5, 110, 52, 8, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Earth rim outline
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.72)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, earthCY, earthR, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  // Steel Launch Gantry Tower on Earth limb
  const padX = -102;
  const padY = 92;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(padX - 8, padY - 62, 16, 62);
  ctx.lineWidth = 1.2;
  for (let gy = padY - 52; gy < padY; gy += 15) {
    ctx.beginPath();
    ctx.moveTo(padX - 8, gy);
    ctx.lineTo(padX + 8, gy + 12);
    ctx.moveTo(padX + 8, gy);
    ctx.lineTo(padX - 8, gy + 12);
    ctx.stroke();
  }
  // Retracting umbilical swing arm
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(padX + 8, padY - 50, 18, 4);

  // Elliptical Satellite Orbit Track
  ctx.strokeStyle = isSatellite ? 'rgba(251, 191, 36, 0.55)' : 'rgba(245, 158, 11, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.ellipse(0, -10, 218, 78, -0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Orbiting Multi-Mission Satellite + Volumetric Scan Cone
  const satAngle = t * (isSatellite ? 0.95 : 0.65);
  const ox = Math.cos(satAngle) * 218;
  const oy = Math.sin(satAngle) * 78;
  const rot = -0.14;
  const sx = ox * Math.cos(rot) - oy * Math.sin(rot);
  const sy = -10 + ox * Math.sin(rot) + oy * Math.cos(rot);

  // Translucent Radar Scan Cone aimed at Earth
  const coneGrad = ctx.createLinearGradient(sx, sy, sx * 0.42, 92);
  coneGrad.addColorStop(0, 'rgba(56, 189, 248, 0.34)');
  coneGrad.addColorStop(1, 'rgba(56, 189, 248, 0.03)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx * 0.42 - 32, 96);
  ctx.lineTo(sx * 0.42 + 32, 96);
  ctx.closePath();
  ctx.fill();

  // Satellite body + solar wings + dish
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.sin(satAngle) * 0.2);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(-9, -9, 18, 18);
  ctx.fillStyle = '#1e3a8a';
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1;
  ctx.fillRect(-35, -5, 22, 10);
  ctx.strokeRect(-35, -5, 22, 10);
  ctx.fillRect(13, -5, 22, 10);
  ctx.strokeRect(13, -5, 22, 10);
  // Parabolic dish
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(0, 12, 6, Math.PI, 0);
  ctx.fill();
  ctx.restore();

  // Multi-Stage Launch Rocket climbing gravity-turn arc
  const rCycle = ((t * (isRocket ? 0.32 : 0.22)) + progress * 0.6) % 1;
  const rx = padX + 22 + Math.pow(rCycle, 1.35) * 145;
  const ry = padY - 12 - Math.pow(rCycle, 1.15) * 205;
  const rAngle = 0.08 + rCycle * 0.56;

  // Smoke plume trail along trajectory
  for (let s = 0; s < 6; s++) {
    const sp = Math.max(0, rCycle - s * 0.04);
    const smX = padX + 22 + Math.pow(sp, 1.35) * 145;
    const smY = padY - 12 - Math.pow(sp, 1.15) * 205;
    ctx.fillStyle = `rgba(226, 232, 240, ${(0.35 - s * 0.05) * (1 - rCycle * 0.5)})`;
    ctx.beginPath();
    ctx.arc(smX, smY + 18, 5 + s * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(rAngle);

  // Volumetric exhaust flame
  const flameLen = 28 + Math.sin(t * 28) * 6;
  const flameGrad = ctx.createLinearGradient(0, 16, 0, 16 + flameLen);
  flameGrad.addColorStop(0, '#fef08a');
  flameGrad.addColorStop(0.45, '#f97316');
  flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(-6, 16);
  ctx.lineTo(6, 16);
  ctx.lineTo(0, 16 + flameLen);
  ctx.closePath();
  ctx.fill();

  // Rocket fuselage + fairing + fins
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-6.5, 16);
  ctx.lineTo(-6.5, -14);
  ctx.quadraticCurveTo(0, -32, 6.5, -14);
  ctx.lineTo(6.5, 16);
  ctx.closePath();
  ctx.fill();

  // Accent stage stripe & fins
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-6.5, -4, 13, 4);
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(-6.5, 8);
  ctx.lineTo(-13, 18);
  ctx.lineTo(-6.5, 16);
  ctx.moveTo(6.5, 8);
  ctx.lineTo(13, 18);
  ctx.lineTo(6.5, 16);
  ctx.fill();
  ctx.restore();
}
