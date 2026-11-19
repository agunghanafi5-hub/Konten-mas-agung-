import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { CameraPreset, ChapterPhotoItem, FactChapter, LightingMood, SceneTheme } from '../types/video';
import {
  getCanvasPhotoExact,
  getDefaultGalleryForTheme,
  getSafeCanvasPhoto,
} from '../utils/chapterPhotos';

export interface SimulasiFotoCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
}

export interface SimulasiFotoCanvasProps {
  activeTheme: SceneTheme;
  cameraPreset: CameraPreset;
  lightingMood: LightingMood;
  isPlaying: boolean;
  chapter?: FactChapter | null;
  chapterProgress?: number;
  onFrameDraw?: (canvas: HTMLCanvasElement) => void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function drawCoverKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  localProgress: number,
  slideIdx: number,
  cameraPreset: CameraPreset,
  alpha: number
) {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0 || alpha <= 0.005) return;

  const p = Math.max(0, Math.min(1, localProgress));
  const dir = slideIdx % 2 === 0 ? 1 : -1;

  let zoom = 1.06 + p * 0.1;
  let panFactorX = dir * (p - 0.5) * 0.55;
  let panFactorY = (p - 0.5) * 0.25;

  if (cameraPreset === 'sinematik') {
    zoom = 1.12 + p * 0.06;
    panFactorX = dir * (p - 0.5) * 0.85;
    panFactorY = 0;
  } else if (cameraPreset === 'dekat') {
    zoom = 1.12 + p * 0.15;
    panFactorX = dir * (p - 0.5) * 0.35;
    panFactorY = (p - 0.5) * 0.2;
  } else if (cameraPreset === 'atas') {
    zoom = 1.1 + p * 0.08;
    panFactorX = 0;
    panFactorY = dir * (p - 0.5) * 0.78;
  }

  const imgRatio = img.naturalWidth / img.naturalHeight;
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

  const maxOffsetX = Math.max(0, (drawW - W) * 0.5);
  const maxOffsetY = Math.max(0, (drawH - H) * 0.5);
  const dx = (W - drawW) / 2 + panFactorX * maxOffsetX;
  const dy = (H - drawH) / 2 + panFactorY * maxOffsetY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

export const SimulasiFotoCanvas = forwardRef<SimulasiFotoCanvasHandle, SimulasiFotoCanvasProps>(
  function SimulasiFotoCanvas(
    {
      activeTheme,
      cameraPreset,
      lightingMood,
      isPlaying,
      chapter = null,
      chapterProgress = 0,
      onFrameDraw,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const gallery = useMemo<ChapterPhotoItem[]>(() => {
      const items: ChapterPhotoItem[] = [];
      const seen = new Set<string>();
      const pushUnique = (url?: string, caption?: string) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        items.push({ url, caption });
      };

      pushUnique(chapter?.fotoUrl, chapter?.fotoKeterangan || chapter?.ideVisual?.saranGambar);
      if (chapter?.fotoGaleri) {
        for (const item of chapter.fotoGaleri) {
          pushUnique(item.url, item.caption);
        }
      }
      const defaults = getDefaultGalleryForTheme(activeTheme, chapter?.ideVisual?.saranGambar);
      for (const item of defaults) {
        if (items.length >= 3) break;
        pushUnique(item.url, item.caption);
      }
      return items;
    }, [chapter?.fotoUrl, chapter?.fotoKeterangan, chapter?.fotoGaleri, chapter?.ideVisual?.saranGambar, activeTheme]);

    // Preload all gallery images cleanly on same-origin
    useEffect(() => {
      for (const item of gallery) {
        getCanvasPhotoExact(item.url);
      }
      getSafeCanvasPhoto(chapter?.fotoUrl, activeTheme);
    }, [gallery, chapter?.fotoUrl, activeTheme]);

    const stateRef = useRef({
      activeTheme,
      cameraPreset,
      lightingMood,
      isPlaying,
      chapter,
      chapterProgress,
      gallery,
      onFrameDraw,
    });

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
    }));

    useEffect(() => {
      stateRef.current = {
        activeTheme,
        cameraPreset,
        lightingMood,
        isPlaying,
        chapter,
        chapterProgress,
        gallery,
        onFrameDraw,
      };
    }, [activeTheme, cameraPreset, lightingMood, isPlaying, chapter, chapterProgress, gallery, onFrameDraw]);

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
      let idleTime = 0;

      const draw = () => {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const st = stateRef.current;
        idleTime += dt * (st.isPlaying ? 0.14 : 0.05);

        const W = canvas.width;
        const H = canvas.height;

        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, W, H);

        // Collect loaded same-origin photos from gallery (guarantees zero blank frames)
        const loadedImages: HTMLImageElement[] = [];
        for (const item of st.gallery) {
          const img = getCanvasPhotoExact(item.url);
          if (img && img.naturalWidth > 0) {
            loadedImages.push(img);
          }
        }
        if (loadedImages.length === 0) {
          const fallbackImg = getSafeCanvasPhoto(st.chapter?.fotoUrl, st.activeTheme);
          if (fallbackImg && fallbackImg.naturalWidth > 0) {
            loadedImages.push(fallbackImg);
          }
        }

        const totalSlides = Math.max(1, loadedImages.length);
        const effectiveProgress =
          st.isPlaying || st.chapterProgress > 0
            ? Math.max(0, Math.min(0.9999, st.chapterProgress))
            : idleTime % 1;

        const scaledPos = effectiveProgress * totalSlides;
        const idxA = Math.min(totalSlides - 1, Math.floor(scaledPos));
        const localProg = scaledPos - idxA;
        const idxB = (idxA + 1) % totalSlides;

        if (loadedImages.length > 0) {
          const imgA = loadedImages[idxA];
          drawCoverKenBurns(ctx, imgA, W, H, localProg, idxA, st.cameraPreset, 1);

          // Crossfade smoothly near the end of each photo slot when multiple curated photos exist
          if (loadedImages.length > 1 && localProg > 0.78) {
            const blend = smoothstep(0.78, 1.0, localProg);
            const imgB = loadedImages[idxB];
            drawCoverKenBurns(ctx, imgB, W, H, 0, idxB, st.cameraPreset, blend);
          }
        }

        // Atmospheric color grading & soft editorial light polish per lightingMood
        ctx.save();
        if (st.lightingMood === 'senja') {
          const warmGrad = ctx.createRadialGradient(W * 0.78, H * 0.25, 20, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
          warmGrad.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
          warmGrad.addColorStop(1, 'rgba(20, 10, 18, 0.28)');
          ctx.fillStyle = warmGrad;
          ctx.fillRect(0, 0, W, H);
        } else if (st.lightingMood === 'malam') {
          const nightGrad = ctx.createLinearGradient(0, 0, 0, H);
          nightGrad.addColorStop(0, 'rgba(4, 10, 26, 0.42)');
          nightGrad.addColorStop(0.5, 'rgba(8, 18, 42, 0.24)');
          nightGrad.addColorStop(1, 'rgba(3, 6, 14, 0.55)');
          ctx.fillStyle = nightGrad;
          ctx.fillRect(0, 0, W, H);
        } else {
          // Subtle studio broadcast depth vignette (keeps bright documentary photos vivid in center)
          const radVig = ctx.createRadialGradient(
            W * 0.5,
            H * 0.48,
            Math.min(W, H) * 0.25,
            W * 0.5,
            H * 0.5,
            Math.max(W, H) * 0.72
          );
          radVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
          radVig.addColorStop(1, 'rgba(4, 7, 13, 0.45)');
          ctx.fillStyle = radVig;
          ctx.fillRect(0, 0, W, H);
        }

        // Crisp top & bottom dark scrims for editorial readability
        const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.22);
        topScrim.addColorStop(0, 'rgba(6, 9, 15, 0.72)');
        topScrim.addColorStop(1, 'rgba(6, 9, 15, 0)');
        ctx.fillStyle = topScrim;
        ctx.fillRect(0, 0, W, H * 0.22);

        const botScrim = ctx.createLinearGradient(0, H * 0.58, 0, H);
        botScrim.addColorStop(0, 'rgba(6, 9, 15, 0)');
        botScrim.addColorStop(1, 'rgba(6, 9, 15, 0.84)');
        ctx.fillStyle = botScrim;
        ctx.fillRect(0, H * 0.58, W, H * 0.42);

        // Subtle documentary reel slide progress bars at top-center (non-intrusive)
        if (loadedImages.length > 1) {
          const barTotalW = Math.min(180, W * 0.22);
          const gap = 6;
          const barW = (barTotalW - gap * (loadedImages.length - 1)) / loadedImages.length;
          const startX = (W - barTotalW) / 2;
          const barY = Math.max(12, Math.round(H * 0.025));

          for (let i = 0; i < loadedImages.length; i++) {
            const x = startX + i * (barW + gap);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.beginPath();
            ctx.roundRect(x, barY, barW, 3, 2);
            ctx.fill();

            const fillPct = i < idxA ? 1 : i === idxA ? localProg : 0;
            if (fillPct > 0) {
              ctx.fillStyle = '#fbbf24';
              ctx.beginPath();
              ctx.roundRect(x, barY, Math.max(3, barW * fillPct), 3, 2);
              ctx.fill();
            }
          }
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
