import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "../hooks/useApi";

type WizardProps = {
  recordType: "entities" | "locations";
  recordId: string;
  worldId?: string;
  makePrimary: boolean;
  onSaved: (recordImages: unknown) => void;
  onClose: () => void;
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ImageUploadWizard({
  recordType,
  recordId,
  worldId,
  makePrimary,
  onSaved,
  onClose
}: WizardProps) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return `${file.name} · ${formatBytes(file.size)}`;
  }, [file]);

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setError(null);
    event.target.value = "";
  };

  const updateFocusFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setFocalX(Math.max(0, Math.min(100, x)));
    setFocalY(Math.max(0, Math.min(100, y)));
  };

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateFocusFromEvent(event);
    dragRef.current = { x: focalX, y: focalY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    updateFocusFromEvent(event);
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleSave = async () => {
    if (!file || !worldId || saving) return;
    setSaving(true);
    setError(null);

    try {
      const init = await api.post<{ uploadUrl: string; uploadKey: string }>(
        "/api/images/init",
        {
          worldId,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size
        }
      );

      const uploadResponse = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed.");
      }

      const complete = await api.post<{ assetId: string }>("/api/images/complete", {
        worldId,
        uploadKey: init.uploadKey,
        fileName: file.name
      });

      const attach = await api.post<{ recordImages: unknown }>(
        `/api/records/${recordType}/${recordId}/images`,
        {
          imageAssetId: complete.assetId,
          isPrimary: makePrimary,
          caption: caption.trim() || undefined,
          focalX,
          focalY,
          zoom
        }
      );

      onSaved(attach.recordImages);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="image-wizard">
      <div className="image-wizard__step">
        <label className="image-wizard__upload">
          <input type="file" accept="image/*" onChange={handlePick} />
          <span>{file ? "Change image" : "Choose image"}</span>
        </label>
        {fileMeta ? <div className="image-wizard__meta">{fileMeta}</div> : null}
      </div>

      {previewUrl ? (
        <div className="image-wizard__step">
          <div className="image-wizard__preview-grid">
            <div className="image-wizard__preview">
              <div
                className="image-wizard__frame image-wizard__frame--card"
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
                <img
                  src={previewUrl}
                  alt="Entity card preview"
                  draggable={false}
                  style={{
                    objectPosition: `${focalX}% ${focalY}%`,
                    transformOrigin: `${focalX}% ${focalY}%`,
                    transform: `scale(${zoom})`
                  }}
                />
              </div>
              <div className="image-wizard__label">Entity/Location card</div>
            </div>
            <div className="image-wizard__preview">
              <div
                className="image-wizard__frame image-wizard__frame--circle"
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
                <img
                  src={previewUrl}
                  alt="Circle preview"
                  draggable={false}
                  style={{
                    objectPosition: `${focalX}% ${focalY}%`,
                    transformOrigin: `${focalX}% ${focalY}%`,
                    transform: `scale(${zoom})`
                  }}
                />
              </div>
              <div className="image-wizard__label">Circle badge</div>
            </div>
          </div>

          <div className="image-wizard__controls">
            <label>
              <span>Focus X</span>
              <input
                type="range"
                min={0}
                max={100}
                value={focalX}
                onChange={(event) => setFocalX(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Focus Y</span>
              <input
                type="range"
                min={0}
                max={100}
                value={focalY}
                onChange={(event) => setFocalY(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <label className="image-wizard__caption">
              <span>Caption</span>
              <input
                type="text"
                value={caption}
                placeholder="Optional caption"
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {error ? <div className="image-wizard__error">{error}</div> : null}

      <div className="image-wizard__actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={handleSave}
          disabled={!file || !worldId || saving}
        >
          {saving ? "Saving..." : "Save image"}
        </button>
      </div>
    </div>
  );
}
