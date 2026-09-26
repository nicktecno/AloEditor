'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEditor } from '@/context/EditorContext';
import {
  getAudioBufferForAsset,
  detectSilencesInClip,
  SilenceInterval,
  SilenceDetectionResult,
} from '@/utils/silenceDetector';
import {
  Sparkles,
  Scissors,
  X,
  Play,
  Volume2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Film,
  Music,
} from 'lucide-react';
import styles from './SilenceRemoverModal.module.css';

export const SilenceRemoverModal: React.FC = () => {
  const {
    project,
    selectedClipId,
    setSelectedClipId,
    isSilenceModalOpen,
    setIsSilenceModalOpen,
    removeSilencesFromClip,
    setCurrentTime,
  } = useEditor();

  // Find candidate clips (video or audio)
  const availableClips = useMemo(() => {
    return project.clips.filter((c) => c.type === 'video' || c.type === 'audio');
  }, [project.clips]);

  // Selected clip or fallback to first available
  const [activeClipId, setActiveClipId] = useState<string>('');

  useEffect(() => {
    if (selectedClipId && availableClips.some((c) => c.id === selectedClipId)) {
      setActiveClipId(selectedClipId);
    } else if (availableClips.length > 0) {
      setActiveClipId(availableClips[0].id);
    }
  }, [selectedClipId, availableClips, isSilenceModalOpen]);

  const targetClip = useMemo(() => {
    return project.clips.find((c) => c.id === activeClipId);
  }, [project.clips, activeClipId]);

  // Detection settings
  const [minDuration, setMinDuration] = useState<number>(1.0); // Default > 1.0s as requested
  const [thresholdDb, setThresholdDb] = useState<number>(-35); // -50 to -20 dB
  const [padding, setPadding] = useState<number>(0.15); // Breathing room
  const [rippleTrack, setRippleTrack] = useState<boolean>(true);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<SilenceDetectionResult | null>(null);
  const [silences, setSilences] = useState<SilenceInterval[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // AudioBuffer reference for fast re-calculation
  const [cachedBuffer, setCachedBuffer] = useState<AudioBuffer | null>(null);

  // Analyze audio
  const runAnalysis = useCallback(async () => {
    if (!targetClip) return;

    const asset = project.assets.find((a) => a.id === targetClip.assetId);
    if (!asset || !asset.url) {
      setErrorMessage('Mídia de origem não encontrada ou sem áudio decodificável.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      let buffer = cachedBuffer;
      if (!buffer) {
        buffer = await getAudioBufferForAsset(asset.url);
        setCachedBuffer(buffer);
      }

      if (!buffer) {
        setErrorMessage('Não foi possível extrair a faixa de áudio desta mídia.');
        setIsAnalyzing(false);
        return;
      }

      const result = detectSilencesInClip(buffer, targetClip, {
        minDuration,
        thresholdDb,
        padding,
      });

      setAnalysisResult(result);
      setSilences(result.silences);
    } catch (err: any) {
      console.error('Erro na análise de silêncio:', err);
      setErrorMessage(err.message || 'Erro ao processar áudio.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [targetClip, project.assets, cachedBuffer, minDuration, thresholdDb, padding]);

  // Run on mount or when active clip changes
  useEffect(() => {
    if (isSilenceModalOpen && targetClip) {
      setCachedBuffer(null);
      runAnalysis();
    }
  }, [isSilenceModalOpen, targetClip?.id]);

  // Re-run fast recalculation when sliders change
  const handleRecalculate = () => {
    if (cachedBuffer && targetClip) {
      const result = detectSilencesInClip(cachedBuffer, targetClip, {
        minDuration,
        thresholdDb,
        padding,
      });
      setAnalysisResult(result);
      setSilences(result.silences);
    } else {
      runAnalysis();
    }
  };

  // Toggle selection for a silence interval
  const toggleSilenceSelection = (id: string) => {
    setSilences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
    );
  };

  const selectAll = (selected: boolean) => {
    setSilences((prev) => prev.map((s) => ({ ...s, selected })));
  };

  // Selected silences to cut
  const selectedSilences = useMemo(() => {
    return silences.filter((s) => s.selected);
  }, [silences]);

  const totalTimeSaved = useMemo(() => {
    return selectedSilences.reduce((sum, s) => sum + s.duration, 0);
  }, [selectedSilences]);

  // Execute Auto Cut
  const handleApplyAutoCut = () => {
    if (!targetClip || selectedSilences.length === 0) return;
    removeSilencesFromClip(targetClip.id, selectedSilences, 'auto_cut', rippleTrack);
    setIsSilenceModalOpen(false);
  };

  // Execute Split Only
  const handleApplySplitOnly = () => {
    if (!targetClip || selectedSilences.length === 0) return;
    removeSilencesFromClip(targetClip.id, selectedSilences, 'split_only');
    setIsSilenceModalOpen(false);
  };

  // Jump playhead to preview silence
  const handlePreviewSilence = (silence: SilenceInterval) => {
    setCurrentTime(silence.startInTimeline);
  };

  if (!isSilenceModalOpen) return null;

  return (
    <div className={styles.backdrop} onClick={() => setIsSilenceModalOpen(false)}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <Sparkles size={20} />
            </div>
            <div className={styles.headerTitles}>
              <h2 className={styles.title}>Corte Inteligente de Silêncios</h2>
              <span className={styles.subtitle}>
                Auto Cut estilo CapCut • Detecta e remove pausas e silêncios automaticamente
              </span>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setIsSilenceModalOpen(false)}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Target Clip Selector */}
          <div className={styles.targetClipCard}>
            <div className={styles.targetClipInfo}>
              {targetClip?.type === 'audio' ? (
                <Music size={16} color="#10b981" />
              ) : (
                <Film size={16} color="#3b82f6" />
              )}
              <span>Clipe selecionado:</span>
              <select
                value={activeClipId}
                onChange={(e) => {
                  setActiveClipId(e.target.value);
                  setSelectedClipId(e.target.value);
                  setCachedBuffer(null);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                {availableClips.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.duration.toFixed(1)}s)
                  </option>
                ))}
              </select>
            </div>
            {targetClip && (
              <span className={styles.clipBadge}>
                Duração: {targetClip.duration.toFixed(1)}s
              </span>
            )}
          </div>

          {/* Controls Section */}
          <div className={styles.controlsSection}>
            {/* Min Duration Slider */}
            <div className={styles.controlRow}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>
                  Duração Mínima do Silêncio
                </span>
                <span className={styles.controlValue}>{minDuration.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="3.0"
                step="0.1"
                value={minDuration}
                className={styles.slider}
                onChange={(e) => setMinDuration(parseFloat(e.target.value))}
                onMouseUp={handleRecalculate}
                onTouchEnd={handleRecalculate}
              />
              <div className={styles.presetsRow}>
                <button
                  type="button"
                  className={`${styles.presetChip} ${minDuration === 0.5 ? styles.presetChipActive : ''}`}
                  onClick={() => {
                    setMinDuration(0.5);
                    setTimeout(handleRecalculate, 10);
                  }}
                >
                  0.5s (Rápido)
                </button>
                <button
                  type="button"
                  className={`${styles.presetChip} ${minDuration === 0.8 ? styles.presetChipActive : ''}`}
                  onClick={() => {
                    setMinDuration(0.8);
                    setTimeout(handleRecalculate, 10);
                  }}
                >
                  0.8s
                </button>
                <button
                  type="button"
                  className={`${styles.presetChip} ${minDuration === 1.0 ? styles.presetChipActive : ''}`}
                  onClick={() => {
                    setMinDuration(1.0);
                    setTimeout(handleRecalculate, 10);
                  }}
                >
                  ⭐ 1.0s (Padrão CapCut)
                </button>
                <button
                  type="button"
                  className={`${styles.presetChip} ${minDuration === 1.5 ? styles.presetChipActive : ''}`}
                  onClick={() => {
                    setMinDuration(1.5);
                    setTimeout(handleRecalculate, 10);
                  }}
                >
                  1.5s (Pausas Longas)
                </button>
              </div>
            </div>

            {/* Threshold dB Slider */}
            <div className={styles.controlRow}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>
                  Sensibilidade do Volume (Limiar de Ruído)
                </span>
                <span className={styles.controlValue}>{thresholdDb} dB</span>
              </div>
              <input
                type="range"
                min="-50"
                max="-20"
                step="1"
                value={thresholdDb}
                className={styles.slider}
                onChange={(e) => setThresholdDb(parseInt(e.target.value))}
                onMouseUp={handleRecalculate}
                onTouchEnd={handleRecalculate}
              />
            </div>

            {/* Padding Slider */}
            <div className={styles.controlRow}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>
                  Margem de Respiração (Padding)
                </span>
                <span className={styles.controlValue}>{padding.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.30"
                step="0.05"
                value={padding}
                className={styles.slider}
                onChange={(e) => setPadding(parseFloat(e.target.value))}
                onMouseUp={handleRecalculate}
                onTouchEnd={handleRecalculate}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Preserva os milissegundos antes e depois da fala para não engolir o início de palavras.
              </span>
            </div>

            {/* Ripple Checkbox */}
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={rippleTrack}
                onChange={(e) => setRippleTrack(e.target.checked)}
              />
              <span>
                <strong>Aproximar clipes automaticamente (Ripple Delete)</strong> — costura os trechos de fala sem deixar buracos na timeline
              </span>
            </label>
          </div>

          {/* Results State */}
          {isAnalyzing ? (
            <div className={styles.loadingState}>
              <div className={styles.progressBarContainer}>
                <div className={styles.progressBarIndeterminate} />
              </div>
              <span>Analisando espectro de áudio e detectando silêncios...</span>
            </div>
          ) : errorMessage ? (
            <div className={styles.emptyState}>
              <AlertCircle size={32} color="#f43f5e" />
              <span>{errorMessage}</span>
            </div>
          ) : silences.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2 size={32} color="#34d399" />
              <strong>Nenhum silêncio superior a {minDuration}s detectado!</strong>
              <span>
                O áudio deste trecho possui fala contínua ou o limiar de ruído está muito baixo. Tente reduzir a duração mínima ou ajustar a sensibilidade.
              </span>
            </div>
          ) : (
            <>
              {/* Summary Banner */}
              <div className={styles.resultsSummaryCard}>
                <div className={styles.summaryLeft}>
                  <span className={styles.summaryCount}>
                    ✂️ {silences.length} {silences.length === 1 ? 'silêncio detectado' : 'silêncios detectados'}
                  </span>
                  <span className={styles.summarySub}>
                    {selectedSilences.length} selecionados para remoção • Criará {selectedSilences.length + 1} partes de fala
                  </span>
                </div>
                <div className={styles.savedBadge}>
                  ⚡ -{totalTimeSaved.toFixed(1)}s economizados
                </div>
              </div>

              {/* Selection Helpers */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                <span>Trechos de silêncio identificados:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                    onClick={() => selectAll(true)}
                  >
                    Selecionar Todos
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                    onClick={() => selectAll(false)}
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              {/* Silences List */}
              <div className={styles.silenceList}>
                {silences.map((sil, index) => (
                  <div key={sil.id} className={styles.silenceItem}>
                    <div className={styles.silenceItemLeft}>
                      <input
                        type="checkbox"
                        checked={sil.selected}
                        onChange={() => toggleSilenceSelection(sil.id)}
                      />
                      <span style={{ color: '#94a3b8', width: '20px' }}>#{index + 1}</span>
                      <div className={styles.silenceTimes}>
                        <Clock size={12} color="#94a3b8" />
                        <span>
                          {sil.startInTimeline.toFixed(2)}s ➔ {sil.endInTimeline.toFixed(2)}s
                        </span>
                      </div>
                      <span className={styles.silenceDurBadge}>
                        {sil.duration.toFixed(2)}s
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.previewBtn}
                      onClick={() => handlePreviewSilence(sil)}
                      title="Posicionar indicador neste silêncio para ouvir"
                    >
                      <Play size={11} /> Ir até pausa
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={() => setIsSilenceModalOpen(false)}
          >
            Cancelar
          </button>

          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.btnSplitOnly}
              disabled={selectedSilences.length === 0 || isAnalyzing}
              onClick={handleApplySplitOnly}
              title="Divide o clipe nos pontos de silêncio sem deletar nada"
            >
              <Scissors size={14} />
              Apenas Dividir ({selectedSilences.length})
            </button>

            <button
              type="button"
              className={styles.btnAutoCut}
              disabled={selectedSilences.length === 0 || isAnalyzing}
              onClick={handleApplyAutoCut}
              title="Corta e aproxima os trechos falados automaticamente"
            >
              <Sparkles size={15} />
              Remover Silêncios ({selectedSilences.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
