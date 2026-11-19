import type { AspectMode, FactChapter, FactVideoScript } from '../types/video';
import { getActiveNarrationState } from './narrationSync';

export interface VideoOverlayState {
  script: FactVideoScript;
  chapter: FactChapter;
  chapterIndex: number;
  totalChapters: number;
  chapterProgress: number; // 0..1
  overallProgress: number; // 0..1
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawBroadcastFrame(
  exportCanvas: HTMLCanvasElement,
  webglCanvas: HTMLCanvasElement,
  overlay: VideoOverlayState,
  aspect: AspectMode
) {
  const ctx = exportCanvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const W = exportCanvas.width;
  const H = exportCanvas.height;

  // 1. Draw active visual frame (3D / 2D / Foto) with cover-fit cropping
  const srcW = webglCanvas.width;
  const srcH = webglCanvas.height;
  if (srcW > 0 && srcH > 0) {
    const srcRatio = srcW / srcH;
    const dstRatio = W / H;
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (srcRatio > dstRatio) {
      sw = srcH * dstRatio;
      sx = (srcW - sw) / 2;
    } else {
      sh = srcW / dstRatio;
      sy = (srcH - sh) / 2;
    }
    ctx.drawImage(webglCanvas, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#090c12';
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Soft bottom gradient scrim for clean subtitle legibility (no floating corner balloons)
  const botScrim = ctx.createLinearGradient(0, H * 0.66, 0, H);
  botScrim.addColorStop(0, 'rgba(9, 12, 18, 0)');
  botScrim.addColorStop(0.5, 'rgba(9, 12, 18, 0.72)');
  botScrim.addColorStop(1, 'rgba(9, 12, 18, 0.92)');
  ctx.fillStyle = botScrim;
  ctx.fillRect(0, H * 0.66, W, H * 0.34);

  const pad = aspect === '16:9' ? 56 : 38;
  const { chapter, overallProgress } = overlay;
  const maxTextW = W - pad * 2;

  // 3. Synchronized spoken narration subtitle at the bottom
  const narState = getActiveNarrationState(chapter.narasi, overlay.chapterProgress);
  const spokenLine = narState.activeSentence?.text ?? chapter.narasi;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.font = `600 ${aspect === '16:9' ? 24 : 23}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const subLines = wrapTextLines(ctx, spokenLine, maxTextW).slice(0, 3);
  const subLineHeight = aspect === '16:9' ? 33 : 32;
  const subBlockH = subLines.length * subLineHeight;
  const subStartY = H - 30 - subBlockH;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  subLines.forEach((line, idx) => {
    ctx.fillText(line, W / 2, subStartY + idx * subLineHeight);
  });
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  // 4. Thin bottom timeline progress bar
  const barY = H - 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(pad, barY, maxTextW, 4);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(pad, barY, maxTextW * Math.max(0.02, Math.min(1, overallProgress)), 4);
}

export function pickSupportedVideoMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}
