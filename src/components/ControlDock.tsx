import {
  Download,
  FileText,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { FormEvent } from 'react';
import type {
  AspectMode,
  CameraPreset,
  FactChapter,
  LightingMood,
} from '../types/video';

export type SimulationMode = '3D' | '2D' | 'FOTO';

interface ControlDockProps {
  simMode: SimulationMode;
  onChangeSimMode: (mode: SimulationMode) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  chapters: FactChapter[];
  activeIndex: number;
  onSelectChapter: (idx: number) => void;
  onPrev: () => void;
  onNext: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isAudioLoading: boolean;
  cameraPreset: CameraPreset;
  onChangeCamera: (preset: CameraPreset) => void;
  lightingMood: LightingMood;
  onChangeLighting: (mood: LightingMood) => void;
  aspectMode: AspectMode;
  onChangeAspect: (mode: AspectMode) => void;
  explodeAmount: number;
  onChangeExplode: (val: number) => void;
  topicInput: string;
  onChangeTopicInput: (val: string) => void;
  onGenerateTopic: (e: FormEvent) => void;
  isGenerating: boolean;
  isExporting: boolean;
  exportProgress: number;
  exportStatusText?: string;
  onExportVideo: () => void;
  onOpenScript: () => void;
}

const CAMERA_OPTIONS: { id: CameraPreset; label: string }[] = [
  { id: 'utama', label: 'Utama' },
  { id: 'sinematik', label: 'Sinematik' },
  { id: 'dekat', label: 'Dekat' },
  { id: 'atas', label: 'Atas' },
];

const LIGHTING_OPTIONS: { id: LightingMood; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'senja', label: 'Senja' },
  { id: 'malam', label: 'Malam' },
];

export function ControlDock({
  simMode,
  onChangeSimMode,
  isPlaying,
  onTogglePlay,
  chapters,
  activeIndex,
  onSelectChapter,
  onPrev,
  onNext,
  isMuted,
  onToggleMute,
  isAudioLoading,
  cameraPreset,
  onChangeCamera,
  lightingMood,
  onChangeLighting,
  aspectMode,
  onChangeAspect,
  explodeAmount,
  onChangeExplode,
  topicInput,
  onChangeTopicInput,
  onGenerateTopic,
  isGenerating,
  isExporting,
  exportProgress,
  exportStatusText,
  onExportVideo,
  onOpenScript,
}: ControlDockProps) {
  return (
    <div
      className="rounded-xl border border-white/12 shadow-xl px-4 py-3 space-y-2.5"
      style={{ backgroundColor: '#0e131d' }}
    >
      {/* Row 1: Playback, Chapter Segmented Tabs, Audio, Outline & Export */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={isExporting || chapters.length === 0}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
            aria-label="Segmen sebelumnya"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={isExporting || chapters.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Jeda</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Putar Video</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={isExporting || chapters.length === 0}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
            aria-label="Segmen berikutnya"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            disabled={isExporting}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
            aria-label={isMuted ? 'Nyalakan suara narasi' : 'Bisukan suara narasi'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
            <span className="hidden sm:inline">
              {isAudioLoading ? 'Memuat Suara...' : isMuted ? 'Bisu' : 'Suara AI'}
            </span>
          </button>
        </div>

        {/* Chapter index selector */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/10">
          {chapters.map((ch, idx) => {
            const label =
              ch.role === 'intro' ? 'Intro' : ch.role === 'outro' ? 'Outro' : `0${idx}`;
            return (
              <button
                key={ch.id}
                type="button"
                disabled={isExporting}
                onClick={() => onSelectChapter(idx)}
                className={`px-2.5 py-1 rounded text-xs font-mono-tabular transition-colors whitespace-nowrap shrink-0 ${
                  idx === activeIndex
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Right actions: Outline/Visual/Trends & Export */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onOpenScript}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-white/[0.06] hover:bg-white/12 border border-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Outline, Visual & Tren</span>
          </button>

          <button
            type="button"
            onClick={onExportVideo}
            disabled={isExporting || isGenerating || chapters.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isExporting
                ? exportStatusText || `Merekam ${Math.round(exportProgress * 100)}%`
                : 'Unduh 1 Video MP4'}
            </span>
          </button>
        </div>
      </div>

      {/* Row 2: Topic Generator + Simulation Mode (3D/2D), Camera, Lighting, Aspect & Explode */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/10">
        <form onSubmit={onGenerateTopic} className="flex items-center gap-1.5 w-full md:w-auto md:flex-1 min-w-[200px]">
          <input
            type="text"
            value={topicInput}
            onChange={(e) => onChangeTopicInput(e.target.value)}
            placeholder="Topik fakta terbaru (misal: Ekonomi Indonesia, AI, Antariksa)..."
            disabled={isGenerating || isExporting}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs text-white placeholder:text-slate-400 bg-[#151b28] border border-white/10 focus-visible:outline-2 focus-visible:outline-amber-400"
          />
          <button
            type="submit"
            disabled={isGenerating || isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Meriset...' : 'Riset Baru'}</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Simulation Mode 3D / 2D / Video Foto */}
          <div
            className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10"
            role="group"
            aria-label="Mode simulasi video"
          >
            {(['3D', '2D', 'FOTO'] as SimulationMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={isExporting}
                onClick={() => onChangeSimMode(mode)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  simMode === mode
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {mode === '3D' ? 'Simulasi 3D' : mode === '2D' ? 'Simulasi 2D' : 'Video Foto'}
              </button>
            ))}
          </div>

          {/* Camera / Motion presets (shown in 3D & Video Foto modes) */}
          {(simMode === '3D' || simMode === 'FOTO') && (
            <div className="flex flex-wrap items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
              {CAMERA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeCamera(opt.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors whitespace-nowrap shrink-0 ${
                    cameraPreset === opt.id
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Lighting mood */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
            {LIGHTING_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeLighting(opt.id)}
                className={`px-2 py-1 rounded text-xs transition-colors whitespace-nowrap shrink-0 ${
                  lightingMood === opt.id
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Aspect Ratio 16:9 / 9:16 */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
            {(['16:9', '9:16'] as AspectMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={isExporting}
                onClick={() => onChangeAspect(mode)}
                className={`px-2 py-1 rounded text-xs font-mono-tabular transition-colors whitespace-nowrap shrink-0 ${
                  aspectMode === mode
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Explode view slider (3D mode only) */}
          {simMode === '3D' && (
            <label className="hidden lg:flex items-center gap-2 text-xs text-slate-400 pl-1">
              <span className="whitespace-nowrap">Bedah 3D</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explodeAmount}
                onChange={(e) => onChangeExplode(parseFloat(e.target.value))}
                className="studio-slider w-16"
                aria-label="Bedah komponen 3D"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
