type ContainmentRule = {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  reason?: string;
  onToggle: (checked: boolean) => void;
};

type ContainmentGroup = {
  label: string;
  rules: ContainmentRule[];
};

type ContainmentRulesPanelProps = {
  groups: ContainmentGroup[];
};

export default function ContainmentRulesPanel({ groups }: ContainmentRulesPanelProps) {
  return (
    <div className="containment-panel">
      {groups.map((group) => (
        <div key={group.label} className="containment-panel__group">
          <strong>{group.label}</strong>
          <div className="containment-panel__rules">
            {group.rules.map((rule) => (
              <label key={rule.id} className="containment-panel__rule" title={rule.reason}>
                <input
                  type="checkbox"
                  checked={rule.checked}
                  disabled={rule.disabled}
                  onChange={(event) => rule.onToggle(event.target.checked)}
                />
                <span>{rule.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
