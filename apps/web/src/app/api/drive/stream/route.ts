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

  if (!fileId || !token) {
    return NextResponse.json(
      { error: 'Parâmetros fileId e token são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const rangeHeader = request.headers.get('range');
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

    if (!driveResponse.ok && driveResponse.status !== 206) {
      const errorText = await driveResponse.text();
      return NextResponse.json(
        { error: 'Falha ao acessar vídeo no Google Drive', details: errorText },
        { status: driveResponse.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // Enable browser range caching for smooth scrubbing without re-downloading from Drive
    responseHeaders.set('Cache-Control', 'private, max-age=86400');
    responseHeaders.set('ETag', `"${fileId}"`);

    const contentType = driveResponse.headers.get('content-type');
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    } else {
      responseHeaders.set('Content-Type', 'video/mp4');
    }

    const contentRange = driveResponse.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const contentLength = driveResponse.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    return new Response(driveResponse.body, {
      status: driveResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro interno ao processar streaming do Drive', message: error?.message },
      { status: 500 }
    );
  }
}
