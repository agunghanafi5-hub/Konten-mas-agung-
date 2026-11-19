export interface CachedChapterAudio {
  buffer: AudioBuffer;
  base64: string;
  objectUrl: string;
}

const inFlightRequests = new Map<string, Promise<CachedChapterAudio>>();

export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeWavBase64(
  ctx: AudioContext,
  base64: string
): Promise<{ buffer: AudioBuffer; objectUrl: string }> {
  const bytes = base64ToUint8Array(base64);
  const wavBlob = new Blob([bytes], { type: 'audio/wav' });
  const objectUrl = URL.createObjectURL(wavBlob);
  // Copy buffer because decodeAudioData detaches the ArrayBuffer
  const copyForDecode = bytes.buffer.slice(0);
  const buffer = await ctx.decodeAudioData(copyForDecode);
  return { buffer, objectUrl };
}

export async function fetchChapterTtsBuffer(
  ctx: AudioContext,
  text: string,
  voiceName = 'Kore'
): Promise<CachedChapterAudio> {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const inflightKey = `${voiceName}:${normalized}`;
  const existing = inFlightRequests.get(inflightKey);
  if (existing) return existing;

  const task = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/tts/narrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: normalized, voiceName }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message = err.error || `Gagal membuat audio narasi (${res.status})`;
          if (res.status >= 500 || res.status === 429) {
            lastErr = new Error(message);
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 800));
              continue;
            }
          }
          throw new Error(message);
        }

        const data = (await res.json()) as { audioBase64?: string };
        if (!data.audioBase64) {
          throw new Error('Server tidak mengembalikan data audio.');
        }

        const { buffer, objectUrl } = await decodeWavBase64(ctx, data.audioBase64);
        return { buffer, base64: data.audioBase64, objectUrl };
      } catch (err) {
        lastErr = err;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Gagal memuat suara narasi.');
  })();

  inFlightRequests.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inFlightRequests.delete(inflightKey);
  }
}

/**
 * Ensures an AudioContext is unlocked and running (must be awaited before scheduling audio).
 */
export async function resumeAudioContextSafely(ctx: AudioContext): Promise<boolean> {
  const isRunning = () => (ctx.state as string) === 'running';
  if (isRunning()) return true;
  if ((ctx.state as string) === 'closed') return false;
  try {
    await ctx.resume();
    if (isRunning()) return true;
    // Play a tiny silent buffer to unlock iOS/Safari/Chrome AudioContext
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
    await ctx.resume();
    return isRunning();
  } catch {
    return false;
  }
}

/**
 * Creates a broadcast vocal processing chain (gain boost + soft limiter)
 * so narrator dubbing sounds clear, full, and consistent without clipping.
 */
export function createVoiceMasterChain(ctx: BaseAudioContext): {
  input: GainNode;
  output: AudioNode;
} {
  const input = ctx.createGain();
  input.gain.value = 1.25;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  input.connect(compressor);
  return { input, output: compressor };
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);

  // Normalize peak to -1 dBFS (~0.89) if audio is non-silent
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const scale = maxAbs > 0.01 ? Math.min(2.2, 0.89 / maxAbs) : 1;

  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * scale));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Renders a sample-accurate lossless WAV master narration track for MP4 export
 * using OfflineAudioContext so narrator audio is never dropped or clipped by MediaRecorder.
 */
export async function renderMasterNarrationWav(
  entries: { buffer: AudioBuffer | null; startSec: number }[],
  totalDurationSec: number
): Promise<Blob | null> {
  const hasAnyAudio = entries.some((e) => e.buffer !== null);
  if (!hasAnyAudio || totalDurationSec <= 0) return null;

  const sampleRate = 48000;
  const totalSamples = Math.max(sampleRate, Math.ceil(totalDurationSec * sampleRate));
  const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
  const { input, output } = createVoiceMasterChain(offlineCtx);
  output.connect(offlineCtx.destination);

  for (const entry of entries) {
    if (!entry.buffer) continue;
    const src = offlineCtx.createBufferSource();
    src.buffer = entry.buffer;
    src.connect(input);
    src.start(Math.max(0, entry.startSec));
  }

  const rendered = await offlineCtx.startRendering();
  return encodeAudioBufferToWav(rendered);
}
