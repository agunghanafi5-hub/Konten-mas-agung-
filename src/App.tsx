import type { User } from 'firebase/auth';
import { Check, Clapperboard, CloudUpload, Copy, Download, ExternalLink, Film, FolderDown, Image as ImageIcon, Link2, LogOut, Share2, Sparkles } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock, type SimulationMode } from './components/ControlDock';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ScriptDrawer } from './components/ScriptDrawer';
import { Simulasi2DCanvas, type Simulasi2DCanvasHandle } from './components/Simulasi2DCanvas';
import { SimulasiFotoCanvas, type SimulasiFotoCanvasHandle } from './components/SimulasiFotoCanvas';
import { FactStageCanvas, type FactStageCanvasHandle } from './three/FactStageCanvas';
import type {
  AspectMode,
  CameraPreset,
  FactChapter,
  FactVideoScript,
  LightingMood,
  TrendingResearchResult,
} from './types/video';
import {
  type CachedChapterAudio,
  createVoiceMasterChain,
  fetchChapterTtsBuffer,
  renderMasterNarrationWav,
  resumeAudioContextSafely,
} from './utils/audioPlayer';
import {
  getDefaultGalleryForTheme,
  getFallbackPhotoForTheme,
  resolveChapterPhoto,
} from './utils/chapterPhotos';
import { getActiveNarrationState } from './utils/narrationSync';
import {
  drawBroadcastFrame,
  pickSupportedVideoMimeType,
  type VideoOverlayState,
} from './utils/videoExporter';
import {
  clearCachedAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout as logoutGoogleDrive,
} from './utils/googleAuth';
import {
  DriveAuthExpiredError,
  type DriveUploadedFile,
  listSavedDriveVideos,
  uploadVideoToDrive,
} from './utils/googleDrive';

const DEFAULT_TOPIC = 'Fakta terbaru Indonesia dan dunia saat ini';

const THEME_LABEL: Record<string, string> = {
  nusantara: 'Konektivitas Nusantara',
  teknologi: 'Teknologi & Komputasi AI',
  sains: 'Sains, Energi & Iklim',
  ekonomi: 'Ekonomi & Rantai Pasok',
  antariksa: 'Antariksa & Orbit',
};

export default function App() {
  const stageRef = useRef<FactStageCanvasHandle | null>(null);
  const sim2dRef = useRef<Simulasi2DCanvasHandle | null>(null);
  const simFotoRef = useRef<SimulasiFotoCanvasHandle | null>(null);

  const [script, setScript] = useState<FactVideoScript | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [topicInput, setTopicInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [chapterProgress, setChapterProgress] = useState(0);

  const [simMode, setSimMode] = useState<SimulationMode>('3D');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('utama');
  const [lightingMood, setLightingMood] = useState<LightingMood>('studio');
  const [aspectMode, setAspectMode] = useState<AspectMode>('16:9');
  const [explodeAmount, setExplodeAmount] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [lastExportUrl, setLastExportUrl] = useState<string | null>(null);
  const [lastExportDownloadUrl, setLastExportDownloadUrl] = useState<string | null>(null);
  const [lastExportSavePageUrl, setLastExportSavePageUrl] = useState<string | null>(null);
  const [lastExportBlob, setLastExportBlob] = useState<Blob | null>(null);
  const [lastExportFilename, setLastExportFilename] = useState<string>('fakta-nusantara.mp4');
  const [lastExportExt, setLastExportExt] = useState<'mp4' | 'webm'>('mp4');
  const [exportHintMsg, setExportHintMsg] = useState<string | null>(null);
  const [copiedLinkType, setCopiedLinkType] = useState<'mp4' | 'page' | 'drive' | null>(null);
  const [copiedSocialField, setCopiedSocialField] = useState<'title' | 'hook' | null>(null);
  const [hookAppliedFeedback, setHookAppliedFeedback] = useState(false);
  const exportReadyRef = useRef<HTMLDivElement | null>(null);

  // Google Drive Auth & Upload State (access token stored strictly in memory via googleAuth.ts)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(true);
  const [isDriveLoggingIn, setIsDriveLoggingIn] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState(0);
  const [driveSavedFile, setDriveSavedFile] = useState<DriveUploadedFile | null>(null);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const [driveSavedHistory, setDriveSavedHistory] = useState<DriveUploadedFile[]>([]);

  const [trendsResult, setTrendsResult] = useState<TrendingResearchResult | null>(null);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  // Audio playback & recording refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterVoiceRef = useRef<{ input: GainNode; output: AudioNode } | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeHtmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, CachedChapterAudio>>(new Map());
  const playbackSessionRef = useRef(0);
  const prefetchSessionRef = useRef(0);
  const photoSessionRef = useRef(0);
  const generatedTitlesHistoryRef = useRef<string[]>([]);

  // Export canvas compositing ref
  const lastExportPaintMsRef = useRef(0);
  const exportSessionRef = useRef<{
    active: boolean;
    canvas: HTMLCanvasElement;
    aspect: AspectMode;
    overlay: VideoOverlayState;
  } | null>(null);

  const activeChapter: FactChapter | null = script?.chapters[activeIndex] ?? null;
  const narrationState = activeChapter
    ? getActiveNarrationState(activeChapter.narasi, chapterProgress)
    : null;

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const master = createVoiceMasterChain(ctx);
      master.output.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterVoiceRef.current = master;
    }
    if (audioCtxRef.current.state === 'suspended') {
      void resumeAudioContextSafely(audioCtxRef.current);
    }
    return audioCtxRef.current;
  }, []);

  // Unlock AudioContext on first user interaction anywhere in the studio
  useEffect(() => {
    const unlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        void resumeAudioContextSafely(audioCtxRef.current);
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Initialize Firebase Auth state listener for Google Drive integration
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveToken(token);
        setNeedsDriveAuth(false);
        void listSavedDriveVideos(token)
          .then((files) => setDriveSavedHistory(files))
          .catch(() => {});
      },
      () => {
        setDriveUser(null);
        setDriveToken(null);
        setNeedsDriveAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const stopActiveAudio = useCallback(() => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      activeSourceRef.current = null;
    }
    if (activeHtmlAudioRef.current) {
      try {
        activeHtmlAudioRef.current.onended = null;
        activeHtmlAudioRef.current.pause();
        activeHtmlAudioRef.current.currentTime = 0;
      } catch {
        // Ignore
      }
      activeHtmlAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }, []);

  const aspectModeRef = useRef<AspectMode>(aspectMode);
  useEffect(() => {
    aspectModeRef.current = aspectMode;
  }, [aspectMode]);

  const enrichChapterPhotos = useCallback((chapters: FactChapter[], sessionId: number) => {
    chapters.forEach((ch) => {
      void resolveChapterPhoto(ch).then(({ imageUrl, caption, gallery }) => {
        if (photoSessionRef.current !== sessionId) return;
        setScript((prev) => {
          if (!prev) return prev;
          let changed = false;
          const updated = prev.chapters.map((item) => {
            if (item.id !== ch.id) return item;
            const sameUrl = item.fotoUrl === imageUrl;
            const sameCap = !caption || item.fotoKeterangan === caption;
            const sameGallery = (item.fotoGaleri?.length ?? 0) === gallery.length &&
              gallery.every((g, i) => item.fotoGaleri?.[i]?.url === g.url);
            if (sameUrl && sameCap && sameGallery) {
              return item;
            }
            changed = true;
            return {
              ...item,
              fotoUrl: imageUrl,
              fotoKeterangan: caption || item.fotoKeterangan,
              fotoGaleri: gallery,
            };
          });
          return changed ? { ...prev, chapters: updated } : prev;
        });
      });
    });
  }, []);

  const fetchFacts = useCallback(
    async (topic: string, aspectOverride?: AspectMode) => {
      playbackSessionRef.current += 1;
      prefetchSessionRef.current += 1;
      const currentPhotoSession = ++photoSessionRef.current;
      stopActiveAudio();
      setIsPlaying(false);
      setIsGenerating(true);
      setErrorMsg(null);
      setChapterProgress(0);
      setActiveIndex(0);
      setCopiedLinkType(null);
      setLastExportUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return null;
      });

      try {
        const res = await fetch('/api/facts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic || DEFAULT_TOPIC,
            count: 4,
            aspect: aspectOverride ?? aspectModeRef.current,
            excludeTitles: generatedTitlesHistoryRef.current.slice(-10),
            variationToken: Date.now() + Math.floor(Math.random() * 10000),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Gagal meriset fakta terbaru (${res.status})`);
        }

        const rawScript = data as FactVideoScript;
        const nextScript: FactVideoScript = {
          ...rawScript,
          chapters: rawScript.chapters.map((ch) => ({
            ...ch,
            fotoUrl: ch.fotoUrl || getFallbackPhotoForTheme(ch.tema3d),
            fotoKeterangan: ch.fotoKeterangan || ch.ideVisual?.saranGambar,
            fotoGaleri: ch.fotoGaleri ?? getDefaultGalleryForTheme(ch.tema3d, ch.ideVisual?.saranGambar),
          })),
        };
        if (nextScript.judulVideo) {
          generatedTitlesHistoryRef.current = [
            ...generatedTitlesHistoryRef.current.slice(-9),
            nextScript.judulVideo,
          ];
        }
        setScript(nextScript);
        if (nextScript.chapters[0]?.kamera) {
          setCameraPreset(nextScript.chapters[0].kamera);
        }
        enrichChapterPhotos(nextScript.chapters, currentPhotoSession);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat fakta terbaru.';
        setErrorMsg(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [stopActiveAudio, enrichChapterPhotos]
  );

  const fetchTrends = useCallback(async () => {
    setIsLoadingTrends(true);
    setTrendsError(null);
    try {
      const res = await fetch('/api/facts/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Gagal meriset tren (${res.status})`);
      }
      setTrendsResult(data as TrendingResearchResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal meriset topik viral Indonesia.';
      setTrendsError(msg);
    } finally {
      setIsLoadingTrends(false);
    }
  }, []);

  // Initial load: fetch latest Indonesian facts
  useEffect(() => {
    void fetchFacts(DEFAULT_TOPIC);
  }, [fetchFacts]);

  // Keyboard shortcut: Space toggles Play/Pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isInput) return;

      if (e.code === 'Space' && !isExporting && script) {
        e.preventDefault();
        if (!isMuted) ensureAudioContext();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExporting, isMuted, script, ensureAudioContext]);

  // Pre-fetch TTS narration buffers for all chapters sequentially so transitions never stutter
  useEffect(() => {
    if (!script || script.chapters.length === 0) return;
    const prefetchId = ++prefetchSessionRef.current;
    let cancelled = false;

    const runPrefetch = async () => {
      const ctx = ensureAudioContext();
      for (const ch of script.chapters) {
        if (cancelled || prefetchSessionRef.current !== prefetchId) return;
        const cacheKey = `${ch.id}:${ch.narasi}`;
        if (audioCacheRef.current.has(cacheKey)) continue;
        try {
          const cached = await fetchChapterTtsBuffer(ctx, ch.narasi);
          if (!cancelled && prefetchSessionRef.current === prefetchId) {
            audioCacheRef.current.set(cacheKey, cached);
          }
        } catch {
          // Handled on-demand during active playback if prefetch hits temporary error
        }
      }
    };

    void runPrefetch();
    return () => {
      cancelled = true;
    };
  }, [script, ensureAudioContext]);

  // Sync camera preset when active chapter changes
  useEffect(() => {
    if (activeChapter?.kamera) {
      setCameraPreset(activeChapter.kamera);
    }
  }, [activeChapter]);

  // Playback controller for active chapter (seamless transitions & guaranteed audible dubbing)
  const totalChaptersCount = script?.chapters.length ?? 0;
  useEffect(() => {
    if (!isPlaying || isExporting || !activeChapter || totalChaptersCount === 0) {
      stopActiveAudio();
      return;
    }

    const sessionId = ++playbackSessionRef.current;
    let rafId = 0;
    let nextTimerId = 0;
    let cancelled = false;

    const advanceNext = () => {
      if (cancelled || playbackSessionRef.current !== sessionId) return;
      if (activeIndex < totalChaptersCount - 1) {
        setActiveIndex((prev) => prev + 1);
        setChapterProgress(0);
      } else {
        setIsPlaying(false);
        setChapterProgress(1);
      }
    };

    const runTimedProgress = (durationSec: number) => {
      const start = performance.now();
      const tickProgress = () => {
        if (cancelled || playbackSessionRef.current !== sessionId) return;
        const elapsed = (performance.now() - start) / 1000;
        const pct = Math.min(1, elapsed / durationSec);
        setChapterProgress(pct);
        if (pct >= 1) {
          advanceNext();
        } else {
          rafId = requestAnimationFrame(tickProgress);
        }
      };
      rafId = requestAnimationFrame(tickProgress);
    };

    const startBrowserSpeechFallback = (text: string, fallbackDuration: number) => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'id-ID';
          utter.rate = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const idVoice = voices.find((v) => v.lang.toLowerCase().startsWith('id'));
          if (idVoice) utter.voice = idVoice;
          utter.onend = () => {
            if (!cancelled && playbackSessionRef.current === sessionId) {
              setChapterProgress(1);
              nextTimerId = window.setTimeout(advanceNext, 250);
            }
          };
          window.speechSynthesis.speak(utter);
        } catch {
          // Continue with timer
        }
      }
      runTimedProgress(fallbackDuration);
    };

    const startChapterPlayback = async () => {
      if (isMuted) {
        runTimedProgress(activeChapter.durasiDetik);
        return;
      }

      try {
        const ctx = ensureAudioContext();
        const cacheKey = `${activeChapter.id}:${activeChapter.narasi}`;
        let cached = audioCacheRef.current.get(cacheKey);
        if (!cached) {
          setIsAudioLoading(true);
          cached = await fetchChapterTtsBuffer(ctx, activeChapter.narasi);
          audioCacheRef.current.set(cacheKey, cached);
          if (cancelled || playbackSessionRef.current !== sessionId) return;
        }
        setIsAudioLoading(false);

        const isAudioRunning = await resumeAudioContextSafely(ctx);
        if (cancelled || playbackSessionRef.current !== sessionId) return;

        // Proactively warm up the next chapter while current chapter plays
        const nextCh = script?.chapters[activeIndex + 1];
        if (nextCh) {
          const nextKey = `${nextCh.id}:${nextCh.narasi}`;
          if (!audioCacheRef.current.has(nextKey)) {
            void fetchChapterTtsBuffer(ctx, nextCh.narasi)
              .then((buf) => {
                audioCacheRef.current.set(nextKey, buf);
              })
              .catch(() => {});
          }
        }

        if (isAudioRunning && masterVoiceRef.current) {
          const source = ctx.createBufferSource();
          source.buffer = cached.buffer;
          source.connect(masterVoiceRef.current.input);
          activeSourceRef.current = source;

          const durationSec = Math.max(cached.buffer.duration, 0.5);
          const startAudioTime = ctx.currentTime;

          source.onended = () => {
            if (!cancelled && playbackSessionRef.current === sessionId) {
              setChapterProgress(1);
              nextTimerId = window.setTimeout(advanceNext, 260);
            }
          };

          source.start(startAudioTime);

          const tickAudioProgress = () => {
            if (cancelled || playbackSessionRef.current !== sessionId) return;
            const elapsed = Math.max(0, ctx.currentTime - startAudioTime);
            setChapterProgress(Math.min(1, elapsed / durationSec));
            if (elapsed < durationSec) {
              rafId = requestAnimationFrame(tickAudioProgress);
            }
          };
          rafId = requestAnimationFrame(tickAudioProgress);
        } else {
          // Fallback to direct HTMLAudioElement when WebAudio is blocked by browser autoplay rules
          const audioEl = new Audio(cached.objectUrl);
          audioEl.volume = 1.0;
          activeHtmlAudioRef.current = audioEl;
          const durationSec = Math.max(cached.buffer.duration, 0.5);

          audioEl.onended = () => {
            if (!cancelled && playbackSessionRef.current === sessionId) {
              setChapterProgress(1);
              nextTimerId = window.setTimeout(advanceNext, 260);
            }
          };

          await audioEl.play();
          if (cancelled || playbackSessionRef.current !== sessionId) return;

          const tickHtmlProgress = () => {
            if (cancelled || playbackSessionRef.current !== sessionId) return;
            const elapsed = Math.max(0, audioEl.currentTime);
            setChapterProgress(Math.min(1, elapsed / durationSec));
            if (!audioEl.ended && elapsed < durationSec) {
              rafId = requestAnimationFrame(tickHtmlProgress);
            }
          };
          rafId = requestAnimationFrame(tickHtmlProgress);
        }
      } catch (err) {
        setIsAudioLoading(false);
        const msg = err instanceof Error ? err.message : 'Gagal memutar suara AI.';
        setErrorMsg(`Suara AI terkendala (${msg}). Menggunakan suara pembaca alternatif.`);
        if (!cancelled && playbackSessionRef.current === sessionId) {
          startBrowserSpeechFallback(activeChapter.narasi, activeChapter.durasiDetik);
        }
      }
    };

    void startChapterPlayback();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (nextTimerId) window.clearTimeout(nextTimerId);
      setIsAudioLoading(false);
      stopActiveAudio();
    };
  }, [
    isPlaying,
    isExporting,
    isMuted,
    activeChapter?.id,
    activeChapter?.narasi,
    activeChapter?.durasiDetik,
    activeIndex,
    totalChaptersCount,
    script,
    ensureAudioContext,
    stopActiveAudio,
  ]);

  // Real-time Simulation (3D, 2D, or Photo) + Subtitle compositing callback during Video Export
  const handleFrameDraw = useCallback((sourceCanvas: HTMLCanvasElement) => {
    const exp = exportSessionRef.current;
    if (!exp || !exp.active) return;
    drawBroadcastFrame(exp.canvas, sourceCanvas, exp.overlay, exp.aspect);
    lastExportPaintMsRef.current = performance.now();
  }, []);

  // Full 1-File Video Export Pipeline (All segments: Intro + Fakta + Outro -> 1 complete MP4)
  const handleExportVideo = useCallback(async () => {
    if (!script || script.chapters.length === 0 || isExporting) return;
    const sourceCanvas =
      simMode === '3D'
        ? stageRef.current?.getCanvas()
        : simMode === '2D'
          ? sim2dRef.current?.getCanvas()
          : simFotoRef.current?.getCanvas();
    if (!sourceCanvas) {
      setErrorMsg(`Kanvas visual ${simMode === 'FOTO' ? 'Video Foto' : `simulasi ${simMode}`} belum siap untuk direkam.`);
      return;
    }

    stopActiveAudio();
    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Menyiapkan audio...');
    setErrorMsg(null);
    setExportHintMsg(null);
    setCopiedLinkType(null);
    setDriveSavedFile(null);
    setDriveUploadError(null);
    setDriveUploadProgress(0);
    if (lastExportUrl) {
      URL.revokeObjectURL(lastExportUrl);
      setLastExportUrl(null);
    }
    setLastExportDownloadUrl(null);
    setLastExportSavePageUrl(null);
    setLastExportBlob(null);

    let keepAliveOsc: OscillatorNode | null = null;
    let keepAliveGain: GainNode | null = null;

    try {
      const ctx = ensureAudioContext();
      await resumeAudioContextSafely(ctx);

      // 1. Pre-fetch TTS audio buffers for ALL chapters so the single exported MP4 preserves full narration
      const chapterBuffers: (AudioBuffer | null)[] = [];
      let failedTtsCount = 0;
      for (let i = 0; i < script.chapters.length; i++) {
        const ch = script.chapters[i];
        setExportProgress((i / script.chapters.length) * 0.22);
        setExportStatusText(`Menyiapkan suara segmen ${i + 1}/${script.chapters.length}...`);
        const cacheKey = `${ch.id}:${ch.narasi}`;
        let cached = audioCacheRef.current.get(cacheKey);
        if (!cached) {
          try {
            cached = await fetchChapterTtsBuffer(ctx, ch.narasi);
            audioCacheRef.current.set(cacheKey, cached);
          } catch {
            failedTtsCount += 1;
            cached = undefined;
          }
        }
        chapterBuffers.push(cached?.buffer ?? null);
      }

      if (failedTtsCount === script.chapters.length) {
        throw new Error('Gagal memuat suara narasi AI untuk ekspor video. Coba beberapa saat lagi.');
      }

      // 2. Setup offscreen export canvas (16:9 HD or 9:16 Shorts)
      const exportCanvas = document.createElement('canvas');
      if (aspectMode === '16:9') {
        exportCanvas.width = 1280;
        exportCanvas.height = 720;
      } else {
        exportCanvas.width = 720;
        exportCanvas.height = 1280;
      }

      // Paint initial frame synchronously before starting MediaRecorder so frame 0 is never empty
      const initialOverlay: VideoOverlayState = {
        script,
        chapter: script.chapters[0],
        chapterIndex: 0,
        totalChapters: script.chapters.length,
        chapterProgress: 0,
        overallProgress: 0,
      };
      drawBroadcastFrame(exportCanvas, sourceCanvas, initialOverlay, aspectMode);
      lastExportPaintMsRef.current = performance.now();

      // 3. Setup MediaStream combining 30fps Video + AudioDestination with silent keepalive so MediaRecorder never stalls between chapters
      const videoStream = exportCanvas.captureStream(30);
      const audioDest = ctx.createMediaStreamDestination();
      const exportVoiceChain = createVoiceMasterChain(ctx);
      exportVoiceChain.output.connect(audioDest);

      try {
        keepAliveOsc = ctx.createOscillator();
        keepAliveGain = ctx.createGain();
        keepAliveOsc.frequency.value = 120;
        keepAliveGain.gain.value = 0.00005;
        keepAliveOsc.connect(keepAliveGain);
        keepAliveGain.connect(exportVoiceChain.input);
        keepAliveOsc.start();
      } catch {
        // Ignore if oscillator fails; video stream still records
      }

      const combinedTracks = [
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const mimeType = pickSupportedVideoMimeType();
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 2_400_000,
        audioBitsPerSecond: 192_000,
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      const recorder = new MediaRecorder(combinedStream, recorderOptions);

      const recordedChunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      const recordingDone = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => {
          reject(new Error('Perekaman MediaRecorder terhenti sebelum selesai.'));
        };
        recorder.onstop = () => {
          resolve(new Blob(recordedChunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
        };
      });

      recorder.start(250);
      const recordingStartMs = performance.now();
      const masterAudioEntries: { buffer: AudioBuffer | null; startSec: number }[] = [];

      // 4. Sequentially record every segment (Intro + Fakta + Outro) into 1 continuous video file
      const totalChapters = script.chapters.length;
      for (let i = 0; i < totalChapters; i++) {
        const ch = script.chapters[i];
        const buf = chapterBuffers[i];
        const preDelaySec = 0.15;
        const postPadSec = 0.45;
        const durationSec = buf ? Math.max(buf.duration + preDelaySec + postPadSec, 4) : ch.durasiDetik;

        setActiveIndex(i);
        setCameraPreset(ch.kamera);
        setChapterProgress(0);

        exportSessionRef.current = {
          active: true,
          canvas: exportCanvas,
          aspect: aspectMode,
          overlay: {
            script,
            chapter: ch,
            chapterIndex: i,
            totalChapters,
            chapterProgress: 0,
            overallProgress: i / totalChapters,
          },
        };

        const chapterStartInVideoSec = (performance.now() - recordingStartMs) / 1000;
        masterAudioEntries.push({
          buffer: buf,
          startSec: chapterStartInVideoSec + preDelaySec,
        });

        let audioEnded = !buf;
        let source: AudioBufferSourceNode | null = null;
        if (buf) {
          source = ctx.createBufferSource();
          source.buffer = buf;
          source.connect(exportVoiceChain.input);
          if (!isMuted && masterVoiceRef.current) {
            source.connect(masterVoiceRef.current.input);
          }
          source.onended = () => {
            audioEnded = true;
          };
          source.start(ctx.currentTime + preDelaySec);
        }

        const audioDuration = buf ? Math.max(buf.duration, 0.5) : durationSec;

        await new Promise<void>((resolve) => {
          const start = performance.now();
          let resolved = false;
          let rafId = 0;
          let intervalId = 0;

          const finishSegment = () => {
            if (resolved) return;
            resolved = true;
            cancelAnimationFrame(rafId);
            window.clearInterval(intervalId);
            resolve();
          };

          const tickSegment = () => {
            if (resolved) return;
            const now = performance.now();
            const elapsed = (now - start) / 1000;
            const spokenElapsed = Math.max(0, elapsed - preDelaySec);
            const chProg = Math.min(1, spokenElapsed / audioDuration);
            const overall = (i + Math.min(1, elapsed / durationSec)) / totalChapters;
            setChapterProgress(chProg);
            const pct = 0.22 + overall * 0.64;
            setExportProgress(pct);
            setExportStatusText(`Merekam Segmen ${i + 1}/${totalChapters} · ${Math.round(pct * 100)}%`);

            if (exportSessionRef.current) {
              exportSessionRef.current.overlay.chapterProgress = chProg;
              exportSessionRef.current.overlay.overallProgress = overall;
              // Guarantee steady 30fps compositing even if child canvas rAF or browser tab is throttled
              if (now - lastExportPaintMsRef.current >= 32) {
                drawBroadcastFrame(exportCanvas, sourceCanvas, exportSessionRef.current.overlay, aspectMode);
                lastExportPaintMsRef.current = now;
              }
            }

            if (elapsed >= durationSec && (audioEnded || elapsed >= durationSec + 1.5)) {
              finishSegment();
            }
          };

          const rafLoop = () => {
            if (resolved) return;
            tickSegment();
            if (!resolved) {
              rafId = requestAnimationFrame(rafLoop);
            }
          };

          rafId = requestAnimationFrame(rafLoop);
          // Background-tab-safe 30fps heartbeat so recording never freezes when tab loses focus
          intervalId = window.setInterval(tickSegment, 33);
        });

        if (source) {
          try {
            source.onended = null;
            source.stop();
            source.disconnect();
          } catch {
            // ignore
          }
        }
      }

      const totalRecordedSec = (performance.now() - recordingStartMs) / 1000;
      exportSessionRef.current = null;
      if (keepAliveOsc) {
        try {
          keepAliveOsc.stop();
          keepAliveOsc.disconnect();
        } catch {
          // ignore
        }
        keepAliveOsc = null;
      }
      if (keepAliveGain) {
        try {
          keepAliveGain.disconnect();
        } catch {
          // ignore
        }
        keepAliveGain = null;
      }

      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch {
          // ignore if browser does not support requestData right before stop
        }
      }
      recorder.stop();
      const recordedBlob = await recordingDone;
      if (!recordedBlob || recordedBlob.size < 1024) {
        throw new Error('Hasil rekaman video kosong. Pastikan tab browser tetap terbuka lalu coba unduh ulang.');
      }

      // 5. Render lossless master WAV narration track so MP4 voice is crystal-clear & uninterrupted
      setExportProgress(0.89);
      setExportStatusText('Memaksimalkan audio narasi...');
      let audioToken = '';
      try {
        const masterWav = await renderMasterNarrationWav(masterAudioEntries, totalRecordedSec);
        if (masterWav) {
          const uploadRes = await fetch('/api/video/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: masterWav,
          });
          if (uploadRes.ok) {
            const upData = (await uploadRes.json()) as { audioToken?: string };
            audioToken = upData.audioToken ?? '';
          }
        }
      } catch {
        // Fallback to MediaRecorder audio track if offline WAV upload fails
      }

      setExportProgress(0.91);
      setExportStatusText('Mengunggah rekaman untuk konversi MP4...');

      const rawSlug = (script.judulVideo || 'fakta-nusantara')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 36);
      const timeStamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
      const baseSlug = `${rawSlug || 'fakta-nusantara'}-${aspectMode === '9:16' ? 'reels-9x16' : 'video-16x9'}-${timeStamp}`;
      const finalFilename = `${baseSlug}.mp4`;

      const inputExt = (recordedBlob.type || '').toLowerCase().includes('mp4') ? 'mp4' : 'webm';
      let videoToken = '';
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(recordedBlob.size / CHUNK_SIZE));
      for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
        const startByte = cIdx * CHUNK_SIZE;
        const endByte = Math.min(recordedBlob.size, startByte + CHUNK_SIZE);
        const slice = recordedBlob.slice(startByte, endByte);
        if (totalChunks > 1) {
          setExportStatusText(`Mengunggah bagian ${cIdx + 1}/${totalChunks}...`);
        }
        const chunkUrl = `/api/video/upload-chunk?ext=${inputExt}${
          videoToken ? `&videoToken=${encodeURIComponent(videoToken)}` : ''
        }`;
        const chunkRes = await fetch(chunkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: slice,
        });
        if (!chunkRes.ok) {
          const errChunk = await chunkRes.json().catch(() => ({}));
          throw new Error(errChunk.error || 'Gagal mengunggah rekaman video ke server konversi MP4.');
        }
        const chunkData = (await chunkRes.json()) as { videoToken?: string };
        if (chunkData.videoToken) {
          videoToken = chunkData.videoToken;
        }
      }

      setExportProgress(0.94);
      setExportStatusText('Membuat file MP4 siap upload media sosial...');

      const convertParams = new URLSearchParams();
      if (audioToken) convertParams.set('audioToken', audioToken);
      if (videoToken) convertParams.set('videoToken', videoToken);
      convertParams.set('ext', inputExt);
      convertParams.set('filename', finalFilename);
      convertParams.set('response', 'json');

      const convertRes = await fetch(`/api/video/convert-mp4?${convertParams.toString()}`, {
        method: 'POST',
        headers: videoToken ? undefined : { 'Content-Type': 'application/octet-stream' },
        body: videoToken ? undefined : recordedBlob,
      });

      if (!convertRes.ok) {
        const errData = await convertRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal mengonversi video ke format MP4 siap upload.');
      }

      const convMeta = (await convertRes.json()) as {
        downloadId: string;
        filename: string;
        sizeBytes: number;
        downloadUrl: string;
        savePageUrl: string;
      };

      const serverDownloadUrl = convMeta.downloadUrl;
      const serverSavePageUrl = convMeta.savePageUrl;

      setExportProgress(0.97);
      setExportStatusText('Menyiapkan unduhan file MP4...');

      let mp4Blob: Blob | null = null;
      let previewOrBlobUrl = serverDownloadUrl;
      try {
        const dlRes = await fetch(serverDownloadUrl);
        if (dlRes.ok) {
          const fetched = await dlRes.blob();
          if (fetched.size > 1024) {
            mp4Blob = new Blob([fetched], { type: 'video/mp4' });
            previewOrBlobUrl = URL.createObjectURL(mp4Blob);
          }
        }
      } catch {
        // Fallback to direct server MP4 URL if blob fetch fails
      }

      setLastExportUrl(previewOrBlobUrl);
      setLastExportDownloadUrl(serverDownloadUrl);
      setLastExportSavePageUrl(serverSavePageUrl);
      setLastExportBlob(mp4Blob);
      setLastExportFilename(convMeta.filename || finalFilename);
      setLastExportExt('mp4');
      setExportProgress(1);

      // Automatically trigger MP4 file download
      const link = document.createElement('a');
      link.href = mp4Blob ? previewOrBlobUrl : serverDownloadUrl;
      link.download = convMeta.filename || finalFilename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        exportReadyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal merekam video MP4.';
      setErrorMsg(msg);
    } finally {
      if (keepAliveOsc) {
        try {
          keepAliveOsc.stop();
          keepAliveOsc.disconnect();
        } catch {
          // ignore
        }
      }
      if (keepAliveGain) {
        try {
          keepAliveGain.disconnect();
        } catch {
          // ignore
        }
      }
      exportSessionRef.current = null;
      setIsExporting(false);
      setExportProgress(0);
      setExportStatusText('');
    }
  }, [
    script,
    isExporting,
    isMuted,
    aspectMode,
    simMode,
    lastExportUrl,
    ensureAudioContext,
    stopActiveAudio,
  ]);

  const handleGenerateTopic = (e: FormEvent) => {
    e.preventDefault();
    void fetchFacts(topicInput.trim() || DEFAULT_TOPIC);
  };

  const handleUpdateChapter = (idx: number, patch: Partial<FactChapter>) => {
    setScript((prev) => {
      if (!prev) return prev;
      const next = [...prev.chapters];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, chapters: next };
    });
  };

  const handleUpdateScript = (patch: Partial<FactVideoScript>) => {
    setScript((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSelectChapter = (idx: number) => {
    if (!isMuted) ensureAudioContext();
    setActiveIndex(idx);
    setChapterProgress(0);
  };

  const handlePrev = () => {
    if (!script) return;
    if (!isMuted) ensureAudioContext();
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : script.chapters.length - 1));
    setChapterProgress(0);
  };

  const handleNext = () => {
    if (!script) return;
    if (!isMuted) ensureAudioContext();
    setActiveIndex((prev) => (prev + 1) % script.chapters.length);
    setChapterProgress(0);
  };

  const handleCreateManualScript = () => {
    const nowDate = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const defaultTitle = 'Rahasia Transformasi Indonesia 2026 yang Jarang Diketahui Publik!';
    const defaultHook =
      'Tahukah Anda ada perkembangan penting yang sedang ramai diperbincangkan hari ini? Simak simulasi dan fakta lengkapnya di bawah video ini.';
    setScript({
      topik: 'Naskah Kustom',
      judulVideo: defaultTitle,
      kalimatHook: defaultHook,
      opsiJudul: [
        defaultTitle,
        'Fakta Mengejutkan di Balik Lompatan Teknologi & Ekonomi Terbaru',
        'Wajib Tahu! Ini Data Terbaru Indonesia yang Bikin Banyak Orang Kaget',
      ],
      opsiHook: [
        defaultHook,
        'Jangan skip video ini! Angka terbaru ini mengubah cara kita melihat masa depan Indonesia.',
        'Banyak yang belum sadar, tren besar ini diam-diam sudah mulai terjadi di sekitar kita.',
      ],
      tanggalRiset: nowDate,
      dimensiDisarankan: aspectMode,
      pembuka: defaultHook,
      penutup: '',
      pertanyaanInteraksi: 'Menurut Anda, fakta mana yang paling menarik untuk dibahas lebih lanjut?',
      sources: [],
      chapters: [
        {
          id: `manual-intro-${Date.now()}`,
          index: 1,
          role: 'intro',
          kategori: 'Pembuka',
          judul: 'Fakta Terbaru yang Wajib Anda Tahu',
          ringkasan: 'Hook pembuka 3 detik pertama untuk menarik perhatian penonton.',
          narasi:
            'Tahukah Anda ada perkembangan penting yang sedang ramai diperbincangkan hari ini? Simak simulasi dan fakta lengkapnya di bawah video ini.',
          angkaUtama: '2026',
          labelAngka: 'Edisi Terbaru',
          tema3d: 'nusantara',
          kamera: 'utama',
          durasiDetik: 7,
          fotoUrl: getFallbackPhotoForTheme('nusantara'),
          fotoKeterangan: 'Foto infrastruktur & konektivitas Nusantara',
          fotoGaleri: getDefaultGalleryForTheme('nusantara', 'Foto infrastruktur & konektivitas Nusantara'),
          ideVisual: {
            saranGambar: 'Kolase visual berita utama Indonesia beresolusi tinggi.',
            klipPendek: 'Zoom-in dinamis 3 detik ke simulasi Nusantara.',
            grafisData: 'Teks pembuka besar dengan animasi tahun 2026.',
          },
        },
        {
          id: `manual-fakta-${Date.now() + 1}`,
          index: 2,
          role: 'fakta',
          kategori: 'Fakta Utama',
          judul: 'Tulis Poin Fakta Terbaru Di Sini',
          ringkasan: 'Ringkasan fakta utama untuk video simulasi Anda.',
          narasi:
            'Silakan sunting teks materi Bahasa Indonesia ini melalui panel Outline, Visual & Tren sebelum memutar atau mengunduh video.',
          angkaUtama: '01',
          labelAngka: 'Sorotan Data',
          tema3d: 'teknologi',
          kamera: 'sinematik',
          durasiDetik: 8,
          fotoUrl: getFallbackPhotoForTheme('teknologi'),
          fotoKeterangan: 'Foto pusat komputasi & infrastruktur teknologi modern',
          fotoGaleri: getDefaultGalleryForTheme('teknologi', 'Foto pusat komputasi & infrastruktur teknologi modern'),
          ideVisual: {
            saranGambar: 'Foto ilustrasi atau tangkapan layar data pendukung.',
            klipPendek: 'Klip B-roll transisi cepat 3-4 detik.',
            grafisData: 'Kartu angka sorotan di kanan atas dan keterangan teks.',
          },
        },
        {
          id: `manual-outro-${Date.now() + 2}`,
          index: 3,
          role: 'outro',
          kategori: 'Interaksi',
          judul: 'Bagaimana Pendapat Anda?',
          ringkasan: 'Ajakan diskusi di kolom komentar.',
          narasi:
            'Itulah fakta terbaru hari ini. Tulis pendapat Anda di kolom komentar dan ikuti pembaruan berikutnya.',
          angkaUtama: 'CTA',
          labelAngka: 'Diskusi Penonton',
          tema3d: 'sains',
          kamera: 'dekat',
          durasiDetik: 7,
          fotoUrl: getFallbackPhotoForTheme('sains'),
          fotoKeterangan: 'Foto riset energi terbarukan & lingkungan',
          fotoGaleri: getDefaultGalleryForTheme('sains', 'Foto riset energi terbarukan & lingkungan'),
          ideVisual: {
            saranGambar: 'Latar studio kontras dengan ikon interaksi komentar.',
            klipPendek: 'Kamera mengorbit perlahan menjauhi diorama utama.',
            grafisData: 'Tampilan pertanyaan diskusi penonton di bagian bawah.',
          },
        },
      ],
    });
    setActiveIndex(0);
    setErrorMsg(null);
    setDrawerOpen(true);
  };

  const toAbsoluteUrl = (pathOrUrl: string | null): string | null => {
    if (!pathOrUrl) return null;
    if (/^(https?:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    }
    return pathOrUrl;
  };

  const handleCopyDownloadLink = (url: string, kind: 'mp4' | 'page' | 'drive') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopiedLinkType(kind);
          window.setTimeout(() => setCopiedLinkType((prev) => (prev === kind ? null : prev)), 2500);
        })
        .catch(() => {
          setExportHintMsg('Salin URL secara manual dari kotak link di bawah ini.');
        });
    } else {
      setExportHintMsg('Salin URL secara manual dari kotak link di bawah ini.');
    }
  };

  const handleDriveSignIn = useCallback(async (): Promise<string | null> => {
    setIsDriveLoggingIn(true);
    setDriveUploadError(null);
    try {
      const result = await googleSignIn();
      setDriveUser(result.user);
      setDriveToken(result.accessToken);
      setNeedsDriveAuth(false);
      void listSavedDriveVideos(result.accessToken)
        .then((files) => setDriveSavedHistory(files))
        .catch(() => {});
      return result.accessToken;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan akun Google.';
      setDriveUploadError(msg);
      setNeedsDriveAuth(true);
      return null;
    } finally {
      setIsDriveLoggingIn(false);
    }
  }, []);

  const handleDriveLogout = useCallback(async () => {
    await logoutGoogleDrive();
    setDriveUser(null);
    setDriveToken(null);
    setNeedsDriveAuth(true);
    setDriveSavedHistory([]);
    setDriveSavedFile(null);
  }, []);

  const handleSaveVideoToDrive = useCallback(async () => {
    if (isUploadingDrive) return;
    setDriveUploadError(null);

    let activeToken = driveToken ?? (await getAccessToken());
    if (!activeToken) {
      activeToken = await handleDriveSignIn();
      if (!activeToken) return;
    }

    setIsUploadingDrive(true);
    setDriveUploadProgress(2);
    try {
      let blobToUpload = lastExportBlob;
      if (!blobToUpload && lastExportDownloadUrl) {
        const dlRes = await fetch(lastExportDownloadUrl);
        if (!dlRes.ok) {
          throw new Error('File video MP4 tidak tersedia untuk diunggah.');
        }
        blobToUpload = new Blob([await dlRes.blob()], { type: 'video/mp4' });
      }
      if (!blobToUpload || blobToUpload.size < 1024) {
        throw new Error('Silakan ekspor video MP4 terlebih dahulu sebelum menyimpan ke Google Drive.');
      }

      const uploaded = await uploadVideoToDrive(
        activeToken,
        blobToUpload,
        lastExportFilename,
        (pct) => setDriveUploadProgress(pct)
      );
      setDriveSavedFile(uploaded);
      setExportHintMsg(`Video "${uploaded.name}" berhasil disimpan ke folder Fakta Nusantara Studio di Google Drive.`);
      setDriveSavedHistory((prev) => [uploaded, ...prev.filter((item) => item.id !== uploaded.id)].slice(0, 6));
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        clearCachedAccessToken();
        setDriveToken(null);
        setNeedsDriveAuth(true);
        setDriveUploadError(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Gagal menyimpan video ke Google Drive.';
        setDriveUploadError(msg);
      }
    } finally {
      setIsUploadingDrive(false);
    }
  }, [
    isUploadingDrive,
    driveToken,
    handleDriveSignIn,
    lastExportBlob,
    lastExportDownloadUrl,
    lastExportFilename,
  ]);

  const handleCopySocialText = (text: string, field: 'title' | 'hook') => {
    if (!text.trim()) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopiedSocialField(field);
        window.setTimeout(() => setCopiedSocialField((prev) => (prev === field ? null : prev)), 2200);
      });
    }
  };

  const handleApplyHookToIntro = (hookText: string) => {
    const clean = hookText.trim();
    if (!clean || !script) return;
    setScript((prev) => {
      if (!prev) return prev;
      const nextChapters = prev.chapters.map((ch, idx) =>
        idx === 0 ? { ...ch, narasi: clean } : ch
      );
      return {
        ...prev,
        kalimatHook: clean,
        pembuka: clean,
        chapters: nextChapters,
      };
    });
    setHookAppliedFeedback(true);
    window.setTimeout(() => setHookAppliedFeedback(false), 2200);
  };

  const triggerDirectDownload = () => {
    const href = lastExportUrl ?? lastExportDownloadUrl;
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = lastExportFilename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportHintMsg(
      lastExportExt === 'mp4'
        ? `Mengunduh 1 file video utuh "${lastExportFilename}". Cek folder Downloads di laptop/HP atau Galeri.`
        : `Mengunduh video "${lastExportFilename}".`
    );
  };

  return (
    <div className="min-h-screen bg-[#090c12] text-[#f3f5f8] flex flex-col">
      {/* Top Studio Header */}
      <header className="border-b border-white/10 bg-[#0b0f18]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400 font-medium">
              <span className="whitespace-nowrap">Fakta Nusantara Studio</span>
              {script && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-300 whitespace-nowrap">{script.tanggalRiset}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono-tabular text-slate-300 whitespace-nowrap">
                    Segmen 0{activeIndex + 1} / 0{script.chapters.length}
                  </span>
                </>
              )}
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-white mt-0.5 truncate">
              {script ? script.judulVideo : 'Menyiapkan Video Simulasi Fakta Terbaru'}
            </h1>
          </div>

          {/* Quick Simulation Mode (3D / 2D / Video Foto) & Aspect Switcher */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/10"
              role="group"
              aria-label="Pilih mode video 3D, 2D, atau Video Foto Realistis"
            >
              {(['3D', '2D', 'FOTO'] as SimulationMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setSimMode(mode)}
                  className={`px-2.5 sm:px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                    simMode === mode
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {mode === '3D' ? 'Simulasi 3D' : mode === '2D' ? 'Simulasi 2D' : 'Video Foto'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/10">
              {(['16:9', '9:16'] as AspectMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setAspectMode(mode)}
                  className={`px-2.5 py-1 rounded text-xs font-mono-tabular transition-colors whitespace-nowrap ${
                    aspectMode === mode
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {needsDriveAuth || !driveToken ? (
              <GoogleSignInButton
                onClick={() => void handleDriveSignIn()}
                loading={isDriveLoggingIn}
                label="Sign in with Google"
              />
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-xs">
                <span className="text-emerald-200 font-medium max-w-[140px] truncate" title={driveUser?.email ?? 'Google Drive Terhubung'}>
                  {driveUser?.email || driveUser?.displayName || 'Drive Terhubung'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDriveLogout()}
                  title="Putuskan koneksi Google Drive"
                  className="text-slate-300 hover:text-white p-0.5 rounded"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Content Flow: Framed Video Stage + Controls + Explanatory Text Below Video */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Alert / Error / Export Ready Banners */}
        {errorMsg && !isGenerating && (
          <div
            className="px-4 py-3 rounded-xl border border-rose-500/40 flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: 'rgba(24, 12, 16, 0.95)' }}
          >
            <p className="text-xs text-rose-200 leading-snug flex-1 min-w-[200px]">{errorMsg}</p>
            <div className="flex items-center gap-2 shrink-0">
              {!script && (
                <button
                  type="button"
                  onClick={handleCreateManualScript}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 whitespace-nowrap"
                >
                  Tulis Naskah Manual
                </button>
              )}
              <button
                type="button"
                onClick={() => void fetchFacts(topicInput.trim() || DEFAULT_TOPIC)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 text-white hover:bg-rose-400 whitespace-nowrap"
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="px-2 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* 1. CLEAN FRAMED VIDEO SIMULATION STAGE (No subtitles or controls blocking the scene) */}
        <section aria-label="Pemutar video simulasi kejadian">
          <div
            className={`relative mx-auto rounded-xl border border-white/12 bg-[#06080d] overflow-hidden shadow-2xl ${
              aspectMode === '16:9'
                ? 'w-full aspect-video max-h-[540px]'
                : 'w-full max-w-[330px] sm:max-w-[360px] aspect-[9/16]'
            }`}
          >
            {/* Active Visual Engine: 3D WebGL, 2D Canvas, or Realistic Photo Documentary Canvas */}
            <div className="w-full h-full">
              {simMode === '3D' ? (
                <FactStageCanvas
                  ref={stageRef}
                  activeTheme={activeChapter?.tema3d ?? 'nusantara'}
                  cameraPreset={cameraPreset}
                  lightingMood={lightingMood}
                  explodeAmount={explodeAmount}
                  isPlaying={isPlaying || isExporting}
                  chapter={activeChapter}
                  chapterProgress={chapterProgress}
                  onFrameDraw={handleFrameDraw}
                />
              ) : simMode === '2D' ? (
                <Simulasi2DCanvas
                  ref={sim2dRef}
                  activeTheme={activeChapter?.tema3d ?? 'nusantara'}
                  lightingMood={lightingMood}
                  isPlaying={isPlaying || isExporting}
                  chapter={activeChapter}
                  chapterProgress={chapterProgress}
                  onFrameDraw={handleFrameDraw}
                />
              ) : (
                <SimulasiFotoCanvas
                  ref={simFotoRef}
                  activeTheme={activeChapter?.tema3d ?? 'nusantara'}
                  cameraPreset={cameraPreset}
                  lightingMood={lightingMood}
                  isPlaying={isPlaying || isExporting}
                  chapter={activeChapter}
                  chapterProgress={chapterProgress}
                  onFrameDraw={handleFrameDraw}
                />
              )}
            </div>

            {/* Synchronized Spoken Narration Subtitle at Bottom Inside Video Frame (Clean, Zero Balloon Callouts) */}
            {activeChapter && !isGenerating && narrationState && (
              <div
                aria-label="Teks narasi di dalam video"
                className="pointer-events-none absolute bottom-1 inset-x-0 z-10 px-4 sm:px-8 pt-10 pb-3 bg-gradient-to-t from-[#06080d]/92 via-[#06080d]/65 to-transparent"
              >
                <div className={aspectMode === '16:9' ? 'max-w-3xl mx-auto text-center' : 'text-center'}>
                  {(() => {
                    const spokenText = narrationState.activeSentence?.text ?? activeChapter.narasi;
                    const words = spokenText.split(/\s+/).filter(Boolean);
                    const isTracking = isPlaying || isExporting || chapterProgress > 0;
                    const spokenWordCount = isTracking
                      ? Math.max(1, Math.ceil(narrationState.sentenceProgress * words.length))
                      : words.length;
                    return (
                      <p
                        key={`${activeChapter.id}-${narrationState.activeIndex}`}
                        className={`font-semibold leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.98)] ${
                          aspectMode === '16:9'
                            ? 'text-xs sm:text-sm md:text-[16px]'
                            : 'text-xs sm:text-[13px]'
                        }`}
                      >
                        {words.map((word, wIdx) => (
                          <span
                            key={wIdx}
                            className={
                              !isTracking || wIdx < spokenWordCount
                                ? 'text-white'
                                : 'text-slate-300/75'
                            }
                          >
                            {word}
                            {wIdx < words.length - 1 ? ' ' : ''}
                          </span>
                        ))}
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Loading Overlay during Gemini Web Research */}
            {isGenerating && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(9, 12, 18, 0.86)' }}
              >
                <div className="max-w-sm text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-amber-400 text-sm font-semibold">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Meriset Fakta Terbaru...</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Mengumpulkan berita terkini via penelusuran web dan menyusun simulasi video Bahasa Indonesia.
                  </p>
                </div>
              </div>
            )}

            {/* Thin Progress Bar at very bottom edge of video */}
            <div className="absolute bottom-0 inset-x-0 z-20 h-1 bg-white/10">
              <div
                className="h-full bg-amber-400 transition-[width] duration-100"
                style={{ width: `${Math.round(chapterProgress * 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Active 1-File Export Progress Banner */}
        {isExporting && (
          <div className="p-3.5 rounded-xl border border-amber-500/40 bg-[#121722] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-amber-300">
                {exportStatusText || 'Sedang menggabungkan seluruh segmen menjadi 1 video MP4 utuh...'}
              </span>
              <span className="font-mono-tabular text-slate-300">
                {Math.round(exportProgress * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-150"
                style={{ width: `${Math.round(exportProgress * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Menggabungkan segmen Intro + {Math.max(1, (script?.chapters.length ?? 2) - 2)} Fakta + Outro menjadi 1 file video utuh lengkap dengan suara narasi AI.
            </p>
          </div>
        )}

        {/* Export Ready Panel positioned right above controls so mobile & desktop users see it immediately */}
        {lastExportUrl && !isExporting && (
          <div
            ref={exportReadyRef}
            className="p-4 rounded-xl border border-emerald-500/45 shadow-xl space-y-3"
            style={{ backgroundColor: 'rgba(11, 22, 18, 0.96)' }}
          >
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <video
                src={lastExportUrl}
                controls
                playsInline
                preload="metadata"
                className={`rounded-lg bg-black border border-white/15 shrink-0 ${
                  aspectMode === '9:16' ? 'w-28 aspect-[9/16]' : 'w-full sm:w-52 aspect-video'
                }`}
              />
              <div className="flex-1 space-y-2.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs sm:text-sm text-emerald-200 font-semibold">
                      File MP4 Siap Upload ke Media Sosial ({script?.chapters.length ?? 0} Segmen Utuh · {aspectMode === '9:16' ? '9:16 TikTok/Reels/Shorts' : '16:9 YouTube/FB'})
                    </div>
                    <p className="text-[11px] text-emerald-300/85 mt-0.5 leading-relaxed">
                      {exportHintMsg ??
                        'Format standar media sosial: MP4 (H.264 High · AAC Stereo 48kHz · 30fps · Faststart). Langsung siap diunggah ke TikTok, Instagram Reels, YouTube Shorts, YouTube, dan Facebook.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLastExportUrl(null);
                      setLastExportDownloadUrl(null);
                      setLastExportSavePageUrl(null);
                      setLastExportBlob(null);
                      setExportHintMsg(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white shrink-0"
                  >
                    Tutup
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerDirectDownload}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh File MP4 (Siap Upload Medsos)</span>
                  </button>

                  {needsDriveAuth || !driveToken ? (
                    <GoogleSignInButton
                      onClick={() => void handleSaveVideoToDrive()}
                      loading={isDriveLoggingIn || isUploadingDrive}
                      label="Sign in with Google · Simpan ke Drive"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={isUploadingDrive}
                      onClick={() => void handleSaveVideoToDrive()}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold bg-sky-400 text-slate-950 hover:bg-sky-300 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>
                        {isUploadingDrive
                          ? `Menyimpan ke Drive (${driveUploadProgress}%)`
                          : 'Simpan ke Google Drive'}
                      </span>
                    </button>
                  )}

                  {lastExportBlob &&
                    typeof navigator !== 'undefined' &&
                    typeof navigator.canShare === 'function' &&
                    (() => {
                      try {
                        const testFile = new File([lastExportBlob], lastExportFilename, {
                          type: lastExportExt === 'mp4' ? 'video/mp4' : 'video/webm',
                        });
                        return navigator.canShare({ files: [testFile] });
                      } catch {
                        return false;
                      }
                    })() && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!lastExportBlob) return;
                          const file = new File([lastExportBlob], lastExportFilename, {
                            type: lastExportExt === 'mp4' ? 'video/mp4' : 'video/webm',
                          });
                          void navigator
                            .share({
                              files: [file],
                              title: script?.judulVideo ?? 'Fakta Nusantara',
                            })
                            .then(() => {
                              setExportHintMsg('Video berhasil dikirim ke menu simpan/bagikan perangkat.');
                            })
                            .catch((err: unknown) => {
                              const name = err instanceof Error ? err.name : '';
                              if (name !== 'AbortError') {
                                setExportHintMsg(
                                  lastExportSavePageUrl
                                    ? 'Mode pratinjau membatasi menu bagikan. Ketuk "Buka Tab Simpan (Galeri HP)" untuk menyimpan langsung ke Galeri!'
                                    : 'Gunakan tombol "Unduh 1 Video Utuh" untuk menyimpan file ke folder Download.'
                                );
                              }
                            });
                        }}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Simpan ke Galeri HP</span>
                      </button>
                    )}

                  {lastExportDownloadUrl && !lastExportDownloadUrl.startsWith('blob:') && (
                    <a
                      href={lastExportDownloadUrl}
                      download={lastExportFilename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-400/45 hover:bg-emerald-500/30 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Unduh via Link Browser</span>
                    </a>
                  )}

                  {lastExportSavePageUrl && (
                    <a
                      href={lastExportSavePageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/40 hover:bg-sky-500/30 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka Tab Simpan (Galeri HP)</span>
                    </a>
                  )}

                  {lastExportBlob &&
                    typeof window !== 'undefined' &&
                    'showSaveFilePicker' in window && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!lastExportBlob) return;
                          const pickerFn = (
                            window as unknown as {
                              showSaveFilePicker?: (opts: {
                                suggestedName: string;
                                types: { description: string; accept: Record<string, string[]> }[];
                              }) => Promise<{
                                createWritable: () => Promise<{
                                  write: (data: Blob) => Promise<void>;
                                  close: () => Promise<void>;
                                }>;
                              }>;
                            }
                          ).showSaveFilePicker;
                          if (!pickerFn) return;
                          void pickerFn({
                            suggestedName: lastExportFilename,
                            types: [
                              {
                                description: 'Video MP4 (H.264 / AAC)',
                                accept: { 'video/mp4': ['.mp4'] },
                              },
                            ],
                          })
                            .then(async (handle) => {
                              const writable = await handle.createWritable();
                              await writable.write(lastExportBlob);
                              await writable.close();
                              setExportHintMsg('File MP4 berhasil disimpan ke folder pilihan Anda (Movies/DCIM/Laptop).');
                            })
                            .catch((err: unknown) => {
                              const name = err instanceof Error ? err.name : '';
                              if (name !== 'AbortError') {
                                const link = document.createElement('a');
                                link.href = lastExportDownloadUrl ?? lastExportUrl;
                                link.download = lastExportFilename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }
                            });
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-200 border border-white/15 hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FolderDown className="w-3.5 h-3.5" />
                        <span>Pilih Folder (Movies / DCIM)</span>
                      </button>
                    )}
                </div>

                {/* Explicit Direct & Copyable Video Download Link Backup */}
                {(() => {
                  const absoluteMp4Url = toAbsoluteUrl(lastExportDownloadUrl ?? lastExportUrl);
                  const absoluteSavePageUrl = toAbsoluteUrl(lastExportSavePageUrl);
                  const hasServerHttpLinks =
                    Boolean(lastExportDownloadUrl && !lastExportDownloadUrl.startsWith('blob:')) ||
                    Boolean(absoluteSavePageUrl);

                  return (
                    <div className="pt-2.5 mt-1 border-t border-emerald-500/25 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Link Unduhan Video Alternatif (Buka atau salin ke Chrome/Safari jika tombol di atas tidak langsung menyimpan ke Galeri)
                        </span>
                      </div>

                      {absoluteMp4Url && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#07110d] border border-emerald-500/25 rounded-lg p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-emerald-400/90 font-semibold">
                              Link File {lastExportExt.toUpperCase()} Langsung
                            </div>
                            <a
                              href={absoluteMp4Url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={lastExportFilename}
                              className="block text-xs font-mono-tabular text-sky-300 hover:text-sky-200 underline truncate"
                              title={absoluteMp4Url}
                            >
                              {absoluteMp4Url}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={absoluteMp4Url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={lastExportFilename}
                              className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 border border-emerald-400/35 whitespace-nowrap"
                            >
                              Buka Link
                            </a>
                            {hasServerHttpLinks && (
                              <button
                                type="button"
                                onClick={() => handleCopyDownloadLink(absoluteMp4Url, 'mp4')}
                                className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-white/10 text-slate-100 hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                {copiedLinkType === 'mp4' ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-300" />
                                    <span className="text-emerald-300">Tersalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Salin Link</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {absoluteSavePageUrl && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#07110d] border border-sky-500/25 rounded-lg p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-sky-300/90 font-semibold">
                              Link Halaman Simpan Galeri HP (iPhone & Android)
                            </div>
                            <a
                              href={absoluteSavePageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs font-mono-tabular text-sky-300 hover:text-sky-200 underline truncate"
                              title={absoluteSavePageUrl}
                            >
                              {absoluteSavePageUrl}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={absoluteSavePageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 border border-sky-400/35 whitespace-nowrap"
                            >
                              Buka Halaman
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopyDownloadLink(absoluteSavePageUrl, 'page')}
                              className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-white/10 text-slate-100 hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              {copiedLinkType === 'page' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-300" />
                                  <span className="text-emerald-300">Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Salin Link</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Google Drive Upload Status, Progress & Direct Drive Link */}
                {(isUploadingDrive || driveUploadError || driveSavedFile || driveSavedHistory.length > 0) && (
                  <div className="pt-2.5 mt-1 border-t border-sky-500/25 space-y-2">
                    {isUploadingDrive && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-sky-200 font-medium">
                          <span>Mengunggah video MP4 ke Google Drive (Folder: Fakta Nusantara Studio)...</span>
                          <span className="font-mono-tabular">{driveUploadProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-sky-400 transition-[width] duration-150"
                            style={{ width: `${Math.max(4, driveUploadProgress)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {driveUploadError && (
                      <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/35 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-200">
                        <span>{driveUploadError}</span>
                        <GoogleSignInButton
                          onClick={() => void handleSaveVideoToDrive()}
                          loading={isDriveLoggingIn}
                          label="Sign in with Google"
                        />
                      </div>
                    )}

                    {driveSavedFile && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#07131e] border border-sky-400/40 rounded-lg p-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold">
                            Tersimpan di Google Drive · Folder Fakta Nusantara Studio
                          </div>
                          <div className="text-xs text-white font-medium truncate">
                            {driveSavedFile.name}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {driveSavedFile.webViewLink && (
                            <a
                              href={driveSavedFile.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded text-[11px] font-bold bg-sky-400 text-slate-950 hover:bg-sky-300 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Buka di Google Drive</span>
                            </a>
                          )}
                          {driveSavedFile.webViewLink && (
                            <button
                              type="button"
                              onClick={() => handleCopyDownloadLink(driveSavedFile.webViewLink!, 'drive')}
                              className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-white/10 text-slate-100 hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              {copiedLinkType === 'drive' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-300" />
                                  <span className="text-emerald-300">Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Salin Link</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {driveSavedHistory.length > 0 && !driveSavedFile && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-300">
                          Video Tersimpan di Google Drive Anda:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {driveSavedHistory.slice(0, 3).map((item) => (
                            <a
                              key={item.id}
                              href={item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-sky-200 inline-flex items-center gap-1 max-w-[230px]"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{item.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. STUDIO CONTROLS BAR (Cleanly positioned beneath the video, never blocking visuals) */}
        <ControlDock
          simMode={simMode}
          onChangeSimMode={setSimMode}
          isPlaying={isPlaying}
          onTogglePlay={() => {
            if (!isMuted) {
              const ctx = ensureAudioContext();
              void resumeAudioContextSafely(ctx);
            }
            setIsPlaying((prev) => !prev);
          }}
          chapters={script?.chapters ?? []}
          activeIndex={activeIndex}
          onSelectChapter={handleSelectChapter}
          onPrev={handlePrev}
          onNext={handleNext}
          isMuted={isMuted}
          onToggleMute={() => {
            setIsMuted((prev) => {
              if (prev) {
                const ctx = ensureAudioContext();
                void resumeAudioContextSafely(ctx);
              }
              return !prev;
            });
          }}
          isAudioLoading={isAudioLoading}
          cameraPreset={cameraPreset}
          onChangeCamera={setCameraPreset}
          lightingMood={lightingMood}
          onChangeLighting={setLightingMood}
          aspectMode={aspectMode}
          onChangeAspect={setAspectMode}
          explodeAmount={explodeAmount}
          onChangeExplode={setExplodeAmount}
          topicInput={topicInput}
          onChangeTopicInput={setTopicInput}
          onGenerateTopic={handleGenerateTopic}
          isGenerating={isGenerating}
          isExporting={isExporting}
          exportProgress={exportProgress}
          exportStatusText={exportStatusText}
          onExportVideo={() => void handleExportVideo()}
          onOpenScript={() => setDrawerOpen(true)}
        />

        {/* 2B. SOCIAL MEDIA HOOK & TITLE COLUMNS (Dedicated Copywriting Columns for Viral Social Posts) */}
        {script && !isGenerating && (
          <section
            aria-label="Kolom kalimat Hook dan judul video media sosial"
            className="rounded-xl border border-white/12 bg-[#0e131d] p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-amber-400">
                Judul Video & Kalimat Hook Media Sosial (TikTok · Reels · Shorts · YouTube)
              </div>
              <span className="text-[11px] text-slate-400">
                Sunting atau pilih rekomendasi untuk langsung memancing perhatian penonton
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Column 1: Viral Social Media Video Title */}
              <div className="rounded-lg bg-[#141b29] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="social-title-input"
                    className="text-xs font-semibold text-white"
                  >
                    Judul Video Media Sosial
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopySocialText(script.judulVideo, 'title')}
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 text-slate-200 hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    {copiedSocialField === 'title' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-300" />
                        <span className="text-emerald-300">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Salin Judul</span>
                      </>
                    )}
                  </button>
                </div>

                <input
                  id="social-title-input"
                  type="text"
                  value={script.judulVideo}
                  onChange={(e) => handleUpdateScript({ judulVideo: e.target.value })}
                  placeholder="Tulis judul video yang memancing rasa ingin tahu..."
                  className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#0b1019] border border-white/15 focus-visible:outline-2 focus-visible:outline-amber-400"
                />

                {script.opsiJudul && script.opsiJudul.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-slate-400">Pilihan Judul Pemancing Klik:</div>
                    <div className="flex flex-col gap-1.5">
                      {script.opsiJudul.map((opsi, idx) => {
                        const isSelected = opsi === script.judulVideo;
                        return (
                          <button
                            key={`judul-opsi-${idx}`}
                            type="button"
                            onClick={() => handleUpdateScript({ judulVideo: opsi })}
                            className={`text-left px-2.5 py-1.5 rounded-md text-xs leading-snug border transition-colors ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium'
                                : 'bg-[#0b1019]/70 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                            }`}
                          >
                            {opsi}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: 3-Second Social Media Hook */}
              <div className="rounded-lg bg-[#141b29] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="social-hook-input"
                    className="text-xs font-semibold text-white"
                  >
                    Kalimat Hook (Pemancing 3 Detik Pertama)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopySocialText(
                          script.kalimatHook ?? script.pembuka ?? script.chapters[0]?.narasi ?? '',
                          'hook'
                        )
                      }
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 text-slate-200 hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {copiedSocialField === 'hook' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-300" />
                          <span className="text-emerald-300">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin Hook</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleApplyHookToIntro(
                          script.kalimatHook ?? script.pembuka ?? script.chapters[0]?.narasi ?? ''
                        )
                      }
                      className="px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 whitespace-nowrap"
                    >
                      {hookAppliedFeedback ? 'Diterapkan!' : 'Pakai di Intro Video'}
                    </button>
                  </div>
                </div>

                <textarea
                  id="social-hook-input"
                  rows={2}
                  value={script.kalimatHook ?? script.pembuka ?? script.chapters[0]?.narasi ?? ''}
                  onChange={(e) => handleUpdateScript({ kalimatHook: e.target.value })}
                  placeholder="Tulis kalimat pembuka 3 detik pertama agar penonton tidak scroll..."
                  className="w-full px-3 py-2 rounded-lg text-xs sm:text-sm text-slate-100 leading-relaxed bg-[#0b1019] border border-white/15 resize-none focus-visible:outline-2 focus-visible:outline-amber-400"
                />

                {script.opsiHook && script.opsiHook.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-slate-400">Pilihan Kalimat Hook Pembuka:</div>
                    <div className="flex flex-col gap-1.5">
                      {script.opsiHook.map((opsi, idx) => {
                        const currentHook =
                          script.kalimatHook ?? script.pembuka ?? script.chapters[0]?.narasi ?? '';
                        const isSelected = opsi === currentHook;
                        return (
                          <button
                            key={`hook-opsi-${idx}`}
                            type="button"
                            onClick={() => handleUpdateScript({ kalimatHook: opsi })}
                            className={`text-left px-2.5 py-1.5 rounded-md text-xs leading-snug border transition-colors ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-400/60 text-amber-200 font-medium'
                                : 'bg-[#0b1019]/70 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                            }`}
                          >
                            {opsi}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. EXPLANATORY MATERIAL TEXT BELOW VIDEO (Dedicated, clear reading panel) */}
        {activeChapter && (
          <section
            aria-label="Teks materi penjelasan di bawah video"
            className="rounded-xl border border-white/12 bg-[#0e131d] p-5 sm:p-6 space-y-4"
          >
            {/* Segment Metadata Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400 font-medium">
                <span className="font-semibold">
                  {activeChapter.role === 'intro'
                    ? 'Intro (Hook)'
                    : activeChapter.role === 'outro'
                      ? 'Outro (Ajakan Interaksi)'
                      : `Fakta Utama 0${activeIndex}`}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-300">{activeChapter.kategori}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Visualisasi:{' '}
                  {simMode === 'FOTO' ? 'Video Foto Realistis' : `Simulasi ${simMode}`} (
                  {THEME_LABEL[activeChapter.tema3d] ?? activeChapter.tema3d})
                </span>
                {activeChapter.sumber && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-300">Sumber: {activeChapter.sumber}</span>
                  </>
                )}
              </div>

              {script?.sources[0] && (
                <a
                  href={script.sources[0].uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline whitespace-nowrap"
                >
                  <span>Verifikasi Sumber</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* Main Heading, Core Takeaway & Full Narration Material */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-8 space-y-3">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-snug">
                  {activeChapter.judul}
                </h2>

                {activeChapter.ringkasan && (
                  <p className="text-sm sm:text-base font-medium text-amber-300 leading-relaxed bg-amber-500/10 border-l-2 border-amber-400 px-3.5 py-2 rounded-r-lg">
                    Inti Materi: {activeChapter.ringkasan}
                  </p>
                )}

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Materi Narasi Lengkap
                  </div>
                  <p className="text-base sm:text-[17px] text-slate-200 leading-relaxed">
                    {narrationState && narrationState.sentences.length > 0
                      ? narrationState.sentences.map((sent, sIdx) => {
                          const isCurrent =
                            (isPlaying || isExporting || chapterProgress > 0) &&
                            sIdx === narrationState.activeIndex;
                          return (
                            <span
                              key={sent.index}
                              className={
                                isCurrent
                                  ? 'text-amber-300 font-medium underline decoration-amber-400/50 underline-offset-4'
                                  : 'text-slate-200'
                              }
                            >
                              {sent.text}
                              {sIdx < narrationState.sentences.length - 1 ? ' ' : ''}
                            </span>
                          );
                        })
                      : activeChapter.narasi}
                  </p>
                </div>

                {activeChapter.role === 'outro' && script?.pertanyaanInteraksi && (
                  <div className="p-3.5 rounded-lg bg-sky-500/10 border border-sky-400/25">
                    <div className="text-xs font-semibold text-sky-300 mb-1">
                      Pertanyaan Interaksi Penonton
                    </div>
                    <p className="text-sm text-white leading-relaxed">
                      {script.pertanyaanInteraksi}
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Realistic Documentary Illustration Photo + Visual Guidance */}
              <div className="lg:col-span-4 rounded-lg bg-[#141b29] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">Foto Ilustrasi & Visual Segmen</span>
                  <span className="font-mono-tabular text-[11px] text-amber-400">
                    {activeChapter.angkaUtama} ({activeChapter.labelAngka})
                  </span>
                </div>

                {/* Realistic Segment Illustration Photo */}
                <figure className="rounded-lg overflow-hidden border border-white/12 bg-[#0b1019]">
                  <img
                    src={activeChapter.fotoUrl || getFallbackPhotoForTheme(activeChapter.tema3d)}
                    alt={activeChapter.judul}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fallback = getFallbackPhotoForTheme(activeChapter.tema3d);
                      if (e.currentTarget.getAttribute('src') !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                    className="w-full aspect-video object-cover"
                  />
                  <figcaption className="px-2.5 py-1.5 text-[11px] text-slate-300 leading-snug border-t border-white/10">
                    {activeChapter.fotoKeterangan || activeChapter.ideVisual?.saranGambar || activeChapter.judul}
                  </figcaption>
                </figure>

                {/* Curated Photo Sequence Strip for Video Foto Mode */}
                {activeChapter.fotoGaleri && activeChapter.fotoGaleri.length > 1 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>Rangkaian Foto Video ({activeChapter.fotoGaleri.length} Foto)</span>
                      {simMode !== 'FOTO' && (
                        <button
                          type="button"
                          onClick={() => setSimMode('FOTO')}
                          className="text-amber-400 hover:text-amber-300 font-medium hover:underline"
                        >
                          Putar di Video Foto
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {activeChapter.fotoGaleri.map((photoItem, pIdx) => {
                        const isPrimary = (activeChapter.fotoUrl || getFallbackPhotoForTheme(activeChapter.tema3d)) === photoItem.url;
                        return (
                          <button
                            key={`${photoItem.url}-${pIdx}`}
                            type="button"
                            onClick={() =>
                              handleUpdateChapter(activeIndex, {
                                fotoUrl: photoItem.url,
                                fotoKeterangan: photoItem.caption || activeChapter.fotoKeterangan,
                              })
                            }
                            title={photoItem.caption || `Pilih foto ${pIdx + 1}`}
                            className={`rounded overflow-hidden border aspect-video bg-slate-900 transition-all ${
                              isPrimary
                                ? 'border-amber-400 ring-1 ring-amber-400/60'
                                : 'border-white/15 hover:border-white/40 opacity-80 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={photoItem.url}
                              alt={photoItem.caption || `Foto ${pIdx + 1}`}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const fallback = getFallbackPhotoForTheme(activeChapter.tema3d);
                                if (e.currentTarget.getAttribute('src') !== fallback) {
                                  e.currentTarget.src = fallback;
                                }
                              }}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeChapter.ideVisual ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-amber-300 font-medium">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Saran Gambar</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        {activeChapter.ideVisual.saranGambar}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-sky-300 font-medium">
                        <Film className="w-3.5 h-3.5" />
                        <span>Klip Pendek</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        {activeChapter.ideVisual.klipPendek}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                        <Clapperboard className="w-3.5 h-3.5" />
                        <span>Grafis Data</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        {activeChapter.ideVisual.grafisData}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Simulasi kejadian menampilkan visualisasi dinamis sesuai tema {activeChapter.tema3d}.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Segment Strip at bottom of text card for effortless reading navigation */}
            {script && script.chapters.length > 1 && (
              <div className="pt-3 border-t border-white/10">
                <div className="text-xs font-medium text-slate-400 mb-2">
                  Daftar Materi Video ({script.chapters.length} Segmen):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {script.chapters.map((ch, idx) => {
                    const isActive = idx === activeIndex;
                    const tag =
                      ch.role === 'intro' ? 'Intro' : ch.role === 'outro' ? 'Outro' : `Fakta 0${idx}`;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        disabled={isExporting}
                        onClick={() => handleSelectChapter(idx)}
                        className={`text-left p-2.5 rounded-lg border transition-colors flex items-center gap-2.5 ${
                          isActive
                            ? 'bg-amber-500/12 border-amber-400/50 text-white'
                            : 'bg-white/[0.02] border-white/8 text-slate-300 hover:bg-white/[0.06]'
                        }`}
                      >
                        <img
                          src={ch.fotoUrl || getFallbackPhotoForTheme(ch.tema3d)}
                          alt={ch.judul}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const fallback = getFallbackPhotoForTheme(ch.tema3d);
                            if (e.currentTarget.getAttribute('src') !== fallback) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                          className="w-16 h-11 object-cover rounded border border-white/10 shrink-0 bg-slate-900"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                            <span className={isActive ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                              {tag} · {ch.kategori}
                            </span>
                            <span className="text-slate-400">{ch.angkaUtama}</span>
                          </div>
                          <div className="text-xs font-semibold mt-0.5 line-clamp-1">
                            {ch.judul}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Optional Outline, Visual Ideas & Viral Trends Drawer */}
      <ScriptDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        script={script}
        activeIndex={activeIndex}
        aspectMode={aspectMode}
        onChangeAspect={setAspectMode}
        onSelectChapter={handleSelectChapter}
        onUpdateChapter={handleUpdateChapter}
        onUpdateScript={handleUpdateScript}
        trendsResult={trendsResult}
        isLoadingTrends={isLoadingTrends}
        trendsError={trendsError}
        onFetchTrends={() => void fetchTrends()}
        onSelectTrendingTopic={(topicTitle) => {
          setTopicInput(topicTitle);
          void fetchFacts(topicTitle);
        }}
      />

      <OfflineIndicator />
    </div>
  );
}
