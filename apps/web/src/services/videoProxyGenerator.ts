import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { openCacheDatabase } from './driveVideoCache';

const STORE_NAME = 'drive_videos';
const PROXY_KEY_PREFIX = 'proxy_360p_';

// Cache em memória RAM de URLs de Blob dos proxies 360p para acesso síncrono e instantâneo (0ms)
const inMemoryProxyUrls = new Map<string, string>();
const activeProxyTasks = new Map<string, Promise<string>>();

/**
 * Calcula as dimensões ideais em 360p preservando a proporção de tela original:
 * - Vídeo Horizontal (16:9) -> 640 x 360
 * - Vídeo Vertical (9:16 Shorts/Reels/TikTok) -> 360 x 640
 * - Vídeo Quadrado (1:1) -> 360 x 360
 * Garante números pares (exigência dos encoders H.264/AVC)
 */
export function calculate360pDimensions(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  if (!sourceWidth || !sourceHeight) {
    return { width: 640, height: 360 };
  }

  const aspectRatio = sourceWidth / sourceHeight;
  let width: number;
  let height: number;

  if (aspectRatio >= 1) {
    // Horizontal ou quadrado: base na altura de 360px
    height = 360;
    width = Math.round(360 * aspectRatio);
  } else {
    // Vertical (9:16 reels/tiktok): base na largura de 360px
    width = 360;
    height = Math.round(360 / aspectRatio);
  }

  // Encoders H.264 requerem dimensões pares
  width = width % 2 === 0 ? width : width + 1;
  height = height % 2 === 0 ? height : height + 1;

  return { width, height };
}

/**
 * Verifica se o vídeo precisa de um proxy 360p.
 * Se já for menor ou igual a 480p, não há ganho em transcodificar.
 */
export function needsProxy(width?: number, height?: number): boolean {
  if (!width || !height) return true;
  return width > 480 || height > 480;
}

/**
 * Busca o proxy 360p já gravado em memória ou no IndexedDB.
 */
export async function getCached360pProxyUrl(fileIdOrAssetId: string): Promise<string | null> {
  if (!fileIdOrAssetId) return null;
  const key = `${PROXY_KEY_PREFIX}${fileIdOrAssetId}`;

  // 1. Checa memória RAM imediata (0ms)
  if (inMemoryProxyUrls.has(key)) {
    return inMemoryProxyUrls.get(key)!;
  }

  // 2. Checa IndexedDB persistente
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result;
        if (record && record.blob) {
          const blobUrl = URL.createObjectURL(record.blob);
          inMemoryProxyUrls.set(key, blobUrl);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Salva o Blob do proxy 360p no IndexedDB.
 */
async function saveProxyToIndexedDB(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        fileId: key,
        blob,
        mimeType: 'video/mp4',
        size: blob.size,
        timestamp: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (err) {
    console.warn('[Proxy360p] Falha ao persistir proxy no IndexedDB (mantido em RAM):', err);
  }
}

/**
 * Busca o codec suportado para o VideoEncoder de WebCodecs.
 */
async function getSupportedProxyCodec(width: number, height: number, bitrate: number) {
  if (typeof (window as any).VideoEncoder === 'undefined') return null;

  const candidates = [
    { codec: 'avc1.42e01e', muxerCodec: 'avc' as const }, // H.264 Baseline Profile (Ultra-compatível com celulares)
    { codec: 'avc1.4d001f', muxerCodec: 'avc' as const }, // H.264 Main Profile
    { codec: 'vp09.00.10.08', muxerCodec: 'vp9' as const }, // VP9
  ];

  for (const candidate of candidates) {
    try {
      const support = await (window as any).VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (support && support.supported) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

/**
 * Avança o vídeo com precisão até um instante específico de forma não-bloqueante.
 */
function seekVideoSafe(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - targetTime) < 0.03 && !video.seeking && video.readyState >= 2) {
      return resolve();
    }

    let settled = false;
    let timer: any = null;

    const done = () => {
      if (!settled) {
        settled = true;
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', done);
        if (timer) clearTimeout(timer);
        resolve();
      }
    };

    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', done, { once: true });
    timer = setTimeout(done, 300); // 300ms de segurança máxima por quadro

    try {
      video.currentTime = targetTime;
    } catch {
      done();
    }
  });
}

export interface ProxyGenerationOptions {
  fileId: string;
  sourceUrl: string;
  duration?: number;
  onProgress?: (pct: number) => void;
}

/**
 * Gera um proxy leve em 360p em segundo plano (background) usando aceleração por hardware.
 * 
 * - Redução de ~88% nos pixels a decodificar.
 * - Keyframe a cada 1 segundo (scrubbing instantâneo com zero lag).
 * - Preserva áudio sincronizado.
 * - Salva no IndexedDB local para carregamento futuro em 0ms.
 */
export async function generate360pProxy(options: {
  fileId: string;
  sourceUrl: string;
  duration?: number;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const { fileId, sourceUrl } = options;
  if (!fileId || !sourceUrl) return sourceUrl;

  const key = `${PROXY_KEY_PREFIX}${fileId}`;

  // 1. Se já está no cache, retorna imediatamente
  const existing = await getCached360pProxyUrl(fileId);
  if (existing) {
    options.onProgress?.(100);
    return existing;
  }

  // 2. Se já existe uma tarefa em andamento para este arquivo, reutiliza
  if (activeProxyTasks.has(key)) {
    return activeProxyTasks.get(key)!;
  }

  const task = (async (): Promise<string> => {
    let video: HTMLVideoElement | null = null;
    let audioContext: AudioContext | null = null;

    try {
      options.onProgress?.(5);

      // Carrega o vídeo fonte para obter metadados
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = sourceUrl;

      await new Promise<void>((resolve, reject) => {
        if (!video) return reject(new Error('Elemento de vídeo não inicializado'));
        if (video.readyState >= 1) return resolve();
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Falha ao ler metadados do vídeo para geração de proxy'));
      });

      const srcWidth = video.videoWidth || 1920;
      const srcHeight = video.videoHeight || 1080;
      const videoDuration = Math.max(1, options.duration || video.duration || 10);

      // Se o vídeo já for 360p ou menor, não precisa transcodificar
      if (!needsProxy(srcWidth, srcHeight)) {
        options.onProgress?.(100);
        return sourceUrl;
      }

      const { width, height } = calculate360pDimensions(srcWidth, srcHeight);
      const bitrate = 650_000; // 650 kbps - levíssimo e nítido para 360p
      const fps = 24; // Padrão cinema suave e 20% mais rápido que 30fps

      // 3. Extração do Áudio Original via Web Audio API
      let audioBuffer: AudioBuffer | null = null;
      try {
        const response = await fetch(sourceUrl);
        const arrayBuf = await response.arrayBuffer();
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          audioContext = new AudioCtxClass({ sampleRate: 48000 });
          audioBuffer = await audioContext.decodeAudioData(arrayBuf);
        }
      } catch (err) {
        // Áudio não decodificado ou vídeo mudo - prossegue com proxy de vídeo
        console.warn('[Proxy360p] Áudio não pôde ser decodificado ou não existe na fonte:', err);
      }

      options.onProgress?.(15);

      // 4. Configuração do WebCodecs Video & Audio Encoders
      const selectedVideoCodec = await getSupportedProxyCodec(width, height, bitrate);

      if (!selectedVideoCodec || typeof (window as any).VideoFrame === 'undefined') {
        // WebCodecs não disponível no navegador do usuário (fallback gracioso para o vídeo original)
        console.info('[Proxy360p] WebCodecs não suportado neste navegador, mantendo fonte direta.');
        options.onProgress?.(100);
        return sourceUrl;
      }

      // Verificação do AudioEncoder AAC
      let hasAudio = false;
      let audioEncoder: any = null;

      if (audioBuffer && typeof (window as any).AudioEncoder !== 'undefined') {
        try {
          const numChannels = Math.min(2, audioBuffer.numberOfChannels);
          const aacSupport = await (window as any).AudioEncoder.isConfigSupported({
            codec: 'mp4a.40.2',
            sampleRate: 48000,
            numberOfChannels: numChannels,
            bitrate: 128000,
          });
          if (aacSupport && aacSupport.supported) {
            hasAudio = true;
          }
        } catch {}
      }

      // Se o vídeo fonte TEM áudio, mas o navegador não suporta AudioEncoder,
      // evitamos gerar um proxy mudo para não prejudicar a edição sonora do usuário
      if (audioBuffer && audioBuffer.numberOfChannels > 0 && !hasAudio) {
        console.info('[Proxy360p] AudioEncoder não disponível no navegador; mantendo vídeo original com áudio completo.');
        options.onProgress?.(100);
        return sourceUrl;
      }

      // 5. Inicialização do MP4 Muxer
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: selectedVideoCodec.muxerCodec,
          width,
          height,
          frameRate: fps,
        },
        ...(hasAudio && audioBuffer
          ? {
              audio: {
                codec: 'aac' as const,
                sampleRate: 48000,
                numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
              },
            }
          : {}),
        fastStart: 'in-memory',
      });

      // 6. Encodificação de Áudio Instantânea (0.1s)
      if (hasAudio && audioBuffer) {
        try {
          const numChannels = Math.min(2, audioBuffer.numberOfChannels);
          audioEncoder = new (window as any).AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (e: any) => console.warn('[Proxy360p] AudioEncoder warning:', e),
          });

          await audioEncoder.configure({
            codec: 'mp4a.40.2',
            sampleRate: 48000,
            numberOfChannels: numChannels,
            bitrate: 128000,
          });

          const chunkSize = 2048;
          const totalFrames = audioBuffer.length;
          const left = audioBuffer.getChannelData(0);
          const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

          for (let offset = 0; offset < totalFrames; offset += chunkSize) {
            const frames = Math.min(chunkSize, totalFrames - offset);
            const planarData = new Float32Array(frames * numChannels);
            planarData.set(left.subarray(offset, offset + frames), 0);
            if (numChannels > 1) {
              planarData.set(right.subarray(offset, offset + frames), frames);
            }

            const audioData = new (window as any).AudioData({
              format: 'f32-planar',
              sampleRate: 48000,
              numberOfFrames: frames,
              numberOfChannels: numChannels,
              timestamp: Math.round((offset / 48000) * 1_000_000),
              data: planarData,
            });

            audioEncoder.encode(audioData);
            audioData.close();
          }

          await audioEncoder.flush();
        } catch (e) {
          console.warn('[Proxy360p] Encodificação de áudio falhou:', e);
        }
      }

      options.onProgress?.(25);

      // 7. Encodificação de Vídeo 360p por Hardware
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Não foi possível criar contexto 2D para renderização de proxy');

      const videoEncoder = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
        error: (e: any) => console.error('[Proxy360p] Erro no VideoEncoder:', e),
      });

      await videoEncoder.configure({
        codec: selectedVideoCodec.codec,
        width,
        height,
        bitrate,
        hardwareAcceleration: 'prefer-hardware',
        framerate: fps,
      });

      const totalVideoFrames = Math.max(1, Math.round(videoDuration * fps));
      let lastReportedPct = 25;

      for (let f = 0; f < totalVideoFrames; f++) {
        const currentTime = (f / totalVideoFrames) * videoDuration;
        await seekVideoSafe(video, currentTime);

        ctx.drawImage(video, 0, 0, width, height);

        const timestampUs = Math.round((f / fps) * 1_000_000);
        // Keyframe a cada 1 segundo (24 frames): agilidade máxima para scrubbing na timeline
        const isKeyFrame = f % fps === 0;

        const videoFrame = new (window as any).VideoFrame(canvas, { timestamp: timestampUs });
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        // Notifica progresso suave sem sobrecarregar a UI
        if (f % 12 === 0 || f === totalVideoFrames - 1) {
          const currentPct = Math.min(98, 25 + Math.round((f / totalVideoFrames) * 73));
          if (currentPct > lastReportedPct) {
            lastReportedPct = currentPct;
            options.onProgress?.(currentPct);
          }
          // Cede a execução para a main thread não travar navegação
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      await videoEncoder.flush();
      muxer.finalize();

      // 8. Salva o Proxy 360p gerado
      const proxyBlob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      await saveProxyToIndexedDB(key, proxyBlob);

      const proxyBlobUrl = URL.createObjectURL(proxyBlob);
      inMemoryProxyUrls.set(key, proxyBlobUrl);

      options.onProgress?.(100);
      return proxyBlobUrl;
    } catch (err: any) {
      console.warn('[Proxy360p] Geração de proxy interrompida, mantendo reprodução com fonte original:', err?.message);
      return sourceUrl;
    } finally {
      if (audioContext && audioContext.state !== 'closed') {
        try {
          audioContext.close();
        } catch {}
      }
      if (video) {
        video.src = '';
        video.load();
      }
      activeProxyTasks.delete(key);
    }
  })();

  activeProxyTasks.set(key, task);
  return task;
}

/**
 * Remove o proxy 360p associado a um vídeo do cache e libera a memória RAM.
 */
export async function evict360pProxy(fileIdOrAssetId: string): Promise<void> {
  const key = `${PROXY_KEY_PREFIX}${fileIdOrAssetId}`;
  if (inMemoryProxyUrls.has(key)) {
    const url = inMemoryProxyUrls.get(key)!;
    URL.revokeObjectURL(url);
    inMemoryProxyUrls.delete(key);
  }

  try {
    const db = await openCacheDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch {}
}

/**
 * Libera todas as URLs de proxy 360p em memória RAM
 */
export function clearAllProxyMemory(): void {
  inMemoryProxyUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  inMemoryProxyUrls.clear();
}

