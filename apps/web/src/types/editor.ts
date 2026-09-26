export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '21:9';

export type MediaType = 'video' | 'audio' | 'image' | 'text';

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  driveFileId?: string;
  duration: number; // in seconds
  thumbnailUrl?: string;
  dimensions?: { width: number; height: number };
  size?: number; // bytes
  isDrive?: boolean;
}

export interface ClipTransform {
  scale: number;
  position: { x: number; y: number };
  rotation: number;
  opacity: number;
}

export interface ClipFilter {
  brightness: number; // 100% is 1
  contrast: number; // 100% is 1
  saturation: number; // 100% is 1
  blur: number; // in px
  hueRotate?: number; // in degrees
  sepia?: number; // 0 to 1
  invert?: number; // 0 to 1
  grayscale?: number; // 0 to 1
}

export type TransitionType = 'none' | 'fade' | 'zoom' | 'slide-left' | 'slide-right' | 'flash' | 'glitch';

export interface ClipTransition {
  type: TransitionType;
  duration: number; // in seconds (e.g. 0.8)
}

export interface ClipStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '900';
  color: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textAlign: 'left' | 'center' | 'right';
  shadowColor?: string;
  shadowBlur?: number;
}

export type BackgroundRemovalMode = 'chroma' | 'ai' | 'luma' | 'color';

export interface BackgroundRemovalConfig {
  enabled: boolean;
  mode: BackgroundRemovalMode;
  keyColor?: string; // hex like '#00ff00' for chroma
  similarity?: number; // 0 to 1 (tolerance)
  smoothness?: number; // 0 to 1 (edge softness / feather)
  spillReduction?: number; // 0 to 1 (suppress green/blue spill on edges)
  aiThreshold?: number; // 0 to 1 (threshold for normal background / subject isolation)
  aiFeather?: number; // in pixels (0 to 10)
  invertMask?: boolean; // invert background and foreground
  lumaMode?: 'black' | 'white'; // for luma keying
}

export interface TimelineClip {
  id: string;
  trackId: string;
  assetId?: string;
  name: string;
  type: MediaType;
  startInTimeline: number; // start time in timeline (seconds)
  duration: number; // duration on timeline (seconds)
  trimStart: number; // start offset in media source (seconds)
  trimEnd: number; // end offset in media source (seconds)
  speed: number;
  volume: number;
  isMuted?: boolean;
  text?: string;
  textStyle?: ClipStyle;
  transform: ClipTransform;
  filters: ClipFilter;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
  effect?: string;
  backgroundRemoval?: BackgroundRemovalConfig;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: MediaType;
  isMuted: boolean;
  isLocked: boolean;
  isHidden: boolean;
  order: number;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatio;
}

export interface Project {
  id: string;
  name: string;
  settings: ProjectSettings;
  duration: number;
  assets: MediaAsset[];
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  createdAt: string;
  updatedAt: string;
  driveFileId?: string;
}

export type SidebarTab = 'media' | 'audio' | 'text' | 'effects' | 'transitions' | 'bg-remover';
export type InspectorTab = 'video' | 'audio' | 'speed' | 'filters' | 'text' | 'transitions' | 'chroma';
