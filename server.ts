import 'dotenv/config';
import { execFile } from 'child_process';
import express from 'express';
import fs from 'fs/promises';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { GoogleGenAI, Type } from '@google/genai';

const execFileAsync = promisify(execFile);
import type {
  AspectMode,
  FactChapter,
  FactVideoScript,
  GroundingSource,
  SceneTheme,
  SegmentRole,
  TrendingResearchResult,
  TrendingTopic,
} from './src/types/video.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function createAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum tersedia di environment server. Periksa panel Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('Gagal mengurai format JSON naskah fakta dari respons AI.');
  }
}

const VALID_THEMES: SceneTheme[] = ['nusantara', 'teknologi', 'sains', 'ekonomi', 'antariksa'];
const VALID_CAMERAS = ['utama', 'sinematik', 'dekat', 'atas'] as const;

function isTransientGeminiError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('429') ||
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.toLowerCase().includes('high demand')
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithResilience(
  ai: GoogleGenAI,
  contents: string,
  config: Record<string, unknown>
) {
  try {
    return await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config,
    });
  } catch (err) {
    if (!isTransientGeminiError(err)) throw err;
    await sleep(700);
  }

  try {
    return await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config,
    });
  } catch (err) {
    if (!isTransientGeminiError(err)) throw err;
    await sleep(600);
  }

  // Final attempt without Search tool in case grounding tool quota is exhausted
  const { tools: _ignoredTools, ...configWithoutSearch } = config;
  return await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents,
    config: configWithoutSearch,
  });
}

function formatGeminiError(error: unknown, fallback: string): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Batas kuota Gemini API tercapai (429). Tingkatkan ke tier berbayar atau pilih kunci API dengan penagihan aktif di panel Settings > Secrets.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.toLowerCase().includes('high demand')) {
    return {
      status: 503,
      message:
        'Server model AI sedang sibuk sementara (503). Silakan klik "Coba Lagi" atau "Riset Baru" beberapa detik lagi.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('403') || raw.includes('401')) {
    return {
      status: 403,
      message:
        'API key Gemini tidak valid atau belum memiliki izin. Periksa kunci API Anda di panel Settings > Secrets.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: 'Model Gemini yang diminta tidak ditemukan. Hubungi pengembang untuk memperbarui konfigurasi model.',
    };
  }
  return {
    status: 500,
    message: raw || fallback,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Research latest facts in Bahasa Indonesia using Gemini + Google Search grounding
  app.post('/api/facts/generate', async (req, res) => {
    try {
      const topicRaw = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
      const isDefaultTopic = !topicRaw || topicRaw === 'Fakta terbaru Indonesia dan dunia saat ini';
      const excludeTitles = Array.isArray(req.body?.excludeTitles)
        ? req.body.excludeTitles.map((t: unknown) => String(t).trim()).filter(Boolean).slice(-12)
        : [];
      const variationToken = Number(req.body?.variationToken) || Date.now();
      const FRESH_ANGLES = [
        'inovasi teknologi, kecerdasan buatan, dan transformasi digital terbaru di Indonesia serta dunia',
        'ekonomi, infrastruktur strategis, energi terbarukan, dan investasi terbaru di Indonesia',
        'sains, temuan riset BRIN, fenomena iklim, dan kelautan Nusantara terkini',
        'antariksa, satelit, eksplorasi luar angkasa, dan terobosan ilmiah global terbaru',
        'kebijakan publik, pendidikan, transportasi modern, dan tren sosial terbaru di Indonesia',
      ];
      const rotatingAngle = FRESH_ANGLES[Math.abs(variationToken) % FRESH_ANGLES.length];
      const topic = isDefaultTopic
        ? `Fakta terbaru hari ini seputar ${rotatingAngle}`
        : topicRaw;
      const count = Math.min(Math.max(Number(req.body?.count) || 4, 3), 5);
      const aspect: AspectMode = req.body?.aspect === '9:16' ? '9:16' : '16:9';

      const ai = createAiClient();
      const nowDate = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const exclusionClause =
        excludeTitles.length > 0
          ? `\nPENTING: Jangan mengulang tema, judul, atau poin fakta yang sudah pernah dibahas sebelumnya berikut ini: ${excludeTitles.map((t: string) => `"${t}"`).join(', ')}. Cari sudut pandang, berita, atau fakta lain yang segar dan berbeda.`
          : '';

      const prompt = `Hari ini adalah ${nowDate} (Kode variasi riset: ${variationToken}).
Lakukan pencarian web terkini mengenai: "${topic}".${exclusionClause}
Susun OUTLINE & NASKAH VIDEO LENGKAP berbahasa Indonesia format ${aspect} (${aspect === '9:16' ? 'Vertikal Shorts/Reels bertempo cepat' : 'Lanskap YouTube/Dokumenter sinematik'}) mengenai fakta-fakta terbaru dan terhangat saat ini.

Susun array "chapters" secara berurutan terdiri dari:
1. Pertama, tepat 1 segmen dengan role: "intro" -> Hook pembuka 3-5 detik pertama yang langsung memancing rasa ingin tahu penonton tentang topik terkini.
2. Berikutnya, tepat ${count} segmen dengan role: "fakta" -> Poin-poin fakta utama terbaru yang relevan, akurat, berbasis berita/data terkini saat ini.
3. Terakhir, tepat 1 segmen dengan role: "outro" -> Penutup yang merangkum singkat dan mengajak penonton berinteraksi di kolom komentar lewat pertanyaan diskusi.

Untuk SETIAP segmen di dalam "chapters", sertakan:
- role: "intro" | "fakta" | "outro"
- kategori: label singkat 1-2 kata (misal: "Pembuka", "Teknologi", "Nusantara", "Ekonomi", "Sains", "Antariksa", "Interaksi")
- judul: judul segmen padat maks 8 kata dalam Bahasa Indonesia
- ringkasan: 1 kalimat ringkas yang tampil sebagai teks layar (maks 18 kata)
- narasi: naskah voiceover Bahasa Indonesia yang natural, informatif, dan enak didengar (30-55 kata untuk fakta, 20-30 kata untuk intro/outro)
- angkaUtama: angka atau metrik kunci paling mencolok (misal: "15,4%", "2026", "Rp 180 T", "3 Fakta", "Komentar")
- labelAngka: keterangan singkat untuk angkaUtama (maks 5 kata)
- tema3d: pilih salah satu yang paling cocok: "nusantara", "teknologi", "sains", "ekonomi", atau "antariksa"
- kamera: pilih sudut kamera: "utama", "sinematik", "dekat", atau "atas"
- sumber: nama media/lembaga sumber fakta (misal: "Kompas", "Antara", "BMKG", "BRIN", "Reuters")
- ideVisual: objek berisi saran produksi visual dinamis khusus untuk format ${aspect}:
  - saranGambar: saran foto/ilustrasi pendukung yang memperkuat narasi
  - klipPendek: saran B-roll / klip video pendek dinamis
  - grafisData: saran grafis layar / animasi angka / lower-third

Sertakan juga pada objek utama JSON:
- judulVideo: judul video media sosial (TikTok/Reels/Shorts/YouTube) yang memancing rasa ingin tahu penonton (maks 12 kata, Bahasa Indonesia kuat dan spesifik, tanpa clickbait palsu).
- kalimatHook: 1-2 kalimat hook pembuka 3 detik pertama yang langsung menahan scroll penonton media sosial agar menonton sampai habis.
- opsiJudul: array berisi tepat 3 alternatif judul video media sosial yang menarik dan memancing klik.
- opsiHook: array berisi tepat 3 alternatif kalimat hook pembuka yang memancing rasa penasaran penonton.
- pembuka: kalimat pengantar pembuka yang selaras dengan kalimatHook.
- penutup: kalimat kesimpulan singkat sebelum pertanyaan interaksi.
- pertanyaanInteraksi: 1 kalimat pertanyaan memancing diskusi penonton di kolom komentar untuk segmen outro.
Kembalikan HANYA JSON sesuai skema.`;

      const response = await generateWithResilience(ai, prompt, {
        systemInstruction:
          'Anda adalah produser kreatif, ahli copywriting media sosial, dan jurnalis riset video dokumenter Bahasa Indonesia. Selalu gunakan data terbaru dari Google Search grounding dan tulis dalam Bahasa Indonesia yang mengalir, menarik, memancing perhatian di 3 detik pertama, dan informatif.',
        tools: [{ googleSearch: {} }],
        seed: Math.abs(variationToken) % 2147483647,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            judulVideo: { type: Type.STRING },
            kalimatHook: { type: Type.STRING },
            opsiJudul: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            opsiHook: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            pembuka: { type: Type.STRING },
            penutup: { type: Type.STRING },
            pertanyaanInteraksi: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  role: { type: Type.STRING },
                  kategori: { type: Type.STRING },
                  judul: { type: Type.STRING },
                  ringkasan: { type: Type.STRING },
                  narasi: { type: Type.STRING },
                  angkaUtama: { type: Type.STRING },
                  labelAngka: { type: Type.STRING },
                  tema3d: { type: Type.STRING },
                  kamera: { type: Type.STRING },
                  sumber: { type: Type.STRING },
                  ideVisual: {
                    type: Type.OBJECT,
                    properties: {
                      saranGambar: { type: Type.STRING },
                      klipPendek: { type: Type.STRING },
                      grafisData: { type: Type.STRING },
                    },
                    required: ['saranGambar', 'klipPendek', 'grafisData'],
                  },
                },
                required: [
                  'role',
                  'kategori',
                  'judul',
                  'ringkasan',
                  'narasi',
                  'angkaUtama',
                  'labelAngka',
                  'tema3d',
                  'kamera',
                  'ideVisual',
                ],
              },
            },
          },
          required: [
            'judulVideo',
            'kalimatHook',
            'opsiJudul',
            'opsiHook',
            'pembuka',
            'penutup',
            'pertanyaanInteraksi',
            'chapters',
          ],
        },
      });

      const rawText = response.text ?? '';
      if (!rawText) {
        res.status(502).json({ error: 'Model tidak mengembalikan konten naskah.' });
        return;
      }

      const parsed = extractJsonObject(rawText);
      const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
      if (rawChapters.length === 0) {
        res.status(502).json({ error: 'Tidak ada segmen fakta yang dihasilkan.' });
        return;
      }

      const chapters: FactChapter[] = rawChapters.map((item, idx) => {
        const rec = item as Record<string, unknown>;
        const rawTema = String(rec.tema3d ?? '').toLowerCase() as SceneTheme;
        const tema3d: SceneTheme = VALID_THEMES.includes(rawTema)
          ? rawTema
          : VALID_THEMES[idx % VALID_THEMES.length];

        const rawKam = String(rec.kamera ?? '').toLowerCase();
        const kamera = VALID_CAMERAS.includes(rawKam as (typeof VALID_CAMERAS)[number])
          ? (rawKam as (typeof VALID_CAMERAS)[number])
          : VALID_CAMERAS[idx % VALID_CAMERAS.length];

        const rawRole = String(rec.role ?? '').toLowerCase();
        let role: SegmentRole = 'fakta';
        if (rawRole === 'intro' || (idx === 0 && rawRole !== 'fakta')) role = 'intro';
        else if (rawRole === 'outro' || (idx === rawChapters.length - 1 && rawRole !== 'fakta')) role = 'outro';

        const narasi = String(rec.narasi ?? '').trim();
        const wordCount = narasi.split(/\s+/).filter(Boolean).length;
        const estimatedSec = Math.max(6, Math.min(20, Math.round(wordCount / 2.3) + 2));

        const vis = (rec.ideVisual ?? {}) as Record<string, unknown>;

        return {
          id: `segmen-${idx + 1}-${Date.now()}`,
          index: idx + 1,
          role,
          kategori: String(rec.kategori ?? (role === 'intro' ? 'Pembuka' : role === 'outro' ? 'Interaksi' : 'Fakta')).trim(),
          judul: String(rec.judul ?? `Segmen ${idx + 1}`).trim(),
          ringkasan: String(rec.ringkasan ?? '').trim(),
          narasi,
          angkaUtama: String(rec.angkaUtama ?? `${idx + 1}`).trim(),
          labelAngka: String(rec.labelAngka ?? 'Sorotan Data').trim(),
          tema3d,
          kamera,
          durasiDetik: estimatedSec,
          sumber: rec.sumber ? String(rec.sumber).trim() : undefined,
          ideVisual: {
            saranGambar: String(vis.saranGambar ?? 'Foto dokumenter beresolusi tinggi sesuai konteks segmen.').trim(),
            klipPendek: String(vis.klipPendek ?? 'Klip B-roll berdurasi 3-4 detik dengan gerakan kamera halus.').trim(),
            grafisData: String(vis.grafisData ?? 'Animasi angka sorotan dan teks lower-third kontras tinggi.').trim(),
          },
        };
      });

      // Extract real Google Search grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundingSource[] = [];
      for (const chunk of chunks) {
        const web = chunk.web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          sources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      const judulVideo = String(parsed.judulVideo ?? `Fakta Terbaru: ${topic}`).trim();
      const kalimatHook = String(
        parsed.kalimatHook ?? parsed.pembuka ?? chapters[0]?.narasi ?? ''
      ).trim();
      const opsiJudul = Array.isArray(parsed.opsiJudul)
        ? parsed.opsiJudul.map((v) => String(v).trim()).filter(Boolean).slice(0, 4)
        : [];
      const opsiHook = Array.isArray(parsed.opsiHook)
        ? parsed.opsiHook.map((v) => String(v).trim()).filter(Boolean).slice(0, 4)
        : [];

      const script: FactVideoScript = {
        topik: topic,
        judulVideo,
        kalimatHook,
        opsiJudul: opsiJudul.length > 0 ? opsiJudul : [judulVideo],
        opsiHook: opsiHook.length > 0 ? opsiHook : [kalimatHook],
        tanggalRiset: nowDate,
        dimensiDisarankan: aspect,
        pembuka: String(parsed.pembuka ?? kalimatHook).trim(),
        penutup: String(parsed.penutup ?? '').trim(),
        pertanyaanInteraksi: String(
          parsed.pertanyaanInteraksi ?? 'Menurut Anda, fakta mana yang paling berdampak untuk Indonesia tahun ini?'
        ).trim(),
        chapters,
        sources: sources.slice(0, 8),
      };

      res.json(script);
    } catch (error) {
      const { status, message } = formatGeminiError(error, 'Terjadi kesalahan saat meriset fakta terbaru.');
      if (status === 429) {
        console.warn('[/api/facts/generate] Kuota API tercapai (429).');
      } else {
        console.error('[/api/facts/generate] Error:', error);
      }
      res.status(status).json({ error: message });
    }
  });

  // Deep research on 4-5 trending/viral topics in Indonesia right now
  app.post('/api/facts/trends', async (_req, res) => {
    try {
      const ai = createAiClient();
      const nowDate = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const prompt = `Hari ini adalah ${nowDate}.
Lakukan riset web mendalam mengenai topik-topik yang sedang viral, trending, atau menjadi perbincangan hangat masyarakat di Indonesia saat ini (meliputi isu nasional, teknologi/AI, ekonomi, sains, atau kebijakan publik terbaru).

Identifikasi tepat 5 topik utama yang paling menarik untuk diolah menjadi konten video fakta berbahasa Indonesia.
Untuk setiap topik sertakan:
- judulTopik: judul topik spesifik & menarik (maks 10 kata)
- kategori: 1-2 kata kategori (misal: "Ekonomi", "Teknologi", "Nasional", "Sains", "Gaya Hidup")
- alasanRamai: penjelasan singkat mengapa topik ini sedang hangat dibahas saat ini (1-2 kalimat)
- sudutFakta: sudut pandang fakta unik/data mengejutkan yang cocok dijadikan video (1 kalimat)
- tema3d: pilih satu: "nusantara", "teknologi", "sains", "ekonomi", atau "antariksa"

Kembalikan HANYA JSON sesuai skema.`;

      const response = await generateWithResilience(ai, prompt, {
        systemInstruction:
          'Anda adalah analis tren media dan jurnalis riset Indonesia. Gunakan Google Search grounding untuk menemukan topik aktual yang benar-benar hangat diperbincangkan di Indonesia saat ini.',
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  judulTopik: { type: Type.STRING },
                  kategori: { type: Type.STRING },
                  alasanRamai: { type: Type.STRING },
                  sudutFakta: { type: Type.STRING },
                  tema3d: { type: Type.STRING },
                },
                required: ['judulTopik', 'kategori', 'alasanRamai', 'sudutFakta', 'tema3d'],
              },
            },
          },
          required: ['topics'],
        },
      });

      const rawText = response.text ?? '';
      if (!rawText) {
        res.status(502).json({ error: 'Model tidak mengembalikan daftar topik tren.' });
        return;
      }

      const parsed = extractJsonObject(rawText);
      const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : [];

      const topics: TrendingTopic[] = rawTopics.map((item, idx) => {
        const rec = item as Record<string, unknown>;
        const rawTema = String(rec.tema3d ?? '').toLowerCase() as SceneTheme;
        const tema3d: SceneTheme = VALID_THEMES.includes(rawTema)
          ? rawTema
          : VALID_THEMES[idx % VALID_THEMES.length];

        return {
          id: `tren-${idx + 1}-${Date.now()}`,
          judulTopik: String(rec.judulTopik ?? `Topik Hangat ${idx + 1}`).trim(),
          kategori: String(rec.kategori ?? 'Nasional').trim(),
          alasanRamai: String(rec.alasanRamai ?? '').trim(),
          sudutFakta: String(rec.sudutFakta ?? '').trim(),
          tema3d,
        };
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundingSource[] = [];
      for (const chunk of chunks) {
        const web = chunk.web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          sources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      const result: TrendingResearchResult = {
        tanggalRiset: nowDate,
        topics,
        sources: sources.slice(0, 8),
      };

      res.json(result);
    } catch (error) {
      const { status, message } = formatGeminiError(error, 'Gagal meriset topik viral Indonesia.');
      if (status === 429) {
        console.warn('[/api/facts/trends] Kuota API tercapai (429).');
      } else {
        console.error('[/api/facts/trends] Error:', error);
      }
      res.status(status).json({ error: message });
    }
  });

  // Generate Indonesian narration audio using Gemini TTS with retry & model fallback
  app.post('/api/tts/narrate', async (req, res) => {
    try {
      const rawText = typeof req.body?.text === 'string' ? req.body.text : '';
      const cleaned = rawText.replace(/\s+/g, ' ').trim();
      const text = cleaned && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
      const voiceName = typeof req.body?.voiceName === 'string' ? req.body.voiceName : 'Kore';
      const style =
        typeof req.body?.style === 'string'
          ? req.body.style
          : 'Pembawa berita dokumenter Bahasa Indonesia yang jernih, tegas, bertempo stabil, dan artikulasi jelas tanpa memotong akhir kalimat';

      if (!text) {
        res.status(400).json({ error: 'Teks narasi tidak boleh kosong.' });
        return;
      }

      const ai = createAiClient();
      const ttsModels = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
      let base64Audio: string | undefined;
      let lastError: unknown;

      for (let attempt = 0; attempt < ttsModels.length; attempt++) {
        const model = ttsModels[attempt];
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text,
                    speechMetadata: {
                      style,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
            },
          });

          const parts = response.candidates?.[0]?.content?.parts ?? [];
          const audioPart = parts.find((p) => p.inlineData?.data);
          base64Audio = audioPart?.inlineData?.data;
          if (base64Audio) break;
        } catch (err) {
          lastError = err;
          if (attempt < ttsModels.length - 1) {
            await sleep(700 * (attempt + 1));
          }
        }
      }

      if (!base64Audio) {
        if (lastError) throw lastError;
        res.status(502).json({ error: 'Model suara tidak mengembalikan data audio.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error) {
      const { status, message } = formatGeminiError(error, 'Gagal membuat narasi suara AI.');
      if (status === 429) {
        console.warn('[/api/tts/narrate] Kuota API tercapai (429).');
      } else {
        console.error('[/api/tts/narrate] Error:', error);
      }
      res.status(status).json({ error: message });
    }
  });

  // Upload lossless master WAV audio track for MP4 muxing
  app.post(
    '/api/video/upload-audio',
    express.raw({ type: () => true, limit: '60mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Data audio master kosong.' });
        return;
      }
      const audioToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const audioPath = path.join(os.tmpdir(), `fakta-master-${audioToken}.wav`);
      try {
        await fs.writeFile(audioPath, req.body);
        res.json({ audioToken });
      } catch (err) {
        console.error('[/api/video/upload-audio] Error:', err);
        res.status(500).json({ error: 'Gagal menyimpan trek audio master.' });
      }
    }
  );

  // Store converted MP4 files temporarily so mobile & desktop browsers can perform genuine HTTP downloads
  const exportedMp4Store = new Map<string, { filePath: string; expiresAt: number }>();

  const cleanupExpiredMp4s = () => {
    const now = Date.now();
    for (const [id, entry] of exportedMp4Store.entries()) {
      if (entry.expiresAt <= now) {
        exportedMp4Store.delete(id);
        void fs.unlink(entry.filePath).catch(() => {});
      }
    }
  };
  setInterval(cleanupExpiredMp4s, 5 * 60 * 1000).unref();

  const sanitizeMp4Filename = (raw: unknown): string => {
    const base = typeof raw === 'string' ? raw.trim() : '';
    const cleaned = base
      .replace(/\.mp4$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return `${cleaned || 'fakta-nusantara'}.mp4`;
  };

  const probeInputStreams = async (
    filePath: string
  ): Promise<{ hasVideo: boolean; hasAudio: boolean; formatName: string }> => {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=format_name:stream=codec_type',
        '-of',
        'json',
        filePath,
      ]);
      const parsed = JSON.parse(stdout) as {
        format?: { format_name?: string };
        streams?: { codec_type?: string }[];
      };
      const streams = parsed.streams ?? [];
      return {
        hasVideo: streams.some((s) => s.codec_type === 'video'),
        hasAudio: streams.some((s) => s.codec_type === 'audio'),
        formatName: parsed.format?.format_name ?? '',
      };
    } catch {
      return { hasVideo: true, hasAudio: false, formatName: '' };
    }
  };

  // Chunked video upload endpoint so large multi-segment recordings never hit proxy body limits
  const chunkUploadMeta = new Map<string, { filePath: string; ext: string; createdAt: number }>();
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [key, meta] of chunkUploadMeta.entries()) {
      if (meta.createdAt < cutoff) {
        chunkUploadMeta.delete(key);
        void fs.unlink(meta.filePath).catch(() => {});
      }
    }
  }, 5 * 60 * 1000).unref();

  app.post(
    '/api/video/upload-chunk',
    express.raw({ type: () => true, limit: '20mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Potongan data video kosong.' });
        return;
      }

      const rawToken = typeof req.query?.videoToken === 'string' ? req.query.videoToken : '';
      const safeToken = /^[a-zA-Z0-9-]+$/.test(rawToken) ? rawToken : '';
      const extParam = String(req.query?.ext ?? 'webm').toLowerCase() === 'mp4' ? 'mp4' : 'webm';

      let token = safeToken;
      let filePath = '';
      if (token && chunkUploadMeta.has(token)) {
        filePath = chunkUploadMeta.get(token)!.filePath;
      } else {
        token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        filePath = path.join(os.tmpdir(), `fakta-chunked-${token}.${extParam}`);
        chunkUploadMeta.set(token, { filePath, ext: extParam, createdAt: Date.now() });
      }

      try {
        await fs.appendFile(filePath, req.body);
        const stat = await fs.stat(filePath);
        res.json({ videoToken: token, bytesReceived: stat.size });
      } catch (err) {
        console.error('[/api/video/upload-chunk] Error:', err);
        res.status(500).json({ error: 'Gagal menyimpan potongan rekaman video.' });
      }
    }
  );

  // Convert recorded WebM/MP4 stream into social-media-ready MP4 (H.264 High@L4.0, yuv420p, 30fps CFR, AAC-LC 48kHz Stereo, +faststart)
  app.post(
    '/api/video/convert-mp4',
    express.raw({ type: () => true, limit: '150mb' }),
    async (req, res) => {
      req.setTimeout(5 * 60 * 1000);
      res.setTimeout(5 * 60 * 1000);

      const rawVideoToken = typeof req.query?.videoToken === 'string' ? req.query.videoToken : '';
      const safeVideoToken = /^[a-zA-Z0-9-]+$/.test(rawVideoToken) ? rawVideoToken : '';
      const chunkEntry = safeVideoToken ? chunkUploadMeta.get(safeVideoToken) : undefined;

      const hasRawBody = Buffer.isBuffer(req.body) && req.body.length > 0;
      if (!chunkEntry && !hasRawBody) {
        res.status(400).json({ error: 'Data video kosong atau format tidak valid.' });
        return;
      }

      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
      const extQuery = String(req.query?.ext ?? '').toLowerCase();
      const inputExt = chunkEntry
        ? chunkEntry.ext
        : extQuery === 'mp4' || contentType.includes('mp4')
          ? 'mp4'
          : 'webm';
      const tmpInput = chunkEntry
        ? chunkEntry.filePath
        : path.join(os.tmpdir(), `fakta-in-${token}.${inputExt}`);
      const tmpOutput = path.join(os.tmpdir(), `fakta-out-${token}.mp4`);
      const downloadFilename = sanitizeMp4Filename(req.query?.filename);
      const wantsJson = req.query?.response === 'json';

      if (chunkEntry && safeVideoToken) {
        chunkUploadMeta.delete(safeVideoToken);
      }

      const rawAudioToken = typeof req.query?.audioToken === 'string' ? req.query.audioToken : '';
      const safeAudioToken = /^[a-zA-Z0-9-]+$/.test(rawAudioToken) ? rawAudioToken : '';
      const masterAudioPath = safeAudioToken
        ? path.join(os.tmpdir(), `fakta-master-${safeAudioToken}.wav`)
        : '';

      let hasMasterAudio = false;
      if (masterAudioPath) {
        try {
          const stat = await fs.stat(masterAudioPath);
          hasMasterAudio = stat.size > 44;
        } catch {
          hasMasterAudio = false;
        }
      }

      let keepOutputForDownload = false;

      try {
        if (!chunkEntry) {
          await fs.writeFile(tmpInput, req.body);
        }

        const inStat = await fs.stat(tmpInput);
        if (inStat.size < 256) {
          throw new Error('File rekaman video terlalu kecil atau tidak valid.');
        }

        const probe = await probeInputStreams(tmpInput);
        if (!probe.hasVideo) {
          throw new Error('Rekaman video tidak mengandung aliran gambar. Pastikan tab tetap aktif saat merekam.');
        }
        const inputHasAudio = !hasMasterAudio && probe.hasAudio;

        // Social-media compliant H.264 High@L4.0 + yuv420p + CFR 30fps + Closed GOP + BT.709 (TikTok, IG Reels, YT Shorts, YouTube, FB)
        const primaryVideoArgs = [
          '-c:v',
          'libx264',
          '-profile:v',
          'high',
          '-level:v',
          '4.0',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-maxrate',
          '4500k',
          '-bufsize',
          '9000k',
          '-pix_fmt',
          'yuv420p',
          '-vsync',
          'cfr',
          '-r',
          '30',
          '-g',
          '60',
          '-keyint_min',
          '30',
          '-sc_threshold',
          '0',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p',
          '-colorspace',
          'bt709',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
        ];

        const fallbackVideoArgs = [
          '-c:v',
          'libx264',
          '-profile:v',
          'main',
          '-level:v',
          '4.0',
          '-preset',
          'veryfast',
          '-crf',
          '22',
          '-maxrate',
          '4000k',
          '-bufsize',
          '8000k',
          '-pix_fmt',
          'yuv420p',
          '-vsync',
          'cfr',
          '-r',
          '30',
          '-g',
          '60',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p',
        ];

        const audioEncodeArgs = [
          '-c:a',
          'aac',
          '-profile:a',
          'aac_low',
          '-b:a',
          '192k',
          '-ar',
          '48000',
          '-ac',
          '2',
        ];

        const buildPrimaryArgs = (): string[] => {
          if (hasMasterAudio) {
            return [
              '-y',
              '-fflags',
              '+genpts',
              '-i',
              tmpInput,
              '-i',
              masterAudioPath,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              ...primaryVideoArgs,
              ...audioEncodeArgs,
              '-af',
              'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad',
              '-shortest',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              tmpOutput,
            ];
          }
          if (inputHasAudio) {
            return [
              '-y',
              '-fflags',
              '+genpts',
              '-i',
              tmpInput,
              '-map',
              '0:v:0',
              '-map',
              '0:a:0',
              ...primaryVideoArgs,
              ...audioEncodeArgs,
              '-af',
              'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              tmpOutput,
            ];
          }
          return [
            '-y',
            '-fflags',
            '+genpts',
            '-i',
            tmpInput,
            '-f',
            'lavfi',
            '-i',
            'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            ...primaryVideoArgs,
            ...audioEncodeArgs,
            '-shortest',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
            tmpOutput,
          ];
        };

        const buildResilientArgs = (forceSilentInputAudio: boolean): string[] => {
          const basePrefix = ['-y', '-err_detect', 'ignore_err', '-fflags', '+discardcorrupt', '-i', tmpInput];
          if (hasMasterAudio && !forceSilentInputAudio) {
            return [
              ...basePrefix,
              '-i',
              masterAudioPath,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              ...fallbackVideoArgs,
              ...audioEncodeArgs,
              '-af',
              'aresample=async=1:first_pts=0,volume=1.15,apad',
              '-shortest',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              tmpOutput,
            ];
          }
          if (inputHasAudio && !forceSilentInputAudio) {
            return [
              ...basePrefix,
              '-map',
              '0:v:0',
              '-map',
              '0:a:0',
              ...fallbackVideoArgs,
              ...audioEncodeArgs,
              '-af',
              'aresample=async=1:first_pts=0,apad',
              '-shortest',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              tmpOutput,
            ];
          }
          // Last-resort: preserve video stream cleanly with valid silent stereo AAC track (or master audio without filters)
          if (hasMasterAudio) {
            return [
              ...basePrefix,
              '-i',
              masterAudioPath,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              ...fallbackVideoArgs,
              ...audioEncodeArgs,
              '-shortest',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              tmpOutput,
            ];
          }
          return [
            ...basePrefix,
            '-f',
            'lavfi',
            '-i',
            'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            ...fallbackVideoArgs,
            ...audioEncodeArgs,
            '-shortest',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
            tmpOutput,
          ];
        };

        const stages: { label: string; args: string[] }[] = [
          { label: 'primary-social-mp4', args: buildPrimaryArgs() },
          { label: 'resilient-no-loudnorm', args: buildResilientArgs(false) },
          { label: 'last-resort-safe-audio', args: buildResilientArgs(true) },
        ];

        let lastStageError: unknown = null;
        let converted = false;
        for (const stage of stages) {
          try {
            await execFileAsync('ffmpeg', stage.args, { maxBuffer: 32 * 1024 * 1024 });
            const stat = await fs.stat(tmpOutput).catch(() => null);
            if (stat && stat.size >= 1024) {
              converted = true;
              break;
            }
          } catch (stageErr) {
            lastStageError = stageErr;
            const stderrText =
              stageErr && typeof stageErr === 'object' && 'stderr' in stageErr
                ? String((stageErr as { stderr?: unknown }).stderr ?? '')
                    .split('\n')
                    .slice(-8)
                    .join(' | ')
                : String(stageErr);
            console.warn(`[/api/video/convert-mp4] Stage ${stage.label} failed:`, stderrText);
          }
        }

        if (!converted) {
          throw lastStageError ?? new Error('Hasil konversi MP4 kosong.');
        }

        const outStat = await fs.stat(tmpOutput);
        if (outStat.size < 1024) {
          throw new Error('Hasil konversi MP4 kosong.');
        }

        cleanupExpiredMp4s();
        exportedMp4Store.set(token, {
          filePath: tmpOutput,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
        keepOutputForDownload = true;

        const encId = encodeURIComponent(token);
        const encName = encodeURIComponent(downloadFilename);
        const downloadUrl = `/api/video/download/${encId}?filename=${encName}`;
        const savePageUrl = `/api/video/save-page/${encId}?filename=${encName}`;

        if (wantsJson) {
          res.json({
            downloadId: token,
            filename: downloadFilename,
            sizeBytes: outStat.size,
            downloadUrl,
            savePageUrl,
          });
          return;
        }

        const mp4Buffer = await fs.readFile(tmpOutput);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('X-Video-Download-Id', token);
        res.setHeader('Access-Control-Expose-Headers', 'X-Video-Download-Id');
        res.send(mp4Buffer);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error ?? '');
        console.error('[/api/video/convert-mp4] Error:', error);
        const detail =
          reason && !reason.startsWith('Command failed')
            ? reason
            : 'Pastikan tab browser tetap terbuka selama perekaman lalu coba unduh ulang.';
        res.status(500).json({
          error: `Gagal mengonversi video ke format MP4 siap upload. ${detail}`.trim(),
        });
      } finally {
        await Promise.all([
          fs.unlink(tmpInput).catch(() => {}),
          keepOutputForDownload ? Promise.resolve() : fs.unlink(tmpOutput).catch(() => {}),
          masterAudioPath ? fs.unlink(masterAudioPath).catch(() => {}) : Promise.resolve(),
        ]);
      }
    }
  );

  // Genuine HTTP MP4 file download endpoint with Byte-Range support for Android/iOS/Desktop browsers
  app.get('/api/video/download/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      res.status(400).json({ error: 'ID unduhan tidak valid.' });
      return;
    }

    const entry = exportedMp4Store.get(id);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) {
        exportedMp4Store.delete(id);
        void fs.unlink(entry.filePath).catch(() => {});
      }
      res.status(404).json({ error: 'File MP4 sudah kedaluwarsa. Silakan rekam ulang video.' });
      return;
    }

    try {
      const stat = await fs.stat(entry.filePath);
      const fileSize = stat.size;
      const downloadFilename = sanitizeMp4Filename(req.query?.filename);
      const isInline = req.query?.inline === '1';

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${downloadFilename}"`
      );

      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(fileSize));
        res.status(200).end();
        return;
      }

      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const chunkSize = end - start + 1;
        const fh = await fs.open(entry.filePath, 'r');
        try {
          const buf = Buffer.alloc(chunkSize);
          await fh.read(buf, 0, chunkSize, start);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', String(chunkSize));
          res.send(buf);
        } finally {
          await fh.close();
        }
        return;
      }

      res.setHeader('Content-Length', String(fileSize));
      const fullBuf = await fs.readFile(entry.filePath);
      res.send(fullBuf);
    } catch (error) {
      console.error('[/api/video/download] Error:', error);
      res.status(404).json({ error: 'File video tidak ditemukan di server.' });
    }
  });

  // Top-level standalone save page (bypasses iframe sandbox/web-share limits on mobile browsers)
  app.get('/api/video/save-page/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      res.status(400).send('ID video tidak valid.');
      return;
    }

    const entry = exportedMp4Store.get(id);
    if (!entry || entry.expiresAt <= Date.now()) {
      res.status(404).send('Video sudah kedaluwarsa. Silakan ekspor ulang di aplikasi.');
      return;
    }

    const filename = sanitizeMp4Filename(req.query?.filename);
    const encodedName = encodeURIComponent(filename);
    const inlineUrl = `/api/video/download/${encodeURIComponent(id)}?inline=1&filename=${encodedName}`;
    const downloadUrl = `/api/video/download/${encodeURIComponent(id)}?filename=${encodedName}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Simpan Video MP4 - ${filename}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #090c12; color: #f3f5f8; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 16px; }
    .card { width: 100%; max-width: 560px; background: #0f1623; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 20px; box-sizing: border-box; }
    h1 { font-size: 16px; margin: 0 0 8px; color: #fbbf24; }
    p { font-size: 13px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px; }
    video { width: 100%; max-height: 380px; border-radius: 10px; background: #000; display: block; margin-bottom: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .btn { flex: 1 1 200px; text-align: center; text-decoration: none; border: 0; border-radius: 10px; padding: 12px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .btn-primary { background: #f59e0b; color: #090c12; }
    .btn-secondary { background: #10b981; color: #052e16; }
    .tips { font-size: 12px; color: #94a3b8; background: rgba(255,255,255,0.04); padding: 12px; border-radius: 10px; line-height: 1.55; }
    #status { font-size: 12px; color: #38bdf8; margin-top: 8px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Simpan Video MP4 ke Galeri HP atau Laptop</h1>
    <p>File: <strong>${filename}</strong></p>
    <video controls playsinline preload="metadata" src="${inlineUrl}"></video>
    <div class="actions">
      <button type="button" id="shareBtn" class="btn btn-primary">Simpan ke Galeri HP (iPhone / Android)</button>
      <a href="${downloadUrl}" download="${filename}" class="btn btn-secondary">Unduh File MP4 (Folder Download)</a>
    </div>
    <div id="status"></div>
    <div class="tips">
      <strong>Panduan agar muncul di Galeri:</strong><br/>
      • <strong>iPhone / iPad:</strong> Ketuk <em>Simpan ke Galeri HP</em> lalu pilih <strong>Simpan Video</strong>.<br/>
      • <strong>Android:</strong> Ketuk <em>Unduh File MP4</em>, lalu di aplikasi <strong>Galeri / Google Photos</strong> buka tab <strong>Album &rarr; Download</strong> (atau pilih folder <em>Movies / DCIM</em> jika diminta).<br/>
      • <strong>Laptop:</strong> Ketuk <em>Unduh File MP4</em>, file otomatis tersimpan di folder <strong>Downloads</strong>.
    </div>
  </div>
  <script>
    const shareBtn = document.getElementById('shareBtn');
    const statusEl = document.getElementById('status');
    const dlUrl = ${JSON.stringify(downloadUrl)};
    const fname = ${JSON.stringify(filename)};
    shareBtn.addEventListener('click', async () => {
      try {
        statusEl.textContent = 'Menyiapkan file video untuk Galeri...';
        const resp = await fetch(dlUrl);
        if (!resp.ok) throw new Error('Gagal memuat video');
        const blob = await resp.blob();
        const file = new File([blob], fname, { type: 'video/mp4' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fname });
          statusEl.textContent = 'Selesai! Pilih "Simpan Video" / "Galeri" pada menu sistem.';
        } else {
          statusEl.textContent = 'Browser ini tidak mendukung menu bagikan file; gunakan tombol "Unduh File MP4".';
        }
      } catch (err) {
        if (err && err.name === 'AbortError') {
          statusEl.textContent = '';
        } else {
          statusEl.textContent = 'Gunakan tombol "Unduh File MP4" di samping untuk menyimpan ke perangkat.';
        }
      }
    });
  </script>
</body>
</html>`);
  });

  // Lookup real documentary photos from Indonesian/English Wikipedia & return a safe same-origin proxy URL
  const isPhotographicUrl = (urlStr: string, width = 0, height = 0): boolean => {
    const lower = urlStr.toLowerCase();
    const bannedTokens = [
      '.svg',
      '.ogg',
      '.ogv',
      '.webm',
      '.gif',
      'flag_of',
      'coat_of_arms',
      'emblem',
      'logo',
      'icon',
      'locator',
      '_map',
      'map_of',
      'diagram',
      'chart',
      'signature',
      'seal_of',
      'blank',
      'commons-logo',
      'wikinews',
      'ambox',
    ];
    if (bannedTokens.some((tok) => lower.includes(tok))) return false;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(lower) && !lower.includes('/thumb/')) return false;
    if (width > 0 && height > 0) {
      if (width < 320 || height < 200) return false;
      const ratio = width / height;
      if (ratio < 0.75 || ratio > 2.6) return false;
    }
    return true;
  };

  const queryWikiPhotos = async (lang: 'id' | 'en', query: string, maxItems = 4) => {
    const endpoint = `https://${lang}.wikipedia.org/w/api.php`;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '8',
      prop: 'pageimages',
      pithumbsize: '1024',
      pilicense: 'any',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3800);
    try {
      const resp = await fetch(`${endpoint}?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FaktaNusantaraStudio/1.0 (https://localhost)',
          Accept: 'application/json',
        },
      });
      if (!resp.ok) return [];
      const json = (await resp.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              index?: number;
              title?: string;
              thumbnail?: { source?: string; width?: number; height?: number };
            }
          >;
        };
      };
      const pages = Object.values(json.query?.pages ?? {}).sort(
        (a, b) => (a.index ?? 99) - (b.index ?? 99)
      );
      const matches: { sourceUrl: string; title: string }[] = [];
      for (const page of pages) {
        const src = page.thumbnail?.source;
        const w = page.thumbnail?.width ?? 0;
        const h = page.thumbnail?.height ?? 0;
        if (src && isPhotographicUrl(src, w, h)) {
          matches.push({
            sourceUrl: src,
            title: page.title ?? query,
          });
          if (matches.length >= maxItems) break;
        }
      }
      return matches;
    } finally {
      clearTimeout(timer);
    }
  };

  app.get('/api/images/search', async (req, res) => {
    const rawQuery = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
    if (!rawQuery || rawQuery.length < 2) {
      res.json({ imageUrl: null, title: null, images: [] });
      return;
    }

    const query = rawQuery.slice(0, 120);
    const limit = Math.min(Math.max(Number(req.query?.limit) || 4, 1), 6);
    try {
      const idMatches = await queryWikiPhotos('id', query, limit);
      let combined = [...idMatches];
      if (combined.length < limit) {
        const enMatches = await queryWikiPhotos('en', query, limit - combined.length);
        const seen = new Set(combined.map((m) => m.sourceUrl));
        for (const m of enMatches) {
          if (!seen.has(m.sourceUrl)) {
            seen.add(m.sourceUrl);
            combined.push(m);
          }
        }
      }

      if (combined.length === 0) {
        res.json({ imageUrl: null, title: null, images: [] });
        return;
      }

      const images = combined.slice(0, limit).map((m) => ({
        imageUrl: `/api/images/proxy?url=${encodeURIComponent(m.sourceUrl)}`,
        title: m.title,
      }));

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({
        imageUrl: images[0].imageUrl,
        title: images[0].title,
        images,
      });
    } catch {
      res.json({ imageUrl: null, title: null, images: [] });
    }
  });

  // Same-origin proxy for Wikimedia Commons photos so HTMLCanvasElement.captureStream() is never tainted
  app.get('/api/images/proxy', async (req, res) => {
    const rawUrl = typeof req.query?.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      res.status(400).send('URL gambar kosong.');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('URL gambar tidak valid.');
      return;
    }

    if (
      parsed.protocol !== 'https:' ||
      !(parsed.hostname === 'upload.wikimedia.org' || parsed.hostname.endsWith('.wikimedia.org'))
    ) {
      res.status(403).send('Host gambar tidak diizinkan.');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const imgResp = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FaktaNusantaraStudio/1.0 (https://localhost)',
          Accept: 'image/*',
        },
      });
      if (!imgResp.ok) {
        res.status(imgResp.status).send('Gagal mengambil gambar sumber.');
        return;
      }

      const contentType = String(imgResp.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.startsWith('image/') || contentType.includes('svg')) {
        res.status(415).send('Format gambar harus raster foto.');
        return;
      }

      const arrayBuf = await imgResp.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(504).send('Waktu tunggu gambar habis.');
    } finally {
      clearTimeout(timer);
    }
  });

  const httpServer = createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) return next();
          const patched = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled via DISABLE_HMR=true */'
            )
            .replace(
              'else throw new SendBeforeConnectError("send was called before connect");',
              'else return;'
            )
            .replace(
              'else throw new SendBeforeConnectError("invoke was called before connect");',
              'else return;'
            );
          res.setHeader('Content-Type', 'application/javascript');
          res.send(patched);
        } catch {
          next();
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
