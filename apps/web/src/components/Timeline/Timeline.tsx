'use client';

import React, { useRef } from 'react';
import { useEditor } from '@/context/EditorContext';
import { TimelineRuler } from './TimelineRuler';
import { TimelineClip } from './TimelineClip';
import {
  Scissors,
  Trash2,
  Copy,
  Magnet,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Type,
  Film,
  Music,
  Layers,
  Maximize,
  Maximize2,
  Minimize2,
  CheckSquare,
  Eraser,
  Sparkles,
  Undo2,
  Redo2,
} from 'lucide-react';
import { GENERIC_VIDEO_THUMBNAIL, captureVideoThumbnail, getMediaDuration } from '@/utils/thumbnailGenerator';
import { MediaAsset } from '@/types/editor';
import styles from './Timeline.module.css';

export const Timeline: React.FC = () => {
  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    selectedClipId,
    selectedClipIds,
    selectedClip,
    selectAllClips,
    clearSelection,
    splitClipAtPlayhead,
    deleteSelectedClips,
    duplicateClip,
    detachAudioFromClip,
    clearTimeline,
    isSnappingEnabled,
    toggleSnapping,
    snapGuideTime,
    setSnapGuideTime,
    addClipToTrack,
    addAsset,
    updateAssetThumbnail,
    syncMediaDuration,
    setIsSilenceModalOpen,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditor();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const trackHeadersRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  // Auto-follow: Manter a agulha vermelha visível na timeline durante a reprodução ou navegação (especialmente com zoom)
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const playheadX = currentTime * zoom;
    const viewLeft = container.scrollLeft;
    const viewWidth = container.clientWidth;
    const viewRight = viewLeft + viewWidth;

    if (isPlaying) {
      // Quando a agulha vermelha avança e alcança 80% da tela visível, rola a visualização suavemente
      if (playheadX > viewRight - 80) {
        container.scrollLeft = Math.max(0, playheadX - viewWidth * 0.2);
      } else if (playheadX < viewLeft) {
        container.scrollLeft = Math.max(0, playheadX - viewWidth * 0.2);
      }
    } else {
      // Durante navegação manual com setas ou saltos: mantém a agulha no enquadramento visível
      if (playheadX > viewRight - 40) {
        container.scrollLeft = playheadX - viewWidth + 80;
      } else if (playheadX < viewLeft + 30) {
        container.scrollLeft = Math.max(0, playheadX - 60);
      }
    }
  }, [currentTime, zoom, isPlaying]);

  zoomRef.current = zoom;

  // Dynamic timeline height (default 270px, resizable from 180px to 480px)
  const [timelineHeight, setTimelineHeight] = React.useState<number>(270);
  const [isResizing, setIsResizing] = React.useState<boolean>(false);

  React.useEffect(() => {
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const saved = localStorage.getItem('alo_timeline_height');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 180 && val <= 500) {
          setTimelineHeight(val);
          return;
        }
      }
      if (isMobile) {
        setTimelineHeight(250);
      } else if (typeof window !== 'undefined') {
        if (window.innerHeight <= 768) {
          setTimelineHeight(195);
        } else if (window.innerHeight <= 900) {
          setTimelineHeight(230);
        }
      }
    } catch {}
  }, []);

  const toggleTimelineHeight = () => {
    setTimelineHeight((prev) => {
      const next = prev >= 320 ? 240 : 380;
      try {
        localStorage.setItem('alo_timeline_height', String(next));
      } catch {}
      return next;
    });
  };

  const handleTracksScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScrollRef.current) return;
    if (trackHeadersRef.current) {
      isSyncingScrollRef.current = true;
      trackHeadersRef.current.scrollTop = e.currentTarget.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  const handleHeadersScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScrollRef.current) return;
    if (scrollContainerRef.current) {
      isSyncingScrollRef.current = true;
      scrollContainerRef.current.scrollTop = e.currentTarget.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);
    setIsResizing(true);

    const startY = e.clientY;
    const startH = timelineHeight;

    const onPointerMove = (moveEv: PointerEvent) => {
      const delta = startY - moveEv.clientY;
      const newH = Math.max(180, Math.min(480, startH + delta));
      setTimelineHeight(newH);
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEv.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setIsResizing(false);
      const finalDelta = startY - upEv.clientY;
      const finalH = Math.max(180, Math.min(480, startH + finalDelta));
      try {
        localStorage.setItem('alo_timeline_height', String(finalH));
      } catch {}
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const [containerWidth, setContainerWidth] = React.useState<number>(1000);

  React.useEffect(() => {
    const updateWidth = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Atalho do mouse / trackpad e celular: Pinch com 2 dedos para zoom fluido
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 1. Trackpad pinch (disparado como wheel com ctrlKey no Mac e Windows) + Ctrl/Cmd + Roda do Mouse
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const currentZoom = zoomRef.current;
        const rect = container.getBoundingClientRect();
        const mouseX = Math.max(0, e.clientX - rect.left);
        const contentX = mouseX + container.scrollLeft;
        const timeAtCursor = contentX / currentZoom;

        // Sensibilidade fluida contínua para trackpads e scroll wheel
        const factor = Math.exp(-e.deltaY * 0.008);
        const newZoom = Math.min(180, Math.max(0.5, Math.round(currentZoom * factor * 10) / 10));

        if (newZoom !== currentZoom) {
          setZoom(newZoom);
          // Mantém o ponto sob o cursor estável na tela
          const newContentX = timeAtCursor * newZoom;
          container.scrollLeft = Math.max(0, newContentX - mouseX);
        }
      }
    };

    // 2. Celular / Tablet: Pinch com 2 dedos na timeline
    let initialPinchDistance = 0;
    let initialPinchZoom = 0;
    let initialPinchTimeAtCenter = 0;
    let isPinching = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist > 10) {
          isPinching = true;
          initialPinchDistance = dist;
          initialPinchZoom = zoomRef.current;
          const rect = container.getBoundingClientRect();
          const midX = (t1.clientX + t2.clientX) / 2;
          const contentX = Math.max(0, midX - rect.left + container.scrollLeft);
          initialPinchTimeAtCenter = contentX / initialPinchZoom;
        }
      } else {
        isPinching = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching) {
        // Impede o navegador móvel de dar zoom na página inteira
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (currentDist > 5 && initialPinchDistance > 0) {
          const scale = currentDist / initialPinchDistance;
          const newZoom = Math.min(180, Math.max(0.5, Math.round(initialPinchZoom * scale * 10) / 10));
          setZoom(newZoom);

          // Ajusta o scroll horizontal para manter o centro dos dedos estável
          const rect = container.getBoundingClientRect();
          const currentMidX = (t1.clientX + t2.clientX) / 2;
          const newContentX = initialPinchTimeAtCenter * newZoom;
          container.scrollLeft = Math.max(0, newContentX - (currentMidX - rect.left));
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching = false;
        initialPinchDistance = 0;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [setZoom]);

  // Calcula a duração total real considerando o fim de todos os clipes presentes no projeto
  const maxClipEnd = project.clips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 0);
  const effectiveDuration = Math.max(project.duration, maxClipEnd, 1);
  const totalWidth = Math.max(effectiveDuration * zoom, containerWidth || 800);
  const playheadLeft = currentTime * zoom;
  const snapGuideLeft = snapGuideTime !== null ? snapGuideTime * zoom : null;

  // Check if there are any video clips currently on the timeline
  const hasVideoClips = project.clips.some(
    (c) => c.type === 'video' || c.trackId === 'track_video_main' || c.trackId === 'track_video_overlay'
  );

  const handleTrackDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!hasVideoClips) {
      setSnapGuideTime(0);
    }
  };

  const handleTrackDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setSnapGuideTime(null);
    }
  };

  const handleTrackDrop = async (e: React.DragEvent<HTMLDivElement>, targetTrackId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSnapGuideTime(null);

    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (rawData) {
        const asset = JSON.parse(rawData) as MediaAsset;
        const isVideo = asset.type === 'video';

        let dropTime = 0;
        let finalTrackId = targetTrackId || (asset.type === 'audio' ? 'track_audio_bg' : 'track_video_main');

        // Se não houver vídeo na timeline e for arrastado um vídeo, importa para o início exato (0:00)
        if (isVideo && !hasVideoClips) {
          dropTime = 0;
          finalTrackId = 'track_video_main';
          setCurrentTime(0);
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = 0;
          }
        } else if (scrollContainerRef.current) {
          const rect = scrollContainerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
          dropTime = Math.max(0, x / zoom);
        }

        addClipToTrack(asset, finalTrackId, dropTime);
        return;
      }

      // Drag and drop direto de arquivos de mídia do computador (SO / Explorer / Finder)
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isVideo = file.type.startsWith('video');
          const isAudio = file.type.startsWith('audio');

          let detectedDuration = 10.0;
          if (isVideo || isAudio) {
            try {
              detectedDuration = await getMediaDuration(file, isAudio);
            } catch (err) {
              console.warn('Não foi possível detectar duração do arquivo:', err);
            }
          }

          const assetId = `asset_upload_${Date.now()}_${i}`;
          const url = URL.createObjectURL(file);
          const newAsset: MediaAsset = {
            id: assetId,
            name: file.name,
            type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
            url,
            duration: detectedDuration,
            size: file.size,
            status: 'ready',
            preloadProgress: 100,
            thumbnailUrl: isVideo ? GENERIC_VIDEO_THUMBNAIL : undefined,
          };

          addAsset(newAsset);

          if (isVideo) {
            captureVideoThumbnail(file, 0.5, (dur) => {
              if (dur && dur > 0 && Math.abs(dur - detectedDuration) > 0.5) {
                syncMediaDuration(assetId, dur);
              }
            }).then((captured) => {
              if (captured && captured !== GENERIC_VIDEO_THUMBNAIL) {
                updateAssetThumbnail(assetId, captured);
              }
            });
          }

          let dropTime = 0;
          let finalTrackId = targetTrackId || (isAudio ? 'track_audio_bg' : 'track_video_main');

          if (isVideo && !hasVideoClips) {
            dropTime = 0;
            finalTrackId = 'track_video_main';
            setCurrentTime(0);
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft = 0;
            }
          } else if (scrollContainerRef.current) {
            const rect = scrollContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
            dropTime = Math.max(0, x / zoom);
          }

          addClipToTrack(newAsset, finalTrackId, dropTime);
        }
      }
    } catch (err) {
      console.error('Erro ao soltar mídia na timeline:', err);
    }
  };

  // Track icons helper
  const getTrackIcon = (type: string, trackId?: string) => {
    if (trackId === 'track_video_overlay') {
      return <Layers size={16} color="#fbbf24" />;
    }
    switch (type) {
      case 'text':
        return <Type size={16} color="#f59e0b" />;
      case 'audio':
        return <Music size={16} color="#10b981" />;
      default:
        return <Film size={16} color="#3b82f6" />;
    }
  };

  // Playhead dragging with pointer capture & edge auto-scrolling
  const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {}

    let rafId: number | null = null;
    let pendingTime: number | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left + container.scrollLeft;
      pendingTime = Math.max(0, x / zoom);

      // Auto-scroll when scrubbing near edge on mobile/desktop
      const edgeThreshold = 45;
      if (moveEvent.clientX > rect.right - edgeThreshold) {
        container.scrollLeft += 15;
      } else if (moveEvent.clientX < rect.left + edgeThreshold) {
        container.scrollLeft -= 15;
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

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
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

  // Distinguish quick tap/click from touch swipe/scroll on mobile
  const trackPointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTrackLanePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(`.${styles.clipItem}`)) return;
    trackPointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
  };

  const handleTrackLanePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackPointerStartRef.current) return;
    const dx = Math.abs(e.clientX - trackPointerStartRef.current.x);
    const dy = Math.abs(e.clientY - trackPointerStartRef.current.y);
    const dt = Date.now() - trackPointerStartRef.current.time;
    trackPointerStartRef.current = null;

    // Only position playhead if user did a quick tap (< 10px displacement, < 450ms)
    // If user swiped/scrolled horizontally across tracks, DO NOT alter currentTime or clearSelection
    if (dx < 10 && dy < 10 && dt < 450) {
      if ((e.target as HTMLElement).closest(`.${styles.clipItem}`)) return;
      if (!scrollContainerRef.current) return;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
      setCurrentTime(Math.max(0, x / zoom));
      clearSelection();
    }
  };

  return (
    <div
      className={styles.timelineWrapper}
      style={{ height: `${timelineHeight}px` }}
    >
      {/* Top Border Resize Handle */}
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizeHandleActive : ''}`}
        onPointerDown={handleResizePointerDown}
        title="Arraste para ajustar a altura da timeline"
      />

      {/* Top Toolbar */}
      <div className={styles.toolbar}>
        {/* Undo / Redo Tool Group */}
        <div className={styles.historyToolGroup}>
          <button
            className={styles.toolBtn}
            onClick={undo}
            disabled={!canUndo}
            title="Desfazer ação anterior (Ctrl+Z / Cmd+Z)"
          >
            <Undo2 size={15} />
            <span>Desfazer</span>
          </button>
          <button
            className={styles.toolBtn}
            onClick={redo}
            disabled={!canRedo}
            title="Refazer ação desfeita (Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)"
          >
            <Redo2 size={15} />
            <span>Refazer</span>
          </button>
        </div>

        <div className={styles.toolDivider} />

        <div className={styles.toolGroup}>
          <button
            className={styles.toolBtn}
            onClick={() => splitClipAtPlayhead()}
            disabled={!selectedClipId}
            title="Dividir clipe selecionado no indicador (S)"
          >
            <Scissors size={15} color="var(--accent-cyan)" />
            <span>Dividir (S)</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={() => setIsSilenceModalOpen(true)}
            disabled={!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'audio')}
            title="Auto Cut estilo CapCut: Identificar e cortar silêncios (> 1.0s) automaticamente"
            style={{
              background: 'rgba(99, 102, 241, 0.16)',
              borderColor: 'rgba(99, 102, 241, 0.4)',
              color: '#c7d2fe',
              fontWeight: 600,
            }}
          >
            <Sparkles size={15} color="#818cf8" />
            <span>Cortar Silêncios</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={deleteSelectedClips}
            disabled={selectedClipIds.length === 0}
            title="Excluir clipes selecionados (Del / Backspace)"
          >
            <Trash2 size={15} color="var(--accent-rose)" />
            <span>Excluir</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={() => selectedClipId && duplicateClip(selectedClipId)}
            disabled={!selectedClipId}
            title="Duplicar clipe (Ctrl+D / Cmd+D)"
          >
            <Copy size={15} />
            <span>Duplicar</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={() => selectedClipId && detachAudioFromClip(selectedClipId)}
            disabled={!selectedClip || selectedClip.type !== 'video'}
            title="Desvincular áudio do vídeo em trilha independente"
            style={{ color: selectedClip?.type === 'video' ? '#34d399' : undefined }}
          >
            <Volume2 size={15} color={selectedClip?.type === 'video' ? '#34d399' : undefined} />
            <span>Desvincular Áudio</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={selectAllClips}
            title="Selecionar Todos os Clipes (Cmd+A / Ctrl+A)"
          >
            <CheckSquare size={15} />
            <span>Selecionar Tudo</span>
          </button>

          <button
            className={styles.toolBtn}
            onClick={() => {
              if (confirm('Deseja remover todos os clipes da timeline?')) {
                clearTimeline();
              }
            }}
            disabled={project.clips.length === 0}
            title="Limpar todos os clipes da timeline"
          >
            <Eraser size={15} color="var(--accent-amber)" />
            <span>Limpar Timeline</span>
          </button>

          {selectedClipIds.length > 1 && (
            <span className={styles.selectionCounter}>
              {selectedClipIds.length} selecionados
            </span>
          )}

          <div className={styles.toolDivider} />

          <button
            className={`${styles.toolBtn} ${isSnappingEnabled ? styles.toolBtnActive : ''}`}
            onClick={toggleSnapping}
            title="Encaixe Magnético (Snap)"
          >
            <Magnet size={15} />
            <span>Magnetismo {isSnappingEnabled ? 'Ativado' : 'Desativado'}</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className={styles.zoomGroup}>
          <button
            className={styles.toolBtn}
            onClick={zoomOut}
            title="Diminuir Zoom (Atalho: -)"
          >
            <ZoomOut size={16} />
          </button>

          <input
            type="range"
            min="0.5"
            max="150"
            step="0.5"
            value={zoom}
            className={styles.zoomSlider}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            title="Zoom da Linha do Tempo (Atalhos: + e -)"
          />

          <button
            className={styles.toolBtn}
            onClick={zoomIn}
            title="Aumentar Zoom (Atalho: + ou =)"
          >
            <ZoomIn size={16} />
          </button>

          <button
            className={styles.toolBtn}
            onClick={zoomToFit}
            title="Ajustar à Tela: Ver todas as mídias do projeto (Atalho: Shift + Z)"
          >
            <Maximize size={15} />
            <span>Ver Tudo</span>
          </button>
        </div>

        {/* Height Expand/Collapse Quick Toggle */}
        <button
          className={styles.toolBtn}
          onClick={toggleTimelineHeight}
          title={timelineHeight >= 320 ? 'Recolher altura da timeline' : 'Expandir altura da timeline'}
        >
          {timelineHeight >= 320 ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          <span>{timelineHeight >= 320 ? 'Recolher' : 'Expandir'}</span>
        </button>
      </div>

      {/* Main Timeline Scrollable Content */}
      <div className={styles.timelineScrollArea}>
        {/* Fixed Track Headers */}
        <div
          ref={trackHeadersRef}
          className={styles.trackHeadersColumn}
          onScroll={handleHeadersScroll}
        >
          <div className={styles.rulerHeaderCorner}>
            <span>Trilhas</span>
          </div>

          {project.tracks.map((track) => {
            const isAudio = track.type === 'audio';
            const isOverlay = track.id === 'track_video_overlay';
            const isText = track.type === 'text';
            const isSlim = isAudio || isOverlay || isText;

            let headerClass = styles.trackHeaderItem;
            if (isAudio) headerClass += ` ${styles.trackHeaderItemAudio}`;
            else if (isOverlay) headerClass += ` ${styles.trackHeaderItemOverlay}`;
            else if (isText) headerClass += ` ${styles.trackHeaderItemText}`;
            else if (isSlim) headerClass += ` ${styles.trackHeaderItemSlim}`;

            return (
              <div key={track.id} className={headerClass}>
                <div className={styles.trackHeaderInfo} title={track.name}>
                  {getTrackIcon(track.type, track.id)}
                  <span>{track.name}</span>
                </div>

                <div className={styles.trackHeaderActions}>
                  <button
                    className={`${styles.trackActionBtn} ${track.isMuted ? styles.trackActionBtnActive : ''}`}
                    title={track.isMuted ? 'Desmutar' : 'Mutar'}
                  >
                    {track.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    className={`${styles.trackActionBtn} ${track.isLocked ? styles.trackActionBtnActive : ''}`}
                    title={track.isLocked ? 'Desbloquear' : 'Bloquear'}
                  >
                    {track.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button
                    className={`${styles.trackActionBtn} ${track.isHidden ? styles.trackActionBtnActive : ''}`}
                    title={track.isHidden ? 'Mostrar' : 'Ocultar'}
                  >
                    {track.isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable Tracks Area */}
        <div
          id="alo_timeline_scrollable"
          ref={scrollContainerRef}
          className={styles.tracksScrollable}
          onScroll={handleTracksScroll}
          onDragOver={handleTrackDragOver}
          onDragLeave={handleTrackDragLeave}
          onDrop={(e) => handleTrackDrop(e, 'track_video_main')}
        >
          <div
            className={styles.tracksContentContainer}
            style={{ width: `${totalWidth}px` }}
            onPointerDown={handleTrackLanePointerDown}
            onPointerUp={handleTrackLanePointerUp}
            onDragOver={handleTrackDragOver}
            onDragLeave={handleTrackDragLeave}
            onDrop={(e) => handleTrackDrop(e, 'track_video_main')}
          >
            {/* Top Ruler Bar */}
            <TimelineRuler totalDuration={effectiveDuration} totalWidth={totalWidth} />

            {/* Magnetic Snapping Visual Guide Line */}
            {snapGuideLeft !== null && (
              <div
                className={styles.snapGuideLine}
                style={{ left: `${snapGuideLeft}px` }}
              >
                <div className={styles.snapGuideTag}>SNAP (00:00)</div>
              </div>
            )}

            {/* Playhead Needle (Across all tracks - Acelerado por GPU) */}
            <div
              className={styles.playheadNeedle}
              style={{ transform: `translate3d(${playheadLeft}px, 0, 0)` }}
            >
              <div
                className={styles.playheadHead}
                onPointerDown={handlePlayheadPointerDown}
                title="Indicador de Reprodução (Arraste para navegar)"
              />
            </div>

            {/* Track Lanes */}
            {project.tracks.map((track) => {
              const trackClips = project.clips.filter((c) => c.trackId === track.id);
              const isAudio = track.type === 'audio';
              const isOverlay = track.id === 'track_video_overlay';
              const isText = track.type === 'text';
              const isSlim = isAudio || isOverlay || isText;

              let laneClass = styles.trackLane;
              if (isAudio) laneClass += ` ${styles.trackLaneAudio}`;
              else if (isOverlay) laneClass += ` ${styles.trackLaneOverlay}`;
              else if (isText) laneClass += ` ${styles.trackLaneText}`;
              else if (isSlim) laneClass += ` ${styles.trackLaneSlim}`;

              return (
                <div
                  key={track.id}
                  className={laneClass}
                  onDragOver={handleTrackDragOver}
                  onDragLeave={handleTrackDragLeave}
                  onDrop={(e) => handleTrackDrop(e, track.id)}
                >
                  {track.id === 'track_video_main' && trackClips.length === 0 && (
                    <div className={styles.emptyTrackHint}>
                      <Film size={14} opacity={0.6} />
                      <span>Arraste um vídeo aqui para começar no início (00:00)</span>
                    </div>
                  )}
                  {trackClips.map((clip) => (
                    <TimelineClip key={clip.id} clip={clip} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
