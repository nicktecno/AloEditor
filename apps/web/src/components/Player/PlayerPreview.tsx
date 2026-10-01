'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useEditor } from '@/context/EditorContext';
import { getClipTransitionState, getClipAudioVolume } from '@/utils/transitionUtils';
import { processFrameBackgroundRemoval } from '@/utils/backgroundRemoval';
import { GENERIC_VIDEO_THUMBNAIL, captureVideoThumbnail, getMediaDuration, handleThumbnailError } from '@/utils/thumbnailGenerator';
import { createWebGLVideoPipeline, seekHardwareAccelerated, WebGLVideoPipeline } from '@/utils/webglRenderer';
import { MediaAsset } from '@/types/editor';
import { AlertTriangle, FolderSearch, Cloud } from 'lucide-react';
import styles from './Player.module.css';

const formatTimecode = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};

const AudioTrackPlayer: React.FC<{
  clip: any;
  assetUrl: string;
  currentTime: number;
  isPlaying: boolean;
  onSyncDuration?: (assetId: string, duration: number) => void;
}> = ({ clip, assetUrl, currentTime, isPlaying, onSyncDuration }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastClipIdRef = useRef<string | null>(null);
  const isAudioPlayPendingRef = useRef<boolean>(false);

  const safePlayAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isAudioPlayPendingRef.current || !audio.paused) return;
    isAudioPlayPendingRef.current = true;
    const promise = audio.play();
    if (promise !== undefined) {
      promise
        .catch(() => {})
        .finally(() => {
          isAudioPlayPendingRef.current = false;
        });
    } else {
      isAudioPlayPendingRef.current = false;
    }
  }, []);

  const safePauseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isAudioPlayPendingRef.current) {
      audio.play().then(() => {
        audio.pause();
        isAudioPlayPendingRef.current = false;
      }).catch(() => {
        audio.pause();
        isAudioPlayPendingRef.current = false;
      });
    } else if (!audio.paused) {
      audio.pause();
    }
  }, []);

  // Isolate play/pause transitions from continuous currentTime frames
  useEffect(() => {
    if (isPlaying) {
      safePlayAudio();
    } else {
      safePauseAudio();
    }
  }, [isPlaying, clip.id, safePlayAudio, safePauseAudio]);

  useEffect(() => {
    if (!audioRef.current) return;
    const mediaOffset = clip.trimStart + (currentTime - clip.startInTimeline) * clip.speed;

    const dynVol = getClipAudioVolume(clip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = clip.isMuted || targetVol === 0;

    if (audioRef.current.muted !== shouldMute) {
      audioRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(audioRef.current.volume - targetVol) > 0.02) {
        audioRef.current.volume = targetVol;
      }
    } catch {}

    const targetRate = clip.speed || 1.0;
    if (audioRef.current.playbackRate !== targetRate) {
      audioRef.current.playbackRate = targetRate;
    }

    const isClipSwitch = lastClipIdRef.current !== clip.id;
    lastClipIdRef.current = clip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(audioRef.current.currentTime - mediaOffset) > 0.05) {
        audioRef.current.currentTime = mediaOffset;
      }
    } else {
      // While playing: only seek if switching clip or scrubbed (> 1.2s drift), avoiding audio clicks/stutters
      if (isClipSwitch || Math.abs(audioRef.current.currentTime - mediaOffset) > 1.2) {
        audioRef.current.currentTime = mediaOffset;
      }
    }
  }, [currentTime, isPlaying, clip]);

  return (
    <audio
      ref={audioRef}
      src={assetUrl}
      preload="auto"
      playsInline
      style={{ display: 'none' }}
      onLoadedMetadata={(e) => {
        const a = e.currentTarget;
        if (a && a.duration && !isNaN(a.duration) && isFinite(a.duration) && a.duration > 0) {
          onSyncDuration?.(clip.assetId, a.duration);
        }
      }}
    />
  );
};

export const PlayerPreview: React.FC = () => {
  const {
    project,
    currentTime,
    setCurrentTime,
    isPlaying,
    selectedClipIds,
    selectClip,
    updateClip,
    commitHistory,
    syncMediaDuration,
    addClipToTrack,
    addAsset,
    updateAssetThumbnail,
    setInspectorTab,
    setIsRelinkModalOpen,
    markAssetOffline,
    markAssetAuthExpired,
    googleAccessToken,
    loginWithGoogle,
    setIsDrivePickerOpen,
    previewQuality,
  } = useEditor();

  const [isBuffering, setIsBuffering] = React.useState(false);
  const [isVideoReady, setIsVideoReady] = React.useState(false);
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const isMainPlayPendingRef = useRef<boolean>(false);
  const isOverlayPlayPendingRef = useRef<boolean>(false);

  const safePlayMain = useCallback(() => {
    const vid = mainVideoRef.current;
    if (!vid || isMainPlayPendingRef.current || !vid.paused) return;
    isMainPlayPendingRef.current = true;
    const promise = vid.play();
    if (promise !== undefined) {
      promise
        .catch((err) => {
          if (err.name === 'NotAllowedError' && !vid.muted) {
            vid.muted = true;
            return vid.play();
          }
        })
        .catch(() => {})
        .finally(() => {
          isMainPlayPendingRef.current = false;
        });
    } else {
      isMainPlayPendingRef.current = false;
    }
  }, []);

  const safePauseMain = useCallback(() => {
    const vid = mainVideoRef.current;
    if (!vid) return;
    if (isMainPlayPendingRef.current) {
      vid.play().then(() => {
        vid.pause();
        isMainPlayPendingRef.current = false;
      }).catch(() => {
        vid.pause();
        isMainPlayPendingRef.current = false;
      });
    } else if (!vid.paused) {
      vid.pause();
    }
  }, []);

  const safePlayOverlay = useCallback(() => {
    const vid = overlayVideoRef.current;
    if (!vid || isOverlayPlayPendingRef.current || !vid.paused) return;
    isOverlayPlayPendingRef.current = true;
    const promise = vid.play();
    if (promise !== undefined) {
      promise
        .catch((err) => {
          if (err.name === 'NotAllowedError' && !vid.muted) {
            vid.muted = true;
            return vid.play();
          }
        })
        .catch(() => {})
        .finally(() => {
          isOverlayPlayPendingRef.current = false;
        });
    } else {
      isOverlayPlayPendingRef.current = false;
    }
  }, []);

  const safePauseOverlay = useCallback(() => {
    const vid = overlayVideoRef.current;
    if (!vid) return;
    if (isOverlayPlayPendingRef.current) {
      vid.play().then(() => {
        vid.pause();
        isOverlayPlayPendingRef.current = false;
      }).catch(() => {
        vid.pause();
        isOverlayPlayPendingRef.current = false;
      });
    } else if (!vid.paused) {
      vid.pause();
    }
  }, []);

  const handleWaiting = () => {
    if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
    bufferTimeoutRef.current = setTimeout(() => {
      setIsBuffering(true);
    }, 300);
  };

  const handleCanPlay = useCallback(() => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    setIsBuffering(false);
    setIsVideoReady(true);
    if (isPlaying) {
      safePlayMain();
      safePlayOverlay();
    }
  }, [isPlaying, safePlayMain, safePlayOverlay]);

  // Hardware Acceleration Refs & RAF Throttling
  const pendingMainSeekRef = useRef<number | null>(null);
  const mainSeekRafRef = useRef<number | null>(null);
  const pendingOverlaySeekRef = useRef<number | null>(null);
  const overlaySeekRafRef = useRef<number | null>(null);

  const mainWebGLPipelineRef = useRef<WebGLVideoPipeline | null>(null);
  const overlayWebGLPipelineRef = useRef<WebGLVideoPipeline | null>(null);

  const requestMainHardwareSeek = useCallback((targetTime: number, allowFast = true) => {
    pendingMainSeekRef.current = targetTime;
    if (mainSeekRafRef.current === null) {
      mainSeekRafRef.current = requestAnimationFrame(() => {
        mainSeekRafRef.current = null;
        const vid = mainVideoRef.current;
        if (vid && pendingMainSeekRef.current !== null) {
          if (vid.seeking) {
            const onSeeked = () => {
              vid.removeEventListener('seeked', onSeeked);
              if (pendingMainSeekRef.current !== null) {
                seekHardwareAccelerated(vid, pendingMainSeekRef.current, allowFast);
                pendingMainSeekRef.current = null;
              }
            };
            vid.addEventListener('seeked', onSeeked, { once: true });
            return;
          }
          seekHardwareAccelerated(vid, pendingMainSeekRef.current, allowFast);
          pendingMainSeekRef.current = null;
        }
      });
    }
  }, []);

  const requestOverlayHardwareSeek = useCallback((targetTime: number, allowFast = true) => {
    pendingOverlaySeekRef.current = targetTime;
    if (overlaySeekRafRef.current === null) {
      overlaySeekRafRef.current = requestAnimationFrame(() => {
        overlaySeekRafRef.current = null;
        const vid = overlayVideoRef.current;
        if (vid && pendingOverlaySeekRef.current !== null) {
          if (vid.seeking) {
            const onSeeked = () => {
              vid.removeEventListener('seeked', onSeeked);
              if (pendingOverlaySeekRef.current !== null) {
                seekHardwareAccelerated(vid, pendingOverlaySeekRef.current, allowFast);
                pendingOverlaySeekRef.current = null;
              }
            };
            vid.addEventListener('seeked', onSeeked, { once: true });
            return;
          }
          seekHardwareAccelerated(vid, pendingOverlaySeekRef.current, allowFast);
          pendingOverlaySeekRef.current = null;
        }
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (mainSeekRafRef.current) cancelAnimationFrame(mainSeekRafRef.current);
      if (overlaySeekRafRef.current) cancelAnimationFrame(overlaySeekRafRef.current);
      if (mainWebGLPipelineRef.current) mainWebGLPipelineRef.current.destroy();
      if (overlayWebGLPipelineRef.current) overlayWebGLPipelineRef.current.destroy();
    };
  }, []);

  // Dragging state for free-form text positioning
  const [draggingTextId, setDraggingTextId] = React.useState<string | null>(null);
  const [dragCoords, setDragCoords] = React.useState<{ x: number; y: number } | null>(null);
  const [snapGuideX, setSnapGuideX] = React.useState<boolean>(false);
  const [snapGuideY, setSnapGuideY] = React.useState<boolean>(false);

  // Find active video clip on main track
  const activeMainClip = project.clips.find(
    (c) =>
      c.trackId === 'track_video_main' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active overlay clip
  const activeOverlayClip = project.clips.find(
    (c) =>
      c.trackId === 'track_video_overlay' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active text clips
  const activeTextClips = project.clips.filter(
    (c) =>
      c.type === 'text' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Find active audio clips (including detached audio clips and background music)
  const activeAudioClips = project.clips.filter(
    (c) =>
      c.type === 'audio' &&
      currentTime >= c.startInTimeline &&
      currentTime < c.startInTimeline + c.duration
  );

  // Lookup asset for media URL
  const mainAsset = activeMainClip
    ? project.assets.find((a) => a.id === activeMainClip.assetId)
    : null;

  const overlayAsset = activeOverlayClip
    ? project.assets.find((a) => a.id === activeOverlayClip.assetId)
    : null;

  // Compute live transitions and effects
  const mainTrans = activeMainClip ? getClipTransitionState(activeMainClip, currentTime) : null;
  const overlayTrans = activeOverlayClip ? getClipTransitionState(activeOverlayClip, currentTime) : null;

  const lastMainClipIdRef = useRef<string | null>(null);
  const lastOverlayClipIdRef = useRef<string | null>(null);
  const isVideoDrivingTimelineRef = useRef<boolean>(false);

  // Drive timeline smoothly from main video playback without decoder resets
  useEffect(() => {
    if (!isPlaying || !activeMainClip || !mainVideoRef.current) return;

    let animId: number;
    let videoFrameCallbackId: number | null = null;
    const vid = mainVideoRef.current;

    const onFrame = () => {
      if (vid && !vid.paused && vid.readyState >= 2) {
        const vTime = vid.currentTime;
        const timelineTime = activeMainClip.startInTimeline + (vTime - activeMainClip.trimStart) / activeMainClip.speed;

        if (timelineTime >= activeMainClip.startInTimeline + activeMainClip.duration) {
          setCurrentTime(activeMainClip.startInTimeline + activeMainClip.duration);
          return;
        }

        isVideoDrivingTimelineRef.current = true;
        setCurrentTime(timelineTime);
      }

      if ('requestVideoFrameCallback' in vid && typeof (vid as any).requestVideoFrameCallback === 'function') {
        videoFrameCallbackId = (vid as any).requestVideoFrameCallback(onFrame);
      } else {
        animId = requestAnimationFrame(onFrame);
      }
    };

    if ('requestVideoFrameCallback' in vid && typeof (vid as any).requestVideoFrameCallback === 'function') {
      videoFrameCallbackId = (vid as any).requestVideoFrameCallback(onFrame);
    } else {
      animId = requestAnimationFrame(onFrame);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in vid) {
        (vid as any).cancelVideoFrameCallback(videoFrameCallbackId);
      }
    };
  }, [isPlaying, activeMainClip?.id, activeMainClip?.startInTimeline, activeMainClip?.trimStart, activeMainClip?.speed, activeMainClip?.duration, setCurrentTime]);

  // Isolated Play/Pause state transition effect - never runs on 60fps currentTime updates
  useEffect(() => {
    if (isPlaying) {
      if (activeMainClip) safePlayMain();
      if (activeOverlayClip) safePlayOverlay();
    } else {
      safePauseMain();
      safePauseOverlay();
    }
  }, [isPlaying, activeMainClip?.id, activeOverlayClip?.id, safePlayMain, safePauseMain, safePlayOverlay, safePauseOverlay]);

  // Sync main video playback time & state & audio volume
  useEffect(() => {
    if (!mainVideoRef.current || !activeMainClip) return;

    const mediaOffset = activeMainClip.trimStart + (currentTime - activeMainClip.startInTimeline) * activeMainClip.speed;

    const dynVol = getClipAudioVolume(activeMainClip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = activeMainClip.isMuted || targetVol === 0;

    if (mainVideoRef.current.muted !== shouldMute) {
      mainVideoRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(mainVideoRef.current.volume - targetVol) > 0.02) {
        mainVideoRef.current.volume = targetVol;
      }
    } catch {}

    const targetRate = activeMainClip.speed || 1.0;
    if (mainVideoRef.current.playbackRate !== targetRate) {
      mainVideoRef.current.playbackRate = targetRate;
    }

    const isClipSwitch = lastMainClipIdRef.current !== activeMainClip.id;
    lastMainClipIdRef.current = activeMainClip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(mainVideoRef.current.currentTime - mediaOffset) > 0.05) {
        requestMainHardwareSeek(mediaOffset, true);
      }
    } else {
      // While playing: if timeline was advanced by the video element, DO NOT seek (prevents buffer cancellation)
      if (isVideoDrivingTimelineRef.current) {
        isVideoDrivingTimelineRef.current = false;
      } else {
        // Only seek if switching clips or user clicked/scrubbed far away (> 1.5s jump)
        if (isClipSwitch || Math.abs(mainVideoRef.current.currentTime - mediaOffset) > 1.5) {
          requestMainHardwareSeek(mediaOffset, true);
          if (isClipSwitch) {
            safePlayMain();
          }
        }
      }
    }
  }, [currentTime, isPlaying, activeMainClip, requestMainHardwareSeek, safePlayMain]);

  // Sync overlay video playback time & state & audio volume
  useEffect(() => {
    if (!overlayVideoRef.current || !activeOverlayClip) return;

    const mediaOffset = activeOverlayClip.trimStart + (currentTime - activeOverlayClip.startInTimeline) * activeOverlayClip.speed;

    const dynVol = getClipAudioVolume(activeOverlayClip, currentTime);
    const targetVol = Math.max(0, Math.min(1, dynVol));
    const shouldMute = activeOverlayClip.isMuted || targetVol === 0;

    if (overlayVideoRef.current.muted !== shouldMute) {
      overlayVideoRef.current.muted = shouldMute;
    }
    try {
      if (Math.abs(overlayVideoRef.current.volume - targetVol) > 0.02) {
        overlayVideoRef.current.volume = targetVol;
      }
    } catch {}

    const targetRate = activeOverlayClip.speed || 1.0;
    if (overlayVideoRef.current.playbackRate !== targetRate) {
      overlayVideoRef.current.playbackRate = targetRate;
    }

    const isClipSwitch = lastOverlayClipIdRef.current !== activeOverlayClip.id;
    lastOverlayClipIdRef.current = activeOverlayClip.id;

    if (!isPlaying) {
      if (isClipSwitch || Math.abs(overlayVideoRef.current.currentTime - mediaOffset) > 0.05) {
        requestOverlayHardwareSeek(mediaOffset, true);
      }
    } else {
      // While playing: only hard seek on clip switch or significant user scrub (> 1.5s)
      if (isClipSwitch || Math.abs(overlayVideoRef.current.currentTime - mediaOffset) > 1.5) {
        requestOverlayHardwareSeek(mediaOffset, true);
        if (isClipSwitch) {
          safePlayOverlay();
        }
      }
    }
  }, [currentTime, isPlaying, activeOverlayClip, requestOverlayHardwareSeek, safePlayOverlay]);

  // Real-time Hardware WebGL Chroma Key & Background Removal for Overlay Video/Image
  useEffect(() => {
    let animId: number;
    const renderOverlayChroma = () => {
      if (!activeOverlayClip?.backgroundRemoval?.enabled) return;
      if (
        overlayVideoRef.current &&
        overlayCanvasRef.current &&
        overlayVideoRef.current.readyState >= 2
      ) {
        const vid = overlayVideoRef.current;
        const canvas = overlayCanvasRef.current;
        const w = vid.videoWidth || 640;
        const h = vid.videoHeight || 360;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        // Tenta renderizar via WebGL acelerado por GPU
        if (!overlayWebGLPipelineRef.current) {
          overlayWebGLPipelineRef.current = createWebGLVideoPipeline(canvas);
        }

        if (overlayWebGLPipelineRef.current) {
          try {
            overlayWebGLPipelineRef.current.render(vid, {
              backgroundRemoval: activeOverlayClip.backgroundRemoval,
            });
          } catch {
            overlayWebGLPipelineRef.current = null;
          }
        } else {
          // Fallback seguro CPU Canvas 2D
          const ctx = canvas.getContext('2d');
          if (ctx) {
            processFrameBackgroundRemoval(vid, ctx, w, h, activeOverlayClip.backgroundRemoval);
          }
        }
      }
      animId = requestAnimationFrame(renderOverlayChroma);
    };

    if (activeOverlayClip?.backgroundRemoval?.enabled) {
      animId = requestAnimationFrame(renderOverlayChroma);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeOverlayClip, activeOverlayClip?.backgroundRemoval, isPlaying]);

  // Real-time Hardware WebGL Chroma Key & Background Removal for Main Video/Image
  useEffect(() => {
    let animId: number;
    const renderMainChroma = () => {
      if (!activeMainClip?.backgroundRemoval?.enabled) return;
      if (
        mainVideoRef.current &&
        mainCanvasRef.current &&
        mainVideoRef.current.readyState >= 2
      ) {
        const vid = mainVideoRef.current;
        const canvas = mainCanvasRef.current;
        const w = vid.videoWidth || 1280;
        const h = vid.videoHeight || 720;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        // Tenta renderizar via WebGL acelerado por GPU
        if (!mainWebGLPipelineRef.current) {
          mainWebGLPipelineRef.current = createWebGLVideoPipeline(canvas);
        }

        if (mainWebGLPipelineRef.current) {
          try {
            mainWebGLPipelineRef.current.render(vid, {
              backgroundRemoval: activeMainClip.backgroundRemoval,
            });
          } catch {
            mainWebGLPipelineRef.current = null;
          }
        } else {
          // Fallback seguro CPU Canvas 2D
          const ctx = canvas.getContext('2d');
          if (ctx) {
            processFrameBackgroundRemoval(vid, ctx, w, h, activeMainClip.backgroundRemoval);
          }
        }
      }
      animId = requestAnimationFrame(renderMainChroma);
    };

    if (activeMainClip?.backgroundRemoval?.enabled) {
      animId = requestAnimationFrame(renderMainChroma);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [activeMainClip, activeMainClip?.backgroundRemoval, isPlaying]);

  // Free-form pointer dragging handler for text overlays
  const handleTextPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    textClip: any
  ) => {
    e.stopPropagation();
    e.preventDefault();

    selectClip(textClip.id, false);
    setInspectorTab('text');

    if (!frameRef.current) return;
    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const initialPosX = textClip.transform.position.x;
    const initialPosY = textClip.transform.position.y;
    let didMove = false;

    setDraggingTextId(textClip.id);
    setDragCoords({ x: initialPosX, y: initialPosY });

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaPercentX = ((moveEvent.clientX - startPointerX) / rect.width) * 100;
      const deltaPercentY = ((moveEvent.clientY - startPointerY) / rect.height) * 100;

      let targetX = initialPosX + deltaPercentX;
      let targetY = initialPosY + deltaPercentY;

      // Restrict within comfortable bounds
      targetX = Math.max(2, Math.min(98, targetX));
      targetY = Math.max(2, Math.min(98, targetY));

      let isSnappedX = false;
      let isSnappedY = false;

      // Magnetic Snapping to Center X (50%)
      if (Math.abs(targetX - 50) < 2.5) {
        targetX = 50;
        isSnappedX = true;
      }

      // Magnetic Snapping to Center Y (50%)
      if (Math.abs(targetY - 50) < 2.5) {
        targetY = 50;
        isSnappedY = true;
      }
      // Subtitle / Lower Third Y (82%)
      else if (Math.abs(targetY - 82) < 2.2) {
        targetY = 82;
        isSnappedY = true;
      }
      // Header Y (15%)
      else if (Math.abs(targetY - 15) < 2.2) {
        targetY = 15;
        isSnappedY = true;
      }

      setSnapGuideX(isSnappedX);
      setSnapGuideY(isSnappedY);

      const roundedX = Math.round(targetX * 10) / 10;
      const roundedY = Math.round(targetY * 10) / 10;

      if (Math.abs(roundedX - initialPosX) > 0.1 || Math.abs(roundedY - initialPosY) > 0.1) {
        didMove = true;
      }

      setDragCoords({ x: roundedX, y: roundedY });

      updateClip(textClip.id, {
        transform: {
          ...textClip.transform,
          position: { x: roundedX, y: roundedY },
        },
      });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setDraggingTextId(null);
      setDragCoords(null);
      setSnapGuideX(false);
      setSnapGuideY(false);
      if (didMove) {
        commitHistory();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Quick preset positioning
  const handleApplyTextPreset = (clipId: string, posX: number, posY: number) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    updateClip(
      clipId,
      {
        transform: {
          ...clip.transform,
          position: { x: posX, y: posY },
        },
      },
      true
    );
  };

  // Aspect ratio class mapper
  const ratioClassMap: Record<string, string> = {
    '16:9': styles.frame16x9,
    '9:16': styles.frame9x16,
    '1:1': styles.frame1x1,
    '4:5': styles.frame4x5,
    '21:9': styles.frame21x9,
  };

  const hasVideoClips = project.clips.some(
    (c) => c.type === 'video' || c.trackId === 'track_video_main' || c.trackId === 'track_video_overlay'
  );

  const handlePreviewDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handlePreviewDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (rawData) {
        const asset = JSON.parse(rawData) as MediaAsset;
        addClipToTrack(asset, asset.type === 'audio' ? 'track_audio_bg' : 'track_video_main', !hasVideoClips ? 0 : currentTime);
        return;
      }
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isVideo = file.type.startsWith('video');
          const isAudio = file.type.startsWith('audio');
          let detectedDuration = 10.0;
          if (isVideo || isAudio) {
            try {
              detectedDuration = await getMediaDuration(file, isAudio);
            } catch {}
          }
          const assetId = `asset_upload_${Date.now()}_${i}`;
          const url = URL.createObjectURL(file);
          const newAsset: MediaAsset = {
            id: assetId,
            name: file.name,
            type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
            url,
            duration: detectedDuration,
            size: file.size,
            status: 'ready',
            preloadProgress: 100,
            thumbnailUrl: isVideo ? GENERIC_VIDEO_THUMBNAIL : undefined,
          };
          addAsset(newAsset);
          if (isVideo) {
            captureVideoThumbnail(file, 0.5, (dur) => {
              if (dur && dur > 0 && Math.abs(dur - detectedDuration) > 0.5) {
                syncMediaDuration(assetId, dur);
              }
            }).then((captured) => {
              if (captured && captured !== GENERIC_VIDEO_THUMBNAIL) {
                updateAssetThumbnail(assetId, captured);
              }
            });
          }
          addClipToTrack(newAsset, isAudio ? 'track_audio_bg' : 'track_video_main', !hasVideoClips ? 0 : currentTime);
        }
      }
    } catch (err) {
      console.error('Erro ao soltar mídia no preview:', err);
    }
  };

  const frameClass = ratioClassMap[project.settings.aspectRatio] || styles.frame16x9;

  return (
    <div
      className={styles.viewportArea}
      onDragOver={handlePreviewDragOver}
      onDrop={handlePreviewDrop}
    >
      <div ref={frameRef} className={`${styles.aspectFrame} ${frameClass}`}>
        {/* Importing Floating Pill (Only when no playable stream/proxy URL exists yet) */}
        {mainAsset && !mainAsset.proxyUrl && !mainAsset.url && mainAsset.status === 'importing' && (
          <div className={styles.playerImportingOverlay}>
            <div className={styles.playerImportingSpinner} />
            <div className={styles.playerImportingText}>
              <span>Importando mídia ({mainAsset.preloadProgress ?? 0}%)...</span>
            </div>
          </div>
        )}

        {/* Main Video or Image Layer */}
        {activeMainClip && mainAsset ? (
          <>
            {/* Low-Quality Proxy / Poster Underlay Layer (Behind video, never black screen) */}
            <div
              className={styles.proxyUnderlayLayer}
              style={{
                transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                opacity: mainTrans?.opacity ?? 1,
                filter: mainTrans?.filterString || undefined,
              }}
            >
              <img
                src={mainAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                alt={activeMainClip.name}
                className={styles.proxyUnderlayImg}
                onError={handleThumbnailError}
              />
            </div>

            {mainAsset.type === 'image' || activeMainClip.type === 'image' ? (
              <img
                src={mainAsset.url}
                alt={activeMainClip.name}
                className={styles.videoLayer}
                style={{
                  objectFit: 'contain',
                  transform: `translate(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  zIndex: 2,
                }}
              />
            ) : (
              <video
                ref={mainVideoRef}
                src={mainAsset.proxyUrl || mainAsset.url}
                className={styles.videoLayer}
                playsInline
                preload="auto"
                poster={mainAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                muted={activeMainClip.isMuted}
                onWaiting={handleWaiting}
                onCanPlay={handleCanPlay}
                onPlaying={handleCanPlay}
                onSeeked={handleCanPlay}
                onError={(e) => {
                  handleCanPlay();
                  const target = e.currentTarget;
                  if (mainAsset) {
                    if (mainAsset.isDrive) {
                      if (!mainAsset.proxyUrl) {
                        markAssetAuthExpired(mainAsset.id, true);
                      }
                    } else if (target.error?.code === 4) {
                      fetch(mainAsset.url).catch(() => {
                        markAssetOffline(mainAsset.id);
                      });
                    }
                  }
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v && v.duration && !isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
                    syncMediaDuration(mainAsset.id, v.duration);
                  }
                }}
                style={{
                  display: activeMainClip.backgroundRemoval?.enabled ? 'none' : 'block',
                  transform: `translate3d(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%, 0) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  willChange: 'transform',
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  zIndex: 2,
                }}
              />
            )}
            {activeMainClip.backgroundRemoval?.enabled && (
              <canvas
                ref={mainCanvasRef}
                className={styles.videoLayer}
                style={{
                  transform: `translate3d(${(activeMainClip.transform.position.x - 50) + (mainTrans?.positionX || 0)}%, ${(activeMainClip.transform.position.y - 50) + (mainTrans?.positionY || 0)}%, 0) scale(${mainTrans?.scale || 1}) rotate(${activeMainClip.transform.rotation}deg)`,
                  willChange: 'transform',
                  opacity: mainTrans?.opacity ?? 1,
                  filter: mainTrans?.filterString || undefined,
                  objectFit: 'contain',
                  zIndex: 3,
                }}
              />
            )}

            {/* Google Drive Auth Required overlay if session expired or lost */}
            {mainAsset && mainAsset.isDrive && (mainAsset.isAuthExpired || (!mainAsset.proxyUrl && !googleAccessToken)) && (
              <div className={styles.driveAuthOverlay}>
                <div className={styles.driveAuthIconCircle}>
                  <Cloud size={32} color="#06b6d4" />
                </div>
                <span className={styles.driveAuthTitle}>Sessão do Google Drive Necessária</span>
                <span className={styles.driveAuthDesc}>
                  A mídia &quot;{mainAsset.name}&quot; requer conexão com o Google Drive para reprodução. Conecte sua conta para continuar editando na linha do tempo.
                </span>
                <div className={styles.driveAuthButtonsRow}>
                  <button
                    type="button"
                    className={styles.driveAuthLoginBtn}
                    onClick={loginWithGoogle}
                  >
                    <Cloud size={15} />
                    <span>Conectar Google Drive</span>
                  </button>
                  <button
                    type="button"
                    className={styles.driveAuthManageBtn}
                    onClick={() => setIsDrivePickerOpen(true)}
                  >
                    <span>Configurar Drive</span>
                  </button>
                </div>
              </div>
            )}

            {/* Offline media overlay if local asset file is missing on this machine */}
            {mainAsset && !mainAsset.isDrive && mainAsset.isOffline && (
              <div className={styles.offlineMediaOverlay}>
                <AlertTriangle size={36} color="#f59e0b" />
                <span className={styles.offlineTitle}>Mídia Offline</span>
                <span className={styles.offlineDesc}>
                  O arquivo original &quot;{mainAsset.name}&quot; não foi encontrado nesta sessão.
                </span>
                <button
                  type="button"
                  className={styles.offlineRelinkBtn}
                  onClick={() => setIsRelinkModalOpen(true)}
                >
                  <FolderSearch size={15} />
                  <span>Reconectar Pasta do Projeto</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyStateNotice}>
            <span>Nenhum vídeo neste momento</span>
            <span style={{ fontSize: '11px', opacity: 0.65, marginTop: '4px' }}>
              Arraste um vídeo da biblioteca ou solte aqui para começar no início (00:00)
            </span>
          </div>
        )}

        {/* Overlay (B-Roll) Video or Image Layer */}
        {activeOverlayClip && overlayAsset && (
          <>
            {overlayAsset.type === 'image' || activeOverlayClip.type === 'image' ? (
              <img
                src={overlayAsset.url}
                alt={activeOverlayClip.name}
                style={{
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <video
                ref={overlayVideoRef}
                src={overlayAsset.proxyUrl || overlayAsset.url}
                playsInline
                preload="auto"
                poster={overlayAsset.thumbnailUrl || GENERIC_VIDEO_THUMBNAIL}
                muted={activeOverlayClip.isMuted}
                onWaiting={handleWaiting}
                onCanPlay={handleCanPlay}
                onPlaying={handleCanPlay}
                onError={(e) => {
                  handleCanPlay();
                  const target = e.currentTarget;
                  if (overlayAsset) {
                    if (overlayAsset.isDrive) {
                      if (!overlayAsset.proxyUrl) {
                        markAssetAuthExpired(overlayAsset.id, true);
                      }
                    } else if (target.error?.code === 4) {
                      fetch(overlayAsset.url).catch(() => {
                        markAssetOffline(overlayAsset.id);
                      });
                    }
                  }
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v && v.duration && !isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
                    syncMediaDuration(overlayAsset.id, v.duration);
                  }
                }}
                style={{
                  display: activeOverlayClip.backgroundRemoval?.enabled ? 'none' : 'block',
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate3d(-50%, -50%, 0) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  willChange: 'transform',
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            )}
            {activeOverlayClip.backgroundRemoval?.enabled && (
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  left: `${activeOverlayClip.transform.position.x + (overlayTrans?.positionX || 0)}%`,
                  top: `${activeOverlayClip.transform.position.y + (overlayTrans?.positionY || 0)}%`,
                  width: `${(overlayTrans?.scale || activeOverlayClip.transform.scale) * 100}%`,
                  transform: `translate3d(-50%, -50%, 0) rotate(${activeOverlayClip.transform.rotation}deg)`,
                  willChange: 'transform',
                  opacity: overlayTrans?.opacity ?? 1,
                  filter: overlayTrans?.filterString || undefined,
                  zIndex: 5,
                  pointerEvents: 'none',
                }}
              />
            )}
          </>
        )}

        {/* Snapping Guide Crosshairs */}
        {snapGuideX && <div className={styles.snapGuideLineX} />}
        {snapGuideY && <div className={styles.snapGuideLineY} />}

        {/* Text Overlays with Free-form Drag & Drop */}
        {activeTextClips.map((textClip) => {
          const isSelected = selectedClipIds.includes(textClip.id);
          const isDragging = draggingTextId === textClip.id;
          const style = textClip.textStyle;
          const textTrans = getClipTransitionState(textClip, currentTime);

          return (
            <div
              key={textClip.id}
              className={`${styles.textOverlayItem} ${isSelected ? styles.textOverlaySelected : ''} ${isDragging ? styles.textOverlayDragging : ''}`}
              style={{
                left: `${textClip.transform.position.x + textTrans.positionX}%`,
                top: `${textClip.transform.position.y + textTrans.positionY}%`,
                fontSize: `${(style?.fontSize || 36) * 0.7}px`,
                fontFamily: style?.fontFamily || 'Inter',
                fontWeight: style?.fontWeight || 'bold',
                color: style?.color || '#ffffff',
                backgroundColor: style?.backgroundColor || 'transparent',
                textAlign: style?.textAlign || 'center',
                textShadow: style?.shadowColor
                  ? `0 0 ${style.shadowBlur || 8}px ${style.shadowColor}`
                  : 'none',
                WebkitTextStroke: style?.strokeWidth
                  ? `${style.strokeWidth}px ${style.strokeColor}`
                  : 'none',
                opacity: textTrans.opacity,
                transform: `translate(-50%, -50%) scale(${textTrans.scale}) rotate(${textClip.transform.rotation}deg)`,
                filter: textTrans.filterString || undefined,
              }}
              onPointerDown={(e) => handleTextPointerDown(e, textClip)}
              onClick={(e) => {
                e.stopPropagation();
                selectClip(textClip.id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            >
              {/* Coordinates tooltip while dragging */}
              {isDragging && dragCoords && (
                <div className={styles.coordsTooltip}>
                  📍 X: {dragCoords.x.toFixed(1)}% | Y: {dragCoords.y.toFixed(1)}%
                </div>
              )}

              {/* Floating Quick Preset Bar when selected */}
              {isSelected && !isDragging && (
                <div
                  className={styles.floatingTextToolbar}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 15)}
                    title="Mover para o Topo (15%)"
                  >
                    ⬆️ Topo
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 50)}
                    title="Centralizar no Meio (50%)"
                  >
                    🎯 Centro
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 82)}
                    title="Posição de Legenda / Terço Inferior (82%)"
                  >
                    ⬇️ Legenda
                  </button>
                  <button
                    type="button"
                    className={styles.floatingPresetBtn}
                    onClick={() => handleApplyTextPreset(textClip.id, 50, 72)}
                    title="Zona Segura Instagram Reels & TikTok (72%)"
                  >
                    📱 Reels
                  </button>
                </div>
              )}

              {textClip.text || 'Texto'}
            </div>
          );
        })}

        {/* Safe Zone Grid / Framing Guide */}
        <div className={styles.safeZoneBorder} />

        {/* Timecode overlay in frame */}
        <div className={styles.timecodeOverlay}>
          {formatTimecode(currentTime)}
        </div>

        {/* Audio Track Players for background tracks and detached audio */}
        {activeAudioClips.map((audioClip) => {
          const asset = project.assets.find((a) => a.id === audioClip.assetId);
          if (!asset || !asset.url) return null;
          return (
            <AudioTrackPlayer
              key={audioClip.id}
              clip={audioClip}
              assetUrl={asset.proxyUrl || asset.url}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onSyncDuration={syncMediaDuration}
            />
          );
        })}
      </div>
    </div>
  );
};
