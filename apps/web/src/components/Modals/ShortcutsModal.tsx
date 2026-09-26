'use client';

import React from 'react';
import { useEditor } from '@/context/EditorContext';
import { HelpCircle, X, Keyboard } from 'lucide-react';
import styles from './Modal.module.css';

export const ShortcutsModal: React.FC = () => {
  const { isShortcutsModalOpen, setIsShortcutsModalOpen } = useEditor();

  if (!isShortcutsModalOpen) return null;

  const shortcuts = [
    { action: 'Reproduzir / Pausar Reprodução', key: 'Espaço' },
    { action: 'Dividir clipe no playhead (Split)', key: 'S' },
    { action: 'Excluir clipe selecionado', key: 'Delete / Backspace' },
    { action: 'Desfazer última alteração', key: 'Ctrl + Z / Cmd + Z' },
    { action: 'Refazer alteração', key: 'Ctrl + Y / Cmd + Shift + Z' },
    { action: 'Duplicar clipe selecionado', key: 'Ctrl + D / Cmd + D' },
    { action: 'Arrastar Playhead na Régua', key: 'Clique / Arrastar' },
    { action: 'Aparar início/fim do clipe', key: 'Bordas do Clipe' },
  ];

  return (
    <div className={styles.backdrop} onClick={() => setIsShortcutsModalOpen(false)}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <Keyboard size={18} color="var(--accent-cyan)" />
            <h3 className={styles.modalTitle}>Atalhos de Teclado (Estilo CapCut)</h3>
          </div>
          <button className={styles.closeBtn} onClick={() => setIsShortcutsModalOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.shortcutList}>
            {shortcuts.map((item, index) => (
              <div key={index} className={styles.shortcutItem}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{item.action}</span>
                <span className={styles.shortcutKey}>{item.key}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.primaryBtn} onClick={() => setIsShortcutsModalOpen(false)}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
