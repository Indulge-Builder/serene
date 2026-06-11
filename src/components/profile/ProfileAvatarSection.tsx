"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createClient }        from "@/lib/supabase/client";
import { updateProfileAvatar } from "@/lib/actions/profiles";
import { formErrors }          from "@/lib/validations/form-errors";
import { getInitials }         from "@/lib/utils/strings";
import type { Profile }        from "@/lib/types/database";

type Props = { profile: Profile };

/**
 * Avatar tile with click-to-upload. Used in the Identity sidebar of the
 * profile page. Renders a single large square avatar (96×96) with a hover
 * camera overlay and inline upload error message.
 *
 * Identity text (name, email, role pills, member-since) is owned by the
 * page — this component is intentionally just the picture.
 */
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
      setUploadError(formErrors.avatarInvalidType);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(formErrors.avatarTooLarge);
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
        setUploadError(formErrors.avatarUploadFailed);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(storagePath);

      const freshUrl = `${publicUrl}?t=${Date.now()}`;

      const fd = new FormData();
      fd.append("id",         profile.id);
      fd.append("avatar_url", freshUrl);

      const result = await updateProfileAvatar(
        { data: null, error: null },
        fd,
      );

      if (result.error) {
        setUploadError(formErrors.avatarProfileFailed);
      } else {
        setAvatarUrl(freshUrl);
      }
    } catch {
      setUploadError(formErrors.avatarUploadFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials = getInitials(profile.full_name);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)" }}>
      <button
        type="button"
        onClick={() => !uploading && fileInputRef.current?.click()}
        aria-label="Change profile photo"
        style={{
          display:      "block",
          position:     "relative",
          width:        "96px",
          height:       "96px",
          borderRadius: "var(--radius-md)",
          border:       "none",
          padding:      0,
          cursor:       uploading ? "wait" : "pointer",
          overflow:     "hidden",
          background:   "var(--theme-accent-surface)",
          boxShadow:    "var(--shadow-1)",
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
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
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
              fontSize:       "var(--text-2xl)",
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
            position:       "absolute",
            inset:          0,
            background:     "var(--overlay-scrim)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            opacity:        0,
            transition:     "opacity var(--duration-fast) var(--ease-in-out)",
            pointerEvents:  "none",
          }}
        >
          <Camera style={{ width: "24px", height: "24px", strokeWidth: 1.5, color: "var(--theme-canvas-text)" }} />
        </div>

        {/* Upload spinner */}
        {uploading && (
          <div
            aria-hidden="true"
            style={{
              position:       "absolute",
              inset:          0,
              background:     "var(--overlay-scrim)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
            }}
          >
            <Spinner size="md" canvas />
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

      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize:   "var(--text-xs)",
          color:      "var(--theme-text-tertiary)",
          margin:     0,
        }}
      >
        Click photo to change
      </p>

      {uploadError && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize:   "var(--text-xs)",
            color:      "var(--color-danger-text)",
            margin:     "var(--space-1) 0 0",
            textAlign:  "center",
          }}
        >
          {uploadError}
        </p>
      )}
    </div>
  );
}
