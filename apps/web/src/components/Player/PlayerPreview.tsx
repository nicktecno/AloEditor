'use client';

import React, { useRef, useEffect } from 'react';
import { useEditor } from '@/context/EditorContext';
import { getClipTransitionState, getClipAudioVolume } from '@/utils/transitionUtils';
import { processFrameBackgroundRemoval } from '@/utils/backgroundRemoval';
import { GENERIC_VIDEO_THUMBNAIL, captureVideoThumbnail, getMediaDuration, handleThumbnailError } from '@/utils/thumbnailGenerator';
import { MediaAsset } from '@/types/editor';
import styles from './Player.module.css';

const formatTimecode = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};

const AudioTrackPlayer: React.FC<{
  clip: any;
  assetUrl: string;
  currentTime: number;
  isPlaying: boolean;
  onSyncDuration?: (assetId: string, duration: number) => void;
}> = ({ clip, assetUrl, currentTime, isPlaying, onSyncDuration }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lastClipIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const mediaOffset = clip.trimStart + (currentTime - clip.startInTimeline) * clip.speed;

    const dynVol = getClipAudioVolume(clip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = clip.isMuted || targetVol === 0;

    if (audioRef.current.muted !== shouldMute) {
      audioRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(audioRef.current.volume - targetVol) > 0.02) {
        audioRef.current.volume = targetVol;
      }
    } catch {}

    const targetRate = clip.speed || 1.0;
    if (audioRef.current.playbackRate !== targetRate) {
      audioRef.current.playbackRate = targetRate;
    }

    const isClipSwitch = lastClipIdRef.current !== clip.id;
    lastClipIdRef.current = clip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(audioRef.current.currentTime - mediaOffset) > 0.05) {
        audioRef.current.currentTime = mediaOffset;
      }
      if (!audioRef.current.paused) {
        audioRef.current.pause();
      }
    } else {
      // While playing: only hard seek if switching clip or scrubbed (> 1.2s drift), avoiding audio clicks/stutters
      if (isClipSwitch || Math.abs(audioRef.current.currentTime - mediaOffset) > 1.2) {
        audioRef.current.currentTime = mediaOffset;
      }
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [currentTime, isPlaying, clip]);

  return (
    <audio
      ref={audioRef}
      src={assetUrl}
      preload="auto"
      playsInline
      style={{ display: 'none' }}
      onLoadedMetadata={(e) => {
        const a = e.currentTarget;
        if (a && a.duration && !isNaN(a.duration) && isFinite(a.duration) && a.duration > 0) {
          onSyncDuration?.(clip.assetId, a.duration);
        }
      }}
    />
  );
};

export const PlayerPreview: React.FC = () => {
  const {
    project,
    currentTime,
    isPlaying,
    selectedClipIds,
    selectClip,
    updateClip,
    syncMediaDuration,
    addClipToTrack,
    addAsset,
    updateAssetThumbnail,
    setInspectorTab,
  } = useEditor();

  const [isBuffering, setIsBuffering] = React.useState(false);
  const [isVideoReady, setIsVideoReady] = React.useState(false);
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleWaiting = () => {
    if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
    bufferTimeoutRef.current = setTimeout(() => {
      setIsBuffering(true);
    }, 300);
  };

  const handleCanPlay = () => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    setIsBuffering(false);
    setIsVideoReady(true);
  };

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Dragging state for free-form text positioning
  const [draggingTextId, setDraggingTextId] = React.useState<string | null>(null);
  const [dragCoords, setDragCoords] = React.useState<{ x: number; y: number } | null>(null);
  const [snapGuideX, setSnapGuideX] = React.useState<boolean>(false);
  const [snapGuideY, setSnapGuideY] = React.useState<boolean>(false);

  // Find active video clip on main track
  const activeMainClip = project.clips.find(
    (c) =>
      c.trackId === 'track_video_main' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active overlay clip
  const activeOverlayClip = project.clips.find(
    (c) =>
      c.trackId === 'track_video_overlay' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active text clips
  const activeTextClips = project.clips.filter(
    (c) =>
      c.type === 'text' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active audio clips (including detached audio clips and background music)
  const activeAudioClips = project.clips.filter(
    (c) =>
      c.type === 'audio' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Lookup asset for media URL
  const mainAsset = activeMainClip
    ? project.assets.find((a) => a.id === activeMainClip.assetId)
    : null;

  const overlayAsset = activeOverlayClip
    ? project.assets.find((a) => a.id === activeOverlayClip.assetId)
    : null;

  // Compute live transitions and effects
  const mainTrans = activeMainClip ? getClipTransitionState(activeMainClip, currentTime) : null;
  const overlayTrans = activeOverlayClip ? getClipTransitionState(activeOverlayClip, currentTime) : null;

  const lastMainClipIdRef = useRef<string | null>(null);
  const lastOverlayClipIdRef = useRef<string | null>(null);

  // Sync main video playback time & state & audio volume
  useEffect(() => {
    if (!mainVideoRef.current || !activeMainClip) return;

    const mediaOffset = activeMainClip.trimStart + (currentTime - activeMainClip.startInTimeline) * activeMainClip.speed;

    const dynVol = getClipAudioVolume(activeMainClip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = activeMainClip.isMuted || targetVol === 0;

    if (mainVideoRef.current.muted !== shouldMute) {
      mainVideoRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(mainVideoRef.current.volume - targetVol) > 0.02) {
        mainVideoRef.current.volume = targetVol;
      }
    } catch {}

    const isClipSwitch = lastMainClipIdRef.current !== activeMainClip.id;
    lastMainClipIdRef.current = activeMainClip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(mainVideoRef.current.currentTime - mediaOffset) > 0.05) {
        mainVideoRef.current.currentTime = mediaOffset;
      }
      if (!mainVideoRef.current.paused) {
        mainVideoRef.current.pause();
      }
    } else {
      // While playing: only hard seek on clip switch or significant user scrub (> 1.2s), preventing mobile decoder stalls
      if (isClipSwitch || Math.abs(mainVideoRef.current.currentTime - mediaOffset) > 1.2) {
        mainVideoRef.current.currentTime = mediaOffset;
      }
      if (mainVideoRef.current.paused) {
        mainVideoRef.current.play().catch(() => {});
      }
    }
  }, [currentTime, isPlaying, activeMainClip]);

  // Sync overlay video playback time & state & audio volume
  useEffect(() => {
    if (!overlayVideoRef.current || !activeOverlayClip) return;

    const mediaOffset = activeOverlayClip.trimStart + (currentTime - activeOverlayClip.startInTimeline) * activeOverlayClip.speed;

    const dynVol = getClipAudioVolume(activeOverlayClip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = activeOverlayClip.isMuted || targetVol === 0;

    if (overlayVideoRef.current.muted !== shouldMute) {
      overlayVideoRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(overlayVideoRef.current.volume - targetVol) > 0.02) {
        overlayVideoRef.current.volume = targetVol;
      }
    } catch {}

    const isClipSwitch = lastOverlayClipIdRef.current !== activeOverlayClip.id;
    lastOverlayClipIdRef.current = activeOverlayClip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(overlayVideoRef.current.currentTime - mediaOffset) > 0.05) {
        overlayVideoRef.current.currentTime = mediaOffset;
      }
      if (!overlayVideoRef.current.paused) {
        overlayVideoRef.current.pause();
      }
    } else {
      // While playing: only hard seek on clip switch or significant user scrub (> 1.2s), preventing mobile decoder stalls
      if (isClipSwitch || Math.abs(overlayVideoRef.current.currentTime - mediaOffset) > 1.2) {
        overlayVideoRef.current.currentTime = mediaOffset;
      }
      if (overlayVideoRef.current.paused) {
        overlayVideoRef.current.play().catch(() => {});
      }
    }
  }, [currentTime, isPlaying, activeOverlayClip]);

  // Real-time Chroma Key & Background Removal for Overlay Video/Image
  useEffect(() => {
    let animId: number;
    const renderOverlayChroma = () => {
      if (
        activeOverlayClip?.backgroundRemoval?.enabled &&
        overlayVideoRef.current &&
        overlayCanvasRef.current &&
        overlayVideoRef.current.readyState >= 2
      ) {
        const vid = overlayVideoRef.current;
        const canvas = overlayCanvasRef.current;
        const w = vid.videoWidth || 640;
        const h = vid.videoHeight || 360;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          processFrameBackgroundRemoval(vid, ctx, w, h, activeOverlayClip.backgroundRemoval);
        }
      }
      animId = requestAnimationFrame(renderOverlayChroma);
    };

    if (activeOverlayClip?.backgroundRemoval?.enabled) {
      animId = requestAnimationFrame(renderOverlayChroma);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeOverlayClip, activeOverlayClip?.backgroundRemoval, isPlaying]);

  // Real-time Chroma Key & Background Removal for Main Video/Image
  useEffect(() => {
    let animId: number;
    const renderMainChroma = () => {
      if (
        activeMainClip?.backgroundRemoval?.enabled &&
        mainVideoRef.current &&
        mainCanvasRef.current &&
        mainVideoRef.current.readyState >= 2
      ) {
        const vid = mainVideoRef.current;
        const canvas = mainCanvasRef.current;
        const w = vid.videoWidth || 1280;
        const h = vid.videoHeight || 720;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          processFrameBackgroundRemoval(vid, ctx, w, h, activeMainClip.backgroundRemoval);
        }
      }
      animId = requestAnimationFrame(renderMainChroma);
    };

    if (activeMainClip?.backgroundRemoval?.enabled) {
      animId = requestAnimationFrame(renderMainChroma);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeMainClip, activeMainClip?.backgroundRemoval, isPlaying]);

  // Free-form pointer dragging handler for text overlays
  const handleTextPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    textClip: any
  ) => {
    e.stopPropagation();
    e.preventDefault();

    selectClip(textClip.id, false);
    setInspectorTab('text');

    if (!frameRef.current) return;
    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const initialPosX = textClip.transform.position.x;
    const initialPosY = textClip.transform.position.y;

    setDraggingTextId(textClip.id);
    setDragCoords({ x: initialPosX, y: initialPosY });

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaPercentX = ((moveEvent.clientX - startPointerX) / rect.width) * 100;
      const deltaPercentY = ((moveEvent.clientY - startPointerY) / rect.height) * 100;

      let targetX = initialPosX + deltaPercentX;
      let targetY = initialPosY + deltaPercentY;

      // Restrict within comfortable bounds
      targetX = Math.max(2, Math.min(98, targetX));
      targetY = Math.max(2, Math.min(98, targetY));

      let isSnappedX = false;
      let isSnappedY = false;

      // Magnetic Snapping to Center X (50%)
      if (Math.abs(targetX - 50) < 2.5) {
        targetX = 50;
        isSnappedX = true;
      }

      // Magnetic Snapping to Center Y (50%)
      if (Math.abs(targetY - 50) < 2.5) {
        targetY = 50;
        isSnappedY = true;
      }
      // Subtitle / Lower Third Y (82%)
      else if (Math.abs(targetY - 82) < 2.2) {
        targetY = 82;
        isSnappedY = true;
      }
      // Header Y (15%)
      else if (Math.abs(targetY - 15) < 2.2) {
        targetY = 15;
        isSnappedY = true;
      }

      setSnapGuideX(isSnappedX);
      setSnapGuideY(isSnappedY);

      const roundedX = Math.round(targetX * 10) / 10;
      const roundedY = Math.round(targetY * 10) / 10;

      setDragCoords({ x: roundedX, y: roundedY });

      updateClip(textClip.id, {
        transform: {
          ...textClip.transform,
          position: { x: roundedX, y: roundedY },
        },
      });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setDraggingTextId(null);
      setDragCoords(null);
      setSnapGuideX(false);
      setSnapGuideY(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Quick preset positioning
  const handleApplyTextPreset = (clipId: string, posX: number, posY: number) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    updateClip(clipId, {
      transform: {
        ...clip.transform,
        position: { x: posX, y: posY },
      },
    });
  };

  // Aspect ratio class mapper
  const ratioClassMap: Record<string, string> = {
    '16:9': styles.frame16x9,
    '9:16': styles.frame9x16,
    '1:1': styles.frame1x1,
    '4:5': styles.frame4x5,
    '21:9': styles.frame21x9,
  };

  const hasVideoClips = project.clips.some(
    (c) => c.type === 'video' || c.trackId === 'track_video_main' || c.trackId === 'track_video_overlay'
  );

  const handlePreviewDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handlePreviewDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (rawData) {
        const asset = JSON.parse(rawData) as MediaAsset;
        addClipToTrack(asset, asset.type === 'audio' ? 'track_audio_bg' : 'track_video_main', !hasVideoClips ? 0 : currentTime);
        return;
      }
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isVideo = file.type.startsWith('video');
          const isAudio = file.type.startsWith('audio');
          let detectedDuration = 10.0;
          if (isVideo || isAudio) {
            try {
              detectedDuration = await getMediaDuration(file, isAudio);
            } catch {}
          }
          const assetId = `asset_upload_${Date.now()}_${i}`;
          const url = URL.createObjectURL(file);
          const newAsset: MediaAsset = {
            id: assetId,
            name: file.name,
            type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
            url,
            duration: detectedDuration,
            size: file.size,
            thumbnailUrl: isVideo ? GENERIC_VIDEO_THUMBNAIL : undefined,
          };
          addAsset(newAsset);
          if (isVideo) {
            captureVideoThumbnail(file, 0.5, (dur) => {
              if (dur && dur > 0 && Math.abs(dur - detectedDuration) > 0.5) {
                syncMediaDuration(assetId, dur);
              }
            }).then((captured) => {
              if (captured && captured !== GENERIC_VIDEO_THUMBNAIL) {
                updateAssetThumbnail(assetId, captured);
              }
            });
          }
          addClipToTrack(newAsset, isAudio ? 'track_audio_bg' : 'track_video_main', !hasVideoClips ? 0 : currentTime);
        }
      }
    } catch (err) {
      console.error('Erro ao soltar mídia no preview:', err);
    }
  };

  const frameClass = ratioClassMap[project.settings.aspectRatio] || styles.frame16x9;

  return (
    <div
      className={styles.viewportArea}
      onDragOver={handlePreviewDragOver}
      onDrop={handlePreviewDrop}
    >
      <div ref={frameRef} className={`${styles.aspectFrame} ${frameClass}`}>
        {/* Main Video or Image Layer */}
        {activeMainClip && mainAsset ? (
          <>
            {/* Low-Quality Proxy / Poster Underlay Layer (Always visible, eliminates black screen while loading) */}
            <div
              className={styles.proxyUnderlayLayer}
              style={{
                transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                opacity: mainTrans?.opacity ?? 1,
                filter: mainTrans?.filterString || undefined,
              }}
            >
              <img
                src={mainAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                alt={activeMainClip.name}
                className={styles.proxyUnderlayImg}
                onError={handleThumbnailError}
              />
              {(!isVideoReady || isBuffering) && (
                <div className={styles.lowQualityBlurOverlay} />
              )}
            </div>

            {mainAsset.type === 'image' || activeMainClip.type === 'image' ? (
              <img
                src={mainAsset.url}
                alt={activeMainClip.name}
                className={styles.videoLayer}
                style={{
                  objectFit: 'contain',
                  transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  zIndex: 2,
                }}
              />
            ) : (
              <video
                ref={mainVideoRef}
                src={mainAsset.url}
                className={styles.videoLayer}
                playsInline
                preload="auto"
                poster={mainAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                muted={activeMainClip.isMuted}
                onLoadStart={() => setIsVideoReady(false)}
                onWaiting={handleWaiting}
                onCanPlay={handleCanPlay}
                onPlaying={handleCanPlay}
                onSeeked={handleCanPlay}
                onError={handleCanPlay}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v && v.duration && !isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
                    syncMediaDuration(mainAsset.id, v.duration);
                  }
                }}
                style={{
                  display: activeMainClip.backgroundRemoval?.enabled ? 'none' : 'block',
                  transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  opacity: isVideoReady ? (mainTrans?.opacity ?? 1) : 0,
                  transition: 'opacity 0.25s ease',
                  filter: mainTrans?.filterString || undefined,
                  zIndex: 2,
                }}
              />
            )}
            {activeMainClip.backgroundRemoval?.enabled && (
              <canvas
                ref={mainCanvasRef}
                className={styles.videoLayer}
                style={{
                  transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  objectFit: 'contain',
                  zIndex: 3,
                }}
              />
            )}

            {/* Quality status badge while loading / optimizing */}
            {(!isVideoReady || isBuffering) && (
              <div className={styles.proxyQualityBadge}>
                <div className={styles.proxyQualityDot} />
                <span>Pré-visualização • Carregando reprodução otimizada...</span>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyStateNotice}>
            <span>Nenhum vídeo neste momento</span>
            <span style={{ fontSize: '11px', opacity: 0.65, marginTop: '4px' }}>
              Arraste um vídeo da biblioteca ou solte aqui para começar no início (00:00)
            </span>
          </div>
        )}

        {/* Overlay (B-Roll) Video or Image Layer */}
        {activeOverlayClip && overlayAsset && (
          <>
            {overlayAsset.type === 'image' || activeOverlayClip.type === 'image' ? (
              <img
                src={overlayAsset.url}
                alt={activeOverlayClip.name}
                style={{
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <video
                ref={overlayVideoRef}
                src={overlayAsset.url}
                playsInline
                preload="auto"
                poster={overlayAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                muted={activeOverlayClip.isMuted}
                onWaiting={handleWaiting}
                onCanPlay={handleCanPlay}
                onPlaying={handleCanPlay}
                onError={handleCanPlay}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v && v.duration && !isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
                    syncMediaDuration(overlayAsset.id, v.duration);
                  }
                }}
                style={{
                  display: activeOverlayClip.backgroundRemoval?.enabled ? 'none' : 'block',
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            )}
            {activeOverlayClip.backgroundRemoval?.enabled && (
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            )}
          </>
        )}

        {/* Snapping Guide Crosshairs */}
        {snapGuideX && <div className={styles.snapGuideLineX} />}
        {snapGuideY && <div className={styles.snapGuideLineY} />}

        {/* Text Overlays with Free-form Drag & Drop */}
        {activeTextClips.map((textClip) => {
          const isSelected = selectedClipIds.includes(textClip.id);
          const isDragging = draggingTextId === textClip.id;
          const style = textClip.textStyle;
          const textTrans = getClipTransitionState(textClip, currentTime);

          return (
            <div
              key={textClip.id}
              className={`${styles.textOverlayItem} ${isSelected ? styles.textOverlaySelected : ''} ${isDragging ? styles.textOverlayDragging : ''}`}
              style={{
                left: `${textClip.transform.position.x + textTrans.positionX}%`,
                top: `${textClip.transform.position.y + textTrans.positionY}%`,
                fontSize: `${(style?.fontSize || 36) * 0.7}px`,
                fontFamily: style?.fontFamily || 'Inter',
                fontWeight: style?.fontWeight || 'bold',
                color: style?.color || '#ffffff',
                backgroundColor: style?.backgroundColor || 'transparent',
                textAlign: style?.textAlign || 'center',
                textShadow: style?.shadowColor
                  ? `0 0 ${style.shadowBlur || 8}px ${style.shadowColor}`
                  : 'none',
                WebkitTextStroke: style?.strokeWidth
                  ? `${style.strokeWidth}px ${style.strokeColor}`
                  : 'none',
                opacity: textTrans.opacity,
                transform: `translate(-50%, -50%) scale(${textTrans.scale}) rotate(${textClip.transform.rotation}deg)`,
                filter: textTrans.filterString || undefined,
              }}
              onPointerDown={(e) => handleTextPointerDown(e, textClip)}
              onClick={(e) => {
                e.stopPropagation();
                selectClip(textClip.id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            >
              {/* Coordinates tooltip while dragging */}
              {isDragging && dragCoords && (
                <div className={styles.coordsTooltip}>
                  📍 X: {dragCoords.x.toFixed(1)}% | Y: {dragCoords.y.toFixed(1)}%
                </div>
              )}

              {/* Floating Quick Preset Bar when selected */}
              {isSelected && !isDragging && (
                <div
                  className={styles.floatingTextToolbar}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 15)}
                    title="Mover para o Topo (15%)"
                  >
                    ⬆️ Topo
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 50)}
                    title="Centralizar no Meio (50%)"
                  >
                    🎯 Centro
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 82)}
                    title="Posição de Legenda / Terço Inferior (82%)"
                  >
                    ⬇️ Legenda
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 72)}
                    title="Zona Segura Instagram Reels & TikTok (72%)"
                  >
                    📱 Reels
                  </button>
                </div>
              )}

              {textClip.text || 'Texto'}
            </div>
          );
        })}

        {/* Safe Zone Grid / Framing Guide */}
        <div className={styles.safeZoneBorder} />

        {/* Timecode overlay in frame */}
        <div className={styles.timecodeOverlay}>
          {formatTimecode(currentTime)}
        </div>

        {/* Audio Track Players for background tracks and detached audio */}
        {activeAudioClips.map((audioClip) => {
          const asset = project.assets.find((a) => a.id === audioClip.assetId);
          if (!asset || !asset.url) return null;
          return (
            <AudioTrackPlayer
              key={audioClip.id}
              clip={audioClip}
              assetUrl={asset.url}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onSyncDuration={syncMediaDuration}
            />
          );
        })}
      </div>
    </div>
  );
};
