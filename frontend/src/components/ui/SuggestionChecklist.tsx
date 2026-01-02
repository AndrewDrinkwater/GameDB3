import React from "react";

export type SuggestionChecklistItem = {
  id: string;
  label: string;
  description?: string;
  preview?: string;
  checked: boolean;
  disabled?: boolean;
  status?: string;
  onEdit?: () => void;
};

type SuggestionChecklistProps = {
  items: SuggestionChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
};

export default function SuggestionChecklist({ items, onToggle }: SuggestionChecklistProps) {
  return (
    <div className="suggestion-checklist">
      {items.map((item) => (
        <div key={item.id} className={`suggestion-checklist__row ${item.disabled ? "is-disabled" : ""}`}>
          <label className="suggestion-checklist__main">
            <input
              type="checkbox"
              checked={item.checked}
              disabled={item.disabled}
              onChange={(event) => onToggle(item.id, event.target.checked)}
            />
            <div>
              <div className="suggestion-checklist__label">{item.label}</div>
              {item.description ? (
                <div className="suggestion-checklist__description">{item.description}</div>
              ) : null}
              {item.preview ? (
                <div className="suggestion-checklist__preview">{item.preview}</div>
              ) : null}
            </div>
          </label>
          <div className="suggestion-checklist__meta">
            {item.status ? <span className="suggestion-checklist__status">{item.status}</span> : null}
            {item.onEdit ? (
              <button type="button" className="ghost-button" onClick={item.onEdit}>
                Edit rules
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
