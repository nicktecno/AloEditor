'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Project,
  TimelineClip,
  TimelineTrack,
  MediaAsset,
  AspectRatio,
  SidebarTab,
  InspectorTab,
  SavedProjectMeta,
} from '@/types/editor';
import { INITIAL_PROJECT } from '@/data/initialData';
import {
  loadGoogleScripts,
  requestGoogleAccessToken,
  fetchGoogleProfile,
  showGooglePicker,
  listDriveVideos,
  saveProjectJsonToDrive,
  listProjectFilesFromDrive,
  loadProjectJsonFromDrive,
  GoogleUserProfile,
  GoogleDriveFile,
} from '@/services/googleDrive';

interface EditorContextType {
  project: Project;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectedClip: TimelineClip | null;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  zoom: number; // pixels per second
  isSnappingEnabled: boolean;
  snapGuideTime: number | null;
  setSnapGuideTime: (time: number | null) => void;
  isDriveConnected: boolean;
  driveUser: GoogleUserProfile | null;
  isSavingToDrive: boolean;
  lastSavedAt: string | null;
  isExportModalOpen: boolean;
  isShortcutsModalOpen: boolean;
  isDrivePickerOpen: boolean;
  isSilenceModalOpen: boolean;
  setIsSilenceModalOpen: (open: boolean) => void;
  removeSilencesFromClip: (
    clipId: string,
    silenceIntervals: Array<{ startInTimeline: number; endInTimeline: number; duration: number }>,
    mode?: 'auto_cut' | 'split_only',
    rippleTrack?: boolean
  ) => void;
  canUndo: boolean;
  canRedo: boolean;

  // Responsive Layout States
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: (force?: boolean) => void;
  isInspectorOpen: boolean;
  setIsInspectorOpen: (open: boolean) => void;
  toggleInspector: (force?: boolean) => void;
  mobileView: 'editor' | 'media' | 'inspector';
  setMobileView: (view: 'editor' | 'media' | 'inspector') => void;

  // Global Loading State
  isLoading: boolean;
  loadingMessage: string;
  setIsLoading: (loading: boolean, message?: string) => void;

  // Google Drive Cached Videos (prevents reloading on every open)
  driveVideos: GoogleDriveFile[];
  isDriveLoading: boolean;
  loadDriveVideos: (forceRefresh?: boolean) => Promise<GoogleDriveFile[]>;

  // Google OAuth Credentials & Token
  googleAccessToken: string | null;
  googleClientId: string;
  googleApiKey: string;
  setGoogleCredentials: (creds: { clientId: string; apiKey: string }) => void;
  loginWithGoogle: () => void;
  logoutGoogle: () => void;
  openGooglePicker: () => void;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setSelectedClipId: (id: string | null) => void;
  setSelectedClipIds: (ids: string[]) => void;
  selectClip: (id: string, isMulti?: boolean) => void;
  selectAllClips: () => void;
  clearSelection: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setZoom: (zoom: number) => void;
  toggleSnapping: () => void;
  updateProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  addClipToTrack: (asset: MediaAsset, trackId?: string, targetStartTime?: number) => void;
  addTextClip: () => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  deleteClip: (clipId: string) => void;
  deleteSelectedClips: () => void;
  splitClipAtPlayhead: (clipId?: string) => void;
  duplicateClip: (clipId: string) => void;
  detachAudioFromClip: (clipId: string) => void;
  addAsset: (asset: MediaAsset) => void;
  saveProjectToDrive: () => Promise<void>;
  setIsExportModalOpen: (open: boolean) => void;
  setIsShortcutsModalOpen: (open: boolean) => void;
  setIsDrivePickerOpen: (open: boolean) => void;
  isProjectsModalOpen: boolean;
  setIsProjectsModalOpen: (open: boolean) => void;
  localProjects: SavedProjectMeta[];
  loadProject: (project: Project) => void;
  deleteLocalProject: (id: string) => void;
  duplicateLocalProject: (id: string) => void;
  exportProjectAsJson: () => void;
  importProjectFromJson: (file: File) => Promise<boolean>;
  driveProjects: Array<{ id: string; name: string; modifiedTime: string; size?: string; webViewLink?: string }>;
  isDriveProjectsLoading: boolean;
  loadDriveProjectsList: () => Promise<void>;
  loadProjectFromDrive: (fileId: string) => Promise<void>;
  newProject: () => void;
  clearTimeline: () => void;
  undo: () => void;
  redo: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);
  const [history, setHistory] = useState<Project[]>([INITIAL_PROJECT]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Global loading
  const [isLoading, setIsLoadingState] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Carregando...');

  const setIsLoading = useCallback((loading: boolean, message = 'Carregando...') => {
    setIsLoadingState(loading);
    setLoadingMessage(message);
  }, []);

  const [currentTime, setCurrentTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(['clip_video_1']);
  const [sidebarTab, setSidebarTabState] = useState<SidebarTab>('media');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('video');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'editor' | 'media' | 'inspector'>('editor');
  const [zoom, setZoom] = useState(60); // 60px = 1 second
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);

  // Responsive initial screen detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        if (window.innerWidth < 1100) {
          setIsInspectorOpen(false);
        }
        if (window.innerWidth < 768) {
          setIsSidebarOpen(false);
        }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const toggleSidebar = useCallback((force?: boolean) => {
    setIsSidebarOpen((prev) => {
      const next = force !== undefined ? force : !prev;
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        setMobileView(next ? 'media' : 'editor');
      }
      return next;
    });
  }, []);

  const toggleInspector = useCallback((force?: boolean) => {
    setIsInspectorOpen((prev) => {
      const next = force !== undefined ? force : !prev;
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        setMobileView(next ? 'inspector' : 'editor');
      }
      return next;
    });
  }, []);

  const setSidebarTab = useCallback((tab: SidebarTab) => {
    setSidebarTabState(tab);
    setIsSidebarOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileView('media');
    }
  }, []);

  // Google OAuth Credentials & State
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [googleApiKey, setGoogleApiKey] = useState<string>('');
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [driveUser, setDriveUser] = useState<GoogleUserProfile | null>(null);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Projects Management state
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [localProjects, setLocalProjects] = useState<SavedProjectMeta[]>([]);
  const [driveProjects, setDriveProjects] = useState<Array<{ id: string; name: string; modifiedTime: string; size?: string; webViewLink?: string }>>([]);
  const [isDriveProjectsLoading, setIsDriveProjectsLoading] = useState(false);

  // Synchronize a project into the local projects index and individual slot
  const syncProjectToLocalIndex = useCallback((proj: Project) => {
    try {
      localStorage.setItem(`alo_project_${proj.id}`, JSON.stringify(proj));
      const indexRaw = localStorage.getItem('alo_editor_projects_index');
      let index: SavedProjectMeta[] = [];
      if (indexRaw) {
        try {
          index = JSON.parse(indexRaw);
        } catch {}
      }
      const existingIdx = index.findIndex((p) => p.id === proj.id);
      const meta: SavedProjectMeta = {
        id: proj.id,
        name: proj.name,
        updatedAt: proj.updatedAt || new Date().toISOString(),
        clipsCount: proj.clips.length,
        duration: proj.duration,
        aspectRatio: proj.settings.aspectRatio,
        driveFileId: proj.driveFileId,
      };
      if (existingIdx >= 0) {
        index[existingIdx] = meta;
      } else {
        index.unshift(meta);
      }
      localStorage.setItem('alo_editor_projects_index', JSON.stringify(index));
      setLocalProjects(index);
    } catch (e) {
      console.warn('Erro ao sincronizar índice local de projetos:', e);
    }
  }, []);

  // Restore project from localStorage on initial mount
  useEffect(() => {
    try {
      // Load local projects index
      const indexRaw = localStorage.getItem('alo_editor_projects_index');
      if (indexRaw) {
        try {
          setLocalProjects(JSON.parse(indexRaw));
        } catch {}
      }

      const saved = localStorage.getItem('alo_editor_project');
      if (saved) {
        const parsed: Project = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.clips) && Array.isArray(parsed.tracks)) {
          setProject(parsed);
          setHistory([parsed]);
          setHistoryIndex(0);
          projectRef.current = parsed;
          if (parsed.clips.length > 0) {
            setSelectedClipIds([parsed.clips[0].id]);
          } else {
            setSelectedClipIds([]);
          }
          syncProjectToLocalIndex(parsed);
        }
      } else {
        syncProjectToLocalIndex(INITIAL_PROJECT);
      }
      const savedTime = localStorage.getItem('alo_editor_last_saved');
      if (savedTime) setLastSavedAt(savedTime);
    } catch (e) {
      console.warn('Erro ao restaurar projeto do localStorage:', e);
    } finally {
      setIsHydrated(true);
    }
  }, [syncProjectToLocalIndex]);

  // Automatically persist project changes to localStorage & index
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('alo_editor_project', JSON.stringify(project));
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedAt(nowStr);
      localStorage.setItem('alo_editor_last_saved', nowStr);
      syncProjectToLocalIndex(project);
    } catch (e) {
      console.warn('Erro ao auto-salvar projeto no localStorage:', e);
    }
  }, [project, isHydrated, syncProjectToLocalIndex]);

  // Google Drive Cached Videos (persisted in memory + sessionStorage)
  const [driveVideos, setDriveVideos] = useState<GoogleDriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const driveVideosRef = useRef<GoogleDriveFile[]>([]);

  useEffect(() => {
    driveVideosRef.current = driveVideos;
  }, [driveVideos]);

  // Restore cached videos from sessionStorage on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('alo_drive_videos_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDriveVideos(parsed);
        }
      }
    } catch {}
  }, []);

  // Modals
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isSilenceModalOpen, setIsSilenceModalOpen] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const projectRef = useRef<Project>(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Helper single clip selected ID
  const selectedClipId = selectedClipIds[0] || null;

  const setSelectedClipId = useCallback((id: string | null) => {
    setSelectedClipIds(id ? [id] : []);
  }, []);

  const selectClip = useCallback((id: string, isMulti = false) => {
    setSelectedClipIds((prev) => {
      if (isMulti) {
        if (prev.includes(id)) {
          return prev.filter((item) => item !== id);
        } else {
          return [...prev, id];
        }
      }
      return [id];
    });
  }, []);

  const selectAllClips = useCallback(() => {
    setSelectedClipIds(projectRef.current.clips.map((c) => c.id));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClipIds([]);
  }, []);

  // Centralized cached Drive video loader
  const loadDriveVideos = useCallback(async (forceRefresh = false): Promise<GoogleDriveFile[]> => {
    const token = sessionStorage.getItem('alo_google_access_token') || googleAccessToken;
    if (!token) return [];

    // Return immediately if already cached and not forcing refresh
    if (!forceRefresh && driveVideosRef.current.length > 0) {
      return driveVideosRef.current;
    }

    setIsDriveLoading(true);
    try {
      const files = await listDriveVideos(token);
      setDriveVideos(files);
      try {
        sessionStorage.setItem('alo_drive_videos_cache', JSON.stringify(files));
      } catch {}
      return files;
    } catch (err) {
      console.error('Erro ao buscar vídeos do Drive:', err);
      return driveVideosRef.current;
    } finally {
      setIsDriveLoading(false);
    }
  }, [googleAccessToken]);

  // Load saved credentials from localStorage & load scripts on mount
  useEffect(() => {
    loadGoogleScripts().catch(() => {});

    const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const envApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

    const savedClientId = localStorage.getItem('alo_google_client_id') || envClientId;
    const savedApiKey = localStorage.getItem('alo_google_api_key') || envApiKey;

    if (savedClientId) setGoogleClientId(savedClientId);
    if (savedApiKey && !savedApiKey.startsWith('GOCSPX')) setGoogleApiKey(savedApiKey);

    const savedToken = sessionStorage.getItem('alo_google_access_token');
    if (savedToken) {
      setGoogleAccessToken(savedToken);
      fetchGoogleProfile(savedToken).then((profile) => {
        if (profile) {
          setDriveUser(profile);
          setIsDriveConnected(true);
        }
      });
      // Pre-load videos if not already cached
      loadDriveVideos(false).catch(() => {});
    }
  }, [loadDriveVideos]);

  const setGoogleCredentials = useCallback(({ clientId, apiKey }: { clientId: string; apiKey: string }) => {
    setGoogleClientId(clientId);
    setGoogleApiKey(apiKey);
    localStorage.setItem('alo_google_client_id', clientId);
    localStorage.setItem('alo_google_api_key', apiKey);
  }, []);

  // Login with Google GIS
  const loginWithGoogle = useCallback(() => {
    if (!googleClientId) {
      setIsDrivePickerOpen(true);
      return;
    }

    requestGoogleAccessToken(
      googleClientId,
      async (token: string) => {
        setGoogleAccessToken(token);
        sessionStorage.setItem('alo_google_access_token', token);
        setIsDriveConnected(true);
        const profile = await fetchGoogleProfile(token);
        if (profile) {
          setDriveUser(profile);
        }
        loadDriveVideos(false).catch(() => {});
      },
      (err: any) => {
        console.error('Erro na autenticação do Google:', err);
        alert(`Erro na autenticação do Google: ${err.message || 'Verifique se o Client ID está correto e autoriza http://localhost:3001'}`);
      }
    );
  }, [googleClientId, loadDriveVideos]);

  // Logout Google
  const logoutGoogle = useCallback(() => {
    setGoogleAccessToken(null);
    setDriveUser(null);
    setIsDriveConnected(false);
    setDriveVideos([]);
    sessionStorage.removeItem('alo_google_access_token');
    sessionStorage.removeItem('alo_drive_videos_cache');
  }, []);

  // Push state to history
  const pushHistory = useCallback((newProject: Project) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, newProject];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const updateProjectWithHistory = useCallback((updater: (prev: Project) => Project) => {
    setProject((prev) => {
      const next = updater(prev);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  }, [historyIndex, history]);

  // Selected clip helper
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    return project.clips.find((c) => c.id === selectedClipId) || null;
  }, [project.clips, selectedClipId]);

  // Auto-switch inspector tab based on selected clip type
  useEffect(() => {
    if (!selectedClip) {
      setInspectorTab('video');
      return;
    }
    if (selectedClip.type === 'text') {
      setInspectorTab('text');
    } else if (selectedClip.type === 'audio') {
      setInspectorTab('audio');
    } else {
      setInspectorTab('video');
    }
  }, [selectedClip?.type, selectedClip?.id]);

  // Set current time safely
  const setCurrentTime = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(project.duration, time));
    setCurrentTimeState(clamped);
  }, [project.duration]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const rawDelta = (time - lastTimeRef.current) / 1000;
      // Clamp delta to at most 0.08s (80ms) to avoid large time jumps on mobile frame drops or tab throttling
      const delta = Math.min(0.08, Math.max(0, rawDelta));
      lastTimeRef.current = time;

      setCurrentTimeState((prev) => {
        const nextTime = prev + delta;
        if (nextTime >= project.duration) {
          setIsPlaying(false);
          return 0;
        }
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, project.duration]);

  // Update project name
  const updateProjectName = useCallback((name: string) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      name,
      updatedAt: new Date().toISOString(),
    }));
  }, [updateProjectWithHistory]);

  // Set aspect ratio
  const setAspectRatio = useCallback((ratio: AspectRatio) => {
    let width = 1920;
    let height = 1080;
    if (ratio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (ratio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (ratio === '4:5') {
      width = 1080;
      height = 1350;
    } else if (ratio === '21:9') {
      width = 2560;
      height = 1080;
    }

    updateProjectWithHistory((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        aspectRatio: ratio,
        width,
        height,
      },
    }));
  }, [updateProjectWithHistory]);

  // Add clip to track (supports optional targetStartTime for drag & drop onto timeline)
  const addClipToTrack = useCallback((asset: MediaAsset, targetTrackId?: string, targetStartTime?: number) => {
    const trackId = targetTrackId || (asset.type === 'audio' ? 'track_audio_bg' : 'track_video_main');

    const trackClips = project.clips.filter((c) => c.trackId === trackId);
    const endPosition = trackClips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 0);
    const startInTimeline = targetStartTime !== undefined ? Math.max(0, targetStartTime) : Math.max(currentTime, endPosition);
    const clipDuration = asset.duration && asset.duration > 0 ? asset.duration : 10.0;

    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trackId,
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      startInTimeline: parseFloat(startInTimeline.toFixed(3)),
      duration: clipDuration,
      trimStart: 0,
      trimEnd: clipDuration,
      speed: 1.0,
      volume: 1.0,
      transform: { scale: 1, position: { x: 50, y: 50 }, rotation: 0, opacity: 1 },
      filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0 },
    };

    updateProjectWithHistory((prev) => {
      const nextDuration = Math.max(prev.duration, startInTimeline + newClip.duration + 2.0);
      const hasAsset = prev.assets.some((a) => a.id === asset.id);
      return {
        ...prev,
        duration: nextDuration,
        assets: hasAsset ? prev.assets : [asset, ...prev.assets],
        clips: [...prev.clips, newClip],
      };
    });

    setSelectedClipIds([newClip.id]);
  }, [currentTime, project.clips, updateProjectWithHistory]);

  // Open Real Google Picker
  const openGooglePicker = useCallback(() => {
    if (!googleClientId || !googleApiKey) {
      setIsDrivePickerOpen(true);
      return;
    }

    if (!googleAccessToken) {
      requestGoogleAccessToken(
        googleClientId,
        async (token: string) => {
          setGoogleAccessToken(token);
          sessionStorage.setItem('alo_google_access_token', token);
          setIsDriveConnected(true);
          const profile = await fetchGoogleProfile(token);
          if (profile) setDriveUser(profile);

          showGooglePicker({
            apiKey: googleApiKey,
            clientId: googleClientId,
            accessToken: token,
            onPicked: (file: GoogleDriveFile) => {
              const streamUrl = `/api/drive/stream?fileId=${file.id}&token=${token}`;
              const isAudio = file.mimeType.startsWith('audio');
              const newAsset: MediaAsset = {
                id: `asset_drive_${file.id}`,
                name: file.name,
                type: isAudio ? 'audio' : 'video',
                url: streamUrl,
                driveFileId: file.id,
                duration: 15.0,
                isDrive: true,
                thumbnailUrl: file.thumbnailUrl,
                size: file.sizeBytes,
              };

              updateProjectWithHistory((prev) => ({
                ...prev,
                assets: [newAsset, ...prev.assets],
              }));
              addClipToTrack(newAsset);
            },
          });
        },
        (err: any) => {
          alert(`Falha ao conectar com o Google: ${err.message || 'Verifique as credenciais no Google Cloud Console'}`);
        }
      );
      return;
    }

    showGooglePicker({
      apiKey: googleApiKey,
      clientId: googleClientId,
      accessToken: googleAccessToken,
      onPicked: (file: GoogleDriveFile) => {
        const streamUrl = `/api/drive/stream?fileId=${file.id}&token=${googleAccessToken}`;
        const isAudio = file.mimeType.startsWith('audio');
        const newAsset: MediaAsset = {
          id: `asset_drive_${file.id}`,
          name: file.name,
          type: isAudio ? 'audio' : 'video',
          url: streamUrl,
          driveFileId: file.id,
          duration: 15.0,
          isDrive: true,
          thumbnailUrl: file.thumbnailUrl,
          size: file.sizeBytes,
        };

        updateProjectWithHistory((prev) => ({
          ...prev,
          assets: [newAsset, ...prev.assets],
        }));
        addClipToTrack(newAsset);
      },
    }).catch((err) => {
      console.error('Erro ao abrir Google Picker:', err);
      setIsDrivePickerOpen(true);
    });
  }, [googleClientId, googleApiKey, googleAccessToken, updateProjectWithHistory, addClipToTrack]);

  // Add text clip
  const addTextClip = useCallback(() => {
    const newClip: TimelineClip = {
      id: `clip_text_${Date.now()}`,
      trackId: 'track_text',
      name: 'Novo Texto',
      type: 'text',
      startInTimeline: currentTime,
      duration: 4.0,
      trimStart: 0,
      trimEnd: 4.0,
      speed: 1.0,
      volume: 1.0,
      text: 'Texto Estilizado',
      textStyle: {
        fontSize: 36,
        fontFamily: 'Inter',
        fontWeight: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        strokeColor: '#3b82f6',
        strokeWidth: 0,
        textAlign: 'center',
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
      },
      transform: { scale: 1, position: { x: 50, y: 50 }, rotation: 0, opacity: 1 },
      filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0 },
    };

    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));

    setSelectedClipIds([newClip.id]);
  }, [currentTime, updateProjectWithHistory]);

  // Update clip
  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    setProject((prev) => {
      const updatedClips = prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        return {
          ...clip,
          ...updates,
          transform: updates.transform ? { ...clip.transform, ...updates.transform } : clip.transform,
          filters: updates.filters ? { ...clip.filters, ...updates.filters } : clip.filters,
          textStyle: updates.textStyle ? { ...clip.textStyle, ...updates.textStyle } as any : clip.textStyle,
        };
      });

      const maxEnd = updatedClips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 15);
      return {
        ...prev,
        duration: Math.max(maxEnd + 2, 15),
        clips: updatedClips,
      };
    });
  }, []);

  // Delete single clip
  const deleteClip = useCallback((clipId: string) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== clipId),
    }));
    setSelectedClipIds((prev) => prev.filter((id) => id !== clipId));
  }, [updateProjectWithHistory]);

  // Delete all selected clips
  const deleteSelectedClips = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => !selectedClipIds.includes(c.id)),
    }));
    setSelectedClipIds([]);
  }, [selectedClipIds, updateProjectWithHistory]);

  // Split clip at playhead
  const splitClipAtPlayhead = useCallback((targetClipId?: string) => {
    const idToSplit = targetClipId || selectedClipId;
    if (!idToSplit) return;

    const clip = project.clips.find((c) => c.id === idToSplit);
    if (!clip) return;

    const clipStart = clip.startInTimeline;
    const clipEnd = clip.startInTimeline + clip.duration;

    if (currentTime <= clipStart + 0.1 || currentTime >= clipEnd - 0.1) {
      return;
    }

    const splitOffset = currentTime - clipStart;
    const firstDuration = splitOffset;
    const secondDuration = clip.duration - splitOffset;

    const firstClip: TimelineClip = {
      ...clip,
      duration: firstDuration,
      trimEnd: clip.trimStart + (firstDuration * clip.speed),
    };

    const secondClip: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}`,
      startInTimeline: currentTime,
      duration: secondDuration,
      trimStart: clip.trimStart + (firstDuration * clip.speed),
      trimEnd: clip.trimEnd,
    };

    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === idToSplit ? firstClip : c)).concat(secondClip),
    }));

    setSelectedClipIds([secondClip.id]);
  }, [currentTime, project.clips, selectedClipId, updateProjectWithHistory]);

  // Duplicate clip
  const duplicateClip = useCallback((clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) return;

    const newClip: TimelineClip = {
      ...clip,
      id: `clip_${Date.now()}`,
      name: `${clip.name} (Cópia)`,
      startInTimeline: clip.startInTimeline + clip.duration + 0.5,
    };

    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      duration: Math.max(prev.duration, newClip.startInTimeline + newClip.duration + 2),
    }));

    setSelectedClipIds([newClip.id]);
  }, [project.clips, updateProjectWithHistory]);

  // Detach audio from a video clip into an independent audio track
  const detachAudioFromClip = useCallback((clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip || clip.type !== 'video') return;

    // Check if audio track exists or default to track_audio_bg
    const audioTrack = project.tracks.find((t) => t.type === 'audio');
    const audioTrackId = audioTrack ? audioTrack.id : 'track_audio_bg';

    const newAudioClipId = `clip_audio_detached_${Date.now()}`;
    const newAudioClip: TimelineClip = {
      id: newAudioClipId,
      trackId: audioTrackId,
      assetId: clip.assetId,
      name: `🔊 [Áudio] ${clip.name}`,
      type: 'audio',
      startInTimeline: clip.startInTimeline,
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      speed: clip.speed,
      volume: clip.volume !== undefined ? clip.volume : 1.0,
      isMuted: false,
      transform: { scale: 1, position: { x: 50, y: 50 }, rotation: 0, opacity: 1 },
      filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0 },
      transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined,
      transitionOut: clip.transitionOut ? { ...clip.transitionOut } : undefined,
    };

    updateProjectWithHistory((prev) => {
      // Mute the video clip and add the detached audio clip
      const updatedClips = prev.clips.map((c) => {
        if (c.id === clipId) {
          return {
            ...c,
            isMuted: true,
          };
        }
        return c;
      });

      return {
        ...prev,
        clips: [...updatedClips, newAudioClip],
      };
    });

    setSelectedClipIds([newAudioClipId]);
  }, [project.clips, project.tracks, updateProjectWithHistory]);

  // Remove or split silences from a clip (CapCut Auto Cut)
  const removeSilencesFromClip = useCallback(
    (
      clipId: string,
      silenceIntervals: Array<{ startInTimeline: number; endInTimeline: number; duration: number }>,
      mode: 'auto_cut' | 'split_only' = 'auto_cut',
      rippleTrack = true
    ) => {
      const clip = project.clips.find((c) => c.id === clipId);
      if (!clip || silenceIntervals.length === 0) return;

      const clipStart = clip.startInTimeline;
      const clipEnd = clip.startInTimeline + clip.duration;
      const speed = clip.speed || 1.0;

      // Filter and sort silences strictly within the clip boundary
      const validSilences = silenceIntervals
        .map((s) => ({
          start: Math.max(clipStart, Math.min(clipEnd, s.startInTimeline)),
          end: Math.max(clipStart, Math.min(clipEnd, s.endInTimeline)),
          duration: s.duration,
        }))
        .filter((s) => s.end > s.start + 0.08)
        .sort((a, b) => a.start - b.start);

      if (validSilences.length === 0) return;

      // Check for companion clip (e.g. video <-> detached audio)
      const companionClip = project.clips.find(
        (c) =>
          c.id !== clip.id &&
          c.trackId !== clip.trackId &&
          Math.abs(c.startInTimeline - clip.startInTimeline) < 0.1 &&
          Math.abs(c.duration - clip.duration) < 0.1
      );

      if (mode === 'auto_cut') {
        // Compute speech segments to keep
        const keptSegments: Array<{ start: number; end: number }> = [];
        let cursor = clipStart;

        for (const sil of validSilences) {
          if (sil.start > cursor + 0.08) {
            keptSegments.push({ start: cursor, end: sil.start });
          }
          cursor = Math.max(cursor, sil.end);
        }

        if (clipEnd > cursor + 0.08) {
          keptSegments.push({ start: cursor, end: clipEnd });
        }

        if (keptSegments.length === 0) return;

        // Reconstruct spoken clips without silence gaps (Ripple delete)
        let currentTimelinePos = clipStart;
        const newMainClips: TimelineClip[] = [];

        keptSegments.forEach((seg, idx) => {
          const segDuration = seg.end - seg.start;
          const segTrimStart = (clip.trimStart || 0) + (seg.start - clipStart) * speed;
          const segTrimEnd = segTrimStart + segDuration * speed;

          newMainClips.push({
            ...clip,
            id: idx === 0 ? clip.id : `clip_${Date.now()}_cut_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            name: keptSegments.length > 1 ? `${clip.name} (P${idx + 1})` : clip.name,
            startInTimeline: currentTimelinePos,
            duration: segDuration,
            trimStart: segTrimStart,
            trimEnd: segTrimEnd,
          });

          currentTimelinePos += segDuration;
        });

        const totalRemovedDuration = clip.duration - (currentTimelinePos - clipStart);

        // Build companion clips if present
        const newCompanionClips: TimelineClip[] = [];
        if (companionClip) {
          let compPos = companionClip.startInTimeline;
          const compSpeed = companionClip.speed || 1.0;

          keptSegments.forEach((seg, idx) => {
            const segDuration = seg.end - seg.start;
            const segTrimStart = (companionClip.trimStart || 0) + (seg.start - companionClip.startInTimeline) * compSpeed;
            const segTrimEnd = segTrimStart + segDuration * compSpeed;

            newCompanionClips.push({
              ...companionClip,
              id: idx === 0 ? companionClip.id : `clip_${Date.now()}_comp_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              name: keptSegments.length > 1 ? `${companionClip.name} (P${idx + 1})` : companionClip.name,
              startInTimeline: compPos,
              duration: segDuration,
              trimStart: segTrimStart,
              trimEnd: segTrimEnd,
            });

            compPos += segDuration;
          });
        }

        updateProjectWithHistory((prev) => {
          const affectedTrackIds = new Set([clip.trackId]);
          if (companionClip) affectedTrackIds.add(companionClip.trackId);

          const filteredClips = prev.clips
            .filter((c) => c.id !== clip.id && (!companionClip || c.id !== companionClip.id))
            .map((c) => {
              if (rippleTrack && affectedTrackIds.has(c.trackId) && c.startInTimeline >= clipEnd - 0.05) {
                return {
                  ...c,
                  startInTimeline: Math.max(0, c.startInTimeline - totalRemovedDuration),
                };
              }
              return c;
            });

          const finalClips = [...filteredClips, ...newMainClips, ...newCompanionClips];
          const maxEnd = finalClips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 15);

          return {
            ...prev,
            clips: finalClips,
            duration: Math.max(maxEnd + 2, 15),
            updatedAt: new Date().toISOString(),
          };
        });

        setSelectedClipIds(newMainClips.map((c) => c.id));
      } else {
        // Split-only mode: slices clip at silence boundaries without deleting
        const allPoints = new Set<number>();
        validSilences.forEach((s) => {
          if (s.start > clipStart + 0.05 && s.start < clipEnd - 0.05) allPoints.add(s.start);
          if (s.end > clipStart + 0.05 && s.end < clipEnd - 0.05) allPoints.add(s.end);
        });

        const sortedPoints = Array.from(allPoints).sort((a, b) => a - b);
        if (sortedPoints.length === 0) return;

        const bounds = [clipStart, ...sortedPoints, clipEnd];
        const splitClips: TimelineClip[] = [];

        for (let i = 0; i < bounds.length - 1; i++) {
          const segStart = bounds[i];
          const segEnd = bounds[i + 1];
          const segDur = segEnd - segStart;
          if (segDur < 0.05) continue;

          const isSilence = validSilences.some((s) => segStart >= s.start - 0.05 && segEnd <= s.end + 0.05);
          const segTrimStart = (clip.trimStart || 0) + (segStart - clipStart) * speed;
          const segTrimEnd = segTrimStart + segDur * speed;

          splitClips.push({
            ...clip,
            id: i === 0 ? clip.id : `clip_${Date.now()}_split_${i}_${Math.random().toString(36).substring(2, 6)}`,
            name: isSilence ? `[Silêncio] ${segDur.toFixed(1)}s` : `${clip.name} (P${i + 1})`,
            startInTimeline: segStart,
            duration: segDur,
            trimStart: segTrimStart,
            trimEnd: segTrimEnd,
          });
        }

        updateProjectWithHistory((prev) => ({
          ...prev,
          clips: prev.clips.filter((c) => c.id !== clip.id).concat(splitClips),
          updatedAt: new Date().toISOString(),
        }));

        setSelectedClipIds(splitClips.map((c) => c.id));
      }
    },
    [project.clips, updateProjectWithHistory, setSelectedClipIds]
  );

  // Add asset
  const addAsset = useCallback((asset: MediaAsset) => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      assets: prev.assets.some((a) => a.id === asset.id) ? prev.assets : [asset, ...prev.assets],
    }));
  }, [updateProjectWithHistory]);

  // Start fresh empty project
  const newProject = useCallback(() => {
    const emptyProject: Project = {
      id: `proj_${Date.now()}`,
      name: 'Meu Novo Projeto',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      duration: 30,
      settings: {
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: '16:9',
      },
      tracks: [
        { id: 'track_text', name: 'Texto & Títulos', type: 'text', isMuted: false, isLocked: false, isHidden: false, order: 0 },
        { id: 'track_video_main', name: 'Vídeo Principal', type: 'video', isMuted: false, isLocked: false, isHidden: false, order: 1 },
        { id: 'track_video_overlay', name: 'Sobreposição (B-Roll)', type: 'video', isMuted: false, isLocked: false, isHidden: false, order: 2 },
        { id: 'track_audio_bg', name: 'Trilha Sonora', type: 'audio', isMuted: false, isLocked: false, isHidden: false, order: 3 },
      ],
      clips: [],
      assets: [],
    };
    setProject(emptyProject);
    setHistory([emptyProject]);
    setHistoryIndex(0);
    setCurrentTimeState(0);
    setSelectedClipIds([]);
    try {
      localStorage.setItem('alo_editor_project', JSON.stringify(emptyProject));
    } catch {}
  }, []);

  // Clear timeline clips while keeping settings
  const clearTimeline = useCallback(() => {
    updateProjectWithHistory((prev) => ({
      ...prev,
      clips: [],
      duration: 30,
    }));
    setSelectedClipIds([]);
    setCurrentTimeState(0);
  }, [updateProjectWithHistory]);

  // Real Save Project to Drive and Local
  const saveProjectToDrive = useCallback(async () => {
    setIsSavingToDrive(true);
    try {
      // Salva localmente de forma explícita
      localStorage.setItem('alo_editor_project', JSON.stringify(project));
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem('alo_editor_last_saved', nowStr);
      setLastSavedAt(nowStr);

      if (googleAccessToken) {
        const result = await saveProjectJsonToDrive({
          accessToken: googleAccessToken,
          project,
        });
        setProject((prev) => ({ ...prev, driveFileId: result.fileId }));
        alert(`Projeto "${project.name}" salvo com sucesso no Google Drive e no navegador!`);
      } else {
        alert(`Projeto "${project.name}" salvo localmente no navegador com sucesso!`);
      }
    } catch (err: any) {
      console.error('Erro ao salvar projeto:', err);
      alert(`Falha ao salvar: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSavingToDrive(false);
    }
  }, [googleAccessToken, project]);

  // Load an existing Project (switches current workspace seamlessly)
  const loadProject = useCallback((newProj: Project) => {
    setProject(newProj);
    setHistory([newProj]);
    setHistoryIndex(0);
    projectRef.current = newProj;
    setCurrentTimeState(0);
    if (newProj.clips.length > 0) {
      setSelectedClipIds([newProj.clips[0].id]);
    } else {
      setSelectedClipIds([]);
    }
    syncProjectToLocalIndex(newProj);
    try {
      localStorage.setItem('alo_editor_project', JSON.stringify(newProj));
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedAt(nowStr);
      localStorage.setItem('alo_editor_last_saved', nowStr);
    } catch {}
    setIsProjectsModalOpen(false);
  }, [syncProjectToLocalIndex]);

  // Delete a local project from index and storage
  const deleteLocalProject = useCallback((id: string) => {
    try {
      localStorage.removeItem(`alo_project_${id}`);
      const indexRaw = localStorage.getItem('alo_editor_projects_index');
      if (indexRaw) {
        const index: SavedProjectMeta[] = JSON.parse(indexRaw);
        const filtered = index.filter((p) => p.id !== id);
        localStorage.setItem('alo_editor_projects_index', JSON.stringify(filtered));
        setLocalProjects(filtered);
      }
    } catch (e) {
      console.error('Erro ao deletar projeto local:', e);
    }
  }, []);

  // Duplicate an existing project
  const duplicateLocalProject = useCallback((id: string) => {
    try {
      let targetProj: Project | null = null;
      if (id === project.id) {
        targetProj = project;
      } else {
        const raw = localStorage.getItem(`alo_project_${id}`);
        if (raw) targetProj = JSON.parse(raw);
      }
      if (!targetProj) return;

      const newId = `project_${Date.now()}`;
      const duplicated: Project = {
        ...targetProj,
        id: newId,
        name: `${targetProj.name} (Cópia)`,
        driveFileId: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`alo_project_${newId}`, JSON.stringify(duplicated));
      syncProjectToLocalIndex(duplicated);
    } catch (e) {
      console.error('Erro ao duplicar projeto:', e);
    }
  }, [project, syncProjectToLocalIndex]);

  // Export current project as .alo.json
  const exportProjectAsJson = useCallback(() => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${project.name.replace(/[/\\?%*:|"<>]/g, '_')}.alo.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error('Erro ao exportar arquivo de projeto:', e);
      alert('Erro ao exportar o arquivo do projeto.');
    }
  }, [project]);

  // Import a .alo.json file from user computer
  const importProjectFromJson = useCallback(async (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (!parsed || !Array.isArray(parsed.clips) || !Array.isArray(parsed.tracks) || !parsed.settings) {
            alert('Arquivo inválido. O arquivo selecionado não é um projeto válido do AlôEditor (.alo.json).');
            resolve(false);
            return;
          }
          const importedProject: Project = {
            ...parsed,
            id: parsed.id || `project_${Date.now()}`,
            name: parsed.name || file.name.replace('.alo.json', '').replace('.json', ''),
            updatedAt: new Date().toISOString(),
          };
          loadProject(importedProject);
          alert(`Projeto "${importedProject.name}" importado e aberto com sucesso!`);
          resolve(true);
        } catch (err: any) {
          console.error('Erro ao importar arquivo:', err);
          alert('Erro ao ler o arquivo JSON: ' + (err?.message || 'Arquivo corrompido'));
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }, [loadProject]);

  // List all .alo.json projects in Google Drive
  const loadDriveProjectsList = useCallback(async () => {
    if (!googleAccessToken) {
      setIsDrivePickerOpen(true);
      return;
    }
    setIsDriveProjectsLoading(true);
    try {
      const files = await listProjectFilesFromDrive(googleAccessToken);
      setDriveProjects(files);
    } catch (e: any) {
      console.error('Erro ao listar projetos do Drive:', e);
      alert(e?.message || 'Erro ao carregar projetos do Google Drive');
    } finally {
      setIsDriveProjectsLoading(false);
    }
  }, [googleAccessToken, setIsDrivePickerOpen]);

  // Load project JSON directly from Google Drive
  const loadProjectFromDrive = useCallback(async (fileId: string) => {
    if (!googleAccessToken) return;
    setIsDriveProjectsLoading(true);
    try {
      const projData = await loadProjectJsonFromDrive(googleAccessToken, fileId);
      if (projData && Array.isArray(projData.clips) && Array.isArray(projData.tracks)) {
        projData.driveFileId = fileId;
        loadProject(projData);
        alert(`Projeto "${projData.name}" carregado com sucesso do Google Drive!`);
      } else {
        alert('O arquivo selecionado no Google Drive não contém a estrutura de projeto válida.');
      }
    } catch (e: any) {
      console.error('Erro ao carregar projeto do Drive:', e);
      alert('Falha ao abrir projeto do Drive: ' + (e?.message || 'Erro desconhecido'));
    } finally {
      setIsDriveProjectsLoading(false);
    }
  }, [googleAccessToken, loadProject]);

  const toggleSnapping = useCallback(() => {
    setIsSnappingEnabled((prev) => !prev);
  }, []);

  // Keyboard shortcuts listener (<kbd>Cmd+A</kbd>, <kbd>Space</kbd>, <kbd>S</kbd>, <kbd>Delete</kbd>, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Cmd+A / Ctrl+A -> Selecionar todos os clipes da timeline
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllClips();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        splitClipAtPlayhead();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        deleteSelectedClips();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault();
        if (selectedClipId) duplicateClip(selectedClipId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, splitClipAtPlayhead, deleteSelectedClips, selectedClipId, selectAllClips, undo, redo, duplicateClip]);

  return (
    <EditorContext.Provider
      value={{
        project,
        currentTime,
        isPlaying,
        selectedClipId,
        selectedClipIds,
        selectedClip,
        sidebarTab,
        inspectorTab,
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
        isInspectorOpen,
        setIsInspectorOpen,
        toggleInspector,
        mobileView,
        setMobileView,
        zoom,
        isSnappingEnabled,
        snapGuideTime,
        setSnapGuideTime,
        isDriveConnected,
        driveUser,
        isSavingToDrive,
        lastSavedAt,
        isExportModalOpen,
        isShortcutsModalOpen,
        isDrivePickerOpen,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,

        isLoading,
        loadingMessage,
        setIsLoading,

        driveVideos,
        isDriveLoading,
        loadDriveVideos,

        googleAccessToken,
        googleClientId,
        googleApiKey,
        setGoogleCredentials,
        loginWithGoogle,
        logoutGoogle,
        openGooglePicker,

        setCurrentTime,
        setIsPlaying,
        togglePlay,
        setSelectedClipId,
        setSelectedClipIds,
        selectClip,
        selectAllClips,
        clearSelection,
        setSidebarTab,
        setInspectorTab,
        setZoom,
        toggleSnapping,
        updateProjectName,
        setAspectRatio,
        addClipToTrack,
        addTextClip,
        updateClip,
        deleteClip,
        deleteSelectedClips,
        splitClipAtPlayhead,
        duplicateClip,
        detachAudioFromClip,
        addAsset,
        newProject,
        clearTimeline,
        saveProjectToDrive,
        isProjectsModalOpen,
        setIsProjectsModalOpen,
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
        setIsExportModalOpen,
        setIsShortcutsModalOpen,
        setIsDrivePickerOpen,
        isSilenceModalOpen,
        setIsSilenceModalOpen,
        removeSilencesFromClip,
        undo,
        redo,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
};
