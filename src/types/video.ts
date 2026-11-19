export type SceneTheme = 'nusantara' | 'teknologi' | 'sains' | 'ekonomi' | 'antariksa';

export type CameraPreset = 'utama' | 'sinematik' | 'dekat' | 'atas';

export type AspectMode = '16:9' | '9:16';

export type LightingMood = 'studio' | 'senja' | 'malam';

export type SegmentRole = 'intro' | 'fakta' | 'outro';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface VisualIdeas {
  saranGambar: string;
  klipPendek: string;
  grafisData: string;
}

export interface ChapterPhotoItem {
  url: string;
  caption?: string;
}

export interface FactChapter {
  id: string;
  index: number;
  role: SegmentRole;
  kategori: string;
  judul: string;
  ringkasan: string;
  narasi: string;
  angkaUtama: string;
  labelAngka: string;
  tema3d: SceneTheme;
  kamera: CameraPreset;
  durasiDetik: number;
  sumber?: string;
  fotoUrl?: string;
  fotoKeterangan?: string;
  fotoGaleri?: ChapterPhotoItem[];
  ideVisual: VisualIdeas;
}

export interface FactVideoScript {
  topik: string;
  judulVideo: string;
  kalimatHook?: string;
  opsiJudul?: string[];
  opsiHook?: string[];
  tanggalRiset: string;
  dimensiDisarankan: AspectMode;
  pembuka: string;
  penutup: string;
  pertanyaanInteraksi: string;
  chapters: FactChapter[];
  sources: GroundingSource[];
}

export interface TrendingTopic {
  id: string;
  judulTopik: string;
  kategori: string;
  alasanRamai: string;
  sudutFakta: string;
  tema3d: SceneTheme;
}

export interface TrendingResearchResult {
  tanggalRiset: string;
  topics: TrendingTopic[];
  sources: GroundingSource[];
}

export interface ChapterAudioAsset {
  chapterId: string;
  audioUrl: string;
  durationSec: number;
}
