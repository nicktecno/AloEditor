'use client';

import React from 'react';
import { useEditor } from '@/context/EditorContext';
import { AspectRatio } from '@/types/editor';
import {
  Undo2,
  Redo2,
  HardDrive,
  Cloud,
  Download,
  Save,
  HelpCircle,
  FilePlus,
} from 'lucide-react';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const {
    project,
    updateProjectName,
    setAspectRatio,
    newProject,
    canUndo,
    canRedo,
    undo,
    redo,
    isDriveConnected,
    driveUser,
    googleAccessToken,
    openGooglePicker,
    isSavingToDrive,
    lastSavedAt,
    saveProjectToDrive,
    setIsDrivePickerOpen,
    setIsExportModalOpen,
    setIsShortcutsModalOpen,
  } = useEditor();

  const handleRatioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAspectRatio(e.target.value as AspectRatio);
  };

  return (
    <header className={styles.header}>
      {/* Left: Logo & Project Name */}
      <div className={styles.leftSection}>
        <div className={styles.logoBadge} title="Alô Editor — Ecossistema Alô Tio">
          <img
            src="/AloEditor.png"
            alt="Alô Editor"
            className={styles.logoImage}
          />
          <span className={styles.tagAloTio}>Alô Tio</span>
          <span className={styles.tagCloud}>Drive Cloud</span>
        </div>

        <div className={styles.divider} />

        <input
          type="text"
          className={styles.projectNameInput}
          value={project.name}
          onChange={(e) => updateProjectName(e.target.value)}
          placeholder="Nome do Projeto..."
        />

        <button
          className={styles.iconBtn}
          onClick={() => {
            if (confirm('Deseja iniciar um Novo Projeto vazio? O projeto atual será limpo para você começar do zero.')) {
              newProject();
            }
          }}
          title="Iniciar Novo Projeto Vazio"
          style={{ gap: '5px', fontSize: '11px', padding: '4px 9px', height: '28px', color: 'var(--text-secondary)' }}
        >
          <FilePlus size={14} color="var(--accent-cyan)" />
          <span>Novo</span>
        </button>

        <div
          className={styles.saveIndicator}
          title={isDriveConnected ? `Projeto sincronizado com o Google Drive (${project.driveFileId || 'nuvem'})` : 'Projeto salvo localmente no seu navegador'}
        >
          <span
            className={`${styles.syncDot} ${isSavingToDrive ? styles.syncDotSaving : ''}`}
          />
          <span>
            {isSavingToDrive
              ? 'Salvando no Drive...'
              : isDriveConnected
              ? `Salvo no Drive ${lastSavedAt ? `às ${lastSavedAt}` : ''}`
              : `Salvo no navegador ${lastSavedAt ? `às ${lastSavedAt}` : ''}`}
          </span>
        </div>
      </div>

      {/* Center: Aspect Ratio & Undo/Redo */}
      <div className={styles.centerSection}>
        <div className={styles.ratioSelector}>
          <label htmlFor="aspect-ratio-select">Formato:</label>
          <select
            id="aspect-ratio-select"
            className={styles.ratioSelect}
            value={project.settings.aspectRatio}
            onChange={handleRatioChange}
          >
            <option value="16:9">16:9 (YouTube / Vídeo)</option>
            <option value="9:16">9:16 (TikTok / Reels / Shorts)</option>
            <option value="1:1">1:1 (Instagram / Feed)</option>
            <option value="4:5">4:5 (Vertical Retrato)</option>
            <option value="21:9">21:9 (Ultrawide Cinema)</option>
          </select>
        </div>

        <div className={styles.historyGroup}>
          <button
            className={styles.iconBtn}
            onClick={undo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={redo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <button
          className={styles.iconBtn}
          onClick={() => setIsShortcutsModalOpen(true)}
          title="Atalhos do Teclado"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      {/* Right: Google Drive & Export CTA */}
      <div className={styles.rightSection}>
        <button
          className={styles.driveButton}
          onClick={() => setIsDrivePickerOpen(true)}
          title={isDriveConnected ? `Conectado como ${driveUser?.name || 'Google'}. Clique para gerenciar ou escolher vídeos.` : 'Conectar com Google Drive'}
        >
          <Cloud size={15} color={isDriveConnected ? '#10b981' : '#06b6d4'} />
          <span>{isDriveConnected ? (driveUser?.name?.split(' ')[0] || 'Drive Conectado') : 'Google Drive'}</span>
          {driveUser?.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={driveUser.avatarUrl}
              alt={driveUser.name}
              className={styles.avatar}
            />
          )}
        </button>

        <button
          className={styles.saveBtn}
          onClick={() => saveProjectToDrive()}
          disabled={isSavingToDrive}
          title="Salvar arquivo de projeto (.json) no Google Drive"
        >
          <Save size={14} />
          <span>Salvar</span>
        </button>

        <button
          className={styles.exportBtn}
          onClick={() => setIsExportModalOpen(true)}
        >
          <Download size={14} />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
};
