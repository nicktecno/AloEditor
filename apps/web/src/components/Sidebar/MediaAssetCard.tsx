'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Volume2, Cloud, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { MediaAsset } from '@/types/editor';
import { GENERIC_VIDEO_THUMBNAIL, handleThumbnailError } from '@/utils/thumbnailGenerator';
import styles from './Sidebar.module.css';

interface MediaAssetCardProps {
  asset: MediaAsset;
  onAdd: (asset: MediaAsset) => void;
  onDelete?: (asset: MediaAsset) => void;
  title?: string;
}

const formatDisplayTime = (sec: number) => {
  if (isNaN(sec) || !isFinite(sec)) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}.${tenths}`;
};

export const MediaAssetCard: React.FC<MediaAssetCardProps> = ({ asset, onAdd, onDelete, title }) => {
  const isVideo = asset.type === 'video';
  const [isHovered, setIsHovered] = useState(false);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const duration = asset.duration && asset.duration > 0 ? asset.duration : 10;

  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!isVideo) return;
    setIsHovered(true);
    setCurrentTime(0);
    setScrubRatio(0);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = 0;
      } catch {}
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVideo || !videoRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    // Relative mouse X position from 0 (left = start) to 1 (right = end of video)
    const clientX = e.clientX;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = x / rect.width;

    const effectiveDuration =
      videoRef.current.duration && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0
        ? videoRef.current.duration
        : duration;

    const targetTime = Math.max(0, Math.min(effectiveDuration, ratio * effectiveDuration));

    setScrubRatio(ratio);
    setCurrentTime(targetTime);

    // Pause video while user is rapidly scrubbing across
    if (!videoRef.current.paused) {
      videoRef.current.pause();
    }

    // High performance seek via RequestAnimationFrame
    pendingSeekRef.current = targetTime;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        if (videoRef.current && pendingSeekRef.current !== null) {
          if ('fastSeek' in videoRef.current && typeof (videoRef.current as any).fastSeek === 'function') {
            try {
              (videoRef.current as any).fastSeek(pendingSeekRef.current);
            } catch {
              videoRef.current.currentTime = pendingSeekRef.current;
            }
          } else {
            videoRef.current.currentTime = pendingSeekRef.current;
          }
        }
        rafRef.current = null;
      });
    }

    // When the mouse stops moving at a specific point, smoothly play forward from that position
    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    playTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && isHovered) {
        videoRef.current.play().catch(() => {});
      }
    }, 120);
  };

  const handleMouseLeave = () => {
    if (!isVideo) return;
    setIsHovered(false);
    setScrubRatio(null);
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      try {
        videoRef.current.currentTime = 0;
      } catch {}
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && isHovered) {
      const vTime = videoRef.current.currentTime;
      setCurrentTime(vTime);
      const effectiveDuration =
        videoRef.current.duration && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0
          ? videoRef.current.duration
          : duration;
      if (effectiveDuration > 0) {
        setScrubRatio(Math.min(1, vTime / effectiveDuration));
      }
    }
  };

  const isImporting = asset.status === 'importing' || ((asset.preloadProgress ?? 100) < 100 && !asset.proxyUrl && !asset.url?.startsWith('blob:'));

  return (
    <div
      className={styles.assetCard}
      draggable={!isImporting}
      onDragStart={(e) => {
        if (isImporting) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('application/json', JSON.stringify(asset));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        if (isImporting) {
          alert(`A mídia "${asset.name}" ainda está sendo importada para a memória (${asset.preloadProgress ?? 0}%). Por favor, aguarde.`);
          return;
        }
        onAdd(asset);
      }}
      style={{
        opacity: isImporting ? 0.75 : 1,
        cursor: isImporting ? 'not-allowed' : 'pointer',
      }}
      title={
        isImporting
          ? `Importando para a memória (${asset.preloadProgress ?? 0}%)... Não pode ser adicionada ainda.`
          : (title || 'Passe o mouse para pré-visualizar • Clique ou arraste para a linha do tempo')
      }
    >
      <div
        className={styles.thumbnailWrapper}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {isVideo ? (
          <>
            {/* Base static poster / thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
              alt={asset.name}
              className={styles.thumbnailImg}
              onError={handleThumbnailError}
            />

            {/* Video element for real-time hover scrubbing and preview */}
            <video
              ref={videoRef}
              src={asset.proxyUrl || asset.url}
              preload="metadata"
              muted
              playsInline
              className={styles.previewVideo}
              style={{
                opacity: isHovered && isVideoLoaded ? 1 : 0,
                pointerEvents: 'none',
              }}
              onLoadedData={() => setIsVideoLoaded(true)}
              onTimeUpdate={handleTimeUpdate}
            />

            {/* Scrub Progress Bar Indicator at bottom */}
            {isHovered && scrubRatio !== null && (
              <div className={styles.scrubBarContainer}>
                <div className={styles.scrubBarFill} style={{ width: `${Math.max(0, Math.min(100, scrubRatio * 100))}%` }}>
                  <div className={styles.scrubBarThumb} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.audioPlaceholder}>
            <Volume2 size={24} />
          </div>
        )}

        {/* Dynamic Duration / Scrub Timecode Badge */}
        <div
          className={`${styles.durationBadge} ${isHovered && isVideo ? styles.durationBadgeActive : ''}`}
        >
          {isHovered && isVideo
            ? `${formatDisplayTime(currentTime)} / ${formatDisplayTime(duration)}`
            : `${duration.toFixed(1)}s`}
        </div>

        {/* Full Importing Overlay (enquanto baixa para a memória) */}
        {isImporting && (
          <div className={styles.importingOverlay} onClick={(e) => e.stopPropagation()}>
            <div className={styles.importingSpinner} />
            <div className={styles.importingTextGroup}>
              <span className={styles.importingTitle}>Importando...</span>
              <span className={styles.importingPercent}>{asset.preloadProgress ?? 0}%</span>
            </div>
            <div className={styles.importingProgressBar}>
              <div
                className={styles.importingProgressFill}
                style={{ width: `${Math.max(6, asset.preloadProgress ?? 0)}%` }}
              />
            </div>
            <span className={styles.importingSub}>Carregando em memória</span>
          </div>
        )}

        {asset.isDrive ? (
          <div
            className={asset.isAuthExpired ? styles.badgeOffline : styles.badgeDrive}
            title={
              asset.isAuthExpired
                ? 'Sessão do Google Drive expirada. Reconecte para reproduzir.'
                : asset.proxyUrl
                ? 'Vídeo em cache local no navegador (0ms latência)'
                : 'Vídeo do Google Drive'
            }
          >
            {asset.isAuthExpired ? <AlertTriangle size={10} /> : <Cloud size={10} />}
            <span>
              {asset.isAuthExpired
                ? 'DRIVE EXPIRADO'
                : isImporting
                ? `BAIXANDO ${asset.preloadProgress ?? 0}%`
                : asset.proxyUrl
                ? 'DRIVE • MEMÓRIA'
                : 'DRIVE'}
            </span>
          </div>
        ) : asset.proxyUrl ? (
          <div className={styles.badgeCached} title="Vídeo otimizado no cache local do navegador">
            <span>CACHE 100%</span>
          </div>
        ) : asset.isOffline ? (
          <div className={styles.badgeOffline} title="Arquivo offline. Reconecte a pasta para reativar.">
            <AlertTriangle size={10} />
            <span>OFFLINE</span>
          </div>
        ) : null}

        {/* Quick Action Buttons (Add + & Delete Trash) */}
        <div className={styles.cardActionBtns}>
          {onDelete && (
            <button
              type="button"
              className={styles.deleteBtnCircle}
              title={`Apagar "${asset.name}" da biblioteca`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(asset);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            className={styles.addBtnCircle}
            disabled={isImporting}
            style={{
              opacity: isImporting ? 0.35 : 1,
              cursor: isImporting ? 'not-allowed' : 'pointer',
            }}
            title={isImporting ? 'Mídia ainda sendo baixada para a memória' : 'Adicionar à Linha do Tempo'}
            onClick={(e) => {
              e.stopPropagation();
              if (isImporting) {
                alert(`A mídia "${asset.name}" ainda está sendo importada para a memória (${asset.preloadProgress ?? 0}%). Aguarde a conclusão.`);
                return;
              }
              onAdd(asset);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className={styles.assetInfo}>
        <span className={styles.assetName} title={asset.name}>
          {asset.name}
        </span>
        <span className={styles.assetMeta}>
          {asset.type.toUpperCase()} • {((asset.size || 0) / (1024 * 1024)).toFixed(1)} MB
        </span>
      </div>
    </div>
  );
};
