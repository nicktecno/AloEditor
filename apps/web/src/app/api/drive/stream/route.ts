import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * Route handler para streaming transparente de vídeos do Google Drive
 * Executa no Edge Runtime para latência ultrabaixa e ZERO consumo de Node.js CPU Duration
 * Suporta HTTP Range Requests (206 Partial Content) para scrubbing fluido no navegador
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

    if (!hasValidToken) {
      return NextResponse.json(
        {
          error: 'Sessão do Google Drive não encontrada ou token ausente. Por favor, conecte sua conta Google.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401 }
      );
    }

    const googleHeaders: Record<string, string> = {
      Authorization: `Bearer ${rawToken}`,
    };

    if (rangeHeader) {
      googleHeaders['Range'] = rangeHeader;
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const driveResponse = await fetch(driveUrl, {
      method: 'GET',
      headers: googleHeaders,
    });

    if (driveResponse.ok || driveResponse.status === 206) {
      const responseHeaders = new Headers();
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Cache-Control', 'private, max-age=86400');
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

    // Google retornou 401 Unauthorized ou 403 Forbidden (Token expirado ou sem permissão)
    if (driveResponse.status === 401 || driveResponse.status === 403) {
      return NextResponse.json(
        {
          error: 'Sessão do Google Drive expirada ou token revogado. Por favor, reconecte sua conta Google.',
          code: 'DRIVE_AUTH_EXPIRED',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Erro ao obter arquivo do Google Drive: HTTP ${driveResponse.status}` },
      { status: driveResponse.status }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar streaming do Drive', message: error?.message },
      { status: 500 }
    );
  }
}
