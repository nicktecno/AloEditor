'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEditor } from '@/context/EditorContext';
import {
  FolderOpen,
  X,
  Laptop,
  Cloud,
  FileDown,
  FileUp,
  Plus,
  Copy,
  Trash2,
  Clock,
  Film,
  CheckCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import styles from './ProjectsModal.module.css';

export const ProjectsModal: React.FC = () => {
  const {
    isProjectsModalOpen,
    setIsProjectsModalOpen,
    project,
    localProjects,
    loadProject,
    deleteLocalProject,
    duplicateLocalProject,
    exportProjectAsJson,
    importProjectFromJson,
    driveProjects,
    isDriveProjectsLoading,
    loadDriveProjectsList,
    loadProjectFromDrive,
    isDriveConnected,
    setIsDrivePickerOpen,
    newProject,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'local' | 'drive' | 'io'>('local');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-fetch Drive projects list when opening the drive tab
  useEffect(() => {
    if (isProjectsModalOpen && activeTab === 'drive' && isDriveConnected && driveProjects.length === 0) {
      loadDriveProjectsList();
    }
  }, [isProjectsModalOpen, activeTab, isDriveConnected, driveProjects.length, loadDriveProjectsList]);

  if (!isProjectsModalOpen) return null;

  const handleOpenLocalProject = (projectId: string) => {
    try {
      const raw = localStorage.getItem(`alo_project_${projectId}`);
      if (!raw) {
        alert('Projeto não encontrado no armazenamento local.');
        return;
      }
      const parsed = JSON.parse(raw);
      loadProject(parsed);
      setIsProjectsModalOpen(false);
    } catch (e: any) {
      alert('Erro ao carregar projeto: ' + (e?.message || 'Arquivo corrompido'));
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importProjectFromJson(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsProjectsModalOpen(false);
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => setIsProjectsModalOpen(false)}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Hidden File Input for .alo.json / .json Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".alo.json,.json"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <FolderOpen size={18} color="var(--accent-cyan)" />
            <h3 className={styles.modalTitle}>Gerenciador de Projetos</h3>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setIsProjectsModalOpen(false)}
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'local' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('local')}
          >
            <Laptop size={15} />
            <span>Neste Navegador ({localProjects.length})</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'drive' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('drive')}
          >
            <Cloud size={15} />
            <span>Google Drive {isDriveConnected ? `(${driveProjects.length})` : ''}</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'io' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('io')}
          >
            <FileDown size={15} />
            <span>Importar / Exportar Arquivo</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* TAB 1: LOCAL PROJECTS */}
          {activeTab === 'local' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Projetos salvos automaticamente no armazenamento local deste navegador.
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => fileInputRef.current?.click()}
                    title="Importar e abrir arquivo .alo.json ou .json do computador"
                  >
                    <FileUp size={14} color="var(--accent-cyan)" />
                    <span>Abrir do PC (.alo.json)</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                    onClick={() => {
                      newProject();
                      setIsProjectsModalOpen(false);
                    }}
                    title="Criar novo projeto vazio"
                  >
                    <Plus size={14} />
                    <span>Novo Projeto</span>
                  </button>
                </div>
              </div>

              {localProjects.length === 0 ? (
                <div className={styles.emptyState}>
                  <FolderOpen size={36} />
                  <span>Nenhum projeto salvo encontrado localmente.</span>
                </div>
              ) : (
                <div className={styles.projectsList}>
                  {localProjects.map((p) => {
                    const isCurrent = p.id === project.id;
                    return (
                      <div
                        key={p.id}
                        className={`${styles.projectCard} ${isCurrent ? styles.projectCardActive : ''}`}
                      >
                        <div className={styles.projectInfo}>
                          <div className={styles.projectNameRow}>
                            <span className={styles.projectName} title={p.name}>
                              {p.name}
                            </span>
                            {isCurrent && (
                              <span className={styles.currentBadge}>
                                <CheckCircle size={10} style={{ display: 'inline', marginRight: '3px' }} />
                                Ativo no momento
                              </span>
                            )}
                          </div>
                          <div className={styles.projectMetaRow}>
                            <span className={styles.metaItem}>
                              <Film size={12} />
                              {p.clipsCount} clipe{p.clipsCount !== 1 ? 's' : ''}
                            </span>
                            <span className={styles.metaItem}>
                              Formato: {p.aspectRatio}
                            </span>
                            <span className={styles.metaItem}>
                              Duração: {p.duration ? p.duration.toFixed(1) : 30}s
                            </span>
                            <span className={styles.metaItem}>
                              <Clock size={12} />
                              {formatDate(p.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <div className={styles.projectActions}>
                          {!isCurrent ? (
                            <button
                              className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                              onClick={() => handleOpenLocalProject(p.id)}
                              title="Carregar este projeto no editor"
                            >
                              <FolderOpen size={13} />
                              <span>Abrir</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600, padding: '0 8px' }}>
                              Em edição
                            </span>
                          )}

                          <button
                            className={styles.actionBtn}
                            onClick={() => duplicateLocalProject(p.id)}
                            title="Duplicar projeto"
                          >
                            <Copy size={13} />
                            <span>Duplicar</span>
                          </button>

                          {!isCurrent && (
                            <button
                              className={`${styles.actionBtn} ${styles.dangerBtn}`}
                              onClick={() => {
                                if (confirm(`Deseja realmente excluir o projeto "${p.name}"?`)) {
                                  deleteLocalProject(p.id);
                                }
                              }}
                              title="Excluir projeto do navegador"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE PROJECTS */}
          {activeTab === 'drive' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!isDriveConnected ? (
                <div className={styles.emptyState}>
                  <Cloud size={40} color="#38bdf8" />
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    Google Drive não conectado
                  </div>
                  <p style={{ fontSize: '12px', maxWidth: '380px', lineHeight: '1.4' }}>
                    Conecte sua conta do Google para salvar e abrir seus arquivos de projeto (.alo.json) diretamente da sua pasta na nuvem.
                  </p>
                  <button
                    className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                    onClick={() => {
                      setIsProjectsModalOpen(false);
                      setIsDrivePickerOpen(true);
                    }}
                  >
                    <Cloud size={14} />
                    <span>Conectar Google Drive</span>
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Arquivos de projeto salvos na pasta <strong>AloEditor_Projetos</strong> no seu Google Drive.
                    </span>
                    <button
                      className={styles.actionBtn}
                      onClick={() => loadDriveProjectsList()}
                      disabled={isDriveProjectsLoading}
                      title="Recarregar lista do Drive"
                    >
                      <RefreshCw size={13} className={isDriveProjectsLoading ? 'spin' : ''} />
                      <span>{isDriveProjectsLoading ? 'Buscando...' : 'Atualizar'}</span>
                    </button>
                  </div>

                  {isDriveProjectsLoading ? (
                    <div className={styles.emptyState}>
                      <RefreshCw size={28} className="spin" color="var(--accent-cyan)" />
                      <span>Carregando projetos do seu Google Drive...</span>
                    </div>
                  ) : driveProjects.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Cloud size={36} color="var(--text-muted)" />
                      <span>Nenhum arquivo de projeto (.alo.json) encontrado na pasta AloEditor_Projetos do seu Drive.</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Clique no botão &quot;Salvar&quot; no cabeçalho para enviar o projeto atual para o seu Drive!
                      </span>
                    </div>
                  ) : (
                    <div className={styles.projectsList}>
                      {driveProjects.map((file) => {
                        const isCurrentlyLinked = project.driveFileId === file.id;
                        return (
                          <div
                            key={file.id}
                            className={`${styles.projectCard} ${isCurrentlyLinked ? styles.projectCardActive : ''}`}
                          >
                            <div className={styles.projectInfo}>
                              <div className={styles.projectNameRow}>
                                <Cloud size={14} color="#38bdf8" />
                                <span className={styles.projectName} title={file.name}>
                                  {file.name.replace('.alo.json', '').replace('.json', '')}
                                </span>
                                {isCurrentlyLinked && (
                                  <span className={styles.currentBadge}>
                                    Vinculado ao Projeto Atual
                                  </span>
                                )}
                              </div>
                              <div className={styles.projectMetaRow}>
                                <span className={styles.metaItem}>
                                  <Clock size={12} />
                                  Modificado em: {formatDate(file.modifiedTime)}
                                </span>
                                {file.webViewLink && (
                                  <a
                                    href={file.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                                  >
                                    Ver no Drive <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className={styles.projectActions}>
                              <button
                                className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                                onClick={async () => {
                                  await loadProjectFromDrive(file.id);
                                  setIsProjectsModalOpen(false);
                                }}
                                title="Baixar e carregar este projeto no editor"
                              >
                                <FileDown size={13} />
                                <span>Abrir do Drive</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: IMPORT & EXPORT */}
          {activeTab === 'io' && (
            <div className={styles.ioContainer}>
              {/* Import from PC */}
              <div
                className={styles.dropZone}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) importProjectFromJson(file);
                }}
              >
                <FileUp size={36} color="var(--accent-cyan)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    Clique para selecionar ou arraste um arquivo de projeto (.alo.json)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Suporta arquivos exportados do AlôEditor (.alo.json ou .json)
                  </div>
                </div>
              </div>

              {/* Export current project */}
              <div className={styles.ioCard}>
                <div className={styles.ioCardInfo}>
                  <div className={styles.ioCardTitle}>Baixar Backup do Projeto Atual</div>
                  <div className={styles.ioCardDesc}>
                    Salva o arquivo completo de edição ({project.name}.alo.json) com todos os cortes, textos, efeitos e configurações no seu computador.
                  </div>
                </div>
                <button
                  className={`${styles.actionBtn} ${styles.primaryActionBtn}`}
                  onClick={exportProjectAsJson}
                  title="Baixar arquivo .alo.json"
                >
                  <FileDown size={14} />
                  <span>Baixar .alo.json</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
