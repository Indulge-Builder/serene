'use client';

import { useEffect, useRef } from 'react';

interface AdCreativePlayerProps {
  videoUrl:     string;
  thumbnailUrl: string | null;
}

/**
 * Reusable video primitive for ad creatives.
 * - Calls video.play() via ref after mount; silently catches NotAllowedError.
 * - Unmount cleanup: video.pause() to stop audio bleed when the containing modal
 *   closes and the user navigates away. Does NOT clear video.src (that blanks the
 *   element under React Strict Mode's double-mount — see the effect comment).
 * - Container uses --theme-canvas background so letterboxing matches the shell.
 */
export function AdCreativePlayer({ videoUrl, thumbnailUrl }: AdCreativePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch(() => {
      // NotAllowedError — browser blocked autoplay, user can press play manually
    });

    // Stop playback (and any audio) on unmount. We intentionally do NOT clear
    // video.src here: clearing it blanks the element on React Strict Mode's
    // mount→unmount→remount cycle (the JSX src prop is unchanged on remount, so
    // React never re-applies it, leaving an empty source → black box).
    // pause() is sufficient to stop audio bleed; the element is removed from the
    // DOM on real unmount anyway.
    return () => {
      video.pause();
    };
  }, [videoUrl]);

  return (
    <div
      style={{
        background:   'var(--theme-canvas)',
        borderRadius: 'var(--radius-md)',
        aspectRatio:  '9 / 16',
        maxHeight:    '480px',
        overflow:     'hidden',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnailUrl ?? undefined}
        autoPlay
        muted
        playsInline
        controls
        style={{
          width:      '100%',
          height:     '100%',
          objectFit:  'contain',
          display:    'block',
        }}
      />
    </div>
  );
}
