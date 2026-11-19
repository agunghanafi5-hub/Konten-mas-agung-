export interface NarrationSentence {
  index: number;
  text: string;
  startRatio: number;
  endRatio: number;
}

/**
 * Splits Indonesian narration text into natural spoken sentences/clauses and
 * computes proportional [startRatio, endRatio] windows weighted by character
 * length + punctuation pause weights so text stays synchronized with TTS speech.
 */
export function splitNarrationSentences(rawText: string): NarrationSentence[] {
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // 1. Split by terminal punctuation (. ! ?)
  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 2. Break overly long sentences (>16 words) along natural comma/semicolon/dash pauses
  // so video subtitles remain concise (1-2 lines) and track speech tightly.
  const segments: string[] = [];
  for (const sentence of rawSentences) {
    const words = sentence.split(/\s+/);
    if (words.length <= 16) {
      segments.push(sentence);
      continue;
    }

    const clauses = sentence
      .split(/(?<=[,;—:])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);

    let buffer = '';
    for (const clause of clauses) {
      const candidate = buffer ? `${buffer} ${clause}` : clause;
      if (candidate.split(/\s+/).length <= 14) {
        buffer = candidate;
      } else {
        if (buffer) segments.push(buffer);
        buffer = clause;
      }
    }
    if (buffer) segments.push(buffer);
  }

  // 3. Calculate proportional speech duration weights (characters + pause weight)
  const weights = segments.map((seg) => {
    const charWeight = seg.replace(/\s+/g, '').length;
    const pauseBonus = /[.!?]$/.test(seg) ? 5 : /[,;:—]$/.test(seg) ? 2 : 0;
    return Math.max(charWeight + pauseBonus, 4);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;
  let cursor = 0;

  return segments.map((text, index) => {
    const startRatio = cursor / totalWeight;
    cursor += weights[index];
    const endRatio = index === segments.length - 1 ? 1 : cursor / totalWeight;
    return {
      index,
      text,
      startRatio,
      endRatio,
    };
  });
}

export interface ActiveNarrationState {
  sentences: NarrationSentence[];
  activeSentence: NarrationSentence | null;
  activeIndex: number;
  /** 0..1 progress within the active sentence */
  sentenceProgress: number;
}

export function getActiveNarrationState(
  rawText: string,
  chapterProgress: number
): ActiveNarrationState {
  const sentences = splitNarrationSentences(rawText);
  if (sentences.length === 0) {
    return {
      sentences: [],
      activeSentence: null,
      activeIndex: 0,
      sentenceProgress: 0,
    };
  }

  const p = Math.max(0, Math.min(1, chapterProgress));
  let activeIndex = sentences.findIndex((s) => p >= s.startRatio && p < s.endRatio);
  if (activeIndex === -1) {
    activeIndex = p >= 1 ? sentences.length - 1 : 0;
  }

  const activeSentence = sentences[activeIndex];
  const span = Math.max(activeSentence.endRatio - activeSentence.startRatio, 0.001);
  const sentenceProgress = Math.max(0, Math.min(1, (p - activeSentence.startRatio) / span));

  return {
    sentences,
    activeSentence,
    activeIndex,
    sentenceProgress,
  };
}
