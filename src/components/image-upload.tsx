"use client";

// Lot image field: pick a file → direct-to-Blob upload → URL lands in the
// form. Falls back to a paste-a-URL input when the Blob store isn't
// configured (e.g. local dev without BLOB_READ_WRITE_TOKEN).
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

export function ImageUploadField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);

  const pick = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPEG, PNG, WebP or GIF).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Max 4 MB — resize the photo and try again.");
      return;
    }
    setUploading(true);
    try {
      const blob = await upload(`lots/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      onChange(blob.url);
    } catch {
      setError("Upload unavailable right now — you can paste an image URL instead.");
      setShowUrl(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
        {value && (
          <>
            <span className="mono text-xs text-neon truncate max-w-[14rem]" title={value}>
              {value.split("/").pop()}
            </span>
            <button
              type="button"
              className="btn btn-ghost !text-xs !min-h-[1.8rem] !px-2"
              onClick={() => onChange("")}
            >
              ✕
            </button>
          </>
        )}
        {!showUrl && !value && (
          <button
            type="button"
            className="text-xs hover:text-frost transition-colors"
            style={{ color: "var(--text-dim)" }}
            onClick={() => setShowUrl(true)}
          >
            or paste a URL
          </button>
        )}
      </div>
      {showUrl && (
        <input
          className="input mt-2"
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
        />
      )}
      {error && (
        <p className="text-xs mt-1.5" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
