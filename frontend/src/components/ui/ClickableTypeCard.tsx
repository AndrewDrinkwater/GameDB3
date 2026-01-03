import type { ReactNode, MouseEvent } from "react";

type ClickableTypeCardProps = {
  title: string;
  description?: string;
  badge?: "CORE" | "OPTIONAL" | "CUSTOM";
  status?: "READY" | "NEEDS_ATTENTION" | "DISABLED";
  includeChecked: boolean;
  includeDisabled?: boolean;
  fieldCount?: number;
  isExpanded: boolean;
  onToggleInclude?: () => void;
  onToggleExpanded?: () => void;
  onOpenAdvanced?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
};

const shouldIgnoreClick = (eventTarget: EventTarget | null) => {
  if (!(eventTarget instanceof Element)) return false;
  return Boolean(
    eventTarget.closest("button, input, select, textarea, a, label")
  );
};

const getStatusClass = (status?: ClickableTypeCardProps["status"]) => {
  if (status === "READY") return "clickable-card__status--ready";
  if (status === "NEEDS_ATTENTION") return "clickable-card__status--warning";
  return "clickable-card__status--muted";
};

export default function ClickableTypeCard({
  title,
  description,
  badge,
  status = "READY",
  includeChecked,
  includeDisabled = false,
  fieldCount,
  isExpanded,
  onToggleInclude,
  onToggleExpanded,
  onOpenAdvanced,
  actions,
  children
}: ClickableTypeCardProps) {
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (shouldIgnoreClick(event.target)) return;
    onToggleExpanded?.();
  };

  const handleAdvanced = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (onOpenAdvanced) {
      onOpenAdvanced();
    } else {
      onToggleExpanded?.();
    }
  };

  const showMore = Boolean(description && description.length > 120 && !isExpanded);

  return (
    <div
      className={`clickable-card ${isExpanded ? "is-expanded" : ""}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleExpanded?.();
        }
      }}
    >
      <div className="clickable-card__header">
        <div className="clickable-card__header-left">
          <label className="clickable-card__checkbox" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={includeChecked}
              onChange={onToggleInclude}
              disabled={includeDisabled}
            />
            <span>Include</span>
          </label>
          <div className="clickable-card__title-block">
            <div className="clickable-card__title-row">
              <h3 className="clickable-card__title">{title}</h3>
              {fieldCount !== undefined ? (
                <span className="clickable-card__pill">Fields: {fieldCount}</span>
              ) : null}
            </div>
            {description ? (
              <p
                className={`clickable-card__description ${isExpanded ? "is-expanded" : ""}`}
                title={description}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="clickable-card__header-right">
          {badge ? <span className="clickable-card__pill">{badge}</span> : null}
          <span className={`clickable-card__status ${getStatusClass(status)}`}>
            {status === "NEEDS_ATTENTION" ? "Needs attention" : status === "DISABLED" ? "Disabled" : "Ready"}
          </span>
          {actions ? <div className="clickable-card__actions">{actions}</div> : null}
          {showMore ? (
            <button type="button" className="clickable-card__link" onClick={handleAdvanced}>
              More
            </button>
          ) : (
            <button type="button" className="clickable-card__link" onClick={handleAdvanced}>
              {isExpanded ? "Collapse" : "Advanced"}
            </button>
          )}
        </div>
      </div>
      {isExpanded ? <div className="clickable-card__body">{children}</div> : null}
    </div>
  );
}
