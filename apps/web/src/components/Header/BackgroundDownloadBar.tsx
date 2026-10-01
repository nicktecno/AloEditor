'use client';

import React from 'react';
import { useEditor } from '@/context/EditorContext';
import { CloudDownload, CheckCircle2, Zap } from 'lucide-react';
import styles from './BackgroundDownloadBar.module.css';

export const BackgroundDownloadBar: React.FC = () => {
  const { backgroundDownloads } = useEditor();

  if (!backgroundDownloads || backgroundDownloads.length === 0) {
    return null;
  }

  // Mostra o item em progresso prioritário
  const current = backgroundDownloads[0];
  const isDone = current.percent >= 100;

  const loadedMb = current.loadedBytes && current.loadedBytes > 0
    ? (current.loadedBytes / (1024 * 1024)).toFixed(0)
    : Math.round((current.percent / 100) * ((current.totalBytes || 0) / (1024 * 1024)));

  const totalMb = current.totalBytes && current.totalBytes > 0
    ? (current.totalBytes / (1024 * 1024)).toFixed(0)
    : null;

  return (
    <div className={styles.downloadBarContainer} role="status" aria-live="polite">
      <div className={styles.leftInfo}>
        <div className={styles.iconWrapper}>
          {isDone ? (
            <CheckCircle2 size={16} color="#10b981" />
          ) : (
            <CloudDownload size={16} className={styles.spinPulse} />
          )}
        </div>
        <div className={styles.textGroup}>
          <span className={styles.mainLabel}>
            {isDone ? 'Download concluído:' : 'Baixando em segundo plano:'}
          </span>
          <span className={styles.fileName} title={current.name}>
            {current.name}
          </span>
          {totalMb && (
            <span className={styles.sizeText}>
              ({loadedMb} MB / {totalMb} MB)
            </span>
          )}
        </div>
      </div>

      <div className={styles.rightControls}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.max(4, Math.min(100, current.percent))}%` }}
          />
        </div>
        <span className={styles.percentBadge}>{current.percent}%</span>
        <div className={styles.statusPill}>
          <Zap size={11} />
          <span>Edição Liberada</span>
        </div>
      </div>
    </div>
  );
};
