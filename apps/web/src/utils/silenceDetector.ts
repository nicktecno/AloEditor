import { TimelineClip } from '@/types/editor';

export interface SilenceInterval {
  id: string;
  startInTimeline: number; // In seconds on the timeline
  endInTimeline: number;   // In seconds on the timeline
  duration: number;        // In seconds
  mediaStart: number;      // In seconds relative to media file
  mediaEnd: number;        // In seconds relative to media file
  selected: boolean;       // For UI check/uncheck
}

export interface SilenceDetectionOptions {
  minDuration: number;     // Minimum silence duration in seconds (default 1.0s)
  thresholdDb: number;     // Silence threshold in dB (default -35dB)
  padding: number;         // Safety vocal breathing padding in seconds (default 0.15s)
}

export interface SilenceDetectionResult {
  silences: SilenceInterval[];
  totalSilenceDuration: number;
  speechSegmentsCount: number;
  originalDuration: number;
}

// Global cache for decoded audio buffers to enable instant re-analysis
const audioBufferCache = new Map<string, AudioBuffer>();

/**
 * Carrega e decodifica o AudioBuffer de uma URL de mídia (áudio ou vídeo)
 */
export async function getAudioBufferForAsset(assetUrl: string): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') return null;

  if (audioBufferCache.has(assetUrl)) {
    return audioBufferCache.get(assetUrl)!;
  }

  try {
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Falha ao carregar mídia para áudio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBufferCache.set(assetUrl, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error('Erro ao decodificar AudioBuffer para detecção de silêncio:', err);
    return null;
  }
}

/**
 * Detecta intervalos de silêncio superiores a minDuration (ex: > 1.0s) em um clipe.
 * Suporta vídeo ou áudio, respeitando trimStart, duration e speed da timeline.
 */
export function detectSilencesInClip(
  audioBuffer: AudioBuffer,
  clip: TimelineClip,
  options: Partial<SilenceDetectionOptions> = {}
): SilenceDetectionResult {
  const {
    minDuration = 1.0,
    thresholdDb = -35,
    padding = 0.15,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const speed = clip.speed || 1.0;
  const mediaTrimStart = clip.trimStart || 0;
  const mediaDuration = clip.duration * speed;
  const mediaTrimEnd = mediaTrimStart + mediaDuration;

  const startSample = Math.max(0, Math.floor(mediaTrimStart * sampleRate));
  const endSample = Math.min(audioBuffer.length, Math.ceil(mediaTrimEnd * sampleRate));

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

  // Janela de análise de 40ms com salto de 20ms
  const windowSec = 0.04;
  const hopSec = 0.02;
  const windowSamples = Math.max(1, Math.floor(windowSec * sampleRate));
  const hopSamples = Math.max(1, Math.floor(hopSec * sampleRate));

  const rawSilentBlocks: Array<{ startSec: number; endSec: number }> = [];
  let inSilence = false;
  let silenceStartSec = 0;

  for (let s = startSample; s < endSample; s += hopSamples) {
    const currentMediaSec = s / sampleRate;
    let sumSq = 0;
    const limit = Math.min(s + windowSamples, endSample);
    const count = limit - s;

    if (count <= 0) break;

    for (let i = s; i < limit; i++) {
      const s0 = ch0[i] || 0;
      const s1 = ch1 ? ch1[i] || 0 : s0;
      const mono = (s0 + s1) * 0.5;
      sumSq += mono * mono;
    }

    const rms = Math.sqrt(sumSq / count);
    const db = 20 * Math.log10(Math.max(rms, 1e-6));
    const isSilentSample = db < thresholdDb;

    if (isSilentSample && !inSilence) {
      inSilence = true;
      silenceStartSec = currentMediaSec;
    } else if (!isSilentSample && inSilence) {
      inSilence = false;
      rawSilentBlocks.push({
        startSec: silenceStartSec,
        endSec: currentMediaSec,
      });
    }
  }

  if (inSilence) {
    rawSilentBlocks.push({
      startSec: silenceStartSec,
      endSec: mediaTrimEnd,
    });
  }

  // Ponte para unir micro-pausas/ruídos acidentais inferiores a 80ms
  const mergedSilences: Array<{ startSec: number; endSec: number }> = [];
  for (let i = 0; i < rawSilentBlocks.length; i++) {
    const cur = rawSilentBlocks[i];
    if (mergedSilences.length === 0) {
      mergedSilences.push({ ...cur });
    } else {
      const prev = mergedSilences[mergedSilences.length - 1];
      const gap = cur.startSec - prev.endSec;
      if (gap < 0.08) {
        // Intervalo de voz muito curto entre dois silêncios (respiração ou ruído residual), mescla!
        prev.endSec = cur.endSec;
      } else {
        mergedSilences.push({ ...cur });
      }
    }
  }

  // Filtra por duração mínima solicitada (ex: >= 1.0s) e aplica padding protetor de voz
  const silences: SilenceInterval[] = [];
  let totalSilenceDuration = 0;

  mergedSilences.forEach((block, idx) => {
    const rawDur = block.endSec - block.startSec;
    if (rawDur >= minDuration) {
      // Aplica padding para não cortar início/fim de palavras
      const paddedMediaStart = Math.min(block.endSec, block.startSec + padding);
      const paddedMediaEnd = Math.max(paddedMediaStart, block.endSec - padding);
      const effectiveMediaDuration = paddedMediaEnd - paddedMediaStart;

      // Só cria o corte se ainda sobrar silêncio perceptível após a margem de segurança
      if (effectiveMediaDuration >= 0.25) {
        // Converte de tempo de mídia para coordenadas da timeline
        const offsetFromClipStart = (paddedMediaStart - mediaTrimStart) / speed;
        const timelineStart = clip.startInTimeline + offsetFromClipStart;
        const timelineDuration = effectiveMediaDuration / speed;
        const timelineEnd = timelineStart + timelineDuration;

        silences.push({
          id: `silence_${idx}_${Math.round(timelineStart * 100)}`,
          startInTimeline: timelineStart,
          endInTimeline: timelineEnd,
          duration: timelineDuration,
          mediaStart: paddedMediaStart,
          mediaEnd: paddedMediaEnd,
          selected: true,
        });

        totalSilenceDuration += timelineDuration;
      }
    }
  });

  return {
    silences,
    totalSilenceDuration,
    speechSegmentsCount: silences.length + 1,
    originalDuration: clip.duration,
  };
}
