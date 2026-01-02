import React from "react";

type StatusTone = "ready" | "warning" | "muted";

type CollapsibleConfigCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: string;
  status?: { label: string; tone?: StatusTone };
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  isOpen: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export default function CollapsibleConfigCard({
  title,
  description,
  badge,
  status,
  checked,
  onCheckedChange,
  isOpen,
  onToggle,
  actions,
  children
}: CollapsibleConfigCardProps) {
  return (
    <div className={`config-card ${isOpen ? "is-open" : ""}`}>
      <div className="config-card__header">
        <div className="config-card__header-left">
          {onCheckedChange ? (
            <label className="config-card__checkbox">
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={(event) => onCheckedChange(event.target.checked)}
              />
              <span>Include</span>
            </label>
          ) : null}
          <div className="config-card__title-block">
            <div className="config-card__title">{title}</div>
            {description ? <div className="config-card__description">{description}</div> : null}
          </div>
        </div>
        <div className="config-card__header-right">
          {badge ? <span className="config-card__pill">{badge}</span> : null}
          {status ? (
            <span className={`config-card__status config-card__status--${status.tone ?? "muted"}`}>
              {status.label}
            </span>
          ) : null}
          {actions ? <div className="config-card__actions">{actions}</div> : null}
          <button type="button" className="config-card__toggle" onClick={onToggle}>
            {isOpen ? "Collapse" : "Advanced"}
          </button>
        </div>
      </div>
      {isOpen ? <div className="config-card__body">{children}</div> : null}
    </div>
  );
}
