/**
 * Cloudflare Worker: AloEditor Google Drive Video Proxy
 * 
 * - 100% CUSTO ZERO (Zero Egress Fees da Cloudflare)
 * - 100.000 requisições gratuitas por dia
 * - Suporta HTTP Range Requests (206 Partial Content) para scrubbing fluido
 * - Resolve todos os bloqueios de CORS do Google Drive
 * - Não consome nenhum byte da sua conta Vercel!
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Authorization, Content-Type, Accept, Origin',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    // 1. Responde a requisições de preflight CORS (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    // Rota de teste/saúde
    if (url.pathname === '/' && !url.searchParams.get('fileId')) {
      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'AloEditor Google Drive Proxy (Cloudflare Worker)',
          egress: 'unlimited_free',
          message: 'Worker funcionando perfeitamente!',
        }),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...CORS_HEADERS,
          },
        }
      );
    }

    const fileId = url.searchParams.get('fileId');
    const queryToken = url.searchParams.get('token');
    const authHeader = request.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    const token =
      queryToken && queryToken !== 'null' && queryToken !== 'undefined' && queryToken.length > 10
        ? queryToken
        : bearerToken;

    if (!fileId) {
      return new Response(
        JSON.stringify({ error: 'Parâmetro fileId é obrigatório' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    const googleHeaders = {};
    if (token && token.length > 10) {
      googleHeaders['Authorization'] = `Bearer ${token}`;
    }

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      googleHeaders['Range'] = rangeHeader;
    }

    const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    try {
      const isHead = request.method === 'HEAD';
      const driveRes = await fetch(driveApiUrl, {
        method: isHead ? 'HEAD' : 'GET',
        headers: googleHeaders,
      });

      // Se o token expirou
      if (driveRes.status === 401 || driveRes.status === 403) {
        return new Response(
          JSON.stringify({
            error: 'Sessão do Google Drive expirada ou permissão insuficiente.',
            code: 'DRIVE_AUTH_EXPIRED',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          }
        );
      }

      // Prepara os cabeçalhos de resposta com suporte a streaming de vídeo
      const responseHeaders = new Headers();
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type, Accept, Origin');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      responseHeaders.set('Cache-Control', 'public, max-age=3600');

      let contentType = driveRes.headers.get('content-type') || 'video/mp4';
      if (contentType.includes('text/html')) {
        return new Response(
          JSON.stringify({
            error: 'Google Drive requer autenticação para este arquivo.',
            code: 'DRIVE_AUTH_EXPIRED',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
      if (contentType === 'application/octet-stream') {
        contentType = 'video/mp4';
      }
      responseHeaders.set('Content-Type', contentType);

      const contentRange = driveRes.headers.get('content-range');
      if (contentRange) responseHeaders.set('Content-Range', contentRange);

      const contentLength = driveRes.headers.get('content-length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      return new Response(isHead ? null : driveRes.body, {
        status: driveRes.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'Falha ao buscar mídia do Drive no Cloudflare Worker',
          message: err?.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        }
      );
    }
  },
};
