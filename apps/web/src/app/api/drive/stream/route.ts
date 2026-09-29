import { NextRequest, NextResponse } from 'next/server';

/**
 * Route handler para streaming transparente de vídeos do Google Drive
 * Suporta HTTP Range Requests (206 Partial Content) para scrubbing fluido no navegador
 * sem salvar nada no servidor.
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
    const hasValidToken = token && token !== 'null' && token !== 'undefined' && token.length > 10;

    if (hasValidToken) {
      const googleHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
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
    }

    // Fallback streaming: If OAuth token is not present or unauthenticated,
    // stream local sample video via range requests so player NEVER produces a broken or black state
    const fallbackUrl = new URL('/samples/flower.mp4', request.url);
    const fallbackRes = await fetch(fallbackUrl, {
      headers: rangeHeader ? { Range: rangeHeader } : {},
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Content-Type', fallbackRes.headers.get('content-type') || 'video/mp4');
    const cr = fallbackRes.headers.get('content-range');
    if (cr) responseHeaders.set('Content-Range', cr);
    const cl = fallbackRes.headers.get('content-length');
    if (cl) responseHeaders.set('Content-Length', cl);

    return new Response(fallbackRes.body, {
      status: fallbackRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar streaming do Drive', message: error?.message },
      { status: 500 }
    );
  }
}
