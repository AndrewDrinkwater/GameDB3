type RelationshipSelectorCardProps = {
  relationshipName: string;
  category: string;
  description?: string;
  suggestedPairs?: string;
  includeChecked: boolean;
  status: "READY" | "NEEDS_RULES" | "DISABLED" | "NOT_INCLUDED";
  disabled?: boolean;
  editRulesEnabled: boolean;
  onToggleInclude: (checked: boolean) => void;
  onEditRules?: () => void;
};

const getStatusLabel = (status: RelationshipSelectorCardProps["status"]) => {
  if (status === "READY") return "Ready";
  if (status === "NEEDS_RULES") return "Needs rules";
  if (status === "DISABLED") return "Disabled";
  return "Not included";
};

const getStatusClass = (status: RelationshipSelectorCardProps["status"]) => {
  if (status === "READY") return "relationship-card__status--ready";
  if (status === "NEEDS_RULES") return "relationship-card__status--warning";
  return "relationship-card__status--muted";
};

export default function RelationshipSelectorCard({
  relationshipName,
  category,
  description,
  suggestedPairs,
  includeChecked,
  status,
  disabled = false,
  editRulesEnabled,
  onToggleInclude,
  onEditRules
}: RelationshipSelectorCardProps) {
  return (
    <div className="relationship-card">
      <div className="relationship-card__main">
        <label className="relationship-card__checkbox">
          <input
            type="checkbox"
            checked={includeChecked}
            disabled={disabled}
            onChange={(event) => onToggleInclude(event.target.checked)}
          />
          <span>{relationshipName}</span>
        </label>
        <div className="relationship-card__meta">
          <span className="relationship-card__category">{category}</span>
          <span className={`relationship-card__status ${getStatusClass(status)}`}>
            {getStatusLabel(status)}
          </span>
          {includeChecked ? (
            <button
              type="button"
              className="ghost-button"
              disabled={!editRulesEnabled}
              onClick={onEditRules}
              title={editRulesEnabled ? undefined : "Available after structure is created"}
            >
              Edit rules
            </button>
          ) : null}
        </div>
      </div>
      {description ? <p className="relationship-card__description">{description}</p> : null}
      {includeChecked && suggestedPairs ? (
        <div className="relationship-card__preview">{suggestedPairs}</div>
      ) : null}
    </div>
  );
}
