'use client';

import React, { useRef, useState } from 'react';
import { useEditor } from '@/context/EditorContext';
import {
  FolderSearch,
  FolderOpen,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { MediaAsset } from '@/types/editor';
import { GENERIC_VIDEO_THUMBNAIL } from '@/utils/thumbnailGenerator';
import styles from './RelinkMediaModal.module.css';

const formatFileSize = (bytes?: number) => {
  if (!bytes || isNaN(bytes)) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

export const RelinkMediaModal: React.FC = () => {
  const {
    isRelinkModalOpen,
    setIsRelinkModalOpen,
    project,
    relinkAssetsFromFiles,
    offlineAssetsCount,
  } = useEditor();

  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);
  const [targetAssetForSinglePick, setTargetAssetForSinglePick] = useState<MediaAsset | null>(null);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const singleFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isRelinkModalOpen) return null;

  const localAssets = project.assets.filter((a) => !a.isDrive);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setFeedback({ type: 'info', text: 'Escaneando pasta e reconectando mídias...' });

    try {
      const result = await relinkAssetsFromFiles(files);
      if (result.reconnectedCount > 0) {
        setFeedback({
          type: 'success',
          text: `🎉 ${result.reconnectedCount} mídia(s) foram localizadas e reconectadas com sucesso!`,
        });
      } else {
        setFeedback({
          type: 'warning',
          text: 'Nenhuma mídia correspondente com o mesmo nome foi encontrada na pasta selecionada.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'warning',
        text: `Erro ao reconectar: ${err?.message || 'Falha ao processar arquivos'}`,
      });
    } finally {
      setIsProcessing(false);
      // Reset input value so user can select the same folder again if needed
      e.target.value = '';
    }
  };

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setFeedback({ type: 'info', text: 'Reconectando arquivos selecionados...' });

    try {
      const result = await relinkAssetsFromFiles(files);
      if (result.reconnectedCount > 0) {
        setFeedback({
          type: 'success',
          text: `🎉 ${result.reconnectedCount} mídia(s) reconectada(s) com sucesso!`,
        });
      } else {
        setFeedback({
          type: 'warning',
          text: 'Os arquivos selecionados não coincidem com os nomes das mídias deste projeto.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'warning',
        text: `Erro ao reconectar: ${err?.message || 'Falha ao processar'}`,
      });
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleSingleAssetLocate = (asset: MediaAsset) => {
    setTargetAssetForSinglePick(asset);
    if (singleFileInputRef.current) {
      singleFileInputRef.current.click();
    }
  };

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !targetAssetForSinglePick) return;

    const file = files[0];
    setIsProcessing(true);

    try {
      const result = await relinkAssetsFromFiles([file], targetAssetForSinglePick.id);
      if (result.reconnectedCount > 0) {
        setFeedback({
          type: 'success',
          text: `Mídia "${targetAssetForSinglePick.name}" reconectada com sucesso!`,
        });
      } else {
        setFeedback({
          type: 'warning',
          text: `Não foi possível vincular o arquivo selecionado.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'warning',
        text: `Erro ao vincular arquivo: ${err?.message || 'Falha'}`,
      });
    } finally {
      setIsProcessing(false);
      setTargetAssetForSinglePick(null);
      e.target.value = '';
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'audio':
        return <FileAudio size={16} color="#34d399" />;
      case 'image':
        return <ImageIcon size={16} color="#fbbf24" />;
      default:
        return <FileVideo size={16} color="#38bdf8" />;
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => setIsRelinkModalOpen(false)}>
      <div className={styles.relinkModalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Hidden File / Folder Inputs */}
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
          style={{ display: 'none' }}
          onChange={handleFolderSelect}
        />
        <input
          ref={filesInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesSelect}
        />
        <input
          ref={singleFileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleSingleFileChange}
        />

        {/* Modal Header */}
        <div className={styles.relinkHeader}>
          <div className={styles.relinkTitleGroup}>
            <div className={styles.relinkTitleIcon}>
              <FolderSearch size={20} />
            </div>
            <div>
              <h3 className={styles.relinkTitle}>Reconectar Mídias do Projeto</h3>
              <p className={styles.relinkSubtitle}>
                Localize automaticamente arquivos de vídeo e áudio do seu computador
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setIsRelinkModalOpen(false)}
            title="Fechar janela"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* Instructions Box */}
          <div className={styles.instructionsCard}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div className={styles.instructionsText}>
              <strong>Como funciona a busca por pasta:</strong>
              <p style={{ margin: '4px 0 0 0', opacity: 0.9 }}>
                Se os vídeos e áudios do projeto estão salvos em uma pasta do seu computador, basta clicar em{' '}
                <strong>&quot;Selecionar Pasta do Projeto&quot;</strong>. O AloEditor escaneará a pasta e subpastas e
                reconectará todas as mídias pelos nomes automaticamente, mantendo todos os seus cortes e edições na timeline intactos!
              </p>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className={styles.actionButtonsRow}>
            <button
              type="button"
              className={styles.folderPickBtn}
              onClick={() => folderInputRef.current?.click()}
              disabled={isProcessing}
            >
              <FolderOpen size={18} />
              <span>{isProcessing ? 'Buscando na Pasta...' : 'Selecionar Pasta do Projeto'}</span>
            </button>

            <button
              type="button"
              className={styles.filePickBtn}
              onClick={() => filesInputRef.current?.click()}
              disabled={isProcessing}
            >
              <FileCheck size={16} />
              <span>Selecionar Arquivos</span>
            </button>
          </div>

          {/* Feedback Message */}
          {feedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background:
                  feedback.type === 'success'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : feedback.type === 'warning'
                    ? 'rgba(244, 63, 94, 0.15)'
                    : 'rgba(56, 189, 248, 0.15)',
                color:
                  feedback.type === 'success'
                    ? '#34d399'
                    : feedback.type === 'warning'
                    ? '#fb7185'
                    : '#38bdf8',
                border: `1px solid ${
                  feedback.type === 'success'
                    ? 'rgba(16, 185, 129, 0.35)'
                    : feedback.type === 'warning'
                    ? 'rgba(244, 63, 94, 0.35)'
                    : 'rgba(56, 189, 248, 0.35)'
                }`,
              }}
            >
              <Sparkles size={15} />
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Local Assets List */}
          <div className={styles.assetsSection}>
            <div className={styles.sectionHeader}>
              <span>Mídias Locais no Projeto ({localAssets.length})</span>
              <span>
                {offlineAssetsCount > 0 ? (
                  <span style={{ color: '#fb7185' }}>⚠️ {offlineAssetsCount} desconectada(s)</span>
                ) : (
                  <span style={{ color: '#34d399' }}>✓ Todas conectadas</span>
                )}
              </span>
            </div>

            {localAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Nenhuma mídia local neste projeto (todos os arquivos estão no Google Drive ou na nuvem).
              </div>
            ) : (
              <div className={styles.assetsList}>
                {localAssets.map((asset) => {
                  const isOffline = asset.isOffline;
                  return (
                    <div
                      key={asset.id}
                      className={`${styles.assetRow} ${isOffline ? styles.assetRowOffline : styles.assetRowOnline}`}
                    >
                      <div className={styles.assetLeft}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                          alt=""
                          className={styles.assetThumb}
                        />
                        <div className={styles.assetMeta}>
                          <span className={styles.assetName} title={asset.name}>
                            {asset.name}
                          </span>
                          <span className={styles.assetSub}>
                            {asset.type.toUpperCase()} • {asset.duration ? `${asset.duration.toFixed(1)}s` : ''}{' '}
                            {asset.size ? `• ${formatFileSize(asset.size)}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className={styles.assetRight}>
                        <span
                          className={`${styles.statusBadge} ${
                            isOffline ? styles.statusBadgeOffline : styles.statusBadgeOnline
                          }`}
                        >
                          {isOffline ? (
                            <>
                              <AlertTriangle size={12} /> Desconectado
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={12} /> Conectado
                            </>
                          )}
                        </span>

                        <button
                          type="button"
                          className={styles.locateBtn}
                          onClick={() => handleSingleAssetLocate(asset)}
                          title={`Localizar arquivo individual para "${asset.name}"`}
                        >
                          Localizar...
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className={styles.modalFooter}>
          <span className={styles.summaryText}>
            {offlineAssetsCount > 0
              ? `${offlineAssetsCount} mídia(s) precisam de reconexão neste computador.`
              : 'Todas as mídias do projeto estão ativas e funcionando.'}
          </span>
          <div className={styles.footerButtons}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setIsRelinkModalOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
