import type { FactChapter, SceneTheme } from '../types/video';

export type ContentFocus =
  | 'rail'
  | 'maritime'
  | 'telecom'
  | 'ai'
  | 'datacenter'
  | 'wind'
  | 'solar'
  | 'ocean'
  | 'finance'
  | 'logistics'
  | 'rocket'
  | 'satellite'
  | 'general';

export interface ContentSimulationCue {
  focus: ContentFocus;
  headline: string;
  metricValue: string;
  metricLabel: string;
  tempoMultiplier: number;
  isGrowth: boolean;
}

export function deriveContentCue(
  theme: SceneTheme,
  chapter?: FactChapter | null
): ContentSimulationCue {
  if (!chapter) {
    return {
      focus: 'general',
      headline: '',
      metricValue: '',
      metricLabel: '',
      tempoMultiplier: 1,
      isGrowth: true,
    };
  }

  const haystack = `${chapter.judul} ${chapter.ringkasan} ${chapter.narasi} ${chapter.kategori}`.toLowerCase();

  let focus: ContentFocus = 'general';
  if (theme === 'nusantara') {
    if (/kereta|whoosh|mrt|lrt|rel|transportasi|jembatan|tol/.test(haystack)) focus = 'rail';
    else if (/kapal|laut|maritim|pelabuhan|perikanan|ikan|selat|ekspor/.test(haystack)) focus = 'maritime';
    else focus = 'telecom';
  } else if (theme === 'teknologi') {
    if (/server|pusat data|data center|cloud|jaringan|siber|keamanan/.test(haystack)) focus = 'datacenter';
    else focus = 'ai';
  } else if (theme === 'sains') {
    if (/surya|matahari|plts|panel|baterai|listrik/.test(haystack)) focus = 'solar';
    else if (/angin|turbin|udara|badai|atmosfer/.test(haystack)) focus = 'wind';
    else focus = 'ocean';
  } else if (theme === 'ekonomi') {
    if (/logistik|pelabuhan|ekspor|impor|rantai pasok|kontainer|barang|industri|hilirisasi/.test(haystack)) {
      focus = 'logistics';
    } else {
      focus = 'finance';
    }
  } else if (theme === 'antariksa') {
    if (/roket|peluncuran|wahana|misi|bulan|mars|astronot/.test(haystack)) focus = 'rocket';
    else focus = 'satellite';
  }

  const isSurge = /rekor|lonjak|naik|pesat|tumbuh|cepat|tertinggi|melesat|ekspansi/.test(haystack);
  const tempoMultiplier = chapter.role === 'intro' ? 1.18 : isSurge ? 1.12 : 1.0;

  return {
    focus,
    headline: chapter.judul,
    metricValue: chapter.angkaUtama,
    metricLabel: chapter.labelAngka,
    tempoMultiplier,
    isGrowth: !/turun|merosot|krisis|anjlok|penurunan/.test(haystack),
  };
}
