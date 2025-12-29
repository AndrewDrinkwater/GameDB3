
import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

type Pack = {
  id: string;
  name: string;
  description?: string | null;
  posture: "opinionated" | "minimal";
};

type ChoiceOption = {
  id: string;
  value: string;
  label: string;
  order?: number | null;
  isActive?: boolean | null;
};

type ChoiceList = {
  id: string;
  name: string;
  description?: string | null;
  options: ChoiceOption[];
};

type TemplateField = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  defaultEnabled: boolean;
  choiceListId?: string | null;
  choiceList?: { id: string; name: string } | null;
};

type EntityTypeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isCore: boolean;
  fields: TemplateField[];
};

type LocationTypeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  isCore: boolean;
  fields: TemplateField[];
};

type LocationRuleTemplate = {
  id: string;
  parentLocationTypeTemplateId: string;
  childLocationTypeTemplateId: string;
};

type RelationshipTypeTemplateRole = {
  id: string;
  fromRole: string;
  toRole: string;
};

type RelationshipTypeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  isPeerable: boolean;
  fromLabel: string;
  toLabel: string;
  pastFromLabel?: string | null;
  pastToLabel?: string | null;
  roles: RelationshipTypeTemplateRole[];
};

type PackDetail = Pack & {
  choiceLists: ChoiceList[];
  entityTypeTemplates: EntityTypeTemplate[];
  locationTypeTemplates: LocationTypeTemplate[];
  locationTypeRuleTemplates: LocationRuleTemplate[];
  relationshipTypeTemplates: RelationshipTypeTemplate[];
};

type BuilderField = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  enabled: boolean;
  choiceListKey?: string | null;
};

type BuilderType = {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  isCore: boolean;
  source: "template" | "custom";
  fields: BuilderField[];
};

type BuilderLocationRule = {
  id: string;
  parentKey: string;
  childKey: string;
  enabled: boolean;
};

type BuilderRelationship = {
  key: string;
  name: string;
  description?: string;
  isPeerable: boolean;
  fromLabel: string;
  toLabel: string;
  pastFromLabel?: string;
  pastToLabel?: string;
  enabled: boolean;
  roles: Array<{
    id: string;
    fromRole: string;
    toRole: string;
    fromTypeKey?: string;
    toTypeKey?: string;
  }>;
};

type WorldBuilderProps = {
  token: string;
  worldId?: string;
  worldLabel?: string;
  onApplied?: () => void;
};

const entityFieldTypes = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "CHOICE",
  "ENTITY_REFERENCE",
  "LOCATION_REFERENCE"
];

const locationFieldTypes = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "CHOICE",
  "ENTITY_REFERENCE",
  "LOCATION_REFERENCE"
];

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function WorldBuilder({ token, worldId, worldLabel, onApplied }: WorldBuilderProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packDetail, setPackDetail] = useState<PackDetail | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choiceLists, setChoiceLists] = useState<ChoiceList[]>([]);
  const [entityTypes, setEntityTypes] = useState<BuilderType[]>([]);
  const [locationTypes, setLocationTypes] = useState<BuilderType[]>([]);
  const [locationRules, setLocationRules] = useState<BuilderLocationRule[]>([]);
  const [relationships, setRelationships] = useState<BuilderRelationship[]>([]);
  const [customEntityDraft, setCustomEntityDraft] = useState({ name: "", description: "" });
  const [customLocationDraft, setCustomLocationDraft] = useState({ name: "", description: "" });

  const handleUnauthorized = (response: Response) => {
    if (response.status === 401) {
      dispatchUnauthorized();
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!worldId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/world-builder/packs?worldId=${worldId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (handleUnauthorized(response)) return [];
        if (!response.ok) throw new Error("Unable to load packs.");
        return (await response.json()) as Pack[];
      })
      .then((data) => {
        setPacks(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load packs.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, worldId]);

  useEffect(() => {
    if (!selectedPackId || !worldId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/world-builder/packs/${selectedPackId}?worldId=${worldId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        if (handleUnauthorized(response)) return null;
        if (!response.ok) throw new Error("Unable to load pack details.");
        return (await response.json()) as PackDetail;
      })
        .then((data) => {
          if (!data) return;
          setPackDetail(data);
          setChoiceLists(
            data.choiceLists.map((list) => ({
              ...list,
              options: [...(list.options ?? [])].sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0)
              )
            }))
          );

          const posture = data.posture;
          const entitySeed = data.entityTypeTemplates.map((template) => {
            const enabled =
              template.isCore || (posture === "opinionated" && !template.isCore);
          return {
            key: `entity-template-${template.id}`,
            name: template.name,
            description: template.description ?? "",
            enabled,
            isCore: template.isCore,
            source: "template" as const,
            fields: template.fields.map((field) => ({
              id: `field-${field.id}`,
                fieldKey: field.fieldKey,
                fieldLabel: field.fieldLabel,
                fieldType: field.fieldType,
                required: field.required,
                enabled: field.defaultEnabled,
                choiceListKey: field.choiceList?.id ?? field.choiceListId ?? null
              }))
            };
          });

        const locationSeed = data.locationTypeTemplates.map((template) => {
          const enabled =
            template.isCore || (posture === "opinionated" && !template.isCore);
          return {
            key: `location-template-${template.id}`,
            name: template.name,
            description: template.description ?? "",
            enabled,
            isCore: template.isCore,
            source: "template" as const,
            fields: template.fields.map((field) => ({
              id: `field-${field.id}`,
                fieldKey: field.fieldKey,
                fieldLabel: field.fieldLabel,
                fieldType: field.fieldType,
                required: field.required,
                enabled: field.defaultEnabled,
                choiceListKey: field.choiceList?.id ?? field.choiceListId ?? null
              }))
            };
          });

        const locationRuleSeed = data.locationTypeRuleTemplates.map((rule) => ({
          id: rule.id,
          parentKey: `location-template-${rule.parentLocationTypeTemplateId}`,
          childKey: `location-template-${rule.childLocationTypeTemplateId}`,
          enabled: posture === "opinionated"
        }));

        const relationshipSeed = data.relationshipTypeTemplates.map((rel) => ({
          key: `relationship-template-${rel.id}`,
          name: rel.name,
          description: rel.description ?? "",
          isPeerable: rel.isPeerable,
          fromLabel: rel.fromLabel,
          toLabel: rel.toLabel,
          pastFromLabel: rel.pastFromLabel ?? "",
          pastToLabel: rel.pastToLabel ?? "",
          enabled: posture === "opinionated",
          roles: rel.roles.map((role) => ({
            id: role.id,
            fromRole: role.fromRole,
            toRole: role.toRole
          }))
        }));

        setEntityTypes(entitySeed);
        setLocationTypes(locationSeed);
        setLocationRules(locationRuleSeed);
        setRelationships(relationshipSeed);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load pack details.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedPackId, token, worldId]);

  const stepLabels = [
    "Pack",
    "Entity Types",
    "Location Types",
    "Relationships",
    "Review"
  ];

  const availableEntityTypes = useMemo(
    () => entityTypes.filter((type) => type.enabled),
    [entityTypes]
  );

  const addCustomEntityType = () => {
    if (!customEntityDraft.name.trim()) return;
    const key = `entity-custom-${createId()}`;
    setEntityTypes((current) => [
      ...current,
      {
        key,
        name: customEntityDraft.name.trim(),
        description: customEntityDraft.description.trim(),
        enabled: true,
        isCore: false,
        source: "custom",
        fields: []
      }
    ]);
    setCustomEntityDraft({ name: "", description: "" });
  };

  const addCustomLocationType = () => {
    if (!customLocationDraft.name.trim()) return;
    const key = `location-custom-${createId()}`;
    setLocationTypes((current) => [
      ...current,
      {
        key,
        name: customLocationDraft.name.trim(),
        description: customLocationDraft.description.trim(),
        enabled: true,
        isCore: false,
        source: "custom",
        fields: []
      }
    ]);
    setCustomLocationDraft({ name: "", description: "" });
  };

  const updateField = (
    typeKey: string,
    fieldId: string,
    updater: (field: BuilderField) => BuilderField,
    scope: "entity" | "location"
  ) => {
    const setter = scope === "entity" ? setEntityTypes : setLocationTypes;
    setter((current) =>
      current.map((type) => {
        if (type.key !== typeKey) return type;
        return {
          ...type,
          fields: type.fields.map((field) =>
            field.id === fieldId ? updater(field) : field
          )
        };
      })
    );
  };

  const addCustomField = (typeKey: string, scope: "entity" | "location") => {
    const setter = scope === "entity" ? setEntityTypes : setLocationTypes;
    setter((current) =>
      current.map((type) => {
        if (type.key !== typeKey) return type;
        return {
          ...type,
          fields: [
            ...type.fields,
              {
                id: `custom-${createId()}`,
                fieldKey: "",
                fieldLabel: "",
                fieldType: scope === "entity" ? "TEXT" : "TEXT",
                required: false,
                enabled: true,
                choiceListKey: null
              }
            ]
          };
      })
    );
  };

  const createChoiceList = (name = "New Choice List") => {
    const id = `choice-${createId()}`;
    setChoiceLists((current) => [
      ...current,
      {
        id,
        name,
        description: "",
        options: []
      }
    ]);
    return id;
  };

  const updateChoiceList = (listId: string, updater: (list: ChoiceList) => ChoiceList) => {
    setChoiceLists((current) =>
      current.map((list) => (list.id === listId ? updater(list) : list))
    );
  };

  const addChoiceOption = (listId: string) => {
    updateChoiceList(listId, (list) => ({
      ...list,
      options: [
        ...list.options,
        { id: `option-${createId()}`, value: "", label: "", order: list.options.length }
      ]
    }));
  };

  const removeChoiceOption = (listId: string, optionId: string) => {
    updateChoiceList(listId, (list) => ({
      ...list,
      options: list.options.filter((option) => option.id !== optionId)
    }));
  };

  const summaryIssues = useMemo(() => {
    const issues: string[] = [];
    relationships.forEach((rel) => {
      if (!rel.enabled) return;
      rel.roles.forEach((role) => {
        if (!role.fromTypeKey || !role.toTypeKey) {
          issues.push(`Relationship "${rel.name}" has unmapped roles.`);
        }
      });
    });
    const checkChoiceFields = (types: BuilderType[]) => {
      types.forEach((type) => {
        if (!type.enabled) return;
        type.fields.forEach((field) => {
          if (!field.enabled || field.fieldType !== "CHOICE") return;
          if (!field.choiceListKey) {
            issues.push(`Choice field "${field.fieldLabel}" needs a choice list.`);
            return;
          }
          const list = choiceLists.find((item) => item.id === field.choiceListKey);
          if (!list) {
            issues.push(`Choice field "${field.fieldLabel}" references a missing list.`);
            return;
          }
          if (list.options.length === 0) {
            issues.push(`Choice list "${list.name}" has no options.`);
          }
        });
      });
    };
    checkChoiceFields(entityTypes);
    checkChoiceFields(locationTypes);
    return issues;
  }, [relationships, choiceLists, entityTypes, locationTypes]);

  const usedChoiceLists = useMemo(() => {
    const keys = new Set<string>();
    const scanFields = (types: BuilderType[]) => {
      types.forEach((type) => {
        if (!type.enabled) return;
        type.fields.forEach((field) => {
          if (field.enabled && field.fieldType === "CHOICE" && field.choiceListKey) {
            keys.add(field.choiceListKey);
          }
        });
      });
    };
    scanFields(entityTypes);
    scanFields(locationTypes);
    return choiceLists.filter((list) => keys.has(list.id));
  }, [choiceLists, entityTypes, locationTypes]);

  const handleApply = async () => {
    if (!worldId || !packDetail) return;
    setLoading(true);
    setError(null);

    const usedChoiceListKeys = new Set<string>();
    entityTypes.forEach((type) => {
      if (!type.enabled) return;
      type.fields.forEach((field) => {
        if (field.enabled && field.fieldType === "CHOICE" && field.choiceListKey) {
          usedChoiceListKeys.add(field.choiceListKey);
        }
      });
    });
    locationTypes.forEach((type) => {
      if (!type.enabled) return;
      type.fields.forEach((field) => {
        if (field.enabled && field.fieldType === "CHOICE" && field.choiceListKey) {
          usedChoiceListKeys.add(field.choiceListKey);
        }
      });
    });

    const payload = {
      worldId,
      packId: packDetail.id,
      choiceLists: choiceLists
        .filter((list) => usedChoiceListKeys.has(list.id))
        .map((list) => ({
          key: list.id,
          name: list.name,
          description: list.description,
          options: (list.options ?? [])
            .map((option, index) => ({
              value: option.value.trim(),
              label: option.label.trim(),
              order: option.order ?? index,
              isActive: option.isActive ?? true
            }))
            .filter((option) => option.value && option.label)
        })),
      entityTypes: entityTypes
        .filter((type) => type.enabled)
        .map((type) => ({
          key: type.key,
          name: type.name,
          description: type.description,
          fields: type.fields
            .filter((field) => field.enabled)
            .map((field) => ({
              fieldKey: field.fieldKey,
              label: field.fieldLabel,
              fieldType: field.fieldType,
              required: field.required,
              enabled: field.enabled,
              choiceListKey: field.choiceListKey ?? null
            }))
        })),
      locationTypes: locationTypes
        .filter((type) => type.enabled)
        .map((type) => ({
          key: type.key,
          name: type.name,
          description: type.description,
          fields: type.fields
            .filter((field) => field.enabled)
            .map((field) => ({
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              fieldType: field.fieldType,
              required: field.required,
              enabled: field.enabled,
              choiceListKey: field.choiceListKey ?? null
            }))
        })),
      locationRules: locationRules
        .filter((rule) => rule.enabled)
        .map((rule) => ({
          parentKey: rule.parentKey,
          childKey: rule.childKey,
          allowed: true
        })),
      relationshipTypes: relationships.map((rel) => ({
        key: rel.key,
        name: rel.name,
        description: rel.description,
        isPeerable: rel.isPeerable,
        fromLabel: rel.fromLabel,
        toLabel: rel.toLabel,
        pastFromLabel: rel.pastFromLabel,
        pastToLabel: rel.pastToLabel,
        enabled: rel.enabled,
        roleMappings: rel.roles
          .filter((role) => role.fromTypeKey && role.toTypeKey)
          .map((role) => ({
            fromRole: role.fromRole,
            toRole: role.toRole,
            fromTypeKey: role.fromTypeKey,
            toTypeKey: role.toTypeKey
          }))
      }))
    };

    try {
      const response = await fetch("/api/world-builder/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to apply pack.");
      }
      onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply pack.");
    } finally {
      setLoading(false);
    }
  };

  if (!worldId) {
    return (
      <div className="world-builder">
        <div className="world-builder__panel">
          <h1>Guided World Builder</h1>
          <p>Select a world context to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="world-builder">
      <header className="world-builder__header">
        <div>
          <h1>Guided World Builder</h1>
          <p>
            Build your world structure with a single Pack. Everything created is editable
            afterward.
          </p>
        </div>
        <div className="world-builder__meta">
          <span className="world-builder__meta-label">World</span>
          <strong>{worldLabel ?? worldId}</strong>
        </div>
      </header>

      <div className="world-builder__steps">
        {stepLabels.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`world-builder__step ${
              step === index ? "is-active" : step > index ? "is-complete" : ""
            }`}
            onClick={() => {
              if (index <= step) setStep(index);
            }}
          >
            <span>{index + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error ? <div className="world-builder__error">{error}</div> : null}

      {loading ? <div className="world-builder__panel">Loading...</div> : null}

      {!loading && step === 0 ? (
        <div className="world-builder__panel">
          <h2>Select Pack</h2>
          <p className="world-builder__hint">
            Choose how opinionated you want your world setup to be.
          </p>
          <div className="world-builder__grid">
            {packs.map((pack) => (
              <button
                type="button"
                key={pack.id}
                className={`world-builder__card ${
                  selectedPackId === pack.id ? "is-selected" : ""
                }`}
                onClick={() => {
                  setSelectedPackId(pack.id);
                  setStep(1);
                }}
              >
                <div className="world-builder__card-title">{pack.name}</div>
                <div className="world-builder__card-meta">{pack.posture}</div>
                <div className="world-builder__card-body">
                  {pack.description ?? "No description."}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && step === 1 && packDetail ? (
        <div className="world-builder__panel">
          <h2>Entity Types</h2>
          <p className="world-builder__hint">
            Toggle optional templates, then enable the fields you want to include.
          </p>
          {entityTypes.map((type) => (
            <div key={type.key} className="world-builder__section">
              <div className="world-builder__section-header">
                <label>
                  <input
                    type="checkbox"
                    checked={type.enabled}
                    disabled={type.isCore}
                    onChange={(event) =>
                      setEntityTypes((current) =>
                        current.map((item) =>
                          item.key === type.key
                            ? { ...item, enabled: event.target.checked }
                            : item
                        )
                      )
                    }
                  />
                  <span>{type.name}</span>
                </label>
                <span className="world-builder__badge">
                  {type.isCore ? "Core" : type.source === "custom" ? "Custom" : "Optional"}
                </span>
              </div>
              {type.enabled ? (
                <>
                  <div className="world-builder__field-row">
                    <label>
                      Name
                      <input
                        value={type.name}
                        onChange={(event) =>
                          setEntityTypes((current) =>
                            current.map((item) =>
                              item.key === type.key ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={type.description ?? ""}
                        onChange={(event) =>
                          setEntityTypes((current) =>
                            current.map((item) =>
                              item.key === type.key
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="world-builder__fields">
                    {type.fields.map((field) => (
                      <div key={field.id} className="world-builder__field">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            onChange={(event) =>
                              updateField(
                                type.key,
                                field.id,
                                (current) => ({ ...current, enabled: event.target.checked }),
                                "entity"
                              )
                            }
                          />
                          <span>Include</span>
                        </label>
                        <input
                          placeholder="Field key"
                          value={field.fieldKey}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => ({ ...current, fieldKey: event.target.value }),
                              "entity"
                            )
                          }
                        />
                        <input
                          placeholder="Label"
                          value={field.fieldLabel}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => ({ ...current, fieldLabel: event.target.value }),
                              "entity"
                            )
                          }
                        />
                        <select
                          value={field.fieldType}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => {
                                const nextType = event.target.value;
                                let nextChoiceListKey = current.choiceListKey ?? null;
                                if (nextType === "CHOICE") {
                                  if (!nextChoiceListKey) {
                                    nextChoiceListKey =
                                      choiceLists[0]?.id ?? createChoiceList();
                                  }
                                } else {
                                  nextChoiceListKey = null;
                                }
                                return {
                                  ...current,
                                  fieldType: nextType,
                                  choiceListKey: nextChoiceListKey
                                };
                              },
                              "entity"
                            )
                          }
                        >
                          {entityFieldTypes.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              updateField(
                                type.key,
                                field.id,
                                (current) => ({ ...current, required: event.target.checked }),
                                "entity"
                              )
                            }
                          />
                          <span>Required</span>
                        </label>
                        {field.fieldType === "CHOICE" ? (
                          <div className="world-builder__choice-editor">
                            <label>
                              Choice List
                              <select
                                value={field.choiceListKey ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === "__new") {
                                    const created = createChoiceList();
                                    updateField(
                                      type.key,
                                      field.id,
                                      (current) => ({ ...current, choiceListKey: created }),
                                      "entity"
                                    );
                                    return;
                                  }
                                  updateField(
                                    type.key,
                                    field.id,
                                    (current) => ({
                                      ...current,
                                      choiceListKey: value ? value : null
                                    }),
                                    "entity"
                                  );
                                }}
                              >
                                <option value="">Select a list...</option>
                                {choiceLists.map((list) => (
                                  <option key={list.id} value={list.id}>
                                    {list.name}
                                  </option>
                                ))}
                                <option value="__new">+ New list</option>
                              </select>
                            </label>
                            {field.choiceListKey ? (
                              <div className="world-builder__choice-options">
                                {(choiceLists.find((list) => list.id === field.choiceListKey)?.options ?? []).map(
                                  (option) => (
                                    <div key={option.id} className="world-builder__choice-row">
                                      <input
                                        placeholder="Value"
                                        value={option.value}
                                        onChange={(event) =>
                                          updateChoiceList(field.choiceListKey as string, (list) => ({
                                            ...list,
                                            options: list.options.map((item) =>
                                              item.id === option.id
                                                ? { ...item, value: event.target.value }
                                                : item
                                            )
                                          }))
                                        }
                                      />
                                      <input
                                        placeholder="Label"
                                        value={option.label}
                                        onChange={(event) =>
                                          updateChoiceList(field.choiceListKey as string, (list) => ({
                                            ...list,
                                            options: list.options.map((item) =>
                                              item.id === option.id
                                                ? { ...item, label: event.target.value }
                                                : item
                                            )
                                          }))
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() =>
                                          removeChoiceOption(field.choiceListKey as string, option.id)
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )
                                )}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => addChoiceOption(field.choiceListKey as string)}
                                >
                                  Add option
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => addCustomField(type.key, "entity")}
                    >
                      Add custom field
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ))}
          <div className="world-builder__section">
            <h3>Add custom entity type</h3>
            <div className="world-builder__field-row">
              <input
                placeholder="Name"
                value={customEntityDraft.name}
                onChange={(event) =>
                  setCustomEntityDraft((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
              <input
                placeholder="Description"
                value={customEntityDraft.description}
                onChange={(event) =>
                  setCustomEntityDraft((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
              <button type="button" className="ghost-button" onClick={addCustomEntityType}>
                Add
              </button>
            </div>
          </div>
          <div className="world-builder__actions">
            <button type="button" className="ghost-button" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="primary-button" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
      {!loading && step === 2 && packDetail ? (
        <div className="world-builder__panel">
          <h2>Location Types</h2>
          <p className="world-builder__hint">
            Confirm which locations and containment rules fit your world.
          </p>
          {locationTypes.map((type) => (
            <div key={type.key} className="world-builder__section">
              <div className="world-builder__section-header">
                <label>
                  <input
                    type="checkbox"
                    checked={type.enabled}
                    disabled={type.isCore}
                    onChange={(event) =>
                      setLocationTypes((current) =>
                        current.map((item) =>
                          item.key === type.key
                            ? { ...item, enabled: event.target.checked }
                            : item
                        )
                      )
                    }
                  />
                  <span>{type.name}</span>
                </label>
                <span className="world-builder__badge">
                  {type.isCore ? "Core" : type.source === "custom" ? "Custom" : "Optional"}
                </span>
              </div>
              {type.enabled ? (
                <>
                  <div className="world-builder__field-row">
                    <label>
                      Name
                      <input
                        value={type.name}
                        onChange={(event) =>
                          setLocationTypes((current) =>
                            current.map((item) =>
                              item.key === type.key ? { ...item, name: event.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={type.description ?? ""}
                        onChange={(event) =>
                          setLocationTypes((current) =>
                            current.map((item) =>
                              item.key === type.key
                                ? { ...item, description: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="world-builder__fields">
                    {type.fields.map((field) => (
                      <div key={field.id} className="world-builder__field">
                        <label>
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            onChange={(event) =>
                              updateField(
                                type.key,
                                field.id,
                                (current) => ({ ...current, enabled: event.target.checked }),
                                "location"
                              )
                            }
                          />
                          <span>Include</span>
                        </label>
                        <input
                          placeholder="Field key"
                          value={field.fieldKey}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => ({ ...current, fieldKey: event.target.value }),
                              "location"
                            )
                          }
                        />
                        <input
                          placeholder="Label"
                          value={field.fieldLabel}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => ({ ...current, fieldLabel: event.target.value }),
                              "location"
                            )
                          }
                        />
                        <select
                          value={field.fieldType}
                          onChange={(event) =>
                            updateField(
                              type.key,
                              field.id,
                              (current) => {
                                const nextType = event.target.value;
                                let nextChoiceListKey = current.choiceListKey ?? null;
                                if (nextType === "CHOICE") {
                                  if (!nextChoiceListKey) {
                                    nextChoiceListKey =
                                      choiceLists[0]?.id ?? createChoiceList();
                                  }
                                } else {
                                  nextChoiceListKey = null;
                                }
                                return {
                                  ...current,
                                  fieldType: nextType,
                                  choiceListKey: nextChoiceListKey
                                };
                              },
                              "location"
                            )
                          }
                        >
                          {locationFieldTypes.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              updateField(
                                type.key,
                                field.id,
                                (current) => ({ ...current, required: event.target.checked }),
                                "location"
                              )
                            }
                          />
                          <span>Required</span>
                        </label>
                        {field.fieldType === "CHOICE" ? (
                          <div className="world-builder__choice-editor">
                            <label>
                              Choice List
                              <select
                                value={field.choiceListKey ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === "__new") {
                                    const created = createChoiceList();
                                    updateField(
                                      type.key,
                                      field.id,
                                      (current) => ({ ...current, choiceListKey: created }),
                                      "location"
                                    );
                                    return;
                                  }
                                  updateField(
                                    type.key,
                                    field.id,
                                    (current) => ({
                                      ...current,
                                      choiceListKey: value ? value : null
                                    }),
                                    "location"
                                  );
                                }}
                              >
                                <option value="">Select a list...</option>
                                {choiceLists.map((list) => (
                                  <option key={list.id} value={list.id}>
                                    {list.name}
                                  </option>
                                ))}
                                <option value="__new">+ New list</option>
                              </select>
                            </label>
                            {field.choiceListKey ? (
                              <div className="world-builder__choice-options">
                                {(choiceLists.find((list) => list.id === field.choiceListKey)?.options ?? []).map(
                                  (option) => (
                                    <div key={option.id} className="world-builder__choice-row">
                                      <input
                                        placeholder="Value"
                                        value={option.value}
                                        onChange={(event) =>
                                          updateChoiceList(field.choiceListKey as string, (list) => ({
                                            ...list,
                                            options: list.options.map((item) =>
                                              item.id === option.id
                                                ? { ...item, value: event.target.value }
                                                : item
                                            )
                                          }))
                                        }
                                      />
                                      <input
                                        placeholder="Label"
                                        value={option.label}
                                        onChange={(event) =>
                                          updateChoiceList(field.choiceListKey as string, (list) => ({
                                            ...list,
                                            options: list.options.map((item) =>
                                              item.id === option.id
                                                ? { ...item, label: event.target.value }
                                                : item
                                            )
                                          }))
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() =>
                                          removeChoiceOption(field.choiceListKey as string, option.id)
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )
                                )}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => addChoiceOption(field.choiceListKey as string)}
                                >
                                  Add option
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => addCustomField(type.key, "location")}
                    >
                      Add custom field
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ))}
          <div className="world-builder__section">
            <h3>Add custom location type</h3>
            <div className="world-builder__field-row">
              <input
                placeholder="Name"
                value={customLocationDraft.name}
                onChange={(event) =>
                  setCustomLocationDraft((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
              <input
                placeholder="Description"
                value={customLocationDraft.description}
                onChange={(event) =>
                  setCustomLocationDraft((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
              <button type="button" className="ghost-button" onClick={addCustomLocationType}>
                Add
              </button>
            </div>
          </div>
          {locationRules.length > 0 ? (
            <div className="world-builder__section">
              <h3>Containment rules</h3>
              <div className="world-builder__rules">
                {locationRules.map((rule) => {
                  const parent = locationTypes.find((type) => type.key === rule.parentKey);
                  const child = locationTypes.find((type) => type.key === rule.childKey);
                  if (!parent || !child) return null;
                  return (
                    <label key={rule.id} className="world-builder__rule">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          setLocationRules((current) =>
                            current.map((item) =>
                              item.id === rule.id
                                ? { ...item, enabled: event.target.checked }
                                : item
                            )
                          )
                        }
                      />
                      <span>
                        {parent.name} contains {child.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="world-builder__actions">
            <button type="button" className="ghost-button" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="primary-button" onClick={() => setStep(3)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {!loading && step === 3 && packDetail ? (
        <div className="world-builder__panel">
          <h2>Relationship Types</h2>
          <p className="world-builder__hint">
            Map abstract roles to the entity types you have selected.
          </p>
          {relationships.map((rel) => (
            <div key={rel.key} className="world-builder__section">
              <div className="world-builder__section-header">
                <label>
                  <input
                    type="checkbox"
                    checked={rel.enabled}
                    onChange={(event) =>
                      setRelationships((current) =>
                        current.map((item) =>
                          item.key === rel.key ? { ...item, enabled: event.target.checked } : item
                        )
                      )
                    }
                  />
                  <span>{rel.name}</span>
                </label>
                <span className="world-builder__badge">
                  {rel.isPeerable ? "Peerable" : "Directional"}
                </span>
              </div>
              {rel.enabled ? (
                <div className="world-builder__rules">
                  {rel.roles.map((role) => (
                    <div key={role.id} className="world-builder__role">
                      <div>
                        {role.fromRole}
                        {" -> "}
                        {role.toRole}
                      </div>
                      <select
                        value={role.fromTypeKey ?? ""}
                        onChange={(event) =>
                          setRelationships((current) =>
                            current.map((item) =>
                              item.key === rel.key
                                ? {
                                    ...item,
                                    roles: item.roles.map((entry) =>
                                      entry.id === role.id
                                        ? { ...entry, fromTypeKey: event.target.value }
                                        : entry
                                    )
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <option value="">From type...</option>
                        {availableEntityTypes.map((type) => (
                          <option key={type.key} value={type.key}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={role.toTypeKey ?? ""}
                        onChange={(event) =>
                          setRelationships((current) =>
                            current.map((item) =>
                              item.key === rel.key
                                ? {
                                    ...item,
                                    roles: item.roles.map((entry) =>
                                      entry.id === role.id
                                        ? { ...entry, toTypeKey: event.target.value }
                                        : entry
                                    )
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <option value="">To type...</option>
                        {availableEntityTypes.map((type) => (
                          <option key={type.key} value={type.key}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div className="world-builder__actions">
            <button type="button" className="ghost-button" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="primary-button" onClick={() => setStep(4)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {!loading && step === 4 && packDetail ? (
        <div className="world-builder__panel">
          <h2>Review & Summary</h2>
          <p className="world-builder__hint">
            Everything below will be created as normal world-scoped types and can be edited or deleted later.
          </p>
          {summaryIssues.length > 0 ? (
            <div className="world-builder__warning">
              {summaryIssues.map((issue) => (
                <div key={issue}>{issue}</div>
              ))}
            </div>
          ) : null}
          <div className="world-builder__summary">
            <div>
              <h3>Entity Types</h3>
              {entityTypes.filter((type) => type.enabled).map((type) => (
                <div key={type.key} className="world-builder__summary-item">
                  <strong>{type.name}</strong>
                  <div>
                    Fields: {type.fields.filter((field) => field.enabled).length}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h3>Location Types</h3>
              {locationTypes.filter((type) => type.enabled).map((type) => (
                <div key={type.key} className="world-builder__summary-item">
                  <strong>{type.name}</strong>
                  <div>
                    Fields: {type.fields.filter((field) => field.enabled).length}
                  </div>
                </div>
              ))}
              <div className="world-builder__summary-item">
                Containment rules: {locationRules.filter((rule) => rule.enabled).length}
              </div>
            </div>
            <div>
              <h3>Relationship Types</h3>
              {relationships.filter((rel) => rel.enabled).map((rel) => (
                <div key={rel.key} className="world-builder__summary-item">
                  <strong>{rel.name}</strong>
                  <div>{rel.isPeerable ? "Peerable" : "Directional"}</div>
                </div>
              ))}
            </div>
            <div>
              <h3>Choice Lists</h3>
              {usedChoiceLists.length === 0 ? (
                <div className="world-builder__summary-item">No choice lists selected.</div>
              ) : (
                usedChoiceLists.map((list) => (
                  <div key={list.id} className="world-builder__summary-item">
                    <strong>{list.name}</strong>
                    <div>Options: {list.options.length}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="world-builder__actions">
            <button type="button" className="ghost-button" onClick={() => setStep(3)}>
              Back
            </button>
            <button type="button" className="primary-button" onClick={handleApply} disabled={loading}>
              {loading ? "Creating..." : "Create world structure"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
