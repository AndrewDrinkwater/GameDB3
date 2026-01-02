import React from "react";

export type SelectableCardItem = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  recommended?: boolean;
  disabled?: boolean;
};

type SelectableCardGridProps = {
  items: SelectableCardItem[];
  selectionMode: "single" | "multi";
  selectedIds: string[];
  onSelect: (id: string) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (id: string) => void;
};

export default function SelectableCardGrid({
  items,
  selectionMode,
  selectedIds,
  onSelect,
  secondaryActionLabel,
  onSecondaryAction
}: SelectableCardGridProps) {
  return (
    <div className="selectable-card-grid">
      {items.map((item) => {
        const isSelected = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            className={`selectable-card ${isSelected ? "is-selected" : ""} ${
              item.disabled ? "is-disabled" : ""
            }`}
          >
            <button
              type="button"
              className="selectable-card__main"
              onClick={() => onSelect(item.id)}
              disabled={item.disabled}
              aria-pressed={selectionMode === "multi" ? isSelected : undefined}
            >
              <div className="selectable-card__header">
                <div>
                  <div className="selectable-card__title">{item.title}</div>
                  {item.subtitle ? (
                    <div className="selectable-card__subtitle">{item.subtitle}</div>
                  ) : null}
                </div>
                {item.recommended ? (
                  <span className="selectable-card__pill">Recommended</span>
                ) : item.badge ? (
                  <span className="selectable-card__pill">{item.badge}</span>
                ) : null}
              </div>
              {item.description ? (
                <p className="selectable-card__description">{item.description}</p>
              ) : null}
            </button>
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                type="button"
                className="selectable-card__secondary"
                onClick={() => onSecondaryAction(item.id)}
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
