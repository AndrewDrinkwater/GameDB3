import { useEffect, useMemo, useState } from "react";

type ConditionRule = {
  fieldKey: string;
  operator: string;
  value?: string | string[];
};

type ConditionGroup = {
  logic: "AND" | "OR";
  rules: ConditionRule[];
  groups?: ConditionGroup[];
};

type Choice = { value: string; label: string };

type ConditionFieldOption = Choice & {
  fieldType?: string;
  options?: Choice[];
  referenceEntityKey?: string;
  referenceScope?: string;
  referenceEntityTypeId?: string | null;
  allowMultiple?: boolean;
};

type ConditionBuilderProps = {
  value?: ConditionGroup | null;
  fieldOptions: ConditionFieldOption[];
  token?: string;
  context?: {
    worldId?: string;
    campaignId?: string;
    characterId?: string;
  };
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
  token,
  context,
  onChange
}: ConditionBuilderProps) {
  const normalizeGroup = (input?: ConditionGroup | null): ConditionGroup => {
    if (!input) return defaultGroup;
    return {
      logic: input.logic ?? "AND",
      rules: input.rules ?? [],
      groups: (input.groups ?? []).map((child) => normalizeGroup(child))
    };
  };
  const group = normalizeGroup(value);
  const fields = useMemo(() => fieldOptions, [fieldOptions]);
  const [referenceOptions, setReferenceOptions] = useState<Record<string, Choice[]>>({});

  const resolveField = (fieldKey: string) => fields.find((field) => field.value === fieldKey);

  const collectRules = (current: ConditionGroup): ConditionRule[] => {
    const nested = (current.groups ?? []).flatMap((child) => collectRules(child));
    return [...current.rules, ...nested];
  };

  useEffect(() => {
    if (!token) return;
    const pending = collectRules(group)
      .map((rule) => resolveField(rule.fieldKey))
      .filter((field): field is ConditionFieldOption => Boolean(field))
      .filter((field) => field.referenceEntityKey && !referenceOptions[field.value]);

    if (pending.length === 0) return;

    let ignore = false;

    const load = async () => {
      const nextOptions: Record<string, Choice[]> = {};
      await Promise.all(
        pending.map(async (field) => {
          const params = new URLSearchParams({
            entityKey: field.referenceEntityKey as string,
            query: ""
          });
          if (field.referenceScope) params.set("scope", field.referenceScope);
          if (context?.worldId) params.set("worldId", context.worldId);
          if (context?.campaignId) params.set("campaignId", context.campaignId);
          if (context?.characterId) params.set("characterId", context.characterId);
          if (field.referenceEntityTypeId) {
            params.set("entityTypeId", field.referenceEntityTypeId);
          }

          const response = await fetch(`/api/references?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!response.ok) return;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          nextOptions[field.value] = data.map((item) => ({ value: item.id, label: item.label }));
        })
      );

      if (ignore) return;
      if (Object.keys(nextOptions).length > 0) {
        setReferenceOptions((current) => ({ ...current, ...nextOptions }));
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [fields, group.rules, token, context, referenceOptions]);

  const updateGroupAtPath = (
    current: ConditionGroup,
    path: number[],
    updater: (target: ConditionGroup) => ConditionGroup
  ): ConditionGroup => {
    if (path.length === 0) return updater(current);
    const [head, ...rest] = path;
    const nextGroups = [...(current.groups ?? [])];
    nextGroups[head] = updateGroupAtPath(nextGroups[head], rest, updater);
    return { ...current, groups: nextGroups };
  };

  const addRuleAtPath = (path: number[]) => {
    const fieldKey = fields[0]?.value ?? "";
    onChange(
      updateGroupAtPath(group, path, (target) => ({
        ...target,
        rules: [...target.rules, { fieldKey, operator: "equals", value: "" }]
      }))
    );
  };

  const addGroupAtPath = (path: number[]) => {
    onChange(
      updateGroupAtPath(group, path, (target) => ({
        ...target,
        groups: [...(target.groups ?? []), { logic: "AND", rules: [], groups: [] }]
      }))
    );
  };

  const removeGroupAtPath = (path: number[]) => {
    if (path.length === 0) return;
    const parentPath = path.slice(0, -1);
    const groupIndex = path[path.length - 1];
    onChange(
      updateGroupAtPath(group, parentPath, (target) => ({
        ...target,
        groups: (target.groups ?? []).filter((_, index) => index !== groupIndex)
      }))
    );
  };

  const updateRuleAtPath = (path: number[], index: number, next: Partial<ConditionRule>) => {
    onChange(
      updateGroupAtPath(group, path, (target) => ({
        ...target,
        rules: target.rules.map((rule, i) => (i === index ? { ...rule, ...next } : rule))
      }))
    );
  };

  const removeRuleAtPath = (path: number[], index: number) => {
    onChange(
      updateGroupAtPath(group, path, (target) => ({
        ...target,
        rules: target.rules.filter((_, i) => i !== index)
      }))
    );
  };

  const setGroupLogicAtPath = (path: number[], logic: "AND" | "OR") => {
    onChange(updateGroupAtPath(group, path, (target) => ({ ...target, logic })));
  };

  const renderRule = (rule: ConditionRule, index: number, path: number[]) => {
    const fieldMeta = resolveField(rule.fieldKey);
    const operatorList = [...operatorOptions];
    if (fieldMeta?.allowMultiple) {
      operatorList.push({ value: "contains_any", label: "Contains any of" });
    }
    return (
      <div key={`${rule.fieldKey}-${index}`} className="condition-builder__rule">
        <select
          value={rule.fieldKey}
          onChange={(event) =>
            updateRuleAtPath(path, index, {
              fieldKey: event.target.value,
              operator: "equals",
              value: ""
            })
          }
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
          onChange={(event) => updateRuleAtPath(path, index, { operator: event.target.value })}
        >
          {operatorList.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {rule.operator === "is_set" || rule.operator === "is_not_set" ? null : (() => {
          if (fieldMeta?.options && fieldMeta.options.length > 0) {
            return (
              <select
                value={rule.value ?? ""}
                onChange={(event) => updateRuleAtPath(path, index, { value: event.target.value })}
              >
                <option value="">Select value...</option>
                {fieldMeta.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            );
          }
          if (fieldMeta?.referenceEntityKey) {
            const options = referenceOptions[fieldMeta.value] ?? [];
            if (rule.operator === "contains_any") {
              const selected = Array.isArray(rule.value) ? rule.value : [];
              return (
                <select
                  multiple
                  value={selected as string[]}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map(
                      (option) => option.value
                    );
                    updateRuleAtPath(path, index, { value: values });
                  }}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              );
            }
            return (
              <select
                value={rule.value ?? ""}
                onChange={(event) => updateRuleAtPath(path, index, { value: event.target.value })}
              >
                <option value="">Select value...</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              type="text"
              value={rule.value ?? ""}
              placeholder="Value"
              onChange={(event) => updateRuleAtPath(path, index, { value: event.target.value })}
            />
          );
        })()}
        <button
          type="button"
          className="ghost-button condition-builder__remove"
          onClick={() => removeRuleAtPath(path, index)}
        >
          Remove
        </button>
      </div>
    );
  };

  const renderGroup = (current: ConditionGroup, path: number[], isRoot: boolean) => (
    <div className={`condition-builder__group${isRoot ? " is-root" : ""}`}>
      <div className="condition-builder__group-header">
        <div className="condition-builder__group-title">
          <span>{isRoot ? "Show when" : "Group"}</span>
          <select
            value={current.logic}
            onChange={(event) => setGroupLogicAtPath(path, event.target.value as "AND" | "OR")}
          >
            <option value="AND">All conditions match</option>
            <option value="OR">Any condition matches</option>
          </select>
        </div>
        {!isRoot ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => removeGroupAtPath(path)}
          >
            Remove group
          </button>
        ) : null}
      </div>
      <div className="condition-builder__rules">
        {current.rules.map((rule, index) => renderRule(rule, index, path))}
      </div>
      <div className="condition-builder__group-actions">
        <button type="button" className="ghost-button" onClick={() => addRuleAtPath(path)}>
          Add condition
        </button>
        <button type="button" className="ghost-button" onClick={() => addGroupAtPath(path)}>
          Add group
        </button>
      </div>
      {(current.groups ?? []).length > 0 ? (
        <div className="condition-builder__group-children">
          {(current.groups ?? []).map((child, index) =>
            renderGroup(child, [...path, index], false)
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="condition-builder">
      {renderGroup(group, [], true)}
    </div>
  );
}
