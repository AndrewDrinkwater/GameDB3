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
  {
    key: "character_status_fantasy",
    name: "Character Status",
    options: [
      { value: "alive", label: "Alive", order: 1 },
      { value: "dead", label: "Dead", order: 2 },
      { value: "unknown", label: "Unknown", order: 3 },
      { value: "undead", label: "Undead", order: 4 }
    ]
  },
  {
    key: "character_type",
    name: "Character Type",
    options: [
      { value: "trader", label: "Trader", order: 1 },
      { value: "political", label: "Political", order: 2 }
    ]
  },
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
  }
];

const utopianChoiceLists: ChoiceListSeed[] = [
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
  },
  {
    key: "ship_class",
    name: "Ship Class",
    options: [
      { value: "light", label: "Light", order: 1 },
      { value: "medium", label: "Medium", order: 2 },
      { value: "heavy", label: "Heavy", order: 3 }
    ]
  },
  {
    key: "ship_type",
    name: "Ship Type",
    options: [
      { value: "combat", label: "Combat", order: 1 },
      { value: "freight", label: "Freight", order: 2 },
      { value: "exploration", label: "Exploration", order: 3 }
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
    key: "ship_class",
    name: "Ship Class",
    options: [
      { value: "light", label: "Light", order: 1 },
      { value: "medium", label: "Medium", order: 2 },
      { value: "heavy", label: "Heavy", order: 3 }
    ]
  },
  {
    key: "ship_type",
    name: "Ship Type",
    options: [
      { value: "combat", label: "Combat", order: 1 },
      { value: "freight", label: "Freight", order: 2 },
      { value: "exploration", label: "Exploration", order: 3 }
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
    key: "crew_type",
    name: "Crew Type",
    options: [
      { value: "tactical", label: "Tactical", order: 1 },
      { value: "corporate", label: "Corporate", order: 2 },
      { value: "street", label: "Street", order: 3 }
    ]
  },
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
  },
  {
    key: "building_purpose",
    name: "Building Purpose",
    options: [
      { value: "corporate", label: "Corporate", order: 1 },
      { value: "commercial", label: "Commercial", order: 2 },
      { value: "residential", label: "Residential", order: 3 },
      { value: "industrial", label: "Industrial", order: 4 }
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
          { fieldKey: "characterType", fieldLabel: "Type", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_type" },
          { fieldKey: "status", fieldLabel: "Status", fieldType: EntityFieldType.CHOICE, choiceListKey: "character_status_fantasy" },
          { fieldKey: "raceId", fieldLabel: "Race", fieldType: EntityFieldType.ENTITY_REFERENCE }
        ]
      },
      {
        name: "Organisation",
        description: "Guilds, cults, kingdoms, and institutions.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "leaderId", fieldLabel: "Leader", fieldType: EntityFieldType.ENTITY_REFERENCE },
          { fieldKey: "headquartersLocationId", fieldLabel: "Headquarters", fieldType: EntityFieldType.LOCATION_REFERENCE },
          { fieldKey: "goals", fieldLabel: "Goals", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Race",
        description: "Cultures, ancestries, or species.",
        category: "people",
        isCore: true,
        fields: [
          { fieldKey: "origin", fieldLabel: "Origin", fieldType: EntityFieldType.TEXT },
          { fieldKey: "traits", fieldLabel: "Traits", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Objects",
        description: "Artifacts, gear, and notable objects.",
        category: "items",
        fields: [
          { fieldKey: "value", fieldLabel: "Value", fieldType: EntityFieldType.TEXT },
          { fieldKey: "properties", fieldLabel: "Properties", fieldType: EntityFieldType.TEXT },
          { fieldKey: "history", fieldLabel: "History", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Title",
        description: "Honorifics, ranks, and seats of power.",
        category: "society",
        fields: [
          { fieldKey: "rank", fieldLabel: "Rank", fieldType: EntityFieldType.TEXT },
          { fieldKey: "domain", fieldLabel: "Domain", fieldType: EntityFieldType.TEXT },
          { fieldKey: "grantedRights", fieldLabel: "Granted Rights", fieldType: EntityFieldType.TEXT }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Plane",
        description: "Planes of existence and cosmological realms.",
        isCore: true,
        fields: []
      },
      {
        name: "Continent",
        description: "Continents and major landmasses.",
        isCore: true,
        fields: []
      },
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
        name: "Dungeon",
        description: "Dungeons, lairs, and underground complexes.",
        fields: []
      },
      {
        name: "Area",
        description: "Notable areas within a region or settlement.",
        fields: []
      }
    ],
    locationRules: [
      { parent: "Plane", child: "Continent" },
      { parent: "Continent", child: "Country" },
      { parent: "Country", child: "Region" },
      { parent: "Region", child: "Settlement" },
      { parent: "Settlement", child: "District" },
      { parent: "District", child: "Building" },
      { parent: "Building", child: "Dungeon" },
      { parent: "District", child: "Area" }
    ],
    relationshipTemplates: [
      {
        name: "Membership",
        description: "A group or character belongs to a larger organization.",
        fromLabel: "has member",
        toLabel: "member of",
        roles: [
          { fromRole: "Organisation", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Character" }
        ]
      },
      {
        name: "Enemy",
        description: "Two parties are in conflict.",
        isPeerable: true,
        fromLabel: "enemy of",
        toLabel: "enemy of",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Organisation", toRole: "Organisation" },
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Character" }
        ]
      },
      {
        name: "Ally",
        description: "Two parties are allied.",
        isPeerable: true,
        fromLabel: "ally of",
        toLabel: "ally of",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Organisation", toRole: "Organisation" },
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Character" }
        ]
      },
      {
        name: "Sibling",
        description: "Characters who share family ties.",
        isPeerable: true,
        fromLabel: "sibling of",
        toLabel: "sibling of",
        roles: [{ fromRole: "Character", toRole: "Character" }]
      },
      {
        name: "Parent",
        description: "A parental relationship between characters.",
        fromLabel: "parent of",
        toLabel: "child of",
        roles: [{ fromRole: "Character", toRole: "Character" }]
      },
      {
        name: "Spouse",
        description: "A spousal bond between characters.",
        isPeerable: true,
        fromLabel: "spouse of",
        toLabel: "spouse of",
        roles: [{ fromRole: "Character", toRole: "Character" }]
      },
      {
        name: "Coveting",
        description: "Someone covets an object or treasure.",
        fromLabel: "covets",
        toLabel: "coveted by",
        roles: [
          { fromRole: "Character", toRole: "Objects" },
          { fromRole: "Organisation", toRole: "Objects" }
        ]
      },
      {
        name: "Possession",
        description: "Ownership or possession of an object.",
        fromLabel: "owns",
        toLabel: "owned by",
        roles: [
          { fromRole: "Character", toRole: "Objects" },
          { fromRole: "Organisation", toRole: "Objects" }
        ]
      },
      {
        name: "Title Holding",
        description: "A character holds an honorific or position.",
        fromLabel: "holds title",
        toLabel: "held by",
        roles: [{ fromRole: "Character", toRole: "Title" }]
      },
      {
        name: "Employment",
        description: "An employer employs a character.",
        fromLabel: "employs",
        toLabel: "employed by",
        roles: [
          { fromRole: "Organisation", toRole: "Character" },
          { fromRole: "Character", toRole: "Character" }
        ]
      },
      {
        name: "Rule",
        description: "A character or organization rules a settlement or region.",
        fromLabel: "rules",
        toLabel: "ruled by",
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
        name: "Race",
        description: "Species, cultures, or peoples.",
        category: "people",
        fields: [
          { fieldKey: "homeworldLocationId", fieldLabel: "Homeworld", fieldType: EntityFieldType.LOCATION_REFERENCE },
          { fieldKey: "ideology", fieldLabel: "Ideology", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Starship",
        description: "Ships and vessels that travel between worlds.",
        category: "technology",
        fields: [
          { fieldKey: "shipClass", fieldLabel: "Class", fieldType: EntityFieldType.CHOICE, choiceListKey: "ship_class" },
          { fieldKey: "shipType", fieldLabel: "Type", fieldType: EntityFieldType.CHOICE, choiceListKey: "ship_type" },
          { fieldKey: "captainId", fieldLabel: "Captain", fieldType: EntityFieldType.ENTITY_REFERENCE }
        ]
      }
    ],
    locationTemplates: [
      {
        name: "Sector",
        description: "Large regions of space.",
        isCore: true,
        fields: [
          { fieldKey: "hazardLevel", fieldLabel: "Hazard Level", fieldType: LocationFieldType.CHOICE, choiceListKey: "hazard_level" }
        ]
      },
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
        name: "Moon",
        description: "Moons and satellites.",
        fields: [
          { fieldKey: "locationStatus", fieldLabel: "Status", fieldType: LocationFieldType.CHOICE, choiceListKey: "location_status" }
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
      }
    ],
    locationRules: [
      { parent: "Sector", child: "Star System" },
      { parent: "Star System", child: "Planet" },
      { parent: "Planet", child: "Moon" },
      { parent: "Moon", child: "Settlement" },
      { parent: "Moon", child: "Station" },
      { parent: "Moon", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Membership",
        description: "An institution or organisation claims members.",
        fromLabel: "has member",
        toLabel: "member of",
        roles: [
          { fromRole: "Institution", toRole: "Character" },
          { fromRole: "Organisation", toRole: "Character" }
        ]
      },
      {
        name: "Oversight",
        description: "An institution oversees an organization or facility.",
        fromLabel: "oversees",
        toLabel: "overseen by",
        roles: [
          { fromRole: "Institution", toRole: "Organisation" },
          { fromRole: "Institution", toRole: "Facility" }
        ]
      },
      {
        name: "Affiliation",
        description: "Two parties maintain a cooperative relationship.",
        isPeerable: true,
        fromLabel: "affiliated with",
        toLabel: "affiliated with",
        roles: [
          { fromRole: "Character", toRole: "Organisation" },
          { fromRole: "Organisation", toRole: "Organisation" }
        ]
      },
      {
        name: "Assignment",
        description: "An organization or facility assigns a character.",
        fromLabel: "assigns",
        toLabel: "assigned to",
        roles: [
          { fromRole: "Organisation", toRole: "Character" },
          { fromRole: "Facility", toRole: "Character" }
        ]
      },
      {
        name: "Crew Member",
        description: "A character serves on a ship.",
        fromLabel: "crew member of",
        toLabel: "has crew member",
        roles: [
          { fromRole: "Character", toRole: "Starship" }
        ]
      },
      {
        name: "Service",
        description: "A starship serves an institution or organisation.",
        fromLabel: "serves",
        toLabel: "served by",
        roles: [
          { fromRole: "Starship", toRole: "Institution" },
          { fromRole: "Starship", toRole: "Organisation" }
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
          { fieldKey: "skills", fieldLabel: "Skills", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Faction",
        description: "Power blocs, syndicates, or ideologies.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "objectives", fieldLabel: "Objectives", fieldType: EntityFieldType.TEXT }
        ]
      },
      {
        name: "Starship",
        description: "Ships and vessels that travel between worlds.",
        category: "technology",
        fields: [
          { fieldKey: "shipClass", fieldLabel: "Class", fieldType: EntityFieldType.CHOICE, choiceListKey: "ship_class" },
          { fieldKey: "shipType", fieldLabel: "Type", fieldType: EntityFieldType.CHOICE, choiceListKey: "ship_type" },
          { fieldKey: "captainId", fieldLabel: "Captain", fieldType: EntityFieldType.ENTITY_REFERENCE }
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
        isCore: true,
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
      }
    ],
    locationRules: [
      { parent: "Sector", child: "Star System" },
      { parent: "Star System", child: "Planet" },
      { parent: "Planet", child: "Moon" },
      { parent: "Moon", child: "Settlement" },
      { parent: "Moon", child: "Station" },
      { parent: "Moon", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Membership",
        description: "A faction claims members.",
        fromLabel: "has member",
        toLabel: "member of",
        roles: [
          { fromRole: "Faction", toRole: "Character" }
        ]
      },
      {
        name: "Enemy",
        description: "Two parties are in conflict.",
        isPeerable: true,
        fromLabel: "enemy of",
        toLabel: "enemy of",
        roles: [
          { fromRole: "Faction", toRole: "Faction" },
          { fromRole: "Character", toRole: "Character" }
        ]
      },
      {
        name: "Ally",
        description: "Two parties are allied.",
        isPeerable: true,
        fromLabel: "ally of",
        toLabel: "ally of",
        roles: [
          { fromRole: "Faction", toRole: "Faction" },
          { fromRole: "Character", toRole: "Character" }
        ]
      },
      {
        name: "Crew Member",
        description: "A character serves on a ship.",
        fromLabel: "crew member of",
        toLabel: "has crew member",
        roles: [
          { fromRole: "Character", toRole: "Starship" }
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
          { fieldKey: "crew", fieldLabel: "Crew", fieldType: EntityFieldType.ENTITY_REFERENCE }
        ]
      },
      {
        name: "Crew",
        description: "Teams and crews that operate together.",
        category: "society",
        fields: [
          { fieldKey: "crewType", fieldLabel: "Crew Type", fieldType: EntityFieldType.CHOICE, choiceListKey: "crew_type" }
        ]
      },
      {
        name: "Corporation",
        description: "Megacorps and major corporate forces.",
        category: "society",
        isCore: true,
        fields: [
          { fieldKey: "industrySector", fieldLabel: "Industry Sector", fieldType: EntityFieldType.CHOICE, choiceListKey: "industry_sector" },
          { fieldKey: "leaderId", fieldLabel: "Leader", fieldType: EntityFieldType.ENTITY_REFERENCE }
        ]
      },
      {
        name: "Gang",
        description: "Street crews and underground groups.",
        category: "society",
        fields: [
          { fieldKey: "homeTerritory", fieldLabel: "Home Territory", fieldType: EntityFieldType.LOCATION_REFERENCE },
          { fieldKey: "objectives", fieldLabel: "Objectives", fieldType: EntityFieldType.TEXT },
          { fieldKey: "turf", fieldLabel: "Turf", fieldType: EntityFieldType.TEXT },
          { fieldKey: "specialty", fieldLabel: "Specialty", fieldType: EntityFieldType.TEXT }
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
          { fieldKey: "districtType", fieldLabel: "District Type", fieldType: LocationFieldType.CHOICE, choiceListKey: "district_type" }
        ]
      },
      {
        name: "Area",
        description: "Neighborhood areas and sub-districts.",
        fields: []
      },
      {
        name: "Building",
        description: "Skyscrapers, apartments, and compounds.",
        fields: [
          { fieldKey: "purpose", fieldLabel: "Purpose", fieldType: LocationFieldType.CHOICE, choiceListKey: "building_purpose" }
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
      { parent: "District", child: "Area" },
      { parent: "Area", child: "Building" },
      { parent: "Area", child: "Facility" }
    ],
    relationshipTemplates: [
      {
        name: "Employment",
        description: "A corporation employs a character.",
        fromLabel: "employs",
        toLabel: "employed by",
        roles: [
          { fromRole: "Corporation", toRole: "Character" }
        ]
      },
      {
        name: "Membership",
        description: "A gang claims members.",
        fromLabel: "has member",
        toLabel: "member of",
        roles: [
          { fromRole: "Gang", toRole: "Character" }
        ]
      },
      {
        name: "Rival",
        description: "Two parties are rivals.",
        isPeerable: true,
        fromLabel: "rival of",
        toLabel: "rival of",
        roles: [
          { fromRole: "Corporation", toRole: "Corporation" },
          { fromRole: "Gang", toRole: "Gang" }
        ]
      },
      {
        name: "Ally",
        description: "Two parties are allied.",
        isPeerable: true,
        fromLabel: "ally of",
        toLabel: "ally of",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Gang", toRole: "Gang" },
          { fromRole: "Corporation", toRole: "Corporation" }
        ]
      },
      {
        name: "Control",
        description: "A party controls another party.",
        fromLabel: "controls",
        toLabel: "controlled by",
        roles: [
          { fromRole: "Character", toRole: "Character" },
          { fromRole: "Character", toRole: "Gang" },
          { fromRole: "Character", toRole: "Corporation" },
          { fromRole: "Gang", toRole: "Character" },
          { fromRole: "Gang", toRole: "Gang" },
          { fromRole: "Gang", toRole: "Corporation" },
          { fromRole: "Corporation", toRole: "Character" },
          { fromRole: "Corporation", toRole: "Gang" },
          { fromRole: "Corporation", toRole: "Corporation" }
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
          { fieldKey: "occupation", fieldLabel: "Occupation", fieldType: EntityFieldType.TEXT }
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
          { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER }
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
        name: "Employment",
        description: "An organization employs a person.",
        fromLabel: "employs",
        toLabel: "employed by",
        roles: [
          { fromRole: "Organisation", toRole: "Person" }
        ]
      },
      {
        name: "Reporting",
        description: "A person reports to another.",
        fromLabel: "reports to",
        toLabel: "manages",
        roles: [
          { fromRole: "Person", toRole: "Person" }
        ]
      },
      {
        name: "Colleague",
        description: "Two people work together.",
        isPeerable: true,
        fromLabel: "colleague of",
        toLabel: "colleague of",
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
        fields: []
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
        fields: []
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
