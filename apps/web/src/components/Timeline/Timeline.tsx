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
  Maximize2,
  Minimize2,
  CheckSquare,
  Eraser,
  Sparkles,
} from 'lucide-react';
import styles from './Timeline.module.css';

export const Timeline: React.FC = () => {
  const {
    project,
    currentTime,
    setCurrentTime,
    zoom,
    setZoom,
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
    addClipToTrack,
    setIsSilenceModalOpen,
  } = useEditor();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const trackHeadersRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);

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

  const totalWidth = Math.max(project.duration * zoom, 1400);
  const playheadLeft = currentTime * zoom;
  const snapGuideLeft = snapGuideTime !== null ? snapGuideTime * zoom : null;

  const handleTrackDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleTrackDrop = (e: React.DragEvent<HTMLDivElement>, trackId: string) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const asset = JSON.parse(rawData);
      if (!scrollContainerRef.current) return;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
      const dropTime = Math.max(0, x / zoom);
      addClipToTrack(asset, trackId, dropTime);
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

  // Playhead dragging with pointer capture
  const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!scrollContainerRef.current) return;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left + scrollContainerRef.current.scrollLeft;
      const newTime = Math.max(0, x / zoom);
      setCurrentTime(newTime);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Click on empty track area to move playhead and deselect
  const handleTrackLaneClick = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only fire if clicking on the lane itself, not on a clip
    if ((e.target as HTMLElement).closest(`.${styles.clipItem}`)) {
      return;
    }

    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
    setCurrentTime(Math.max(0, x / zoom));
    clearSelection();
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
            onClick={() => setZoom(Math.max(20, zoom - 15))}
            title="Diminuir Zoom"
          >
            <ZoomOut size={16} />
          </button>

          <input
            type="range"
            min="20"
            max="140"
            value={zoom}
            className={styles.zoomSlider}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            title="Zoom da Linha do Tempo"
          />

          <button
            className={styles.toolBtn}
            onClick={() => setZoom(Math.min(140, zoom + 15))}
            title="Aumentar Zoom"
          >
            <ZoomIn size={16} />
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

          {project.tracks.map((track) => (
            <div key={track.id} className={styles.trackHeaderItem}>
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
          ))}
        </div>

        {/* Scrollable Tracks Area */}
        <div
          ref={scrollContainerRef}
          className={styles.tracksScrollable}
          onScroll={handleTracksScroll}
        >
          <div
            className={styles.tracksContentContainer}
            style={{ width: `${totalWidth}px` }}
            onPointerDown={handleTrackLaneClick}
          >
            {/* Top Ruler Bar */}
            <TimelineRuler totalDuration={project.duration} />

            {/* Magnetic Snapping Visual Guide Line */}
            {snapGuideLeft !== null && (
              <div
                className={styles.snapGuideLine}
                style={{ left: `${snapGuideLeft}px` }}
              >
                <div className={styles.snapGuideTag}>SNAP</div>
              </div>
            )}

            {/* Playhead Needle (Across all tracks) */}
            <div
              className={styles.playheadNeedle}
              style={{ left: `${playheadLeft}px` }}
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
              return (
                <div
                  key={track.id}
                  className={styles.trackLane}
                  onDragOver={handleTrackDragOver}
                  onDrop={(e) => handleTrackDrop(e, track.id)}
                >
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
