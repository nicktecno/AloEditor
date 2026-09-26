import { TimelineClip, ClipFilter, TransitionType } from '@/types/editor';

export interface TransitionState {
  opacity: number;
  scale: number;
  positionX: number; // percentage offset added to clip.transform.position.x
  positionY: number; // percentage offset added to clip.transform.position.y
  filterString: string;
}

export const EFFECT_PRESETS = [
  {
    id: 'cinema-teal-orange',
    name: 'Cinema Teal & Orange',
    description: 'Estilo cinematográfico com sombras frias e realce quente',
    badge: 'Cinema',
    color: '#06b6d4',
    filters: { brightness: 1.05, contrast: 1.3, saturation: 1.4, blur: 0, hueRotate: -15 },
  },
  {
    id: 'vintage-35mm',
    name: 'Vintage 35mm Film',
    description: 'Tom clássico nostálgico de filme analógico',
    badge: 'Retrô',
    color: '#f59e0b',
    filters: { brightness: 1.05, contrast: 1.15, saturation: 0.85, blur: 0, sepia: 0.35 },
  },
  {
    id: 'bw-dramatic',
    name: 'P&B Dramático Noir',
    description: 'Preto e branco de alto contraste para impacto visual',
    badge: 'Noir',
    color: '#94a3b8',
    filters: { brightness: 0.95, contrast: 1.55, saturation: 0, blur: 0, grayscale: 1 },
  },
  {
    id: 'cyber-glow',
    name: 'Glow Cibernético Neon',
    description: 'Cores vibrantes e saturadas estilo Cyberpunk',
    badge: 'Cyber',
    color: '#d946ef',
    filters: { brightness: 1.1, contrast: 1.35, saturation: 1.8, blur: 0, hueRotate: 45 },
  },
  {
    id: 'golden-hour',
    name: 'Pôr do Sol Dourado',
    description: 'Luz quente, suave e dourada de final de tarde',
    badge: 'Warm',
    color: '#eab308',
    filters: { brightness: 1.12, contrast: 1.1, saturation: 1.25, blur: 0, sepia: 0.2 },
  },
  {
    id: 'vhs-retro',
    name: 'Fita VHS Retrô',
    description: 'Textura vintage com leve suavização de bordas',
    badge: 'VHS',
    color: '#10b981',
    filters: { brightness: 1.08, contrast: 1.2, saturation: 1.35, blur: 0.8 },
  },
  {
    id: 'negative-art',
    name: 'Negativo Artístico',
    description: 'Inversão total de cores para efeitos criativos',
    badge: 'FX',
    color: '#ef4444',
    filters: { brightness: 1.0, contrast: 1.25, saturation: 1.0, blur: 0, invert: 1 },
  },
  {
    id: 'none',
    name: 'Original (Sem Efeito)',
    description: 'Restaura a imagem para o estado natural sem filtros',
    badge: 'Padrão',
    color: '#64748b',
    filters: { brightness: 1.0, contrast: 1.0, saturation: 1.0, blur: 0, sepia: 0, grayscale: 0, invert: 0, hueRotate: 0 },
  },
];

export const TRANSITION_PRESETS = [
  {
    type: 'fade' as TransitionType,
    name: 'Dissolve Cruzado (Fade)',
    description: 'Suavização contínua de opacidade de 0 a 100%',
  },
  {
    type: 'zoom' as TransitionType,
    name: 'Zoom Dinâmico (Scale In/Out)',
    description: 'Efeito de aproximação cinematográfica acelerada',
  },
  {
    type: 'slide-left' as TransitionType,
    name: 'Slide para Esquerda',
    description: 'Desliza suavemente a cena da direita para a esquerda',
  },
  {
    type: 'slide-right' as TransitionType,
    name: 'Slide para Direita',
    description: 'Desliza a cena da esquerda para a direita',
  },
  {
    type: 'flash' as TransitionType,
    name: 'Flash Branco (White Flash)',
    description: 'Clarão de luz branca no corte ou transição',
  },
  {
    type: 'glitch' as TransitionType,
    name: 'Glitch Digital',
    description: 'Distorção rápida e estilizada no momento do corte',
  },
];

/**
 * Calcula o estado dinâmico de transição (opacidade, escala, posição, filtro)
 * com base na posição do playhead na timeline.
 */
export function getClipTransitionState(clip: TimelineClip, currentTime: number): TransitionState {
  let opacity = clip.transform.opacity !== undefined ? clip.transform.opacity : 1.0;
  let scale = clip.transform.scale || 1.0;
  let posXOffset = 0;
  let posYOffset = 0;

  const filters = clip.filters || { brightness: 1, contrast: 1, saturation: 1, blur: 0 };
  let brightness = filters.brightness !== undefined ? filters.brightness : 1;
  let contrast = filters.contrast !== undefined ? filters.contrast : 1;
  let saturation = filters.saturation !== undefined ? filters.saturation : 1;
  let blur = filters.blur || 0;
  let sepia = filters.sepia || 0;
  let grayscale = filters.grayscale || 0;
  let invert = filters.invert || 0;
  let hueRotate = filters.hueRotate || 0;

  const timeFromStart = currentTime - clip.startInTimeline;
  const timeFromEnd = (clip.startInTimeline + clip.duration) - currentTime;

  // 1. Processa Transição de Entrada (Transition IN)
  if (clip.transitionIn && clip.transitionIn.type !== 'none' && clip.transitionIn.duration > 0) {
    const dur = clip.transitionIn.duration;
    if (timeFromStart >= 0 && timeFromStart < dur) {
      const progress = Math.max(0, Math.min(1, timeFromStart / dur));
      // Curva de transição suave (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 2);

      switch (clip.transitionIn.type) {
        case 'fade':
          opacity *= easeProgress;
          break;
        case 'zoom':
          scale *= 0.4 + 0.6 * easeProgress;
          opacity *= Math.min(1, easeProgress * 1.5);
          break;
        case 'slide-left':
          posXOffset += (1 - easeProgress) * 60;
          opacity *= Math.min(1, easeProgress * 1.4);
          break;
        case 'slide-right':
          posXOffset -= (1 - easeProgress) * 60;
          opacity *= Math.min(1, easeProgress * 1.4);
          break;
        case 'flash':
          brightness += (1 - easeProgress) * 2.8;
          contrast += (1 - easeProgress) * 0.5;
          break;
        case 'glitch':
          if (progress < 0.8) {
            posXOffset += (Math.sin(timeFromStart * 80) * 4);
            hueRotate += Math.sin(timeFromStart * 60) * 90;
            contrast += 0.4;
          }
          break;
      }
    }
  }

  // 2. Processa Transição de Saída (Transition OUT)
  if (clip.transitionOut && clip.transitionOut.type !== 'none' && clip.transitionOut.duration > 0) {
    const dur = clip.transitionOut.duration;
    if (timeFromEnd >= 0 && timeFromEnd < dur) {
      const progress = Math.max(0, Math.min(1, timeFromEnd / dur));
      const easeProgress = 1 - Math.pow(1 - progress, 2);

      switch (clip.transitionOut.type) {
        case 'fade':
          opacity *= easeProgress;
          break;
        case 'zoom':
          scale *= 0.4 + 0.6 * easeProgress;
          opacity *= Math.min(1, easeProgress * 1.5);
          break;
        case 'slide-left':
          posXOffset -= (1 - easeProgress) * 60;
          opacity *= Math.min(1, easeProgress * 1.4);
          break;
        case 'slide-right':
          posXOffset += (1 - easeProgress) * 60;
          opacity *= Math.min(1, easeProgress * 1.4);
          break;
        case 'flash':
          brightness += (1 - easeProgress) * 2.8;
          break;
        case 'glitch':
          if (progress < 0.8) {
            posXOffset += (Math.sin(timeFromEnd * 80) * 4);
            hueRotate += Math.sin(timeFromEnd * 60) * 90;
          }
          break;
      }
    }
  }

  // 3. Monta a string de filtros compatível com CSS e Canvas
  const filterParts = [
    `brightness(${brightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    `saturate(${saturation.toFixed(2)})`,
    blur > 0 ? `blur(${blur}px)` : '',
    sepia > 0 ? `sepia(${sepia.toFixed(2)})` : '',
    grayscale > 0 ? `grayscale(${grayscale.toFixed(2)})` : '',
    invert > 0 ? `invert(${invert.toFixed(2)})` : '',
    hueRotate !== 0 ? `hue-rotate(${Math.round(hueRotate)}deg)` : '',
  ].filter(Boolean);

  return {
    opacity: Math.max(0, Math.min(1, opacity)),
    scale,
    positionX: posXOffset,
    positionY: posYOffset,
    filterString: filterParts.join(' '),
  };
}

/**
 * Calcula o volume de áudio dinâmico de um clipe (vídeo ou áudio)
 * aplicando curvas de fade in (transitionIn) e fade out (transitionOut).
 */
export function getClipAudioVolume(clip: TimelineClip, currentTime: number): number {
  if (clip.isMuted) return 0;
  let baseVolume = clip.volume !== undefined ? clip.volume : 1.0;
  if (baseVolume <= 0) return 0;

  const timeFromStart = currentTime - clip.startInTimeline;
  const timeFromEnd = (clip.startInTimeline + clip.duration) - currentTime;

  // 1. Fade In de áudio (transitionIn)
  if (clip.transitionIn && clip.transitionIn.type !== 'none' && clip.transitionIn.duration > 0) {
    const dur = clip.transitionIn.duration;
    if (timeFromStart >= 0 && timeFromStart < dur) {
      const progress = Math.max(0, Math.min(1, timeFromStart / dur));
      // Curva suave para atenuação auditiva natural (equal-power / quadratic ease)
      const easeProgress = 1 - Math.pow(1 - progress, 2);
      baseVolume *= easeProgress;
    }
  }

  // 2. Fade Out de áudio (transitionOut)
  if (clip.transitionOut && clip.transitionOut.type !== 'none' && clip.transitionOut.duration > 0) {
    const dur = clip.transitionOut.duration;
    if (timeFromEnd >= 0 && timeFromEnd < dur) {
      const progress = Math.max(0, Math.min(1, timeFromEnd / dur));
      const easeProgress = 1 - Math.pow(1 - progress, 2);
      baseVolume *= easeProgress;
    }
  }

  return Math.max(0, Math.min(1.5, baseVolume));
}

