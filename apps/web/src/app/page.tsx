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
import styles from './page.module.css';

const EditorLayout: React.FC = () => {
  const { isLoading, loadingMessage, isSavingToDrive } = useEditor();

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
        <MediaPanel />

        {/* Center: Video Preview & Playback Controls */}
        <div className={styles.centerColumn}>
          <PlayerPreview />
          <PlayerControls />
        </div>

        {/* Right: Clip & Project Inspector */}
        <PropertiesPanel />
      </div>

      {/* Bottom: Multitrack Timeline */}
      <Timeline />

      {/* Global Modals */}
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
