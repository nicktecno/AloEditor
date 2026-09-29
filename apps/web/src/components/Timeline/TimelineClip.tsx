'use client';

import React, { useRef, useState } from 'react';
import { useEditor } from '@/context/EditorContext';
import { TimelineClip as ITimelineClip } from '@/types/editor';
import { Film, Type, Music, Layers, VolumeX, Volume2 } from 'lucide-react';
import { GENERIC_VIDEO_THUMBNAIL, handleThumbnailError } from '@/utils/thumbnailGenerator';
import styles from './Timeline.module.css';

interface TimelineClipProps {
  clip: ITimelineClip;
}

export const TimelineClip: React.FC<TimelineClipProps> = ({ clip }) => {
  const {
    project,
    zoom,
    selectedClipIds,
    selectClip,
    updateClip,
    commitHistory,
    currentTime,
    isSnappingEnabled,
    setSnapGuideTime,
  } = useEditor();

  const asset = project.assets.find((a) => a.id === clip.assetId);
  const isSelected = selectedClipIds.includes(clip.id);
  const leftPos = clip.startInTimeline * zoom;
  const widthPos = Math.max(clip.duration * zoom, 4);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const initialStartsRef = useRef<{ [clipId: string]: number }>({});

  // Theme class by clip type and track
  const isOverlay = clip.trackId === 'track_video_overlay';
  const themeClass = isOverlay
    ? styles.clipOverlay
    : clip.type === 'video'
    ? styles.clipVideo
    : clip.type === 'audio'
    ? styles.clipAudio
    : styles.clipText;

  // Drag to move along track with Multi-Select & Magnetism
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to main mouse button
    if (e.button !== 0) return;

    e.stopPropagation();

    const isModifier = e.shiftKey || e.metaKey || e.ctrlKey;

    let activeSelectedIds = selectedClipIds;
    if (isModifier) {
      selectClip(clip.id, true);
      if (selectedClipIds.includes(clip.id)) {
        activeSelectedIds = selectedClipIds.filter((id) => id !== clip.id);
      } else {
        activeSelectedIds = [...selectedClipIds, clip.id];
      }
    } else if (!selectedClipIds.includes(clip.id)) {
      selectClip(clip.id, false);
      activeSelectedIds = [clip.id];
    }

    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;

    // Cache initial start times for all currently selected clips
    const starts: { [clipId: string]: number } = {};
    project.clips.forEach((c) => {
      if (activeSelectedIds.includes(c.id)) {
        starts[c.id] = c.startInTimeline;
      }
    });
    // Ensure current clip is included
    if (starts[clip.id] === undefined) {
      starts[clip.id] = clip.startInTimeline;
    }
    initialStartsRef.current = starts;

    // Collect candidate snap points: 0, playhead, and edges of UNSELECTED clips
    const snapCandidates: number[] = [0, currentTime];
    project.clips.forEach((c) => {
      if (!activeSelectedIds.includes(c.id)) {
        snapCandidates.push(c.startInTimeline);
        snapCandidates.push(c.startInTimeline + c.duration);
      }
    });

    // Magnetic snap threshold: 22 pixels converted to timeline seconds
    const snapThresholdSec = 22 / zoom;

    let rafId: number | null = null;
    let didMove = false;
    let lastEffectiveDelta = 0;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = moveEvent.clientX - dragStartXRef.current;
      const deltaTime = deltaX / zoom;

      // Base target start for the primary clicked clip
      const baseStart = initialStartsRef.current[clip.id] ?? clip.startInTimeline;
      let targetStart = Math.max(0, baseStart + deltaTime);
      let snappedPoint: number | null = null;

      if (isSnappingEnabled) {
        // 1. Check start edge snapping
        for (const candidate of snapCandidates) {
          if (Math.abs(targetStart - candidate) <= snapThresholdSec) {
            targetStart = candidate;
            snappedPoint = candidate;
            break;
          }
        }

        // 2. Check end edge snapping
        if (snappedPoint === null) {
          const targetEnd = targetStart + clip.duration;
          for (const candidate of snapCandidates) {
            if (Math.abs(targetEnd - candidate) <= snapThresholdSec) {
              targetStart = Math.max(0, candidate - clip.duration);
              snappedPoint = candidate;
              break;
            }
          }
        }
      }

      setSnapGuideTime(snappedPoint);

      // Effective delta applied to all selected clips
      const effectiveDelta = targetStart - baseStart;
      lastEffectiveDelta = effectiveDelta;

      if (Math.abs(effectiveDelta) > 0.001) {
        didMove = true;
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        Object.entries(initialStartsRef.current).forEach(([cId, initStart]) => {
          const newStart = Math.max(0, parseFloat((initStart + effectiveDelta).toFixed(3)));
          updateClip(cId, { startInTimeline: newStart });
        });
      });
    };

    const onPointerUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (didMove) {
        Object.entries(initialStartsRef.current).forEach(([cId, initStart]) => {
          const newStart = Math.max(0, parseFloat((initStart + lastEffectiveDelta).toFixed(3)));
          updateClip(cId, { startInTimeline: newStart });
        });
        commitHistory();
      }
      isDraggingRef.current = false;
      setIsDragging(false);
      setSnapGuideTime(null);

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  // Left trim handle (trim start)
  const handleTrimLeft = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const initialStart = clip.startInTimeline;
    const initialDuration = clip.duration;
    const initialTrimStart = clip.trimStart || 0;
    const speed = clip.speed || 1.0;
    const isBoundedMedia = (clip.type === 'video' || clip.type === 'audio') && !!asset?.duration;
    const assetMaxDuration = asset?.duration || 999999;
    let didChange = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / zoom;

      // Minimum duration 0.2s
      const maxDelta = initialDuration - 0.2;
      // Não pode expandir para antes de 0:00 na timeline, nem antes do início (0:00) do arquivo de vídeo/áudio
      const minDelta = isBoundedMedia
        ? Math.max(-initialStart, -initialTrimStart / speed)
        : -initialStart;

      let clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaTime));

      let newStart = Math.max(0, initialStart + clampedDelta);
      let newDuration = Math.max(0.2, initialDuration - clampedDelta);
      let newTrimStart = Math.max(0, initialTrimStart + clampedDelta * speed);

      // Snap to playhead
      if (isSnappingEnabled && Math.abs(newStart - currentTime) <= 20 / zoom) {
        const snapDelta = currentTime - initialStart;
        if (snapDelta >= minDelta && snapDelta <= maxDelta) {
          newStart = currentTime;
          clampedDelta = snapDelta;
          newDuration = Math.max(0.2, initialDuration - snapDelta);
          newTrimStart = Math.max(0, initialTrimStart + snapDelta * speed);
          setSnapGuideTime(currentTime);
        }
      } else {
        setSnapGuideTime(null);
      }

      // Impede ultrapassar a duração total original da mídia
      if (isBoundedMedia && newTrimStart + newDuration * speed > assetMaxDuration) {
        newDuration = Math.max(0.2, (assetMaxDuration - newTrimStart) / speed);
      }

      const calculatedTrimEnd = isBoundedMedia
        ? Math.min(assetMaxDuration, newTrimStart + newDuration * speed)
        : newTrimStart + newDuration * speed;

      const formattedStart = parseFloat(newStart.toFixed(3));
      const formattedDuration = parseFloat(newDuration.toFixed(3));
      const formattedTrimStart = parseFloat(newTrimStart.toFixed(3));
      const formattedTrimEnd = parseFloat(calculatedTrimEnd.toFixed(3));

      if (
        Math.abs(formattedStart - initialStart) > 0.001 ||
        Math.abs(formattedDuration - initialDuration) > 0.001 ||
        Math.abs(formattedTrimStart - initialTrimStart) > 0.001
      ) {
        didChange = true;
      }

      updateClip(clip.id, {
        startInTimeline: formattedStart,
        duration: formattedDuration,
        trimStart: formattedTrimStart,
        trimEnd: formattedTrimEnd,
      });
    };

    const onPointerUp = () => {
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (didChange) {
        commitHistory();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  // Right trim handle (trim end)
  const handleTrimRight = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const initialDuration = clip.duration;
    const trimStart = clip.trimStart || 0;
    const speed = clip.speed || 1.0;
    const isBoundedMedia = (clip.type === 'video' || clip.type === 'audio') && !!asset?.duration;
    const assetMaxDuration = asset?.duration || 999999;
    // Duração máxima permitida na timeline considerando o início do corte e a velocidade
    const maxAllowedDuration = isBoundedMedia
      ? Math.max(0.2, (assetMaxDuration - trimStart) / speed)
      : 999999;
    let didChange = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / zoom;
      let newDuration = Math.min(maxAllowedDuration, Math.max(0.2, initialDuration + deltaTime));

      const targetEnd = clip.startInTimeline + newDuration;
      if (isSnappingEnabled && Math.abs(targetEnd - currentTime) <= 20 / zoom) {
        const candidateDuration = currentTime - clip.startInTimeline;
        if (candidateDuration >= 0.2 && candidateDuration <= maxAllowedDuration) {
          newDuration = candidateDuration;
          setSnapGuideTime(currentTime);
        } else {
          setSnapGuideTime(null);
        }
      } else {
        setSnapGuideTime(null);
      }

      const calculatedTrimEnd = Math.min(assetMaxDuration, trimStart + newDuration * speed);
      const formattedDuration = parseFloat(newDuration.toFixed(3));
      const formattedTrimEnd = parseFloat(calculatedTrimEnd.toFixed(3));

      if (Math.abs(formattedDuration - initialDuration) > 0.001) {
        didChange = true;
      }

      updateClip(clip.id, {
        duration: formattedDuration,
        trimEnd: formattedTrimEnd,
      });
    };

    const onPointerUp = () => {
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (didChange) {
        commitHistory();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const isImporting =
    clip.type === 'video' &&
    asset &&
    (asset.status === 'importing' || ((asset.preloadProgress !== undefined) && asset.preloadProgress < 100 && !asset.proxyUrl));

  return (
    <div
      className={`${styles.clipItem} ${themeClass} ${clip.type === 'audio' ? styles.clipItemAudio : ''} ${isSelected ? styles.clipItemSelected : ''} ${isDragging ? styles.clipDragging : ''}`}
      style={{
        left: `${leftPos}px`,
        width: `${widthPos}px`,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Importing & Cache Generating Strip Overlay */}
      {isImporting && (
        <div className={styles.clipImportingStrip} title={`Importando mídia e gerando cache (${asset?.preloadProgress ?? 0}%)`}>
          <div className={styles.clipImportingSpinner} />
          {widthPos >= 70 && (
            <span className={styles.clipImportingText}>
              Importando {asset?.preloadProgress ?? 0}%
            </span>
          )}
        </div>
      )}

      {/* Subtle waveform graphic for audio clips */}
      {clip.type === 'audio' && <div className={styles.clipAudioWaveform} />}

      {/* Left Trim Handle */}
      {widthPos >= 20 && (
        <div
          className={styles.trimHandleLeft}
          onPointerDown={handleTrimLeft}
          title="Arrastar para aparar início"
        >
          <div className={styles.handleGrip} />
        </div>
      )}

      {/* Visual Transition IN Overlay Shade */}
      {clip.transitionIn && clip.transitionIn.type !== 'none' && clip.transitionIn.duration > 0 && (
        <div
          className={styles.transitionInShade}
          style={{ width: `${Math.min(clip.transitionIn.duration * zoom, widthPos * 0.45)}px` }}
          title={`Transição In: ${clip.transitionIn.type} (${clip.transitionIn.duration}s)`}
        />
      )}

      {/* Visual Transition OUT Overlay Shade */}
      {clip.transitionOut && clip.transitionOut.type !== 'none' && clip.transitionOut.duration > 0 && (
        <div
          className={styles.transitionOutShade}
          style={{ width: `${Math.min(clip.transitionOut.duration * zoom, widthPos * 0.45)}px` }}
          title={`Transição Out: ${clip.transitionOut.type} (${clip.transitionOut.duration}s)`}
        />
      )}

      {/* Clip Content & Icon */}
      <div className={styles.clipBody}>
        {clip.type === 'video' ? (
          <div className={styles.clipThumbPreview} title={clip.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset?.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
              alt=""
              className={styles.clipThumbImg}
              onError={handleThumbnailError}
            />
          </div>
        ) : isOverlay ? (
          <Layers size={14} color="#fbbf24" style={{ flexShrink: 0 }} />
        ) : clip.type === 'text' ? (
          <Type size={14} style={{ flexShrink: 0 }} />
        ) : (
          <Music size={14} style={{ flexShrink: 0 }} />
        )}

        {clip.isMuted && (
          <span title="Áudio silenciado" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <VolumeX size={13} color="#f43f5e" style={{ flexShrink: 0 }} />
          </span>
        )}

        {/* Transition In Badge */}
        {widthPos >= 50 && clip.transitionIn && clip.transitionIn.type !== 'none' && (
          <span
            className={styles.clipTransitionBadge}
            title={clip.type === 'audio' ? `Fade In de áudio: ${clip.transitionIn.duration}s` : `Transição de entrada: ${clip.transitionIn.type} (${clip.transitionIn.duration}s)`}
          >
            ⚡ {clip.type === 'audio' ? `Fade (${clip.transitionIn.duration}s)` : clip.transitionIn.type}
          </span>
        )}

        {widthPos >= 40 && (
          <span className={styles.clipName} title={clip.name}>
            {clip.name}
          </span>
        )}

        {/* Effect FX Badge */}
        {widthPos >= 50 && clip.effect && clip.effect !== 'none' && (
          <span
            className={styles.clipFxBadge}
            title={`Efeito ativo: ${clip.effect}`}
          >
            FX
          </span>
        )}

        {/* Transition Out Badge */}
        {widthPos >= 50 && clip.transitionOut && clip.transitionOut.type !== 'none' && (
          <span
            className={styles.clipTransitionBadge}
            title={`Transição de saída: ${clip.transitionOut.type} (${clip.transitionOut.duration}s)`}
          >
            {clip.transitionOut.type} ⚡
          </span>
        )}

        {widthPos >= 30 && <span className={styles.clipDuration}>{clip.duration.toFixed(1)}s</span>}
      </div>

      {/* Right Trim Handle */}
      {widthPos >= 20 && (
        <div
          className={styles.trimHandleRight}
          onPointerDown={handleTrimRight}
          title="Arrastar para aparar fim"
        >
          <div className={styles.handleGrip} />
        </div>
      )}
    </div>
  );
};
