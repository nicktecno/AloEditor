'use client';

import React, { useRef } from 'react';
import { useEditor } from '@/context/EditorContext';
import styles from './Timeline.module.css';

interface TimelineRulerProps {
  totalDuration: number;
  totalWidth?: number;
}

export const TimelineRulerComponent: React.FC<TimelineRulerProps> = ({ totalDuration, totalWidth }) => {
  const { zoom, setCurrentTime } = useEditor();
  const rulerRef = useRef<HTMLDivElement | null>(null);

  const computedWidth = totalWidth ?? Math.max(totalDuration * zoom, 100);

  // Intervalos adaptativos com base no zoom para nunca encavalar os números da régua
  let secondInterval = 1;
  if (zoom < 0.8) {
    secondInterval = 120; // 2 minutos
  } else if (zoom < 1.5) {
    secondInterval = 60; // 1 minuto
  } else if (zoom < 3) {
    secondInterval = 30; // 30 segundos
  } else if (zoom < 6) {
    secondInterval = 15; // 15 segundos
  } else if (zoom < 15) {
    secondInterval = 10; // 10 segundos
  } else if (zoom < 35) {
    secondInterval = 5; // 5 segundos
  } else if (zoom < 75) {
    secondInterval = 2; // 2 segundos
  } else {
    secondInterval = 1; // 1 segundo
  }

  // Generate tick marks
  const ticks = [];
  for (let s = 0; s <= totalDuration + secondInterval; s += secondInterval) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    ticks.push({
      time: s,
      left: s * zoom,
      label,
    });
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {}

    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = Math.max(0, clickX / zoom);
    setCurrentTime(clickedTime);

    let rafId: number | null = null;
    let pendingTime: number | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!rulerRef.current) return;
      const rRect = rulerRef.current.getBoundingClientRect();
      const currentX = moveEvent.clientX - rRect.left;
      pendingTime = Math.max(0, currentX / zoom);

      // Auto-scroll timeline container when scrubbing ruler near edge of screen
      const scrollEl = document.getElementById('alo_timeline_scrollable');
      if (scrollEl) {
        const sRect = scrollEl.getBoundingClientRect();
        if (moveEvent.clientX > sRect.right - 45) {
          scrollEl.scrollLeft += 15;
        } else if (moveEvent.clientX < sRect.left + 45) {
          scrollEl.scrollLeft -= 15;
        }
      }

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (pendingTime !== null) {
            setCurrentTime(pendingTime);
            pendingTime = null;
          }
        });
      }
    };

    const onPointerUp = (upEv?: PointerEvent) => {
      try {
        if (upEv) {
          targetEl.releasePointerCapture(upEv.pointerId);
        }
      } catch {}
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pendingTime !== null) {
        setCurrentTime(pendingTime);
        pendingTime = null;
      }
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
      ref={rulerRef}
      className={styles.rulerTrack}
      style={{ width: `${computedWidth}px` }}
      onPointerDown={handlePointerDown}
    >
      {ticks.map((tick) => (
        <div
          key={tick.time}
          className={`${styles.rulerTick} ${styles.rulerTickMajor}`}
          style={{ left: `${tick.left}px` }}
        >
          <span className={styles.rulerText}>{tick.label}</span>
        </div>
      ))}
    </div>
  );
};

export const TimelineRuler = React.memo(TimelineRulerComponent);
