'use client';

import React, { useState } from 'react';
import { useEditor } from '@/context/EditorContext';
import { renderProjectClientSide } from '@/services/videoExporter';
import {
  Download,
  X,
  Cpu,
  CheckCircle,
  Cloud,
  FileVideo,
  Sparkles,
  Loader2,
} from 'lucide-react';
import styles from './Modal.module.css';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, setIsExportModalOpen, project, googleAccessToken } = useEditor();

  const [resolution, setResolution] = useState('1080p');
  const [format, setFormat] = useState('mp4');
  const [fps, setFps] = useState('30');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadSuccess, setDriveUploadSuccess] = useState(false);

  if (!isExportModalOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setIsDone(false);
    setExportedBlob(null);
    setPreviewUrl(null);
    setDriveUploadSuccess(false);

    try {
      const blob = await renderProjectClientSide({
        project,
        resolution,
        fps: parseInt(fps),
        format,
        onProgress: (p) => setProgress(p),
      });
      const url = URL.createObjectURL(blob);
      setExportedBlob(blob);
      setPreviewUrl(url);
      setIsDone(true);
    } catch (err: any) {
      console.error('Erro na exportação:', err);
      alert(`Erro ao exportar vídeo: ${err?.message || 'Falha ao renderizar quadros'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFile = () => {
    if (!exportedBlob) return;
    const url = previewUrl || URL.createObjectURL(exportedBlob);
    const a = document.createElement('a');
    a.href = url;
    const ext = exportedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    a.download = `${(project.name || 'video_aloeditor').replace(/\s+/g, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveToDrive = async () => {
    if (!exportedBlob) return;
    if (!googleAccessToken) {
      alert('Conecte sua conta do Google Drive primeiro para salvar direto na nuvem!');
      return;
    }
    setIsUploadingToDrive(true);
    try {
      const metadata = {
        name: `${project.name || 'video_aloeditor'}.${format}`,
        mimeType: exportedBlob.type,
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', exportedBlob);

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Falha no upload do Drive: ${res.statusText}`);
      }
      setDriveUploadSuccess(true);
      alert(`Vídeo "${project.name}.${format}" salvo com sucesso no seu Google Drive!`);
    } catch (err: any) {
      console.error('Erro ao enviar vídeo para o Google Drive:', err);
      alert(`Falha ao salvar no Google Drive: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleResetAndClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setIsExportModalOpen(false);
    setIsDone(false);
    setProgress(0);
    setExportedBlob(null);
    setPreviewUrl(null);
  };

  return (
    <div className={styles.backdrop} onClick={handleResetAndClose}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <Download size={18} color="var(--accent-cyan)" />
            <h3 className={styles.modalTitle}>Exportar Vídeo Final</h3>
          </div>
          <button className={styles.closeBtn} onClick={handleResetAndClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {!isDone ? (
            <>
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={20} color="var(--accent-cyan)" />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <strong>Renderização Client-Side Acelerada:</strong> O processamento é realizado pela GPU do seu navegador através da WebCodecs API e MP4 Muxer. Zero envio para servidores intermediários!
                </div>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Resolução</label>
                <select
                  className={styles.selectInput}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={isExporting}
                >
                  <option value="1080p">1080p Full HD (1920 x 1080) — Recomendado</option>
                  <option value="4k">4K Ultra HD (3840 x 2160)</option>
                  <option value="720p">720p HD (1280 x 720)</option>
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Formato do Arquivo</label>
                <select
                  className={styles.selectInput}
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={isExporting}
                >
                  <option value="mp4">MP4 (Vídeo H.264 / Áudio AAC) — Universal</option>
                  <option value="webm">WebM (VP9 / Opus) — Rápido para Web</option>
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Taxa de Quadros (FPS)</label>
                <select
                  className={styles.selectInput}
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  disabled={isExporting}
                >
                  <option value="30">30 FPS (Padrão Web / YouTube)</option>
                  <option value="24">24 FPS (Estilo Cinema — Renderização Mais Rápida)</option>
                  <option value="60">60 FPS (Ultra Suave)</option>
                </select>
              </div>

              {isExporting && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>
                      {progress < 15
                        ? '⚡ Pré-carregando mídias na memória RAM...'
                        : progress < 90
                        ? `🚀 Codificando quadros via GPU (${progress}%)...`
                        : '✨ Finalizando arquivo de vídeo...'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-geist-mono)', fontWeight: 600 }}>{progress}%</span>
                  </div>
                  <div className={styles.progressBarContainer}>
                    <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '8px 0' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
                <CheckCircle size={28} />
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Vídeo Renderizado com Sucesso!</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {project.name}.{format} ({resolution} @ {fps}fps • {exportedBlob ? (exportedBlob.size / (1024 * 1024)).toFixed(1) : 0} MB)
                </p>
              </div>

              {previewUrl && (
                <div style={{ width: '100%', maxHeight: '220px', borderRadius: '8px', overflow: 'hidden', background: '#000000', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'center' }}>
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    style={{ width: '100%', maxHeight: '220px', objectFit: 'contain' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '4px' }}>
                <button
                  className={styles.primaryBtn}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleDownloadFile}
                  title="Salvar arquivo no seu computador"
                >
                  <Download size={14} />
                  <span>Baixar Arquivo ({format.toUpperCase()})</span>
                </button>

                <button
                  className={styles.primaryBtn}
                  style={{ flex: 1, justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                  onClick={handleSaveToDrive}
                  disabled={isUploadingToDrive}
                  title="Fazer upload direto para o Google Drive"
                >
                  <Cloud size={14} />
                  <span>{isUploadingToDrive ? 'Enviando...' : driveUploadSuccess ? 'Salvo no Drive!' : 'Salvar no Google Drive'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={handleResetAndClose}>
            {isDone ? 'Concluir' : 'Cancelar'}
          </button>

          {!isDone && (
            <button
              className={styles.primaryBtn}
              onClick={handleStartExport}
              disabled={isExporting}
            >
              <Sparkles size={14} />
              <span>{isExporting ? 'Processando...' : 'Iniciar Renderização'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
