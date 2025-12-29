
import {
  EntityFieldType,
  LocationFieldType,
  PackPosture,
  PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();

type FieldSeed = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: EntityFieldType | LocationFieldType;
  required?: boolean;
  defaultEnabled?: boolean;
  choices?: unknown;
  validationRules?: unknown;
};

type EntityTemplateSeed = {
  name: string;
  description?: string;
  category?: string;
  isCore?: boolean;
  fields: FieldSeed[];
};

type LocationTemplateSeed = {
  name: string;
  description?: string;
  isCore?: boolean;
  fields: FieldSeed[];
};

type RelationshipRoleSeed = {
  fromRole: string;
  toRole: string;
};

type RelationshipTemplateSeed = {
  name: string;
  description?: string;
  isPeerable?: boolean;
  fromLabel: string;
  toLabel: string;
  pastFromLabel?: string;
  pastToLabel?: string;
  roles: RelationshipRoleSeed[];
};

type LocationRuleSeed = {
  parent: string;
  child: string;
};

type PackSeed = {
  name: string;
  description: string;
  posture: PackPosture;
  entityTemplates: EntityTemplateSeed[];
  locationTemplates: LocationTemplateSeed[];
  locationRules: LocationRuleSeed[];
  relationshipTemplates: RelationshipTemplateSeed[];
};

const baseEntityTemplates: EntityTemplateSeed[] = [
  {
    name: "Character",
    description: "People and protagonists in the world.",
    category: "people",
    fields: [
      { fieldKey: "concept", fieldLabel: "Concept", fieldType: EntityFieldType.TEXT },
      { fieldKey: "role", fieldLabel: "Role", fieldType: EntityFieldType.TEXT },
      { fieldKey: "background", fieldLabel: "Background", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "traits", fieldLabel: "Traits", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "flaws", fieldLabel: "Flaws", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "affiliations", fieldLabel: "Affiliations", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Organization",
    description: "Groups, institutions, and factions of power.",
    category: "society",
    fields: [
      { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "leadership", fieldLabel: "Leadership", fieldType: EntityFieldType.TEXT },
      { fieldKey: "structure", fieldLabel: "Structure", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "assets", fieldLabel: "Assets", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "allies", fieldLabel: "Allies", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "enemies", fieldLabel: "Enemies", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Faction",
    description: "Ideological or political groups.",
    category: "society",
    fields: [
      { fieldKey: "ideology", fieldLabel: "Ideology", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "resources", fieldLabel: "Resources", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "methods", fieldLabel: "Methods", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "rivals", fieldLabel: "Rivals", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Item",
    description: "Artifacts, equipment, and notable objects.",
    category: "items",
    fields: [
      { fieldKey: "origin", fieldLabel: "Origin", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "effect", fieldLabel: "Effect", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "limitations", fieldLabel: "Limitations", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "owner", fieldLabel: "Current Owner", fieldType: EntityFieldType.TEXT, defaultEnabled: false },
      { fieldKey: "hooks", fieldLabel: "Hooks", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Event",
    description: "Historical or recent events that shape the world.",
    category: "events",
    fields: [
      { fieldKey: "era", fieldLabel: "Era or Date", fieldType: EntityFieldType.TEXT },
      { fieldKey: "description", fieldLabel: "Description", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "participants", fieldLabel: "Participants", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "impact", fieldLabel: "Impact", fieldType: EntityFieldType.TEXTAREA },
      { fieldKey: "unresolvedThreads", fieldLabel: "Unresolved Threads", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
    ]
  }
];
const baseLocationTemplates: LocationTemplateSeed[] = [
  {
    name: "Settlement",
    description: "Cities, towns, villages, and communities.",
    fields: [
      { fieldKey: "size", fieldLabel: "Size", fieldType: LocationFieldType.TEXT },
      { fieldKey: "government", fieldLabel: "Government", fieldType: LocationFieldType.TEXT },
      { fieldKey: "economy", fieldLabel: "Economy", fieldType: LocationFieldType.TEXT },
      { fieldKey: "mood", fieldLabel: "Mood", fieldType: LocationFieldType.TEXT },
      { fieldKey: "notableResidents", fieldLabel: "Notable Residents", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "dangers", fieldLabel: "Dangers", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Region",
    description: "Wilderness, provinces, sectors, and large areas.",
    fields: [
      { fieldKey: "biome", fieldLabel: "Biome", fieldType: LocationFieldType.TEXT },
      { fieldKey: "terrain", fieldLabel: "Terrain", fieldType: LocationFieldType.TEXT },
      { fieldKey: "control", fieldLabel: "Control", fieldType: LocationFieldType.TEXT },
      { fieldKey: "travelDifficulty", fieldLabel: "Travel Difficulty", fieldType: LocationFieldType.TEXT },
      { fieldKey: "resources", fieldLabel: "Resources", fieldType: LocationFieldType.TEXTAREA },
      { fieldKey: "conflicts", fieldLabel: "Conflicts", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
    ]
  },
  {
    name: "Site",
    description: "Points of interest such as ruins, stations, or landmarks.",
    fields: [
      { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXT },
      { fieldKey: "status", fieldLabel: "Status", fieldType: LocationFieldType.TEXT },
      { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "hazards", fieldLabel: "Hazards", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
      { fieldKey: "access", fieldLabel: "Access", fieldType: LocationFieldType.TEXT }
    ]
  }
];

const baseRelationshipTemplates: RelationshipTemplateSeed[] = [
  {
    name: "Allied With",
    description: "Two parties collaborate or support each other.",
    isPeerable: true,
    fromLabel: "Ally",
    toLabel: "Ally",
    roles: [
      { fromRole: "Character", toRole: "Character" },
      { fromRole: "Organization", toRole: "Organization" },
      { fromRole: "Faction", toRole: "Faction" }
    ]
  },
  {
    name: "Rival Of",
    description: "Two parties are in conflict or competition.",
    isPeerable: true,
    fromLabel: "Rival",
    toLabel: "Rival",
    roles: [
      { fromRole: "Character", toRole: "Character" },
      { fromRole: "Organization", toRole: "Organization" },
      { fromRole: "Faction", toRole: "Faction" }
    ]
  },
  {
    name: "Member Of",
    description: "A person or group belongs to a larger group.",
    isPeerable: false,
    fromLabel: "Member",
    toLabel: "Organization",
    pastFromLabel: "Former Member",
    pastToLabel: "Former Organization",
    roles: [
      { fromRole: "Character", toRole: "Organization" },
      { fromRole: "Character", toRole: "Faction" }
    ]
  },
  {
    name: "Leads",
    description: "A leader directs a group or organization.",
    isPeerable: false,
    fromLabel: "Leader",
    toLabel: "Organization",
    pastFromLabel: "Former Leader",
    pastToLabel: "Former Organization",
    roles: [
      { fromRole: "Character", toRole: "Organization" },
      { fromRole: "Character", toRole: "Faction" }
    ]
  },
  {
    name: "Owns",
    description: "An entity owns or controls an asset.",
    isPeerable: false,
    fromLabel: "Owner",
    toLabel: "Asset",
    pastFromLabel: "Former Owner",
    pastToLabel: "Former Asset",
    roles: [
      { fromRole: "Character", toRole: "Item" },
      { fromRole: "Organization", toRole: "Item" }
    ]
  }
];

function applyCoreTemplates<T extends { name: string; isCore?: boolean }>(
  seeds: T[],
  coreNames: string[]
): T[] {
  return seeds.map((seed) => ({
    ...seed,
    isCore: coreNames.includes(seed.name)
  }));
}

async function getAdminUserId(): Promise<string> {
  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  });

  if (!adminUser) {
    throw new Error("Admin user not found. Run the main seed first.");
  }

  return adminUser.id;
}

async function upsertPack(createdById: string, seed: PackSeed) {
  const existing = await prisma.pack.findFirst({
    where: { name: seed.name, createdById }
  });

  if (existing) {
    return prisma.pack.update({
      where: { id: existing.id },
      data: {
        description: seed.description,
        posture: seed.posture,
        isActive: true
      }
    });
  }

  return prisma.pack.create({
    data: {
      name: seed.name,
      description: seed.description,
      posture: seed.posture,
      isActive: true,
      createdById
    }
  });
}

async function upsertEntityTemplate(packId: string, seed: EntityTemplateSeed) {
  const existing = await prisma.entityTypeTemplate.findFirst({
    where: { packId, name: seed.name }
  });

  const template = existing
    ? await prisma.entityTypeTemplate.update({
        where: { id: existing.id },
        data: {
          description: seed.description,
          category: seed.category,
          isCore: seed.isCore ?? false
        }
      })
    : await prisma.entityTypeTemplate.create({
        data: {
          packId,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          isCore: seed.isCore ?? false
        }
      });

  for (const field of seed.fields) {
    await prisma.entityTypeTemplateField.upsert({
      where: {
        templateId_fieldKey: {
          templateId: template.id,
          fieldKey: field.fieldKey
        }
      },
      update: {
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType as EntityFieldType,
        required: field.required ?? false,
        defaultEnabled: field.defaultEnabled ?? true,
        choices: field.choices ?? undefined,
        validationRules: field.validationRules ?? undefined
      },
      create: {
        templateId: template.id,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType as EntityFieldType,
        required: field.required ?? false,
        defaultEnabled: field.defaultEnabled ?? true,
        choices: field.choices ?? undefined,
        validationRules: field.validationRules ?? undefined
      }
    });
  }

  return template;
}

async function upsertLocationTemplate(packId: string, seed: LocationTemplateSeed) {
  const existing = await prisma.locationTypeTemplate.findFirst({
    where: { packId, name: seed.name }
  });

  const template = existing
    ? await prisma.locationTypeTemplate.update({
        where: { id: existing.id },
        data: {
          description: seed.description,
          isCore: seed.isCore ?? false
        }
      })
    : await prisma.locationTypeTemplate.create({
        data: {
          packId,
          name: seed.name,
          description: seed.description,
          isCore: seed.isCore ?? false
        }
      });

  for (const field of seed.fields) {
    await prisma.locationTypeTemplateField.upsert({
      where: {
        templateId_fieldKey: {
          templateId: template.id,
          fieldKey: field.fieldKey
        }
      },
      update: {
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType as LocationFieldType,
        required: field.required ?? false,
        defaultEnabled: field.defaultEnabled ?? true,
        choices: field.choices ?? undefined,
        validationRules: field.validationRules ?? undefined
      },
      create: {
        templateId: template.id,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType as LocationFieldType,
        required: field.required ?? false,
        defaultEnabled: field.defaultEnabled ?? true,
        choices: field.choices ?? undefined,
        validationRules: field.validationRules ?? undefined
      }
    });
  }

  return template;
}

async function upsertRelationshipTemplate(packId: string, seed: RelationshipTemplateSeed) {
  const existing = await prisma.relationshipTypeTemplate.findFirst({
    where: { packId, name: seed.name }
  });

  const template = existing
    ? await prisma.relationshipTypeTemplate.update({
        where: { id: existing.id },
        data: {
          description: seed.description,
          isPeerable: seed.isPeerable ?? false,
          fromLabel: seed.fromLabel,
          toLabel: seed.toLabel,
          pastFromLabel: seed.pastFromLabel ?? null,
          pastToLabel: seed.pastToLabel ?? null
        }
      })
    : await prisma.relationshipTypeTemplate.create({
        data: {
          packId,
          name: seed.name,
          description: seed.description,
          isPeerable: seed.isPeerable ?? false,
          fromLabel: seed.fromLabel,
          toLabel: seed.toLabel,
          pastFromLabel: seed.pastFromLabel ?? null,
          pastToLabel: seed.pastToLabel ?? null
        }
      });

  for (const role of seed.roles) {
    const existingRole = await prisma.relationshipTypeTemplateRole.findFirst({
      where: {
        relationshipTypeTemplateId: template.id,
        fromRole: role.fromRole,
        toRole: role.toRole
      }
    });

    if (!existingRole) {
      await prisma.relationshipTypeTemplateRole.create({
        data: {
          relationshipTypeTemplateId: template.id,
          fromRole: role.fromRole,
          toRole: role.toRole
        }
      });
    }
  }

  return template;
}

async function upsertLocationRules(
  packId: string,
  templatesByName: Record<string, string>,
  rules: LocationRuleSeed[]
) {
  for (const rule of rules) {
    const parentId = templatesByName[rule.parent];
    const childId = templatesByName[rule.child];

    if (!parentId || !childId) {
      continue;
    }

    await prisma.locationTypeRuleTemplate.upsert({
      where: {
        parentLocationTypeTemplateId_childLocationTypeTemplateId: {
          parentLocationTypeTemplateId: parentId,
          childLocationTypeTemplateId: childId
        }
      },
      update: { packId },
      create: {
        packId,
        parentLocationTypeTemplateId: parentId,
        childLocationTypeTemplateId: childId
      }
    });
  }
}
const packs: PackSeed[] = [
  {
    name: "DND High Fantasy",
    description: "Opinionated fantasy with mythology, monsters, and magic.",
    posture: PackPosture.opinionated,
    entityTemplates: applyCoreTemplates(baseEntityTemplates, [
      "Character",
      "Organization",
      "Faction",
      "Species",
      "Monster"
    ]).concat([
      {
        name: "Species",
        description: "Ancestries and cultures.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "traits", fieldLabel: "Traits", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "origin", fieldLabel: "Origin", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "culture", fieldLabel: "Culture", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "relations", fieldLabel: "Relations", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Deity",
        description: "Gods, patrons, and divine powers.",
        category: "power",
        fields: [
          { fieldKey: "domain", fieldLabel: "Domain", fieldType: EntityFieldType.TEXT },
          { fieldKey: "symbols", fieldLabel: "Symbols", fieldType: EntityFieldType.TEXT },
          { fieldKey: "worshipers", fieldLabel: "Worshipers", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "edicts", fieldLabel: "Edicts", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "taboos", fieldLabel: "Taboos", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Monster",
        description: "Creatures and threats.",
        category: "threat",
        isCore: true,
        fields: [
          { fieldKey: "type", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "habitat", fieldLabel: "Habitat", fieldType: EntityFieldType.TEXT },
          { fieldKey: "threatLevel", fieldLabel: "Threat Level", fieldType: EntityFieldType.TEXT },
          { fieldKey: "weaknesses", fieldLabel: "Weaknesses", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "loot", fieldLabel: "Loot", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Magic Tradition",
        description: "Schools, cults, or styles of magic.",
        category: "power",
        fields: [
          { fieldKey: "source", fieldLabel: "Source", fieldType: EntityFieldType.TEXT },
          { fieldKey: "practices", fieldLabel: "Practices", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "limitations", fieldLabel: "Limitations", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "schools", fieldLabel: "Schools", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationTemplates: applyCoreTemplates(baseLocationTemplates, ["Settlement", "Region"]).concat([
      {
        name: "Dungeon",
        description: "Multi-room adventure locations.",
        isCore: false,
        fields: [
          { fieldKey: "origin", fieldLabel: "Origin", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "factions", fieldLabel: "Factions", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "traps", fieldLabel: "Traps", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "treasures", fieldLabel: "Treasures", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "state", fieldLabel: "Current State", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Ruin",
        description: "Ancient or fallen sites.",
        isCore: false,
        fields: [
          { fieldKey: "age", fieldLabel: "Age", fieldType: LocationFieldType.TEXT },
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "guardians", fieldLabel: "Guardians", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "relics", fieldLabel: "Relics", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationRules: [
      { parent: "Region", child: "Settlement" },
      { parent: "Settlement", child: "Site" },
      { parent: "Settlement", child: "Dungeon" },
      { parent: "Region", child: "Ruin" }
    ],
    relationshipTemplates: baseRelationshipTemplates.concat([
      {
        name: "Worships",
        description: "A follower honors a divine power.",
        isPeerable: false,
        fromLabel: "Follower",
        toLabel: "Deity",
        roles: [{ fromRole: "Character", toRole: "Deity" }]
      },
      {
        name: "Serves",
        description: "A character is bound to a patron or master.",
        isPeerable: false,
        fromLabel: "Servant",
        toLabel: "Patron",
        roles: [{ fromRole: "Character", toRole: "Deity" }]
      }
    ])
  },
  {
    name: "Realism - Mystery",
    description: "Investigation-focused realism with suspects and evidence.",
    posture: PackPosture.opinionated,
    entityTemplates: applyCoreTemplates(baseEntityTemplates, ["Character"]).concat([
      {
        name: "Suspect",
        description: "Potential perpetrators and persons of interest.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "motive", fieldLabel: "Motive", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "alibi", fieldLabel: "Alibi", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "opportunity", fieldLabel: "Opportunity", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "tells", fieldLabel: "Tells", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Victim",
        description: "Victims and missing persons.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "background", fieldLabel: "Background", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "lastKnownActions", fieldLabel: "Last Known Actions", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Evidence",
        description: "Clues, documents, and forensic artifacts.",
        category: "clues",
        isCore: true,
        fields: [
          { fieldKey: "type", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "source", fieldLabel: "Source", fieldType: EntityFieldType.TEXT },
          { fieldKey: "reliability", fieldLabel: "Reliability", fieldType: EntityFieldType.TEXT },
          { fieldKey: "chainOfCustody", fieldLabel: "Chain of Custody", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Investigator",
        description: "Detectives and investigators.",
        category: "people",
        fields: [
          { fieldKey: "resources", fieldLabel: "Resources", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "constraints", fieldLabel: "Constraints", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "methods", fieldLabel: "Methods", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationTemplates: applyCoreTemplates(baseLocationTemplates, ["Settlement"]).concat([
      {
        name: "Crime Scene",
        description: "Key locations for investigation.",
        isCore: true,
        fields: [
          { fieldKey: "access", fieldLabel: "Access", fieldType: LocationFieldType.TEXT },
          { fieldKey: "timeline", fieldLabel: "Timeline", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "keyEvidence", fieldLabel: "Key Evidence", fieldType: LocationFieldType.TEXTAREA }
        ]
      },
      {
        name: "Institution",
        description: "Hospitals, police, and media outlets.",
        isCore: false,
        fields: [
          { fieldKey: "authority", fieldLabel: "Authority", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "contacts", fieldLabel: "Contacts", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "conflicts", fieldLabel: "Conflicts", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Neighborhood",
        description: "Districts or local communities.",
        isCore: false,
        fields: [
          { fieldKey: "vibe", fieldLabel: "Vibe", fieldType: LocationFieldType.TEXT },
          { fieldKey: "hazards", fieldLabel: "Hazards", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationRules: [
      { parent: "Settlement", child: "Crime Scene" },
      { parent: "Settlement", child: "Institution" },
      { parent: "Settlement", child: "Neighborhood" }
    ],
    relationshipTemplates: baseRelationshipTemplates.concat([
      {
        name: "Knows",
        description: "Two characters have a personal connection.",
        isPeerable: true,
        fromLabel: "Knows",
        toLabel: "Knows",
        roles: [{ fromRole: "Character", toRole: "Character" }]
      },
      {
        name: "Connected To",
        description: "Evidence or suspects are linked to other entities.",
        isPeerable: false,
        fromLabel: "Connection",
        toLabel: "Linked",
        roles: [
          { fromRole: "Evidence", toRole: "Character" },
          { fromRole: "Evidence", toRole: "Organization" },
          { fromRole: "Evidence", toRole: "Event" }
        ]
      }
    ])
  },
  {
    name: "Cyberpunkish Future",
    description: "Corporate power, augmentation, and neon sprawl.",
    posture: PackPosture.opinionated,
    entityTemplates: applyCoreTemplates(baseEntityTemplates, ["Character", "Organization"]).concat([
      {
        name: "Corp",
        description: "Corporate entities and divisions.",
        category: "power",
        isCore: true,
        fields: [
          { fieldKey: "division", fieldLabel: "Division", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "assets", fieldLabel: "Assets", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "secrets", fieldLabel: "Secrets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "rivals", fieldLabel: "Rivals", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "projects", fieldLabel: "Projects", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Augmentation",
        description: "Cyberware and implants.",
        category: "tech",
        isCore: true,
        fields: [
          { fieldKey: "type", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "effects", fieldLabel: "Effects", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "sideEffects", fieldLabel: "Side Effects", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "maintenance", fieldLabel: "Maintenance", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Net Persona",
        description: "Digital personas or AIs.",
        category: "tech",
        fields: [
          { fieldKey: "access", fieldLabel: "Access", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "vulnerabilities", fieldLabel: "Vulnerabilities", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Street Gang",
        description: "Local crews and turf holders.",
        category: "society",
        fields: [
          { fieldKey: "turf", fieldLabel: "Turf", fieldType: EntityFieldType.TEXT },
          { fieldKey: "income", fieldLabel: "Income", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "alliances", fieldLabel: "Alliances", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "targets", fieldLabel: "Targets", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationTemplates: applyCoreTemplates(baseLocationTemplates, []).concat([
      {
        name: "Arcology",
        description: "Megastructures of corporate power.",
        isCore: true,
        fields: [
          { fieldKey: "zones", fieldLabel: "Zones", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "governance", fieldLabel: "Governance", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "security", fieldLabel: "Security", fieldType: LocationFieldType.TEXTAREA }
        ]
      },
      {
        name: "District",
        description: "Urban districts and sectors.",
        isCore: true,
        fields: [
          { fieldKey: "character", fieldLabel: "Character", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "economy", fieldLabel: "Economy", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "threats", fieldLabel: "Threats", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Black Market",
        description: "Hidden hubs for illicit trade.",
        isCore: false,
        fields: [
          { fieldKey: "goods", fieldLabel: "Goods", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "gatekeepers", fieldLabel: "Gatekeepers", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "heatLevel", fieldLabel: "Heat Level", fieldType: LocationFieldType.TEXT }
        ]
      }
    ]),
    locationRules: [
      { parent: "Arcology", child: "District" },
      { parent: "District", child: "Site" },
      { parent: "District", child: "Black Market" }
    ],
    relationshipTemplates: baseRelationshipTemplates.concat([
      {
        name: "Employed By",
        description: "A character works for a corporation.",
        isPeerable: false,
        fromLabel: "Employee",
        toLabel: "Employer",
        roles: [{ fromRole: "Character", toRole: "Corp" }]
      },
      {
        name: "Augmented With",
        description: "A character has an augmentation.",
        isPeerable: false,
        fromLabel: "User",
        toLabel: "Augmentation",
        roles: [{ fromRole: "Character", toRole: "Augmentation" }]
      }
    ])
  },
  {
    name: "High Sci-Fi",
    description: "Optimistic exploration and interstellar diplomacy.",
    posture: PackPosture.opinionated,
    entityTemplates: applyCoreTemplates(baseEntityTemplates, ["Character"]).concat([
      {
        name: "Species",
        description: "Alien species and cultures.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "physiology", fieldLabel: "Physiology", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "culture", fieldLabel: "Culture", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "homeworld", fieldLabel: "Homeworld", fieldType: EntityFieldType.TEXT },
          { fieldKey: "relations", fieldLabel: "Relations", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Starship",
        description: "Ships with missions and crews.",
        category: "tech",
        isCore: true,
        fields: [
          { fieldKey: "class", fieldLabel: "Class", fieldType: EntityFieldType.TEXT },
          { fieldKey: "mission", fieldLabel: "Mission", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "crewCapacity", fieldLabel: "Crew Capacity", fieldType: EntityFieldType.TEXT },
          { fieldKey: "capabilities", fieldLabel: "Capabilities", fieldType: EntityFieldType.TEXTAREA }
        ]
      },
      {
        name: "Polity",
        description: "Federations, empires, and alliances.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "values", fieldLabel: "Values", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "members", fieldLabel: "Members", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "charter", fieldLabel: "Charter", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "conflicts", fieldLabel: "Conflicts", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Scientific Anomaly",
        description: "Strange phenomena and discoveries.",
        category: "science",
        fields: [
          { fieldKey: "nature", fieldLabel: "Nature", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "risk", fieldLabel: "Risk", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "opportunities", fieldLabel: "Opportunities", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationTemplates: applyCoreTemplates(baseLocationTemplates, []).concat([
      {
        name: "Star System",
        description: "Systems with planets and stations.",
        isCore: true,
        fields: [
          { fieldKey: "primary", fieldLabel: "Primary", fieldType: LocationFieldType.TEXT },
          { fieldKey: "planets", fieldLabel: "Planets", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "stations", fieldLabel: "Stations", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "strategicValue", fieldLabel: "Strategic Value", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Station",
        description: "Stations, bases, and outposts.",
        isCore: true,
        fields: [
          { fieldKey: "mission", fieldLabel: "Mission", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "capacity", fieldLabel: "Capacity", fieldType: LocationFieldType.TEXT },
          { fieldKey: "risks", fieldLabel: "Risks", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Planet",
        description: "Habitable or important worlds.",
        isCore: false,
        fields: [
          { fieldKey: "biome", fieldLabel: "Biome", fieldType: LocationFieldType.TEXT },
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.TEXT },
          { fieldKey: "governance", fieldLabel: "Governance", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationRules: [
      { parent: "Star System", child: "Planet" },
      { parent: "Star System", child: "Station" },
      { parent: "Planet", child: "Site" }
    ],
    relationshipTemplates: baseRelationshipTemplates
      .filter((template) => template.name !== "Member Of")
      .concat([
      {
        name: "Member Of",
        description: "A species or character is part of a polity.",
        isPeerable: false,
        fromLabel: "Member",
        toLabel: "Polity",
        pastFromLabel: "Former Member",
        pastToLabel: "Former Polity",
        roles: [
          { fromRole: "Species", toRole: "Polity" },
          { fromRole: "Character", toRole: "Polity" }
        ]
      },
      {
        name: "Assigned To",
        description: "A character serves on a starship.",
        isPeerable: false,
        fromLabel: "Assigned",
        toLabel: "Starship",
        roles: [{ fromRole: "Character", toRole: "Starship" }]
      }
    ])
  },
  {
    name: "Gritty Sci-Fi",
    description: "Frontier survival and high-risk jobs.",
    posture: PackPosture.opinionated,
    entityTemplates: applyCoreTemplates(baseEntityTemplates, ["Character"]).concat([
      {
        name: "Crew",
        description: "Small crews and found families.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "role", fieldLabel: "Role", fieldType: EntityFieldType.TEXT },
          { fieldKey: "debts", fieldLabel: "Debts", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "reputation", fieldLabel: "Reputation", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "baggage", fieldLabel: "Baggage", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Ship",
        description: "Ships with history and quirks.",
        category: "tech",
        isCore: true,
        fields: [
          { fieldKey: "class", fieldLabel: "Class", fieldType: EntityFieldType.TEXT },
          { fieldKey: "quirks", fieldLabel: "Quirks", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "capabilities", fieldLabel: "Capabilities", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "debts", fieldLabel: "Debts", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Patron",
        description: "Clients, fixers, and employers.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "payment", fieldLabel: "Payment", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "risks", fieldLabel: "Risks", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "doubleCrossChance", fieldLabel: "Double-Cross Chance", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Cargo",
        description: "Jobs, shipments, or contracts.",
        category: "jobs",
        isCore: true,
        fields: [
          { fieldKey: "contents", fieldLabel: "Contents", fieldType: EntityFieldType.TEXTAREA },
          { fieldKey: "legality", fieldLabel: "Legality", fieldType: EntityFieldType.TEXT },
          { fieldKey: "payout", fieldLabel: "Payout", fieldType: EntityFieldType.TEXT },
          { fieldKey: "complications", fieldLabel: "Complications", fieldType: EntityFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationTemplates: applyCoreTemplates(baseLocationTemplates, []).concat([
      {
        name: "Frontier World",
        description: "Rough worlds on the edge of civilization.",
        isCore: true,
        fields: [
          { fieldKey: "lawLevel", fieldLabel: "Law Level", fieldType: LocationFieldType.TEXT },
          { fieldKey: "economy", fieldLabel: "Economy", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "localPower", fieldLabel: "Local Power", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Waystation",
        description: "Stops for refuel and supplies.",
        isCore: true,
        fields: [
          { fieldKey: "services", fieldLabel: "Services", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "tariffs", fieldLabel: "Tariffs", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "dangers", fieldLabel: "Dangers", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      },
      {
        name: "Outpost",
        description: "Remote stations or colonies.",
        isCore: false,
        fields: [
          { fieldKey: "mission", fieldLabel: "Mission", fieldType: LocationFieldType.TEXTAREA },
          { fieldKey: "supplies", fieldLabel: "Supplies", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false },
          { fieldKey: "hazards", fieldLabel: "Hazards", fieldType: LocationFieldType.TEXTAREA, defaultEnabled: false }
        ]
      }
    ]),
    locationRules: [
      { parent: "Frontier World", child: "Settlement" },
      { parent: "Frontier World", child: "Outpost" },
      { parent: "Waystation", child: "Site" }
    ],
    relationshipTemplates: baseRelationshipTemplates.concat([
      {
        name: "Hired By",
        description: "A crew takes a job from a patron.",
        isPeerable: false,
        fromLabel: "Crew",
        toLabel: "Patron",
        roles: [{ fromRole: "Crew", toRole: "Patron" }]
      },
      {
        name: "Owes",
        description: "Debt and obligation between parties.",
        isPeerable: false,
        fromLabel: "Debtor",
        toLabel: "Creditor",
        roles: [
          { fromRole: "Character", toRole: "Organization" },
          { fromRole: "Crew", toRole: "Patron" }
        ]
      }
    ])
  }
];
async function seedPack(packSeed: PackSeed, createdById: string) {
  const pack = await upsertPack(createdById, packSeed);
  const entityTemplates = new Map<string, string>();
  const locationTemplates = new Map<string, string>();

  for (const templateSeed of packSeed.entityTemplates) {
    const template = await upsertEntityTemplate(pack.id, templateSeed);
    entityTemplates.set(templateSeed.name, template.id);
  }

  for (const templateSeed of packSeed.locationTemplates) {
    const template = await upsertLocationTemplate(pack.id, templateSeed);
    locationTemplates.set(templateSeed.name, template.id);
  }

  await upsertLocationRules(
    pack.id,
    Object.fromEntries(locationTemplates.entries()),
    packSeed.locationRules
  );

  for (const templateSeed of packSeed.relationshipTemplates) {
    await upsertRelationshipTemplate(pack.id, templateSeed);
  }

  return { pack, entityTemplates, locationTemplates };
}

async function main() {
  const adminUserId = await getAdminUserId();

  for (const pack of packs) {
    await seedPack(pack, adminUserId);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
