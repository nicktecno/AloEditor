/**
 * Serviço de Integração com Google Identity Services (GIS), Google Picker API e Google Drive API v3
 */

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface GoogleUserProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

// Scopes necessários para ler arquivos do drive e salvar projetos
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Carrega dinamicamente os scripts do Google se ainda não estiverem no DOM
 */
export async function loadGoogleScripts(): Promise<{ gapiLoaded: boolean; gisLoaded: boolean }> {
  const loadGapi = new Promise<boolean>((resolve) => {
    if (window.gapi) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const loadGis = new Promise<boolean>((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const [gapiLoaded, gisLoaded] = await Promise.all([loadGapi, loadGis]);
  return { gapiLoaded, gisLoaded };
}

/**
 * Solicita autenticação OAuth 2.0 via popup do Google Identity Services
 */
export function requestGoogleAccessToken(
  clientId: string,
  onSuccess: (token: string) => void,
  onError?: (err: any) => void
): void {
  if (!window.google?.accounts?.oauth2) {
    onError?.(new Error('Google Identity Services ainda não carregado'));
    return;
  }

  const tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_DRIVE_SCOPES,
    callback: (response: any) => {
      if (response.error) {
        onError?.(response);
      } else if (response.access_token) {
        onSuccess(response.access_token);
      }
    },
  });

  // Abre o popup oficial do Google
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Busca perfil do usuário autenticado no Google
 */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleUserProfile | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: data.name || 'Usuário Google',
      email: data.email || '',
      avatarUrl: data.picture || '',
    };
  } catch {
    return null;
  }
}

/**
 * Busca os vídeos reais diretamente do Google Drive do usuário usando a API v3
 * Não requer Google Picker nem Developer Key (apenas o accessToken OAuth do usuário!)
 */
export async function listDriveVideos(accessToken: string): Promise<GoogleDriveFile[]> {
  try {
    const query = "(mimeType contains 'video/' or mimeType contains 'audio/') and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata)&pageSize=40&orderBy=modifiedTime desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('Erro ao listar vídeos do Drive:', err);
      return [];
    }

    const data = await res.json();
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.size ? parseInt(file.size) : undefined,
      thumbnailUrl: file.thumbnailLink,
      durationSeconds: file.videoMediaMetadata?.durationMillis
        ? Math.round(parseInt(file.videoMediaMetadata.durationMillis) / 1000)
        : 15,
    }));
  } catch (error) {
    console.error('Erro de rede ao buscar vídeos do Drive:', error);
    return [];
  }
}


/**
 * Inicializa e abre a janela do Google Picker
 */
export async function showGooglePicker({
  apiKey,
  clientId,
  accessToken,
  onPicked,
  onCancel,
}: {
  apiKey: string;
  clientId: string;
  accessToken: string;
  onPicked: (file: GoogleDriveFile) => void;
  onCancel?: () => void;
}): Promise<void> {
  await loadGoogleScripts();

  await new Promise<void>((resolve) => {
    if (window.gapi.picker) {
      resolve();
    } else {
      window.gapi.load('picker', { callback: () => resolve() });
    }
  });

  if (!window.google?.picker) {
    throw new Error('Google Picker não pôde ser carregado.');
  }

  // Visão de vídeos (DOCS_VIDEOS)
  const videoView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS_VIDEOS)
    .setMimeTypes('video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi')
    .setMode(window.google.picker.DocsViewMode.GRID);

  // Visão de todos os arquivos de mídia (incluindo áudios)
  const mediaView = new window.google.picker.DocsView()
    .setMimeTypes('video/*,audio/*')
    .setMode(window.google.picker.DocsViewMode.LIST);

  const picker = new window.google.picker.PickerBuilder()
    .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
    .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
    .setAppId(clientId.split('-')[0])
    .setOAuthToken(accessToken)
    .addView(videoView)
    .addView(mediaView)
    .addView(new window.google.picker.DocsView(window.google.picker.ViewId.DOCS))
    .setDeveloperKey(apiKey)
    .setTitle('AloEditor — Selecione Vídeos do seu Google Drive')
    .setCallback((data: any) => {
      if (data.action === window.google.picker.Action.PICKED) {
        const docs = data.docs;
        if (docs && docs.length > 0) {
          const doc = docs[0];
          const file: GoogleDriveFile = {
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes ? parseInt(doc.sizeBytes) : undefined,
            thumbnailUrl: doc.thumbnails?.[0]?.url || doc.iconUrl,
          };
          onPicked(file);
        }
      } else if (data.action === window.google.picker.Action.CANCEL) {
        onCancel?.();
      }
    })
    .build();

  picker.setVisible(true);
}

/**
 * Cria ou busca pasta do AloEditor no Google Drive do usuário
 */
async function getOrCreateProjectsFolder(accessToken: string): Promise<string> {
  const folderName = 'AloEditor - Projetos';

  // Buscar se já existe
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(
    folderName
  )}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Criar se não existir
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Salva o arquivo de projeto (.alo.json) diretamente no Google Drive do usuário
 */
export async function saveProjectJsonToDrive({
  accessToken,
  project,
}: {
  accessToken: string;
  project: any;
}): Promise<{ fileId: string; webViewLink?: string }> {
  const folderId = await getOrCreateProjectsFolder(accessToken);
  const fileName = `${project.name.replace(/[/\\?%*:|"<>]/g, '_')}.alo.json`;
  const projectContent = JSON.stringify(project, null, 2);

  if (project.driveFileId) {
    // Atualizar arquivo existente
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${project.driveFileId}?uploadType=media`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: projectContent,
    });

    if (updateRes.ok) {
      const data = await updateRes.json();
      return { fileId: data.id || project.driveFileId };
    }
  }

  // Criar novo arquivo via Multipart upload
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };

  const boundary = '-------AloEditorBoundary' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    projectContent +
    closeDelimiter;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Falha ao salvar no Google Drive: ${errorText}`);
  }

  const result = await uploadRes.json();
  return { fileId: result.id, webViewLink: result.webViewLink };
}

/**
 * Lista todos os arquivos de projetos (.alo.json) salvos na pasta AloEditor_Projetos no Google Drive
 */
export async function listProjectFilesFromDrive(accessToken: string): Promise<
  Array<{
    id: string;
    name: string;
    modifiedTime: string;
    size?: string;
    webViewLink?: string;
  }>
> {
  const folderId = await getOrCreateProjectsFolder(accessToken);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size,webViewLink)&orderBy=modifiedTime+desc&pageSize=50`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Falha ao listar projetos no Google Drive: ${errorText}`);
  }

  const data = await res.json();
  return (data.files || []).filter((f: any) => f.name.endsWith('.alo.json') || f.name.endsWith('.json'));
}

/**
 * Faz o download e carrega o conteúdo JSON do projeto a partir do Google Drive
 */
export async function loadProjectJsonFromDrive(accessToken: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Falha ao baixar projeto do Google Drive: ${errorText}`);
  }

  return await res.json();
}

