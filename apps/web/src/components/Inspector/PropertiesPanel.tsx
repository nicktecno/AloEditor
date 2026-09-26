'use client';

import React from 'react';
import { useEditor } from '@/context/EditorContext';
import { InspectorTab, TransitionType } from '@/types/editor';
import { EFFECT_PRESETS } from '@/utils/transitionUtils';
import {
  Sliders,
  Sparkles,
  Volume2,
  Gauge,
  Type,
  Film,
  AlignLeft,
  AlignCenter,
  AlignRight,
  FolderSync,
  Info,
  SplitSquareVertical,
  Zap,
  Scissors,
  VolumeX,
  X,
} from 'lucide-react';
import styles from './Inspector.module.css';

export const PropertiesPanel: React.FC = () => {
  const {
    project,
    selectedClip,
    inspectorTab,
    setInspectorTab,
    updateClip,
    detachAudioFromClip,
    setIsSilenceModalOpen,
    toggleInspector,
    setMobileView,
  } = useEditor();

  if (!selectedClip) {
    return (
      <div className={styles.inspectorContainer}>
        <div className={styles.inspectorTabs}>
          <button className={`${styles.tabBtn} ${styles.tabBtnActive}`}>
            Projeto
          </button>
          <button
            className={styles.closeInspectorBtn}
            onClick={() => { toggleInspector(false); setMobileView('editor'); }}
            title="Fechar Painel"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.inspectorContent}>
          <div className={styles.sectionGroup}>
            <span className={styles.sectionTitle}>Definições do Projeto</span>
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Resolução</span>
              <span className={styles.propValue}>{project.settings.width}x{project.settings.height}</span>
            </div>
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Formato</span>
              <span className={styles.propValue}>{project.settings.aspectRatio}</span>
            </div>
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Taxa de Quadros</span>
              <span className={styles.propValue}>{project.settings.fps} FPS</span>
            </div>
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Duração Total</span>
              <span className={styles.propValue}>{project.duration.toFixed(1)}s</span>
            </div>
          </div>

          <div className={styles.sectionGroup}>
            <span className={styles.sectionTitle}>Sincronização na Nuvem</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#38bdf8' }}>
              <FolderSync size={16} />
              <span>Google Drive: /AloEditor/Projetos</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Todas as modificações são armazenadas em formato JSON no seu Drive pessoal com custo zero de infraestrutura.
            </p>
          </div>

          <div className={styles.emptySelection}>
            <Info size={28} />
            <span style={{ fontSize: '12px' }}>Selecione qualquer clipe na linha do tempo para editar suas propriedades.</span>
          </div>
        </div>
      </div>
    );
  }

  const isVideo = selectedClip.type === 'video';
  const isImage = selectedClip.type === 'image';
  const isText = selectedClip.type === 'text';
  const isAudio = selectedClip.type === 'audio';

  return (
    <div className={styles.inspectorContainer}>
      {/* Top Inspector Tabs */}
      <div className={styles.inspectorTabs}>
        {(isVideo || isImage) && (
          <>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'video' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('video')}
            >
              {isVideo ? 'Vídeo' : 'Imagem'}
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'chroma' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('chroma')}
            >
              Fundo / Chroma
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'filters' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('filters')}
            >
              Cores
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'transitions' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('transitions')}
            >
              Transições
            </button>
            {isVideo && (
              <>
                <button
                  className={`${styles.tabBtn} ${inspectorTab === 'audio' ? styles.tabBtnActive : ''}`}
                  onClick={() => setInspectorTab('audio')}
                >
                  Áudio
                </button>
                <button
                  className={`${styles.tabBtn} ${inspectorTab === 'speed' ? styles.tabBtnActive : ''}`}
                  onClick={() => setInspectorTab('speed')}
                >
                  Velocidade
                </button>
              </>
            )}
          </>
        )}

        {isText && (
          <>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'text' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('text')}
            >
              Texto & Estilo
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'transitions' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('transitions')}
            >
              Transições
            </button>
          </>
        )}

        {isAudio && (
          <>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'audio' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('audio')}
            >
              Áudio & Volume
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'transitions' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('transitions')}
            >
              Fades / Transições
            </button>
            <button
              className={`${styles.tabBtn} ${inspectorTab === 'speed' ? styles.tabBtnActive : ''}`}
              onClick={() => setInspectorTab('speed')}
            >
              Velocidade
            </button>
          </>
        )}
        <button
          className={styles.closeInspectorBtn}
          onClick={() => { toggleInspector(false); setMobileView('editor'); }}
          title="Fechar Painel"
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.inspectorContent}>
        {/* Selected Clip Badge */}
        <div className={styles.clipHeaderInfo}>
          {isVideo && <Film size={14} />}
          {isText && <Type size={14} />}
          {isAudio && <Volume2 size={14} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedClip.name}
          </span>
        </div>

        {/* Video Transform Tab */}
        {isVideo && inspectorTab === 'video' && (
          <>
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>Transformar & Escala</span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Escala (Zoom)</span>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={selectedClip.transform.scale}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      transform: { ...selectedClip.transform, scale: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round(selectedClip.transform.scale * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Posição X</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedClip.transform.position.x}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      transform: {
                        ...selectedClip.transform,
                        position: { ...selectedClip.transform.position, x: parseInt(e.target.value) },
                      },
                    })
                  }
                />
                <span className={styles.propValue}>{selectedClip.transform.position.x}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Posição Y</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedClip.transform.position.y}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      transform: {
                        ...selectedClip.transform,
                        position: { ...selectedClip.transform.position, y: parseInt(e.target.value) },
                      },
                    })
                  }
                />
                <span className={styles.propValue}>{selectedClip.transform.position.y}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Rotação</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selectedClip.transform.rotation}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      transform: { ...selectedClip.transform, rotation: parseInt(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{selectedClip.transform.rotation}°</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Opacidade</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.transform.opacity}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      transform: { ...selectedClip.transform, opacity: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round(selectedClip.transform.opacity * 100)}%</span>
              </div>
            </div>
          </>
        )}

        {/* Chroma Key & Background Removal Tab */}
        {(isVideo || isImage) && inspectorTab === 'chroma' && (() => {
          const bgConfig = selectedClip.backgroundRemoval || {
            enabled: false,
            mode: 'chroma',
            keyColor: '#00ff00',
            similarity: 0.35,
            smoothness: 0.1,
            spillReduction: 0.6,
            aiThreshold: 0.45,
            aiFeather: 3,
            invertMask: false,
            lumaMode: 'black',
          };

          const handleUpdateBg = (updates: Partial<typeof bgConfig>) => {
            updateClip(selectedClip.id, {
              backgroundRemoval: {
                ...bgConfig,
                ...updates,
              },
            });
          };

          return (
            <>
              {/* Enable Switch Card */}
              <div className={styles.sectionGroup}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Scissors size={16} color="var(--accent-cyan)" />
                    <span className={styles.sectionTitle} style={{ margin: 0 }}>Remoção de Fundo</span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={bgConfig.enabled}
                      onChange={(e) => handleUpdateBg({ enabled: e.target.checked })}
                      style={{ accentColor: 'var(--accent-cyan)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: bgConfig.enabled ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                      {bgConfig.enabled ? 'Ativado' : 'Desativado'}
                    </span>
                  </label>
                </div>

                <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', margin: '4px 0 0 0' }}>
                  Torne o fundo transparente em tempo real no player e na renderização final (suporta tela verde, vídeos e imagens normais).
                </p>
              </div>

              {bgConfig.enabled && (
                <>
                  {/* Mode Selector */}
                  <div className={styles.sectionGroup}>
                    <span className={styles.sectionTitle}>Modo de Remoção</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      <button
                        className={`${styles.quickActionBtn} ${bgConfig.mode === 'chroma' ? styles.presetButtonActive : ''}`}
                        onClick={() => handleUpdateBg({ mode: 'chroma' })}
                        title="Tela verde ou azul clássica com remoção de reflexo"
                      >
                        🟢 Chroma Key
                      </button>
                      <button
                        className={`${styles.quickActionBtn} ${bgConfig.mode === 'ai' ? styles.presetButtonActive : ''}`}
                        onClick={() => handleUpdateBg({ mode: 'ai' })}
                        title="Isola pessoas ou objetos em vídeos e fotos comuns sem tela verde"
                      >
                        🤖 Fundo Normal
                      </button>
                      <button
                        className={`${styles.quickActionBtn} ${bgConfig.mode === 'luma' ? styles.presetButtonActive : ''}`}
                        onClick={() => handleUpdateBg({ mode: 'luma' })}
                        title="Remove fundo preto ou branco para overlays e efeitos"
                      >
                        🌗 Luma Key
                      </button>
                    </div>
                  </div>

                  {/* Mode-specific Controls */}
                  {bgConfig.mode === 'chroma' && (
                    <div className={styles.sectionGroup}>
                      <span className={styles.sectionTitle}>Ajustes do Chroma Key</span>

                      {/* Key Color Picker & Presets */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Cor Chave</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#00ff00',
                              border: bgConfig.keyColor === '#00ff00' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleUpdateBg({ keyColor: '#00ff00' })}
                            title="Verde Chroma"
                          />
                          <button
                            type="button"
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#0000ff',
                              border: bgConfig.keyColor === '#0000ff' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleUpdateBg({ keyColor: '#0000ff' })}
                            title="Azul Chroma"
                          />
                          <button
                            type="button"
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              backgroundColor: '#ff00ff',
                              border: bgConfig.keyColor === '#ff00ff' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleUpdateBg({ keyColor: '#ff00ff' })}
                            title="Magenta"
                          />
                          <div
                            className={styles.colorThumb}
                            style={{ backgroundColor: bgConfig.keyColor || '#00ff00' }}
                          >
                            <input
                              type="color"
                              value={bgConfig.keyColor || '#00ff00'}
                              onChange={(e) => handleUpdateBg({ keyColor: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Similarity / Tolerance */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Similaridade (Tolerância)</span>
                        <input
                          type="range"
                          min="0.05"
                          max="0.95"
                          step="0.01"
                          value={bgConfig.similarity ?? 0.35}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ similarity: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.similarity ?? 0.35) * 100)}%</span>
                      </div>

                      {/* Smoothness / Feather */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Suavidade da Borda</span>
                        <input
                          type="range"
                          min="0.01"
                          max="0.4"
                          step="0.01"
                          value={bgConfig.smoothness ?? 0.1}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ smoothness: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.smoothness ?? 0.1) * 100)}%</span>
                      </div>

                      {/* Spill Reduction */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Redução de Vazamento</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={bgConfig.spillReduction ?? 0.6}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ spillReduction: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.spillReduction ?? 0.6) * 100)}%</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Remove o tom verde que reflete nos cabelos e ombros.
                      </span>
                    </div>
                  )}

                  {bgConfig.mode === 'ai' && (
                    <div className={styles.sectionGroup}>
                      <span className={styles.sectionTitle}>Ajustes do Recorte Inteligente (Fundo Normal)</span>

                      {/* Threshold */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Sensibilidade</span>
                        <input
                          type="range"
                          min="0.15"
                          max="0.85"
                          step="0.02"
                          value={bgConfig.aiThreshold ?? 0.45}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ aiThreshold: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.aiThreshold ?? 0.45) * 100)}%</span>
                      </div>

                      {/* Feather */}
                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Suavização (Feather)</span>
                        <input
                          type="range"
                          min="1"
                          max="8"
                          step="1"
                          value={bgConfig.aiFeather ?? 3}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ aiFeather: parseInt(e.target.value) })}
                        />
                        <span className={styles.propValue}>{bgConfig.aiFeather ?? 3}px</span>
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(bgConfig.invertMask)}
                          onChange={(e) => handleUpdateBg({ invertMask: e.target.checked })}
                          style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                        <span>Inverter seleção (manter fundo)</span>
                      </label>
                    </div>
                  )}

                  {bgConfig.mode === 'luma' && (
                    <div className={styles.sectionGroup}>
                      <span className={styles.sectionTitle}>Ajustes do Luma Key</span>

                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Fundo a Remover</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className={`${styles.presetChipBtn} ${bgConfig.lumaMode === 'black' || !bgConfig.lumaMode ? styles.presetChipBtnActive : ''}`}
                            onClick={() => handleUpdateBg({ lumaMode: 'black' })}
                          >
                            Preto (Fogo/Fumaça)
                          </button>
                          <button
                            className={`${styles.presetChipBtn} ${bgConfig.lumaMode === 'white' ? styles.presetChipBtnActive : ''}`}
                            onClick={() => handleUpdateBg({ lumaMode: 'white' })}
                          >
                            Branco (Logos/Desenhos)
                          </button>
                        </div>
                      </div>

                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Limiar de Luminosidade</span>
                        <input
                          type="range"
                          min="0.05"
                          max="0.8"
                          step="0.02"
                          value={bgConfig.similarity ?? 0.18}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ similarity: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.similarity ?? 0.18) * 100)}%</span>
                      </div>

                      <div className={styles.propRow}>
                        <span className={styles.propLabel}>Suavidade</span>
                        <input
                          type="range"
                          min="0.02"
                          max="0.3"
                          step="0.01"
                          value={bgConfig.smoothness ?? 0.1}
                          className={styles.propSlider}
                          onChange={(e) => handleUpdateBg({ smoothness: parseFloat(e.target.value) })}
                        />
                        <span className={styles.propValue}>{Math.round((bgConfig.smoothness ?? 0.1) * 100)}%</span>
                      </div>
                    </div>
                  )}

                  {/* Reset Button */}
                  <div className={styles.sectionGroup}>
                    <button
                      className={styles.presetChipBtn}
                      style={{ textAlign: 'center', width: '100%', padding: '8px' }}
                      onClick={() => handleUpdateBg({
                        enabled: false,
                        mode: 'chroma',
                        keyColor: '#00ff00',
                        similarity: 0.35,
                        smoothness: 0.1,
                        spillReduction: 0.6,
                        aiThreshold: 0.45,
                        aiFeather: 3,
                        invertMask: false,
                        lumaMode: 'black',
                      })}
                    >
                      Restaurar Padrões de Fundo
                    </button>
                  </div>
                </>
              )}
            </>
          );
        })()}

        {/* Filters / Color Grading Tab */}
        {isVideo && inspectorTab === 'filters' && (
          <>
            {/* Quick Effect Presets Grid */}
            <div className={styles.sectionGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={styles.sectionTitle}>Presets de Efeito</span>
                {selectedClip.effect && selectedClip.effect !== 'none' && (
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, {
                        effect: 'none',
                        filters: {
                          brightness: 1,
                          contrast: 1,
                          saturation: 1,
                          blur: 0,
                          sepia: 0,
                          grayscale: 0,
                          invert: 0,
                          hueRotate: 0,
                        },
                      })
                    }
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-rose, #f43f5e)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Resetar
                  </button>
                )}
              </div>
              <div className={styles.presetGrid}>
                {EFFECT_PRESETS.map((eff) => {
                  const isActive = selectedClip.effect === eff.id || (!selectedClip.effect && eff.id === 'none');
                  return (
                    <button
                      key={eff.id}
                      type="button"
                      className={`${styles.presetButton} ${isActive ? styles.presetButtonActive : ''}`}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          effect: eff.id,
                          filters: { ...selectedClip.filters, ...eff.filters },
                        })
                      }
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: eff.color,
                          flexShrink: 0,
                          boxShadow: `0 0 6px ${eff.color}`,
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {eff.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manual Image Adjustments */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>Ajustes Manuais</span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Brilho</span>
                <input
                  type="range"
                  min="0.4"
                  max="1.8"
                  step="0.05"
                  value={selectedClip.filters.brightness}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, brightness: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round(selectedClip.filters.brightness * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Contraste</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={selectedClip.filters.contrast}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, contrast: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round(selectedClip.filters.contrast * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Saturação</span>
                <input
                  type="range"
                  min="0"
                  max="2.5"
                  step="0.05"
                  value={selectedClip.filters.saturation}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, saturation: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round(selectedClip.filters.saturation * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Desfoque</span>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={selectedClip.filters.blur}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, blur: parseInt(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{selectedClip.filters.blur}px</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Matiz (Hue)</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  value={selectedClip.filters.hueRotate || 0}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, hueRotate: parseInt(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{selectedClip.filters.hueRotate || 0}°</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Sépia</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.filters.sepia || 0}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, sepia: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round((selectedClip.filters.sepia || 0) * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Preto & Branco</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.filters.grayscale || 0}
                  className={styles.propSlider}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      filters: { ...selectedClip.filters, grayscale: parseFloat(e.target.value) },
                    })
                  }
                />
                <span className={styles.propValue}>{Math.round((selectedClip.filters.grayscale || 0) * 100)}%</span>
              </div>
            </div>
          </>
        )}

        {/* Transitions Tab */}
        {(isVideo || isText || isAudio) && inspectorTab === 'transitions' && (
          <>
            {/* Transition IN */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>
                {isAudio ? 'Fade In de Áudio (Entrada)' : 'Transição de Entrada (In)'}
              </span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Tipo</span>
                <select
                  className={styles.propSelect}
                  value={selectedClip.transitionIn?.type || 'none'}
                  onChange={(e) => {
                    const newType = e.target.value as TransitionType;
                    if (newType === 'none') {
                      updateClip(selectedClip.id, { transitionIn: undefined });
                    } else {
                      updateClip(selectedClip.id, {
                        transitionIn: {
                          type: newType,
                          duration: selectedClip.transitionIn?.duration || 0.5,
                        },
                      });
                    }
                  }}
                >
                  <option value="none">Nenhuma (Corte Seco)</option>
                  <option value="fade">{isAudio ? 'Fade In Suave' : 'Dissolve Cruzado (Fade)'}</option>
                  {!isAudio && (
                    <>
                      <option value="zoom">Zoom Dinâmico (Scale)</option>
                      <option value="slide-left">Slide para Esquerda</option>
                      <option value="slide-right">Slide para Direita</option>
                      <option value="flash">Flash Branco (White Flash)</option>
                      <option value="glitch">Glitch Digital</option>
                    </>
                  )}
                </select>
              </div>

              {selectedClip.transitionIn && selectedClip.transitionIn.type !== 'none' && (
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Duração</span>
                  <input
                    type="range"
                    min="0.1"
                    max={isAudio ? 5.0 : 2.5}
                    step="0.1"
                    value={selectedClip.transitionIn.duration}
                    className={styles.propSlider}
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        transitionIn: {
                          ...selectedClip.transitionIn!,
                          duration: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                  <span className={styles.propValue}>{selectedClip.transitionIn.duration.toFixed(1)}s</span>
                </div>
              )}
            </div>

            {/* Transition OUT */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>
                {isAudio ? 'Fade Out de Áudio (Saída)' : 'Transição de Saída (Out)'}
              </span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Tipo</span>
                <select
                  className={styles.propSelect}
                  value={selectedClip.transitionOut?.type || 'none'}
                  onChange={(e) => {
                    const newType = e.target.value as TransitionType;
                    if (newType === 'none') {
                      updateClip(selectedClip.id, { transitionOut: undefined });
                    } else {
                      updateClip(selectedClip.id, {
                        transitionOut: {
                          type: newType,
                          duration: selectedClip.transitionOut?.duration || 0.5,
                        },
                      });
                    }
                  }}
                >
                  <option value="none">Nenhuma (Corte Seco)</option>
                  <option value="fade">Dissolve Cruzado (Fade)</option>
                  {!isAudio && (
                    <>
                      <option value="zoom">Zoom Dinâmico (Scale)</option>
                      <option value="slide-left">Slide para Esquerda</option>
                      <option value="slide-right">Slide para Direita</option>
                      <option value="flash">Flash Branco (White Flash)</option>
                      <option value="glitch">Glitch Digital</option>
                    </>
                  )}
                </select>
              </div>

              {selectedClip.transitionOut && selectedClip.transitionOut.type !== 'none' && (
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Duração</span>
                  <input
                    type="range"
                    min="0.1"
                    max={isAudio ? 5.0 : 2.5}
                    step="0.1"
                    value={selectedClip.transitionOut.duration}
                    className={styles.propSlider}
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        transitionOut: {
                          ...selectedClip.transitionOut!,
                          duration: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                  <span className={styles.propValue}>{selectedClip.transitionOut.duration.toFixed(1)}s</span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>Ações Rápidas</span>
              <div className={styles.quickActionsRow}>
                {isAudio ? (
                  <>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'fade', duration: 1.0 },
                          transitionOut: { type: 'fade', duration: 1.0 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Fade In & Out (1.0s)
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'fade', duration: 2.0 },
                          transitionOut: { type: 'fade', duration: 2.0 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Fade Suave (2.0s)
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'fade', duration: 0.5 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Fade In Curto (0.5s)
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: undefined,
                          transitionOut: undefined,
                        })
                      }
                      style={{ color: '#f43f5e' }}
                    >
                      ✕ Remover Fades
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'fade', duration: 0.5 },
                          transitionOut: { type: 'fade', duration: 0.5 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Fade In & Out (0.5s)
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'zoom', duration: 0.6 },
                          transitionOut: { type: 'zoom', duration: 0.6 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Zoom In & Out (0.6s)
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: { type: 'flash', duration: 0.4 },
                        })
                      }
                    >
                      <Zap size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      Flash no Início
                    </button>
                    <button
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transitionIn: undefined,
                          transitionOut: undefined,
                        })
                      }
                      style={{ color: '#f43f5e' }}
                    >
                      ✕ Remover Transições
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Audio Tab */}
        {(isVideo || isAudio) && inspectorTab === 'audio' && (
          <>
            {/* Detach Audio Action for Video Clips */}
            {isVideo && (
              <div
                className={styles.sectionGroup}
                style={{
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Volume2 size={16} color="#34d399" />
                  <span className={styles.sectionTitle} style={{ color: '#34d399', margin: 0 }}>
                    Desvincular Áudio do Vídeo
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0', lineHeight: '1.4' }}>
                  Extrai o áudio deste vídeo em uma trilha independente e silencia o vídeo original. Permite aplicar transições, fades e cortes exclusivamente no áudio.
                </p>
                <button
                  type="button"
                  className={styles.presetButton}
                  style={{
                    background: 'rgba(16, 185, 129, 0.22)',
                    borderColor: '#34d399',
                    color: '#fff',
                    justifyContent: 'center',
                    padding: '8px 12px',
                    fontWeight: 600,
                  }}
                  onClick={() => detachAudioFromClip(selectedClip.id)}
                >
                  <Scissors size={14} style={{ marginRight: '6px' }} /> Desvincular Áudio para Trilha
                </button>
              </div>
            )}

            {/* Auto Cut Silence Action (CapCut Clone) */}
            <div
              className={styles.sectionGroup}
              style={{
                border: '1px solid rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#818cf8" />
                <span className={styles.sectionTitle} style={{ color: '#818cf8', margin: 0 }}>
                  Corte Inteligente de Silêncios (Auto Cut)
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0', lineHeight: '1.4' }}>
                Detecta pausas e silêncios superiores a 1.0s nas falas e remove automaticamente com corte dinâmico estilo CapCut.
              </p>
              <button
                type="button"
                className={styles.presetButton}
                style={{
                  background: 'rgba(99, 102, 241, 0.22)',
                  borderColor: '#818cf8',
                  color: '#fff',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  fontWeight: 600,
                }}
                onClick={() => setIsSilenceModalOpen(true)}
              >
                <Sparkles size={14} style={{ marginRight: '6px' }} /> Detectar e Cortar Silêncios (&gt; 1.0s)
              </button>
            </div>

            {/* Volume Control */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>Controle de Volume</span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={selectedClip.volume}
                  className={styles.propSlider}
                  onChange={(e) => updateClip(selectedClip.id, { volume: parseFloat(e.target.value) })}
                />
                <span className={styles.propValue}>{Math.round(selectedClip.volume * 100)}%</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Silenciar Clipe</span>
                <input
                  type="checkbox"
                  checked={selectedClip.isMuted || false}
                  onChange={(e) => updateClip(selectedClip.id, { isMuted: e.target.checked })}
                />
              </div>
            </div>

            {/* Audio Transitions (Fade In & Fade Out) */}
            <div className={styles.sectionGroup}>
              <span className={styles.sectionTitle}>Transições de Áudio (Fades)</span>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Fade In (Entrada)</span>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.1"
                  value={selectedClip.transitionIn?.duration || 0}
                  className={styles.propSlider}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateClip(selectedClip.id, {
                      transitionIn: val > 0 ? { type: 'fade', duration: val } : undefined,
                    });
                  }}
                />
                <span className={styles.propValue}>{(selectedClip.transitionIn?.duration || 0).toFixed(1)}s</span>
              </div>

              <div className={styles.propRow}>
                <span className={styles.propLabel}>Fade Out (Saída)</span>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.1"
                  value={selectedClip.transitionOut?.duration || 0}
                  className={styles.propSlider}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateClip(selectedClip.id, {
                      transitionOut: val > 0 ? { type: 'fade', duration: val } : undefined,
                    });
                  }}
                />
                <span className={styles.propValue}>{(selectedClip.transitionOut?.duration || 0).toFixed(1)}s</span>
              </div>

              <div className={styles.quickActionsRow}>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      transitionIn: { type: 'fade', duration: 0.5 },
                      transitionOut: { type: 'fade', duration: 0.5 },
                    })
                  }
                >
                  ⚡ Fade 0.5s
                </button>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      transitionIn: { type: 'fade', duration: 1.0 },
                      transitionOut: { type: 'fade', duration: 1.0 },
                    })
                  }
                >
                  ⚡ Fade 1.0s
                </button>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      transitionIn: { type: 'fade', duration: 2.0 },
                      transitionOut: { type: 'fade', duration: 2.0 },
                    })
                  }
                >
                  ⚡ Fade 2.0s
                </button>
                <button
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      transitionIn: undefined,
                      transitionOut: undefined,
                    })
                  }
                  style={{ color: '#f43f5e' }}
                >
                  ✕ Sem Fades
                </button>
              </div>
            </div>
          </>
        )}

        {/* Speed Tab */}
        {(isVideo || isAudio) && inspectorTab === 'speed' && (
          <div className={styles.sectionGroup}>
            <span className={styles.sectionTitle}>Velocidade do Clipe</span>

            <div className={styles.propRow}>
              <span className={styles.propLabel}>Velocidade</span>
              <input
                type="range"
                min="0.25"
                max="4.0"
                step="0.25"
                value={selectedClip.speed}
                className={styles.propSlider}
                onChange={(e) => updateClip(selectedClip.id, { speed: parseFloat(e.target.value) })}
              />
              <span className={styles.propValue}>{selectedClip.speed}x</span>
            </div>

            <div className={styles.btnGroup}>
              {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                <button
                  key={spd}
                  className={`${styles.btnGroupItem} ${selectedClip.speed === spd ? styles.btnGroupItemActive : ''}`}
                  onClick={() => updateClip(selectedClip.id, { speed: spd })}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text Tab */}
        {isText && (
          <div className={styles.sectionGroup}>
            <span className={styles.sectionTitle}>Edição de Texto</span>

            <textarea
              className={styles.textInputArea}
              value={selectedClip.text || ''}
              onChange={(e) => updateClip(selectedClip.id, { text: e.target.value })}
              placeholder="Digite o texto aqui..."
            />

            <div className={styles.propRow}>
              <span className={styles.propLabel}>Tamanho</span>
              <input
                type="range"
                min="16"
                max="96"
                value={selectedClip.textStyle?.fontSize || 36}
                className={styles.propSlider}
                onChange={(e) =>
                  updateClip(selectedClip.id, {
                    textStyle: { ...selectedClip.textStyle, fontSize: parseInt(e.target.value) } as any,
                  })
                }
              />
              <span className={styles.propValue}>{selectedClip.textStyle?.fontSize || 36}px</span>
            </div>

            <div className={styles.propRow}>
              <span className={styles.propLabel}>Cor do Texto</span>
              <div
                className={styles.colorThumb}
                style={{ backgroundColor: selectedClip.textStyle?.color || '#ffffff' }}
              >
                <input
                  type="color"
                  value={selectedClip.textStyle?.color || '#ffffff'}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      textStyle: { ...selectedClip.textStyle, color: e.target.value } as any,
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.propRow}>
              <span className={styles.propLabel}>Borda (Neon)</span>
              <div
                className={styles.colorThumb}
                style={{ backgroundColor: selectedClip.textStyle?.strokeColor || '#06b6d4' }}
              >
                <input
                  type="color"
                  value={selectedClip.textStyle?.strokeColor || '#06b6d4'}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      textStyle: { ...selectedClip.textStyle, strokeColor: e.target.value, strokeWidth: 2 } as any,
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.propRow}>
              <span className={styles.propLabel}>Alinhamento</span>
              <div className={styles.btnGroup}>
                <button
                  className={`${styles.btnGroupItem} ${selectedClip.textStyle?.textAlign === 'left' ? styles.btnGroupItemActive : ''}`}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      textStyle: { ...selectedClip.textStyle, textAlign: 'left' } as any,
                    })
                  }
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  className={`${styles.btnGroupItem} ${selectedClip.textStyle?.textAlign === 'center' ? styles.btnGroupItemActive : ''}`}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      textStyle: { ...selectedClip.textStyle, textAlign: 'center' } as any,
                    })
                  }
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  className={`${styles.btnGroupItem} ${selectedClip.textStyle?.textAlign === 'right' ? styles.btnGroupItemActive : ''}`}
                  onClick={() =>
                    updateClip(selectedClip.id, {
                      textStyle: { ...selectedClip.textStyle, textAlign: 'right' } as any,
                    })
                  }
                >
                  <AlignRight size={14} />
                </button>
              </div>
            </div>

            {/* Background Tarja */}
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Fundo (Tarja de Legenda)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedClip.textStyle?.backgroundColor && selectedClip.textStyle.backgroundColor !== 'transparent')}
                  onChange={(e) =>
                    updateClip(selectedClip.id, {
                      textStyle: {
                        ...selectedClip.textStyle,
                        backgroundColor: e.target.checked ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
                      } as any,
                    })
                  }
                />
                <div
                  className={styles.colorThumb}
                  style={{
                    backgroundColor: selectedClip.textStyle?.backgroundColor && selectedClip.textStyle.backgroundColor !== 'transparent'
                      ? selectedClip.textStyle.backgroundColor
                      : 'rgba(0,0,0,0.75)',
                  }}
                >
                  <input
                    type="color"
                    value="#000000"
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        textStyle: { ...selectedClip.textStyle, backgroundColor: e.target.value } as any,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Position & Alignment Section */}
            <div className={styles.sectionGroup} style={{ marginTop: '16px' }}>
              <span className={styles.sectionTitle}>Posicionamento & Posições Padrão</span>

              {/* 3x3 Visual Alignment Grid */}
              <div className={styles.positionGridContainer}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Grade de Posições Rápidas (3x3)
                </span>
                <div className={styles.alignmentGrid}>
                  {[
                    { label: 'TL', x: 15, y: 15, title: 'Superior Esquerdo' },
                    { label: 'TC', x: 50, y: 15, title: 'Superior Centro (Topo)' },
                    { label: 'TR', x: 85, y: 15, title: 'Superior Direito' },
                    { label: 'ML', x: 15, y: 50, title: 'Meio Esquerdo' },
                    { label: 'MC', x: 50, y: 50, title: 'Centro da Tela' },
                    { label: 'MR', x: 85, y: 50, title: 'Meio Direito' },
                    { label: 'BL', x: 15, y: 82, title: 'Inferior Esquerdo' },
                    { label: 'BC', x: 50, y: 82, title: 'Inferior Centro (Legenda)' },
                    { label: 'BR', x: 85, y: 82, title: 'Inferior Direito' },
                  ].map((cell) => {
                    const isActive =
                      Math.abs(selectedClip.transform.position.x - cell.x) < 3 &&
                      Math.abs(selectedClip.transform.position.y - cell.y) < 3;
                    return (
                      <button
                        key={cell.label}
                        type="button"
                        className={`${styles.gridBtn} ${isActive ? styles.gridBtnActive : ''}`}
                        title={cell.title}
                        onClick={() =>
                          updateClip(selectedClip.id, {
                            transform: {
                              ...selectedClip.transform,
                              position: { x: cell.x, y: cell.y },
                            },
                          })
                        }
                      >
                        <div className={styles.gridDot} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Video Specific Presets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Posições Padrão de Vídeo:
                </span>
                <div className={styles.presetChipsWrap}>
                  {[
                    { label: '💬 Legenda (82%)', x: 50, y: 82, title: 'Terço inferior para legendas' },
                    { label: '🎯 Centro (50%)', x: 50, y: 50, title: 'Centro exato da tela' },
                    { label: '🏷️ Topo (15%)', x: 50, y: 15, title: 'Cabeçalho superior' },
                    { label: '📱 Reels Safe (72%)', x: 50, y: 72, title: 'Zona segura vertical' },
                    { label: '↖️ Canto Sup. Esq.', x: 15, y: 15, title: 'Marca d’água ou tag' },
                    { label: '↗️ Canto Sup. Dir.', x: 85, y: 15, title: 'Marca d’água superior' },
                  ].map((preset) => {
                    const isActive =
                      Math.abs(selectedClip.transform.position.x - preset.x) < 2 &&
                      Math.abs(selectedClip.transform.position.y - preset.y) < 2;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`${styles.presetChipBtn} ${isActive ? styles.presetChipBtnActive : ''}`}
                        title={preset.title}
                        onClick={() =>
                          updateClip(selectedClip.id, {
                            transform: {
                              ...selectedClip.transform,
                              position: { x: preset.x, y: preset.y },
                            },
                          })
                        }
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual Fine-tune Sliders */}
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className={styles.propRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={styles.propLabel}>Posição Horizontal (X)</span>
                    <button
                      type="button"
                      className={styles.centerResetBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transform: {
                            ...selectedClip.transform,
                            position: { ...selectedClip.transform.position, x: 50 },
                          },
                        })
                      }
                      title="Centralizar X em 50%"
                    >
                      50%
                    </button>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    step="0.5"
                    value={selectedClip.transform.position.x}
                    className={styles.propSlider}
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        transform: {
                          ...selectedClip.transform,
                          position: {
                            ...selectedClip.transform.position,
                            x: parseFloat(e.target.value),
                          },
                        },
                      })
                    }
                  />
                  <span className={styles.propValue}>
                    {Math.round(selectedClip.transform.position.x)}%
                  </span>
                </div>

                <div className={styles.propRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={styles.propLabel}>Posição Vertical (Y)</span>
                    <button
                      type="button"
                      className={styles.centerResetBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transform: {
                            ...selectedClip.transform,
                            position: { ...selectedClip.transform.position, y: 50 },
                          },
                        })
                      }
                      title="Centralizar Y em 50%"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      className={styles.centerResetBtn}
                      onClick={() =>
                        updateClip(selectedClip.id, {
                          transform: {
                            ...selectedClip.transform,
                            position: { ...selectedClip.transform.position, y: 82 },
                          },
                        })
                      }
                      title="Definir Y como Legenda (82%)"
                    >
                      82%
                    </button>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    step="0.5"
                    value={selectedClip.transform.position.y}
                    className={styles.propSlider}
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        transform: {
                          ...selectedClip.transform,
                          position: {
                            ...selectedClip.transform.position,
                            y: parseFloat(e.target.value),
                          },
                        },
                      })
                    }
                  />
                  <span className={styles.propValue}>
                    {Math.round(selectedClip.transform.position.y)}%
                  </span>
                </div>
              </div>

              {/* Free drag tip */}
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                💡 <strong>Arraste Livre:</strong> Você pode clicar e arrastar o texto livremente com o mouse ou toque dentro da tela do vídeo! Linhas guias magnéticas ajudam no alinhamento central e na altura de legendas.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
