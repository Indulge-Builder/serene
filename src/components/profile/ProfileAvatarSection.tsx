"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { createClient }        from "@/lib/supabase/client";
import { updateProfileAvatar } from "@/lib/actions/profiles";
import { ROLE_LABELS }         from "@/lib/constants/roles";
import { DOMAIN_LABELS }       from "@/lib/constants/domains";
import { formatDate }          from "@/lib/utils/dates";
import type { Profile }        from "@/lib/types/database";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

type Props = { profile: Profile };

export function ProfileAvatarSection({ profile }: Props) {
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(profile.avatar_url);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Image must be 2 MB or smaller.");
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const supabase = createClient();
      const storagePath = profile.id;

      const { error: storageError } = await supabase.storage
        .from("avatars")
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (storageError) {
        setUploadError("Upload failed. Please try again.");
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(storagePath);

      // Cache-bust so the new image renders immediately.
      const freshUrl = `${publicUrl}?t=${Date.now()}`;

      const fd = new FormData();
      fd.append("id",         profile.id);
      fd.append("avatar_url", freshUrl);

      const result = await updateProfileAvatar(
        { data: null, error: null },
        fd,
      );

      if (result.error) {
        setUploadError("Saved upload but failed to update profile.");
      } else {
        setAvatarUrl(freshUrl);
      }
    } catch {
      setUploadError("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials     = getInitials(profile.full_name);
  const roleLabel    = ROLE_LABELS[profile.role];
  const domainLabel  = DOMAIN_LABELS[profile.domain];
  const memberSince  = formatDate(profile.created_at, "MMM yyyy");

  return (
    <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "flex-start" }}>

      {/* ── Avatar + upload trigger ─────────────────── */}
      <div style={{ flexShrink: 0, position: "relative" }}>
        <button
          type="button"
          onClick={() => !uploading && fileInputRef.current?.click()}
          aria-label="Change profile photo"
          style={{
            display:      "block",
            position:     "relative",
            width:        "72px",
            height:       "72px",
            borderRadius: "var(--radius-sm)",
            border:       "none",
            padding:      0,
            cursor:       uploading ? "wait" : "pointer",
            overflow:     "hidden",
            background:   "var(--theme-accent-surface)",
          }}
          onMouseEnter={() => {
            if (!uploading && overlayRef.current) {
              overlayRef.current.style.opacity = "1";
            }
          }}
          onMouseLeave={() => {
            if (overlayRef.current) overlayRef.current.style.opacity = "0";
          }}
        >
          {/* Image or initials */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile.full_name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width:          "100%",
                height:         "100%",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontFamily:     "var(--font-sans)",
                fontSize:       "var(--text-lg)",
                fontWeight:     "var(--weight-semibold)",
                color:          "var(--theme-accent)",
                letterSpacing:  "var(--tracking-tight)",
              }}
            >
              {initials}
            </div>
          )}

          {/* Hover overlay — camera icon */}
          <div
            ref={overlayRef}
            aria-hidden="true"
            style={{
              position:        "absolute",
              inset:           0,
              background:      "rgba(0,0,0,0.52)",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              opacity:         0,
              transition:      "opacity var(--duration-fast) var(--ease-in-out)",
              pointerEvents:   "none",
            }}
          >
            <Camera style={{ width: "22px", height: "22px", strokeWidth: 1.5, color: "white" }} />
          </div>

          {/* Upload spinner */}
          {uploading && (
            <div
              aria-hidden="true"
              style={{
                position:        "absolute",
                inset:           0,
                background:      "rgba(0,0,0,0.52)",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
              }}
            >
              <Loader2
                style={{
                  width:     "22px",
                  height:    "22px",
                  strokeWidth: 1.5,
                  color:     "white",
                  animation: "eia-spin 1s linear infinite",
                }}
              />
            </div>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-hidden="true"
          style={{ display: "none" }}
        />
      </div>

      {/* ── Identity text ───────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily:    "var(--font-sans)",
            fontSize:      "var(--text-lg)",
            fontWeight:    "var(--weight-semibold)",
            letterSpacing: "var(--tracking-tight)",
            color:         "var(--theme-text-primary)",
            margin:        0,
          }}
        >
          {profile.full_name}
        </p>

        {profile.job_title && (
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-sm)",
              color:      "var(--theme-text-secondary)",
              margin:     "var(--space-1) 0 0",
            }}
          >
            {profile.job_title}
          </p>
        )}

        {/* Role + Domain badges */}
        <div
          style={{
            display:    "flex",
            gap:        "var(--space-2)",
            marginTop:  "var(--space-3)",
            flexWrap:   "wrap",
          }}
        >
          <Pill variant="accent">{roleLabel}</Pill>
          <Pill variant="neutral">{domainLabel}</Pill>
        </div>

        {/* Member since */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize:   "var(--text-xs)",
            color:      "var(--theme-text-tertiary)",
            margin:     "var(--space-3) 0 0",
          }}
        >
          Member since {memberSince}
        </p>

        {/* Upload error */}
        {uploadError && (
          <p
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   "var(--text-xs)",
              color:      "var(--color-danger-text)",
              margin:     "var(--space-2) 0 0",
            }}
          >
            {uploadError}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Pill ─────────────────────────────────────────────────

function Pill({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant:  "accent" | "neutral";
}) {
  const styles =
    variant === "accent"
      ? {
          background: "var(--theme-accent-surface)",
          color:      "var(--theme-accent)",
          border:     "1px solid var(--theme-accent-surface)",
        }
      : {
          background: "var(--color-neutral-light)",
          color:      "var(--color-neutral-text)",
          border:     "1px solid var(--color-neutral-light)",
        };

  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       "2px 10px",
        borderRadius:  "var(--radius-full)",
        fontFamily:    "var(--font-sans)",
        fontSize:      "var(--text-xs)",
        fontWeight:    "var(--weight-medium)",
        letterSpacing: "var(--tracking-wide)",
        boxShadow:     "0 1px 3px 0 rgb(0 0 0 / 0.06)",
        ...styles,
      }}
    >
      {children}
    </span>
  );
}
