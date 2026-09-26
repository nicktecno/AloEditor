import { Project, TimelineClip, MediaAsset } from '@/types/editor';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getClipTransitionState } from '@/utils/transitionUtils';
import { processFrameBackgroundRemoval } from '@/utils/backgroundRemoval';

let exportBgOffscreenCanvas: HTMLCanvasElement | null = null;

/**
 * Busca e posiciona o elemento <video> no tempo exato em milissegundos.
 * Otimizado para máxima velocidade de renderização:
 * - Evita seeks desnecessários se a diferença de tempo for menor que meio quadro.
 * - Aguarda diretamente o evento `seeked` na memória sem travar esperando V-SYNC de monitor.
 * - Timeout ágil para garantir que a renderização nunca fique travada.
 */
function seekVideoAccurate(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    // Se o vídeo já está no tempo correto e pronto, resolve imediatamente (0ms)
    if (
      Math.abs(video.currentTime - targetTime) < 0.015 &&
      !video.seeking &&
      video.readyState >= 2
    ) {
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

    try {
      video.currentTime = targetTime;
    } catch {
      done();
    }

    // Timeout de segurança rápido (400ms) caso o decoder atrase
    timer = setTimeout(done, 400);
  });
}

/**
 * Detecta o melhor codec H.264/AVC ou VP9 suportado com aceleração de hardware pelo WebCodecs
 */
async function getSupportedWebCodecsConfig(
  width: number,
  height: number,
  bitrate: number
): Promise<{ codec: string; muxerCodec: 'avc' | 'vp9' } | null> {
  if (typeof window === 'undefined' || typeof (window as any).VideoEncoder === 'undefined') {
    return null;
  }

  const candidates: Array<{ codec: string; muxerCodec: 'avc' | 'vp9' }> = [
    { codec: 'avc1.4d002a', muxerCodec: 'avc' }, // H.264 Main Profile Level 4.2
    { codec: 'avc1.640028', muxerCodec: 'avc' }, // H.264 High Profile Level 4.0
    { codec: 'avc1.42001f', muxerCodec: 'avc' }, // H.264 Baseline Profile Level 3.1
    { codec: 'avc1.4d001f', muxerCodec: 'avc' }, // H.264 Main Profile Level 3.1
    { codec: 'vp09.00.10.08', muxerCodec: 'vp9' }, // VP9 Profile 0
  ];

  for (const item of candidates) {
    try {
      const config = {
        codec: item.codec,
        width,
        height,
        bitrate,
        hardwareAcceleration: 'prefer-hardware' as any,
      };
      const support = await (window as any).VideoEncoder.isConfigSupported(config);
      if (support && support.supported) {
        return item;
      }
    } catch {
      // Tenta o próximo codec
    }
  }

  return null;
}

/**
 * Mixa todas as trilhas de áudio do projeto (vídeos não silenciados, áudios destacados e trilhas de música),
 * aplicando transições de áudio (fade in / fade out) e controle de volume via OfflineAudioContext.
 */
async function mixProjectAudio(
  clips: TimelineClip[],
  assetMap: Map<string, MediaAsset>,
  duration: number,
  sampleRate = 48000
): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined' || typeof OfflineAudioContext === 'undefined') return null;

  const audioClips = clips.filter(
    (c) => (c.type === 'audio' || c.type === 'video') && !c.isMuted
  );
  if (audioClips.length === 0) return null;

  try {
    const totalSamples = Math.max(1, Math.ceil(duration * sampleRate));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    let anyLoaded = false;
    const cache = new Map<string, AudioBuffer>();

    for (const clip of audioClips) {
      const asset = assetMap.get(clip.assetId || '');
      if (!asset || !asset.url) continue;

      let buffer = cache.get(asset.url);
      if (!buffer) {
        try {
          const resp = await fetch(asset.url);
          const arrayBuf = await resp.arrayBuffer();
          buffer = await offlineCtx.decodeAudioData(arrayBuf);
          cache.set(asset.url, buffer);
        } catch {
          continue;
        }
      }

      if (!buffer) continue;
      anyLoaded = true;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clip.speed || 1.0;

      const gain = offlineCtx.createGain();
      const baseVol = clip.volume !== undefined ? clip.volume : 1.0;
      const startTime = Math.max(0, clip.startInTimeline);
      const endTime = Math.min(duration, startTime + clip.duration);

      gain.gain.setValueAtTime(baseVol, startTime);

      // Fade In (transitionIn)
      if (clip.transitionIn && clip.transitionIn.duration > 0) {
        const inDur = Math.min(clip.transitionIn.duration, clip.duration);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(baseVol, startTime + inDur);
      }

      // Fade Out (transitionOut)
      if (clip.transitionOut && clip.transitionOut.duration > 0) {
        const outDur = Math.min(clip.transitionOut.duration, clip.duration);
        gain.gain.setValueAtTime(baseVol, Math.max(startTime, endTime - outDur));
        gain.gain.linearRampToValueAtTime(0, endTime);
      }

      source.connect(gain);
      gain.connect(offlineCtx.destination);

      const offset = Math.max(0, clip.trimStart || 0);
      source.start(startTime, offset, clip.duration);
    }

    if (!anyLoaded) return null;
    return await offlineCtx.startRendering();
  } catch (err) {
    console.warn('Erro ao mixar áudio para exportação:', err);
    return null;
  }
}

/**
 * Desenha uma camada de clipe no Canvas fornecido
 */
function renderClipLayer(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  currentTime: number,
  width: number,
  height: number,
  loadedVideos: Map<string, HTMLVideoElement>,
  loadedImages: Map<string, HTMLImageElement>
) {
  const trans = getClipTransitionState(clip, currentTime);

  if (clip.type === 'video') {
    const video = loadedVideos.get(clip.assetId || '');
    if (video && video.readyState >= 2) {
      ctx.save();
      const posX = ((clip.transform.position.x + trans.positionX) / 100) * width;
      const posY = ((clip.transform.position.y + trans.positionY) / 100) * height;
      const scale = trans.scale;
      const rotRad = ((clip.transform.rotation || 0) * Math.PI) / 180;
      const opacity = trans.opacity;

      ctx.globalAlpha = opacity;
      ctx.translate(posX, posY);
      ctx.rotate(rotRad);
      ctx.scale(scale, scale);

      if (trans.filterString) {
        ctx.filter = trans.filterString;
      }

      const vidW = video.videoWidth || width;
      const vidH = video.videoHeight || height;
      const videoAspect = vidW / vidH;
      const canvasAspect = width / height;

      let drawW = width;
      let drawH = height;

      if (videoAspect > canvasAspect) {
        drawW = width;
        drawH = width / videoAspect;
      } else {
        drawH = height;
        drawW = height * videoAspect;
      }

      try {
        if (clip.backgroundRemoval?.enabled) {
          if (!exportBgOffscreenCanvas) {
            exportBgOffscreenCanvas = document.createElement('canvas');
          }
          const wInt = Math.max(1, Math.round(drawW));
          const hInt = Math.max(1, Math.round(drawH));
          if (exportBgOffscreenCanvas.width !== wInt || exportBgOffscreenCanvas.height !== hInt) {
            exportBgOffscreenCanvas.width = wInt;
            exportBgOffscreenCanvas.height = hInt;
          }
          const offCtx = exportBgOffscreenCanvas.getContext('2d');
          if (offCtx) {
            processFrameBackgroundRemoval(video, offCtx, wInt, hInt, clip.backgroundRemoval);
            ctx.drawImage(exportBgOffscreenCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
          } else {
            ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        } else {
          ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      } catch (e) {
        console.warn('Erro ao desenhar frame de vídeo:', e);
      }

      ctx.restore();
    }
  } else if (clip.type === 'image') {
    const img = loadedImages.get(clip.assetId || '');
    if (img && img.complete) {
      ctx.save();
      const posX = ((clip.transform.position.x + trans.positionX) / 100) * width;
      const posY = ((clip.transform.position.y + trans.positionY) / 100) * height;
      const scale = trans.scale;
      const rotRad = ((clip.transform.rotation || 0) * Math.PI) / 180;
      const opacity = trans.opacity;

      ctx.globalAlpha = opacity;
      ctx.translate(posX, posY);
      ctx.rotate(rotRad);
      ctx.scale(scale, scale);

      if (trans.filterString) {
        ctx.filter = trans.filterString;
      }

      const imgAspect = (img.naturalWidth || width) / (img.naturalHeight || height);
      const drawW = width;
      const drawH = width / imgAspect;

      try {
        if (clip.backgroundRemoval?.enabled) {
          if (!exportBgOffscreenCanvas) {
            exportBgOffscreenCanvas = document.createElement('canvas');
          }
          const wInt = Math.max(1, Math.round(drawW));
          const hInt = Math.max(1, Math.round(drawH));
          if (exportBgOffscreenCanvas.width !== wInt || exportBgOffscreenCanvas.height !== hInt) {
            exportBgOffscreenCanvas.width = wInt;
            exportBgOffscreenCanvas.height = hInt;
          }
          const offCtx = exportBgOffscreenCanvas.getContext('2d');
          if (offCtx) {
            processFrameBackgroundRemoval(img, offCtx, wInt, hInt, clip.backgroundRemoval);
            ctx.drawImage(exportBgOffscreenCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
          } else {
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        } else {
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      } catch {}

      ctx.restore();
    }
  } else if (clip.type === 'text') {
    ctx.save();
    const posX = ((clip.transform.position.x + trans.positionX) / 100) * width;
    const posY = ((clip.transform.position.y + trans.positionY) / 100) * height;
    const scale = trans.scale;
    const rotRad = ((clip.transform.rotation || 0) * Math.PI) / 180;
    const opacity = trans.opacity;
    const style = clip.textStyle;

    ctx.globalAlpha = opacity;
    ctx.translate(posX, posY);
    ctx.rotate(rotRad);
    ctx.scale(scale, scale);

    if (trans.filterString) {
      ctx.filter = trans.filterString;
    }

    const fontSize = Math.round((style?.fontSize || 36) * (width / 1280));
    ctx.font = `${style?.fontWeight || 'bold'} ${fontSize}px ${style?.fontFamily || 'Inter, sans-serif'}`;
    ctx.textAlign = (style?.textAlign as CanvasTextAlign) || 'center';
    ctx.textBaseline = 'middle';

    if (style?.shadowColor) {
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = (style.shadowBlur || 10) * (width / 1280);
    }

    if (style?.backgroundColor && style.backgroundColor !== 'transparent') {
      const textMetrics = ctx.measureText(clip.text || '');
      const padX = 18 * (width / 1280);
      const padY = 10 * (width / 1280);
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(
        -textMetrics.width / 2 - padX,
        -fontSize / 2 - padY,
        textMetrics.width + padX * 2,
        fontSize + padY * 2
      );
    }

    if (style?.strokeWidth && style.strokeWidth > 0 && style?.strokeColor) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth * (width / 1280);
      ctx.strokeText(clip.text || '', 0, 0);
    }

    ctx.fillStyle = style?.color || '#ffffff';
    ctx.fillText(clip.text || '', 0, 0);
    ctx.restore();
  }
}

/**
 * Renderizador Client-Side de Alta Performance.
 * Utiliza aceleração por hardware (WebCodecs), pré-carregamento em memória (Blob RAM),
 * e busca paralela de quadros sem bloqueio para velocidade até 15x mais rápida.
 */
export async function renderProjectClientSide({
  project,
  resolution = '1080p',
  fps = 30,
  format = 'mp4',
  onProgress,
}: {
  project: Project;
  resolution?: string;
  fps?: number;
  format?: string;
  onProgress?: (percent: number) => void;
}): Promise<Blob> {
  let width = 1920;
  let height = 1080;
  if (resolution === '720p') {
    width = 1280;
    height = 720;
  } else if (resolution === '4k') {
    width = 3840;
    height = 2160;
  }

  // Ajusta proporção de aspecto
  if (project.settings.aspectRatio === '9:16') {
    const temp = width;
    width = height;
    height = temp;
  } else if (project.settings.aspectRatio === '1:1') {
    height = width;
  } else if (project.settings.aspectRatio === '4:5') {
    width = 1080;
    height = 1350;
  } else if (project.settings.aspectRatio === '21:9') {
    width = 2560;
    height = 1080;
  }

  // Largura e altura pares para encoders de vídeo
  width = Math.floor(width / 2) * 2;
  height = Math.floor(height / 2) * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

  if (!ctx) {
    throw new Error('Não foi possível inicializar o contexto 2D do Canvas.');
  }

  onProgress?.(5);

  // 1. Identificar clipes visíveis da timeline
  const hiddenTrackIds = new Set(
    (project.tracks || []).filter((t) => t.isHidden).map((t) => t.id)
  );
  const timelineClips = project.clips.filter((c) => !hiddenTrackIds.has(c.trackId));

  // 2. Mapeamento de assets
  const assetMap = new Map<string, MediaAsset>();
  for (const asset of project.assets || []) {
    assetMap.set(asset.id, asset);
  }

  try {
    const cachedDrive = sessionStorage.getItem('alo_drive_videos_cache');
    const token = sessionStorage.getItem('alo_google_access_token');
    if (cachedDrive) {
      const driveFiles = JSON.parse(cachedDrive);
      if (Array.isArray(driveFiles)) {
        for (const file of driveFiles) {
          const aId = `asset_drive_${file.id}`;
          if (!assetMap.has(aId)) {
            assetMap.set(aId, {
              id: aId,
              name: file.name,
              type: file.mimeType?.startsWith('audio') ? 'audio' : 'video',
              url: `/api/drive/stream?fileId=${file.id}&token=${token || ''}`,
              driveFileId: file.id,
              duration: file.durationSeconds || 15.0,
              isDrive: true,
              thumbnailUrl: file.thumbnailUrl,
            });
          }
        }
      }
    }
  } catch {}

  // 3. Pré-carregamento veloz com Blob em memória RAM (acaba com requisições HTTP a cada frame)
  const loadedVideos = new Map<string, HTMLVideoElement>();
  const loadedImages = new Map<string, HTMLImageElement>();
  const createdBlobUrls: string[] = [];

  const videoClips = timelineClips.filter((c) => c.type === 'video');
  const imageClips = timelineClips.filter((c) => c.type === 'image');

  // Pre-carrega vídeos em paralelo
  await Promise.all(
    videoClips.map(async (clip) => {
      if (!clip.assetId || loadedVideos.has(clip.assetId)) return;
      const asset = assetMap.get(clip.assetId);
      if (!asset || !asset.url) return;

      try {
        let finalSrc = asset.url;

        // Se for URL de streaming HTTP, baixa em Blob para RAM (seeks 15x mais rápidos sem roundtrips de rede)
        try {
          const res = await fetch(asset.url);
          if (res.ok) {
            const blob = await res.blob();
            finalSrc = URL.createObjectURL(blob);
            createdBlobUrls.push(finalSrc);
          }
        } catch {
          // Usa a URL original caso fetch direto falhe
          finalSrc = asset.url;
        }

        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.src = finalSrc;

        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (!settled) {
              settled = true;
              v.removeEventListener('loadeddata', done);
              v.removeEventListener('canplay', done);
              v.removeEventListener('error', done);
              resolve();
            }
          };

          if (v.readyState >= 2) {
            resolve();
          } else {
            v.addEventListener('loadeddata', done, { once: true });
            v.addEventListener('canplay', done, { once: true });
            v.addEventListener('error', done, { once: true });
            setTimeout(done, 3500);
          }
        });

        loadedVideos.set(clip.assetId, v);
      } catch (e) {
        console.warn('Erro ao pré-carregar vídeo para exportação:', asset.name, e);
      }
    })
  );

  // Pre-carrega imagens
  await Promise.all(
    imageClips.map(async (clip) => {
      if (!clip.assetId || loadedImages.has(clip.assetId)) return;
      const asset = assetMap.get(clip.assetId);
      if (!asset || !asset.url) return;

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = asset.url;
        await new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 2000);
        });
        loadedImages.set(clip.assetId, img);
      } catch (e) {
        console.warn('Erro ao pré-carregar imagem:', asset.name, e);
      }
    })
  );

  onProgress?.(15);

  // Duração real calculada a partir dos clipes
  const clipEndTimes = timelineClips.map((c) => c.startInTimeline + c.duration);
  const maxClipEnd = clipEndTimes.length > 0 ? Math.max(...clipEndTimes) : project.duration;
  const renderDuration = Math.max(1, Math.min(maxClipEnd, 300));
  const totalFrames = Math.max(10, Math.floor(renderDuration * fps));
  const bitrate = resolution === '4k' ? 14_000_000 : resolution === '1080p' ? 7_000_000 : 3_500_000;

  // Pré-renderiza e mixa todo o áudio com fades e transições
  onProgress?.(12);
  const mixedAudioBuffer = await mixProjectAudio(timelineClips, assetMap, renderDuration);

  // Função para limpeza de URLs de memória criadas
  const cleanupBlobs = () => {
    for (const url of createdBlobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  };

  let lastProgress = 15;

  try {
    // 4. Verificação de suporte a WebCodecs VideoEncoder (Padrão ouro de velocidade por Hardware)
    const webCodecsConfig = await getSupportedWebCodecsConfig(width, height, bitrate);

    if (webCodecsConfig && typeof VideoFrame !== 'undefined') {
      // -----------------------------------------------------------------
      // MOTOR 1: WEBCODECS + MP4 MUXER (Aceleração Máxima por Hardware)
      // -----------------------------------------------------------------
      let hasAudio = false;
      let audioEncoder: any = null;

      if (mixedAudioBuffer && typeof (window as any).AudioEncoder !== 'undefined') {
        try {
          const aacSupport = await (window as any).AudioEncoder.isConfigSupported({
            codec: 'mp4a.40.2',
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 192000,
          });
          if (aacSupport && aacSupport.supported) {
            hasAudio = true;
          }
        } catch {}
      }

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: webCodecsConfig.muxerCodec,
          width,
          height,
          frameRate: fps,
        },
        ...(hasAudio
          ? {
              audio: {
                codec: 'aac' as const,
                sampleRate: 48000,
                numberOfChannels: 2,
              },
            }
          : {}),
        fastStart: 'in-memory',
      });

      if (hasAudio && mixedAudioBuffer) {
        try {
          audioEncoder = new (window as any).AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (e: any) => console.warn('AudioEncoder warning:', e),
          });
          await audioEncoder.configure({
            codec: 'mp4a.40.2',
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 192000,
          });

          const chunkSize = 2048;
          for (let offset = 0; offset < mixedAudioBuffer.length; offset += chunkSize) {
            const frames = Math.min(chunkSize, mixedAudioBuffer.length - offset);
            const data = new Float32Array(frames * 2);
            const left = mixedAudioBuffer.getChannelData(0).subarray(offset, offset + frames);
            const right =
              mixedAudioBuffer.numberOfChannels > 1
                ? mixedAudioBuffer.getChannelData(1).subarray(offset, offset + frames)
                : left;
            data.set(left, 0);
            data.set(right, frames);

            const audioData = new (window as any).AudioData({
              format: 'f32-planar',
              sampleRate: 48000,
              numberOfFrames: frames,
              numberOfChannels: 2,
              timestamp: Math.round((offset / 48000) * 1_000_000),
              data,
            });
            audioEncoder.encode(audioData);
            audioData.close();
          }
          await audioEncoder.flush();
        } catch (e) {
          console.warn('Falha ao encodar áudio com WebCodecs AudioEncoder:', e);
        }
      }

      const videoEncoder = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
        error: (e: any) => console.error('Erro no VideoEncoder:', e),
      });

      await videoEncoder.configure({
        codec: webCodecsConfig.codec,
        width,
        height,
        bitrate,
        hardwareAcceleration: 'prefer-hardware',
        framerate: fps,
      });

      for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = (frame / totalFrames) * renderDuration;

        const activeClips = timelineClips
          .filter((c) => currentTime >= c.startInTimeline && currentTime < c.startInTimeline + c.duration)
          .sort((a, b) => {
            const getOrder = (tId: string) => {
              if (tId === 'track_video_main') return 1;
              if (tId === 'track_video_overlay') return 2;
              if (tId === 'track_text') return 3;
              return 4;
            };
            return getOrder(a.trackId) - getOrder(b.trackId);
          });

        // 1. Busca os quadros dos vídeos ATIVOS EM PARALELO (sem travar serialmente)
        const seekTasks: Promise<void>[] = [];
        for (const clip of activeClips) {
          if (clip.type === 'video') {
            const video = loadedVideos.get(clip.assetId || '');
            if (video) {
              const mediaOffset = Math.max(
                0,
                clip.trimStart + (currentTime - clip.startInTimeline) * clip.speed
              );
              seekTasks.push(seekVideoAccurate(video, mediaOffset));
            }
          }
        }

        if (seekTasks.length > 0) {
          await Promise.all(seekTasks);
        }

        // 2. Desenha o fundo e as camadas em memória
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        for (const clip of activeClips) {
          renderClipLayer(ctx, clip, currentTime, width, height, loadedVideos, loadedImages);
        }

        // 3. Envia o quadro para o encoder de hardware
        const timestampUs = Math.round((frame / fps) * 1_000_000);
        const isKeyFrame = frame % (fps * 2) === 0;

        const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        // Atualiza progresso sem sobrecarregar o React
        const progress = Math.min(99, 15 + Math.round((frame / totalFrames) * 84));
        if (progress > lastProgress) {
          lastProgress = progress;
          onProgress?.(progress);
        }
      }

      await videoEncoder.flush();
      muxer.finalize();
      cleanupBlobs();
      onProgress?.(100);

      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    }

    // -----------------------------------------------------------------
    // MOTOR 2: MEDIARECORDER COM DOUBLE-BUFFERING (Fallback)
    // -----------------------------------------------------------------
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = width;
    displayCanvas.height = height;
    const displayCtx = displayCanvas.getContext('2d', { alpha: false });

    if (!displayCtx) {
      throw new Error('Falha ao inicializar display context.');
    }

    displayCtx.fillStyle = '#000000';
    displayCtx.fillRect(0, 0, width, height);

    let mimeType = 'video/webm; codecs=vp9';
    if (format === 'mp4') {
      if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
        mimeType = 'video/mp4; codecs=avc1';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm; codecs=h264')) {
        mimeType = 'video/webm; codecs=h264';
      }
    } else {
      if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
        mimeType = 'video/webm; codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }
    }

    const stream = displayCanvas.captureStream(fps);
    let audioStreamTrack: MediaStreamTrack | null = null;
    let audioCtx: AudioContext | null = null;

    if (mixedAudioBuffer && typeof AudioContext !== 'undefined') {
      try {
        audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const src = audioCtx.createBufferSource();
        src.buffer = mixedAudioBuffer;
        src.connect(dest);
        src.start(0);
        audioStreamTrack = dest.stream.getAudioTracks()[0] || null;
      } catch (e) {
        console.warn('Erro ao conectar áudio ao MediaRecorder:', e);
      }
    }

    const combinedTracks = [...stream.getVideoTracks()];
    if (audioStreamTrack) {
      combinedTracks.push(audioStreamTrack);
    }
    const recordStream = new MediaStream(combinedTracks);

    const recorder = new MediaRecorder(recordStream, {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
      videoBitsPerSecond: bitrate,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.start(100);

    return new Promise<Blob>(async (resolve, reject) => {
      try {
        const frameIntervalMs = Math.max(16, Math.floor(1000 / fps));

        for (let frame = 0; frame < totalFrames; frame++) {
          const currentTime = (frame / totalFrames) * renderDuration;

          const activeClips = timelineClips
            .filter((c) => currentTime >= c.startInTimeline && currentTime < c.startInTimeline + c.duration)
            .sort((a, b) => {
              const getOrder = (tId: string) => {
                if (tId === 'track_video_main') return 1;
                if (tId === 'track_video_overlay') return 2;
                if (tId === 'track_text') return 3;
                return 4;
              };
              return getOrder(a.trackId) - getOrder(b.trackId);
            });

          const seekTasks: Promise<void>[] = [];
          for (const clip of activeClips) {
            if (clip.type === 'video') {
              const video = loadedVideos.get(clip.assetId || '');
              if (video) {
                const mediaOffset = Math.max(
                  0,
                  clip.trimStart + (currentTime - clip.startInTimeline) * clip.speed
                );
                seekTasks.push(seekVideoAccurate(video, mediaOffset));
              }
            }
          }

          if (seekTasks.length > 0) {
            await Promise.all(seekTasks);
          }

          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          for (const clip of activeClips) {
            renderClipLayer(ctx, clip, currentTime, width, height, loadedVideos, loadedImages);
          }

          // Atualiza displayCanvas em uma única operação
          displayCtx.drawImage(canvas, 0, 0);

          const progress = Math.min(99, 15 + Math.round((frame / totalFrames) * 84));
          if (progress > lastProgress) {
            lastProgress = progress;
            onProgress?.(progress);
          }

          await new Promise((r) => setTimeout(r, frameIntervalMs));
        }

        recorder.onstop = () => {
          cleanupBlobs();
          if (audioCtx) {
            try {
              audioCtx.close();
            } catch {}
          }
          const finalBlob = new Blob(chunks, {
            type: mimeType.includes('mp4') ? 'video/mp4' : 'video/webm',
          });
          onProgress?.(100);
          resolve(finalBlob);
        };

        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 200);
      } catch (err) {
        cleanupBlobs();
        reject(err);
      }
    });
  } catch (err) {
    cleanupBlobs();
    throw err;
  }
}
