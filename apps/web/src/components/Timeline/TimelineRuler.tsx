'use client';

import React, { useRef } from 'react';
import { useEditor } from '@/context/EditorContext';
import styles from './Timeline.module.css';

interface TimelineRulerProps {
  totalDuration: number;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ totalDuration }) => {
  const { zoom, setCurrentTime } = useEditor();
  const rulerRef = useRef<HTMLDivElement | null>(null);

  const totalWidth = Math.max(totalDuration * zoom, 1200);

  // Generate tick marks
  const ticks = [];
  const secondInterval = zoom < 40 ? 5 : zoom < 80 ? 2 : 1;

  for (let s = 0; s <= totalDuration + 2; s += secondInterval) {
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
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = Math.max(0, clickX / zoom);
    setCurrentTime(clickedTime);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentX = moveEvent.clientX - rect.left;
      setCurrentTime(Math.max(0, currentX / zoom));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      ref={rulerRef}
      className={styles.rulerTrack}
      style={{ width: `${totalWidth}px` }}
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
