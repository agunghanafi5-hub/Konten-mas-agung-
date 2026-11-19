import { ExternalLink, Film, Flame, Image as ImageIcon, Layers, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type {
  AspectMode,
  FactChapter,
  FactVideoScript,
  SceneTheme,
  TrendingResearchResult,
} from '../types/video';
import { getFallbackPhotoForTheme } from '../utils/chapterPhotos';

type DrawerTab = 'outline' | 'visual' | 'tren';

interface ScriptDrawerProps {
  open: boolean;
  onClose: () => void;
  script: FactVideoScript | null;
  activeIndex: number;
  aspectMode: AspectMode;
  onChangeAspect: (mode: AspectMode) => void;
  onSelectChapter: (idx: number) => void;
  onUpdateChapter: (idx: number, patch: Partial<FactChapter>) => void;
  onUpdateScript: (patch: Partial<FactVideoScript>) => void;
  trendsResult: TrendingResearchResult | null;
  isLoadingTrends: boolean;
  trendsError: string | null;
  onFetchTrends: () => void;
  onSelectTrendingTopic: (topicTitle: string) => void;
}

const THEME_OPTIONS: { value: SceneTheme; label: string }[] = [
  { value: 'nusantara', label: 'Nusantara' },
  { value: 'teknologi', label: 'Teknologi' },
  { value: 'sains', label: 'Sains' },
  { value: 'ekonomi', label: 'Ekonomi' },
  { value: 'antariksa', label: 'Antariksa' },
];

function formatRoleLabel(role: FactChapter['role'], idx: number): string {
  if (role === 'intro') return 'Intro (Hook)';
  if (role === 'outro') return 'Outro (Interaksi)';
  return `Fakta ${idx}`;
}

export function ScriptDrawer({
  open,
  onClose,
  script,
  activeIndex,
  aspectMode,
  onChangeAspect,
  onSelectChapter,
  onUpdateChapter,
  onUpdateScript,
  trendsResult,
  isLoadingTrends,
  trendsError,
  onFetchTrends,
  onSelectTrendingTopic,
}: ScriptDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('outline');

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full max-w-lg flex flex-col border-l border-white/10 shadow-2xl"
      style={{ backgroundColor: 'rgba(11, 15, 23, 0.97)' }}
      role="dialog"
      aria-label="Outline, Ide Visual, dan Riset Tren"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Outline, Visual & Riset Tren
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {script ? `${script.tanggalRiset} · ${script.chapters.length} Segmen` : 'Studio Produksi Video'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
          aria-label="Tutup panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 pb-2 border-b border-white/10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('outline')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'outline'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          Outline & Naskah
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('visual')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'visual'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          Ide Visual & Grafis
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('tren');
            if (!trendsResult && !isLoadingTrends) {
              onFetchTrends();
            }
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'tren'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          Topik Viral Indonesia
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {activeTab === 'outline' && script && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-amber-400">Judul & Dimensi Video</h3>
                <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
                  {(['16:9', '9:16'] as AspectMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChangeAspect(mode)}
                      className={`px-2.5 py-1 rounded text-xs font-mono-tabular transition-colors whitespace-nowrap ${
                        aspectMode === mode
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === '16:9' ? '16:9 Lanskap' : '9:16 Vertikal'}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={script.judulVideo}
                onChange={(e) => onUpdateScript({ judulVideo: e.target.value })}
                className="w-full px-3 py-2 text-sm font-semibold text-white bg-[#141a26] border border-white/10 rounded-lg focus-visible:outline-2 focus-visible:outline-amber-400"
              />
            </section>

            <section className="space-y-3.5">
              <h3 className="text-xs font-medium text-slate-400">
                Struktur Outline (Intro · Fakta Utama · Outro)
              </h3>
              <div className="space-y-3.5">
                {script.chapters.map((ch, idx) => {
                  const isActive = idx === activeIndex;
                  const roleTag = formatRoleLabel(ch.role, idx);
                  return (
                    <div
                      key={ch.id}
                      className={`p-3.5 rounded-lg border transition-colors ${
                        isActive
                          ? 'border-amber-500/60 bg-amber-500/5'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => onSelectChapter(idx)}
                          className="text-left text-xs font-medium text-amber-400 hover:underline whitespace-nowrap"
                        >
                          0{idx + 1}. {roleTag} · {ch.kategori}
                        </button>
                        <select
                          value={ch.tema3d}
                          onChange={(e) =>
                            onUpdateChapter(idx, { tema3d: e.target.value as SceneTheme })
                          }
                          aria-label={`Tema 3D segmen ${idx + 1}`}
                          className="text-xs bg-[#141a26] text-slate-200 border border-white/10 rounded px-2 py-1 focus-visible:outline-2 focus-visible:outline-amber-400"
                        >
                          {THEME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              3D: {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-2.5 flex items-start gap-2.5">
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
                          className="w-24 h-14 object-cover rounded border border-white/10 shrink-0 bg-slate-900"
                        />
                        <input
                          type="text"
                          value={ch.judul}
                          onChange={(e) => onUpdateChapter(idx, { judul: e.target.value })}
                          aria-label={`Judul segmen ${idx + 1}`}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-semibold text-white bg-[#141a26] border border-white/10 rounded focus-visible:outline-2 focus-visible:outline-amber-400"
                        />
                      </div>

                      <textarea
                        rows={3}
                        value={ch.narasi}
                        onChange={(e) => onUpdateChapter(idx, { narasi: e.target.value })}
                        aria-label={`Narasi segmen ${idx + 1}`}
                        className="w-full px-2.5 py-1.5 text-xs text-slate-200 leading-relaxed bg-[#141a26] border border-white/10 rounded resize-none focus-visible:outline-2 focus-visible:outline-amber-400"
                      />

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>
                          Sorotan: <strong className="text-slate-200">{ch.angkaUtama}</strong>{' '}
                          ({ch.labelAngka})
                        </span>
                        {ch.sumber && <span>Sumber: {ch.sumber}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Interactive Outro Callout */}
            <section className="space-y-2 pt-2 border-t border-white/10">
              <h3 className="text-xs font-medium text-amber-400">
                Pertanyaan Interaksi Penonton (Outro CTA)
              </h3>
              <input
                type="text"
                value={script.pertanyaanInteraksi}
                onChange={(e) => onUpdateScript({ pertanyaanInteraksi: e.target.value })}
                className="w-full px-3 py-2 text-xs text-slate-100 bg-[#141a26] border border-white/10 rounded-lg focus-visible:outline-2 focus-visible:outline-amber-400"
              />
            </section>

            {script.sources.length > 0 && (
              <section className="space-y-2.5 pt-2 border-t border-white/10">
                <h3 className="text-xs font-medium text-slate-400">
                  Referensi Penelusuran Web
                </h3>
                <ul className="space-y-2">
                  {script.sources.map((src, i) => (
                    <li key={`${src.uri}-${i}`}>
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 text-xs text-sky-300 hover:text-sky-200 hover:underline leading-snug"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">{src.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {activeTab === 'visual' && script && (
          <section className="space-y-4">
            <div className="p-3.5 rounded-lg border border-white/10 bg-white/[0.03] space-y-1">
              <div className="text-xs font-semibold text-amber-400">
                Panduan Produksi Visual · Format {aspectMode === '9:16' ? '9:16 (Vertikal Shorts/Reels)' : '16:9 (Lanskap YouTube)'}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {aspectMode === '9:16'
                  ? 'Tempatkan subjek utama & diorama 3D di tengah bingkai vertikal, gunakan pergantian visual setiap 3–4 detik, dan posisikan takarir besar di sepertiga bawah.'
                  : 'Manfaatkan ruang lanskap untuk menyandingkan diorama 3D dengan grafis angka di kanan atas serta B-roll dokumenter sinematik.'}
              </p>
            </div>

            {script.chapters.map((ch, idx) => (
              <div
                key={ch.id}
                className={`p-3.5 rounded-lg border space-y-2.5 ${
                  idx === activeIndex
                    ? 'border-amber-500/60 bg-amber-500/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChapter(idx)}
                  className="text-left text-xs font-semibold text-white hover:text-amber-300"
                >
                  0{idx + 1}. {formatRoleLabel(ch.role, idx)} — {ch.judul}
                </button>

                <div className="rounded-lg overflow-hidden border border-white/10 bg-slate-900">
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
                    className="w-full aspect-video object-cover"
                  />
                  <div className="px-2.5 py-1.5 text-[11px] text-slate-300 bg-[#0b1019] border-t border-white/10">
                    {ch.fotoKeterangan || ch.ideVisual.saranGambar}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Gambar / Ilustrasi: </span>
                      <span className="text-slate-200">{ch.ideVisual.saranGambar}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Film className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Klip Pendek (B-Roll): </span>
                      <span className="text-slate-200">{ch.ideVisual.klipPendek}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-400 font-medium">Grafis & Animasi: </span>
                      <span className="text-slate-200">{ch.ideVisual.grafisData}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'tren' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Riset Topik Viral & Terhangat di Indonesia
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pilih salah satu topik untuk langsung dibuatkan outline & video 3D.
                </p>
              </div>
              <button
                type="button"
                onClick={onFetchTrends}
                disabled={isLoadingTrends}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTrends ? 'animate-spin' : ''}`} />
                <span>{isLoadingTrends ? 'Meriset...' : 'Perbarui Tren'}</span>
              </button>
            </div>

            {trendsError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
                {trendsError}
              </div>
            )}

            {isLoadingTrends && (
              <div className="py-10 text-center text-xs text-slate-300">
                Menelusuri topik yang sedang ramai dibicarakan di Indonesia saat ini...
              </div>
            )}

            {!isLoadingTrends && trendsResult && (
              <div className="space-y-3">
                {trendsResult.topics.map((t, i) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-lg border border-white/10 bg-white/[0.02] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-amber-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5" />
                        <span>0{i + 1}. {t.kategori}</span>
                      </span>
                      <span className="text-slate-400 capitalize">3D: {t.tema3d}</span>
                    </div>

                    <h4 className="text-sm font-semibold text-white leading-snug">
                      {t.judulTopik}
                    </h4>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-200">Mengapa ramai:</strong> {t.alasanRamai}
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-200">Sudut fakta:</strong> {t.sudutFakta}
                    </p>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTrendingTopic(t.judulTopik);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
                      >
                        Buat Video Topik Ini
                      </button>
                    </div>
                  </div>
                ))}

                {trendsResult.sources.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <h4 className="text-xs font-medium text-slate-400">Sumber Riset Tren</h4>
                    <ul className="space-y-1.5">
                      {trendsResult.sources.map((s, idx) => (
                        <li key={`${s.uri}-${idx}`}>
                          <a
                            href={s.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 text-xs text-sky-300 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
