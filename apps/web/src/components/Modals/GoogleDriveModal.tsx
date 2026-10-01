'use client';

import React, { useState, useEffect } from 'react';
import { useEditor, getDriveStreamUrl } from '@/context/EditorContext';
import { listDriveVideos, GoogleDriveFile } from '@/services/googleDrive';
import { MediaAsset } from '@/types/editor';
import {
  Cloud,
  X,
  Key,
  ShieldCheck,
  Zap,
  FolderOpen,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Film,
} from 'lucide-react';
import { GENERIC_VIDEO_THUMBNAIL, handleThumbnailError } from '@/utils/thumbnailGenerator';
import styles from './Modal.module.css';

export const GoogleDriveModal: React.FC = () => {
  const {
    isDrivePickerOpen,
    setIsDrivePickerOpen,
    googleClientId,
    googleApiKey,
    googleAccessToken,
    setGoogleCredentials,
    loginWithGoogle,
    logoutGoogle,
    openGooglePicker,
    driveUser,
    isDriveConnected,
    addAsset,
    addClipToTrack,
    importDriveAssetToMemory,
    driveVideos,
    isDriveLoading,
    loadDriveVideos,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'connect' | 'credentials' | 'help'>('connect');
  const [clientIdInput, setClientIdInput] = useState(googleClientId || '');
  const [apiKeyInput, setApiKeyInput] = useState(googleApiKey || '');
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [importingFileId, setImportingFileId] = useState<string | null>(null);

  useEffect(() => {
    setClientIdInput(googleClientId || '');
    setApiKeyInput(googleApiKey || '');
  }, [googleClientId, googleApiKey]);

  // Only load if not already cached
  useEffect(() => {
    if (googleAccessToken && isDrivePickerOpen && driveVideos.length === 0 && !isDriveLoading) {
      loadDriveVideos(false);
    }
  }, [googleAccessToken, isDrivePickerOpen, driveVideos.length, isDriveLoading, loadDriveVideos]);

  if (!isDrivePickerOpen) return null;

  const handleSelectVideo = async (file: GoogleDriveFile) => {
    if (importingFileId) return;
    setImportingFileId(file.id);
    try {
      const asset = await importDriveAssetToMemory(file, { addToTimeline: true });
      if (asset) {
        setIsDrivePickerOpen(false);
      }
    } finally {
      setImportingFileId(null);
    }
  };

  const handleSaveCredentials = () => {
    if (!clientIdInput.trim()) {
      alert('Por favor, preencha o Client ID do Google Cloud.');
      return;
    }

    if (apiKeyInput.trim().startsWith('GOCSPX')) {
      alert('Atenção: O valor inserido começa com GOCSPX, que é a Chave Secreta OAuth (Client Secret), e NÃO a Chave de API!\n\nA Chave de API começa com "AIzaSy...".');
      return;
    }

    setGoogleCredentials({
      clientId: clientIdInput.trim(),
      apiKey: apiKeyInput.trim(),
    });
    alert('Credenciais salvas com sucesso!');
    setActiveTab('connect');
  };

  const handleCopyOrigin = () => {
    navigator.clipboard.writeText('http://localhost:3001');
    setCopiedOrigin(true);
    setTimeout(() => setCopiedOrigin(false), 2000);
  };

  return (
    <div className={styles.backdrop} onClick={() => setIsDrivePickerOpen(false)}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <Cloud size={18} color="var(--accent-cyan)" />
            <h3 className={styles.modalTitle}>Integração com Google Drive</h3>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setIsDrivePickerOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}>
          <button
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              color: activeTab === 'connect' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'connect' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('connect')}
          >
            Navegar no Meu Drive
          </button>
          <button
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              color: activeTab === 'credentials' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'credentials' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('credentials')}
          >
            Credenciais Google Cloud
          </button>
          <button
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: 500,
              color: activeTab === 'help' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'help' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
            onClick={() => setActiveTab('help')}
          >
            Ajuda
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {activeTab === 'connect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isDriveConnected && driveUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Account Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {driveUser.avatarUrl ? (
                        <img
                          src={driveUser.avatarUrl}
                          alt={driveUser.name}
                          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--accent-cyan)' }}
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                          {driveUser.name?.[0] || 'U'}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{driveUser.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>
                          {driveUser.email} • Sessão de 24h ativa
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className={styles.cancelBtn}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                        onClick={() => loadDriveVideos(true)}
                        title="Recarregar vídeos do Drive (forçar atualização)"
                      >
                        <RefreshCw size={12} className={isDriveLoading ? styles.spinAnimation : ''} />
                        <span>Atualizar</span>
                      </button>
                      <button
                        className={styles.cancelBtn}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent-rose)' }}
                        onClick={logoutGoogle}
                      >
                        <LogOut size={12} /> Desconectar
                      </button>
                    </div>
                  </div>

                  {/* Real Videos Section */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Vídeos Encontrados no seu Google Drive ({driveVideos.length})
                    </span>
                    <button
                      style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'underline' }}
                      onClick={openGooglePicker}
                    >
                      Tentar via Google Picker oficial
                    </button>
                  </div>

                  {isDriveLoading && driveVideos.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', gap: '10px', color: 'var(--text-secondary)' }}>
                      <RefreshCw size={18} className={styles.spinAnimation} />
                      <span style={{ fontSize: '12px' }}>Buscando vídeos diretamente do seu Drive...</span>
                    </div>
                  ) : driveVideos.length > 0 ? (
                    <div className={styles.driveBrowserGrid} style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      {driveVideos.map((video) => {
                        const isCurrentImporting = importingFileId === video.id;
                        return (
                          <div
                            key={video.id}
                            className={styles.driveFileCard}
                            onClick={() => !importingFileId && handleSelectVideo(video)}
                            style={{
                              opacity: importingFileId && !isCurrentImporting ? 0.4 : 1,
                              pointerEvents: importingFileId ? 'none' : 'auto',
                              cursor: importingFileId ? 'not-allowed' : 'pointer',
                              position: 'relative',
                            }}
                            title={isCurrentImporting ? 'Baixando para a memória...' : 'Clique para importar e adicionar à linha do tempo'}
                          >
                            <img
                              src={video.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                              alt={video.name}
                              className={styles.driveThumb}
                              onError={handleThumbnailError}
                            />
                            {isCurrentImporting && (
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: 'rgba(10, 15, 29, 0.85)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '8px',
                                  gap: '6px',
                                  zIndex: 10,
                                }}
                              >
                                <RefreshCw size={18} className={styles.spinAnimation} color="var(--accent-cyan)" />
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                                  Baixando...
                                </span>
                              </div>
                            )}
                            <div className={styles.driveFileInfo}>
                              <span className={styles.driveFileName} title={video.name}>
                                {video.name}
                              </span>
                              <span className={styles.driveFileMeta}>
                                {video.sizeBytes ? `${(video.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : 'Vídeo'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--accent-cyan)', fontSize: '10px', marginTop: '2px', fontWeight: 600 }}>
                                <Plus size={10} /> {isCurrentImporting ? 'Importando...' : 'Inserir no Editor'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-panel)', borderRadius: '8px', border: '1px dashed var(--border-default)' }}>
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        Nenhum vídeo em formato MP4/MOV/WebM encontrado na raiz do seu Drive.
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Faça upload de um arquivo de vídeo no seu Google Drive ou use o seletor do Google Picker abaixo.
                      </p>
                      <button
                        className={styles.primaryBtn}
                        style={{ margin: '12px auto 0', fontSize: '12px' }}
                        onClick={openGooglePicker}
                      >
                        <FolderOpen size={14} />
                        <span>Abrir Seletor Google Picker</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px', padding: '20px 0' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                    <ShieldCheck size={32} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Conectar sua Conta Google</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '380px' }}>
                      Faça login com a sua conta Google (`nick.tecno@gmail.com`) para listar e transmitir seus vídeos direto para o AloEditor.
                    </p>
                  </div>

                  <button
                    className={styles.primaryBtn}
                    style={{ padding: '10px 24px', fontSize: '13px' }}
                    onClick={loginWithGoogle}
                  >
                    <Cloud size={16} />
                    <span>Fazer Login com Google</span>
                  </button>
                </div>
              )}

              {/* Architecture Info Box */}
              <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '10px 14px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Zap size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <strong>Tecnologia Client-Side:</strong> Os vídeos são transmitidos sob demanda direto dos servidores do Google via Range Requests HTTP 206. <strong>0 MB de espaço ocupado no seu disco!</strong>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'credentials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)', fontSize: '13px', fontWeight: 600 }}>
                <Key size={16} />
                <span>Credenciais do Google Cloud Console</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Insira as credenciais do seu projeto no Google Cloud Console.
              </p>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>
                  Google Client ID (OAuth 2.0 Web Client)
                </label>
                <input
                  type="text"
                  placeholder="ex: 1234567890-abcdef.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className={styles.selectInput}
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>
                  Google API Key (opcional, necessária apenas se usar o iframe do Google Picker)
                </label>
                <input
                  type="password"
                  placeholder="ex: AIzaSy..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className={styles.selectInput}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Origem autorizada: <strong>http://localhost:3001</strong>
                </div>
                <button
                  className={styles.cancelBtn}
                  style={{ padding: '4px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={handleCopyOrigin}
                >
                  {copiedOrigin ? <Check size={10} color="#10b981" /> : <Copy size={10} />}
                  <span>{copiedOrigin ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button className={styles.primaryBtn} onClick={handleSaveCredentials}>
                  <span>Salvar Credenciais</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
                Como obter as credenciais:
              </h4>

              <ol style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>
                  Acesse o{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-cyan)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    Google Cloud Console <ExternalLink size={11} />
                  </a>.
                </li>
                <li>
                  Em <strong>APIs e Serviços &gt; Biblioteca</strong>, ative a <strong>Google Drive API</strong>.
                </li>
                <li>
                  Em <strong>Tela de permissão OAuth</strong>, adicione seu e-mail em <strong>Usuários de teste</strong>.
                </li>
                <li>
                  Em <strong>Credenciais</strong>, crie um <strong>ID do cliente OAuth (Aplicativo da Web)</strong> com origem <code>http://localhost:3001</code>.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <button
            className={styles.cancelBtn}
            onClick={() => setIsDrivePickerOpen(false)}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
