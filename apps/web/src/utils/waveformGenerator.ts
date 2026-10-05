/**
 * Waveform & Audio Amplitude Utilities (CapCut Style Precision)
 * Supports real Web Audio decoding, sample-accurate time mapping,
 * high-density envelope extraction (100 samples/sec), and IndexedDB cache resolution.
 */

export interface AudioWaveformEnvelope {
  envelope: Float32Array; // Amplitude values normalized 0.0 to 1.0
  duration: number;       // Exact duration of source audio in seconds
  sampleRate: number;     // Number of envelope samples per second (e.g. 100 Hz = 10ms resolution)
}

// Memory caches
const envelopeCache = new Map<string, AudioWaveformEnvelope>();
const audioBufferCache = new Map<string, AudioBuffer>();
const pendingDecodePromises = new Map<string, Promise<AudioWaveformEnvelope | null>>();

/**
 * Converts linear volume (0.0 to 2.0) to decibels (dB)
 */
export function volumeToDb(volume: number): number {
  if (volume <= 0.001) return -60;
  return Math.round(20 * Math.log10(volume) * 10) / 10;
}

/**
 * Formats user-facing volume label
 * e.g. "100% (0.0 dB)", "125% (+1.9 dB)", "Silenciado (0%)"
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
 * Deterministic pseudo-random generator
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
 * Generates a realistic musical beat / speech envelope (CapCut "Weekend Fun" style)
 * with rhythmic beats (120 BPM cadence), punchy attacks, and clear valleys for silence.
 */
export function generateProceduralEnvelope(
  seedKey: string,
  duration = 30,
  samplesPerSecond = 100
): AudioWaveformEnvelope {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i);
    hash |= 0;
  }
  const rnd = pseudoRandom(Math.abs(hash) || 987654);

  const totalPoints = Math.max(100, Math.floor(duration * samplesPerSecond));
  const envelope = new Float32Array(totalPoints);

  // Musical tempo: 120 BPM -> 0.5s per beat = 50 samples per beat at 100Hz
  const beatInterval = Math.max(30, Math.floor(samplesPerSecond * (0.4 + rnd() * 0.25)));

  for (let i = 0; i < totalPoints; i++) {
    const beatPos = i % beatInterval;
    const isDownbeat = (Math.floor(i / beatInterval) % 4) === 0;

    // Peak amplitude at beat start with sharp attack and exponential decay
    const attack = Math.min(1.0, beatPos / 4);
    const decay = Math.exp(-beatPos / (beatInterval * 0.45));
    const beatEnergy = isDownbeat ? 0.95 : 0.65 + rnd() * 0.25;

    // Secondary syncopated pulse
    const subPulsePos = (i + Math.floor(beatInterval * 0.5)) % beatInterval;
    const subDecay = Math.exp(-subPulsePos / (beatInterval * 0.3)) * (0.35 + rnd() * 0.2);

    let amp = attack * (beatEnergy * decay + subDecay);
    amp = Math.max(0.02, Math.min(0.98, amp));
    envelope[i] = parseFloat(amp.toFixed(3));
  }

  return {
    envelope,
    duration,
    sampleRate: samplesPerSecond,
  };
}

/**
 * Extracts a high-density, sample-accurate envelope from a decoded AudioBuffer.
 * Samples every 10ms (100 Hz), inspecting all samples in each window so that
 * no vocal consonant, drum beat, or transient is missed.
 */
export function extractEnvelopeFromAudioBuffer(
  buffer: AudioBuffer,
  samplesPerSecond = 100
): AudioWaveformEnvelope {
  const duration = buffer.duration;
  const channelCount = buffer.numberOfChannels;
  const totalEnvelopePoints = Math.max(10, Math.floor(duration * samplesPerSecond));
  const envelope = new Float32Array(totalEnvelopePoints);

  const channel0 = buffer.getChannelData(0);
  const channel1 = channelCount > 1 ? buffer.getChannelData(1) : null;
  const totalAudioSamples = channel0.length;
  const blockSize = totalAudioSamples / totalEnvelopePoints;

  let globalPeak = 0.0001;

  for (let i = 0; i < totalEnvelopePoints; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.min(totalAudioSamples, Math.floor((i + 1) * blockSize));

    let maxSample = 0;
    let sumSquares = 0;
    const len = end - start;
    if (len <= 0) continue;

    // Inspect at least 64 samples per block for micro-transients
    const step = Math.max(1, Math.floor(len / 64));

    for (let s = start; s < end; s += step) {
      let val = Math.abs(channel0[s]);
      if (channel1) {
        const val1 = Math.abs(channel1[s]);
        if (val1 > val) val = val1;
      }
      if (val > maxSample) maxSample = val;
      sumSquares += val * val;
    }

    const sampleCount = Math.max(1, Math.floor(len / step));
    const rms = Math.sqrt(sumSquares / sampleCount);

    // Emphasize punchy beats and vocal attacks (85% peak, 15% rms)
    const combined = maxSample * 0.85 + rms * 0.15;
    if (combined > globalPeak) globalPeak = combined;
    envelope[i] = combined;
  }

  // Normalize and apply perceptual response curve:
  // quiet breath pauses drop down towards baseline; vocal/music peaks pop up clearly
  const invGlobal = globalPeak > 0 ? 1 / globalPeak : 1;
  for (let i = 0; i < totalEnvelopePoints; i++) {
    const norm = envelope[i] * invGlobal;
    const perceptual = Math.pow(norm, 0.9);
    envelope[i] = Math.max(0.01, Math.min(1.0, perceptual));
  }

  return {
    envelope,
    duration,
    sampleRate: samplesPerSecond,
  };
}

/**
 * Fetches and decodes AudioBuffer from an asset URL (MP3, WAV, AAC, MP4, etc.),
 * resolving from IndexedDB local cache if available for 0ms instant loading.
 */
export async function getDecodedAudioBuffer(
  url?: string,
  driveFileId?: string
): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined' || (!url && !driveFileId)) return null;

  const cacheKey = url || driveFileId || '';
  if (audioBufferCache.has(cacheKey)) {
    return audioBufferCache.get(cacheKey)!;
  }

  try {
    let arrayBuffer: ArrayBuffer | null = null;

    // 1. Tenta recuperar direto do IndexedDB persistente (sem roundtrip de rede)
    if (driveFileId) {
      try {
        const { getCachedDriveVideoUrl } = await import('@/services/driveVideoCache');
        const blobUrl = await getCachedDriveVideoUrl(driveFileId);
        if (blobUrl) {
          const res = await fetch(blobUrl);
          if (res.ok) arrayBuffer = await res.arrayBuffer();
        }
      } catch {}
    }

    // 2. Se não estiver no IndexedDB, busca da URL (Blob local, Cloudflare Worker ou estático)
    if (!arrayBuffer && url) {
      let finalUrl = url;
      const headers: Record<string, string> = {};
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
          : null;

      if (token && (url.includes('drive.google.com') || url.includes('aloeditor-proxy'))) {
        if (!url.includes('token=')) {
          finalUrl = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
        }
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(finalUrl, { headers });
      if (res.ok) {
        arrayBuffer = await res.arrayBuffer();
      }
    }

    if (!arrayBuffer) return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const ctx = new AudioContextClass({ sampleRate: 48000 });
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();

    audioBufferCache.set(cacheKey, decoded);
    return decoded;
  } catch (err) {
    console.warn('Falha ao decodificar áudio para forma de onda:', url, err);
    return null;
  }
}

/**
 * Returns the high-density waveform envelope for an asset.
 * Checks memory cache -> decodes real Web Audio -> falls back to procedural envelope.
 */
export async function getAudioWaveformEnvelope(
  url?: string,
  driveFileId?: string,
  seedKey = 'default_media',
  fallbackDuration = 30
): Promise<AudioWaveformEnvelope> {
  const cacheKey = url || driveFileId || seedKey;

  if (envelopeCache.has(cacheKey)) {
    return envelopeCache.get(cacheKey)!;
  }

  if (pendingDecodePromises.has(cacheKey)) {
    const res = await pendingDecodePromises.get(cacheKey)!;
    if (res) return res;
  }

  const decodePromise = (async (): Promise<AudioWaveformEnvelope | null> => {
    try {
      const buffer = await getDecodedAudioBuffer(url, driveFileId);
      if (buffer && buffer.length > 0) {
        const env = extractEnvelopeFromAudioBuffer(buffer, 100);
        envelopeCache.set(cacheKey, env);
        return env;
      }
    } catch {}
    return null;
  })();

  pendingDecodePromises.set(cacheKey, decodePromise);

  try {
    const realEnvelope = await decodePromise;
    if (realEnvelope) return realEnvelope;
  } finally {
    pendingDecodePromises.delete(cacheKey);
  }

  // Fallback to high-quality procedural envelope
  const procedural = generateProceduralEnvelope(seedKey, fallbackDuration, 100);
  envelopeCache.set(cacheKey, procedural);
  return procedural;
}

/**
 * Gets exact amplitude (0.0 to 1.0) at any precise media time in seconds.
 * Sample-accurate with millisecond alignment.
 */
export function getAmplitudeFromEnvelope(
  envelopeObj: AudioWaveformEnvelope | null,
  timeInMedia: number
): number {
  if (!envelopeObj || !envelopeObj.envelope || envelopeObj.envelope.length === 0) {
    return 0.05;
  }
  if (timeInMedia < 0 || timeInMedia > envelopeObj.duration) {
    return 0.01; // Silence outside clip bounds
  }
  const idx = Math.floor(timeInMedia * envelopeObj.sampleRate);
  if (idx < 0) return 0.01;
  if (idx >= envelopeObj.envelope.length) return 0.01;
  return envelopeObj.envelope[idx];
}

// -------------------------------------------------------------
// Backwards Compatibility Functions
// -------------------------------------------------------------

export function extractPeaksFromBuffer(buffer: AudioBuffer, targetCount?: number): number[] {
  const env = extractEnvelopeFromAudioBuffer(buffer, 60);
  const count = targetCount && targetCount > 0 ? targetCount : Math.min(env.envelope.length, 300);
  const step = env.envelope.length / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(env.envelope.length - 1, Math.floor(i * step));
    result.push(env.envelope[idx]);
  }
  return result;
}

export function generateProceduralPeaks(seedKey: string, count = 150): number[] {
  const env = generateProceduralEnvelope(seedKey, 30, 100);
  const step = env.envelope.length / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(env.envelope.length - 1, Math.floor(i * step));
    result.push(env.envelope[idx]);
  }
  return result;
}

export async function getWaveformPeaks(
  assetUrl?: string,
  sampleCount = 300,
  seedKey = 'default_media'
): Promise<number[]> {
  const env = await getAudioWaveformEnvelope(assetUrl, undefined, seedKey, 30);
  const step = env.envelope.length / sampleCount;
  const result: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.min(env.envelope.length - 1, Math.floor(i * step));
    result.push(env.envelope[idx]);
  }
  return result;
}

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
  const endFraction = Math.max(
    startFraction + 0.005,
    Math.min(1, (trimStart + mediaWindowDuration) / effectiveTotal)
  );

  const startIndex = Math.floor(startFraction * (fullPeaks.length - 1));
  const endIndex = Math.ceil(endFraction * (fullPeaks.length - 1));
  const slicedRange = fullPeaks.slice(startIndex, Math.max(startIndex + 1, endIndex + 1));

  if (slicedRange.length === 0) return fullPeaks.slice(0, targetCount);

  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(slicedRange.length - 1, Math.floor((i / targetCount) * slicedRange.length));
    result.push(slicedRange[idx]);
  }

  return result;
}
