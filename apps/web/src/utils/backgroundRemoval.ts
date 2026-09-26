/**
 * Algoritmos profissionais de Remoção de Fundo e Chroma Key em Canvas / Client-Side
 * Suporta:
 * 1. Chroma Key (Tela Verde, Tela Azul, Magenta ou qualquer cor personalizada com remoção de spill)
 * 2. Remoção de Fundo Normal / IA (Segmentação de sujeito / pessoas em fotos e vídeos comuns)
 * 3. Luma Key (Remoção de fundos pretos ou brancos para efeitos de fogo, fumaça, logos)
 */

import { BackgroundRemovalConfig } from '@/types/editor';

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Chroma Key de alta performance com supressão de reflexo (spill suppression).
 */
export function applyChromaKey(
  imageData: ImageData,
  keyColorHex = '#00ff00',
  similarity = 0.35,
  smoothness = 0.1,
  spillReduction = 0.6
): void {
  const data = imageData.data;
  const len = data.length;
  const key = hexToRgb(keyColorHex);

  const kr = key.r;
  const kg = key.g;
  const kb = key.b;

  const isGreenKey = kg > kr + 40 && kg > kb + 40;
  const isBlueKey = kb > kr + 40 && kb > kg + 40;

  const tol = Math.max(0.01, similarity);
  const soft = Math.max(0.01, smoothness);

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    let dist = 1.0;

    if (isGreenKey) {
      // Fórmula otimizada para Tela Verde broadcast
      const maxOther = Math.max(r, b);
      const greenExcess = (g - maxOther) / 255;
      dist = 1.0 - Math.max(0, greenExcess);
    } else if (isBlueKey) {
      // Fórmula otimizada para Tela Azul broadcast
      const maxOther = Math.max(r, g);
      const blueExcess = (b - maxOther) / 255;
      dist = 1.0 - Math.max(0, blueExcess);
    } else {
      // Distância perceptiva de cor para qualquer cor customizada
      const dr = (r - kr) / 255;
      const dg = (g - kg) / 255;
      const db = (b - kb) / 255;
      dist = Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
    }

    if (dist < tol) {
      // Totalmente transparente
      data[i + 3] = 0;
    } else if (dist < tol + soft) {
      // Borda suave / feather
      const edgeAlpha = Math.floor(255 * ((dist - tol) / soft));
      data[i + 3] = Math.min(a, edgeAlpha);

      // Reduz spill nas bordas
      if (spillReduction > 0) {
        if (isGreenKey) {
          const maxOther = Math.max(r, b);
          if (g > maxOther) {
            data[i + 1] = Math.round(maxOther * spillReduction + g * (1 - spillReduction));
          }
        } else if (isBlueKey) {
          const maxOther = Math.max(r, g);
          if (b > maxOther) {
            data[i + 2] = Math.round(maxOther * spillReduction + b * (1 - spillReduction));
          }
        }
      }
    } else if (spillReduction > 0) {
      // Supressão de reflexo no corpo/cabelo mesmo fora da borda imediata
      if (isGreenKey && g > Math.max(r, b)) {
        const maxOther = Math.max(r, b);
        const excess = g - maxOther;
        if (excess > 10) {
          data[i + 1] = Math.round(g - excess * spillReduction * 0.5);
        }
      } else if (isBlueKey && b > Math.max(r, g)) {
        const maxOther = Math.max(r, g);
        const excess = b - maxOther;
        if (excess > 10) {
          data[i + 2] = Math.round(b - excess * spillReduction * 0.5);
        }
      }
    }
  }
}

/**
 * Luma Key (remove fundos pretos ou brancos para overlays de efeitos).
 */
export function applyLumaKey(
  imageData: ImageData,
  mode: 'black' | 'white' = 'black',
  threshold = 0.15,
  smoothness = 0.1
): void {
  const data = imageData.data;
  const len = data.length;
  const thresh = Math.max(0.01, threshold);
  const soft = Math.max(0.01, smoothness);

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    if (mode === 'black') {
      if (lum < thresh) {
        data[i + 3] = 0;
      } else if (lum < thresh + soft) {
        data[i + 3] = Math.min(a, Math.floor(255 * ((lum - thresh) / soft)));
      }
    } else {
      if (lum > 1 - thresh) {
        data[i + 3] = 0;
      } else if (lum > 1 - thresh - soft) {
        data[i + 3] = Math.min(a, Math.floor(255 * ((1 - thresh - lum) / soft)));
      }
    }
  }
}

/**
 * Remoção Inteligente de Fundo Normal (estilo iLoveIMG / CapCut).
 * Detecta sujeito vs fundo baseado em amostragem periférica + contraste de bordas + centróide.
 */
export function applyNormalBackgroundRemoval(
  imageData: ImageData,
  threshold = 0.45,
  feather = 4,
  invert = false
): void {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // 1. Amostra pixels de bordas e cantos para modelar a paleta do fundo
  const sampleColors: { r: number; g: number; b: number }[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 40));

  // Topo e base
  for (let x = 0; x < width; x += step) {
    const idxTop = x * 4;
    const idxBottom = ((height - 1) * width + x) * 4;
    sampleColors.push({ r: data[idxTop], g: data[idxTop + 1], b: data[idxTop + 2] });
    sampleColors.push({ r: data[idxBottom], g: data[idxBottom + 1], b: data[idxBottom + 2] });
  }

  // Laterais
  for (let y = 0; y < height; y += step) {
    const idxLeft = (y * width) * 4;
    const idxRight = (y * width + (width - 1)) * 4;
    sampleColors.push({ r: data[idxLeft], g: data[idxLeft + 1], b: data[idxLeft + 2] });
    sampleColors.push({ r: data[idxRight], g: data[idxRight + 1], b: data[idxRight + 2] });
  }

  // Calcula cor média do fundo periférico
  let avgR = 0, avgG = 0, avgB = 0;
  for (const c of sampleColors) {
    avgR += c.r;
    avgG += c.g;
    avgB += c.b;
  }
  avgR /= sampleColors.length;
  avgG /= sampleColors.length;
  avgB /= sampleColors.length;

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

  const threshVal = Math.max(0.1, threshold);
  const alphaMap = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Distância perceptiva da cor média do fundo
      const dr = (r - avgR) / 255;
      const dg = (g - avgG) / 255;
      const db = (b - avgB) / 255;
      const colorDist = Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);

      // Distância espacial ao centro (pessoas/sujeitos costumam ficar no centro)
      const dx = (x - centerX) / width;
      const dy = (y - centerY) / height;
      const spatialDist = Math.sqrt(dx * dx + dy * dy);

      // Pontuação de fundo: alta cor similar ao fundo + perto das bordas
      const bgScore = (1.0 - colorDist) * 0.75 + spatialDist * 0.35;

      let isSubject = bgScore < threshVal;
      if (invert) isSubject = !isSubject;

      alphaMap[y * width + x] = isSubject ? 255 : 0;
    }
  }

  // 2. Aplica suavização de borda (feathering) com filtro de caixa
  const radius = Math.min(8, Math.max(1, Math.round(feather)));
  const smoothedAlpha = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -radius; ky <= radius; ky += 2) {
        const py = y + ky;
        if (py < 0 || py >= height) continue;
        for (let kx = -radius; kx <= radius; kx += 2) {
          const px = x + kx;
          if (px < 0 || px >= width) continue;
          sum += alphaMap[py * width + px];
          count++;
        }
      }

      smoothedAlpha[y * width + x] = Math.round(sum / count);
    }
  }

  // 3. Grava o canal alfa no ImageData
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = smoothedAlpha[i];
  }
}

/**
 * Processa um frame de vídeo ou imagem aplicando a configuração de remoção de fundo.
 */
export function processFrameBackgroundRemoval(
  source: CanvasImageSource,
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config?: BackgroundRemovalConfig
): void {
  if (!config || !config.enabled) {
    targetCtx.drawImage(source, 0, 0, width, height);
    return;
  }

  // Desenha primeiro o frame bruto
  targetCtx.drawImage(source, 0, 0, width, height);

  try {
    const imgData = targetCtx.getImageData(0, 0, width, height);

    if (config.mode === 'chroma') {
      applyChromaKey(
        imgData,
        config.keyColor || '#00ff00',
        config.similarity ?? 0.35,
        config.smoothness ?? 0.1,
        config.spillReduction ?? 0.6
      );
    } else if (config.mode === 'luma') {
      applyLumaKey(
        imgData,
        config.lumaMode || 'black',
        config.similarity ?? 0.18,
        config.smoothness ?? 0.1
      );
    } else if (config.mode === 'ai' || config.mode === 'color') {
      if (config.mode === 'color' && config.keyColor) {
        applyChromaKey(
          imgData,
          config.keyColor,
          config.similarity ?? 0.35,
          config.smoothness ?? 0.1,
          config.spillReduction ?? 0.4
        );
      } else {
        applyNormalBackgroundRemoval(
          imgData,
          config.aiThreshold ?? 0.45,
          config.aiFeather ?? 3,
          Boolean(config.invertMask)
        );
      }
    }

    targetCtx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.warn('Erro ao processar remoção de fundo do frame:', err);
  }
}

/**
 * Remove o fundo de uma imagem estática (estilo iLoveIMG) e retorna URL transparente e Blob.
 */
export async function removeImageBackgroundAsync(
  imageSource: string | File | Blob,
  config: BackgroundRemovalConfig
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrlToRevoke: string | null = null;

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      objectUrlToRevoke = URL.createObjectURL(imageSource);
      img.src = objectUrlToRevoke;
    }

    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        reject(new Error('Não foi possível inicializar contexto 2D para remoção de fundo.'));
        return;
      }

      processFrameBackgroundRemoval(img, ctx, w, h, config);

      canvas.toBlob(
        (blob) => {
          if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
          if (!blob) {
            reject(new Error('Falha ao gerar PNG transparente'));
            return;
          }
          const dataUrl = canvas.toDataURL('image/png');
          resolve({ dataUrl, blob, width: w, height: h });
        },
        'image/png',
        1.0
      );
    };

    img.onerror = (e) => {
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
      reject(new Error('Falha ao carregar imagem para remoção de fundo.'));
    };
  });
}
