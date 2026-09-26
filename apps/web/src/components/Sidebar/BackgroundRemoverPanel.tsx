'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '@/context/EditorContext';
import { BackgroundRemovalConfig, BackgroundRemovalMode, MediaAsset } from '@/types/editor';
import { removeImageBackgroundAsync } from '@/utils/backgroundRemoval';
import {
  Scissors,
  Wand2,
  Upload,
  Download,
  Plus,
  RefreshCw,
  Palette,
  CheckCircle2,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import styles from './BackgroundRemoverPanel.module.css';

export const BackgroundRemoverPanel: React.FC = () => {
  const { project, addAsset, addClipToTrack } = useEditor();

  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState<string>('imagem_sem_fundo');
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewBg, setPreviewBg] = useState<'checker' | 'white' | 'black' | 'purple' | 'green'>('checker');

  // Parameters
  const [mode, setMode] = useState<BackgroundRemovalMode>('ai');
  const [keyColor, setKeyColor] = useState<string>('#00ff00');
  const [similarity, setSimilarity] = useState<number>(0.35);
  const [smoothness, setSmoothness] = useState<number>(0.1);
  const [aiThreshold, setAiThreshold] = useState<number>(0.45);
  const [aiFeather, setAiFeather] = useState<number>(3);
  const [invertMask, setInvertMask] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-process whenever image or main parameters change
  const handleProcessImage = async (src: string) => {
    setIsProcessing(true);
    try {
      const config: BackgroundRemovalConfig = {
        enabled: true,
        mode,
        keyColor,
        similarity,
        smoothness,
        aiThreshold,
        aiFeather,
        invertMask,
        spillReduction: 0.7,
      };

      const result = await removeImageBackgroundAsync(src, config);
      setProcessedUrl(result.dataUrl);
      setProcessedBlob(result.blob);
    } catch (err: any) {
      console.error('Erro ao remover fundo:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOriginalName(file.name.replace(/\.[^/.]+$/, ''));
    const url = URL.createObjectURL(file);
    setSelectedImageSrc(url);
    handleProcessImage(url);
  };

  const handleSelectAsset = (asset: MediaAsset) => {
    setOriginalName(asset.name.replace(/\.[^/.]+$/, ''));
    setSelectedImageSrc(asset.url);
    handleProcessImage(asset.url);
  };

  // Re-run when parameters change
  useEffect(() => {
    if (selectedImageSrc) {
      const timer = setTimeout(() => {
        handleProcessImage(selectedImageSrc);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [mode, keyColor, similarity, smoothness, aiThreshold, aiFeather, invertMask]);

  // Action 1: Download transparent PNG (iLoveIMG style)
  const handleDownload = () => {
    if (!processedUrl && !processedBlob) return;
    const a = document.createElement('a');
    a.href = processedUrl || (processedBlob ? URL.createObjectURL(processedBlob) : '');
    a.download = `${originalName}_sem_fundo.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Action 2: Add to project timeline
  const handleAddToTimeline = () => {
    if (!processedUrl) return;

    const assetId = `asset_cutout_${Date.now()}`;
    const newAsset: MediaAsset = {
      id: assetId,
      name: `${originalName} (Sem Fundo)`,
      type: 'image',
      url: processedUrl,
      duration: 5.0,
    };

    addAsset(newAsset);

    // Encontra ou usa a trilha de overlay
    const overlayTrack = project.tracks.find((t) => t.name.toLowerCase().includes('overlay') || t.order === 1) || project.tracks[0];
    if (overlayTrack) {
      addClipToTrack(newAsset, overlayTrack.id);
    }
  };

  // Action 3: Save to Media Assets
  const handleSaveToMedia = () => {
    if (!processedUrl) return;

    const newAsset: MediaAsset = {
      id: `asset_cutout_${Date.now()}`,
      name: `${originalName} (Sem Fundo)`,
      type: 'image',
      url: processedUrl,
      duration: 5.0,
    };

    addAsset(newAsset);
    alert('Imagem com fundo transparente adicionada à Biblioteca de Mídia!');
  };

  const getPreviewBgStyle = () => {
    switch (previewBg) {
      case 'white':
        return { backgroundColor: '#ffffff' };
      case 'black':
        return { backgroundColor: '#000000' };
      case 'purple':
        return { backgroundColor: '#8257e5' };
      case 'green':
        return { backgroundColor: '#04d361' };
      default:
        return {};
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.title}>
            <Wand2 size={18} color="var(--alo-purple-lighter, #9871f5)" />
            <span>Remover Fundo</span>
          </div>
          <span className={styles.badgeILove}>Estilo iLoveIMG</span>
        </div>
        <p className={styles.subtitle}>
          Isole pessoas, produtos ou remova tela verde instantaneamente com transparência 100% no navegador.
        </p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {!selectedImageSrc ? (
        <>
          {/* Dropzone */}
          <div className={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
            <div className={styles.dropzoneIcon}>
              <Upload size={22} />
            </div>
            <span className={styles.dropzoneTitle}>Carregar Imagem para Recorte</span>
            <span className={styles.dropzoneDesc}>Arraste ou clique para selecionar (PNG, JPG, WebP)</span>
          </div>

          {/* Ou selecione do Projeto */}
          {project.assets.length > 0 && (
            <div className={styles.projectAssetsSection}>
              <span className={styles.sectionLabel}>Ou selecione uma mídia do projeto:</span>
              <div className={styles.assetThumbRow}>
                {project.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={styles.assetThumbItem}
                    onClick={() => handleSelectAsset(asset)}
                    title={asset.name}
                  >
                    <img
                      src={asset.thumbnailUrl || asset.url}
                      alt={asset.name}
                      className={styles.assetThumbImg}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Preview Box */}
          <div
            className={`${styles.previewBox} ${previewBg === 'checker' ? styles.checkerBg : ''}`}
            style={getPreviewBgStyle()}
          >
            {processedUrl ? (
              <img
                src={processedUrl}
                alt="Recorte Sem Fundo"
                className={styles.previewImg}
              />
            ) : (
              <img
                src={selectedImageSrc}
                alt="Original"
                className={styles.previewImg}
              />
            )}

            {isProcessing && (
              <div className={styles.spinnerOverlay}>
                <div style={{ width: '28px', height: '28px', border: '3px solid rgba(130,87,229,0.3)', borderTopColor: '#04d361', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Removendo fundo...</span>
              </div>
            )}
          </div>

          {/* Background Switcher for Preview */}
          <div className={styles.bgSwitcher}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Visualizar fundo:</span>
            <div className={styles.bgSwatchList}>
              <button
                className={`${styles.bgSwatchBtn} ${previewBg === 'checker' ? styles.bgSwatchBtnActive : ''} ${styles.checkerBg}`}
                onClick={() => setPreviewBg('checker')}
                title="Fundo Transparente"
              />
              <button
                className={`${styles.bgSwatchBtn} ${previewBg === 'white' ? styles.bgSwatchBtnActive : ''}`}
                style={{ backgroundColor: '#ffffff' }}
                onClick={() => setPreviewBg('white')}
                title="Fundo Branco"
              />
              <button
                className={`${styles.bgSwatchBtn} ${previewBg === 'black' ? styles.bgSwatchBtnActive : ''}`}
                style={{ backgroundColor: '#000000' }}
                onClick={() => setPreviewBg('black')}
                title="Fundo Preto"
              />
              <button
                className={`${styles.bgSwatchBtn} ${previewBg === 'purple' ? styles.bgSwatchBtnActive : ''}`}
                style={{ backgroundColor: '#8257e5' }}
                onClick={() => setPreviewBg('purple')}
                title="Fundo Roxo Alô Tio"
              />
              <button
                className={`${styles.bgSwatchBtn} ${previewBg === 'green' ? styles.bgSwatchBtnActive : ''}`}
                style={{ backgroundColor: '#04d361' }}
                onClick={() => setPreviewBg('green')}
                title="Fundo Verde Alô Tio"
              />
            </div>
          </div>

          {/* Mode Selector */}
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeBtn} ${mode === 'ai' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('ai')}
            >
              🤖 Fundo Normal (IA)
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'chroma' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('chroma')}
            >
              🟢 Chroma Key
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'luma' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('luma')}
            >
              🌗 Luma Key
            </button>
          </div>

          {/* Fine Tuning Controls */}
          <div className={styles.paramGroup}>
            {mode === 'chroma' ? (
              <>
                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Cor Chave (Key Color)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#00ff00', border: '1px solid #fff', cursor: 'pointer' }}
                        onClick={() => setKeyColor('#00ff00')}
                        title="Verde"
                      />
                      <button
                        style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#0000ff', border: '1px solid #fff', cursor: 'pointer' }}
                        onClick={() => setKeyColor('#0000ff')}
                        title="Azul"
                      />
                      <input
                        type="color"
                        value={keyColor}
                        onChange={(e) => setKeyColor(e.target.value)}
                        style={{ width: '22px', height: '22px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Similaridade / Tolerância</span>
                    <span className={styles.paramVal}>{Math.round(similarity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.02"
                    value={similarity}
                    onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                  />
                </div>

                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Suavidade de Borda</span>
                    <span className={styles.paramVal}>{Math.round(smoothness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.4"
                    step="0.01"
                    value={smoothness}
                    onChange={(e) => setSmoothness(parseFloat(e.target.value))}
                  />
                </div>
              </>
            ) : mode === 'luma' ? (
              <>
                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Limiar de Luminosidade</span>
                    <span className={styles.paramVal}>{Math.round(similarity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.02"
                    value={similarity}
                    onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Sensibilidade do Recorte</span>
                    <span className={styles.paramVal}>{Math.round(aiThreshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.15"
                    max="0.85"
                    step="0.02"
                    value={aiThreshold}
                    onChange={(e) => setAiThreshold(parseFloat(e.target.value))}
                  />
                </div>

                <div className={styles.paramRow}>
                  <div className={styles.paramHeader}>
                    <span>Suavização de Borda (Feather)</span>
                    <span className={styles.paramVal}>{aiFeather}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={aiFeather}
                    onChange={(e) => setAiFeather(parseInt(e.target.value))}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={invertMask}
                    onChange={(e) => setInvertMask(e.target.checked)}
                  />
                  <span>Inverter seleção (manter fundo)</span>
                </label>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className={styles.actionGroup}>
            <button className={styles.primaryActionBtn} onClick={handleDownload}>
              <Download size={16} />
              <span>Baixar PNG Transparente</span>
            </button>

            <button className={styles.secondaryActionBtn} onClick={handleAddToTimeline}>
              <Plus size={15} color="var(--accent-cyan)" />
              <span>Adicionar à Linha do Tempo</span>
            </button>

            <button className={styles.secondaryActionBtn} onClick={handleSaveToMedia}>
              <Layers size={15} />
              <span>Salvar nas Mídias do Projeto</span>
            </button>

            <button
              className={styles.secondaryActionBtn}
              onClick={() => {
                setSelectedImageSrc(null);
                setProcessedUrl(null);
                setProcessedBlob(null);
              }}
              style={{ color: 'var(--text-muted)' }}
            >
              <RefreshCw size={14} />
              <span>Escolher Outra Imagem</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
