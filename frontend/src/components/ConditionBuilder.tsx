import { useMemo } from "react";

type ConditionRule = {
  fieldKey: string;
  operator: string;
  value?: string;
};

type ConditionGroup = {
  logic: "AND" | "OR";
  rules: ConditionRule[];
  groups?: ConditionGroup[];
};

type Choice = { value: string; label: string };

type ConditionBuilderProps = {
  value?: ConditionGroup | null;
  fieldOptions: Choice[];
  onChange: (next: ConditionGroup) => void;
};

const defaultGroup: ConditionGroup = { logic: "AND", rules: [], groups: [] };

const operatorOptions: Choice[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "is_set", label: "Is set" },
  { value: "is_not_set", label: "Is not set" }
];

export default function ConditionBuilder({
  value,
  fieldOptions,
  onChange
}: ConditionBuilderProps) {
  const group = value ?? defaultGroup;
  const fields = useMemo(() => fieldOptions, [fieldOptions]);

  const updateRule = (index: number, next: Partial<ConditionRule>) => {
    const rules = group.rules.map((rule, i) => (i === index ? { ...rule, ...next } : rule));
    onChange({ ...group, rules });
  };

  const addRule = () => {
    onChange({
      ...group,
      rules: [...group.rules, { fieldKey: fields[0]?.value ?? "", operator: "equals", value: "" }]
    });
  };

  const removeRule = (index: number) => {
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="condition-builder">
      <div className="condition-builder__header">
        <span>Show when</span>
        <select
          value={group.logic}
          onChange={(event) => onChange({ ...group, logic: event.target.value as "AND" | "OR" })}
        >
          <option value="AND">All conditions match</option>
          <option value="OR">Any condition matches</option>
        </select>
      </div>
      <div className="condition-builder__rules">
        {group.rules.map((rule, index) => (
          <div key={`${rule.fieldKey}-${index}`} className="condition-builder__rule">
            <select
              value={rule.fieldKey}
              onChange={(event) => updateRule(index, { fieldKey: event.target.value })}
            >
              <option value="">Select field...</option>
              {fields.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
            <select
              value={rule.operator}
              onChange={(event) => updateRule(index, { operator: event.target.value })}
            >
              {operatorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {rule.operator === "is_set" || rule.operator === "is_not_set" ? null : (
              <input
                type="text"
                value={rule.value ?? ""}
                placeholder="Value"
                onChange={(event) => updateRule(index, { value: event.target.value })}
              />
            )}
            <button type="button" className="ghost-button" onClick={() => removeRule(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost-button" onClick={addRule}>
        Add condition
      </button>
    </div>
  );
}
