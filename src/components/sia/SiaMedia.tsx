"use client";

// Inline media for the Sia viewer — images, stickers, voice notes, audio, video,
// documents. Bytes come through getSiaMediaAction (role-gated, base64 data URL —
// the pilot seam; S3 signed URLs replace the action's interior with Sia W1).
//
// Loading is lazy: nothing is fetched until the attachment scrolls into view
// (voice/images) or is explicitly asked for (video/document). A module-level
// cache keeps a session's already-fetched files so reopening a chat is instant.

import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { Download, FileText, Pause, Play, Video as VideoIcon } from "lucide-react";
import { SeedMandala } from "@/components/ui/SeedMandala";
import { getSiaMediaAction } from "@/lib/actions/sia";
import { triggerBrowserDownload } from "@/lib/utils/export";
import { formatBytes, formatClock, TYPE_PREVIEW } from "./sia-shared";
import type { SiaMediaInfo, SiaMediaPayload } from "@/lib/services/sia-service";

const mediaCache = new Map<string, SiaMediaPayload>();
const inflight = new Map<string, Promise<SiaMediaPayload | null>>();

function cacheKey(chatJid: string, waMessageId: string, senderJid: string): string {
  return `${chatJid}|${waMessageId}|${senderJid}`;
}

async function fetchMedia(
  chatJid: string,
  waMessageId: string,
  senderJid: string,
): Promise<SiaMediaPayload | null> {
  const key = cacheKey(chatJid, waMessageId, senderJid);
  const cached = mediaCache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = getSiaMediaAction(chatJid, waMessageId, senderJid)
    .then((res) => {
      if (res.data) {
        mediaCache.set(key, res.data);
        return res.data;
      }
      return null;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function dataUrlToBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return res.arrayBuffer();
}

type MediaProps = {
  chatJid: string;
  waMessageId: string;
  senderJid: string;
  media: SiaMediaInfo;
};

// ─────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────

export function SiaMediaAttachment(props: MediaProps) {
  const { media } = props;

  if (media.download_status === "dead_letter") {
    return <MediaChip media={media} note="Media unavailable" danger />;
  }
  if (media.download_status === "expired") {
    return <MediaChip media={media} note="Expired on WhatsApp" danger />;
  }
  if (media.download_status !== "done") {
    return <MediaChip media={media} note="Downloading…" spinning />;
  }

  switch (media.media_type) {
    case "image":
    case "sticker":
      return <InViewImage {...props} bare={media.media_type === "sticker"} />;
    case "voice":
    case "audio":
      return <VoiceNotePlayer {...props} />;
    case "video":
      return <ClickToLoadVideo {...props} />;
    default:
      return <DocumentChip {...props} />;
  }
}

// ─────────────────────────────────────────────
// Shared chip chrome (pending / failed / document)
// ─────────────────────────────────────────────

function MediaChip({
  media,
  note,
  danger = false,
  spinning = false,
  action,
}: {
  media: SiaMediaInfo;
  note: string;
  danger?: boolean;
  spinning?: boolean;
  action?: React.ReactNode;
}) {
  const meta = TYPE_PREVIEW[media.media_type] ?? { label: "File", icon: FileText };
  const Icon = meta.icon;
  const size = formatBytes(media.size_bytes);
  return (
    <div
      className="flex items-center gap-2 rounded-(--radius-sm) px-3 py-2"
      style={{ background: "var(--neu-well)", minWidth: "180px" }}
    >
      {spinning ? (
        <span style={{ color: "var(--theme-text-secondary)", display: "inline-flex" }}>
          <SeedMandala size={16} variant="currentColor" spin={3.5} />
        </span>
      ) : (
        <Icon
          className="w-4 h-4 shrink-0"
          strokeWidth={1.5}
          style={{ color: danger ? "var(--color-danger)" : "var(--theme-text-secondary)" }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="type-caption" style={{ color: "var(--theme-text-primary)", fontWeight: "var(--weight-medium)" }}>
          {meta.label}
          {size && <span style={{ color: "var(--theme-text-tertiary)", fontWeight: "var(--weight-normal)" }}> · {size}</span>}
        </div>
        <div className="type-caption" style={{ color: danger ? "var(--color-danger-text)" : "var(--theme-text-tertiary)" }}>
          {note}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────
// Image / sticker — lazy in-view fetch, shimmer placeholder, click → full view
// ─────────────────────────────────────────────

function InViewImage({ chatJid, waMessageId, senderJid, media, bare }: MediaProps & { bare: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "240px 0px" });
  const [payload, setPayload] = useState<SiaMediaPayload | null>(
    () => mediaCache.get(cacheKey(chatJid, waMessageId, senderJid)) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(!!payload);

  useEffect(() => {
    if (!inView || payload || failed) return;
    let alive = true;
    fetchMedia(chatJid, waMessageId, senderJid).then((p) => {
      if (!alive) return;
      if (p) setPayload(p);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [inView, payload, failed, chatJid, waMessageId, senderJid]);

  if (failed) return <MediaChip media={media} note="Preview unavailable" danger />;

  const maxW = bare ? 140 : 280;
  const openFull = async () => {
    if (!payload) return;
    if (!payload.dataUrl.startsWith("data:")) {
      // S3 mode: the presigned URL opens directly — fetch() would die on CORS.
      window.open(payload.dataUrl, "_blank", "noopener");
      return;
    }
    const blob = await (await fetch(payload.dataUrl)).blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  };

  return (
    <div ref={ref} style={{ maxWidth: `${maxW}px` }}>
      {payload ? (
        <button
          type="button"
          onClick={openFull}
          title="Open full size"
          className="block p-0 border-0 bg-transparent"
          style={{ cursor: "zoom-in" }}
        >
          {/* data: URL image — next/image has no place here */}
          <img
            src={payload.dataUrl}
            alt={bare ? "Sticker" : "Photo"}
            onLoad={() => setLoaded(true)}
            style={{
              display: "block",
              maxWidth: `${maxW}px`,
              maxHeight: bare ? "140px" : "320px",
              width: "auto",
              height: "auto",
              borderRadius: "var(--radius-sm)",
              objectFit: "cover",
              opacity: loaded ? 1 : 0,
              transition: "opacity var(--duration-base) var(--ease-in-out)",
            }}
          />
        </button>
      ) : (
        <div
          className="skeleton"
          style={{ width: `${bare ? 120 : 220}px`, height: `${bare ? 120 : 160}px`, borderRadius: "var(--radius-sm)" }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Voice note / audio — the WhatsApp-style mini player (play/pause + progress)
// ─────────────────────────────────────────────

function VoiceNotePlayer({ chatJid, waMessageId, senderJid, media }: MediaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inView = useInView(ref, { once: true, margin: "240px 0px" });
  const [payload, setPayload] = useState<SiaMediaPayload | null>(
    () => mediaCache.get(cacheKey(chatJid, waMessageId, senderJid)) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!inView || payload || failed) return;
    let alive = true;
    fetchMedia(chatJid, waMessageId, senderJid).then((p) => {
      if (!alive) return;
      if (p) setPayload(p);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [inView, payload, failed, chatJid, waMessageId, senderJid]);

  if (failed) return <MediaChip media={media} note="Audio unavailable" danger />;

  const duration = media.duration_seconds ?? audioRef.current?.duration ?? 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = frac * el.duration;
  };

  return (
    <div ref={ref} className="flex items-center gap-3" style={{ minWidth: "200px", maxWidth: "260px" }}>
      <Button
        variant="primary" size="sm" iconOnly
        type="button"
        onClick={toggle}
        disabled={!payload}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {!payload && inView ? (
          <SeedMandala size={14} variant="currentColor" spin={3.5} />
        ) : playing ? (
          <Pause className="w-4 h-4" strokeWidth={2} fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" strokeWidth={2} fill="currentColor" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div
          role="slider"
          aria-label="Seek voice note"
          tabIndex={payload ? 0 : -1}
          aria-disabled={!payload}
          onKeyDown={(event) => {
            const audio = audioRef.current;
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            audio.currentTime = event.key === 'Home' ? 0 : event.key === 'End' ? audio.duration : Math.max(0, Math.min(audio.duration, audio.currentTime + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : -5)));
          }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={seek}
          className="w-full py-1.5"
          style={{ cursor: payload ? "pointer" : "default" }}
        >
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: "4px", background: "var(--neu-well)" }}
          >
            <div
              style={{
                height: "100%",
                background: "var(--theme-accent)",
                transformOrigin: "left",
                transform: `scaleX(${progress})`,
                transition: playing ? "transform 250ms linear" : "none",
              }}
            />
          </div>
        </div>
        <div
          className="type-caption tabular-nums"
          style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--theme-text-tertiary)" }}
        >
          {formatClock(playing || elapsed > 0 ? elapsed : duration)}
        </div>
      </div>

      {payload && (
        <audio
          ref={audioRef}
          src={payload.dataUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setElapsed(el.currentTime);
            if (Number.isFinite(el.duration) && el.duration > 0) setProgress(el.currentTime / el.duration);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setElapsed(0);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Video — explicit load (videos are heavy), then a native inline player
// ─────────────────────────────────────────────

function ClickToLoadVideo({ chatJid, waMessageId, senderJid, media }: MediaProps) {
  const [payload, setPayload] = useState<SiaMediaPayload | null>(
    () => mediaCache.get(cacheKey(chatJid, waMessageId, senderJid)) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (payload) {
    return (
      <video
        src={payload.dataUrl}
        controls
        preload="metadata"
        style={{ display: "block", maxWidth: "280px", maxHeight: "320px", borderRadius: "var(--radius-sm)" }}
      />
    );
  }

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await getSiaMediaAction(chatJid, waMessageId, senderJid);
    if (res.data) {
      mediaCache.set(cacheKey(chatJid, waMessageId, senderJid), res.data);
      setPayload(res.data);
    } else {
      setError(res.error ?? "This file isn't available.");
    }
    setLoading(false);
  };

  if (error) return <MediaChip media={media} note={error} danger />;

  return (
    <MediaChip
      media={media}
      note={loading ? "Loading…" : "Tap to load"}
      spinning={loading}
      action={
        !loading ? (
          <Button
            variant="control" size="sm" iconOnly
            type="button"
            onClick={load}
            aria-label="Load video"
          >
            <VideoIcon className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        ) : undefined
      }
    />
  );
}

// ─────────────────────────────────────────────
// Document — chip + download through the existing browser-download util
// ─────────────────────────────────────────────

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

function DocumentChip({ chatJid, waMessageId, senderJid, media }: MediaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    const payload = await fetchMedia(chatJid, waMessageId, senderJid);
    if (payload) {
      if (!payload.downloadUrl.startsWith("data:")) {
        // S3 mode: the presigned URL carries an attachment disposition — a
        // plain anchor click downloads it (a browser fetch() dies on CORS).
        const a = document.createElement("a");
        a.href = payload.downloadUrl;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const mime = (payload.mime ?? "application/octet-stream").split(";")[0];
        const ext = EXT_BY_MIME[mime] ?? mime.split("/")[1] ?? "bin";
        const buffer = await dataUrlToBuffer(payload.downloadUrl);
        triggerBrowserDownload(`${waMessageId}.${ext}`, buffer, mime);
      }
    } else {
      setError("This file isn't available.");
    }
    setBusy(false);
  };

  if (error) return <MediaChip media={media} note={error} danger />;

  return (
    <MediaChip
      media={media}
      note={busy ? "Preparing…" : "Tap to download"}
      spinning={busy}
      action={
        !busy ? (
          <Button
            variant="control" size="sm" iconOnly
            type="button"
            onClick={download}
            aria-label="Download document"
          >
            <Download className="w-4 h-4" strokeWidth={1.5} />
          </Button>
        ) : undefined
      }
    />
  );
}
