'use client';

import React, { useRef, useEffect } from 'react';
import { useEditor } from '@/context/EditorContext';
import { getClipTransitionState, getClipAudioVolume } from '@/utils/transitionUtils';
import { processFrameBackgroundRemoval } from '@/utils/backgroundRemoval';
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
}> = ({ clip, assetUrl, currentTime, isPlaying }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const mediaOffset = clip.trimStart + (currentTime - clip.startInTimeline) * clip.speed;

    const dynVol = getClipAudioVolume(clip, currentTime);
    audioRef.current.volume = Math.max(0, Math.min(1, dynVol));
    audioRef.current.muted = clip.isMuted || dynVol === 0;
    audioRef.current.playbackRate = clip.speed || 1.0;

    if (Math.abs(audioRef.current.currentTime - mediaOffset) > 0.25) {
      audioRef.current.currentTime = mediaOffset;
    }

    if (isPlaying && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else if (!isPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [currentTime, isPlaying, clip]);

  return <audio ref={audioRef} src={assetUrl} preload="auto" playsInline style={{ display: 'none' }} />;
};

export const PlayerPreview: React.FC = () => {
  const {
    project,
    currentTime,
    isPlaying,
    selectedClipIds,
    selectClip,
    updateClip,
    setInspectorTab,
  } = useEditor();

  const [isBuffering, setIsBuffering] = React.useState(false);
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

  // Sync main video playback time & state & audio volume
  useEffect(() => {
    if (!mainVideoRef.current || !activeMainClip) return;

    const mediaOffset = activeMainClip.trimStart + (currentTime - activeMainClip.startInTimeline) * activeMainClip.speed;

    if (Math.abs(mainVideoRef.current.currentTime - mediaOffset) > 0.25) {
      mainVideoRef.current.currentTime = mediaOffset;
    }

    const dynVol = getClipAudioVolume(activeMainClip, currentTime);
    mainVideoRef.current.volume = Math.max(0, Math.min(1, dynVol));
    mainVideoRef.current.muted = activeMainClip.isMuted || dynVol === 0;

    if (isPlaying && mainVideoRef.current.paused) {
      mainVideoRef.current.play().catch(() => {});
    } else if (!isPlaying && !mainVideoRef.current.paused) {
      mainVideoRef.current.pause();
    }
  }, [currentTime, isPlaying, activeMainClip]);

  // Sync overlay video playback time & state & audio volume
  useEffect(() => {
    if (!overlayVideoRef.current || !activeOverlayClip) return;

    const mediaOffset = activeOverlayClip.trimStart + (currentTime - activeOverlayClip.startInTimeline) * activeOverlayClip.speed;

    if (Math.abs(overlayVideoRef.current.currentTime - mediaOffset) > 0.25) {
      overlayVideoRef.current.currentTime = mediaOffset;
    }

    const dynVol = getClipAudioVolume(activeOverlayClip, currentTime);
    overlayVideoRef.current.volume = Math.max(0, Math.min(1, dynVol));
    overlayVideoRef.current.muted = activeOverlayClip.isMuted || dynVol === 0;

    if (isPlaying && overlayVideoRef.current.paused) {
      overlayVideoRef.current.play().catch(() => {});
    } else if (!isPlaying && !overlayVideoRef.current.paused) {
      overlayVideoRef.current.pause();
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
  }, [activeOverlayClip, activeOverlayClip?.backgroundRemoval, currentTime, isPlaying]);

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
  }, [activeMainClip, activeMainClip?.backgroundRemoval, currentTime, isPlaying]);

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

  const frameClass = ratioClassMap[project.settings.aspectRatio] || styles.frame16x9;

  return (
    <div className={styles.viewportArea}>
      <div ref={frameRef} className={`${styles.aspectFrame} ${frameClass}`}>
        {/* Main Video Layer */}
        {activeMainClip && mainAsset ? (
          <>
            <video
              ref={mainVideoRef}
              src={mainAsset.url}
              className={styles.videoLayer}
              playsInline
              muted={activeMainClip.isMuted}
              onLoadStart={() => setIsBuffering(true)}
              onWaiting={() => setIsBuffering(true)}
              onLoadedData={() => setIsBuffering(false)}
              onCanPlay={() => setIsBuffering(false)}
              onPlaying={() => setIsBuffering(false)}
              style={{
                display: activeMainClip.backgroundRemoval?.enabled ? 'none' : 'block',
                transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                opacity: mainTrans?.opacity ?? 1,
                filter: mainTrans?.filterString || undefined,
              }}
            />
            {activeMainClip.backgroundRemoval?.enabled && (
              <canvas
                ref={mainCanvasRef}
                className={styles.videoLayer}
                style={{
                  transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  objectFit: 'contain',
                }}
              />
            )}
            {isBuffering && (
              <div className={styles.loadingSpinnerOverlay}>
                <div className={styles.spinnerCircle} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  Carregando vídeo...
                </span>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyStateNotice}>
            <span>Nenhum clipe na trilha principal neste momento</span>
          </div>
        )}

        {/* Overlay (B-Roll) Video Layer */}
        {activeOverlayClip && overlayAsset && (
          <>
            <video
              ref={overlayVideoRef}
              src={overlayAsset.url}
              playsInline
              muted={activeOverlayClip.isMuted}
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
            />
          );
        })}
      </div>
    </div>
  );
};
