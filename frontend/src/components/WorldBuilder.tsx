
import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";
import ClickableTypeCard from "./ui/ClickableTypeCard";
import CustomTypeCreateCard from "./ui/CustomTypeCreateCard";
import HierarchyEditor, { type HierarchyNode } from "./ui/HierarchyEditor";
import InlineAdvancedEditorFrame from "./ui/InlineAdvancedEditorFrame";
import InlineSummaryBar from "./ui/InlineSummaryBar";
import RelationshipSelectorCard from "./ui/RelationshipSelectorCard";
import SelectableCardGrid from "./ui/SelectableCardGrid";
import RuleBuilder from "./RuleBuilder";

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
  status: "active" | "retired";
  source: "template" | "custom";
};

type BuilderType = {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  isCore: boolean;
  status: "active" | "retired";
  source: "template" | "custom";
  fields: BuilderField[];
};

type BuilderLocationRule = {
  id: string;
  parentKey: string;
  childKey: string;
  enabled: boolean;
};

type BuilderRelationshipRule = {
  id: string;
  fromRole: string;
  toRole: string;
  fromTypeKey?: string;
  toTypeKey?: string;
};

type BuilderRelationship = {
  key: string;
  templateId: string;
  name: string;
  description?: string;
  isPeerable: boolean;
  fromLabel: string;
  toLabel: string;
  pastFromLabel?: string;
  pastToLabel?: string;
  enabled: boolean;
  rulesSource: "none" | "default" | "custom";
  roles: RelationshipTypeTemplateRole[];
  ruleMappings: BuilderRelationshipRule[];
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

const normalize = (value: string) => value.toLowerCase();

const toRoleKey = (value: string, fallback: string) => {
  const next = value
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
  return next || fallback;
};

const toFieldKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const pickTypeByKeywords = (types: BuilderType[], keywords: string[]) =>
  types.find((type) => keywords.some((keyword) => normalize(type.name).includes(keyword)));

const relationshipCategories = [
  { label: "Social", match: ["ally", "enemy", "sibling", "spouse", "parent", "friend", "rival"] },
  {
    label: "Organization",
    match: ["member", "employment", "employ", "ruler", "title", "membership"]
  },
  { label: "Possessions", match: ["possess", "covet", "own", "belongs", "property"] }
];

const getRelationshipCategory = (name: string) => {
  const normalized = normalize(name);
  return (
    relationshipCategories.find((category) =>
      category.match.some((keyword) => normalized.includes(keyword))
    )?.label ?? "Other"
  );
};

const getRelationshipDefaults = (relationship: BuilderRelationship, types: BuilderType[]) => {
  const activeTypes = types.filter((type) => type.enabled && type.status === "active");
  const people = pickTypeByKeywords(activeTypes, ["character", "person", "npc", "individual"]);
  const organizations = pickTypeByKeywords(activeTypes, [
    "organization",
    "organisation",
    "guild",
    "faction",
    "clan",
    "company",
    "nation"
  ]);
  const objects = pickTypeByKeywords(activeTypes, ["item", "object", "artifact", "relic", "equipment"]);
  const category = getRelationshipCategory(relationship.name);
  const defaults: Array<{ fromTypeKey: string; toTypeKey: string }> = [];

  if (category === "Social" && people) {
    defaults.push({ fromTypeKey: people.key, toTypeKey: people.key });
  }

  if (category === "Organization") {
    if (people && organizations) {
      defaults.push({ fromTypeKey: people.key, toTypeKey: organizations.key });
    }
    if (organizations) {
      defaults.push({ fromTypeKey: organizations.key, toTypeKey: organizations.key });
    }
  }

  if (category === "Possessions") {
    if (people && objects) {
      defaults.push({ fromTypeKey: people.key, toTypeKey: objects.key });
    }
    if (organizations && objects) {
      defaults.push({ fromTypeKey: organizations.key, toTypeKey: objects.key });
    }
  }

  if (defaults.length === 0) {
    if (people) {
      defaults.push({ fromTypeKey: people.key, toTypeKey: people.key });
    } else if (activeTypes.length >= 2) {
      defaults.push({ fromTypeKey: activeTypes[0].key, toTypeKey: activeTypes[1].key });
    } else if (activeTypes.length === 1) {
      defaults.push({ fromTypeKey: activeTypes[0].key, toTypeKey: activeTypes[0].key });
    }
  }

  const role = relationship.roles[0];
  if (!role) return [];
  return defaults.map((entry) => ({
    id: createId(),
    fromRole: role.fromRole,
    toRole: role.toRole,
    fromTypeKey: entry.fromTypeKey,
    toTypeKey: entry.toTypeKey
  }));
};

export default function WorldBuilder({ token, worldId, worldLabel, onApplied }: WorldBuilderProps) {
  const TOP_LEVEL_ID = "__top__";
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packDetail, setPackDetail] = useState<PackDetail | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choiceLists, setChoiceLists] = useState<ChoiceList[]>([]);
  const [entityTypes, setEntityTypes] = useState<BuilderType[]>([]);
  const [locationTypes, setLocationTypes] = useState<BuilderType[]>([]);
  const [relationships, setRelationships] = useState<BuilderRelationship[]>([]);
  const [customEntityDraft, setCustomEntityDraft] = useState({ name: "", description: "" });
  const [locationDraftParentId, setLocationDraftParentId] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState({ name: "", description: "" });
  const [locationFieldEditorId, setLocationFieldEditorId] = useState<string | null>(null);
  const [locationRenameId, setLocationRenameId] = useState<string | null>(null);
  const [locationRenameDraft, setLocationRenameDraft] = useState({
    name: "",
    description: ""
  });
  const [relationshipDraftOpen, setRelationshipDraftOpen] = useState(false);
  const [relationshipDraft, setRelationshipDraft] = useState({
    name: "",
    description: "",
    isPeerable: false,
    fromLabel: "",
    toLabel: "",
    fromTypeKey: "",
    toTypeKey: ""
  });
  const [entityFieldEditorId, setEntityFieldEditorId] = useState<string | null>(null);
  const [expandedLocationTypes, setExpandedLocationTypes] = useState<Set<string>>(new Set());
  const [openChoiceEditors, setOpenChoiceEditors] = useState<Set<string>>(new Set());
  const [packPreviewId, setPackPreviewId] = useState<string | null>(null);
  const [packPreviewLoading, setPackPreviewLoading] = useState(false);
  const [packPreviews, setPackPreviews] = useState<Record<string, PackDetail>>({});
  const [locationParents, setLocationParents] = useState<Record<string, string | null>>({});
  const [locationOrder, setLocationOrder] = useState<string[]>([]);
  const [relationshipEditorKey, setRelationshipEditorKey] = useState<string | null>(null);
  const [relationshipEditKey, setRelationshipEditKey] = useState<string | null>(null);
  const [relationshipEditDraft, setRelationshipEditDraft] = useState<{
    name: string;
    description: string;
    isPeerable: boolean;
    fromLabel: string;
    toLabel: string;
    mappings: Array<{ id: string; fromTypeKey: string; toTypeKey: string }>;
  } | null>(null);
  const [showCommitConfirm, setShowCommitConfirm] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [structureCreated, setStructureCreated] = useState(false);

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
    if (!activeMenu) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".world-builder__menu")) return;
      setActiveMenu(null);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [activeMenu]);

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
            status: "active" as const,
            source: "template" as const,
            fields: template.fields.map((field) => ({
              id: `field-${field.id}`,
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              fieldType: field.fieldType,
              required: field.required,
              enabled: field.defaultEnabled,
              choiceListKey: field.choiceList?.id ?? field.choiceListId ?? null,
              status: "active" as const,
              source: "template" as const
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
            status: "active" as const,
            source: "template" as const,
            fields: template.fields.map((field) => ({
              id: `field-${field.id}`,
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              fieldType: field.fieldType,
              required: field.required,
              enabled: field.defaultEnabled,
              choiceListKey: field.choiceList?.id ?? field.choiceListId ?? null,
              status: "active" as const,
              source: "template" as const
            }))
          };
        });

        const locationRuleSeed = data.locationTypeRuleTemplates.map((rule) => ({
          id: rule.id,
          parentKey: `location-template-${rule.parentLocationTypeTemplateId}`,
          childKey: `location-template-${rule.childLocationTypeTemplateId}`,
          enabled: false
        }));

        const relationshipSeed = data.relationshipTypeTemplates.map((rel) => ({
          key: `relationship-template-${rel.id}`,
          templateId: rel.id,
          name: rel.name,
          description: rel.description ?? "",
          isPeerable: rel.isPeerable,
          fromLabel: rel.fromLabel,
          toLabel: rel.toLabel,
          pastFromLabel: rel.pastFromLabel ?? "",
          pastToLabel: rel.pastToLabel ?? "",
          enabled: false,
          rulesSource: "none" as const,
          roles: rel.roles,
          ruleMappings: rel.roles.map((role) => ({
            id: role.id,
            fromRole: role.fromRole,
            toRole: role.toRole
          }))
        }));

        const parentMap: Record<string, string | null> = {};
        locationRuleSeed.forEach((rule) => {
          if (parentMap[rule.childKey]) return;
          parentMap[rule.childKey] = rule.parentKey;
        });
        locationSeed.forEach((type) => {
          if (!(type.key in parentMap)) parentMap[type.key] = null;
        });

        setEntityTypes(entitySeed);
        setLocationTypes(locationSeed);
        setRelationships(relationshipSeed);
        setEntityFieldEditorId(null);
        setExpandedLocationTypes(new Set());
        setOpenChoiceEditors(new Set());
        setLocationDraftParentId(null);
        setLocationDraft({ name: "", description: "" });
        setLocationFieldEditorId(null);
        setLocationRenameId(null);
        setLocationRenameDraft({ name: "", description: "" });
        setRelationshipDraftOpen(false);
        resetRelationshipDraft();
        setLocationParents(parentMap);
        setLocationOrder(locationSeed.map((type) => type.key));
        setRelationshipEditorKey(null);
        setStructureCreated(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load pack details.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedPackId, token, worldId]);

  const stepLabels = ["Pack", "Entity Types", "Location Types", "Relationships", "Review"];

  const recommendedPackIds = useMemo(
    () => new Set(packs.filter((pack) => pack.posture === "opinionated").slice(0, 2).map((pack) => pack.id)),
    [packs]
  );

  const availableEntityTypes = useMemo(
    () => entityTypes.filter((type) => type.enabled && type.status === "active"),
    [entityTypes]
  );

  const availableLocationTypes = useMemo(
    () => locationTypes.filter((type) => type.enabled && type.status === "active"),
    [locationTypes]
  );

  const visibleLocationTypes = useMemo(
    () => locationTypes.filter((type) => type.status === "active"),
    [locationTypes]
  );

  const locationTypeById = useMemo(
    () => new Map(locationTypes.map((type) => [type.key, type])),
    [locationTypes]
  );

  const openPackPreview = async (packId: string) => {
    setPackPreviewId(packId);
    if (packPreviews[packId] || !worldId) return;
    setPackPreviewLoading(true);
    try {
      const response = await fetch(`/api/world-builder/packs/${packId}?worldId=${worldId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Unable to load pack details.");
      const data = (await response.json()) as PackDetail;
      setPackPreviews((current) => ({ ...current, [packId]: data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pack details.");
    } finally {
      setPackPreviewLoading(false);
    }
  };

  const toggleExpandedLocation = (key: string) => {
    setExpandedLocationTypes((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleChoiceEditor = (key: string) => {
    setOpenChoiceEditors((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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
        status: "active",
        source: "custom",
        fields: []
      }
    ]);
    setCustomEntityDraft({ name: "", description: "" });
    setEntityFieldEditorId(key);
  };

  const insertLocationAfterParent = (
    order: string[],
    parentId: string | null,
    childId: string,
    parents: Record<string, string | null>
  ) => {
    if (!parentId) return [...order, childId];
    const index = order.indexOf(parentId);
    if (index === -1) return [...order, childId];
    const isDescendant = (candidate: string) => {
      let current = parents[candidate];
      while (current) {
        if (current === parentId) return true;
        current = parents[current] ?? null;
      }
      return false;
    };
    let insertIndex = index + 1;
    while (insertIndex < order.length && isDescendant(order[insertIndex])) {
      insertIndex += 1;
    }
    const next = [...order];
    next.splice(insertIndex, 0, childId);
    return next;
  };

  const addCustomLocationType = (
    parentId: string | null,
    name: string,
    description: string
  ) => {
    if (!name.trim()) return;
    const key = `location-custom-${createId()}`;
    const nextParent = parentId && locationParents[parentId] !== undefined ? parentId : null;
    setLocationTypes((current) => [
      ...current,
      {
        key,
        name: name.trim(),
        description: description.trim(),
        enabled: true,
        isCore: false,
        status: "active",
        source: "custom",
        fields: []
      }
    ]);
    setLocationParents((current) => ({
      ...current,
      [key]: nextParent
    }));
    setLocationOrder((current) =>
      insertLocationAfterParent(current, nextParent, key, {
        ...locationParents,
        [key]: nextParent
      })
    );
    setExpandedLocationTypes((current) => new Set([...current, key]));
  };

  const startLocationDraft = (parentId: string | null) => {
    setLocationDraftParentId(parentId ?? TOP_LEVEL_ID);
    setLocationDraft({ name: "", description: "" });
  };

  const cancelLocationDraft = () => {
    setLocationDraftParentId(null);
    setLocationDraft({ name: "", description: "" });
  };

  const saveLocationDraft = () => {
    if (!locationDraft.name.trim()) return;
    const parentId = locationDraftParentId === TOP_LEVEL_ID ? null : locationDraftParentId;
    addCustomLocationType(parentId, locationDraft.name, locationDraft.description);
    cancelLocationDraft();
  };

  const openLocationRename = (type: BuilderType) => {
    setLocationRenameId(type.key);
    setLocationRenameDraft({
      name: type.name,
      description: type.description ?? ""
    });
  };

  const saveLocationRename = () => {
    if (!locationRenameId || !locationRenameDraft.name.trim()) return;
    updateType(
      locationRenameId,
      (current) => ({
        ...current,
        name: locationRenameDraft.name.trim(),
        description: locationRenameDraft.description.trim()
      }),
      "location"
    );
    setLocationRenameId(null);
    setLocationRenameDraft({ name: "", description: "" });
  };

  const removeLocationType = (typeKey: string) => {
    setLocationTypes((current) => current.filter((entry) => entry.key !== typeKey));
    setLocationParents((current) => {
      const next = { ...current };
      delete next[typeKey];
      Object.keys(next).forEach((key) => {
        if (next[key] === typeKey) {
          next[key] = null;
        }
      });
      return next;
    });
    setLocationOrder((current) => current.filter((entry) => entry !== typeKey));
  };

  const updateType = (
    typeKey: string,
    updater: (type: BuilderType) => BuilderType,
    scope: "entity" | "location"
  ) => {
    const setter = scope === "entity" ? setEntityTypes : setLocationTypes;
    setter((current) => current.map((type) => (type.key === typeKey ? updater(type) : type)));
  };

  const updateField = (
    typeKey: string,
    fieldId: string,
    updater: (field: BuilderField) => BuilderField,
    scope: "entity" | "location"
  ) => {
    updateType(
      typeKey,
      (type) => ({
        ...type,
        fields: type.fields.map((field) => (field.id === fieldId ? updater(field) : field))
      }),
      scope
    );
  };

  const addCustomField = (typeKey: string, scope: "entity" | "location") => {
    updateType(
      typeKey,
      (type) => ({
        ...type,
        fields: [
          ...type.fields,
          {
            id: `custom-${createId()}`,
            fieldKey: "",
            fieldLabel: "",
            fieldType: "TEXT",
            required: false,
            enabled: true,
            choiceListKey: null,
            status: "active",
            source: "custom"
          }
        ]
      }),
      scope
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

  const derivedLocationRules = useMemo(() => {
    const validKeys = new Set(locationTypes.map((type) => type.key));
    return Object.entries(locationParents)
      .filter(
        ([childKey, parentKey]) =>
          parentKey && validKeys.has(childKey) && validKeys.has(parentKey)
      )
      .map(([childKey, parentKey]) => ({
        id: `location-rule-${parentKey}-${childKey}`,
        parentKey: parentKey as string,
        childKey,
        enabled: true
      }));
  }, [locationParents, locationTypes]);

  const isFieldUsed = (field: BuilderField) =>
    Boolean(field.fieldKey.trim() || field.fieldLabel.trim());

  const isTypeUsed = (typeKey: string, scope: "entity" | "location") => {
    if (scope === "entity") {
      return relationships.some((rel) =>
        rel.ruleMappings.some(
          (mapping) => mapping.fromTypeKey === typeKey || mapping.toTypeKey === typeKey
        )
      );
    }
    return derivedLocationRules.some(
      (rule) => rule.parentKey === typeKey || rule.childKey === typeKey
    );
  };

  const toggleRelationship = (relationshipKey: string, enabled: boolean) => {
    setRelationships((current) =>
      current.map((rel) => {
        if (rel.key !== relationshipKey) return rel;
        if (!enabled) {
          return { ...rel, enabled: false };
        }
        const defaults = getRelationshipDefaults(rel, entityTypes);
        return {
          ...rel,
          enabled: true,
          ruleMappings: defaults.length > 0 ? defaults : rel.ruleMappings,
          rulesSource: defaults.length > 0 ? "default" : rel.rulesSource
        };
      })
    );
  };

  const resetRelationshipDraft = () => {
    setRelationshipDraft({
      name: "",
      description: "",
      isPeerable: false,
      fromLabel: "",
      toLabel: "",
      fromTypeKey: "",
      toTypeKey: ""
    });
  };

  const saveRelationshipDraft = () => {
    if (!relationshipDraft.name.trim()) return;
    if (!relationshipDraft.fromLabel.trim() || !relationshipDraft.toLabel.trim()) return;
    const resolvedToTypeKey = relationshipDraft.isPeerable
      ? relationshipDraft.fromTypeKey
      : relationshipDraft.toTypeKey;
    if (!relationshipDraft.fromTypeKey || !resolvedToTypeKey) return;

    const role = {
      id: `role-${createId()}`,
      fromRole: toRoleKey(relationshipDraft.fromLabel, "from"),
      toRole: toRoleKey(relationshipDraft.toLabel, "to")
    };
    const newRelationship: BuilderRelationship = {
      key: `relationship-custom-${createId()}`,
      templateId: "",
      name: relationshipDraft.name.trim(),
      description: relationshipDraft.description.trim(),
      isPeerable: relationshipDraft.isPeerable,
      fromLabel: relationshipDraft.fromLabel.trim(),
      toLabel: relationshipDraft.toLabel.trim(),
      pastFromLabel: "",
      pastToLabel: "",
      enabled: true,
      rulesSource: "custom",
      roles: [role],
      ruleMappings: [
        {
          id: createId(),
          fromRole: role.fromRole,
          toRole: role.toRole,
          fromTypeKey: relationshipDraft.fromTypeKey,
          toTypeKey: resolvedToTypeKey
        }
      ]
    };
    setRelationships((current) => [...current, newRelationship]);
    setRelationshipDraftOpen(false);
    resetRelationshipDraft();
  };

  const relationshipIssues = useMemo(
    () =>
      relationships.filter(
        (rel) => rel.enabled && rel.ruleMappings.every((map) => !map.fromTypeKey || !map.toTypeKey)
      ),
    [relationships]
  );

  useEffect(() => {
    setRelationships((current) =>
      current.map((rel) => {
        if (!rel.enabled) return rel;
        if (rel.ruleMappings.some((mapping) => mapping.fromTypeKey && mapping.toTypeKey)) {
          return rel;
        }
        const defaults = getRelationshipDefaults(rel, entityTypes);
        return defaults.length > 0 ? { ...rel, ruleMappings: defaults, rulesSource: "default" } : rel;
      })
    );
  }, [entityTypes]);

  const handleHierarchyChange = (
    updatedNodes: Array<{ id: string; parentId: string | null }>
  ) => {
    const nextParents: Record<string, string | null> = { ...locationParents };
    updatedNodes.forEach((node) => {
      nextParents[node.id] = node.parentId ?? null;
    });
    setLocationParents(nextParents);
    setLocationOrder((current) => {
      const visibleIds = updatedNodes.map((node) => node.id);
      const remaining = current.filter((id) => !visibleIds.includes(id));
      return [...visibleIds, ...remaining];
    });
  };

  const issuesByStep = useMemo(() => {
    const entityIssues = entityTypes.filter(
      (type) =>
        type.enabled &&
        type.status === "active" &&
        type.fields.some(
          (field) =>
            field.enabled &&
            field.status === "active" &&
            (!field.fieldKey.trim() || !field.fieldLabel.trim())
        )
    ).length;
    const locationIssues = Object.entries(locationParents).filter(([childKey, parentKey]) => {
      if (!parentKey) return false;
      const parent = locationTypes.find((type) => type.key === parentKey);
      const child = locationTypes.find((type) => type.key === childKey);
      return !parent || !child;
    }).length;
    const relationshipIssuesCount = relationshipIssues.length;
    const choiceIssues = [...entityTypes, ...locationTypes].some((type) =>
      type.fields.some(
        (field) =>
          field.enabled &&
          field.status === "active" &&
          field.fieldType === "CHOICE" &&
          !field.choiceListKey
      )
    )
      ? 1
      : 0;
    return {
      entityIssues,
      locationIssues,
      relationshipIssues: relationshipIssuesCount,
      choiceIssues
    };
  }, [entityTypes, locationTypes, locationParents, relationshipIssues]);

  const summaryCounts = useMemo(() => {
    const activeLocationKeys = new Set(availableLocationTypes.map((type) => type.key));
    return {
      entityTypes: availableEntityTypes.length,
      locationTypes: availableLocationTypes.length,
      containmentRules: derivedLocationRules.filter(
        (rule) => activeLocationKeys.has(rule.parentKey) && activeLocationKeys.has(rule.childKey)
      ).length,
      relationshipTypes: relationships.filter((rel) => rel.enabled).length,
      issues:
        issuesByStep.entityIssues +
        issuesByStep.locationIssues +
        issuesByStep.relationshipIssues +
        issuesByStep.choiceIssues
    };
  }, [availableEntityTypes, availableLocationTypes, derivedLocationRules, relationships, issuesByStep]);

  const usedChoiceLists = useMemo(() => {
    const keys = new Set<string>();
    const scanFields = (types: BuilderType[]) => {
      types.forEach((type) => {
        if (!type.enabled || type.status !== "active") return;
        type.fields.forEach((field) => {
          if (
            field.enabled &&
            field.status === "active" &&
            field.fieldType === "CHOICE" &&
            field.choiceListKey
          ) {
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
      if (!type.enabled || type.status !== "active") return;
      type.fields.forEach((field) => {
        if (
          field.enabled &&
          field.status === "active" &&
          field.fieldType === "CHOICE" &&
          field.choiceListKey
        ) {
          usedChoiceListKeys.add(field.choiceListKey);
        }
      });
    });
    locationTypes.forEach((type) => {
      if (!type.enabled || type.status !== "active") return;
      type.fields.forEach((field) => {
        if (
          field.enabled &&
          field.status === "active" &&
          field.fieldType === "CHOICE" &&
          field.choiceListKey
        ) {
          usedChoiceListKeys.add(field.choiceListKey);
        }
      });
    });

    const activeTypeKeys = new Set(
      entityTypes.filter((type) => type.enabled && type.status === "active").map((type) => type.key)
    );
    const activeLocationKeys = new Set(
      locationTypes
        .filter((type) => type.enabled && type.status === "active")
        .map((type) => type.key)
    );

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
        .filter((type) => type.enabled && type.status === "active")
        .map((type) => ({
          key: type.key,
          name: type.name,
          description: type.description,
          fields: type.fields
            .filter((field) => field.enabled && field.status === "active")
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
        .filter((type) => type.enabled && type.status === "active")
        .map((type) => ({
          key: type.key,
          name: type.name,
          description: type.description,
          fields: type.fields
            .filter((field) => field.enabled && field.status === "active")
            .map((field) => ({
              fieldKey: field.fieldKey,
              fieldLabel: field.fieldLabel,
              fieldType: field.fieldType,
              required: field.required,
              enabled: field.enabled,
              choiceListKey: field.choiceListKey ?? null
            }))
        })),
      locationRules: derivedLocationRules
        .filter(
          (rule) =>
            activeLocationKeys.has(rule.parentKey) && activeLocationKeys.has(rule.childKey)
        )
        .map((rule) => ({
          parentKey: rule.parentKey,
          childKey: rule.childKey,
          allowed: true
        })),
      relationshipTypes: relationships
        .filter((rel) => rel.enabled)
        .map((rel) => ({
          key: rel.key,
          name: rel.name,
          description: rel.description,
          isPeerable: rel.isPeerable,
          fromLabel: rel.fromLabel,
          toLabel: rel.toLabel,
          pastFromLabel: rel.pastFromLabel,
          pastToLabel: rel.pastToLabel,
          enabled: rel.enabled,
          roleMappings: rel.ruleMappings
            .filter(
              (role) =>
                role.fromTypeKey &&
                role.toTypeKey &&
                activeTypeKeys.has(role.fromTypeKey) &&
                activeTypeKeys.has(role.toTypeKey)
            )
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
        setShowCommitConfirm(false);
        setStructureCreated(true);
        setStep(4);
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

  const packPreview = packPreviewId ? packPreviews[packPreviewId] : null;
  const packPreviewCounts = packPreview
    ? {
        entityTypes: packPreview.entityTypeTemplates.length,
        locationTypes: packPreview.locationTypeTemplates.length,
        relationshipTypes: packPreview.relationshipTypeTemplates.length,
        choiceLists: packPreview.choiceLists.length
      }
    : null;

  const renderLocationDraftForm = (depth: number) => (
    <div className="hierarchy-editor__child-form" style={{ marginLeft: `${depth * 28}px` }}>
      <input
        autoFocus
        value={locationDraft.name}
        placeholder="Location type name"
        onChange={(event) =>
          setLocationDraft((current) => ({ ...current, name: event.target.value }))
        }
      />
      <input
        value={locationDraft.description}
        placeholder="Description (optional)"
        onChange={(event) =>
          setLocationDraft((current) => ({ ...current, description: event.target.value }))
        }
      />
      <div className="hierarchy-editor__child-actions">
        <button
          type="button"
          className="primary-button"
          onClick={saveLocationDraft}
          disabled={!locationDraft.name.trim()}
        >
          Save
        </button>
        <button type="button" className="ghost-button" onClick={cancelLocationDraft}>
          Cancel
        </button>
      </div>
    </div>
  );

  const renderLocationAfterNode = (node: HierarchyNode, depth: number) => {
    const type = locationTypeById.get(node.id);
    if (!type) return null;
    const isExpanded = expandedLocationTypes.has(node.id);
    const isAddingChild = locationDraftParentId === node.id;
    if (!isExpanded && !isAddingChild) return null;
    const fieldCount = type.fields.filter(
      (field) => field.enabled && field.status === "active"
    ).length;
    const statusLabel =
      type.status === "retired" ? "Retired" : type.enabled ? "Enabled" : "Disabled";
    return (
      <div style={{ marginLeft: `${(depth + 1) * 28}px` }}>
        {isExpanded ? (
          <div className="hierarchy-editor__details">
            <div>{type.description?.trim() || "No description yet."}</div>
            <div>Status: {statusLabel}</div>
            <div>Fields: {fieldCount}</div>
          </div>
        ) : null}
        {isAddingChild ? renderLocationDraftForm(depth + 1) : null}
      </div>
    );
  };

  const renderLocationActions = (node: HierarchyNode) => {
    const type = locationTypeById.get(node.id);
    if (!type) return null;
    const menuKey = `location-menu-${type.key}`;
    const isRetired = type.status !== "active";
    const canEditStructure = type.enabled && !isRetired;
    const toggleLabel = type.enabled ? "Disable" : "Enable";
    const canToggleEnabled = !isRetired && !type.isCore;
    return (
      <>
        <button
          type="button"
          className="world-builder__icon-button"
          onClick={() => startLocationDraft(type.key)}
          disabled={!canEditStructure}
          aria-label="Add child"
        >
          +
        </button>
        <div className="world-builder__menu">
          <button
            type="button"
            className="world-builder__icon-button"
            onClick={() =>
              setActiveMenu((current) => (current === menuKey ? null : menuKey))
            }
            aria-label="More actions"
          >
            ...
          </button>
            {activeMenu === menuKey ? (
              <div className="world-builder__menu-list">
                <button
                  type="button"
                  onClick={() => {
                    setLocationFieldEditorId(type.key);
                    setActiveMenu(null);
                  }}
                  disabled={!canEditStructure}
                >
                  Manage fields
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canToggleEnabled) return;
                    updateType(
                      type.key,
                      (current) => ({ ...current, enabled: !current.enabled }),
                      "location"
                    );
                    setActiveMenu(null);
                  }}
                  disabled={!canToggleEnabled}
                >
                  {toggleLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openLocationRename(type);
                  setActiveMenu(null);
                }}
              >
                Rename
              </button>
              {type.source === "custom" ? (
                isTypeUsed(type.key, "location") ? (
                  <button
                    type="button"
                    onClick={() => {
                      updateType(
                        type.key,
                        (current) => ({ ...current, status: "retired", enabled: false }),
                        "location"
                      );
                      setActiveMenu(null);
                    }}
                  >
                    Retire
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      removeLocationType(type.key);
                      setActiveMenu(null);
                    }}
                  >
                    Delete
                  </button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </>
    );
  };

  const activeLocationType = locationFieldEditorId
    ? locationTypeById.get(locationFieldEditorId) ?? null
    : null;
  const activeEntityType = entityFieldEditorId
    ? entityTypes.find((type) => type.key === entityFieldEditorId) ?? null
    : null;

  const resolveRelationshipTypeName = (typeKey: string) =>
    entityTypes.find((type) => type.key === typeKey)?.name ?? typeKey;

  const getPostureLabel = (posture: Pack["posture"]) =>
    posture === "opinionated" ? "Pre-Defined" : "Minimal";

  const buildRelationshipPreview = (
    fromTypeKey: string,
    toTypeKey: string,
    fromLabel: string,
    toLabel: string
  ) => {
    if (!fromTypeKey || !toTypeKey) return "Select types to preview.";
    const fromTypeName = resolveRelationshipTypeName(fromTypeKey);
    const toTypeName = resolveRelationshipTypeName(toTypeKey);
    const forward = `${fromTypeName} ${fromLabel} ${toTypeName}`;
    const reverse = `${toTypeName} ${toLabel} ${fromTypeName}`;
    return `${forward} / ${reverse}`;
  };

  const startRelationshipEdit = (relationship: BuilderRelationship) => {
    setRelationshipEditKey(relationship.key);
    setRelationshipEditDraft({
      name: relationship.name,
      description: relationship.description ?? "",
      isPeerable: relationship.isPeerable,
      fromLabel: relationship.fromLabel,
      toLabel: relationship.toLabel,
      mappings: relationship.ruleMappings.map((mapping) => ({
        id: mapping.id,
        fromTypeKey: mapping.fromTypeKey ?? "",
        toTypeKey: mapping.toTypeKey ?? ""
      }))
    });
  };

  const updateRelationshipEditDraft = (
    updater: (current: NonNullable<typeof relationshipEditDraft>) => typeof relationshipEditDraft
  ) => {
    setRelationshipEditDraft((current) => (current ? updater(current) : current));
  };

  const addRelationshipMapping = () => {
    updateRelationshipEditDraft((current) => ({
      ...current,
      mappings: [
        ...current.mappings,
        { id: createId(), fromTypeKey: "", toTypeKey: "" }
      ]
    }));
  };

  const removeRelationshipMapping = (id: string) => {
    updateRelationshipEditDraft((current) => ({
      ...current,
      mappings: current.mappings.filter((mapping) => mapping.id !== id)
    }));
  };

  const saveRelationshipEdit = () => {
    if (!relationshipEditKey || !relationshipEditDraft) return;
    const fromLabel = relationshipEditDraft.fromLabel.trim();
    const toLabel = relationshipEditDraft.toLabel.trim();
    if (!relationshipEditDraft.name.trim() || !fromLabel || !toLabel) return;
    const fromRole = toRoleKey(fromLabel, "from");
    const toRole = toRoleKey(toLabel, "to");
    setRelationships((current) =>
      current.map((rel) => {
        if (rel.key !== relationshipEditKey) return rel;
        const isPeerable = relationshipEditDraft.isPeerable;
        const mappings = relationshipEditDraft.mappings.map((mapping) => ({
          id: mapping.id,
          fromRole,
          toRole,
          fromTypeKey: mapping.fromTypeKey,
          toTypeKey: isPeerable ? mapping.fromTypeKey : mapping.toTypeKey
        }));
        return {
          ...rel,
          name: relationshipEditDraft.name.trim(),
          description: relationshipEditDraft.description.trim(),
          isPeerable,
          fromLabel,
          toLabel,
          roles:
            rel.roles.length > 0
              ? rel.roles.map((role) => ({ ...role, fromRole, toRole }))
              : [
                  {
                    id: `role-${createId()}`,
                    fromRole,
                    toRole
                  }
                ],
          ruleMappings: mappings,
          rulesSource: "custom"
        };
      })
    );
    setRelationshipEditKey(null);
    setRelationshipEditDraft(null);
  };

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
          <h2>Pack selection</h2>
          <p className="world-builder__hint">
            Choose a starting architecture. This creates types and rules you can edit later.
          </p>
          <SelectableCardGrid
            items={packs.map((pack) => ({
              id: pack.id,
              title: pack.name,
              subtitle: getPostureLabel(pack.posture),
              description: pack.description ?? "",
              recommended: recommendedPackIds.has(pack.id)
            }))}
            selectionMode="single"
            selectedIds={selectedPackId ? [selectedPackId] : []}
            onSelect={(id) => setSelectedPackId(id)}
            secondaryActionLabel="View contents"
            onSecondaryAction={openPackPreview}
          />
          <div className="world-builder__actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => selectedPackId && setStep(1)}
              disabled={!selectedPackId}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {!loading && step === 1 && packDetail ? (
        <div className="world-builder__panel">
          <InlineSummaryBar
            counts={summaryCounts}
            issues={[
              {
                id: "entity-issues",
                label: "Entity issues",
                count: issuesByStep.entityIssues,
                onClick: () => setStep(1)
              },
              {
                id: "choice-issues",
                label: "Choice list issues",
                count: issuesByStep.choiceIssues,
                onClick: () => setStep(1)
              }
            ].filter((issue) => issue.count > 0)}
          />
          <h2>Entity Types</h2>
          <p className="world-builder__hint">
            Start with the core types. Expand a card only when you need to edit fields.
          </p>
          {entityTypes
            .filter((type) => type.status === "active")
            .map((type) => {
              const fieldCount = type.fields.filter(
                (field) => field.enabled && field.status === "active"
              ).length;
              const hasIssues = type.fields.some(
                (field) =>
                  field.enabled &&
                  field.status === "active" &&
                  (!field.fieldKey.trim() || !field.fieldLabel.trim())
              );
              const badge = type.isCore ? "CORE" : type.source === "custom" ? "CUSTOM" : "OPTIONAL";
              return (
                <ClickableTypeCard
                  key={type.key}
                  title={type.name}
                  description={type.description ?? ""}
                  badge={badge}
                  status={!type.enabled ? "DISABLED" : hasIssues ? "NEEDS_ATTENTION" : "READY"}
                  includeChecked={type.enabled}
                  fieldCount={fieldCount}
                  isExpanded={false}
                  onToggleInclude={() => {
                    if (type.isCore) return;
                    updateType(type.key, (current) => ({ ...current, enabled: !type.enabled }), "entity");
                  }}
                  includeDisabled={type.isCore}
                  onToggleExpanded={() => setEntityFieldEditorId(type.key)}
                  onOpenAdvanced={() => setEntityFieldEditorId(type.key)}
                  actions={
                    type.source === "custom" ? (
                      <div className="world-builder__menu">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveMenu((current) =>
                              current === type.key ? null : type.key
                            );
                          }}
                        >
                          ...
                        </button>
                        {activeMenu === type.key ? (
                          <div className="world-builder__menu-list">
                            {isTypeUsed(type.key, "entity") ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateType(
                                    type.key,
                                    (current) => ({ ...current, status: "retired", enabled: false }),
                                    "entity"
                                  )
                                }
                              >
                                Retire
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setEntityTypes((current) =>
                                    current.filter((entry) => entry.key !== type.key)
                                  )
                                }
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          <CustomTypeCreateCard
            title="Add custom entity type"
            name={customEntityDraft.name}
            description={customEntityDraft.description}
            onChangeName={(value) =>
              setCustomEntityDraft((current) => ({ ...current, name: value }))
            }
            onChangeDescription={(value) =>
              setCustomEntityDraft((current) => ({ ...current, description: value }))
            }
            onAdd={addCustomEntityType}
          />
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
          <InlineSummaryBar
            counts={summaryCounts}
            issues={[
              {
                id: "location-issues",
                label: "Hierarchy issues",
                count: issuesByStep.locationIssues,
                onClick: () => setStep(2)
              }
            ].filter((issue) => issue.count > 0)}
          />
          <h2>Location Types</h2>
          <p className="world-builder__hint">
            Child location types are automatically contained within their parent.
          </p>
          {locationDraftParentId === TOP_LEVEL_ID ? renderLocationDraftForm(0) : null}
          <HierarchyEditor
            header={
              <>
                <div className="hierarchy-editor__top-label">Top Level</div>
                <div className="hierarchy-editor__header-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => startLocationDraft(null)}
                  >
                    Add Location
                  </button>
                </div>
              </>
            }
            nodes={(() => {
              const byId = new Map(visibleLocationTypes.map((type) => [type.key, type]));
              const orderedIds = [
                ...locationOrder,
                ...visibleLocationTypes
                  .map((type) => type.key)
                  .filter((id) => !locationOrder.includes(id))
              ];
              return orderedIds
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((type) => ({
                  id: type.key,
                  label: type.name,
                  description: type.description ?? "",
                  parentId: locationParents[type.key] ?? null,
                  status: type.status,
                  disabled: !type.enabled,
                  badge: type.isCore ? "core" : type.source === "custom" ? "custom" : "optional"
                }));
            })()}
            canReparent={(_nodeId, newParentId) => {
              if (!newParentId) return true;
              const parent = locationTypeById.get(newParentId);
              return Boolean(parent && parent.status === "active" && parent.enabled);
            }}
            onChange={handleHierarchyChange}
            onSelectNode={(id) => toggleExpandedLocation(id)}
            renderNodeActions={renderLocationActions}
            renderAfterNode={renderLocationAfterNode}
          />
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
          <InlineSummaryBar
            counts={summaryCounts}
            issues={[
              {
                id: "relationship-issues",
                label: "Relationships need rules",
                count: issuesByStep.relationshipIssues,
                onClick: () => setStep(3)
              }
            ].filter((issue) => issue.count > 0)}
          />
          <h2>Relationships</h2>
          <p className="world-builder__hint">
            Choose the connections that matter. We will auto-generate working defaults.
          </p>
          {Object.entries(
            relationships.reduce<Record<string, BuilderRelationship[]>>((acc, rel) => {
              const category = getRelationshipCategory(rel.name);
              acc[category] = [...(acc[category] ?? []), rel];
              return acc;
            }, {})
          ).map(([category, rels]) => (
            <div key={category} className="world-builder__section">
              <h3>{category}</h3>
              <div className="world-builder__relationship-list">
                {rels.map((rel) => {
                  const mappingPairs = rel.ruleMappings
                    .filter((mapping) => mapping.fromTypeKey && mapping.toTypeKey)
                    .map((mapping) => {
                      const fromName =
                        entityTypes.find((type) => type.key === mapping.fromTypeKey)?.name ??
                        mapping.fromTypeKey;
                      const toName =
                        entityTypes.find((type) => type.key === mapping.toTypeKey)?.name ??
                        mapping.toTypeKey;
                      const forwardLabel = rel.fromLabel.trim() || "relates to";
                      const reverseLabel = rel.toLabel.trim() || "relates to";
                      return `${fromName} ${forwardLabel} ${toName} / ${toName} ${reverseLabel} ${fromName}`;
                    });
                  const hasValidMapping = mappingPairs.length > 0;
                  const isDisabled = availableEntityTypes.length === 0;
                  return (
                    <RelationshipSelectorCard
                      key={rel.key}
                      relationshipName={rel.name}
                      category={category}
                      description={rel.description ?? "Relationship"}
                      suggestedPairs={hasValidMapping ? mappingPairs.join(", ") : "No valid from/to pairs"}
                      includeChecked={rel.enabled}
                      disabled={isDisabled}
                      status={
                        isDisabled
                          ? "DISABLED"
                          : !rel.enabled
                          ? "NOT_INCLUDED"
                          : hasValidMapping
                          ? "READY"
                          : "NEEDS_RULES"
                      }
                      editRulesEnabled={rel.enabled}
                      onToggleInclude={(checked) => toggleRelationship(rel.key, checked)}
                      onEditRules={
                        rel.enabled ? () => startRelationshipEdit(rel) : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="world-builder__section">
            <h3>Add relationship type</h3>
            <p className="world-builder__hint">
              Create a custom relationship type based on the enabled entity types.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setRelationshipDraftOpen(true)}
              disabled={availableEntityTypes.length === 0}
            >
              Add relationship type
            </button>
          </div>
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
        structureCreated ? (
          <div className="world-builder__panel">
            <h2>Structure created</h2>
            <p className="world-builder__hint">
              Your structure is ready. Relationship rules are optional and can be defined next.
            </p>
            <div className="world-builder__summary">
              <div className="world-builder__summary-item">
                <strong>{summaryCounts.entityTypes}</strong> entity types created
              </div>
              <div className="world-builder__summary-item">
                <strong>{summaryCounts.locationTypes}</strong> location types created
              </div>
              <div className="world-builder__summary-item">
                <strong>{summaryCounts.containmentRules}</strong> derived containment rules created
              </div>
              <div className="world-builder__summary-item">
                <strong>{summaryCounts.relationshipTypes}</strong> relationship types created
              </div>
            </div>
            <div className="world-builder__actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setStep(3)}
              >
                Back to relationships
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => setRelationshipEditorKey("all")}
              >
                Define relationship rules
              </button>
            </div>
          </div>
        ) : (
        <div className="world-builder__panel">
          <h2>Review & Summary</h2>
          <p className="world-builder__hint">
            Everything below will be created as normal world-scoped types and can be edited or
            deleted later.
          </p>
          {(issuesByStep.entityIssues ||
            issuesByStep.locationIssues ||
            issuesByStep.relationshipIssues ||
            issuesByStep.choiceIssues) > 0 ? (
            <div className="world-builder__issues">
              <div className="world-builder__issues-header">Issues to resolve</div>
              {issuesByStep.relationshipIssues > 0 ? (
                <button
                  type="button"
                  className="world-builder__issue"
                  onClick={() => setStep(3)}
                >
                  Relationships: {issuesByStep.relationshipIssues} types need rules
                </button>
              ) : null}
              {issuesByStep.locationIssues > 0 ? (
                <button
                  type="button"
                  className="world-builder__issue"
                  onClick={() => setStep(2)}
                >
                  Locations: {issuesByStep.locationIssues} hierarchy conflicts
                </button>
              ) : null}
              {issuesByStep.entityIssues > 0 ? (
                <button
                  type="button"
                  className="world-builder__issue"
                  onClick={() => setStep(1)}
                >
                  Entities: {issuesByStep.entityIssues} types need field cleanup
                </button>
              ) : null}
              {issuesByStep.choiceIssues > 0 ? (
                <button
                  type="button"
                  className="world-builder__issue"
                  onClick={() => setStep(1)}
                >
                  Choice lists: missing assignments
                </button>
              ) : null}
            </div>
          ) : (
            <div className="world-builder__issues world-builder__issues--ready">
              Ready to create structure.
            </div>
          )}
          <div className="world-builder__summary">
            <div>
              <div className="world-builder__summary-header">
                <h3>Entity Types</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setStep(1)}
                >
                  Edit
                </button>
              </div>
              {entityTypes.filter((type) => type.enabled && type.status === "active").map((type) => (
                <div key={type.key} className="world-builder__summary-item">
                  <strong>{type.name}</strong>
                  <div>
                    Fields: {type.fields.filter((field) => field.enabled && field.status === "active").length}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="world-builder__summary-header">
                <h3>Location Types</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setStep(2)}
                >
                  Edit
                </button>
              </div>
              {locationTypes
                .filter((type) => type.enabled && type.status === "active")
                .map((type) => (
                  <div key={type.key} className="world-builder__summary-item">
                    <strong>{type.name}</strong>
                    <div>
                      Fields: {type.fields.filter((field) => field.enabled && field.status === "active").length}
                    </div>
                  </div>
                ))}
              <div className="world-builder__summary-item">
                Derived containment: {summaryCounts.containmentRules}
              </div>
            </div>
            <div>
              <div className="world-builder__summary-header">
                <h3>Relationship Types</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setStep(3)}
                >
                  Edit
                </button>
              </div>
              {relationships.filter((rel) => rel.enabled).map((rel) => (
                <div key={rel.key} className="world-builder__summary-item">
                  <strong>{rel.name}</strong>
                  <div>{rel.isPeerable ? "Peerable" : "Directional"}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="world-builder__summary-header">
                <h3>Choice Lists</h3>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setStep(1)}
                >
                  Edit
                </button>
              </div>
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
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowCommitConfirm(true)}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create structure"}
            </button>
          </div>
        </div>
        )
      ) : null}

      {packPreviewId ? (
        <div className="world-builder__modal-overlay">
          <div className="world-builder__modal">
            <h3>Pack contents</h3>
            {packPreviewLoading ? (
              <p>Loading...</p>
            ) : packPreviewCounts ? (
              <div className="world-builder__modal-grid">
                <div>
                  <strong>{packPreviewCounts.entityTypes}</strong>
                  <span>Entity types</span>
                </div>
                <div>
                  <strong>{packPreviewCounts.locationTypes}</strong>
                  <span>Location types</span>
                </div>
                <div>
                  <strong>{packPreviewCounts.relationshipTypes}</strong>
                  <span>Relationship types</span>
                </div>
                <div>
                  <strong>{packPreviewCounts.choiceLists}</strong>
                  <span>Choice lists</span>
                </div>
              </div>
            ) : (
              <p>No preview available.</p>
            )}
            <div className="world-builder__actions">
              <button type="button" className="ghost-button" onClick={() => setPackPreviewId(null)}>
                Close
              </button>
              {packPreviewId ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSelectedPackId(packPreviewId);
                    setPackPreviewId(null);
                  }}
                >
                  Select pack
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showCommitConfirm ? (
        <div className="world-builder__modal-overlay">
          <div className="world-builder__modal">
            <h3>Confirm structure creation</h3>
            <p>This will create the selected types and rules in {worldLabel ?? worldId}.</p>
            <div className="world-builder__modal-grid">
              <div>
                <strong>{summaryCounts.entityTypes}</strong>
                <span>Entity types</span>
              </div>
              <div>
                <strong>{summaryCounts.locationTypes}</strong>
                <span>Location types</span>
              </div>
              <div>
                <strong>{summaryCounts.containmentRules}</strong>
                <span>Derived containment rules</span>
              </div>
              <div>
                <strong>{summaryCounts.relationshipTypes}</strong>
                <span>Relationship types</span>
              </div>
              <div>
                <strong>{usedChoiceLists.length}</strong>
                <span>Choice lists</span>
              </div>
            </div>
            <div className="world-builder__actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowCommitConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleApply}>
                Create structure
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <InlineAdvancedEditorFrame
        title={
          activeEntityType
            ? `Fields for ${activeEntityType.name}`
            : "Entity type fields"
        }
        isOpen={Boolean(entityFieldEditorId)}
        onClose={() => setEntityFieldEditorId(null)}
      >
        {activeEntityType ? (
          <>
            <label className="world-builder__field">
              <span>Name</span>
              <input
                value={activeEntityType.name}
                onChange={(event) =>
                  updateType(
                    activeEntityType.key,
                    (current) => ({ ...current, name: event.target.value }),
                    "entity"
                  )
                }
              />
            </label>
            <label className="world-builder__field">
              <span>Description</span>
              <textarea
                rows={3}
                value={activeEntityType.description ?? ""}
                placeholder="Description"
                onChange={(event) =>
                  updateType(
                    activeEntityType.key,
                    (current) => ({ ...current, description: event.target.value }),
                    "entity"
                  )
                }
              />
            </label>
            <div className="world-builder__fields">
              {activeEntityType.fields
                .filter((field) => field.status === "active")
                .map((field) => (
                  <div key={field.id} className="world-builder__field world-builder__field--stacked">
                    <label>
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        onChange={(event) =>
                          updateField(
                            activeEntityType.key,
                            field.id,
                            (current) => ({ ...current, enabled: event.target.checked }),
                            "entity"
                          )
                        }
                      />
                      <span>Include</span>
                    </label>
                    <input
                      placeholder="Label"
                      value={field.fieldLabel}
                      onChange={(event) => {
                        const nextLabel = event.target.value;
                        updateField(
                          activeEntityType.key,
                          field.id,
                          (current) => ({
                            ...current,
                            fieldLabel: nextLabel,
                            fieldKey: toFieldKey(nextLabel)
                          }),
                          "entity"
                        );
                      }}
                    />
                    <select
                      value={field.fieldType}
                      onChange={(event) =>
                        updateField(
                          activeEntityType.key,
                          field.id,
                          (current) => {
                            const nextType = event.target.value;
                            let nextChoiceListKey = current.choiceListKey ?? null;
                            if (nextType === "CHOICE") {
                              if (!nextChoiceListKey) {
                                nextChoiceListKey = choiceLists[0]?.id ?? createChoiceList();
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
                            activeEntityType.key,
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
                        <div className="world-builder__choice-header">
                          <span>Choices</span>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              toggleChoiceEditor(`entity:${field.id}`)
                            }
                          >
                            {openChoiceEditors.has(`entity:${field.id}`) ? "Hide" : "Show"}
                          </button>
                        </div>
                        {openChoiceEditors.has(`entity:${field.id}`) ? (
                          <>
                            <label>
                              Choice List
                              <select
                                value={field.choiceListKey ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === "__new") {
                                    const created = createChoiceList();
                                    updateField(
                                      activeEntityType.key,
                                      field.id,
                                      (current) => ({ ...current, choiceListKey: created }),
                                      "entity"
                                    );
                                    return;
                                  }
                                  updateField(
                                    activeEntityType.key,
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
                                {(
                                  choiceLists.find((list) => list.id === field.choiceListKey)
                                    ?.options ?? []
                                ).map((option) => (
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
                                        removeChoiceOption(
                                          field.choiceListKey as string,
                                          option.id
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => addChoiceOption(field.choiceListKey as string)}
                                >
                                  Add option
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {field.source === "custom" ? (
                      <button
                        type="button"
                        className="world-builder__field-delete"
                        aria-label="Delete field"
                        onClick={() => {
                          const message = isFieldUsed(field)
                            ? "This field is in use. Retire it?"
                            : "Delete this field?";
                          if (!window.confirm(message)) return;
                          if (isFieldUsed(field)) {
                            updateField(
                              activeEntityType.key,
                              field.id,
                              (current) => ({
                                ...current,
                                status: "retired",
                                enabled: false
                              }),
                              "entity"
                            );
                          } else {
                            updateType(
                              activeEntityType.key,
                              (current) => ({
                                ...current,
                                fields: current.fields.filter((item) => item.id !== field.id)
                              }),
                              "entity"
                            );
                          }
                        }}
                      >
                        X
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => addCustomField(activeEntityType.key, "entity")}
            >
              Add custom field
            </button>
          </>
        ) : (
          <div className="world-builder__hint">Entity type unavailable.</div>
        )}
      </InlineAdvancedEditorFrame>

      <InlineAdvancedEditorFrame
        title={
          activeLocationType
            ? `Fields for ${activeLocationType.name}`
            : "Location type fields"
        }
        isOpen={Boolean(locationFieldEditorId)}
        onClose={() => setLocationFieldEditorId(null)}
      >
        {activeLocationType ? (
          <>
            <div className="world-builder__fields">
              {activeLocationType.fields
                .filter((field) => field.status === "active")
                .map((field) => (
                  <div key={field.id} className="world-builder__field world-builder__field--stacked">
                    <label>
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        onChange={(event) =>
                          updateField(
                            activeLocationType.key,
                            field.id,
                            (current) => ({ ...current, enabled: event.target.checked }),
                            "location"
                          )
                        }
                      />
                      <span>Include</span>
                    </label>
                    <input
                      placeholder="Label"
                      value={field.fieldLabel}
                      onChange={(event) =>
                        updateField(
                          activeLocationType.key,
                          field.id,
                          (current) => ({ ...current, fieldLabel: event.target.value }),
                          "location"
                        )
                      }
                    />
                    <input
                      placeholder="Field key"
                      value={field.fieldKey}
                      onChange={(event) =>
                        updateField(
                          activeLocationType.key,
                          field.id,
                          (current) => ({ ...current, fieldKey: event.target.value }),
                          "location"
                        )
                      }
                    />
                    <select
                      value={field.fieldType}
                      onChange={(event) =>
                        updateField(
                          activeLocationType.key,
                          field.id,
                          (current) => {
                            const nextType = event.target.value;
                            let nextChoiceListKey = current.choiceListKey ?? null;
                            if (nextType === "CHOICE") {
                              if (!nextChoiceListKey) {
                                nextChoiceListKey = choiceLists[0]?.id ?? createChoiceList();
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
                            activeLocationType.key,
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
                        <div className="world-builder__choice-header">
                          <span>Choices</span>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              toggleChoiceEditor(`location:${field.id}`)
                            }
                          >
                            {openChoiceEditors.has(`location:${field.id}`) ? "Hide" : "Show"}
                          </button>
                        </div>
                        {openChoiceEditors.has(`location:${field.id}`) ? (
                          <>
                            <label>
                              Choice List
                              <select
                                value={field.choiceListKey ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === "__new") {
                                    const created = createChoiceList();
                                    updateField(
                                      activeLocationType.key,
                                      field.id,
                                      (current) => ({ ...current, choiceListKey: created }),
                                      "location"
                                    );
                                    return;
                                  }
                                  updateField(
                                    activeLocationType.key,
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
                                {(
                                  choiceLists.find((list) => list.id === field.choiceListKey)
                                    ?.options ?? []
                                ).map((option) => (
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
                                        removeChoiceOption(
                                          field.choiceListKey as string,
                                          option.id
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => addChoiceOption(field.choiceListKey as string)}
                                >
                                  Add option
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {field.source === "custom" ? (
                      <button
                        type="button"
                        className="world-builder__field-delete"
                        aria-label="Delete field"
                        onClick={() => {
                          const message = isFieldUsed(field)
                            ? "This field is in use. Retire it?"
                            : "Delete this field?";
                          if (!window.confirm(message)) return;
                          if (isFieldUsed(field)) {
                            updateField(
                              activeLocationType.key,
                              field.id,
                              (current) => ({
                                ...current,
                                status: "retired",
                                enabled: false
                              }),
                              "location"
                            );
                          } else {
                            updateType(
                              activeLocationType.key,
                              (current) => ({
                                ...current,
                                fields: current.fields.filter((item) => item.id !== field.id)
                              }),
                              "location"
                            );
                          }
                        }}
                      >
                        X
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => addCustomField(activeLocationType.key, "location")}
            >
              Add custom field
            </button>
          </>
        ) : (
          <div className="world-builder__hint">Location type unavailable.</div>
        )}
      </InlineAdvancedEditorFrame>

      <InlineAdvancedEditorFrame
        title="Rename location type"
        isOpen={Boolean(locationRenameId)}
        onClose={() => {
          setLocationRenameId(null);
          setLocationRenameDraft({ name: "", description: "" });
        }}
      >
        {locationRenameId ? (
          <div className="world-builder__field world-builder__field--stacked">
            <label>
              <span>Name</span>
              <input
                value={locationRenameDraft.name}
                onChange={(event) =>
                  setLocationRenameDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Description</span>
              <input
                value={locationRenameDraft.description}
                placeholder="Description"
                onChange={(event) =>
                  setLocationRenameDraft((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
            <div className="world-builder__actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setLocationRenameId(null);
                  setLocationRenameDraft({ name: "", description: "" });
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveLocationRename}
                disabled={!locationRenameDraft.name.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </InlineAdvancedEditorFrame>

      <InlineAdvancedEditorFrame
        title="New relationship type"
        isOpen={relationshipDraftOpen}
        onClose={() => {
          setRelationshipDraftOpen(false);
          resetRelationshipDraft();
        }}
      >
        <div className="world-builder__field world-builder__field--stacked">
          <label>
            <span>Name</span>
            <input
              value={relationshipDraft.name}
              placeholder="Relationship name"
              onChange={(event) =>
                setRelationshipDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Description</span>
            <input
              value={relationshipDraft.description}
              placeholder="Description (optional)"
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
            />
          </label>
          <label>
            <span>From label</span>
            <input
              value={relationshipDraft.fromLabel}
              placeholder={
                relationshipDraft.isPeerable
                  ? "Sibling of / Colleague of / Ally of / Peer of / Enemy of"
                  : "Parent of / Employs / Has member / Leads / Oversees"
              }
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  fromLabel: event.target.value
                }))
              }
            />
          </label>
          <label>
            <span>To label</span>
            <input
              value={relationshipDraft.toLabel}
              placeholder={
                relationshipDraft.isPeerable
                  ? "Sibling of / Colleague of / Ally of / Peer of / Enemy of"
                  : "Child of / Employed by / Member of / Reports to / Overseen by"
              }
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  toLabel: event.target.value
                }))
              }
            />
          </label>
          <div className="world-builder__toggle">
            <input
              type="checkbox"
              checked={relationshipDraft.isPeerable}
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  isPeerable: event.target.checked,
                  toTypeKey: event.target.checked ? current.fromTypeKey : current.toTypeKey
                }))
              }
            />
            <span>Peerable (same type on both sides)</span>
          </div>
          <label>
            <span>From type</span>
            <select
              value={relationshipDraft.fromTypeKey}
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  fromTypeKey: event.target.value,
                  toTypeKey: current.isPeerable ? event.target.value : current.toTypeKey
                }))
              }
            >
              <option value="">Select type...</option>
              {availableEntityTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To type</span>
            <select
              value={
                relationshipDraft.isPeerable
                  ? relationshipDraft.fromTypeKey
                  : relationshipDraft.toTypeKey
              }
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  toTypeKey: event.target.value
                }))
              }
              disabled={relationshipDraft.isPeerable}
            >
              <option value="">Select type...</option>
              {availableEntityTypes.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <div className="world-builder__actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setRelationshipDraftOpen(false);
                resetRelationshipDraft();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={saveRelationshipDraft}
              disabled={
                !relationshipDraft.name.trim() ||
                !relationshipDraft.fromLabel.trim() ||
                !relationshipDraft.toLabel.trim() ||
                !relationshipDraft.fromTypeKey ||
                !relationshipDraft.toTypeKey
              }
            >
              Add relationship
            </button>
          </div>
        </div>
      </InlineAdvancedEditorFrame>

      <InlineAdvancedEditorFrame
        title="Relationship rule builder"
        isOpen={structureCreated && Boolean(relationshipEditorKey)}
        onClose={() => setRelationshipEditorKey(null)}
      >
        {structureCreated && relationshipEditorKey ? (
          <RuleBuilder
            token={token}
            contextWorldId={worldId}
            lockedRelationshipTypeId={
              relationships.find((rel) => rel.key === relationshipEditorKey)?.templateId
            }
          />
        ) : null}
      </InlineAdvancedEditorFrame>

      <InlineAdvancedEditorFrame
        title="Manage relationship"
        isOpen={Boolean(relationshipEditKey)}
        onClose={() => {
          setRelationshipEditKey(null);
          setRelationshipEditDraft(null);
        }}
      >
        {relationshipEditDraft ? (
          <div className="world-builder__relationship-editor">
            <label className="world-builder__field">
              <span>Name</span>
              <input
                value={relationshipEditDraft.name}
                onChange={(event) =>
                  updateRelationshipEditDraft((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
            </label>
            <label className="world-builder__field">
              <span>Description</span>
              <input
                value={relationshipEditDraft.description}
                placeholder="Description (optional)"
                onChange={(event) =>
                  updateRelationshipEditDraft((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
            <label className="world-builder__field">
              <span>From label</span>
              <input
                value={relationshipEditDraft.fromLabel}
                placeholder={
                  relationshipEditDraft.isPeerable
                    ? "Sibling of / Colleague of / Ally of / Peer of / Enemy of"
                    : "Parent of / Employs / Has member / Leads / Oversees"
                }
                onChange={(event) =>
                  updateRelationshipEditDraft((current) => ({
                    ...current,
                    fromLabel: event.target.value
                  }))
                }
              />
            </label>
            <label className="world-builder__field">
              <span>To label</span>
              <input
                value={relationshipEditDraft.toLabel}
                placeholder={
                  relationshipEditDraft.isPeerable
                    ? "Sibling of / Colleague of / Ally of / Peer of / Enemy of"
                    : "Child of / Employed by / Member of / Reports to / Overseen by"
                }
                onChange={(event) =>
                  updateRelationshipEditDraft((current) => ({
                    ...current,
                    toLabel: event.target.value
                  }))
                }
              />
            </label>
            <div className="world-builder__toggle">
              <input
                type="checkbox"
                checked={relationshipEditDraft.isPeerable}
                onChange={(event) =>
                  updateRelationshipEditDraft((current) => ({
                    ...current,
                    isPeerable: event.target.checked,
                    mappings: current.mappings.map((mapping) => ({
                      ...mapping,
                      toTypeKey: event.target.checked ? mapping.fromTypeKey : mapping.toTypeKey
                    }))
                    }))
                }
              />
              <span>Peerable (same type on both sides)</span>
            </div>
            <div className="world-builder__rules">
              {relationshipEditDraft.mappings.map((mapping) => (
                <div key={mapping.id} className="world-builder__rule">
                  <span>Types</span>
                  <select
                    value={mapping.fromTypeKey}
                    onChange={(event) =>
                      updateRelationshipEditDraft((current) => ({
                        ...current,
                        mappings: current.mappings.map((entry) =>
                          entry.id === mapping.id
                            ? {
                                ...entry,
                                fromTypeKey: event.target.value,
                                toTypeKey: current.isPeerable
                                  ? event.target.value
                                  : entry.toTypeKey
                              }
                            : entry
                        )
                      }))
                    }
                  >
                    <option value="">Select type...</option>
                    {entityTypes
                      .filter((type) => type.status === "active")
                      .map((type) => (
                        <option key={type.key} value={type.key}>
                          {type.name}
                        </option>
                      ))}
                  </select>
                  <select
                    value={
                      relationshipEditDraft.isPeerable
                        ? mapping.fromTypeKey
                        : mapping.toTypeKey
                    }
                    onChange={(event) =>
                      updateRelationshipEditDraft((current) => ({
                        ...current,
                        mappings: current.mappings.map((entry) =>
                          entry.id === mapping.id
                            ? { ...entry, toTypeKey: event.target.value }
                            : entry
                        )
                      }))
                    }
                    disabled={relationshipEditDraft.isPeerable}
                  >
                    <option value="">Select type...</option>
                    {entityTypes
                      .filter((type) => type.status === "active")
                      .map((type) => (
                        <option key={type.key} value={type.key}>
                          {type.name}
                        </option>
                      ))}
                  </select>
                  <span
                    className="world-builder__info"
                    title={buildRelationshipPreview(
                      mapping.fromTypeKey,
                      relationshipEditDraft.isPeerable
                        ? mapping.fromTypeKey
                        : mapping.toTypeKey,
                      relationshipEditDraft.fromLabel.trim() || "relates to",
                      relationshipEditDraft.toLabel.trim() || "relates to"
                    )}
                    aria-label="Relationship preview"
                  >
                    i
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => removeRelationshipMapping(mapping.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost-button"
                onClick={addRelationshipMapping}
              >
                Add relationship mapping
              </button>
            </div>
            <div className="world-builder__actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setRelationshipEditKey(null);
                  setRelationshipEditDraft(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveRelationshipEdit}
                disabled={
                  !relationshipEditDraft.name.trim() ||
                  !relationshipEditDraft.fromLabel.trim() ||
                  !relationshipEditDraft.toLabel.trim()
                }
              >
                Save
              </button>
            </div>
          </div>
        ) : null}
      </InlineAdvancedEditorFrame>
    </div>
  );
}
