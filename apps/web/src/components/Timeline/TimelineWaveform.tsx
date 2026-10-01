'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TimelineClip } from '@/types/editor';
import {
  getWaveformPeaks,
  generateProceduralPeaks,
  sliceWaveformPeaks,
  volumeToDb,
  formatVolumeText,
} from '@/utils/waveformGenerator';
import { Volume2, VolumeX } from 'lucide-react';
import styles from './Timeline.module.css';

interface TimelineWaveformProps {
  clip: TimelineClip;
  assetUrl?: string;
  assetDuration?: number;
  width: number;
  height: number;
  onVolumeChange: (newVol: number) => void;
  onVolumeCommit: () => void;
  onSelectAudio: () => void;
  colorScheme?: 'video' | 'audio';
}

export const TimelineWaveform: React.FC<TimelineWaveformProps> = ({
  clip,
  assetUrl,
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

  const [rawPeaks, setRawPeaks] = useState<number[]>(() =>
    generateProceduralPeaks(clip.assetId || clip.id, 120)
  );

  const [isHovered, setIsHovered] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState<number>(clip.volume);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const startVolumeRef = useRef(clip.volume);
  const currentVolumeRef = useRef(clip.volume);

  // Load actual asset peaks asynchronously and update smoothly
  useEffect(() => {
    let isCancelled = false;
    const loadPeaks = async () => {
      try {
        const peaks = await getWaveformPeaks(assetUrl, 160, clip.assetId || clip.id);
        if (!isCancelled && peaks && peaks.length > 0) {
          setRawPeaks(peaks);
        }
      } catch {
        // Fallback already in place
      }
    };
    loadPeaks();
    return () => {
      isCancelled = true;
    };
  }, [assetUrl, clip.assetId, clip.id]);

  // Keep volume ref up to date
  useEffect(() => {
    if (!isDraggingRef.current) {
      currentVolumeRef.current = clip.volume;
      setDragVolume(clip.volume);
    }
  }, [clip.volume]);

  // Draw waveform on canvas with retina crispness
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.max(10, width);
    const renderHeight = Math.max(16, height);

    canvas.width = renderWidth * dpr;
    canvas.height = renderHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, renderWidth, renderHeight);

    // Number of bars based on width (each bar is ~2px with 1.5px gap)
    const barWidth = 2;
    const barGap = 1.5;
    const barTotal = barWidth + barGap;
    const barCount = Math.max(8, Math.floor(renderWidth / barTotal));

    const totalDur = assetDuration || clip.duration + (clip.trimStart || 0);
    const sliced = sliceWaveformPeaks(
      rawPeaks,
      clip.trimStart || 0,
      clip.duration,
      totalDur,
      clip.speed || 1.0,
      barCount
    );

    const isMuted = clip.isMuted || clip.volume <= 0.001;
    const effectiveVol = isMuted ? 0 : isDraggingVolume ? dragVolume : clip.volume;

    // Amplitude modulation with volume: 1.0 = ~65% max height, up to 92% at 1.5
    const volumeFactor = Math.min(1.4, Math.max(0.2, effectiveVol * 0.75));

    sliced.forEach((peak, i) => {
      const x = i * barTotal + 1;
      if (x + barWidth > renderWidth) return;

      const rawPeakHeight = Math.max(2, peak * (renderHeight - 4));
      const peakHeight = isMuted ? 2 : Math.max(2, rawPeakHeight * volumeFactor);

      // Draw bottom-aligned or centered waveform bars
      const y = renderHeight - peakHeight;

      if (isMuted) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      } else if (colorScheme === 'video') {
        // CapCut Video Waveform: Mint / Emerald Glow
        const grad = ctx.createLinearGradient(0, y, 0, renderHeight);
        grad.addColorStop(0, '#34d399'); // emerald-400
        grad.addColorStop(1, '#059669'); // emerald-600
        ctx.fillStyle = grad;
      } else {
        // CapCut Audio Track: Vibrant Emerald / Cyan
        const grad = ctx.createLinearGradient(0, y, 0, renderHeight);
        grad.addColorStop(0, '#38bdf8'); // sky-400
        grad.addColorStop(0.5, '#34d399'); // emerald-400
        grad.addColorStop(1, '#059669'); // emerald-600
        ctx.fillStyle = grad;
      }

      // Rounded vertical bar
      const radius = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, peakHeight, [radius, radius, 0, 0]);
      ctx.fill();
    });
  }, [width, height, rawPeaks, clip.trimStart, clip.duration, clip.speed, clip.volume, clip.isMuted, isDraggingVolume, dragVolume, assetDuration, colorScheme]);

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
