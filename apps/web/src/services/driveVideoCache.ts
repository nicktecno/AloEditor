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
 * Salva o Blob baixado no IndexedDB com verificação de cota.
 * Totalmente seguro: em caso de cota excedida (comum no iOS Safari / Chrome mobile)
 * ou navegação privada, NUNCA falha o processo de importação para a memória RAM.
 */
async function saveVideoToCache(fileId: string, blob: Blob, mimeType: string): Promise<void> {
  try {
    const db = await openCacheDatabase();
    await pruneCacheIfNeeded(db);

    await new Promise<void>((resolve) => {
      try {
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
        req.onerror = (e) => {
          console.warn('[Cache] Aviso: IndexedDB não pôde salvar no disco (cota excedida no Safari/mobile). Mantendo na RAM:', e);
          resolve(); // Resolve normalmente sem bloquear a importação em RAM
        };
        tx.onerror = (e) => {
          console.warn('[Cache] Aviso: Transação IndexedDB falhou. Mantendo vídeo na RAM:', e);
          resolve();
        };
        tx.onabort = (e) => {
          console.warn('[Cache] Aviso: Transação IndexedDB abortada. Mantendo vídeo na RAM:', e);
          resolve();
        };
      } catch (innerErr) {
        console.warn('[Cache] Exceção ao gravar no IndexedDB:', innerErr);
        resolve();
      }
    });
  } catch (err) {
    console.warn('[Cache] IndexedDB indisponível ou inacessível no dispositivo. Mantendo vídeo na RAM:', err);
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
 * Baixa o vídeo utilizando blocos de Range Requests HTTP (ex: 4MB cada).
 * Benefícios para celulares (iOS Safari / Chrome mobile):
 * 1. Elimina o timeout de 25s das Edge Functions da Vercel.
 * 2. Permite retries individuais por bloco em conexões instáveis (4G/5G/Wi-Fi).
 * 3. Usa Blobs nativos, reduzindo a pressão de heap e Garbage Collection no WebKit.
 */
async function downloadViaRangeChunks(
  targetUrl: string,
  fetchHeaders: Record<string, string>,
  signal: AbortSignal,
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; mimeType: string } | null> {
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por bloco

  let totalBytes = 0;
  let contentType = 'video/mp4';

  try {
    // 1. Probe inicial: verifica se suporta Range e obtém o tamanho total do vídeo
    const probeRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...fetchHeaders,
        Range: 'bytes=0-0',
      },
      signal,
    });

    if (probeRes.status === 401 || probeRes.status === 403) {
      throw new Error('Sessão do Google Drive expirada. Por favor, reconecte sua conta Google.');
    }

    contentType = probeRes.headers.get('content-type') || 'video/mp4';
    if (contentType.includes('text/html')) {
      throw new Error('O Google Drive exigiu autenticação adicional. Por favor, reconecte sua conta Google.');
    }

    if (probeRes.status === 206) {
      const contentRange = probeRes.headers.get('content-range'); // ex: "bytes 0-0/41943040"
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match && match[1]) {
          totalBytes = parseInt(match[1], 10);
        }
      }
    } else if (probeRes.status === 200) {
      // O endpoint ignorou o cabeçalho Range e retornou o arquivo integral
      const fullBlob = await probeRes.blob();
      onProgress?.(100);
      return { blob: fullBlob, mimeType: contentType };
    }
  } catch (err: any) {
    if (err?.message?.includes('Sessão do Google Drive expirada') || err?.message?.includes('autenticação')) {
      throw err;
    }
    console.warn('[RangeDownload] Probe inicial falhou, usando fallback direto:', err);
    return null;
  }

  if (totalBytes <= 0) {
    return null;
  }

  // 2. Download fatiado em blocos com retry individual
  const chunks: Blob[] = [];
  let downloadedBytes = 0;

  for (let start = 0; start < totalBytes; start += CHUNK_SIZE) {
    if (signal.aborted) {
      throw new Error('Download cancelado pelo usuário ou timeout.');
    }

    const end = Math.min(start + CHUNK_SIZE - 1, totalBytes - 1);
    const rangeHeader = `bytes=${start}-${end}`;

    let chunkBlob: Blob | null = null;
    let lastErr: any = null;

    // Retry de até 3 tentativas por bloco para resistência a oscilações no 4G/5G do celular
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const chunkRes = await fetch(targetUrl, {
          headers: {
            ...fetchHeaders,
            Range: rangeHeader,
          },
          signal,
        });

        if (chunkRes.status === 401 || chunkRes.status === 403) {
          throw new Error('Sessão do Google Drive expirada.');
        }

        if (!chunkRes.ok && chunkRes.status !== 206) {
          throw new Error(`HTTP ${chunkRes.status} no bloco ${rangeHeader}`);
        }

        chunkBlob = await chunkRes.blob();
        break;
      } catch (e: any) {
        lastErr = e;
        if (attempt < 3 && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
    }

    if (!chunkBlob) {
      console.warn(`[RangeDownload] Falha no bloco ${rangeHeader} após 3 tentativas:`, lastErr);
      return null; // Faz fallback para o modo contínuo se algum bloco persistir em erro
    }

    chunks.push(chunkBlob);
    downloadedBytes += chunkBlob.size;
    const pct = Math.min(98, Math.round((downloadedBytes / totalBytes) * 100));
    onProgress?.(pct);
  }

  const finalBlob = new Blob(chunks, { type: contentType });
  return { blob: finalBlob, mimeType: contentType };
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

  // Se já existe no cache local (RAM ou IndexedDB), retorna imediatamente
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
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutos de timeout para grandes vídeos em rede móvel

    try {
      const activeToken =
        (token && token.length > 10 ? token : null) ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('alo_google_access_token') || sessionStorage.getItem('alo_google_access_token')
          : null);

      const fetchHeaders: Record<string, string> = {};
      if (activeToken && activeToken.length > 10) {
        fetchHeaders['Authorization'] = `Bearer ${activeToken}`;
      }

      onProgress?.(5);

      const targetUrl = streamUrl.includes('token=') || !activeToken
        ? streamUrl
        : `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(activeToken)}`;

      // 1. Tenta download fatiado via Range Requests (resiliente para mobile)
      let downloadedResult = await downloadViaRangeChunks(
        targetUrl,
        fetchHeaders,
        controller.signal,
        onProgress
      );

      // 2. Se Range não estava disponível ou falhou, usa fallback contínuo
      if (!downloadedResult) {
        onProgress?.(10);
        const response = await fetch(targetUrl, {
          headers: fetchHeaders,
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error('Sessão do Google Drive expirada. Por favor, reconecte sua conta Google.');
        }

        if (!response.ok) {
          throw new Error(`Falha ao baixar vídeo do Drive (HTTP ${response.status})`);
        }

        const contentType = response.headers.get('content-type') || 'video/mp4';
        if (contentType.includes('text/html')) {
          throw new Error('O Google Drive exigiu autenticação adicional. Por favor, reconecte sua conta Google.');
        }

        const contentLengthHeader = response.headers.get('content-length');
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        let loadedBytes = 0;
        const chunks: Uint8Array[] = [];

        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loadedBytes += value.length;
              if (totalBytes > 0) {
                const pct = Math.min(98, Math.round((loadedBytes / totalBytes) * 100));
                onProgress?.(pct);
              } else {
                const syntheticPct = Math.min(95, Math.round(loadedBytes / (1024 * 1024 * 5)));
                onProgress?.(syntheticPct);
              }
            }
          }
        } else {
          const blob = await response.blob();
          chunks.push(new Uint8Array(await blob.arrayBuffer()));
        }

        const fallbackBlob = new Blob(chunks as BlobPart[], { type: contentType });
        downloadedResult = { blob: fallbackBlob, mimeType: contentType };
      }

      onProgress?.(99);

      // Salva no IndexedDB de forma não-bloqueante (nunca trava a memória RAM)
      await saveVideoToCache(fileId, downloadedResult.blob, downloadedResult.mimeType);

      const blobUrl = URL.createObjectURL(downloadedResult.blob);
      inMemoryBlobUrls.set(fileId, blobUrl);
      onProgress?.(100);

      return blobUrl;
    } catch (err: any) {
      console.error('Erro ao baixar mídia do Drive para a memória:', err);
      throw err;
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
