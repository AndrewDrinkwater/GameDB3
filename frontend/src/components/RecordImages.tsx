import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "../hooks/useApi";
import { usePopout } from "./PopoutProvider";
import ImageUploadWizard from "./ImageUploadWizard";

type ImageVariant = {
  id: string;
  variant: string;
  width?: number | null;
  height?: number | null;
  contentType: string;
  sizeBytes: number;
  url: string | null;
};

type ImageAsset = {
  id: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
  originalFileName?: string | null;
  variants: ImageVariant[];
};

export type RecordImage = {
  id: string;
  imageAssetId: string;
  isPrimary: boolean;
  sortOrder: number;
  caption?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  zoom?: number | null;
  asset: ImageAsset;
};

type RecordImagesProps = {
  recordType: "entities" | "locations";
  recordId: string;
  worldId?: string;
  images: RecordImage[];
  onImagesChange: (images: RecordImage[]) => void;
  canEdit: boolean;
};

const pickPreviewVariant = (variants: ImageVariant[]) => {
  const order = ["SMALL", "MEDIUM", "LARGE", "THUMB"];
  for (const preferred of order) {
    const match = variants.find((variant) => variant.variant === preferred && variant.url);
    if (match) return match;
  }
  return variants.find((variant) => Boolean(variant.url)) ?? null;
};

export default function RecordImages({
  recordType,
  recordId,
  worldId,
  images,
  onImagesChange,
  canEdit
}: RecordImagesProps) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const dragStateRef = useRef<{ id: string; focalX: number; focalY: number } | null>(
    null
  );

  const sortedImages = useMemo(
    () => [...images].sort((a, b) => a.sortOrder - b.sortOrder),
    [images]
  );

  useEffect(() => {
    if (!openImageId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const card = target.closest(".record-images__card") as HTMLElement | null;
      if (!card) {
        setOpenImageId(null);
        return;
      }
      if (card.dataset.imageId !== openImageId) {
        setOpenImageId(null);
      }
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [openImageId]);

  useEffect(() => {
    const next: Record<string, string> = {};
    images.forEach((image) => {
      next[image.id] = image.caption ?? "";
    });
    setCaptionDrafts(next);
  }, [images]);

  const { showPopout, closePopout } = usePopout();
  const updateRecordImage = async (
    id: string,
    updates: Partial<Pick<RecordImage, "focalX" | "focalY" | "zoom" | "caption">>
  ) => {
    setError(null);
    onImagesChange(
      images.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry))
    );
    try {
      const response = await api.patch<{ recordImages: RecordImage[] }>(
        `/api/record-images/${id}`,
        updates
      );
      onImagesChange(response.recordImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update image framing.");
    }
  };

  const updateImageFocalLocal = (id: string, focalX: number, focalY: number) => {
    onImagesChange(
      images.map((entry) =>
        entry.id === id ? { ...entry, focalX, focalY } : entry
      )
    );
  };

  const handleFocusPick = (
    imageId: string,
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (!canEdit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    void updateRecordImage(imageId, { focalX: x, focalY: y });
  };

  const handleDragStart = (
    imageId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!canEdit) return;
    if (!openImageId || openImageId !== imageId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const nextX = Math.max(0, Math.min(100, x));
    const nextY = Math.max(0, Math.min(100, y));
    dragStateRef.current = { id: imageId, focalX: nextX, focalY: nextY };
    updateImageFocalLocal(imageId, nextX, nextY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEdit) return;
    const state = dragStateRef.current;
    if (!state) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const nextX = Math.max(0, Math.min(100, x));
    const nextY = Math.max(0, Math.min(100, y));
    state.focalX = nextX;
    state.focalY = nextY;
    updateImageFocalLocal(state.id, nextX, nextY);
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEdit) return;
    const state = dragStateRef.current;
    if (!state) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    void updateRecordImage(state.id, { focalX: state.focalX, focalY: state.focalY });
  };

  const openUploadWizard = () => {
    const id = showPopout({
      title: "Add image",
      dismissOnBackdrop: false,
      message: (
        <ImageUploadWizard
          recordType={recordType}
          recordId={recordId}
          worldId={worldId}
          makePrimary={images.length === 0}
          onSaved={(recordImages) => {
            onImagesChange(recordImages as RecordImage[]);
          }}
          onClose={() => closePopout(id)}
        />
      ),
      actions: []
    });
  };

  const handlePrimary = async (id: string) => {
    if (!canEdit) return;
    setError(null);
    try {
      const response = await api.patch<{ recordImages: RecordImage[] }>(
        `/api/record-images/${id}`,
        { isPrimary: true }
      );
      onImagesChange(response.recordImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary image.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    if (!window.confirm("Remove this image?")) return;
    setError(null);
    try {
      const response = await api.delete<{ recordImages: RecordImage[] }>(
        `/api/record-images/${id}`
      );
      onImagesChange(response.recordImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove image.");
    }
  };

  return (
    <div className="record-images">
      {canEdit ? (
        <div className="record-images__controls">
          <button
            type="button"
            className="ghost-button record-images__add"
            onClick={openUploadWizard}
          >
            Add image
          </button>
        </div>
      ) : null}
      {error ? <div className="record-images__error">{error}</div> : null}
      {sortedImages.length === 0 ? (
        <div className="record-images__empty">No images yet.</div>
      ) : (
        <div className="record-images__grid">
          {sortedImages.map((image) => {
            const preview = pickPreviewVariant(image.asset.variants);
            const focalX = typeof image.focalX === "number" ? image.focalX : 50;
            const focalY = typeof image.focalY === "number" ? image.focalY : 50;
            const zoomRaw = typeof image.zoom === "number" ? image.zoom : 1;
            const zoom = Math.max(1, zoomRaw);
            const isOpen = openImageId === image.id;
            return (
              <div
                key={image.id}
                className={`record-images__card ${image.isPrimary ? "is-primary" : ""}`}
                data-image-id={image.id}
              >
                <button
                  type="button"
                  className={`record-images__preview ${canEdit ? "is-editable" : ""}`}
                  onClick={(event) => {
                    if (canEdit && isOpen) {
                      handleFocusPick(image.id, event as unknown as React.MouseEvent<
                        HTMLDivElement,
                        MouseEvent
                      >);
                      return;
                    }
                    setOpenImageId((current) => (current === image.id ? null : image.id));
                  }}
                  aria-expanded={isOpen}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    handleDragStart(image.id, event);
                  }}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                >
                  {preview?.url ? (
                    <img
                      src={preview.url}
                      alt={image.caption ?? "Record image"}
                      loading="lazy"
                      draggable={false}
                      style={{
                        objectPosition: `${focalX}% ${focalY}%`,
                        transformOrigin: `${focalX}% ${focalY}%`,
                        transform: `scale(${zoom})`
                      }}
                    />
                  ) : (
                    <div className="record-images__placeholder">No preview</div>
                  )}
                </button>
                {image.caption ? (
                  <div className="record-images__caption-text">{image.caption}</div>
                ) : null}
                {canEdit && isOpen ? (
                  <div className="record-images__actions">
                    <button
                      type="button"
                      onClick={() => handlePrimary(image.id)}
                      disabled={image.isPrimary}
                    >
                      Set primary
                    </button>
                    <button type="button" onClick={() => handleDelete(image.id)}>
                      Remove
                    </button>
                  </div>
                ) : null}
                {canEdit && isOpen ? (
                  <label className="record-images__caption-edit">
                    <span>Caption</span>
                    <input
                      type="text"
                      value={captionDrafts[image.id] ?? ""}
                      placeholder="Add a caption"
                      onChange={(event) =>
                        setCaptionDrafts((current) => ({
                          ...current,
                          [image.id]: event.target.value
                        }))
                      }
                      onBlur={(event) => {
                        const nextValue = event.target.value;
                        void updateRecordImage(image.id, { caption: nextValue });
                      }}
                    />
                  </label>
                ) : null}
                {canEdit && isOpen ? (
                  <div className="record-images__focus-controls">
                    <label>
                      <span>Focus X</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={focalX}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          void updateRecordImage(image.id, { focalX: next });
                        }}
                      />
                    </label>
                    <label>
                      <span>Focus Y</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={focalY}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          void updateRecordImage(image.id, { focalY: next });
                        }}
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
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          void updateRecordImage(image.id, { zoom: next });
                        }}
                      />
                    </label>
                  </div>
                ) : null}
                {canEdit && isOpen ? (
                  <div className="record-images__hint">Click image to set focus point.</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
