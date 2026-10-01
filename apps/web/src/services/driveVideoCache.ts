/**
 * Serviço de Pré-carregamento e Cache Local (IndexedDB & In-Memory Blob)
 * para Vídeos do Google Drive.
 * 
 * Elimina completamente travamentos e engasgos causados pela latência de streaming
 * das funções serverless da Vercel / Google Drive:
 * 1. Faz o pré-carregamento progressivo do vídeo diretamente no navegador em segundo plano.
 * 2. Armazena o blob em IndexedDB e gera um `blob:` URL local na memória RAM/VRAM.
 * 3. Permite scrubbing e reprodução com busca em 0ms (instantânea e sem rede).
 * 4. Gerenciamento automático de ciclo de vida (LRU Eviction e limite máximo de tamanho).
 */

const DB_NAME = 'AloEditorMediaCache';
const DB_VERSION = 1;
const STORE_NAME = 'drive_videos';

// Limites inteligentes de cache local:
// - Limite padrão: 1.5 GB máximo em IndexedDB para não sobrecarregar o armazenamento do dispositivo
// - Expiração automática: arquivos sem uso há mais de 7 dias são podados automaticamente
const MAX_CACHE_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const inMemoryBlobUrls = new Map<string, string>();
const activePreloadTasks = new Map<string, Promise<string>>();

export interface CachedRecord {
  fileId: string;
  blob: Blob;
  mimeType: string;
  size: number;
  timestamp: number;
}

export interface CacheStats {
  totalBytes: number;
  fileCount: number;
  formattedSize: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Inicializa ou conecta ao IndexedDB local do navegador
 */
function openCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpeza automática por política LRU (Least Recently Used) e tempo de expiração
 */
async function pruneCacheIfNeeded(db: IDBDatabase): Promise<void> {
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const records = (getAllReq.result || []) as CachedRecord[];
      if (records.length === 0) return;

      const now = Date.now();
      let totalSize = records.reduce((sum, r) => sum + (r.size || 0), 0);

      // Ordena por data de uso mais antiga primeiro (LRU)
      records.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      for (const record of records) {
        const isExpired = now - (record.timestamp || 0) > MAX_CACHE_AGE_MS;
        const isOverLimit = totalSize > MAX_CACHE_BYTES;

        if (isExpired || isOverLimit) {
          store.delete(record.fileId);
          totalSize -= record.size || 0;

          // Revoga URL em memória para liberar RAM
          if (inMemoryBlobUrls.has(record.fileId)) {
            const url = inMemoryBlobUrls.get(record.fileId)!;
            URL.revokeObjectURL(url);
            inMemoryBlobUrls.delete(record.fileId);
          }
        }
      }
    };
  } catch (err) {
    console.warn('Erro ao podar cache do IndexedDB:', err);
  }
}

/**
 * Recupera o Blob URL local se o arquivo do Drive já foi pré-carregado no navegador
 */
export async function getCachedDriveVideoUrl(fileId: string): Promise<string | null> {
  if (!fileId) return null;

  // 1. Checa cache de memória RAM imediato (0ms)
  if (inMemoryBlobUrls.has(fileId)) {
    return inMemoryBlobUrls.get(fileId)!;
  }

  // 2. Checa IndexedDB persistente
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(fileId);

      req.onsuccess = () => {
        const record = req.result as CachedRecord | undefined;
        if (record && record.blob) {
          // Atualiza timestamp de último acesso
          record.timestamp = Date.now();
          store.put(record);

          const blobUrl = URL.createObjectURL(record.blob);
          inMemoryBlobUrls.set(fileId, blobUrl);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Salva o Blob baixado no IndexedDB com verificação de cota
 */
async function saveVideoToCache(fileId: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const db = await openCacheDatabase();
    await pruneCacheIfNeeded(db);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedRecord = {
        fileId,
        blob,
        mimeType,
        size: blob.size,
        timestamp: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Não foi possível persistir vídeo no IndexedDB:', err);
  }
}

/**
 * Salva um blob de vídeo local no cache IndexedDB e memória RAM
 */
export async function cacheLocalVideoBlob(assetId: string, blob: Blob): Promise<string> {
  const mimeType = blob.type || 'video/mp4';
  await saveVideoToCache(assetId, blob, mimeType);
  const blobUrl = URL.createObjectURL(blob);
  inMemoryBlobUrls.set(assetId, blobUrl);
  return blobUrl;
}

export interface PreloadOptions {
  fileId: string;
  streamUrl: string;
  token?: string | null;
  onProgress?: (percent: number) => void;
}

/**
 * Pré-carrega o vídeo do Google Drive no próprio navegador em segundo plano.
 * Atualiza o progresso (0% a 100%) e retorna um `blob:` URL local quando pronto.
 */
export async function preloadDriveVideo({
  fileId,
  streamUrl,
  token,
  onProgress,
}: PreloadOptions): Promise<string> {
  if (!fileId) throw new Error('fileId inválido');

  // Se já existe no cache local, retorna imediatamente
  const existingUrl = await getCachedDriveVideoUrl(fileId);
  if (existingUrl) {
    onProgress?.(100);
    return existingUrl;
  }

  // Evita múltiplas requisições paralelas para o mesmo vídeo
  if (activePreloadTasks.has(fileId)) {
    return activePreloadTasks.get(fileId)!;
  }

  const task = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout de segurança

    try {
      let response: Response | null = null;
      const activeToken =
        (token && token.length > 10 ? token : null) ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
          : null);

      // 1. Tenta download direto pelo CDN do Google (0% de CPU e 0 MB de tráfego na Vercel)
      if (activeToken && activeToken.length > 10) {
        try {
          const directUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
          const directRes = await fetch(directUrl, {
            headers: {
              Authorization: `Bearer ${activeToken}`,
            },
            signal: controller.signal,
          });
          if (directRes.ok) {
            response = directRes;
          }
        } catch {
          // Fallback para streaming da rota Next.js
        }
      }

      // 1.1 Se não houver token mas for arquivo público, tenta download direto do Google Drive
      if (!response || !response.ok) {
        try {
          const pubUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          const pubRes = await fetch(pubUrl, {
            signal: controller.signal,
          });
          if (pubRes.ok) {
            response = pubRes;
          }
        } catch {}
      }

      // 2. Se o download direto do Google falhou, utiliza a rota /api/drive/stream como último recurso
      if (!response || !response.ok) {
        const fetchHeaders: Record<string, string> = {};
        if (activeToken && activeToken.length > 10) {
          fetchHeaders['Authorization'] = `Bearer ${activeToken}`;
        }
        onProgress?.(30);
        response = await fetch(streamUrl, {
          headers: fetchHeaders,
          signal: controller.signal,
        });
      }

      if (response.status === 401) {
        throw new Error(`AUTH_EXPIRED: Sessão do Google Drive expirada (HTTP ${response.status})`);
      }

      if (!response.ok) {
        // Se a rota falhar mas tivermos streamUrl, retorna a própria streamUrl para reprodução direta sem travar
        console.warn(`Streaming response not ok: HTTP ${response.status}. Usando streaming direto.`);
        onProgress?.(100);
        return streamUrl;
      }

      const contentType = response.headers.get('content-type') || 'video/mp4';
      onProgress?.(60);

      // Leitura nativa em C++ pelo navegador (mais rápida e sem estouro de heap no mobile)
      const finalBlob = await response.blob();
      onProgress?.(85);

      await saveVideoToCache(fileId, finalBlob, contentType);

      const blobUrl = URL.createObjectURL(finalBlob);
      inMemoryBlobUrls.set(fileId, blobUrl);
      onProgress?.(100);

      return blobUrl;
    } catch (err: any) {
      if (err?.message?.startsWith('AUTH_EXPIRED')) {
        throw err;
      }
      console.warn('Cache em background não completou, usando URL de streaming direta:', err?.message);
      onProgress?.(100);
      return streamUrl;
    } finally {
      clearTimeout(timeoutId);
      activePreloadTasks.delete(fileId);
    }
  })();

  activePreloadTasks.set(fileId, task);
  return task;
}

/**
 * Remove um vídeo específico do cache local e libera sua memória
 */
export async function evictCachedVideo(fileId: string): Promise<void> {
  if (inMemoryBlobUrls.has(fileId)) {
    const url = inMemoryBlobUrls.get(fileId)!;
    URL.revokeObjectURL(url);
    inMemoryBlobUrls.delete(fileId);
  }

  try {
    const db = await openCacheDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(fileId);
  } catch {}
}

/**
 * Obtém estatísticas do cache de mídia (tamanho total e quantidade de arquivos)
 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result || []) as CachedRecord[];
        const totalBytes = records.reduce((sum, r) => sum + (r.size || 0), 0);
        resolve({
          totalBytes,
          fileCount: records.length,
          formattedSize: formatBytes(totalBytes),
        });
      };

      req.onerror = () => resolve({ totalBytes: 0, fileCount: 0, formattedSize: '0 B' });
    });
  } catch {
    return { totalBytes: 0, fileCount: 0, formattedSize: '0 B' };
  }
}

/**
 * Limpa todos os vídeos em cache do IndexedDB e revoga todas as URLs em memória
 */
export async function clearAllDriveCache(): Promise<void> {
  inMemoryBlobUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  inMemoryBlobUrls.clear();

  try {
    const db = await openCacheDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {}
}
