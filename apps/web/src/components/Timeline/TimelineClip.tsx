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
    currentTime,
    isSnappingEnabled,
    setSnapGuideTime,
  } = useEditor();

  const asset = project.assets.find((a) => a.id === clip.assetId);
  const isSelected = selectedClipIds.includes(clip.id);
  const leftPos = clip.startInTimeline * zoom;
  const widthPos = Math.max(clip.duration * zoom, 36);

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

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        Object.entries(initialStartsRef.current).forEach(([cId, initStart]) => {
          const newStart = Math.max(0, parseFloat((initStart + effectiveDelta).toFixed(3)));
          updateClip(cId, { startInTimeline: newStart });
        });
      });
    };

    const onPointerUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
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
    const initialTrimStart = clip.trimStart;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / zoom;

      // Minimum duration 0.2s
      const maxDelta = initialDuration - 0.2;
      const clampedDelta = Math.min(maxDelta, deltaTime);

      let newStart = Math.max(0, initialStart + clampedDelta);
      let newDuration = Math.max(0.2, initialDuration - clampedDelta);
      let newTrimStart = Math.max(0, initialTrimStart + clampedDelta);

      // Snap to playhead
      if (isSnappingEnabled && Math.abs(newStart - currentTime) <= 20 / zoom) {
        const snapDelta = currentTime - initialStart;
        if (snapDelta <= maxDelta) {
          newStart = currentTime;
          newDuration = Math.max(0.2, initialDuration - snapDelta);
          newTrimStart = Math.max(0, initialTrimStart + snapDelta);
          setSnapGuideTime(currentTime);
        }
      } else {
        setSnapGuideTime(null);
      }

      updateClip(clip.id, {
        startInTimeline: parseFloat(newStart.toFixed(3)),
        duration: parseFloat(newDuration.toFixed(3)),
        trimStart: parseFloat(newTrimStart.toFixed(3)),
      });
    };

    const onPointerUp = () => {
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
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

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / zoom;
      let newDuration = Math.max(0.2, initialDuration + deltaTime);

      const targetEnd = clip.startInTimeline + newDuration;
      if (isSnappingEnabled && Math.abs(targetEnd - currentTime) <= 20 / zoom) {
        newDuration = Math.max(0.2, currentTime - clip.startInTimeline);
        setSnapGuideTime(currentTime);
      } else {
        setSnapGuideTime(null);
      }

      updateClip(clip.id, {
        duration: parseFloat(newDuration.toFixed(3)),
        trimEnd: parseFloat((clip.trimStart + newDuration).toFixed(3)),
      });
    };

    const onPointerUp = () => {
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  return (
    <div
      className={`${styles.clipItem} ${themeClass} ${clip.type === 'audio' ? styles.clipItemAudio : ''} ${isSelected ? styles.clipItemSelected : ''} ${isDragging ? styles.clipDragging : ''}`}
      style={{
        left: `${leftPos}px`,
        width: `${widthPos}px`,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Subtle waveform graphic for audio clips */}
      {clip.type === 'audio' && <div className={styles.clipAudioWaveform} />}

      {/* Left Trim Handle */}
      <div
        className={styles.trimHandleLeft}
        onPointerDown={handleTrimLeft}
        title="Arrastar para aparar início"
      >
        <div className={styles.handleGrip} />
      </div>

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
        {clip.transitionIn && clip.transitionIn.type !== 'none' && (
          <span
            className={styles.clipTransitionBadge}
            title={clip.type === 'audio' ? `Fade In de áudio: ${clip.transitionIn.duration}s` : `Transição de entrada: ${clip.transitionIn.type} (${clip.transitionIn.duration}s)`}
          >
            ⚡ {clip.type === 'audio' ? `Fade (${clip.transitionIn.duration}s)` : clip.transitionIn.type}
          </span>
        )}

        <span className={styles.clipName} title={clip.name}>
          {clip.name}
        </span>

        {/* Effect FX Badge */}
        {clip.effect && clip.effect !== 'none' && (
          <span
            className={styles.clipFxBadge}
            title={`Efeito ativo: ${clip.effect}`}
          >
            FX
          </span>
        )}

        {/* Transition Out Badge */}
        {clip.transitionOut && clip.transitionOut.type !== 'none' && (
          <span
            className={styles.clipTransitionBadge}
            title={`Transição de saída: ${clip.transitionOut.type} (${clip.transitionOut.duration}s)`}
          >
            {clip.transitionOut.type} ⚡
          </span>
        )}

        <span className={styles.clipDuration}>{clip.duration.toFixed(1)}s</span>
      </div>

      {/* Right Trim Handle */}
      <div
        className={styles.trimHandleRight}
        onPointerDown={handleTrimRight}
        title="Arrastar para aparar fim"
      >
        <div className={styles.handleGrip} />
      </div>
    </div>
  );
};
