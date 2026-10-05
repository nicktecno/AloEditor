'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TimelineClip } from '@/types/editor';
import {
  getAudioWaveformEnvelope,
  getAmplitudeFromEnvelope,
  generateProceduralEnvelope,
  volumeToDb,
  formatVolumeText,
  AudioWaveformEnvelope,
} from '@/utils/waveformGenerator';
import { Volume2, VolumeX } from 'lucide-react';
import styles from './Timeline.module.css';

interface TimelineWaveformProps {
  clip: TimelineClip;
  assetUrl?: string;
  driveFileId?: string;
  assetDuration?: number;
  width: number;
  height: number;
  onVolumeChange: (newVol: number) => void;
  onVolumeCommit: () => void;
  onSelectAudio: () => void;
  colorScheme?: 'video' | 'audio';
}

export const TimelineWaveformComponent: React.FC<TimelineWaveformProps> = ({
  clip,
  assetUrl,
  driveFileId,
  assetDuration,
  width,
  height,
  onVolumeChange,
  onVolumeCommit,
  onSelectAudio,
  colorScheme = 'video',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize with rhythmic musical/speech envelope immediately (never empty or flat)
  const [envelopeObj, setEnvelopeObj] = useState<AudioWaveformEnvelope | null>(() =>
    generateProceduralEnvelope(clip.assetId || clip.id, assetDuration || clip.duration || 30, 100)
  );

  const [isHovered, setIsHovered] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState<number>(clip.volume);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const startVolumeRef = useRef(clip.volume);
  const currentVolumeRef = useRef(clip.volume);

  // Load actual asset audio envelope asynchronously with 100% sample-accurate Web Audio decoding
  useEffect(() => {
    let isCancelled = false;
    const loadEnvelope = async () => {
      try {
        const env = await getAudioWaveformEnvelope(
          assetUrl,
          driveFileId,
          clip.assetId || clip.id,
          assetDuration || clip.duration || 30
        );
        if (!isCancelled && env && env.envelope && env.envelope.length > 0) {
          setEnvelopeObj(env);
        }
      } catch {
        // Fallback procedural envelope already active
      }
    };
    loadEnvelope();
    return () => {
      isCancelled = true;
    };
  }, [assetUrl, driveFileId, clip.assetId, clip.id, assetDuration, clip.duration]);

  // Keep volume ref up to date
  useEffect(() => {
    if (!isDraggingRef.current) {
      currentVolumeRef.current = clip.volume;
      setDragVolume(clip.volume);
    }
  }, [clip.volume]);

  // Draw CapCut continuous mountain waveform on canvas with Retina crispness
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.max(10, Math.round(width));
    const renderHeight = Math.max(14, Math.round(height));

    canvas.width = renderWidth * dpr;
    canvas.height = renderHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, renderWidth, renderHeight);

    const isMuted = clip.isMuted || clip.volume <= 0.001;
    const effectiveVol = isMuted ? 0 : isDraggingVolume ? dragVolume : clip.volume;

    // Amplitude modulation with volume: 1.0 = 100%, up to 1.5x
    const volumeFactor = Math.min(1.5, Math.max(0.0, effectiveVol));

    // CapCut Waveform Geometry:
    // Solid flat baseline anchored at the bottom edge (3px from bottom)
    const baselineY = renderHeight - 3;
    const availableHeight = Math.max(6, baselineY - 3);

    const trimStart = clip.trimStart || 0;
    const clipDuration = clip.duration || 1;
    const speed = clip.speed || 1.0;
    const mediaDurationInWindow = clipDuration * speed;

    // 1. Draw continuous filled mountain silhouette (CapCut vector wave)
    ctx.beginPath();
    ctx.moveTo(0, baselineY);

    for (let x = 0; x <= renderWidth; x++) {
      const timeInMedia = trimStart + (x / renderWidth) * mediaDurationInWindow;
      const rawAmp = getAmplitudeFromEnvelope(envelopeObj, timeInMedia);
      const scaledAmp = isMuted ? 0 : Math.min(1.0, rawAmp * volumeFactor);
      const peakHeight = Math.max(1, scaledAmp * availableHeight);
      const y = Math.max(2, baselineY - peakHeight);

      ctx.lineTo(x, y);
    }

    ctx.lineTo(renderWidth, baselineY);
    ctx.lineTo(0, baselineY);
    ctx.closePath();

    // CapCut Vibrant Solid Color Fill:
    // Audio track: signature CapCut vibrant cyan (#00b4d8)
    // Video track: emerald mint (#059669)
    if (isMuted) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    } else if (colorScheme === 'video') {
      ctx.fillStyle = '#059669';
    } else {
      ctx.fillStyle = '#00b4d8';
    }
    ctx.fill();

    // 2. Crisp top contour stroke for sharp vector definition
    if (!isMuted) {
      ctx.beginPath();
      for (let x = 0; x <= renderWidth; x++) {
        const timeInMedia = trimStart + (x / renderWidth) * mediaDurationInWindow;
        const rawAmp = getAmplitudeFromEnvelope(envelopeObj, timeInMedia);
        const scaledAmp = Math.min(1.0, rawAmp * volumeFactor);
        const peakHeight = Math.max(1, scaledAmp * availableHeight);
        const y = Math.max(2, baselineY - peakHeight);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colorScheme === 'video' ? '#34d399' : '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 3. Crisp horizontal baseline across the bottom
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(renderWidth, baselineY);
    ctx.strokeStyle = isMuted
      ? 'rgba(148, 163, 184, 0.3)'
      : colorScheme === 'video'
      ? '#047857'
      : '#0096c7';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [
    width,
    height,
    envelopeObj,
    clip.trimStart,
    clip.duration,
    clip.speed,
    clip.volume,
    clip.isMuted,
    isDraggingVolume,
    dragVolume,
    colorScheme,
  ]);

  // Volume line position: 0% = 3px from bottom; 100% = ~62% of height; 150% = ~92%
  const activeVol = isDraggingVolume ? dragVolume : clip.volume;
  const isMuted = clip.isMuted || activeVol <= 0.001;
  const clampedVol = Math.max(0, Math.min(1.5, activeVol));
  const lineBottomPercent = isMuted ? 8 : (clampedVol / 1.5) * 84 + 8; // 8% to 92%

  const dbValue = volumeToDb(activeVol);

  // Volume Drag Handlers (Stop propagation to prevent timeline clip drag)
  const handleVolumePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {}

    isDraggingRef.current = true;
    setIsDraggingVolume(true);
    dragStartYRef.current = e.clientY;
    startVolumeRef.current = clip.volume;
    currentVolumeRef.current = clip.volume;
    setDragVolume(clip.volume);

    // Initial tooltip position
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: Math.max(40, Math.min(rect.width - 40, e.clientX - rect.left)),
        y: Math.max(-28, e.clientY - rect.top - 36),
      });
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingRef.current) return;

      // Drag up: increase volume. Drag down: decrease volume.
      // Total 100px drag = full 1.5 volume range (0.015 per pixel)
      const deltaY = dragStartYRef.current - moveEv.clientY;
      const sensitivity = 0.012;
      let newVol = Math.max(0, Math.min(1.5, startVolumeRef.current + deltaY * sensitivity));
      newVol = parseFloat(newVol.toFixed(2));

      currentVolumeRef.current = newVol;
      setDragVolume(newVol);
      onVolumeChange(newVol);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setTooltipPos({
          x: Math.max(40, Math.min(rect.width - 40, moveEv.clientX - rect.left)),
          y: Math.max(-28, moveEv.clientY - rect.top - 36),
        });
      }
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEv.pointerId);
      } catch {}
      isDraggingRef.current = false;
      setIsDraggingVolume(false);
      setTooltipPos(null);

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      onVolumeCommit();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [clip.volume, onVolumeChange, onVolumeCommit]);

  // Double click resets volume to 1.0 (100% / 0.0 dB)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onVolumeChange(1.0);
    onVolumeCommit();
  };

  return (
    <div
      ref={containerRef}
      className={styles.waveformContainer}
      style={{ height: `${height}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => !isDraggingVolume && setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelectAudio();
      }}
    >
      {/* Audio Waveform Canvas */}
      <canvas
        ref={canvasRef}
        className={styles.waveformCanvas}
        style={{ width: `${width}px`, height: `${height}px` }}
      />

      {/* Floating Dragging Tooltip */}
      {isDraggingVolume && tooltipPos && (
        <div
          className={styles.volumeDragTooltip}
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          {isMuted ? <VolumeX size={12} color="#f43f5e" /> : <Volume2 size={12} color="#34d399" />}
          <span>{formatVolumeText(dragVolume, clip.isMuted)}</span>
        </div>
      )}

      {/* CapCut Horizontal Volume Envelope Line */}
      <div
        className={`${styles.volumeLineTrack} ${isHovered || isDraggingVolume ? styles.volumeLineTrackActive : ''}`}
        style={{ bottom: `${lineBottomPercent}%` }}
        onPointerDown={handleVolumePointerDown}
        onDoubleClick={handleDoubleClick}
        title="Volume do Áudio: Arraste para cima/baixo para ajustar ou clique duas vezes para resetar (100%)"
      >
        <div className={styles.volumeLine} />

        {/* Draggable Center Pill Handle */}
        {width >= 40 && (
          <div className={styles.volumePillHandle}>
            {isMuted ? (
              <VolumeX size={10} color="#f43f5e" />
            ) : (
              <span className={styles.volumePillText}>
                {dbValue > 0 ? `+${dbValue.toFixed(1)}` : `${dbValue.toFixed(1)}`} dB
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TimelineWaveform = React.memo(TimelineWaveformComponent);
