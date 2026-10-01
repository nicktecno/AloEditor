import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Authorization, Content-Type, Accept, Origin',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Route handler para streaming transparente de vídeos do Google Drive
 * Executa no Edge Runtime para latência ultrabaixa e ZERO consumo de Node.js CPU Duration
 * Suporta HTTP Range Requests (206 Partial Content) para scrubbing fluido em Windows, Mac, iOS e Android
 */
export async function GET(request: NextRequest) {
  return handleStreamRequest(request, false);
}

export async function HEAD(request: NextRequest) {
  return handleStreamRequest(request, true);
}

async function handleStreamRequest(request: NextRequest, isHead: boolean) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const token = searchParams.get('token');
  const apiKey = searchParams.get('key') || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

  if (!fileId) {
    return NextResponse.json(
      { error: 'Parâmetro fileId é obrigatório' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const rangeHeader = request.headers.get('range');
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    const rawToken = token && token !== 'null' && token !== 'undefined' && token.length > 10 ? token : bearerToken;
    const hasValidToken = !!rawToken && rawToken.length > 10;

    let driveResponse: Response | null = null;

    // 1. Se temos token OAuth ativo, utiliza a API oficial do Google Drive v3 com alt=media
    if (hasValidToken) {
      const googleHeaders: Record<string, string> = {
        Authorization: `Bearer ${rawToken}`,
      };

      if (rangeHeader) {
        googleHeaders['Range'] = rangeHeader;
      }

      const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      try {
        driveResponse = await fetch(driveUrl, {
          method: isHead ? 'HEAD' : 'GET',
          headers: googleHeaders,
        });
      } catch (err) {
        console.warn('Erro ao chamar Drive API v3 com token:', err);
      }
    }

    // 2. Se status for 401 ou 403, o token expirou: interrompe e devolve 401 para acionar o auto-refresh do GIS
    if (driveResponse && (driveResponse.status === 401 || driveResponse.status === 403)) {
      return NextResponse.json(
        {
          error: 'Sessão do Google Drive expirada ou permissão insuficiente.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // 3. Se não houver token mas tivermos API Key, tenta via Google Drive v3 com key (para arquivos públicos)
    if ((!driveResponse || !driveResponse.ok) && apiKey) {
      const apiHeaders: Record<string, string> = {};
      if (rangeHeader) {
        apiHeaders['Range'] = rangeHeader;
      }

      try {
        const driveUrlWithKey = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
        const keyRes = await fetch(driveUrlWithKey, {
          method: isHead ? 'HEAD' : 'GET',
          headers: apiHeaders,
        });
        if (keyRes.ok || keyRes.status === 206) {
          driveResponse = keyRes;
        }
      } catch (keyErr) {
        console.warn('Erro ao chamar Drive API v3 com API Key:', keyErr);
      }
    }

    // 4. Se obteve resposta com sucesso do Google Drive
    if (driveResponse && (driveResponse.ok || driveResponse.status === 206)) {
      const rawContentType = driveResponse.headers.get('content-type') || '';

      // Se o Google retornou página HTML (ex: aviso de vírus ou login), NÃO é um arquivo de vídeo!
      if (rawContentType.includes('text/html')) {
        return NextResponse.json(
          {
            error: 'Google Drive requer autenticação para este arquivo. Por favor, conecte sua conta Google.',
            code: 'DRIVE_AUTH_EXPIRED',
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }

      const responseHeaders = new Headers();
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type, Accept, Origin');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      responseHeaders.set('Cache-Control', 'no-cache, private');
      responseHeaders.set('Vary', 'Range, Authorization');

      let contentType = rawContentType;
      if (!contentType || contentType === 'application/octet-stream') {
        contentType = 'video/mp4';
      }
      responseHeaders.set('Content-Type', contentType);

      const contentRange = driveResponse.headers.get('content-range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);

      const contentLength = driveResponse.headers.get('content-length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      return new Response(isHead ? null : driveResponse.body, {
        status: driveResponse.status,
        headers: responseHeaders,
      });
    }

    if (!hasValidToken) {
      return NextResponse.json(
        {
          error: 'Token do Google Drive ausente ou expirado. Por favor, faça login com o Google.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { error: `Erro ao obter arquivo do Google Drive: HTTP ${driveResponse?.status || 500}` },
      { status: driveResponse?.status || 500, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar streaming do Drive', message: error?.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
