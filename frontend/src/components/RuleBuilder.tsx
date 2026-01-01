import React, { useEffect, useMemo, useState } from "react";

type RelationshipType = {
  id: string;
  name: string;
  fromLabel: string;
  toLabel: string;
};

type EntityTypeSummary = {
  id: string;
  name: string;
};

type RuleSummary = {
  id: string;
  relationshipTypeId: string;
  fromEntityTypeId: string;
  toEntityTypeId: string;
  fromEntityType?: EntityTypeSummary | null;
  toEntityType?: EntityTypeSummary | null;
};

type RuleBuilderProps = {
  token: string;
  contextWorldId?: string | null;
};

const RuleBuilder = ({ token, contextWorldId }: RuleBuilderProps) => {
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [selectedRelationshipTypeId, setSelectedRelationshipTypeId] = useState<string>("");
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityTypeSummary[]>([]);
  const [fromSelections, setFromSelections] = useState<string[]>([]);
  const [toSelections, setToSelections] = useState<string[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [loadingRules, setLoadingRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingDelete, setSavingDelete] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    let ignore = false;
    const loadRelationshipTypes = async () => {
      try {
        const params = new URLSearchParams();
        if (contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        const response = await fetch(`/api/relationship-types?${params.toString()}`, {
          headers
        });
        if (!response.ok) {
          throw new Error("Unable to load relationship types.");
        }
        const data = (await response.json()) as RelationshipType[];
        if (!ignore) {
          setRelationshipTypes(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load relationship types.");
        }
      }
    };

    void loadRelationshipTypes();
    return () => {
      ignore = true;
    };
  }, [headers, contextWorldId]);

  useEffect(() => {
    let ignore = false;
    const loadEntityTypes = async () => {
      try {
        const params = new URLSearchParams();
        if (contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        const response = await fetch(`/api/entity-types?${params.toString()}`, { headers });
        if (!response.ok) {
          throw new Error("Unable to load entity types.");
        }
        const data = (await response.json()) as EntityTypeSummary[];
        if (!ignore) {
          setEntityTypes(data);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load entity types.");
        }
      }
    };

    void loadEntityTypes();
    return () => {
      ignore = true;
    };
  }, [headers, contextWorldId]);

  useEffect(() => {
    if (!selectedRelationshipTypeId) {
      setRules([]);
      setSelectedDeleteIds(new Set());
      return;
    }
    let ignore = false;
    setLoadingRules(true);
    const loadRules = async () => {
      try {
        const params = new URLSearchParams({ relationshipTypeId: selectedRelationshipTypeId });
        if (contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        const response = await fetch(`/api/relationship-type-rules?${params.toString()}`, {
          headers
        });
        if (!response.ok) {
          throw new Error("Unable to load rules.");
        }
        const payload = await response.json();
        const nextRules = Array.isArray(payload) ? payload : payload.rules ?? [];
        if (!ignore) {
          setRules(nextRules);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load rules.");
        }
      } finally {
        if (!ignore) {
          setLoadingRules(false);
        }
      }
    };
    void loadRules();
    return () => {
      ignore = true;
    };
  }, [headers, selectedRelationshipTypeId, contextWorldId]);

  const selectedRelationshipType =
    relationshipTypes.find((type) => type.id === selectedRelationshipTypeId) ?? null;

  const rulePairsToDelete = useMemo(() => {
    if (selectedDeleteIds.size === 0) return [];
    return rules.filter((rule) => selectedDeleteIds.has(rule.id));
  }, [selectedDeleteIds, rules]);

  const existingPairKeys = useMemo(
    () => new Set(rules.map((rule) => `${rule.fromEntityTypeId}:${rule.toEntityTypeId}`)),
    [rules]
  );

  const combosToAdd = useMemo(() => {
    if (fromSelections.length === 0 || toSelections.length === 0) return [];
    const entityMap = new Map(entityTypes.map((type) => [type.id, type.name]));
    const combos: Array<{ fromId: string; toId: string; fromLabel: string; toLabel: string }> = [];
    fromSelections.forEach((fromId) => {
      toSelections.forEach((toId) => {
        const key = `${fromId}:${toId}`;
        if (existingPairKeys.has(key)) return;
        combos.push({
          fromId,
          toId,
          fromLabel: entityMap.get(fromId) ?? fromId,
          toLabel: entityMap.get(toId) ?? toId
        });
      });
    });
    return combos;
  }, [fromSelections, toSelections, entityTypes, existingPairKeys]);

  const refreshRules = async () => {
    if (!selectedRelationshipTypeId) return;
    setLoadingRules(true);
    try {
      const params = new URLSearchParams({ relationshipTypeId: selectedRelationshipTypeId });
      if (contextWorldId) {
        params.set("worldId", contextWorldId);
      }
      const response = await fetch(`/api/relationship-type-rules?${params.toString()}`, {
        headers
      });
      if (!response.ok) {
        throw new Error("Unable to reload rules.");
      }
      const payload = await response.json();
      const nextRules = Array.isArray(payload) ? payload : payload.rules ?? [];
      setRules(nextRules);
      setSelectedDeleteIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reload rules.");
    } finally {
      setLoadingRules(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedRelationshipTypeId) return;
    if (fromSelections.length === 0 || toSelections.length === 0) return;
    setSavingAdd(true);
    setError(null);
    try {
      const response = await fetch(`/api/relationship-type-rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          relationshipTypeId: selectedRelationshipTypeId,
          fromEntityTypeId: fromSelections,
          toEntityTypeId: toSelections
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to create rules.");
      }
      setFromSelections([]);
      setToSelections([]);
      await refreshRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create rules.");
    } finally {
      setSavingAdd(false);
    }
  };

  const handleDelete = async () => {
    if (selectedDeleteIds.size === 0) return;
    setSavingDelete(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedDeleteIds).map((ruleId) =>
          fetch(`/api/relationship-type-rules/${ruleId}`, {
            method: "DELETE",
            headers
          })
        )
      );
      await refreshRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete rules.");
    } finally {
      setSavingDelete(false);
    }
  };

  const toggleRuleSelection = (ruleId: string, checked: boolean) => {
    setSelectedDeleteIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(ruleId);
      } else {
        next.delete(ruleId);
      }
      return next;
    });
  };

  const handleMultiSelectChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const values = Array.from(event.target.selectedOptions, (option) => option.value);
    setter(values);
  };

  return (
    <div className="rule-builder">
      <div className="rule-builder__header">
        <h1>Relationship Rule Builder</h1>
        <p>Pick a relationship type to manage all of its from/to combinations</p>
      </div>
      {error ? <div className="form-view__error">{error}</div> : null}
      <div className="rule-builder__panel">
        <label className="form-view__field">
          <span className="form-view__label">Relationship type</span>
          <select
            value={selectedRelationshipTypeId}
            onChange={(event) => setSelectedRelationshipTypeId(event.target.value)}
          >
            <option value="">Select a relationship type...</option>
            {relationshipTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        {selectedRelationshipType ? (
          <div className="rule-builder__labels">
            <div>
              <strong>From label</strong>
              <p>{selectedRelationshipType.fromLabel}</p>
            </div>
            <div>
              <strong>To label</strong>
              <p>{selectedRelationshipType.toLabel}</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="rule-builder__body">
        <div className="rule-builder__section">
          <div className="rule-builder__section-header">
            <h2>Existing rules</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={refreshRules}
              disabled={!selectedRelationshipTypeId || loadingRules}
            >
              Refresh
            </button>
          </div>
          {loadingRules ? (
            <p>Loading rules...</p>
          ) : rules.length === 0 ? (
            <p>No rules yet for this relationship.</p>
          ) : (
            <table className="rule-builder__table">
              <thead>
                <tr>
                  <th></th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDeleteIds.has(rule.id)}
                        onChange={(event) => toggleRuleSelection(rule.id, event.target.checked)}
                      />
                    </td>
                    <td>{rule.fromEntityType?.name ?? rule.fromEntityTypeId}</td>
                    <td>{rule.toEntityType?.name ?? rule.toEntityTypeId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selectedDeleteIds.size > 0 ? (
            <div className="rule-builder__summary">
              <div>
                <strong>Rules to remove</strong>
                <p>
                  {rulePairsToDelete
                    .map((rule) => `${rule.fromEntityType?.name ?? rule.fromEntityTypeId} → ${rule.toEntityType?.name ?? rule.toEntityTypeId}`)
                    .join(", ")}
                </p>
                <button
                  type="button"
                  className="danger-button"
                  onClick={handleDelete}
                  disabled={savingDelete}
                >
                  {savingDelete ? "Deleting..." : "Remove selected"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="rule-builder__section">
          <h2>Add rule combinations</h2>
          <div className="rule-builder__selection-grid">
            <label className="form-view__field">
              <span className="form-view__label">From entity types</span>
              <select
                multiple
                value={fromSelections}
                onChange={(event) => handleMultiSelectChange(event, setFromSelections)}
              >
                {entityTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-view__field">
              <span className="form-view__label">To entity types</span>
              <select
                multiple
                value={toSelections}
                onChange={(event) => handleMultiSelectChange(event, setToSelections)}
              >
                {entityTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {combosToAdd.length > 0 ? (
            <div className="rule-builder__summary">
              <strong>Rules to create</strong>
              <p>
                {combosToAdd
                  .map((combo) => `${combo.fromLabel} → ${combo.toLabel}`)
                  .join(", ")}
              </p>
            </div>
          ) : (
            <p className="rule-builder__hint">Select at least one from and one to type.</p>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={handleCreate}
            disabled={
              !selectedRelationshipTypeId ||
              fromSelections.length === 0 ||
              toSelections.length === 0 ||
              savingAdd
            }
          >
            {savingAdd ? "Creating..." : "Create rules"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RuleBuilder;
