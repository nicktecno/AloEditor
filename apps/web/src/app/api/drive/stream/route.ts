import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Route handler para streaming transparente de vídeos do Google Drive
 * Executa no Edge Runtime para latência ultrabaixa e ZERO consumo de Node.js CPU Duration
 * Suporta HTTP Range Requests (206 Partial Content) para scrubbing fluido em Windows, Mac, iOS e Android
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const token = searchParams.get('token');

  if (!fileId) {
    return NextResponse.json(
      { error: 'Parâmetro fileId é obrigatório' },
      { status: 400 }
    );
  }

  try {
    const rangeHeader = request.headers.get('range');
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    const rawToken = token && token !== 'null' && token !== 'undefined' && token.length > 10 ? token : bearerToken;
    const hasValidToken = !!rawToken && rawToken.length > 10;

    let driveResponse: Response | null = null;

    // 1. Se temos token OAuth ativo, tenta via Google Drive API v3 (oficial e rápido)
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
          method: 'GET',
          headers: googleHeaders,
        });
      } catch (err) {
        console.warn('Erro ao chamar Drive API v3:', err);
      }
    }

    // 2. Se não houver token ou o token falhou/expirou, tenta download público direto (fallback para links compartilhados)
    if (!driveResponse || !driveResponse.ok) {
      const publicHeaders: Record<string, string> = {};
      if (rangeHeader) {
        publicHeaders['Range'] = rangeHeader;
      }

      try {
        const publicUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        const pubRes = await fetch(publicUrl, {
          method: 'GET',
          headers: publicHeaders,
          redirect: 'follow',
        });
        if (pubRes.ok || pubRes.status === 206) {
          driveResponse = pubRes;
        }
      } catch (pubErr) {
        console.warn('Erro no fallback público do Drive:', pubErr);
      }
    }

    // 3. Se obteve resposta com sucesso (200 OK ou 206 Partial Content)
    if (driveResponse && (driveResponse.ok || driveResponse.status === 206)) {
      const responseHeaders = new Headers();
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization');
      responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400');
      responseHeaders.set('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
      responseHeaders.set('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
      responseHeaders.set('ETag', `"${fileId}"`);

      const contentType = driveResponse.headers.get('content-type') || 'video/mp4';
      responseHeaders.set('Content-Type', contentType);

      const contentRange = driveResponse.headers.get('content-range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);

      const contentLength = driveResponse.headers.get('content-length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      return new Response(driveResponse.body, {
        status: driveResponse.status,
        headers: responseHeaders,
      });
    }

    // 4. Se falhou com 401 ou 403 e nenhum fallback funcionou
    if (driveResponse && (driveResponse.status === 401 || driveResponse.status === 403)) {
      return NextResponse.json(
        {
          error: 'Sessão do Google Drive expirada ou permissão insuficiente. Por favor, conecte sua conta Google.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401 }
      );
    }

    if (!hasValidToken) {
      return NextResponse.json(
        {
          error: 'Token do Google Drive ausente ou expirado. Por favor, faça login com o Google.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Erro ao obter arquivo do Google Drive: HTTP ${driveResponse?.status || 500}` },
      { status: driveResponse?.status || 500 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar streaming do Drive', message: error?.message },
      { status: 500 }
    );
  }
}
