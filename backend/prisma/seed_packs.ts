import {
  EntityFieldType,
  LocationFieldType,
  PackPosture,
  PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();

type ChoiceOptionSeed = {
  value: string;
  label: string;
  order?: number;
  isActive?: boolean;
};

type ChoiceListSeed = {
  key: string;
  name: string;
  description?: string;
  options: ChoiceOptionSeed[];
};

type FieldSeed = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: EntityFieldType | LocationFieldType;
  required?: boolean;
  defaultEnabled?: boolean;
  choiceListKey?: string;
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
  choiceLists: ChoiceListSeed[];
  entityTemplates: EntityTemplateSeed[];
  locationTemplates: LocationTemplateSeed[];
  locationRules: LocationRuleSeed[];
  relationshipTemplates: RelationshipTemplateSeed[];
};

const sharedChoiceLists = {
  characterStatus: {
    key: "character_status",
    name: "Character Status",
    options: [
      { value: "alive", label: "Alive", order: 1 },
      { value: "missing", label: "Missing", order: 2 },
      { value: "deceased", label: "Deceased", order: 3 }
    ]
  }
} satisfies Record<string, ChoiceListSeed>;

const fantasyChoiceLists: ChoiceListSeed[] = [
  sharedChoiceLists.characterStatus,
  {
    key: "settlement_size",
    name: "Settlement Size",
    options: [
      { value: "hamlet", label: "Hamlet", order: 1 },
      { value: "village", label: "Village", order: 2 },
      { value: "town", label: "Town", order: 3 },
      { value: "city", label: "City", order: 4 },
      { value: "metropolis", label: "Metropolis", order: 5 }
    ]
  },
  {
    key: "biome_type",
    name: "Biome Type",
    options: [
      { value: "forest", label: "Forest", order: 1 },
      { value: "plains", label: "Plains", order: 2 },
      { value: "mountains", label: "Mountains", order: 3 },
      { value: "desert", label: "Desert", order: 4 },
      { value: "swamp", label: "Swamp", order: 5 },
      { value: "tundra", label: "Tundra", order: 6 },
      { value: "coast", label: "Coast", order: 7 }
    ]
  },
  {
    key: "geographical_feature_type",
    name: "Geographical Feature Type",
    options: [
      { value: "mountain_range", label: "Mountain Range", order: 1 },
      { value: "river", label: "River", order: 2 },
      { value: "forest", label: "Forest", order: 3 },
      { value: "lake", label: "Lake", order: 4 },
      { value: "desert", label: "Desert", order: 5 },
      { value: "valley", label: "Valley", order: 6 },
      { value: "coastline", label: "Coastline", order: 7 }
    ]
  }
];

const utopianChoiceLists: ChoiceListSeed[] = [
  sharedChoiceLists.characterStatus,
  {
    key: "city_type",
    name: "City Type",
    options: [
      { value: "capital", label: "Capital", order: 1 },
      { value: "arcology", label: "Arcology", order: 2 },
      { value: "garden_city", label: "Garden City", order: 3 },
      { value: "research_hub", label: "Research Hub", order: 4 },
      { value: "spaceport", label: "Spaceport", order: 5 }
    ]
  },
  {
    key: "system_class",
    name: "System Class",
    options: [
      { value: "single_star", label: "Single Star", order: 1 },
      { value: "binary", label: "Binary", order: 2 },
      { value: "multiple", label: "Multiple", order: 3 },
      { value: "anomalous", label: "Anomalous", order: 4 }
    ]
  }
];

const grittyChoiceLists: ChoiceListSeed[] = [
  sharedChoiceLists.characterStatus,
  {
    key: "system_class",
    name: "System Class",
    options: [
      { value: "single_star", label: "Single Star", order: 1 },
      { value: "binary", label: "Binary", order: 2 },
      { value: "multiple", label: "Multiple", order: 3 },
      { value: "anomalous", label: "Anomalous", order: 4 }
    ]
  },
  {
    key: "planet_class",
    name: "Planet Class",
    options: [
      { value: "terrestrial", label: "Terrestrial", order: 1 },
      { value: "gas_giant", label: "Gas Giant", order: 2 },
      { value: "ice", label: "Ice", order: 3 },
      { value: "ocean", label: "Ocean", order: 4 },
      { value: "desert", label: "Desert", order: 5 }
    ]
  },
  {
    key: "habitability",
    name: "Habitability",
    options: [
      { value: "habitable", label: "Habitable", order: 1 },
      { value: "marginal", label: "Marginal", order: 2 },
      { value: "uninhabitable", label: "Uninhabitable", order: 3 }
    ]
  },
  {
    key: "station_type",
    name: "Station Type",
    options: [
      { value: "orbital", label: "Orbital", order: 1 },
      { value: "deep_space", label: "Deep Space", order: 2 },
      { value: "mining", label: "Mining", order: 3 },
      { value: "research", label: "Research", order: 4 },
      { value: "military", label: "Military", order: 5 }
    ]
  },
  {
    key: "settlement_type",
    name: "Settlement Type",
    options: [
      { value: "colony", label: "Colony", order: 1 },
      { value: "outpost", label: "Outpost", order: 2 },
      { value: "hub", label: "Hub", order: 3 },
      { value: "refuge", label: "Refuge", order: 4 }
    ]
  },
  {
    key: "facility_type",
    name: "Facility Type",
    options: [
      { value: "research", label: "Research", order: 1 },
      { value: "industrial", label: "Industrial", order: 2 },
      { value: "military", label: "Military", order: 3 },
      { value: "medical", label: "Medical", order: 4 },
      { value: "agricultural", label: "Agricultural", order: 5 }
    ]
  },
  {
    key: "derelict_type",
    name: "Derelict Type",
    options: [
      { value: "ship", label: "Ship", order: 1 },
      { value: "station", label: "Station", order: 2 },
      { value: "habitat", label: "Habitat", order: 3 },
      { value: "ruin", label: "Ruin", order: 4 }
    ]
  },
  {
    key: "location_status",
    name: "Location Status",
    options: [
      { value: "active", label: "Active", order: 1 },
      { value: "abandoned", label: "Abandoned", order: 2 },
      { value: "quarantined", label: "Quarantined", order: 3 },
      { value: "restricted", label: "Restricted", order: 4 }
    ]
  },
  {
    key: "security_level",
    name: "Security Level",
    options: [
      { value: "low", label: "Low", order: 1 },
      { value: "medium", label: "Medium", order: 2 },
      { value: "high", label: "High", order: 3 },
      { value: "black", label: "Black", order: 4 }
    ]
  },
  {
    key: "hazard_level",
    name: "Hazard Level",
    options: [
      { value: "low", label: "Low", order: 1 },
      { value: "moderate", label: "Moderate", order: 2 },
      { value: "severe", label: "Severe", order: 3 },
      { value: "extreme", label: "Extreme", order: 4 }
    ]
  }
];

const cyberpunkChoiceLists: ChoiceListSeed[] = [
  sharedChoiceLists.characterStatus,
  {
    key: "industry_sector",
    name: "Industry Sector",
    options: [
      { value: "biotech", label: "Biotech", order: 1 },
      { value: "cybernetics", label: "Cybernetics", order: 2 },
      { value: "security", label: "Security", order: 3 },
      { value: "finance", label: "Finance", order: 4 },
      { value: "media", label: "Media", order: 5 },
      { value: "manufacturing", label: "Manufacturing", order: 6 },
      { value: "logistics", label: "Logistics", order: 7 }
    ]
  },
  {
    key: "district_type",
    name: "District Type",
    options: [
      { value: "residential", label: "Residential", order: 1 },
      { value: "commercial", label: "Commercial", order: 2 },
      { value: "industrial", label: "Industrial", order: 3 },
      { value: "corporate", label: "Corporate", order: 4 },
      { value: "slums", label: "Slums", order: 5 },
      { value: "entertainment", label: "Entertainment", order: 6 }
    ]
  }
];

const realismChoiceLists: ChoiceListSeed[] = [
  {
    key: "person_status",
    name: "Person Status",
    options: [
      { value: "active", label: "Active", order: 1 },
      { value: "missing", label: "Missing", order: 2 },
      { value: "deceased", label: "Deceased", order: 3 }
    ]
  }
];

const packSeeds: PackSeed[] = [
  {
    name: "High Fantasy",
    description: "Classic fantasy foundations with kingdoms, creatures, and mythic power structures.",
    posture: PackPosture.opinionated,
    choiceLists: fantasyChoiceLists,
    entityTemplates: [
      {
        name: "Character",
        description: "People and protagonists in the world.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_status" },
          { fieldKey: "role", fieldLabel: "Role", fieldType: EntityFieldType.TEXT },
          { fieldKey: "background", fieldLabel: "Background", fieldType: EntityFieldType.TEXT },
          { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Organisation",
        description: "Guilds, cults, kingdoms, and institutions.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: EntityFieldType.TEXT },
          { fieldKey: "leader", fieldLabel: "Leader", fieldType: EntityFieldType.TEXT },
          { fieldKey: "influence", fieldLabel: "Influence", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Race",
        description: "Cultures, ancestries, or species.",
        category: "people",
        fields: [
          { fieldKey: "origin", fieldLabel: "Origin", fieldType: EntityFieldType.TEXT },
          { fieldKey: "traits", fieldLabel: "Traits", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Creature",
        description: "Monsters and beasts that shape the wilds.",
        category: "creatures",
        fields: [
          { fieldKey: "creatureType", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "threatLevel", fieldLabel: "Threat Level", fieldType: EntityFieldType.NUMBER }
        ]
      },
      {
        name: "Item",
        description: "Artifacts, gear, and notable objects.",
        category: "items",
        fields: [
          { fieldKey: "itemType", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "rarity", fieldLabel: "Rarity", fieldType: EntityFieldType.TEXT },
          { fieldKey: "origin", fieldLabel: "Origin", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Title",
        description: "Honorifics, ranks, and seats of power.",
        category: "society",
        fields: [
          { fieldKey: "rank", fieldLabel: "Rank", fieldType: EntityFieldType.TEXT },
          { fieldKey: "domain", fieldLabel: "Domain", fieldType: EntityFieldType.TEXT }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Country",
        description: "Sovereign nations and realms.",
        isCore: true,
        fields: [
          { fieldKey: "government", fieldLabel: "Government", fieldType: LocationFieldType.TEXT },
          { fieldKey: "capital", fieldLabel: "Capital", fieldType: LocationFieldType.TEXT },
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER }
        ]
      },
      {
        name: "Region",
        description: "Provinces, frontiers, and wild expanses.",
        isCore: true,
        fields: [
          { fieldKey: "biome", fieldLabel: "Biome", fieldType: LocationFieldType.CHOICE, choiceListKey: "biome_type" },
          { fieldKey: "terrain", fieldLabel: "Terrain", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Settlement",
        description: "Cities, towns, and villages.",
        isCore: true,
        fields: [
          { fieldKey: "size", fieldLabel: "Size", fieldType: LocationFieldType.CHOICE, choiceListKey: "settlement_size" },
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER },
          { fieldKey: "status", fieldLabel: "Status", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "District",
        description: "Neighborhoods, wards, or quarters.",
        fields: [
          { fieldKey: "function", fieldLabel: "Function", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Building",
        description: "Structures such as keeps, halls, or temples.",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Geographical",
        description: "Natural landmarks and features.",
        fields: [
          { fieldKey: "featureType", fieldLabel: "Feature Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "geographical_feature_type" },
          { fieldKey: "description", fieldLabel: "Description", fieldType: LocationFieldType.TEXT }
        ]
      }
    ],
    locationRules: [
      { parent: "Country", child: "Region" },
      { parent: "Country", child: "Settlement" },
      { parent: "Country", child: "Geographical" },
      { parent: "Region", child: "Settlement" },
      { parent: "Region", child: "Geographical" },
      { parent: "Settlement", child: "District" },
      { parent: "Settlement", child: "Building" },
      { parent: "District", child: "Building" }
    ],
    relationshipTemplates: [
      {
        name: "Member Of",
        description: "A person or group belongs to a larger organization.",
        fromLabel: "Member",
        toLabel: "Organization",
        roles: [
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Organisation" }
        ]
      },
      {
        name: "Enemy Of",
        description: "Two parties are in conflict.",
        isPeerable: true,
        fromLabel: "Enemy",
        toLabel: "Enemy",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Organisation", toRole: "Organisation" }
        ]
      },
      {
        name: "Ally Of",
        description: "Two parties are allied.",
        isPeerable: true,
        fromLabel: "Ally",
        toLabel: "Ally",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Organisation", toRole: "Organisation" }
        ]
      },
      {
        name: "Holds Title",
        description: "A character holds an honorific or position.",
        fromLabel: "Holder",
        toLabel: "Title",
        roles: [{ fromRole: "Character", toRole: "Title" }]
      },
      {
        name: "Ruler Of",
        description: "A character or organization rules a settlement or region.",
        fromLabel: "Ruler",
        toLabel: "Location",
        roles: [
          { fromRole: "Character", toRole: "Settlement" },
          { fromRole: "Organisation", toRole: "Settlement" },
          { fromRole: "Character", toRole: "Country" }
        ]
      }
    ]
  },
  {
    name: "Utopian Sci-Fi",
    description: "Optimistic futures with institutions, advanced tech, and structured societies.",
    posture: PackPosture.opinionated,
    choiceLists: utopianChoiceLists,
    entityTemplates: [
      {
        name: "Character",
        description: "People and protagonists in the world.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_status" },
          { fieldKey: "role", fieldLabel: "Role", fieldType: EntityFieldType.TEXT },
          { fieldKey: "specialty", fieldLabel: "Specialty", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Institution",
        description: "Governing bodies, councils, and agencies.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "mandate", fieldLabel: "Mandate", fieldType: EntityFieldType.TEXT },
          { fieldKey: "leadership", fieldLabel: "Leadership", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Organisation",
        description: "Corporations, collectives, or alliances.",
        category: "society",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: EntityFieldType.TEXT },
          { fieldKey: "influence", fieldLabel: "Influence", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Technology",
        description: "Key technologies or innovations.",
        category: "technology",
        fields: [
          { fieldKey: "function", fieldLabel: "Function", fieldType: EntityFieldType.TEXT },
          { fieldKey: "tier", fieldLabel: "Tier", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Role",
        description: "Societal roles and responsibilities.",
        category: "people",
        fields: [
          { fieldKey: "responsibilities", fieldLabel: "Responsibilities", fieldType: EntityFieldType.TEXT },
          { fieldKey: "authority", fieldLabel: "Authority", fieldType: EntityFieldType.TEXT }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Star System",
        description: "Primary stellar systems.",
        isCore: true,
        fields: [
          { fieldKey: "systemClass", fieldLabel: "System Class", fieldType: LocationFieldType.CHOICE, choiceListKey: "system_class" },
          { fieldKey: "notes", fieldLabel: "Notes", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Planet",
        description: "Worlds within a system.",
        isCore: true,
        fields: [
          { fieldKey: "climate", fieldLabel: "Climate", fieldType: LocationFieldType.TEXT },
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER }
        ]
      },
      {
        name: "City",
        description: "Urban hubs and arcologies.",
        isCore: true,
        fields: [
          { fieldKey: "cityType", fieldLabel: "City Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "city_type" },
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER }
        ]
      },
      {
        name: "Orbital",
        description: "Stations, habitats, and orbital structures.",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXT },
          { fieldKey: "status", fieldLabel: "Status", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Facility",
        description: "Labs, shipyards, and special-purpose sites.",
        fields: [
          { fieldKey: "function", fieldLabel: "Function", fieldType: LocationFieldType.TEXT },
          { fieldKey: "operator", fieldLabel: "Operator", fieldType: LocationFieldType.TEXT }
        ]
      }
    ],
    locationRules: [
      { parent: "Star System", child: "Planet" },
      { parent: "Star System", child: "Orbital" },
      { parent: "Planet", child: "City" },
      { parent: "Planet", child: "Facility" },
      { parent: "City", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Member Of",
        description: "A character or organization belongs to an institution.",
        fromLabel: "Member",
        toLabel: "Institution",
        roles: [
          { fromRole: "Character", toRole: "Institution" },
          { fromRole: "Organisation", toRole: "Institution" }
        ]
      },
      {
        name: "Oversees",
        description: "An institution oversees an organization or facility.",
        fromLabel: "Overseer",
        toLabel: "Subject",
        roles: [
          { fromRole: "Institution", toRole: "Organisation" },
          { fromRole: "Institution", toRole: "Facility" }
        ]
      },
      {
        name: "Affiliated With",
        description: "Two parties maintain a cooperative relationship.",
        isPeerable: true,
        fromLabel: "Affiliate",
        toLabel: "Affiliate",
        roles: [
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Organisation" }
        ]
      },
      {
        name: "Assigned To",
        description: "A character is assigned to an organization or facility.",
        fromLabel: "Assignee",
        toLabel: "Assignment",
        roles: [
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Character", toRole: "Facility" }
        ]
      }
    ]
  },
  {
    name: "Gritty Sci-Fi",
    description: "Hard-edged spacefaring worlds with conflict, scarcity, and frontier survival.",
    posture: PackPosture.opinionated,
    choiceLists: grittyChoiceLists,
    entityTemplates: [
      {
        name: "Character",
        description: "People and protagonists in the world.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_status" },
          { fieldKey: "callSign", fieldLabel: "Call Sign", fieldType: EntityFieldType.TEXT },
          { fieldKey: "skills", fieldLabel: "Skills", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Faction",
        description: "Power blocs, syndicates, or ideologies.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "ideology", fieldLabel: "Ideology", fieldType: EntityFieldType.TEXT },
          { fieldKey: "resources", fieldLabel: "Resources", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Crew",
        description: "Teams, ships, and tight-knit groups.",
        category: "people",
        fields: [
          { fieldKey: "focus", fieldLabel: "Focus", fieldType: EntityFieldType.TEXT },
          { fieldKey: "ship", fieldLabel: "Ship", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Asset",
        description: "Valuable resources, intel, or equipment.",
        category: "items",
        fields: [
          { fieldKey: "assetType", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "value", fieldLabel: "Value", fieldType: EntityFieldType.NUMBER }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Star System",
        description: "Primary stellar systems.",
        isCore: true,
        fields: [
          { fieldKey: "systemClass", fieldLabel: "System Class", fieldType: LocationFieldType.CHOICE, choiceListKey: "system_class" },
          { fieldKey: "hazards", fieldLabel: "Hazards", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Planet",
        description: "Planets and settled worlds.",
        isCore: true,
        fields: [
          { fieldKey: "planetClass", fieldLabel: "Planet Class", fieldType: LocationFieldType.CHOICE, choiceListKey: "planet_class" },
          { fieldKey: "habitability", fieldLabel: "Habitability", fieldType: LocationFieldType.CHOICE, choiceListKey: "habitability" }
        ]
      },
      {
        name: "Station",
        description: "Orbital or deep-space stations.",
        isCore: true,
        fields: [
          { fieldKey: "stationType", fieldLabel: "Station Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "station_type" },
          { fieldKey: "locationStatus", fieldLabel: "Status", fieldType: LocationFieldType.CHOICE, choiceListKey: "location_status" },
          { fieldKey: "securityLevel", fieldLabel: "Security Level", fieldType: LocationFieldType.CHOICE, choiceListKey: "security_level" }
        ]
      },
      {
        name: "Sector",
        description: "Large regions of space.",
        fields: [
          { fieldKey: "hazardLevel", fieldLabel: "Hazard Level", fieldType: LocationFieldType.CHOICE, choiceListKey: "hazard_level" }
        ]
      },
      {
        name: "Moon",
        description: "Moons and satellites.",
        fields: [
          { fieldKey: "locationStatus", fieldLabel: "Status", fieldType: LocationFieldType.CHOICE, choiceListKey: "location_status" }
        ]
      },
      {
        name: "Orbital",
        description: "Orbital structures and rings.",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Settlement",
        description: "Colonies, outposts, and settlements.",
        fields: [
          { fieldKey: "settlementType", fieldLabel: "Settlement Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "settlement_type" },
          { fieldKey: "securityLevel", fieldLabel: "Security Level", fieldType: LocationFieldType.CHOICE, choiceListKey: "security_level" }
        ]
      },
      {
        name: "Facility",
        description: "Factories, labs, and industrial sites.",
        fields: [
          { fieldKey: "facilityType", fieldLabel: "Facility Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "facility_type" }
        ]
      },
      {
        name: "Derelict",
        description: "Wrecks and abandoned structures.",
        fields: [
          { fieldKey: "derelictType", fieldLabel: "Derelict Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "derelict_type" },
          { fieldKey: "hazardLevel", fieldLabel: "Hazard Level", fieldType: LocationFieldType.CHOICE, choiceListKey: "hazard_level" }
        ]
      },
      {
        name: "Jump Point",
        description: "Transit gates and jump routes.",
        fields: [
          { fieldKey: "locationStatus", fieldLabel: "Status", fieldType: LocationFieldType.CHOICE, choiceListKey: "location_status" }
        ]
      }
    ],
    locationRules: [
      { parent: "Star System", child: "Planet" },
      { parent: "Star System", child: "Station" },
      { parent: "Star System", child: "Sector" },
      { parent: "Star System", child: "Jump Point" },
      { parent: "Planet", child: "Moon" },
      { parent: "Planet", child: "Settlement" },
      { parent: "Planet", child: "Facility" },
      { parent: "Station", child: "Facility" },
      { parent: "Station", child: "Settlement" },
      { parent: "Sector", child: "Station" },
      { parent: "Settlement", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Member Of",
        description: "A character belongs to a faction or crew.",
        fromLabel: "Member",
        toLabel: "Group",
        roles: [
          { fromRole: "Character", toRole: "Faction" },
          { fromRole: "Character", toRole: "Crew" }
        ]
      },
      {
        name: "Enemy Of",
        description: "Two parties are in conflict.",
        isPeerable: true,
        fromLabel: "Enemy",
        toLabel: "Enemy",
        roles: [
          { fromRole: "Faction", toRole: "Faction" },
          { fromRole: "Character", toRole: "Character" }
        ]
      },
      {
        name: "Controls",
        description: "A faction or crew controls an asset or location.",
        fromLabel: "Controller",
        toLabel: "Asset",
        roles: [
          { fromRole: "Faction", toRole: "Asset" },
          { fromRole: "Crew", toRole: "Asset" },
          { fromRole: "Faction", toRole: "Station" }
        ]
      },
      {
        name: "Betrayed",
        description: "A character or faction has betrayed another.",
        fromLabel: "Betrayer",
        toLabel: "Betrayed",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Faction", toRole: "Faction" }
        ]
      }
    ]
  },
  {
    name: "Cyberpunk",
    description: "Corporate power, urban sprawl, and neon grit.",
    posture: PackPosture.opinionated,
    choiceLists: cyberpunkChoiceLists,
    entityTemplates: [
      {
        name: "Character",
        description: "People and protagonists in the world.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_status" },
          { fieldKey: "crew", fieldLabel: "Crew", fieldType: EntityFieldType.TEXT },
          { fieldKey: "streetRep", fieldLabel: "Street Rep", fieldType: EntityFieldType.NUMBER }
        ]
      },
      {
        name: "Corporation",
        description: "Megacorps and major corporate forces.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "industrySector", fieldLabel: "Industry Sector", fieldType: EntityFieldType.CHOICE, choiceListKey: "industry_sector" },
          { fieldKey: "influence", fieldLabel: "Influence", fieldType: EntityFieldType.NUMBER }
        ]
      },
      {
        name: "Gang",
        description: "Street crews and underground groups.",
        category: "society",
        fields: [
          { fieldKey: "turf", fieldLabel: "Turf", fieldType: EntityFieldType.TEXT },
          { fieldKey: "specialty", fieldLabel: "Specialty", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Augmentation",
        description: "Cyberware and enhancements.",
        category: "technology",
        fields: [
          { fieldKey: "augmentationType", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "grade", fieldLabel: "Grade", fieldType: EntityFieldType.TEXT }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "City",
        description: "Dense megacities and urban centers.",
        isCore: true,
        fields: [
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER },
          { fieldKey: "status", fieldLabel: "Status", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "District",
        description: "City districts and neighborhoods.",
        isCore: true,
        fields: [
          { fieldKey: "districtType", fieldLabel: "District Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "district_type" },
          { fieldKey: "notes", fieldLabel: "Notes", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Building",
        description: "Skyscrapers, apartments, and compounds.",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Facility",
        description: "Secure corporate or underground facilities.",
        fields: [
          { fieldKey: "function", fieldLabel: "Function", fieldType: LocationFieldType.TEXT }
        ]
      }
    ],
    locationRules: [
      { parent: "City", child: "District" },
      { parent: "City", child: "Building" },
      { parent: "City", child: "Facility" },
      { parent: "District", child: "Building" },
      { parent: "District", child: "Facility" },
      { parent: "Building", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Employed By",
        description: "A character works for a corporation.",
        fromLabel: "Employee",
        toLabel: "Employer",
        roles: [
          { fromRole: "Character", toRole: "Corporation" }
        ]
      },
      {
        name: "Controls",
        description: "A corporation or gang controls a territory or asset.",
        fromLabel: "Controller",
        toLabel: "Controlled",
        roles: [
          { fromRole: "Corporation", toRole: "District" },
          { fromRole: "Gang", toRole: "District" }
        ]
      },
      {
        name: "Rival Of",
        description: "Two parties are rivals.",
        isPeerable: true,
        fromLabel: "Rival",
        toLabel: "Rival",
        roles: [
          { fromRole: "Corporation", toRole: "Corporation" },
          { fromRole: "Gang", toRole: "Gang" }
        ]
      },
      {
        name: "Blackmails",
        description: "One party holds leverage over another.",
        fromLabel: "Blackmailer",
        toLabel: "Target",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Gang", toRole: "Corporation" }
        ]
      }
    ]
  },
  {
    name: "Realism",
    description: "Grounded contemporary settings for mystery and drama.",
    posture: PackPosture.opinionated,
    choiceLists: realismChoiceLists,
    entityTemplates: [
      {
        name: "Person",
        description: "People and suspects in the world.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "person_status" },
          { fieldKey: "occupation", fieldLabel: "Occupation", fieldType: EntityFieldType.TEXT },
          { fieldKey: "alibi", fieldLabel: "Alibi", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Organisation",
        description: "Companies, agencies, and institutions.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: EntityFieldType.TEXT },
          { fieldKey: "influence", fieldLabel: "Influence", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Role",
        description: "Roles held by people in the setting.",
        category: "people",
        fields: [
          { fieldKey: "responsibilities", fieldLabel: "Responsibilities", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Asset",
        description: "Resources, evidence, or tools.",
        category: "items",
        fields: [
          { fieldKey: "assetType", fieldLabel: "Type", fieldType: EntityFieldType.TEXT },
          { fieldKey: "value", fieldLabel: "Value", fieldType: EntityFieldType.NUMBER }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Country",
        description: "Countries and regions of the world.",
        isCore: true,
        fields: [
          { fieldKey: "government", fieldLabel: "Government", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "City",
        description: "Cities and towns.",
        isCore: true,
        fields: [
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER },
          { fieldKey: "notes", fieldLabel: "Notes", fieldType: LocationFieldType.TEXT }
        ]
      },
      {
        name: "Building",
        description: "Specific buildings or points of interest.",
        fields: [
          { fieldKey: "function", fieldLabel: "Function", fieldType: LocationFieldType.TEXT }
        ]
      }
    ],
    locationRules: [
      { parent: "Country", child: "City" },
      { parent: "City", child: "Building" }
    ],
    relationshipTemplates: [
      {
        name: "Employed By",
        description: "A person works for an organization.",
        fromLabel: "Employee",
        toLabel: "Employer",
        roles: [
          { fromRole: "Person", toRole: "Organisation" }
        ]
      },
      {
        name: "Reports To",
        description: "A person reports to another.",
        fromLabel: "Reporter",
        toLabel: "Manager",
        roles: [
          { fromRole: "Person", toRole: "Person" }
        ]
      },
      {
        name: "Colleague Of",
        description: "Two people work together.",
        isPeerable: true,
        fromLabel: "Colleague",
        toLabel: "Colleague",
        roles: [
          { fromRole: "Person", toRole: "Person" }
        ]
      }
    ]
  },
  {
    name: "Minimalist",
    description: "A near-zero opinion pack for expert architects.",
    posture: PackPosture.minimal,
    choiceLists: [],
    entityTemplates: [
      {
        name: "Character",
        description: "An optional character template.",
        category: "people",
        fields: [
          { fieldKey: "notes", fieldLabel: "Notes", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Organisation",
        description: "An optional organization template.",
        category: "society",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: EntityFieldType.TEXT }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Location",
        description: "A generic place template.",
        fields: [
          { fieldKey: "description", fieldLabel: "Description", fieldType: LocationFieldType.TEXT }
        ]
      }
    ],
    locationRules: [],
    relationshipTemplates: []
  }
];

const createChoiceLists = async (packId: string, lists: ChoiceListSeed[]) => {
  const map = new Map<string, string>();
  for (const list of lists) {
    const created = await prisma.choiceList.create({
      data: {
        name: list.name,
        description: list.description ?? null,
        scope: "PACK",
        packId
      }
    });
    map.set(list.key, created.id);

    if (list.options.length > 0) {
      await prisma.choiceOption.createMany({
        data: list.options.map((option, index) => ({
          choiceListId: created.id,
          value: option.value,
          label: option.label,
          order: option.order ?? index,
          isActive: option.isActive ?? true
        }))
      });
    }
  }
  return map;
};

const applyChoiceListId = (choiceListMap: Map<string, string>, field: FieldSeed) => {
  if (String(field.fieldType) !== "CHOICE") {
    return null;
  }
  if (!field.choiceListKey) {
    throw new Error(`Choice list key missing for field ${field.fieldKey}`);
  }
  const choiceListId = choiceListMap.get(field.choiceListKey);
  if (!choiceListId) {
    throw new Error(`Choice list ${field.choiceListKey} missing for field ${field.fieldKey}`);
  }
  return choiceListId;
};

const main = async () => {
  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  });
  if (!adminUser) {
    throw new Error("Admin user not found.");
  }

  await prisma.relationshipTypeTemplateRole.deleteMany();
  await prisma.relationshipTypeTemplate.deleteMany();
  await prisma.locationTypeRuleTemplate.deleteMany();
  await prisma.locationTypeTemplateField.deleteMany();
  await prisma.locationTypeTemplate.deleteMany();
  await prisma.entityTypeTemplateField.deleteMany();
  await prisma.entityTypeTemplate.deleteMany();
  await prisma.choiceOption.deleteMany({ where: { choiceList: { scope: "PACK" } } });
  await prisma.choiceList.deleteMany({ where: { scope: "PACK" } });
  await prisma.pack.deleteMany();

  for (const packSeed of packSeeds) {
    const pack = await prisma.pack.create({
      data: {
        name: packSeed.name,
        description: packSeed.description,
        posture: packSeed.posture,
        isActive: true,
        createdById: adminUser.id
      }
    });

    const choiceListMap = await createChoiceLists(pack.id, packSeed.choiceLists);

    for (const template of packSeed.entityTemplates) {
      const created = await prisma.entityTypeTemplate.create({
        data: {
          packId: pack.id,
          name: template.name,
          description: template.description ?? null,
          category: template.category ?? null,
          isCore: Boolean(template.isCore)
        }
      });

      for (const field of template.fields) {
        const choiceListId = applyChoiceListId(choiceListMap, field);
        await prisma.entityTypeTemplateField.create({
          data: {
            templateId: created.id,
            fieldKey: field.fieldKey,
            fieldLabel: field.fieldLabel,
            fieldType: field.fieldType as EntityFieldType,
            required: Boolean(field.required),
            defaultEnabled: field.defaultEnabled ?? true,
            choiceListId,
            validationRules: field.validationRules ?? undefined
          }
        });
      }
    }

    const locationTemplateMap = new Map<string, string>();
    for (const template of packSeed.locationTemplates) {
      const created = await prisma.locationTypeTemplate.create({
        data: {
          packId: pack.id,
          name: template.name,
          description: template.description ?? null,
          isCore: Boolean(template.isCore)
        }
      });
      locationTemplateMap.set(template.name, created.id);

      for (const field of template.fields) {
        const choiceListId = applyChoiceListId(choiceListMap, field);
        await prisma.locationTypeTemplateField.create({
          data: {
            templateId: created.id,
            fieldKey: field.fieldKey,
            fieldLabel: field.fieldLabel,
            fieldType: field.fieldType as LocationFieldType,
            required: Boolean(field.required),
            defaultEnabled: field.defaultEnabled ?? true,
            choiceListId,
            validationRules: field.validationRules ?? undefined
          }
        });
      }
    }

    for (const rule of packSeed.locationRules) {
      const parentId = locationTemplateMap.get(rule.parent);
      const childId = locationTemplateMap.get(rule.child);
      if (!parentId || !childId) {
        throw new Error(`Location rule missing template ${rule.parent} -> ${rule.child}`);
      }
      await prisma.locationTypeRuleTemplate.create({
        data: {
          packId: pack.id,
          parentLocationTypeTemplateId: parentId,
          childLocationTypeTemplateId: childId
        }
      });
    }

    for (const relationship of packSeed.relationshipTemplates) {
      const created = await prisma.relationshipTypeTemplate.create({
        data: {
          packId: pack.id,
          name: relationship.name,
          description: relationship.description ?? null,
          isPeerable: Boolean(relationship.isPeerable),
          fromLabel: relationship.fromLabel,
          toLabel: relationship.toLabel,
          pastFromLabel: relationship.pastFromLabel ?? null,
          pastToLabel: relationship.pastToLabel ?? null
        }
      });
      if (relationship.roles.length > 0) {
        await prisma.relationshipTypeTemplateRole.createMany({
          data: relationship.roles.map((role) => ({
            relationshipTypeTemplateId: created.id,
            fromRole: role.fromRole,
            toRole: role.toRole
          }))
        });
      }
    }
  }
};

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
