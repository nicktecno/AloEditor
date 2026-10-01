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
  PlaybackQuality,
  BackgroundDownloadItem,
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
import { GENERIC_VIDEO_THUMBNAIL, captureVideoThumbnail } from '@/utils/thumbnailGenerator';
import { getCachedDriveVideoUrl, preloadDriveVideo, evictCachedVideo, clearAllDriveCache, cacheLocalVideoBlob } from '@/services/driveVideoCache';

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
  previewQuality: PlaybackQuality;
  setPreviewQuality: (quality: PlaybackQuality) => void;
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
  isRelinkModalOpen: boolean;
  setIsRelinkModalOpen: (open: boolean) => void;
  relinkAssetsFromFiles: (files: FileList | File[], targetAssetId?: string) => Promise<{ reconnectedCount: number; notFoundCount: number }>;
  offlineAssetsCount: number;
  markAssetOffline: (assetId: string) => void;
  isDriveAuthNeeded: boolean;
  markAssetAuthExpired: (assetId: string, expired?: boolean) => void;
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
  refreshGoogleToken: (interactive?: boolean) => Promise<string | null>;
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
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  toggleSnapping: () => void;
  updateProjectName: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  addClipToTrack: (asset: MediaAsset, trackId?: string, targetStartTime?: number) => void;
  addTextClip: () => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>, recordHistory?: boolean) => void;
  commitHistory: () => void;
  deleteClip: (clipId: string) => void;
  deleteSelectedClips: () => void;
  splitClipAtPlayhead: (clipId?: string) => void;
  duplicateClip: (clipId: string) => void;
  detachAudioFromClip: (clipId: string) => void;
  addAsset: (asset: MediaAsset) => void;
  importDriveAssetToMemory: (
    file: GoogleDriveFile,
    options?: { addToTimeline?: boolean; targetTrackId?: string; targetStartTime?: number }
  ) => Promise<MediaAsset | null>;
  removeAsset: (assetId: string, deleteAssociatedClips?: boolean) => void;
  updateAssetThumbnail: (assetId: string, thumbnailUrl: string) => void;
  syncMediaDuration: (assetId: string, realDuration: number) => void;
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
  backgroundDownloads: BackgroundDownloadItem[];
  newProject: () => void;
  clearTimeline: () => void;
  undo: () => void;
  redo: () => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const CLOUDFLARE_WORKER_DEFAULT_URL = 'https://aloeditor-drive-proxy.aloeditor-drive-proxy.workers.dev';

// Utilitário centralizado para montar URLs de streaming do Google Drive via Cloudflare Worker gratuito (Zero Egress)
export function getDriveStreamUrl(fileId: string, token?: string | null): string {
  const activeToken =
    (token && token !== 'null' && token !== 'undefined' && token.length > 10 ? token : null) ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
      : null);

  const workerBase =
    process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL ||
    (typeof window !== 'undefined' ? localStorage.getItem('alo_cloudflare_worker_url') : '') ||
    CLOUDFLARE_WORKER_DEFAULT_URL;

  const baseUrl = (workerBase || CLOUDFLARE_WORKER_DEFAULT_URL).replace(/\/$/, '');
  const query = activeToken
    ? `fileId=${fileId}&token=${encodeURIComponent(activeToken)}`
    : `fileId=${fileId}`;

  return `${baseUrl}?${query}`;
}

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
  const [previewQuality, setPreviewQuality] = useState<PlaybackQuality>('low'); // Padrão leve e rápido
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

  const googleClientIdRef = useRef(googleClientId);
  googleClientIdRef.current = googleClientId;
  const driveUserRef = useRef(driveUser);
  driveUserRef.current = driveUser;
  const isRefreshingTokenRef = useRef(false);

  // Projects Management state
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [localProjects, setLocalProjects] = useState<SavedProjectMeta[]>([]);
  const [driveProjects, setDriveProjects] = useState<Array<{ id: string; name: string; modifiedTime: string; size?: string; webViewLink?: string }>>([]);
  const [isDriveProjectsLoading, setIsDriveProjectsLoading] = useState(false);
  const [backgroundDownloads, setBackgroundDownloads] = useState<BackgroundDownloadItem[]>([]);

  // Helper to remove ephemeral blob: URLs before saving to localStorage
  const sanitizeProjectForStorage = useCallback((proj: Project): Project => {
    return {
      ...proj,
      assets: (proj.assets || []).map((a) => ({
        ...a,
        // Blob URLs are strictly session-bound and become dead memory pointers on browser reload
        proxyUrl: a.proxyUrl?.startsWith('blob:') ? undefined : a.proxyUrl,
      })),
    };
  }, []);

  // Synchronize a project into the local projects index and individual slot
  const syncProjectToLocalIndex = useCallback((proj: Project) => {
    try {
      const sanitized = sanitizeProjectForStorage(proj);
      localStorage.setItem(`alo_project_${proj.id}`, JSON.stringify(sanitized));
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
  }, [sanitizeProjectForStorage]);

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
          // Invalidate any dead blob URLs from previous browser sessions and reset false isDrive on local sample assets
          parsed.assets = (parsed.assets || []).map((asset) => {
            const isLocalSample = asset.url?.startsWith('/samples/') || asset.url?.includes('flower.mp4') || asset.url?.includes('interview.mp4');
            return {
              ...asset,
              isDrive: isLocalSample ? false : asset.isDrive,
              driveFileId: isLocalSample ? undefined : asset.driveFileId,
              proxyUrl: asset.proxyUrl?.startsWith('blob:') ? undefined : asset.proxyUrl,
            };
          });
          // Clean up any obsolete empty track_audio_main since audio is integrated on media tracks
          parsed.tracks = parsed.tracks.filter(
            (t) => t.id !== 'track_audio_main' || parsed.clips.some((c) => c.trackId === 'track_audio_main')
          );
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
      const sanitized = sanitizeProjectForStorage(project);
      localStorage.setItem('alo_editor_project', JSON.stringify(sanitized));
      const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedAt(nowStr);
      localStorage.setItem('alo_editor_last_saved', nowStr);
      syncProjectToLocalIndex(sanitized);
    } catch (e) {
      console.warn('Erro ao auto-salvar projeto no localStorage:', e);
    }
  }, [project, isHydrated, syncProjectToLocalIndex, sanitizeProjectForStorage]);

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
  const [isRelinkModalOpen, setIsRelinkModalOpen] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const projectRef = useRef<Project>(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Check health of local asset URLs on initial project load/hydration
  useEffect(() => {
    if (!isHydrated) return;

    let isCancelled = false;

    const checkLocalAssets = async () => {
      const localAssets = project.assets.filter((a) => !a.isDrive);
      if (localAssets.length === 0) return;

      const offlineIds: string[] = [];

      for (const asset of localAssets) {
        if (!asset.url) {
          offlineIds.push(asset.id);
          continue;
        }
        if (asset.url.startsWith('blob:')) {
          try {
            // Blob URLs only support GET in browsers; HEAD method throws TypeError and incorrectly marks media offline
            const res = await fetch(asset.url);
            if (!res.ok) {
              offlineIds.push(asset.id);
            }
          } catch {
            offlineIds.push(asset.id);
          }
        }
      }

      if (isCancelled || offlineIds.length === 0) return;

      setProject((prev) => {
        let changed = false;
        const newAssets = prev.assets.map((a) => {
          if (offlineIds.includes(a.id) && !a.isOffline) {
            changed = true;
            return { ...a, isOffline: true };
          }
          return a;
        });
        if (!changed) return prev;
        return { ...prev, assets: newAssets };
      });
    };

    checkLocalAssets();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, project.id]);

  const activeCachingTasks = useRef<Set<string>>(new Set());

  // Inicia cache e pré-carregamento imediato no navegador para vídeos (Google Drive ou Local)
  const startAssetCaching = useCallback(
    async (asset: MediaAsset) => {
      if (asset.type !== 'video') return;

      const isMobile =
        typeof window !== 'undefined' &&
        /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
      if (isMobile) return; // No mobile: streaming nativo leve e instantâneo via Range requests

      const cacheKey = asset.driveFileId || asset.id;
      if (activeCachingTasks.current.has(cacheKey)) return;

      // 1. Verifica se já está presente no cache local (RAM ou IndexedDB)
      try {
        const cachedUrl = await getCachedDriveVideoUrl(cacheKey);
        if (cachedUrl) {
          setProject((prev) => ({
            ...prev,
            assets: prev.assets.map((a) =>
              a.id === asset.id
                ? {
                    ...a,
                    proxyUrl: cachedUrl,
                    preloadProgress: 100,
                    status: 'ready',
                    isAuthExpired: false,
                    isOffline: false,
                  }
                : a
            ),
          }));
          return;
        }
      } catch {}

      const activeToken =
        googleAccessToken ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
          : null);

      activeCachingTasks.current.add(cacheKey);

      // 2. Se for vídeo do Google Drive
      if (asset.isDrive && asset.driveFileId) {
        try {
          const blobUrl = await preloadDriveVideo({
            fileId: asset.driveFileId,
            streamUrl: asset.url,
            token: activeToken,
            onProgress: () => {},
          });

          if (blobUrl && blobUrl.startsWith('blob:')) {
            setProject((prev) => ({
              ...prev,
              assets: prev.assets.map((a) =>
                a.id === asset.id
                  ? {
                      ...a,
                      proxyUrl: blobUrl,
                      preloadProgress: 100,
                      status: 'ready',
                      isAuthExpired: false,
                      isOffline: false,
                    }
                  : a
              ),
            }));
          }
        } catch (err: any) {
          console.warn('Cache local em background não concluiu, mantendo reprodução via streaming:', err?.message);
        } finally {
          activeCachingTasks.current.delete(cacheKey);
        }
      } else if (!asset.isDrive && asset.url) {
        // Vídeo local: persiste em cache IndexedDB para não perder referência e dar suporte a busca em 0ms
        try {
          const res = await fetch(asset.url);
          const blob = await res.blob();
          const cachedBlobUrl = await cacheLocalVideoBlob(asset.id, blob);
          setProject((prev) => ({
            ...prev,
            assets: prev.assets.map((a) =>
              a.id === asset.id
                ? { ...a, proxyUrl: cachedBlobUrl, preloadProgress: 100, status: 'ready' }
                : a
            ),
          }));
        } catch (e) {
          console.warn('Indexação de vídeo local em background finalizada:', e);
        } finally {
          activeCachingTasks.current.delete(cacheKey);
        }
      } else {
        activeCachingTasks.current.delete(cacheKey);
      }
    },
    [googleAccessToken]
  );

  // Monitora mídias pendentes de cache no projeto e inicia download progressivo imediatamente
  useEffect(() => {
    if (!isHydrated) return;
    const isMobile =
      typeof window !== 'undefined' &&
      /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
    if (isMobile) return; // No mobile: streaming nativo leve e instantâneo via Range requests

    const uncachedVideos = project.assets.filter(
      (a) =>
        a.type === 'video' &&
        (!a.proxyUrl || a.status === 'importing' || ((a.preloadProgress ?? 0) < 100 && !a.isAuthExpired))
    );
    uncachedVideos.forEach((asset) => {
      startAssetCaching(asset);
    });
  }, [isHydrated, project.assets, startAssetCaching]);

  const isDriveAuthNeeded = useMemo(() => {
    return project.assets.some((a) => a.isDrive && (a.isAuthExpired || (!a.proxyUrl && !googleAccessToken)));
  }, [project.assets, googleAccessToken]);

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
    const token =
      sessionStorage.getItem('alo_google_access_token') ||
      localStorage.getItem('alo_google_access_token') ||
      googleAccessToken;
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



  // Atualiza URLs de streaming de mídias do Drive para o novo token e reativa reprodução
  const updateDriveAssetsToken = useCallback((newToken: string | null) => {
    setProject((prev) => {
      const hasDriveAssets = prev.assets.some((a) => a.isDrive);
      if (!hasDriveAssets) return prev;

      const updated = prev.assets.map((a) => {
        if (!a.isDrive || !a.driveFileId) return a;
        const newUrl = getDriveStreamUrl(a.driveFileId, newToken);
        return {
          ...a,
          url: newUrl,
          isAuthExpired: false, // Sempre reativa mídias do Drive
          isOffline: false,
        };
      });

      return { ...prev, assets: updated };
    });
  }, []);

  const markAssetAuthExpired = useCallback((assetId: string, expired = true) => {
    setProject((prev) => {
      const asset = prev.assets.find((a) => a.id === assetId);
      if (!asset || asset.isAuthExpired === expired) return prev;
      return {
        ...prev,
        assets: prev.assets.map((a) => (a.id === assetId ? { ...a, isAuthExpired: expired } : a)),
      };
    });
  }, []);

  const OAUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de sessão contínua

  // Renovação de token de acesso Google (suporta modo silencioso em segundo plano)
  const refreshGoogleToken = useCallback(
    (interactive = false): Promise<string | null> => {
      const clientId = googleClientIdRef.current || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
      if (!clientId) return Promise.resolve(null);
      if (isRefreshingTokenRef.current) return Promise.resolve(null);

      isRefreshingTokenRef.current = true;
      const userEmail = driveUserRef.current?.email || undefined;

      return new Promise((resolve) => {
        requestGoogleAccessToken(
          clientId,
          async (newToken: string, expiresIn?: number) => {
            isRefreshingTokenRef.current = false;
            const ttl = expiresIn ? expiresIn * 1000 : 3600 * 1000;
            const tokenExpiresAt = Date.now() + ttl;
            const sessionExpiresAt = Date.now() + OAUTH_SESSION_TTL_MS; // Estende os 24h a cada renovação

            setGoogleAccessToken(newToken);
            setIsDriveConnected(true);

            try {
              localStorage.setItem('alo_google_access_token', newToken);
              sessionStorage.setItem('alo_google_access_token', newToken);
              localStorage.setItem('alo_google_token_expires_at', String(tokenExpiresAt));
              localStorage.setItem('alo_session_expires_at', String(sessionExpiresAt));
            } catch {}

            updateDriveAssetsToken(newToken);

            // Se o perfil ainda não estiver carregado, busca e persiste
            if (!driveUserRef.current) {
              const profile = await fetchGoogleProfile(newToken);
              if (profile) {
                setDriveUser(profile);
                try {
                  localStorage.setItem('alo_session_user', JSON.stringify(profile));
                } catch {}
              }
            }

            resolve(newToken);
          },
          (err: any) => {
            isRefreshingTokenRef.current = false;
            console.warn('Tentativa de renovação do token Google:', err?.message || err);
            if (interactive) {
              alert('Não foi possível renovar a conexão com o Google Drive. Por favor, conecte novamente.');
            }
            resolve(null);
          },
          {
            prompt: interactive ? 'select_account' : '',
            hint: userEmail,
          }
        );
      });
    },
    [updateDriveAssetsToken]
  );

  // Carrega credenciais e restaura sessão de 24h no mount
  useEffect(() => {
    loadGoogleScripts().catch(() => {});

    const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    const envApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

    const savedClientId = localStorage.getItem('alo_google_client_id') || envClientId;
    const savedApiKey = localStorage.getItem('alo_google_api_key') || envApiKey;

    if (savedClientId) setGoogleClientId(savedClientId);
    if (savedApiKey && !savedApiKey.startsWith('GOCSPX')) setGoogleApiKey(savedApiKey);

    if (typeof window === 'undefined') return;

    const savedToken =
      localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token');
    const sessionExpiresAt = Number(localStorage.getItem('alo_session_expires_at') || 0);
    const savedUserRaw = localStorage.getItem('alo_session_user');

    if (savedToken && savedToken !== 'null' && savedToken !== 'undefined' && savedToken.length > 10) {
      // 1. Há um token salvo no navegador: ativa imediatamente e protege a sessão de 24h
      setGoogleAccessToken(savedToken);
      setIsDriveConnected(true);
      updateDriveAssetsToken(savedToken);

      // Garante que a sessão 24h esteja gravada
      if (!sessionExpiresAt || sessionExpiresAt <= Date.now()) {
        localStorage.setItem('alo_session_expires_at', String(Date.now() + OAUTH_SESSION_TTL_MS));
      }

      if (savedUserRaw) {
        try {
          const user = JSON.parse(savedUserRaw);
          setDriveUser(user);
        } catch {}
      }

      loadDriveVideos(false).catch(() => {});

      // Valida silenciosamente em segundo plano
      fetchGoogleProfile(savedToken)
        .then((profile) => {
          if (profile) {
            setDriveUser(profile);
            try {
              localStorage.setItem('alo_session_user', JSON.stringify(profile));
            } catch {}
          } else {
            // Se o token expirou no Google, renova silenciosamente sem desconectar
            refreshGoogleToken(false).catch(() => {});
          }
        })
        .catch(() => {
          refreshGoogleToken(false).catch(() => {});
        });
    } else if (sessionExpiresAt > Date.now() && savedUserRaw) {
      // Sessão de 24h ativa mas sem token salvo: restaura usuário e busca token silenciosamente
      try {
        const user = JSON.parse(savedUserRaw);
        setDriveUser(user);
        setIsDriveConnected(true);
      } catch {}
      refreshGoogleToken(false).catch(() => {});
    } else if (sessionExpiresAt > 0 && sessionExpiresAt <= Date.now()) {
      // Somente se passou das 24h: limpa
      try {
        localStorage.removeItem('alo_google_access_token');
        localStorage.removeItem('alo_google_token_expires_at');
        localStorage.removeItem('alo_session_expires_at');
        localStorage.removeItem('alo_session_user');
        sessionStorage.removeItem('alo_google_access_token');
      } catch {}
      setGoogleAccessToken(null);
      setDriveUser(null);
      setIsDriveConnected(false);
    }
  }, [loadDriveVideos, updateDriveAssetsToken, refreshGoogleToken]);

  // Mantém a sessão ativa por 24h com renovação proativa antes da expiração
  useEffect(() => {
    const checkAndAutoRenew = () => {
      if (typeof window === 'undefined') return;
      const sessionExpiresAt = Number(localStorage.getItem('alo_session_expires_at') || 0);
      if (!sessionExpiresAt || Date.now() >= sessionExpiresAt) return;

      const tokenExpiresAt = Number(localStorage.getItem('alo_google_token_expires_at') || 0);
      // Se faltam menos de 10 minutos para expirar o access token:
      if (Date.now() >= tokenExpiresAt - 10 * 60 * 1000) {
        refreshGoogleToken(false).catch(() => {});
      }
    };

    // Checa a cada 3 minutos
    const interval = setInterval(checkAndAutoRenew, 3 * 60 * 1000);

    // Também renova quando o usuário volta para a aba
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAndAutoRenew();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkAndAutoRenew);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkAndAutoRenew);
    };
  }, [refreshGoogleToken]);

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
      async (token: string, expiresIn?: number) => {
        const ttl = expiresIn ? expiresIn * 1000 : 3600 * 1000;
        const tokenExpiresAt = Date.now() + ttl;
        const sessionExpiresAt = Date.now() + OAUTH_SESSION_TTL_MS; // 24 HORAS

        setGoogleAccessToken(token);
        setIsDriveConnected(true);

        try {
          localStorage.setItem('alo_google_access_token', token);
          sessionStorage.setItem('alo_google_access_token', token);
          localStorage.setItem('alo_google_token_expires_at', String(tokenExpiresAt));
          localStorage.setItem('alo_session_expires_at', String(sessionExpiresAt));
        } catch {}

        updateDriveAssetsToken(token);
        const profile = await fetchGoogleProfile(token);
        if (profile) {
          setDriveUser(profile);
          try {
            localStorage.setItem('alo_session_user', JSON.stringify(profile));
          } catch {}
        }
        loadDriveVideos(false).catch(() => {});
      },
      (err: any) => {
        console.error('Erro na autenticação do Google:', err);
        alert(`Erro na autenticação do Google: ${err.message || 'Verifique se o Client ID está correto e autoriza a origem atual'}`);
      },
      { prompt: 'select_account' }
    );
  }, [googleClientId, loadDriveVideos, updateDriveAssetsToken]);

  // Logout Google
  const logoutGoogle = useCallback(() => {
    setGoogleAccessToken(null);
    setDriveUser(null);
    setIsDriveConnected(false);
    setDriveVideos([]);
    try {
      localStorage.removeItem('alo_google_access_token');
      localStorage.removeItem('alo_google_token_expires_at');
      localStorage.removeItem('alo_session_expires_at');
      localStorage.removeItem('alo_session_user');
      sessionStorage.removeItem('alo_google_access_token');
      sessionStorage.removeItem('alo_drive_videos_cache');
    } catch {}
    // Para mídias do Drive sem cache persistido no navegador:
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((a) =>
        a.isDrive && !a.proxyUrl ? { ...a, isAuthExpired: true } : a
      ),
    }));
  }, []);

  const MAX_UNDO_LIMIT = 25; // Até no máximo 25 ações de reversão
  const MAX_HISTORY_STATES = MAX_UNDO_LIMIT + 1; // 26 estados (1 base + até 25 ações revertíveis)

  const historyRef = useRef<Project[]>([INITIAL_PROJECT]);
  const historyIndexRef = useRef<number>(0);
  const historyDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Push state to history (limita a no máximo 25 ações de reversão e descarta as mais antigas)
  const pushHistory = useCallback((newProject: Project) => {
    setHistory((prev) => {
      const curIndex = historyIndexRef.current;
      const currentProj = prev[curIndex];

      // Evita duplicar estado idêntico se nada tiver mudado
      if (currentProj && currentProj === newProject) {
        return prev;
      }
      if (
        currentProj &&
        currentProj.clips.length === newProject.clips.length &&
        currentProj.tracks.length === newProject.tracks.length &&
        currentProj.duration === newProject.duration &&
        currentProj.clips.every((c, idx) => {
          const oc = newProject.clips[idx];
          return (
            oc &&
            c.id === oc.id &&
            c.startInTimeline === oc.startInTimeline &&
            c.duration === oc.duration &&
            c.trimStart === oc.trimStart &&
            c.trimEnd === oc.trimEnd &&
            c.speed === oc.speed &&
            c.volume === oc.volume &&
            c.isMuted === oc.isMuted &&
            c.text === oc.text &&
            c.transform?.scale === oc.transform?.scale &&
            c.transform?.position?.x === oc.transform?.position?.x &&
            c.transform?.position?.y === oc.transform?.position?.y &&
            c.transform?.rotation === oc.transform?.rotation &&
            c.transform?.opacity === oc.transform?.opacity
          );
        })
      ) {
        return prev;
      }

      // Descarta qualquer futuro de redo à frente do índice atual
      const validSlice = prev.slice(0, curIndex + 1);
      const combined = [...validSlice, newProject];

      // Se ultrapassar 25 ações de reversão (26 estados), remove os mais antigos do início
      if (combined.length > MAX_HISTORY_STATES) {
        const trimmed = combined.slice(combined.length - MAX_HISTORY_STATES);
        const newIdx = trimmed.length - 1;
        historyRef.current = trimmed;
        historyIndexRef.current = newIdx;
        setHistoryIndex(newIdx);
        return trimmed;
      }

      const newIdx = combined.length - 1;
      historyRef.current = combined;
      historyIndexRef.current = newIdx;
      setHistoryIndex(newIdx);
      return combined;
    });
  }, []);

  const commitHistory = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    setProject((prev) => {
      projectRef.current = prev;
      pushHistory(prev);
      return prev;
    });
  }, [pushHistory]);

  const updateProjectWithHistory = useCallback((updater: (prev: Project) => Project) => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    setProject((prev) => {
      const next = updater(prev);
      projectRef.current = next;
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    const curIdx = historyIndexRef.current;
    const curHistory = historyRef.current;
    if (curIdx > 0) {
      const newIndex = curIdx - 1;
      const targetProject = curHistory[newIndex];
      if (targetProject) {
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        setProject(targetProject);
        projectRef.current = targetProject;
        try {
          localStorage.setItem('alo_editor_project', JSON.stringify(targetProject));
        } catch {}

        if (targetProject.clips.length > 0) {
          setSelectedClipIds((prev) => {
            const valid = prev.filter((id) => targetProject.clips.some((c) => c.id === id));
            return valid.length > 0 ? valid : [targetProject.clips[0].id];
          });
        } else {
          setSelectedClipIds([]);
        }
      }
    }
  }, []);

  const redo = useCallback(() => {
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    const curIdx = historyIndexRef.current;
    const curHistory = historyRef.current;
    if (curIdx < curHistory.length - 1) {
      const newIndex = curIdx + 1;
      const targetProject = curHistory[newIndex];
      if (targetProject) {
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        setProject(targetProject);
        projectRef.current = targetProject;
        try {
          localStorage.setItem('alo_editor_project', JSON.stringify(targetProject));
        } catch {}

        if (targetProject.clips.length > 0) {
          setSelectedClipIds((prev) => {
            const valid = prev.filter((id) => targetProject.clips.some((c) => c.id === id));
            return valid.length > 0 ? valid : [targetProject.clips[0].id];
          });
        } else {
          setSelectedClipIds([]);
        }
      }
    }
  }, []);

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

  const currentTimeRef = useRef(0);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Set current time safely
  const setCurrentTime = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(project.duration, time));
    currentTimeRef.current = clamped;
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
      // Clamp delta to at most 0.08s (80ms) to avoid large time jumps on frame drops or throttling
      const delta = Math.min(0.08, Math.max(0, rawDelta));
      lastTimeRef.current = time;

      const curTime = currentTimeRef.current;
      const nextTime = curTime + delta;
      if (nextTime >= projectRef.current.duration) {
        setIsPlaying(false);
        setCurrentTime(0);
        return;
      } else {
        setCurrentTime(nextTime);
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, setCurrentTime]);

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
    const isVideo = asset.type === 'video';
    const isAudio = asset.type === 'audio';

    const assetWithThumb: MediaAsset = {
      ...asset,
      thumbnailUrl: asset.thumbnailUrl || (isVideo ? GENERIC_VIDEO_THUMBNAIL : undefined),
    };

    // Check if there are any video clips currently on the timeline
    const hasVideoClips = project.clips.some(
      (c) => c.type === 'video' || c.trackId === 'track_video_main' || c.trackId === 'track_video_overlay'
    );

    // If there is no video in the timeline and we are importing a video, prioritize the main video track
    const trackId = (!hasVideoClips && isVideo)
      ? 'track_video_main'
      : (targetTrackId || (isAudio ? 'track_audio_bg' : 'track_video_main'));

    const trackClips = project.clips.filter((c) => c.trackId === trackId);
    const endPosition = trackClips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 0);

    // If there is no video on the timeline and a video is imported/dragged, always snap to start (0:00)
    let startInTimeline: number;
    if ((isVideo || trackId === 'track_video_main') && !hasVideoClips) {
      startInTimeline = 0;
      setCurrentTimeState(0);
    } else if (targetStartTime !== undefined) {
      startInTimeline = Math.max(0, targetStartTime);
    } else {
      startInTimeline = Math.max(currentTime, endPosition);
    }

    const clipDuration = assetWithThumb.duration && assetWithThumb.duration > 0 ? assetWithThumb.duration : 10.0;

    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trackId,
      assetId: assetWithThumb.id,
      name: assetWithThumb.name,
      type: assetWithThumb.type,
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
      const hasAsset = prev.assets.some((a) => a.id === assetWithThumb.id);
      return {
        ...prev,
        duration: nextDuration,
        assets: hasAsset ? prev.assets : [assetWithThumb, ...prev.assets],
        clips: [...prev.clips, newClip],
      };
    });

    setSelectedClipIds([newClip.id]);
    setCurrentTimeState(startInTimeline);
    currentTimeRef.current = startInTimeline;
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
              const streamUrl = getDriveStreamUrl(file.id, token);
              const isAudio = file.mimeType.startsWith('audio');
              const newAsset: MediaAsset = {
                id: `asset_drive_${file.id}`,
                name: file.name,
                type: isAudio ? 'audio' : 'video',
                url: streamUrl,
                driveFileId: file.id,
                duration: 15.0,
                isDrive: true,
                thumbnailUrl: file.thumbnailUrl || (isAudio ? undefined : GENERIC_VIDEO_THUMBNAIL),
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
        const streamUrl = getDriveStreamUrl(file.id, googleAccessToken);
        const isAudio = file.mimeType.startsWith('audio');
        const newAsset: MediaAsset = {
          id: `asset_drive_${file.id}`,
          name: file.name,
          type: isAudio ? 'audio' : 'video',
          url: streamUrl,
          driveFileId: file.id,
          duration: 15.0,
          isDrive: true,
          thumbnailUrl: file.thumbnailUrl || (isAudio ? undefined : GENERIC_VIDEO_THUMBNAIL),
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
  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>, recordHistory = false) => {
    setProject((prev) => {
      const updatedClips = prev.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        const asset = prev.assets.find((a) => a.id === clip.assetId);
        const finalUpdates = { ...updates };

        // Impede que vídeos ou áudios sejam estendidos além da duração original da mídia
        if (asset && (clip.type === 'video' || clip.type === 'audio') && asset.duration > 0) {
          const speed = finalUpdates.speed ?? clip.speed ?? 1.0;
          let trimStart = finalUpdates.trimStart ?? clip.trimStart ?? 0;
          trimStart = Math.max(0, Math.min(Math.max(0, asset.duration - 0.2), trimStart));
          finalUpdates.trimStart = trimStart;

          if (finalUpdates.duration !== undefined) {
            const maxDuration = Math.max(0.2, (asset.duration - trimStart) / speed);
            finalUpdates.duration = Math.min(maxDuration, Math.max(0.2, finalUpdates.duration));
          }

          if (finalUpdates.trimEnd !== undefined) {
            finalUpdates.trimEnd = Math.min(asset.duration, Math.max(trimStart + 0.2, finalUpdates.trimEnd));
          }
        }

        return {
          ...clip,
          ...finalUpdates,
          transform: finalUpdates.transform ? { ...clip.transform, ...finalUpdates.transform } : clip.transform,
          filters: finalUpdates.filters ? { ...clip.filters, ...finalUpdates.filters } : clip.filters,
          textStyle: finalUpdates.textStyle ? { ...clip.textStyle, ...finalUpdates.textStyle } as any : clip.textStyle,
        };
      });

      const maxEnd = updatedClips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 15);
      const nextProject: Project = {
        ...prev,
        duration: Math.max(maxEnd + 2, 15),
        clips: updatedClips,
      };

      projectRef.current = nextProject;

      if (recordHistory) {
        if (historyDebounceTimerRef.current) {
          clearTimeout(historyDebounceTimerRef.current);
          historyDebounceTimerRef.current = null;
        }
        pushHistory(nextProject);
      } else {
        // Fallback debounce: grava no histórico 500ms após a última edição caso nenhum commit explícito ocorra
        if (historyDebounceTimerRef.current) {
          clearTimeout(historyDebounceTimerRef.current);
        }
        historyDebounceTimerRef.current = setTimeout(() => {
          historyDebounceTimerRef.current = null;
          pushHistory(projectRef.current);
        }, 500);
      }

      return nextProject;
    });
  }, [pushHistory]);

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

  // Detach audio from a video clip into an independent audio track directly beneath the media
  const detachAudioFromClip = useCallback((clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip || clip.type !== 'video') return;

    const clipTrackIndex = project.tracks.findIndex((t) => t.id === clip.trackId);
    const targetIndex = clipTrackIndex !== -1 ? clipTrackIndex + 1 : project.tracks.length;

    // Check if the track immediately below is already an audio track and has no collision in this time range
    const nextTrack = project.tracks[targetIndex];
    let targetAudioTrackId: string;
    let updatedTracks = [...project.tracks];

    const isCollision = (trackId: string) => {
      return project.clips.some(
        (c) =>
          c.trackId === trackId &&
          Math.max(c.startInTimeline, clip.startInTimeline) <
            Math.min(c.startInTimeline + c.duration, clip.startInTimeline + clip.duration) - 0.05
      );
    };

    if (nextTrack && nextTrack.type === 'audio' && !isCollision(nextTrack.id)) {
      targetAudioTrackId = nextTrack.id;
    } else {
      // Create a dedicated audio track placed directly beneath this media's track
      targetAudioTrackId = `track_audio_${Date.now()}`;
      const cleanClipName = clip.name.replace(/\.[^/.]+$/, '').slice(0, 18);
      const newTrack: TimelineTrack = {
        id: targetAudioTrackId,
        name: `Áudio — ${cleanClipName}`,
        type: 'audio',
        isMuted: false,
        isLocked: false,
        isHidden: false,
        order: targetIndex,
      };

      // Insert directly below the video track
      updatedTracks.splice(targetIndex, 0, newTrack);
      updatedTracks = updatedTracks.map((t, idx) => ({ ...t, order: idx }));
    }

    const newAudioClipId = `clip_audio_detached_${Date.now()}`;
    const newAudioClip: TimelineClip = {
      id: newAudioClipId,
      trackId: targetAudioTrackId,
      assetId: clip.assetId,
      name: `🔊 ${clip.name}`,
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
        tracks: updatedTracks,
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

  // Add asset (Preserva status e progresso de importação para evitar adicionar mídias incompletas)
  const addAsset = useCallback(
    (asset: MediaAsset) => {
      const isVideo = asset.type === 'video';
      const isMobile =
        typeof window !== 'undefined' &&
        /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

      const assetWithThumb: MediaAsset = {
        ...asset,
        isOffline: false,
        isAuthExpired: false,
        thumbnailUrl: asset.thumbnailUrl || (isVideo ? GENERIC_VIDEO_THUMBNAIL : undefined),
        status: asset.status || 'ready',
        preloadProgress: asset.preloadProgress !== undefined ? asset.preloadProgress : 100,
      };

      updateProjectWithHistory((prev) => ({
        ...prev,
        assets: prev.assets.some((a) => a.id === assetWithThumb.id)
          ? prev.assets.map((a) =>
              a.id === assetWithThumb.id
                ? {
                    ...a,
                    isOffline: false,
                    isAuthExpired: false,
                    url: assetWithThumb.url,
                    proxyUrl: assetWithThumb.proxyUrl || a.proxyUrl,
                    status: assetWithThumb.status,
                    preloadProgress: assetWithThumb.preloadProgress,
                  }
                : a
            )
          : [assetWithThumb, ...prev.assets],
      }));

      // No mobile, o streaming nativo com Range requests pelo navegador é leve e não estoura a RAM
      if (isVideo && !isMobile && assetWithThumb.status === 'ready' && !assetWithThumb.proxyUrl) {
        startAssetCaching(assetWithThumb);
      }
    },
    [updateProjectWithHistory, startAssetCaching]
  );

  // Importa mídia do Google Drive TOTALMENTE para a memória local (Blob URL) antes de disponibilizar para adição
  const importDriveAssetToMemory = useCallback(
    async (
      file: GoogleDriveFile,
      options?: { addToTimeline?: boolean; targetTrackId?: string; targetStartTime?: number }
    ): Promise<MediaAsset | null> => {
      const activeToken =
        googleAccessToken ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
          : null);

      const streamUrl = getDriveStreamUrl(file.id, activeToken);
      const assetId = `asset_drive_${file.id}`;

      // 1. Se já existe no cache em memória ou IndexedDB, reutiliza imediatamente
      const cachedUrl = await getCachedDriveVideoUrl(file.id);
      if (cachedUrl) {
        const readyAsset: MediaAsset = {
          id: assetId,
          name: file.name,
          type: file.mimeType.startsWith('audio') ? 'audio' : 'video',
          url: cachedUrl,
          proxyUrl: cachedUrl,
          driveFileId: file.id,
          duration: file.durationSeconds || 15.0,
          isDrive: true,
          status: 'ready',
          preloadProgress: 100,
          thumbnailUrl: file.thumbnailUrl || (file.mimeType.startsWith('audio') ? undefined : GENERIC_VIDEO_THUMBNAIL),
          size: file.sizeBytes,
        };

        addAsset(readyAsset);
        if (options?.addToTimeline !== false) {
          addClipToTrack(readyAsset, options?.targetTrackId, options?.targetStartTime);
        }
        return readyAsset;
      }

      // 2. Mídia liberada IMEDIATAMENTE para a timeline via streaming HTTP 206 enquanto baixa em segundo plano
      const initialAsset: MediaAsset = {
        id: assetId,
        name: file.name,
        type: file.mimeType.startsWith('audio') ? 'audio' : 'video',
        url: streamUrl,
        driveFileId: file.id,
        duration: file.durationSeconds || 15.0,
        isDrive: true,
        status: 'ready', // LIBERADO IMEDIATAMENTE!
        preloadProgress: 5,
        loadedBytes: 0,
        thumbnailUrl: file.thumbnailUrl || (file.mimeType.startsWith('audio') ? undefined : GENERIC_VIDEO_THUMBNAIL),
        size: file.sizeBytes,
      };

      // Adiciona imediatamente ao projeto e à timeline
      addAsset(initialAsset);
      if (options?.addToTimeline !== false) {
        addClipToTrack(initialAsset, options?.targetTrackId, options?.targetStartTime);
      }

      // Registra na barra de progresso em background
      const totalBytesExpected = file.sizeBytes || 0;
      setBackgroundDownloads((prev) => [
        ...prev.filter((d) => d.assetId !== assetId),
        {
          assetId,
          name: file.name,
          percent: 5,
          loadedBytes: 0,
          totalBytes: totalBytesExpected,
        },
      ]);

      // 3. Executa o download em segundo plano com multi-stream paralelo (NÃO bloqueia o usuário!)
      (async () => {
        try {
          let blobUrl: string;

      // Throttle do progresso para evitar flood de re-renders em dispositivos limitados
      // (cada chunk dispara 2 setState → centenas de re-renders congelam o UI thread)
      let lastProgressUpdate = 0;
      const isLowResource =
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
        (typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory <= 4) ||
        (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2);
      const PROGRESS_THROTTLE_MS = isLowResource ? 1000 : 300;

      try {
            blobUrl = await preloadDriveVideo({
              fileId: file.id,
              streamUrl,
              token: activeToken,
              onProgress: (pct, loaded, total) => {
                const now = Date.now();
                // Só atualiza UI se passou tempo suficiente OU se completou (100%)
                if (pct < 100 && now - lastProgressUpdate < PROGRESS_THROTTLE_MS) return;
                lastProgressUpdate = now;

                const totalBytes = total || totalBytesExpected;
                const loadedBytes = loaded || Math.round((pct / 100) * totalBytes);
                setBackgroundDownloads((prev) =>
                  prev.map((d) =>
                    d.assetId === assetId
                      ? { ...d, percent: pct, loadedBytes, totalBytes }
                      : d
                  )
                );
                setProject((prev) => ({
                  ...prev,
                  assets: prev.assets.map((a) =>
                    a.id === assetId
                      ? { ...a, preloadProgress: pct, loadedBytes }
                      : a
                  ),
                }));
              },
            });
          } catch (initialErr: any) {
            const isAuthErr =
              initialErr?.message?.includes('expirada') ||
              initialErr?.message?.includes('401') ||
              initialErr?.message?.includes('autenticação');

            if (isAuthErr) {
              const freshToken = await refreshGoogleToken(false);
              if (freshToken) {
                const freshStreamUrl = getDriveStreamUrl(file.id, freshToken);
                blobUrl = await preloadDriveVideo({
                  fileId: file.id,
                  streamUrl: freshStreamUrl,
                  token: freshToken,
                  onProgress: (pct, loaded, total) => {
                    const totalBytes = total || totalBytesExpected;
                    const loadedBytes = loaded || Math.round((pct / 100) * totalBytes);
                    setBackgroundDownloads((prev) =>
                      prev.map((d) =>
                        d.assetId === assetId
                          ? { ...d, percent: pct, loadedBytes, totalBytes }
                          : d
                      )
                    );
                    setProject((prev) => ({
                      ...prev,
                      assets: prev.assets.map((a) =>
                        a.id === assetId
                          ? { ...a, preloadProgress: pct, loadedBytes }
                          : a
                      ),
                    }));
                  },
                });
              } else {
                throw initialErr;
              }
            } else {
              throw initialErr;
            }
          }

          // 4. Download em memória concluído! Promove o vídeo para o blob local de latência zero
          setProject((prev) => ({
            ...prev,
            assets: prev.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    url: blobUrl,
                    proxyUrl: blobUrl,
                    status: 'ready',
                    preloadProgress: 100,
                    loadedBytes: a.size || 0,
                  }
                : a
            ),
          }));

          // Remove da lista de downloads ativos após um pequeno delay para mostrar 100%
          setTimeout(() => {
            setBackgroundDownloads((prev) => prev.filter((d) => d.assetId !== assetId));
          }, 1500);
        } catch (err: any) {
          console.warn('[BackgroundDownload] Download em background falhou, vídeo continuará funcionando via streaming direto:', err);
          setBackgroundDownloads((prev) => prev.filter((d) => d.assetId !== assetId));
        }
      })();

      return initialAsset;
    },
    [googleAccessToken, addAsset, addClipToTrack, refreshGoogleToken]
  );

  // Remove asset from project library (optionally removing associated clips)
  const removeAsset = useCallback((assetId: string, deleteAssociatedClips = false) => {
    const targetAsset = projectRef.current.assets.find((a) => a.id === assetId);
    if (targetAsset) {
      if (targetAsset.driveFileId) {
        evictCachedVideo(targetAsset.driveFileId);
      }
      if (targetAsset.proxyUrl && targetAsset.proxyUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(targetAsset.proxyUrl);
        } catch {}
      }
    }

    updateProjectWithHistory((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== assetId),
      clips: deleteAssociatedClips ? prev.clips.filter((c) => c.assetId !== assetId) : prev.clips,
    }));
  }, [updateProjectWithHistory]);

  // Update asset thumbnail (e.g. when generated asynchronously from video frame)
  const updateAssetThumbnail = useCallback((assetId: string, thumbnailUrl: string) => {
    setProject((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === assetId ? { ...a, thumbnailUrl } : a)),
    }));
  }, []);

  // Sync real media duration (e.g. from loaded metadata in video/audio elements)
  const syncMediaDuration = useCallback((assetId: string, realDuration: number) => {
    if (!realDuration || isNaN(realDuration) || !isFinite(realDuration) || realDuration <= 0) return;

    setProject((prev) => {
      const asset = prev.assets.find((a) => a.id === assetId);
      if (!asset) return prev;

      const diff = Math.abs((asset.duration || 0) - realDuration);
      if (diff < 0.2) return prev;

      const durFormatted = parseFloat(realDuration.toFixed(3));

      const updatedAssets = prev.assets.map((a) =>
        a.id === assetId ? { ...a, duration: durFormatted } : a
      );

      let maxTimelineEnd = prev.duration;
      const updatedClips = prev.clips.map((clip) => {
        if (clip.assetId === assetId) {
          // If the clip was at full initial asset duration (or fallback 10s/15s)
          const wasFullAssetLength =
            Math.abs(clip.duration - (asset.duration || 10.0)) < 0.5 ||
            Math.abs(clip.duration - 10.0) < 0.1 ||
            Math.abs(clip.duration - 15.0) < 0.1;

          if (wasFullAssetLength) {
            const clipEnd = clip.startInTimeline + durFormatted;
            if (clipEnd > maxTimelineEnd) {
              maxTimelineEnd = clipEnd + 2.0;
            }
            return {
              ...clip,
              duration: durFormatted,
              trimEnd: durFormatted,
            };
          }
        }
        return clip;
      });

      return {
        ...prev,
        duration: Math.max(prev.duration, maxTimelineEnd),
        assets: updatedAssets,
        clips: updatedClips,
      };
    });
  }, []);

  // Mark asset as offline (e.g. when video playback throws error or URL expired)
  const markAssetOffline = useCallback((assetId: string) => {
    setProject((prev) => {
      const asset = prev.assets.find((a) => a.id === assetId);
      if (!asset || asset.isOffline) return prev;
      return {
        ...prev,
        assets: prev.assets.map((a) => (a.id === assetId ? { ...a, isOffline: true } : a)),
      };
    });
  }, []);

  // Relink assets from a folder or list of files (optionally for a specific targetAssetId)
  const relinkAssetsFromFiles = useCallback(
    async (files: FileList | File[], targetAssetId?: string): Promise<{ reconnectedCount: number; notFoundCount: number }> => {
      const filesArray = Array.from(files);
      if (filesArray.length === 0) {
        return { reconnectedCount: 0, notFoundCount: 0 };
      }

      // If targeting a specific asset with a single file (manual pick regardless of name)
      if (targetAssetId && filesArray.length === 1) {
        const file = filesArray[0];
        const freshUrl = URL.createObjectURL(file);
        let found = false;
        let matchedAsset: MediaAsset | null = null;

        setProject((prev) => {
          const updatedAssets = prev.assets.map((asset) => {
            if (asset.id === targetAssetId) {
              found = true;
              matchedAsset = asset;
              return {
                ...asset,
                url: freshUrl,
                size: file.size,
                isOffline: false,
              };
            }
            return asset;
          });

          if (found) {
            const updatedProj: Project = {
              ...prev,
              assets: updatedAssets,
              updatedAt: new Date().toISOString(),
            };
            projectRef.current = updatedProj;
            try {
              localStorage.setItem('alo_editor_project', JSON.stringify(updatedProj));
            } catch {}
            return updatedProj;
          }
          return prev;
        });

        if (found && matchedAsset) {
          if ((matchedAsset as MediaAsset).type === 'video') {
            captureVideoThumbnail(file, 0.5).then((thumb) => {
              if (thumb && thumb !== GENERIC_VIDEO_THUMBNAIL) {
                updateAssetThumbnail(targetAssetId, thumb);
              }
            });
          }
          const totalOfflineRemaining = projectRef.current.assets.filter((a) => !a.isDrive && a.isOffline).length;
          return { reconnectedCount: 1, notFoundCount: totalOfflineRemaining };
        }
      }

      // Build lookup index: exact lower name and base name (without extension)
      const fileMapExact = new Map<string, File>();
      const fileMapBase = new Map<string, File>();

      for (const file of filesArray) {
        const cleanName = file.name.trim();
        const lowerName = cleanName.toLowerCase();
        fileMapExact.set(lowerName, file);

        const extIdx = lowerName.lastIndexOf('.');
        const baseName = extIdx > 0 ? lowerName.substring(0, extIdx) : lowerName;
        fileMapBase.set(baseName, file);
      }

      let reconnectedCount = 0;
      const matchedAssets: Array<{ asset: MediaAsset; file: File }> = [];

      setProject((prev) => {
        const updatedAssets = prev.assets.map((asset) => {
          if (asset.isDrive) return asset;

          const cleanName = asset.name.trim();
          const lowerName = cleanName.toLowerCase();
          const extIdx = lowerName.lastIndexOf('.');
          const baseName = extIdx > 0 ? lowerName.substring(0, extIdx) : lowerName;

          const matchedFile = fileMapExact.get(lowerName) || fileMapBase.get(baseName);

          if (matchedFile) {
            reconnectedCount++;
            const freshUrl = URL.createObjectURL(matchedFile);
            matchedAssets.push({ asset, file: matchedFile });
            return {
              ...asset,
              url: freshUrl,
              size: matchedFile.size,
              isOffline: false,
            };
          }

          return asset;
        });

        if (reconnectedCount > 0) {
          const updatedProj: Project = {
            ...prev,
            assets: updatedAssets,
            updatedAt: new Date().toISOString(),
          };
          projectRef.current = updatedProj;
          try {
            localStorage.setItem('alo_editor_project', JSON.stringify(updatedProj));
          } catch {}
          return updatedProj;
        }

        return prev;
      });

      // Regenerate video thumbnails asynchronously if reconnected
      for (const { asset, file } of matchedAssets) {
        if (asset.type === 'video') {
          captureVideoThumbnail(file, 0.5, (dur) => {
            if (dur && dur > 0 && Math.abs(dur - (asset.duration || 0)) > 0.5) {
              syncMediaDuration(asset.id, dur);
            }
          }).then((thumb) => {
            if (thumb && thumb !== GENERIC_VIDEO_THUMBNAIL) {
              updateAssetThumbnail(asset.id, thumb);
            }
          });
        }
      }

      const totalOfflineRemaining = projectRef.current.assets.filter((a) => !a.isDrive && a.isOffline).length;

      return {
        reconnectedCount,
        notFoundCount: totalOfflineRemaining,
      };
    },
    [syncMediaDuration, updateAssetThumbnail]
  );

  const offlineAssetsCount = useMemo(() => {
    return project.assets.filter((a) => !a.isDrive && a.isOffline).length;
  }, [project.assets]);

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
    projectRef.current = emptyProject;
    historyRef.current = [emptyProject];
    historyIndexRef.current = 0;
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
    historyRef.current = [newProj];
    historyIndexRef.current = 0;
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
          const hasLocalAssets = (parsed.assets || []).some((a: MediaAsset) => !a.isDrive);
          const importedProject: Project = {
            ...parsed,
            id: parsed.id || `project_${Date.now()}`,
            name: parsed.name || file.name.replace('.alo.json', '').replace('.json', ''),
            updatedAt: new Date().toISOString(),
            assets: (parsed.assets || []).map((a: MediaAsset) => {
              if (!a.isDrive) {
                return { ...a, isOffline: true };
              }
              return a;
            }),
          };
          loadProject(importedProject);
          if (hasLocalAssets) {
            setIsRelinkModalOpen(true);
          }
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
  }, [loadProject, setIsRelinkModalOpen]);

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

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      let next: number;
      if (prev < 3) next = prev + 0.5;
      else if (prev < 10) next = prev + 2;
      else if (prev < 30) next = prev + 5;
      else if (prev < 70) next = prev + 10;
      else next = prev + 15;
      return Math.min(160, Math.round(next * 10) / 10);
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      let next: number;
      if (prev <= 1) next = Math.max(0.5, prev - 0.25);
      else if (prev <= 3) next = prev - 0.5;
      else if (prev <= 10) next = prev - 2;
      else if (prev <= 30) next = prev - 5;
      else if (prev <= 70) next = prev - 10;
      else next = prev - 15;
      return Math.max(0.5, Math.round(next * 10) / 10);
    });
  }, []);

  const zoomToFit = useCallback(() => {
    const el = document.getElementById('alo_timeline_scrollable');
    const availableWidth = el ? Math.max(300, el.clientWidth - 48) : 800;
    const maxClipEnd = project.clips.reduce((max, c) => Math.max(max, c.startInTimeline + c.duration), 0);
    const effectiveDur = Math.max(project.duration, maxClipEnd, 2);
    const fitZoom = Math.max(0.5, Math.min(140, parseFloat((availableWidth / effectiveDur).toFixed(2))));
    setZoom(fitZoom);
    if (el) {
      el.scrollLeft = 0;
    }
  }, [project.clips, project.duration]);

  // Keyboard shortcuts listener (<kbd>Cmd+A</kbd>, <kbd>Space</kbd>, <kbd>S</kbd>, <kbd>Delete</kbd>, <kbd>+</kbd>, <kbd>-</kbd>, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Atalhos de Zoom da Timeline
      // Zoom In: +, =, ou NumpadAdd
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        zoomIn();
        return;
      }

      // Zoom Out: -, _, ou NumpadSubtract
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // Ajustar à tela (Fit to Timeline / Ver todo o projeto): Shift + Z ou Backslash (\)
      if ((!e.ctrlKey && !e.metaKey && e.shiftKey && (e.code === 'KeyZ' || e.key === 'Z')) || e.key === '\\') {
        e.preventDefault();
        zoomToFit();
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
  }, [togglePlay, splitClipAtPlayhead, deleteSelectedClips, selectedClipId, selectAllClips, undo, redo, duplicateClip, zoomIn, zoomOut, zoomToFit]);

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
        zoomIn,
        zoomOut,
        zoomToFit,
        previewQuality,
        setPreviewQuality,
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
        refreshGoogleToken,
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
        commitHistory,
        deleteClip,
        deleteSelectedClips,
        splitClipAtPlayhead,
        duplicateClip,
        detachAudioFromClip,
        addAsset,
        importDriveAssetToMemory,
        removeAsset,
        updateAssetThumbnail,
        syncMediaDuration,
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
        backgroundDownloads,
        setIsExportModalOpen,
        setIsShortcutsModalOpen,
        setIsDrivePickerOpen,
        isSilenceModalOpen,
        setIsSilenceModalOpen,
        isRelinkModalOpen,
        setIsRelinkModalOpen,
        relinkAssetsFromFiles,
        offlineAssetsCount,
        markAssetOffline,
        isDriveAuthNeeded,
        markAssetAuthExpired,
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
