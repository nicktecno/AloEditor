'use client';

import React from 'react';
import { EditorProvider, useEditor } from '@/context/EditorContext';
import { Header } from '@/components/Header/Header';
import { MediaPanel } from '@/components/Sidebar/MediaPanel';
import { PlayerPreview } from '@/components/Player/PlayerPreview';
import { PlayerControls } from '@/components/Player/PlayerControls';
import { PropertiesPanel } from '@/components/Inspector/PropertiesPanel';
import { Timeline } from '@/components/Timeline/Timeline';
import { GoogleDriveModal } from '@/components/Modals/GoogleDriveModal';
import { ExportModal } from '@/components/Modals/ExportModal';
import { ShortcutsModal } from '@/components/Modals/ShortcutsModal';
import { SilenceRemoverModal } from '@/components/Modals/SilenceRemoverModal';
import { ProjectsModal } from '@/components/Modals/ProjectsModal';
import { Film, FolderOpen, Sliders } from 'lucide-react';
import styles from './page.module.css';

const EditorLayout: React.FC = () => {
  const {
    isLoading,
    loadingMessage,
    isSavingToDrive,
    mobileView,
    setMobileView,
    isSidebarOpen,
    isInspectorOpen,
  } = useEditor();

  const showGlobalLoading = isLoading || isSavingToDrive;
  const currentMessage = isSavingToDrive ? 'Salvando projeto no Google Drive...' : loadingMessage;

  return (
    <div className={styles.appContainer}>
      {/* Top Global Loading Feedback */}
      {showGlobalLoading && (
        <div className={styles.globalLoadingBar}>
          <div className={styles.globalLoadingProgress} />
          <div className={styles.globalLoadingPill}>
            <div className={styles.globalSpinner} />
            <span>{currentMessage}</span>
          </div>
        </div>
      )}

      {/* Top Navigation & Project Bar */}
      <Header />

      {/* Middle Workspace: Sidebar + Player + Inspector */}
      <div className={styles.mainWorkspace}>
        {/* Media & Tools Panel */}
        <div
          className={`${styles.sidebarWrapper} ${
            !isSidebarOpen ? styles.panelDesktopHidden : ''
          } ${mobileView === 'media' ? styles.panelMobileActive : ''}`}
        >
          <MediaPanel />
        </div>

        {/* Center: Video Preview & Playback Controls */}
        <div
          className={`${styles.centerColumn} ${
            mobileView !== 'editor' ? styles.columnMobileHidden : ''
          }`}
        >
          <PlayerPreview />
          <PlayerControls />
        </div>

        {/* Right: Clip & Project Inspector */}
        <div
          className={`${styles.inspectorWrapper} ${
            !isInspectorOpen ? styles.panelDesktopHidden : ''
          } ${mobileView === 'inspector' ? styles.panelMobileActive : ''}`}
        >
          <PropertiesPanel />
        </div>
      </div>

      {/* Bottom: Multitrack Timeline */}
      <div
        className={`${styles.timelineContainer} ${
          mobileView !== 'editor' ? styles.columnMobileHidden : ''
        }`}
      >
        <Timeline />
      </div>

      {/* Mobile Bottom Navigation Bar (Phone & small tablet only) */}
      <nav className={styles.mobileNavBar}>
        <button
          type="button"
          className={`${styles.mobileNavBtn} ${
            mobileView === 'editor' ? styles.mobileNavBtnActive : ''
          }`}
          onClick={() => setMobileView('editor')}
        >
          <Film size={18} />
          <span>Editor</span>
        </button>

        <button
          type="button"
          className={`${styles.mobileNavBtn} ${
            mobileView === 'media' ? styles.mobileNavBtnActive : ''
          }`}
          onClick={() => setMobileView('media')}
        >
          <FolderOpen size={18} />
          <span>Mídia</span>
        </button>

        <button
          type="button"
          className={`${styles.mobileNavBtn} ${
            mobileView === 'inspector' ? styles.mobileNavBtnActive : ''
          }`}
          onClick={() => setMobileView('inspector')}
        >
          <Sliders size={18} />
          <span>Ajustes</span>
        </button>
      </nav>

      {/* Global Modals */}
      <ProjectsModal />
      <GoogleDriveModal />
      <ExportModal />
      <ShortcutsModal />
      <SilenceRemoverModal />
    </div>
  );
};

export default function Home() {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}
