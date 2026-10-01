/**
 * Waveform & Audio Amplitude Utilities (CapCut Style)
 * Supports real Web Audio decoding, caching, and deterministic synthesis.
 */

// Memory cache for decoded peaks
const peaksCache = new Map<string, number[]>();
const audioBufferCache = new Map<string, AudioBuffer>();

/**
 * Converts linear volume (0.0 to 2.0) to decibels (dB)
 * 1.0 = 0.0 dB
 * 0.5 = -6.0 dB
 * 1.5 = +3.5 dB
 * 2.0 = +6.0 dB
 */
export function volumeToDb(volume: number): number {
  if (volume <= 0.001) return -60;
  return Math.round(20 * Math.log10(volume) * 10) / 10;
}

/**
 * Formats user-facing volume label
 * e.g. "100% (0.0 dB)", "125% (+1.9 dB)", "Silenciado"
 */
export function formatVolumeText(volume: number, isMuted?: boolean): string {
  if (isMuted || volume <= 0.001) {
    return 'Silenciado (0%)';
  }
  const pct = Math.round(volume * 100);
  const db = volumeToDb(volume);
  const sign = db > 0 ? '+' : '';
  return `${pct}% (${sign}${db.toFixed(1)} dB)`;
}

/**
 * Deterministic pseudo-random number generator for consistent procedural waveforms
 */
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates realistic audio waveform peaks with musical/speech cadence
 * (rhythmic envelopes, speech pauses, dynamic range)
 */
export function generateProceduralPeaks(seedKey: string, count = 100): number[] {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i);
    hash |= 0;
  }
  const rnd = pseudoRandom(Math.abs(hash) || 123456);

  const peaks: number[] = [];
  let currentEnergy = 0.45;

  for (let i = 0; i < count; i++) {
    // Envelope pattern: speech cadence / rhythm fluctuation
    const cadence = Math.sin((i / 8) * Math.PI) * 0.25;
    const microVariation = (rnd() - 0.5) * 0.35;
    const burst = rnd() > 0.88 ? 0.35 : 0;
    const pause = rnd() < 0.08 ? -0.4 : 0;

    currentEnergy = Math.max(0.12, Math.min(0.95, currentEnergy * 0.75 + (0.4 + cadence + microVariation + burst + pause) * 0.25));
    peaks.push(parseFloat(currentEnergy.toFixed(3)));
  }

  return peaks;
}

/**
 * Fetches and decodes AudioBuffer from an asset URL
 */
export async function getDecodedAudioBuffer(url: string): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined' || !url) return null;

  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url)!;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(url, decoded);
    return decoded;
  } catch (err) {
    console.warn('Could not decode audio for URL:', url, err);
    return null;
  }
}

/**
 * Extracts normalized peak amplitudes from an AudioBuffer
 */
export function extractPeaksFromBuffer(buffer: AudioBuffer, targetCount = 200): number[] {
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const blockSize = Math.floor(totalSamples / targetCount);
  const peaks: number[] = [];

  let maxPeak = 0.001;

  for (let i = 0; i < targetCount; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalSamples);
    let sumSquares = 0;
    let peakInBlock = 0;

    for (let j = start; j < end; j += 4) {
      const val = Math.abs(channelData[j]);
      if (val > peakInBlock) peakInBlock = val;
      sumSquares += val * val;
    }

    const count = Math.max(1, Math.floor((end - start) / 4));
    const rms = Math.sqrt(sumSquares / count);
    const combined = peakInBlock * 0.7 + rms * 0.3;

    if (combined > maxPeak) maxPeak = combined;
    peaks.push(combined);
  }

  // Normalize between 0.1 and 0.95
  return peaks.map((p) => {
    const norm = p / maxPeak;
    return parseFloat(Math.max(0.1, Math.min(0.95, norm)).toFixed(3));
  });
}

/**
 * Obtains peaks for a media asset, falling back instantly to deterministic peaks
 */
export async function getWaveformPeaks(
  assetUrl?: string,
  sampleCount = 120,
  seedKey = 'default_media'
): Promise<number[]> {
  const cacheKey = `${assetUrl || seedKey}_${sampleCount}`;
  if (peaksCache.has(cacheKey)) {
    return peaksCache.get(cacheKey)!;
  }

  // If no asset URL, return deterministic peaks immediately
  if (!assetUrl) {
    const procedural = generateProceduralPeaks(seedKey, sampleCount);
    peaksCache.set(cacheKey, procedural);
    return procedural;
  }

  try {
    const buffer = await getDecodedAudioBuffer(assetUrl);
    if (buffer) {
      const extracted = extractPeaksFromBuffer(buffer, sampleCount);
      peaksCache.set(cacheKey, extracted);
      return extracted;
    }
  } catch {}

  // Fallback to deterministic peaks if fetch/decode failed
  const procedural = generateProceduralPeaks(seedKey, sampleCount);
  peaksCache.set(cacheKey, procedural);
  return procedural;
}

/**
 * Slices full asset waveform peaks according to clip trim and playback speed
 */
export function sliceWaveformPeaks(
  fullPeaks: number[],
  trimStart: number,
  duration: number,
  totalDuration: number,
  speed = 1.0,
  targetCount = 80
): number[] {
  if (!fullPeaks || fullPeaks.length === 0) {
    return generateProceduralPeaks('slice_fallback', targetCount);
  }

  const effectiveTotal = Math.max(0.1, totalDuration || duration + trimStart);
  const mediaWindowDuration = duration * speed;
  const startFraction = Math.max(0, Math.min(1, trimStart / effectiveTotal));
  const endFraction = Math.max(startFraction + 0.01, Math.min(1, (trimStart + mediaWindowDuration) / effectiveTotal));

  const startIndex = Math.floor(startFraction * (fullPeaks.length - 1));
  const endIndex = Math.ceil(endFraction * (fullPeaks.length - 1));
  const slicedRange = fullPeaks.slice(startIndex, Math.max(startIndex + 1, endIndex + 1));

  if (slicedRange.length === 0) return fullPeaks.slice(0, targetCount);

  // Resample slicedRange to targetCount
  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(slicedRange.length - 1, Math.floor((i / targetCount) * slicedRange.length));
    result.push(slicedRange[idx]);
  }

  return result;
}
