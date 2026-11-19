import type { ChapterPhotoItem, FactChapter, SceneTheme } from '../types/video';

export const THEME_FALLBACK_PHOTO: Record<SceneTheme, string> = {
  nusantara: '/src/assets/images/nusantara_infra_1795009058744.jpg',
  teknologi: '/src/assets/images/teknologi_datacenter_1795009059053.jpg',
  sains: '/src/assets/images/sains_energi_1795009058766.jpg',
  ekonomi: '/src/assets/images/ekonomi_pelabuhan_1795009059757.jpg',
  antariksa: '/src/assets/images/antariksa_orbit_1795009060008.jpg',
};

const THEME_CAPTION: Record<SceneTheme, string> = {
  nusantara: 'Ilustrasi infrastruktur & konektivitas Nusantara',
  teknologi: 'Ilustrasi pusat data, AI & komputasi modern',
  sains: 'Ilustrasi riset sains & energi terbarukan',
  ekonomi: 'Ilustrasi aktivitas ekonomi, pelabuhan & perdagangan',
  antariksa: 'Ilustrasi teknologi antariksa & observasi orbit',
};

export function getFallbackPhotoForTheme(theme?: SceneTheme): string {
  if (theme && theme in THEME_FALLBACK_PHOTO) {
    return THEME_FALLBACK_PHOTO[theme];
  }
  return THEME_FALLBACK_PHOTO.nusantara;
}

export function getDefaultGalleryForTheme(
  theme?: SceneTheme,
  primaryCaption?: string
): ChapterPhotoItem[] {
  const activeTheme: SceneTheme = theme && theme in THEME_FALLBACK_PHOTO ? theme : 'nusantara';
  const secondaryMap: Record<SceneTheme, SceneTheme> = {
    nusantara: 'ekonomi',
    teknologi: 'sains',
    sains: 'antariksa',
    ekonomi: 'nusantara',
    antariksa: 'teknologi',
  };
  const secondaryTheme = secondaryMap[activeTheme];
  return [
    {
      url: THEME_FALLBACK_PHOTO[activeTheme],
      caption: primaryCaption || THEME_CAPTION[activeTheme],
    },
    {
      url: THEME_FALLBACK_PHOTO[secondaryTheme],
      caption: THEME_CAPTION[secondaryTheme],
    },
  ];
}

const STOPWORDS = new Set([
  'yang',
  'dan',
  'di',
  'ke',
  'dari',
  'untuk',
  'pada',
  'ini',
  'itu',
  'dalam',
  'dengan',
  'atau',
  'saat',
  'terbaru',
  'fakta',
  'utama',
  'pembuka',
  'penutup',
  'bagaimana',
  'pendapat',
  'anda',
  'wajib',
  'tahu',
  'indonesia',
  'tahun',
  'lebih',
  'akan',
  'menjadi',
  'agar',
  'bisa',
]);

function buildPhotoSearchQuery(chapter: FactChapter): string {
  const raw = `${chapter.judul} ${chapter.kategori} ${chapter.sumber ?? ''}`
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));

  const unique = Array.from(new Set(raw)).slice(0, 4);
  if (unique.length >= 2) {
    return unique.join(' ');
  }
  return `${chapter.judul} ${chapter.kategori}`.trim().slice(0, 60);
}

const resolvedSearchCache = new Map<
  string,
  { imageUrl: string; caption?: string; gallery: ChapterPhotoItem[] }
>();

export async function resolveChapterPhoto(
  chapter: FactChapter
): Promise<{ imageUrl: string; caption?: string; gallery: ChapterPhotoItem[] }> {
  const defaultGallery = getDefaultGalleryForTheme(chapter.tema3d, chapter.ideVisual?.saranGambar);
  const fallbackUrl = defaultGallery[0].url;

  if (chapter.role === 'outro') {
    return {
      imageUrl: fallbackUrl,
      caption: chapter.ideVisual?.saranGambar || THEME_CAPTION[chapter.tema3d],
      gallery: defaultGallery,
    };
  }

  const query = buildPhotoSearchQuery(chapter);
  if (!query || query.length < 3) {
    return {
      imageUrl: fallbackUrl,
      caption: chapter.ideVisual?.saranGambar,
      gallery: defaultGallery,
    };
  }

  const cacheKey = `${chapter.tema3d}:${query.toLowerCase()}`;
  const cached = resolvedSearchCache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`/api/images/search?q=${encodeURIComponent(query)}&limit=4`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { imageUrl: fallbackUrl, caption: chapter.ideVisual?.saranGambar, gallery: defaultGallery };
    }
    const data = (await res.json()) as {
      imageUrl?: string | null;
      title?: string | null;
      images?: { imageUrl: string; title?: string | null }[];
    };

    const rawImages =
      Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : data.imageUrl
          ? [{ imageUrl: data.imageUrl, title: data.title }]
          : [];

    if (rawImages.length > 0) {
      const gallery: ChapterPhotoItem[] = rawImages.map((item) => ({
        url: item.imageUrl,
        caption: item.title ? `Foto dokumentasi: ${item.title}` : chapter.ideVisual?.saranGambar,
      }));
      // Ensure at least 2 realistic photos in the sequence for smooth documentary transitions
      if (gallery.length < 2) {
        gallery.push({
          url: fallbackUrl,
          caption: chapter.ideVisual?.saranGambar || THEME_CAPTION[chapter.tema3d],
        });
      }
      const result = {
        imageUrl: gallery[0].url,
        caption: gallery[0].caption,
        gallery: gallery.slice(0, 4),
      };
      for (const item of result.gallery) {
        getCanvasPhotoExact(item.url);
      }
      resolvedSearchCache.set(cacheKey, result);
      return result;
    }
  } catch {
    // Instant fallback to theme photorealistic asset
  } finally {
    window.clearTimeout(timeoutId);
  }

  return {
    imageUrl: fallbackUrl,
    caption: chapter.ideVisual?.saranGambar,
    gallery: defaultGallery,
  };
}

// Same-origin HTMLImageElement cache for Canvas2D drawing (prevents re-fetching & keeps captureStream untainted)
const canvasImgCache = new Map<
  string,
  { img: HTMLImageElement; loaded: boolean; failed: boolean }
>();

export function getSafeCanvasPhoto(
  primaryUrl: string | undefined,
  theme: SceneTheme
): HTMLImageElement | null {
  const fallbackUrl = getFallbackPhotoForTheme(theme);
  const candidates = primaryUrl && primaryUrl !== fallbackUrl ? [primaryUrl, fallbackUrl] : [fallbackUrl];

  for (const url of candidates) {
    let entry = canvasImgCache.get(url);
    if (!entry) {
      const img = new Image();
      img.decoding = 'async';
      entry = { img, loaded: false, failed: false };
      img.onload = () => {
        if (entry) entry.loaded = img.naturalWidth > 0 && img.naturalHeight > 0;
      };
      img.onerror = () => {
        if (entry) entry.failed = true;
      };
      img.src = url;
      canvasImgCache.set(url, entry);
    }
    if (entry.loaded && !entry.failed) {
      return entry.img;
    }
  }
  return null;
}

export function getCanvasPhotoExact(url: string): HTMLImageElement | null {
  if (!url) return null;
  let entry = canvasImgCache.get(url);
  if (!entry) {
    const img = new Image();
    img.decoding = 'async';
    entry = { img, loaded: false, failed: false };
    img.onload = () => {
      if (entry) entry.loaded = img.naturalWidth > 0 && img.naturalHeight > 0;
    };
    img.onerror = () => {
      if (entry) entry.failed = true;
    };
    img.src = url;
    canvasImgCache.set(url, entry);
  }
  if (entry.loaded && !entry.failed) {
    return entry.img;
  }
  return null;
}
