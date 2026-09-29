'use client';

import React from 'react';
import { useEditor } from '@/context/EditorContext';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  RotateCw,
  Zap,
  CheckCircle,
} from 'lucide-react';
import styles from './Player.module.css';

const formatDisplayTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
};

export const PlayerControls: React.FC = () => {
  const {
    currentTime,
    setCurrentTime,
    isPlaying,
    togglePlay,
    project,
    splitClipAtPlayhead,
  } = useEditor();

  const handleStepBackward = () => {
    setCurrentTime(Math.max(0, currentTime - 1.0));
  };

  const handleStepForward = () => {
    setCurrentTime(Math.min(project.duration, currentTime + 1.0));
  };

  const handleJumpPrevCut = () => {
    const cutTimes = project.clips
      .flatMap((c) => [c.startInTimeline, c.startInTimeline + c.duration])
      .filter((t) => t < currentTime - 0.1)
      .sort((a, b) => b - a);

    if (cutTimes.length > 0) {
      setCurrentTime(cutTimes[0]);
    } else {
      setCurrentTime(0);
    }
  };

  const handleJumpNextCut = () => {
    const cutTimes = project.clips
      .flatMap((c) => [c.startInTimeline, c.startInTimeline + c.duration])
      .filter((t) => t > currentTime + 0.1)
      .sort((a, b) => a - b);

    if (cutTimes.length > 0) {
      setCurrentTime(cutTimes[0]);
    }
  };

  return (
    <div className={styles.controlsBar}>
      {/* Left: Timecode */}
      <div className={styles.timecodeGroup}>
        <span className={styles.timeCurrent}>{formatDisplayTime(currentTime)}</span>
        <span className={styles.timeTotal}>/ {formatDisplayTime(project.duration)}</span>
      </div>

      {/* Center: Playback Buttons */}
      <div className={styles.centerButtons}>
        <button
          className={styles.controlBtn}
          onClick={handleJumpPrevCut}
          title="Ir para o corte anterior"
        >
          <SkipBack size={16} />
        </button>

        <button
          className={`${styles.controlBtn} ${styles.stepBtn}`}
          onClick={handleStepBackward}
          title="Recuar 1 segundo"
        >
          <RotateCcw size={15} />
        </button>

        <button
          className={styles.playPauseBtn}
          onClick={togglePlay}
          title="Reproduzir / Pausar (Espaço)"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
        </button>

        <button
          className={`${styles.controlBtn} ${styles.stepBtn}`}
          onClick={handleStepForward}
          title="Avançar 1 segundo"
        >
          <RotateCw size={15} />
        </button>

        <button
          className={styles.controlBtn}
          onClick={handleJumpNextCut}
          title="Ir para o próximo corte"
        >
          <SkipForward size={16} />
        </button>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-default)', margin: '0 4px' }} />

        <button
          className={styles.controlBtn}
          onClick={() => splitClipAtPlayhead()}
          title="Dividir clipe no indicador de reprodução (S)"
          style={{ color: 'var(--accent-cyan)' }}
        >
          <Scissors size={15} />
        </button>
      </div>

      {/* Right: Audio & Fullscreen */}
      <div className={styles.rightControls}>
        <div className={styles.volumeGroup}>
          <Volume2 size={16} color="var(--text-secondary)" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            defaultValue="1"
            className={styles.volumeSlider}
            title="Volume Principal"
          />
        </div>

        <select className={styles.speedSelect} defaultValue="1" title="Velocidade de Reprodução">
          <option value="0.5">0.5x</option>
          <option value="1">1.0x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>

        {/* Status de Pré-carregamento e Cache do Google Drive */}
        {(() => {
          const driveAsset = project.assets.find((a) => a.isDrive && a.driveFileId);
          if (!driveAsset) return null;

          if (driveAsset.proxyUrl) {
            return (
              <div
                className={styles.cacheReadyBadge}
                title="Vídeo do Google Drive pré-carregado no cache local do navegador (0ms de latência, sem travamentos)"
              >
                <CheckCircle size={12} />
                <span>Drive Cache 100%</span>
              </div>
            );
          }

          if ((driveAsset.preloadProgress ?? 0) > 0 && (driveAsset.preloadProgress ?? 0) < 100) {
            return (
              <div
                className={styles.preloadBadge}
                title={`Pré-carregando vídeo do Google Drive no navegador para reprodução instantânea (${driveAsset.preloadProgress}%)`}
              >
                <div className={styles.preloadSpinner} />
                <span>Drive {driveAsset.preloadProgress}%</span>
              </div>
            );
          }

          return null;
        })()}

        <div
          className={styles.gpuBadge}
          title="Renderização e Decodificação Aceleradas por Hardware (GPU / WebGL / WebCodecs)"
        >
          <Zap size={12} className={styles.gpuIcon} />
          <span>GPU</span>
        </div>

        <button
          className={styles.controlBtn}
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            } else {
              document.exitFullscreen().catch(() => {});
            }
          }}
          title="Tela Cheia"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
};
