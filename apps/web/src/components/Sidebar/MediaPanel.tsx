'use client';

import React, { useState, useRef } from 'react';
import { useEditor, getDriveStreamUrl } from '@/context/EditorContext';
import { SidebarTab, MediaAsset } from '@/types/editor';
import { GoogleDriveFile } from '@/services/googleDrive';
import {
  Film,
  Music,
  Type,
  Sparkles,
  SplitSquareVertical,
  Cloud,
  Upload,
  Plus,
  Play,
  Volume2,
  Sliders,
  FolderOpen,
  Check,
  Trash2,
  Zap,
  Scissors,
  X,
  FolderSearch,
  Database,
} from 'lucide-react';
import { getCacheStats, clearAllDriveCache } from '@/services/driveVideoCache';
import { EFFECT_PRESETS, TRANSITION_PRESETS } from '@/utils/transitionUtils';
import { TimelineClip, TransitionType } from '@/types/editor';
import { BackgroundRemoverPanel } from './BackgroundRemoverPanel';
import { Wand2 } from 'lucide-react';
import { GENERIC_VIDEO_THUMBNAIL, captureVideoThumbnail, handleThumbnailError, getMediaDuration } from '@/utils/thumbnailGenerator';
import { MediaAssetCard } from './MediaAssetCard';
import styles from './Sidebar.module.css';

export const MediaPanel: React.FC = () => {
  const {
    project,
    currentTime,
    selectedClip,
    selectedClipId,
    selectClip,
    updateClip,
    sidebarTab,
    setSidebarTab,
    addClipToTrack,
    addTextClip,
    addAsset,
    importDriveAssetToMemory,
    removeAsset,
    updateAssetThumbnail,
    syncMediaDuration,
    setIsDrivePickerOpen,
    setIsProjectsModalOpen,
    setIsRelinkModalOpen,
    offlineAssetsCount,
    openGooglePicker,
    googleAccessToken,
    driveVideos,
    isDriveLoading,
    loadDriveVideos,
    toggleSidebar,
    setMobileView,
  } = useEditor();

  const [activeFilter, setActiveFilter] = useState<'all' | 'drive' | 'video' | 'audio'>('all');
  const [transitionTarget, setTransitionTarget] = useState<'in' | 'out' | 'both'>('in');
  const [transitionDuration, setTransitionDuration] = useState<number>(0.5);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isUrlInputOpen, setIsUrlInputOpen] = useState<boolean>(false);
  const [driveUrlInput, setDriveUrlInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportDriveUrl = async () => {
    const input = driveUrlInput.trim();
    if (!input) return;

    const match = input.match(/[-\w]{25,}/);
    if (!match) {
      showFeedback('Link inválido. Insira um link válido do Google Drive.');
      return;
    }

    const fileId = match[0];
    setDriveUrlInput('');
    setIsUrlInputOpen(false);
    showFeedback('Baixando vídeo do Google Drive para a memória...');

    const virtualFile: GoogleDriveFile = {
      id: fileId,
      name: `Drive_Video_${fileId.substring(0, 6)}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: 0,
      durationSeconds: 15.0,
    };

    const asset = await importDriveAssetToMemory(virtualFile, { addToTimeline: true });
    if (asset) {
      showFeedback('Vídeo importado para a memória e pronto para edição!');
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleDeleteAsset = (asset: MediaAsset) => {
    const isUsedInTimeline = project.clips.some((c) => c.assetId === asset.id);
    if (isUsedInTimeline) {
      const confirmRemove = confirm(
        `A mídia "${asset.name}" está em uso na linha do tempo.\n\nDeseja apagá-la da biblioteca e remover também seus clipes da timeline?`
      );
      if (!confirmRemove) return;
      removeAsset(asset.id, true);
      showFeedback(`Mídia "${asset.name}" e clipes correspondentes foram removidos.`);
    } else {
      const confirmRemove = confirm(`Deseja apagar a mídia "${asset.name}" da biblioteca?`);
      if (!confirmRemove) return;
      removeAsset(asset.id, false);
      showFeedback(`Mídia "${asset.name}" removida da biblioteca.`);
    }
  };

  const handleClearUnusedAssets = () => {
    const unusedAssets = project.assets.filter(
      (a) => !project.clips.some((c) => c.assetId === a.id)
    );
    if (unusedAssets.length === 0) {
      showFeedback('Todas as mídias importadas estão em uso na linha do tempo.');
      return;
    }
    const confirmClear = confirm(
      `Deseja apagar ${unusedAssets.length} mídia(s) não utilizada(s) na linha do tempo?`
    );
    if (!confirmClear) return;
    unusedAssets.forEach((a) => removeAsset(a.id, false));
    showFeedback(`${unusedAssets.length} mídia(s) não utilizada(s) removida(s).`);
  };

  const handleClearCache = async () => {
    const stats = await getCacheStats();
    if (stats.fileCount === 0) {
      showFeedback('O cache local do navegador já está vazio (0 B).');
      return;
    }
    const confirmClear = confirm(
      `Deseja liberar o cache local do navegador?\n\nEspaço ocupado: ${stats.formattedSize} (${stats.fileCount} arquivo(s)).\nIsso liberará o armazenamento do seu dispositivo.`
    );
    if (!confirmClear) return;
    await clearAllDriveCache();
    showFeedback(`Cache local (${stats.formattedSize}) liberado com sucesso!`);
  };

  // Find target clip: selected clip first, or clip currently under playhead, or first video/text clip
  const targetClip: TimelineClip | null = selectedClip || project.clips.find(
    (c) => currentTime >= c.startInTimeline && currentTime < c.startInTimeline + c.duration
  ) || project.clips[0] || null;

  const handleApplyEffect = (preset: typeof EFFECT_PRESETS[0]) => {
    if (!targetClip) {
      showFeedback('Adicione um clipe na timeline primeiro!');
      return;
    }
    selectClip(targetClip.id, false);
    updateClip(targetClip.id, {
      effect: preset.id,
      filters: { ...targetClip.filters, ...preset.filters },
    });
    showFeedback(`Efeito "${preset.name}" aplicado!`);
  };

  const handleResetEffects = () => {
    if (!targetClip) return;
    updateClip(targetClip.id, {
      effect: 'none',
      filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, grayscale: 0, invert: 0, hueRotate: 0 },
    });
    showFeedback(`Efeitos resetados em "${targetClip.name}"`);
  };

  const handleApplyTransition = (preset: typeof TRANSITION_PRESETS[0]) => {
    if (!targetClip) {
      showFeedback('Adicione um clipe na timeline primeiro!');
      return;
    }
    selectClip(targetClip.id, false);
    const effectiveType = targetClip.type === 'audio' ? 'fade' : preset.type;
    const updates: Partial<TimelineClip> = {};
    if (transitionTarget === 'in' || transitionTarget === 'both') {
      updates.transitionIn = { type: effectiveType, duration: transitionDuration };
    }
    if (transitionTarget === 'out' || transitionTarget === 'both') {
      updates.transitionOut = { type: effectiveType, duration: transitionDuration };
    }
    updateClip(targetClip.id, updates);
    const posLabel = transitionTarget === 'in' ? 'Entrada' : transitionTarget === 'out' ? 'Saída' : 'Entrada + Saída';
    if (targetClip.type === 'audio') {
      showFeedback(`Fade de Áudio (${posLabel} ${transitionDuration}s) aplicado!`);
    } else {
      showFeedback(`Transição "${preset.name}" (${posLabel}) aplicada!`);
    }
  };

  const handleApplyCutTransition = (preset: typeof TRANSITION_PRESETS[0]) => {
    const priorClip = project.clips.find(
      (c) => Math.abs((c.startInTimeline + c.duration) - currentTime) < 1.2
    );
    const nextClip = project.clips.find(
      (c) => Math.abs(c.startInTimeline - currentTime) < 1.2
    );
    if (priorClip || nextClip) {
      if (priorClip) {
        updateClip(priorClip.id, { transitionOut: { type: preset.type, duration: transitionDuration } });
      }
      if (nextClip) {
        updateClip(nextClip.id, { transitionIn: { type: preset.type, duration: transitionDuration } });
      }
      showFeedback(`Transição "${preset.name}" aplicada no corte!`);
    } else if (targetClip) {
      handleApplyTransition(preset);
    } else {
      showFeedback('Posicione o playhead em um corte entre clipes!');
    }
  };

  const handleClearTransitions = () => {
    if (!targetClip) return;
    updateClip(targetClip.id, {
      transitionIn: undefined,
      transitionOut: undefined,
    });
    showFeedback(`Transições removidas de "${targetClip.name}"`);
  };

  const filteredAssets = project.assets.filter((asset) => {
    if (activeFilter === 'drive') return asset.isDrive;
    if (activeFilter === 'video') return asset.type === 'video';
    if (activeFilter === 'audio') return asset.type === 'audio';
    return true;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');
      const isAudio = file.type.startsWith('audio');
      const assetId = `asset_upload_${Date.now()}_${i}`;

      let detectedDuration = 10.0;
      if (isVideo || isAudio) {
        try {
          detectedDuration = await getMediaDuration(file, isAudio);
        } catch (err) {
          console.warn('Could not determine media duration:', err);
        }
      }

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
      addClipToTrack(newAsset);

      // Asynchronously capture real frame thumbnail from video file
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
    }
  };

  const handleSelectDriveFile = async (file: GoogleDriveFile) => {
    showFeedback(`Baixando "${file.name}" para a memória...`);
    const asset = await importDriveAssetToMemory(file, { addToTimeline: true });
    if (asset) {
      showFeedback(`"${file.name}" importado com sucesso!`);
    }
  };

  const driveCount = driveVideos.length > 0 ? driveVideos.length : project.assets.filter((a) => a.isDrive).length;

  return (
    <div className={styles.sidebarContainer}>
      {/* Left Icon Rail */}
      <div className={styles.iconRail}>
        <button
          className={`${styles.railBtn} ${sidebarTab === 'media' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('media')}
          title="Biblioteca de Mídia"
        >
          <Film size={18} />
          <span>Mídia</span>
        </button>

        <button
          className={`${styles.railBtn} ${sidebarTab === 'audio' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('audio')}
          title="Trilhas & Efeitos Sonoros"
        >
          <Music size={18} />
          <span>Áudio</span>
        </button>

        <button
          className={`${styles.railBtn} ${sidebarTab === 'text' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('text')}
          title="Textos & Legendas"
        >
          <Type size={18} />
          <span>Texto</span>
        </button>

        <button
          className={`${styles.railBtn} ${sidebarTab === 'effects' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('effects')}
          title="Efeitos Visuais"
        >
          <Sparkles size={18} />
          <span>Efeitos</span>
        </button>

        <button
          className={`${styles.railBtn} ${sidebarTab === 'transitions' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('transitions')}
          title="Transições"
        >
          <SplitSquareVertical size={18} />
          <span>Transição</span>
        </button>

        <button
          className={`${styles.railBtn} ${sidebarTab === 'bg-remover' ? styles.railBtnActive : ''}`}
          onClick={() => setSidebarTab('bg-remover')}
          title="Remover Fundo (iLoveIMG & Chroma)"
        >
          <Wand2 size={18} />
          <span>Fundo</span>
        </button>
      </div>

      {/* Content Area */}
      <div className={styles.contentArea}>
        <div className={styles.contentTopBar}>
          <span className={styles.contentCategoryLabel}>
            {sidebarTab === 'media' && 'Biblioteca de Mídia'}
            {sidebarTab === 'audio' && 'Trilhas & Efeitos Sonoros'}
            {sidebarTab === 'text' && 'Textos & Legendas'}
            {sidebarTab === 'effects' && 'Efeitos Visuais'}
            {sidebarTab === 'transitions' && 'Transições'}
            {sidebarTab === 'bg-remover' && 'Remover Fundo'}
          </span>
          <button
            type="button"
            className={styles.closeContentBtn}
            onClick={() => {
              toggleSidebar(false);
              setMobileView('editor');
            }}
            title="Fechar / Ocultar Painel"
          >
            <X size={15} />
          </button>
        </div>

        {sidebarTab === 'media' && (
          <>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Biblioteca de Mídia</h3>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={styles.relinkFolderBtn}
                  onClick={() => setIsProjectsModalOpen(true)}
                  title="Abrir ou gerenciar projetos salvos"
                  style={{ borderColor: 'rgba(129, 140, 248, 0.4)', color: '#c7d2fe' }}
                >
                  <FolderOpen size={13} color="#818cf8" />
                  <span>Projetos</span>
                </button>
                <button
                  type="button"
                  className={`${styles.relinkFolderBtn} ${
                    offlineAssetsCount > 0 ? styles.relinkFolderBtnAlert : ''
                  }`}
                  onClick={() => setIsRelinkModalOpen(true)}
                  title="Escanear pasta do computador para reconectar vídeos e áudios do projeto"
                >
                  <FolderSearch size={13} />
                  <span>
                    {offlineAssetsCount > 0
                      ? `Reconectar (${offlineAssetsCount})`
                      : 'Reconectar'}
                  </span>
                </button>
              </div>
            </div>

            {/* Google Drive Stream Direct Card */}
            <div className={styles.driveBanner}>
              <div className={styles.driveBannerHeader}>
                <Cloud size={16} />
                <span>Google Drive Cloud Stream</span>
              </div>
              <p className={styles.driveBannerText}>
                Importe e assista aos seus vídeos em tempo real direto da nuvem via Range Requests, sem baixar para o HD.
              </p>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button
                  className={styles.pickerTriggerBtn}
                  style={{ flex: 1 }}
                  onClick={() => setIsDrivePickerOpen(true)}
                >
                  <FolderOpen size={14} />
                  <span>Navegar no Drive</span>
                </button>
                <button
                  className={styles.pickerTriggerBtn}
                  style={{ flex: 1, borderColor: isUrlInputOpen ? 'var(--accent-cyan)' : undefined }}
                  onClick={() => setIsUrlInputOpen((prev) => !prev)}
                >
                  <span>🔗 Colar Link</span>
                </button>
              </div>

              {isUrlInputOpen && (
                <div className={styles.driveUrlInputRow}>
                  <input
                    type="text"
                    className={styles.driveUrlInput}
                    placeholder="Cole o link do Google Drive aqui..."
                    value={driveUrlInput}
                    onChange={(e) => setDriveUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleImportDriveUrl();
                    }}
                  />
                  <button
                    className={styles.driveUrlConfirmBtn}
                    onClick={handleImportDriveUrl}
                  >
                    Importar
                  </button>
                </div>
              )}
            </div>

            {/* Upload Zone */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept="video/*,audio/*,image/*"
              onChange={handleFileUpload}
            />
            <div
              className={styles.uploadDropzone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const mockEvent = {
                    target: { files: e.dataTransfer.files },
                  } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileUpload(mockEvent);
                }
              }}
            >
              <Upload size={18} color="var(--accent-cyan)" />
              <span className={styles.dropzoneText}>Clique ou arraste mídia aqui</span>
              <span className={styles.dropzoneSub}>MP4, MOV, WebM, MP3, WAV</span>
            </div>

            {/* Filter Pills & Actions */}
            <div className={styles.filterPillsRow}>
              <div className={styles.filterPills}>
                <button
                  className={`${styles.filterPill} ${activeFilter === 'all' ? styles.filterPillActive : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  Todos ({project.assets.length})
                </button>
                <button
                  className={`${styles.filterPill} ${activeFilter === 'drive' ? styles.filterPillActive : ''}`}
                  onClick={() => setActiveFilter('drive')}
                >
                  Google Drive ({driveCount})
                </button>
                <button
                  className={`${styles.filterPill} ${activeFilter === 'video' ? styles.filterPillActive : ''}`}
                  onClick={() => setActiveFilter('video')}
                >
                  Vídeos
                </button>
                <button
                  className={`${styles.filterPill} ${activeFilter === 'audio' ? styles.filterPillActive : ''}`}
                  onClick={() => setActiveFilter('audio')}
                >
                  Áudios
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={styles.clearAssetsBtn}
                  onClick={handleClearCache}
                  title="Liberar cache local de vídeos do Google Drive no navegador"
                >
                  <Database size={11} />
                  <span>Limpar Cache</span>
                </button>

                {project.assets.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearAssetsBtn}
                    onClick={handleClearUnusedAssets}
                    title="Apagar mídias que não estão em uso na linha do tempo"
                  >
                    <Trash2 size={11} />
                    <span>Limpar não usadas</span>
                  </button>
                )}
              </div>
            </div>

            {/* Asset Cards Grid */}
            <div className={styles.assetGrid}>
              {filteredAssets.map((asset) => (
                <MediaAssetCard
                  key={asset.id}
                  asset={asset}
                  onAdd={addClipToTrack}
                  onDelete={handleDeleteAsset}
                />
              ))}

              {/* Show cached Drive files directly if Drive filter is active */}
              {activeFilter === 'drive' &&
                driveVideos
                  .filter((dv) => !filteredAssets.some((fa) => fa.driveFileId === dv.id))
                  .map((dv) => {
                    const virtualAsset: MediaAsset = {
                      id: `asset_drive_${dv.id}`,
                      name: dv.name,
                      type: dv.mimeType.startsWith('audio') ? 'audio' : 'video',
                      url: getDriveStreamUrl(dv.id, googleAccessToken),
                      driveFileId: dv.id,
                      duration: dv.durationSeconds || 15.0,
                      isDrive: true,
                      thumbnailUrl: dv.thumbnailUrl || (dv.mimeType.startsWith('audio') ? undefined : GENERIC_VIDEO_THUMBNAIL),
                      size: dv.sizeBytes,
                    };
                    return (
                      <MediaAssetCard
                        key={dv.id}
                        asset={virtualAsset}
                        onAdd={() => handleSelectDriveFile(dv)}
                        title="Arquivo do Google Drive: Passe o mouse para pré-visualizar • Clique ou arraste para a linha do tempo"
                      />
                    );
                  })}
            </div>
          </>
        )}

        {sidebarTab === 'text' && (
          <>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Texto & Títulos</h3>
            </div>

            <button
              className={styles.pickerTriggerBtn}
              onClick={addTextClip}
              style={{ background: 'var(--accent-gradient)' }}
            >
              <Plus size={14} />
              <span>Inserir Novo Texto na Timeline</span>
            </button>

            <div className={styles.templateCard}>
              <div
                className={styles.templatePreview}
                style={{ color: '#06b6d4', textShadow: '0 0 10px rgba(6, 182, 212, 0.8)', fontSize: '16px' }}
              >
                CYBERPUNK NEON
              </div>
              <button className={styles.templateActionBtn} onClick={addTextClip}>
                <Plus size={12} /> Usar Modelo
              </button>
            </div>

            <div className={styles.templateCard}>
              <div
                className={styles.templatePreview}
                style={{ color: '#ffffff', background: 'rgba(239, 68, 68, 0.8)', fontSize: '14px', borderRadius: '4px' }}
              >
                LEGENDA DINÂMICA
              </div>
              <button className={styles.templateActionBtn} onClick={addTextClip}>
                <Plus size={12} /> Usar Modelo
              </button>
            </div>

            <div className={styles.templateCard}>
              <div
                className={styles.templatePreview}
                style={{ color: '#f59e0b', fontStyle: 'italic', fontSize: '15px' }}
              >
                Título Minimalista
              </div>
              <button className={styles.templateActionBtn} onClick={addTextClip}>
                <Plus size={12} /> Usar Modelo
              </button>
            </div>
          </>
        )}

        {sidebarTab === 'audio' && (
          <>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Trilhas & Efeitos</h3>
            </div>

            <div className={styles.templateCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Music size={16} color="var(--accent-emerald)" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Upbeat Lo-Fi Chill</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>02:30 • Royalty Free</span>
              <button
                className={styles.templateActionBtn}
                onClick={() => addClipToTrack({
                  id: `audio_track_${Date.now()}`,
                  name: 'Upbeat Lo-Fi Chill.mp3',
                  type: 'audio',
                  url: 'https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3',
                  duration: 20.0,
                }, 'track_audio_bg')}
              >
                <Plus size={12} /> Adicionar à Trilha
              </button>
            </div>

            <div className={styles.templateCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Music size={16} color="var(--accent-cyan)" />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Cinematic Ambient Bass</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>01:45 • Royalty Free</span>
              <button
                className={styles.templateActionBtn}
                onClick={() => addClipToTrack({
                  id: `audio_track_2_${Date.now()}`,
                  name: 'Cinematic Ambient Bass.mp3',
                  type: 'audio',
                  url: 'https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3',
                  duration: 15.0,
                }, 'track_audio_bg')}
              >
                <Plus size={12} /> Adicionar à Trilha
              </button>
            </div>
          </>
        )}

        {sidebarTab === 'effects' && (
          <>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Filtros & Efeitos</h3>
            </div>

            {feedbackMsg && (
              <div className={styles.feedbackBanner}>
                <Check size={14} />
                <span>{feedbackMsg}</span>
              </div>
            )}

            {/* Target Clip Indicator Banner */}
            <div className={styles.targetClipBanner}>
              <div className={styles.targetClipHeader}>
                <span>Clipe Alvo</span>
                {targetClip?.effect && targetClip.effect !== 'none' && (
                  <button
                    onClick={handleResetEffects}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-rose, #f43f5e)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Restaurar cores originais"
                  >
                    <Trash2 size={12} /> Resetar
                  </button>
                )}
              </div>
              <span className={styles.targetClipName}>
                {targetClip ? targetClip.name : 'Nenhum clipe na timeline'}
              </span>
              {targetClip && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Efeito atual: {targetClip.effect || 'Nenhum (Original)'}
                </span>
              )}
            </div>

            {/* Preset Cards List */}
            {EFFECT_PRESETS.map((eff) => {
              const isActive = targetClip?.effect === eff.id || (!targetClip?.effect && eff.id === 'none');
              return (
                <div
                  key={eff.id}
                  className={`${styles.templateCard} ${isActive ? styles.templateCardActive : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        className={styles.effectColorSwatch}
                        style={{ backgroundColor: eff.color, color: eff.color }}
                      />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{eff.name}</span>
                    </div>
                    <span className={styles.badgePreset}>{eff.badge}</span>
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    {eff.description}
                  </p>

                  <button
                    className={styles.templateActionBtn}
                    onClick={() => handleApplyEffect(eff)}
                    style={{
                      background: isActive ? 'var(--accent-primary)' : undefined,
                      borderColor: isActive ? 'var(--accent-primary)' : undefined,
                      color: isActive ? '#fff' : undefined,
                    }}
                  >
                    {isActive ? (
                      <>
                        <Check size={13} /> Efeito Ativo
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} /> Aplicar ao Clipe
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </>
        )}

        {sidebarTab === 'transitions' && (
          <>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Transições</h3>
            </div>

            {feedbackMsg && (
              <div className={styles.feedbackBanner}>
                <Check size={14} />
                <span>{feedbackMsg}</span>
              </div>
            )}

            {/* Target Clip Banner */}
            <div className={styles.targetClipBanner}>
              <div className={styles.targetClipHeader}>
                <span>Clipe Alvo</span>
                {(targetClip?.transitionIn || targetClip?.transitionOut) && (
                  <button
                    onClick={handleClearTransitions}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-rose, #f43f5e)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Remover transições deste clipe"
                  >
                    <Trash2 size={12} /> Limpar
                  </button>
                )}
              </div>
              <span className={styles.targetClipName}>
                {targetClip ? targetClip.name : 'Nenhum clipe na timeline'}
              </span>
              {targetClip && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  In: {targetClip.transitionIn?.type || 'Nenhuma'} ({targetClip.transitionIn ? `${targetClip.transitionIn.duration}s` : '-'}) • Out: {targetClip.transitionOut?.type || 'Nenhuma'} ({targetClip.transitionOut ? `${targetClip.transitionOut.duration}s` : '-'})
                </span>
              )}
            </div>

            {/* Transition Config: Direction & Duration */}
            <div className={styles.configSection}>
              <span className={styles.configLabel}>Aplicar Onde</span>
              <div className={styles.segmentBtnGroup}>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${transitionTarget === 'in' ? styles.segmentBtnActive : ''}`}
                  onClick={() => setTransitionTarget('in')}
                >
                  Entrada (In)
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${transitionTarget === 'out' ? styles.segmentBtnActive : ''}`}
                  onClick={() => setTransitionTarget('out')}
                >
                  Saída (Out)
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${transitionTarget === 'both' ? styles.segmentBtnActive : ''}`}
                  onClick={() => setTransitionTarget('both')}
                >
                  Ambos (In+Out)
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span className={styles.configLabel}>Duração</span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-geist-mono)', color: 'var(--accent-cyan)' }}>
                  {transitionDuration.toFixed(1)}s
                </span>
              </div>
              <div className={styles.durationPresetsRow}>
                {[0.3, 0.5, 0.8, 1.2].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    className={`${styles.durationPresetBtn} ${transitionDuration === dur ? styles.durationPresetBtnActive : ''}`}
                    onClick={() => setTransitionDuration(dur)}
                  >
                    {dur}s
                  </button>
                ))}
              </div>
            </div>

            {/* Transition Presets */}
            {TRANSITION_PRESETS.map((tr) => (
              <div key={tr.type} className={styles.templateCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SplitSquareVertical size={16} color="var(--accent-amber)" />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{tr.name}</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                  {tr.description}
                </p>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className={styles.templateActionBtn}
                    style={{ flex: 1 }}
                    onClick={() => handleApplyTransition(tr)}
                  >
                    <Zap size={12} /> Aplicar ao Clipe
                  </button>
                  <button
                    className={styles.templateActionBtn}
                    style={{ flex: 1, background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}
                    onClick={() => handleApplyCutTransition(tr)}
                    title="Aplica no corte entre clipes na posição do playhead"
                  >
                    <Scissors size={12} /> No Corte
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {sidebarTab === 'bg-remover' && (
          <BackgroundRemoverPanel />
        )}
      </div>
    </div>
  );
};
