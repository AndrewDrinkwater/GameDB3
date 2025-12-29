import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Role,
  EntityFieldType,
  EntityAccessScope,
  EntityAccessType,
  LocationFieldType,
  LocationStatus,
  RelationshipStatus,
  WorldEntityPermissionScope
} from "@prisma/client";

const prisma = new PrismaClient();

type EntityFieldSeed = {
  fieldKey: string;
  label: string;
  fieldType: EntityFieldType;
  required?: boolean;
  referenceEntityTypeId?: string;
  choices?: Array<{ value: string; label: string; sortOrder?: number }>;
};

type LocationFieldSeed = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: LocationFieldType;
  required?: boolean;
  choices?: Array<{ value: string; label: string; sortOrder?: number }>;
};

const createUser = async (email: string, name: string, role: Role, passwordHash: string) =>
  prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash }
  });

const createEntityType = async (
  worldId: string,
  createdById: string,
  name: string,
  fields: EntityFieldSeed[]
) => {
  const entityType = await prisma.entityType.create({
    data: { worldId, name, createdById }
  });
  const fieldMap = new Map<string, string>();
  for (const field of fields) {
    const created = await prisma.entityField.create({
      data: {
        entityTypeId: entityType.id,
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        required: Boolean(field.required),
        referenceEntityTypeId: field.referenceEntityTypeId ?? null
      }
    });
    fieldMap.set(field.fieldKey, created.id);
    if (field.choices && field.choices.length > 0) {
      await prisma.entityFieldChoice.createMany({
        data: field.choices.map((choice) => ({
          entityFieldId: created.id,
          value: choice.value,
          label: choice.label,
          sortOrder: choice.sortOrder ?? null
        }))
      });
    }
  }
  return { entityType, fieldMap };
};

const createLocationType = async (
  worldId: string,
  name: string,
  fields: LocationFieldSeed[]
) => {
  const locationType = await prisma.locationType.create({
    data: { worldId, name }
  });
  const fieldMap = new Map<string, string>();
  for (const field of fields) {
    const created = await prisma.locationTypeField.create({
      data: {
        locationTypeId: locationType.id,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        required: Boolean(field.required)
      }
    });
    fieldMap.set(field.fieldKey, created.id);
    if (field.choices && field.choices.length > 0) {
      await prisma.locationTypeFieldChoice.createMany({
        data: field.choices.map((choice) => ({
          locationTypeFieldId: created.id,
          value: choice.value,
          label: choice.label,
          sortOrder: choice.sortOrder ?? null
        }))
      });
    }
  }
  return { locationType, fieldMap };
};

const createLocationAccess = async (
  locationId: string,
  scopeType: EntityAccessScope,
  scopeId?: string | null
) => {
  await prisma.locationAccess.create({
    data: {
      locationId,
      accessType: EntityAccessType.READ,
      scopeType,
      scopeId: scopeId ?? null
    }
  });
};

const createEntityAccess = async (
  entityId: string,
  scopeType: EntityAccessScope,
  scopeId?: string | null
) => {
  await prisma.entityAccess.create({
    data: {
      entityId,
      accessType: EntityAccessType.READ,
      scopeType,
      scopeId: scopeId ?? null
    }
  });
};

async function main() {
  const userPassword = await bcrypt.hash("User123!", 10);

  const dmUser = await createUser("dm@example.com", "Morgan Vale", Role.USER, userPassword);
  const playerUser = await createUser("player@example.com", "Rin Holt", Role.USER, userPassword);
  const lena = await createUser("lena@example.com", "Lena Pike", Role.USER, userPassword);
  const rook = await createUser("rook@example.com", "Rook Asher", Role.USER, userPassword);
  const mara = await createUser("mara@example.com", "Mara Venn", Role.USER, userPassword);
  const jules = await createUser("jules@example.com", "Jules Kade", Role.USER, userPassword);

  const otherGm = await createUser(
    "nova@example.com",
    "Nova Reyes",
    Role.USER,
    userPassword
  );
  const tess = await createUser("tess@example.com", "Tess Arin", Role.USER, userPassword);
  const orr = await createUser("orr@example.com", "Orr Dane", Role.USER, userPassword);

  const worldA = await prisma.world.create({
    data: {
      name: "Elderreach",
      description: "A bruised continent of ember seas and floating keeps.",
      primaryArchitectId: dmUser.id,
      dmLabelKey: "dungeon_master",
      themeKey: "fantasy",
      entityPermissionScope: WorldEntityPermissionScope.ARCHITECT_GM_PLAYER
    }
  });

  const worldB = await prisma.world.create({
    data: {
      name: "Stormweft",
      description: "A wind-lashed archipelago bound to ancient currents.",
      primaryArchitectId: dmUser.id,
      dmLabelKey: "game_master",
      themeKey: "fantasy",
      entityPermissionScope: WorldEntityPermissionScope.ARCHITECT_GM
    }
  });

  const worldC = await prisma.world.create({
    data: {
      name: "Obsidian Drift",
      description: "Deep-space enclaves orbiting a dying star.",
      primaryArchitectId: otherGm.id,
      dmLabelKey: "game_master",
      themeKey: "sci_fi",
      entityPermissionScope: WorldEntityPermissionScope.ARCHITECT_GM_PLAYER
    }
  });

  const privateWorld = await prisma.world.create({
    data: {
      name: "Quiet Ledger",
      description: "A private notebook world for solo story work.",
      primaryArchitectId: playerUser.id,
      dmLabelKey: "game_master",
      themeKey: "reality",
      entityPermissionScope: WorldEntityPermissionScope.ARCHITECT
    }
  });

  await prisma.worldArchitect.createMany({
    data: [
      { worldId: worldA.id, userId: dmUser.id },
      { worldId: worldB.id, userId: dmUser.id },
      { worldId: worldC.id, userId: otherGm.id },
      { worldId: privateWorld.id, userId: playerUser.id }
    ],
    skipDuplicates: true
  });

  await prisma.worldGameMaster.createMany({
    data: [
      { worldId: worldA.id, userId: dmUser.id },
      { worldId: worldA.id, userId: playerUser.id },
      { worldId: worldB.id, userId: dmUser.id },
      { worldId: worldC.id, userId: otherGm.id }
    ],
    skipDuplicates: true
  });

  const ashfall = await prisma.campaign.create({
    data: {
      name: "Ashfall Pact",
      description: "A desperate treaty forged in the smoke of war.",
      worldId: worldA.id,
      ownerId: dmUser.id,
      gmUserId: dmUser.id,
      createdById: dmUser.id
    }
  });

  const silverTide = await prisma.campaign.create({
    data: {
      name: "Silver Tide",
      description: "A coastal campaign chasing a vanished fleet.",
      worldId: worldA.id,
      ownerId: dmUser.id,
      gmUserId: dmUser.id,
      createdById: dmUser.id
    }
  });

  const glassRoads = await prisma.campaign.create({
    data: {
      name: "Glass Roads",
      description: "A caravan of mirrors carving routes through the dunes.",
      worldId: worldA.id,
      ownerId: playerUser.id,
      gmUserId: playerUser.id,
      createdById: playerUser.id
    }
  });

  const frostline = await prisma.campaign.create({
    data: {
      name: "Frostline",
      description: "Guardians of the storm gate.",
      worldId: worldB.id,
      ownerId: dmUser.id,
      gmUserId: dmUser.id,
      createdById: dmUser.id
    }
  });

  const voidwake = await prisma.campaign.create({
    data: {
      name: "Voidwake",
      description: "A salvage crew hunting the last starship.",
      worldId: worldC.id,
      ownerId: otherGm.id,
      gmUserId: otherGm.id,
      createdById: otherGm.id
    }
  });

  await prisma.$transaction([
    prisma.session.create({
      data: {
        worldId: worldA.id,
        campaignId: ashfall.id,
        title: "Ashfall Pact - Session 1",
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14)
      }
    }),
    prisma.session.create({
      data: {
        worldId: worldA.id,
        campaignId: ashfall.id,
        title: "Ashfall Pact - Session 2",
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
      }
    }),
    prisma.session.create({
      data: {
        worldId: worldA.id,
        campaignId: glassRoads.id,
        title: "Glass Roads - Opening Run",
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3)
      }
    })
  ]);

  await prisma.session.create({
    data: {
      worldId: worldB.id,
      campaignId: frostline.id,
      title: "Frostline - Session 1",
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)
    }
  });

  await prisma.session.create({
    data: {
      worldId: worldC.id,
      campaignId: voidwake.id,
      title: "Voidwake - Salvage Briefing",
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2)
    }
  });

  const vale = await prisma.character.create({
    data: {
      name: "Vale",
      description: "A cartographer with an unbreakable compass.",
      playerId: playerUser.id,
      worldId: worldA.id,
      statusKey: "alive"
    }
  });
  const skye = await prisma.character.create({
    data: {
      name: "Skye",
      description: "An echo-blooded duelist.",
      playerId: lena.id,
      worldId: worldA.id,
      statusKey: "alive"
    }
  });
  const thorn = await prisma.character.create({
    data: {
      name: "Thorn",
      description: "A cursed scout from the ember wastes.",
      playerId: rook.id,
      worldId: worldA.id,
      statusKey: "alive"
    }
  });
  const sable = await prisma.character.create({
    data: {
      name: "Sable",
      description: "A smuggler who knows every hidden road.",
      playerId: mara.id,
      worldId: worldA.id,
      statusKey: "alive"
    }
  });

  await prisma.characterCampaign.createMany({
    data: [
      { characterId: vale.id, campaignId: ashfall.id },
      { characterId: skye.id, campaignId: ashfall.id },
      { characterId: thorn.id, campaignId: ashfall.id },
      { characterId: vale.id, campaignId: silverTide.id },
      { characterId: sable.id, campaignId: silverTide.id },
      { characterId: vale.id, campaignId: glassRoads.id },
      { characterId: skye.id, campaignId: glassRoads.id },
      { characterId: sable.id, campaignId: glassRoads.id }
    ],
    skipDuplicates: true
  });

  const quill = await prisma.character.create({
    data: {
      name: "Quill",
      description: "An archivist guarding stormbound secrets.",
      playerId: playerUser.id,
      worldId: worldB.id,
      statusKey: "alive"
    }
  });
  const vesper = await prisma.character.create({
    data: {
      name: "Vesper",
      description: "A sky-sailor who reads currents by touch.",
      playerId: lena.id,
      worldId: worldB.id,
      statusKey: "alive"
    }
  });
  await prisma.characterCampaign.createMany({
    data: [
      { characterId: quill.id, campaignId: frostline.id },
      { characterId: vesper.id, campaignId: frostline.id }
    ],
    skipDuplicates: true
  });

  const nova = await prisma.character.create({
    data: {
      name: "Nova-9",
      description: "A pilot with a fragmentary memory core.",
      playerId: tess.id,
      worldId: worldC.id,
      statusKey: "alive"
    }
  });
  const bolt = await prisma.character.create({
    data: {
      name: "Bolt",
      description: "A mechanic who hears the ship whisper.",
      playerId: orr.id,
      worldId: worldC.id,
      statusKey: "alive"
    }
  });
  await prisma.characterCampaign.createMany({
    data: [
      { characterId: nova.id, campaignId: voidwake.id },
      { characterId: bolt.id, campaignId: voidwake.id }
    ],
    skipDuplicates: true
  });

  const { locationType: cityType, fieldMap: cityFields } = await createLocationType(
    worldA.id,
    "City",
    [
      { fieldKey: "population", fieldLabel: "Population", fieldType: LocationFieldType.NUMBER },
      {
        fieldKey: "region",
        fieldLabel: "Region",
        fieldType: LocationFieldType.CHOICE,
        choices: [
          { value: "coastal", label: "Coastal", sortOrder: 1 },
          { value: "inland", label: "Inland", sortOrder: 2 }
        ]
      },
      { fieldKey: "seatOfPower", fieldLabel: "Seat of Power", fieldType: LocationFieldType.BOOLEAN }
    ]
  );

  const { locationType: ruinType, fieldMap: ruinFields } = await createLocationType(
    worldA.id,
    "Ruins",
    [
      { fieldKey: "depth", fieldLabel: "Depth", fieldType: LocationFieldType.NUMBER },
      { fieldKey: "sealed", fieldLabel: "Sealed", fieldType: LocationFieldType.BOOLEAN }
    ]
  );

  const portSable = await prisma.location.create({
    data: {
      name: "Port Sable",
      worldId: worldA.id,
      locationTypeId: cityType.id,
      status: LocationStatus.ACTIVE,
      createdById: dmUser.id
    }
  });
  await prisma.locationFieldValue.createMany({
    data: [
      { locationId: portSable.id, fieldId: cityFields.get("population")!, valueNumber: 42000 },
      { locationId: portSable.id, fieldId: cityFields.get("region")!, valueString: "coastal" },
      { locationId: portSable.id, fieldId: cityFields.get("seatOfPower")!, valueBoolean: true }
    ]
  });
  await createLocationAccess(portSable.id, EntityAccessScope.GLOBAL);

  const crimsonVault = await prisma.location.create({
    data: {
      name: "Crimson Vault",
      worldId: worldA.id,
      locationTypeId: ruinType.id,
      status: LocationStatus.ACTIVE,
      createdById: dmUser.id
    }
  });
  await prisma.locationFieldValue.createMany({
    data: [
      { locationId: crimsonVault.id, fieldId: ruinFields.get("depth")!, valueNumber: 9 },
      { locationId: crimsonVault.id, fieldId: ruinFields.get("sealed")!, valueBoolean: false }
    ]
  });
  await createLocationAccess(crimsonVault.id, EntityAccessScope.CAMPAIGN, ashfall.id);

  const { locationType: sanctumType, fieldMap: sanctumFields } = await createLocationType(
    worldB.id,
    "Sanctum",
    [
      { fieldKey: "warded", fieldLabel: "Warded", fieldType: LocationFieldType.BOOLEAN },
      { fieldKey: "sigil", fieldLabel: "Sigil", fieldType: LocationFieldType.TEXT }
    ]
  );

  const frostkeep = await prisma.location.create({
    data: {
      name: "Frostkeep",
      worldId: worldB.id,
      locationTypeId: sanctumType.id,
      status: LocationStatus.ACTIVE,
      createdById: dmUser.id
    }
  });
  await prisma.locationFieldValue.createMany({
    data: [
      { locationId: frostkeep.id, fieldId: sanctumFields.get("warded")!, valueBoolean: true },
      { locationId: frostkeep.id, fieldId: sanctumFields.get("sigil")!, valueString: "Northwind" }
    ]
  });
  await createLocationAccess(frostkeep.id, EntityAccessScope.GLOBAL);

  const { locationType: starportType, fieldMap: starportFields } = await createLocationType(
    worldC.id,
    "Starport",
    [
      { fieldKey: "dockCount", fieldLabel: "Dock Count", fieldType: LocationFieldType.NUMBER },
      { fieldKey: "ownedBy", fieldLabel: "Owned By", fieldType: LocationFieldType.TEXT }
    ]
  );

  const driftPort = await prisma.location.create({
    data: {
      name: "Driftport K-9",
      worldId: worldC.id,
      locationTypeId: starportType.id,
      status: LocationStatus.ACTIVE,
      createdById: otherGm.id
    }
  });
  await prisma.locationFieldValue.createMany({
    data: [
      { locationId: driftPort.id, fieldId: starportFields.get("dockCount")!, valueNumber: 12 },
      { locationId: driftPort.id, fieldId: starportFields.get("ownedBy")!, valueString: "Kestrel Union" }
    ]
  });
  await createLocationAccess(driftPort.id, EntityAccessScope.GLOBAL);

  const { entityType: factionType, fieldMap: factionFields } = await createEntityType(
    worldA.id,
    dmUser.id,
    "Faction",
    [
      { fieldKey: "motto", label: "Motto", fieldType: EntityFieldType.TEXT },
      {
        fieldKey: "tier",
        label: "Tier",
        fieldType: EntityFieldType.CHOICE,
        choices: [
          { value: "minor", label: "Minor", sortOrder: 1 },
          { value: "major", label: "Major", sortOrder: 2 }
        ]
      },
      {
        fieldKey: "baseLocation",
        label: "Base Location",
        fieldType: EntityFieldType.LOCATION_REFERENCE
      }
    ]
  );

  const { entityType: npcType, fieldMap: npcFields } = await createEntityType(
    worldA.id,
    dmUser.id,
    "NPC",
    [
      { fieldKey: "role", label: "Role", fieldType: EntityFieldType.TEXT },
      { fieldKey: "isWanted", label: "Wanted", fieldType: EntityFieldType.BOOLEAN },
      {
        fieldKey: "faction",
        label: "Faction",
        fieldType: EntityFieldType.ENTITY_REFERENCE,
        referenceEntityTypeId: factionType.id
      },
      { fieldKey: "notes", label: "Notes", fieldType: EntityFieldType.TEXTAREA }
    ]
  );

  const { entityType: artifactType, fieldMap: artifactFields } = await createEntityType(
    worldA.id,
    dmUser.id,
    "Artifact",
    [
      {
        fieldKey: "rarity",
        label: "Rarity",
        fieldType: EntityFieldType.CHOICE,
        choices: [
          { value: "rare", label: "Rare", sortOrder: 1 },
          { value: "legendary", label: "Legendary", sortOrder: 2 }
        ]
      },
      {
        fieldKey: "keeper",
        label: "Current Keeper",
        fieldType: EntityFieldType.ENTITY_REFERENCE,
        referenceEntityTypeId: npcType.id
      },
      { fieldKey: "origin", label: "Origin", fieldType: EntityFieldType.TEXTAREA }
    ]
  );

  const goldenRose = await prisma.entity.create({
    data: {
      name: "Golden Rose Agency",
      worldId: worldA.id,
      entityTypeId: factionType.id,
      currentLocationId: portSable.id,
      createdById: dmUser.id,
      description: "A diplomatic guild brokering peace through quiet leverage."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: goldenRose.id, fieldId: factionFields.get("motto")!, valueString: "Gold buys time." },
      { entityId: goldenRose.id, fieldId: factionFields.get("tier")!, valueString: "major" },
      {
        entityId: goldenRose.id,
        fieldId: factionFields.get("baseLocation")!,
        valueString: portSable.id
      }
    ]
  });
  await createEntityAccess(goldenRose.id, EntityAccessScope.GLOBAL);

  const ashenCourt = await prisma.entity.create({
    data: {
      name: "Ashen Court",
      worldId: worldA.id,
      entityTypeId: factionType.id,
      currentLocationId: portSable.id,
      createdById: dmUser.id,
      description: "A war council navigating uneasy truces."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: ashenCourt.id, fieldId: factionFields.get("motto")!, valueString: "We burn, we endure." },
      { entityId: ashenCourt.id, fieldId: factionFields.get("tier")!, valueString: "major" },
      {
        entityId: ashenCourt.id,
        fieldId: factionFields.get("baseLocation")!,
        valueString: portSable.id
      }
    ]
  });
  await createEntityAccess(ashenCourt.id, EntityAccessScope.GLOBAL);

  const captainWren = await prisma.entity.create({
    data: {
      name: "Captain Wren",
      worldId: worldA.id,
      entityTypeId: npcType.id,
      currentLocationId: portSable.id,
      createdById: dmUser.id,
      description: "A privateer with a long memory."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: captainWren.id, fieldId: npcFields.get("role")!, valueString: "Privateer" },
      { entityId: captainWren.id, fieldId: npcFields.get("isWanted")!, valueBoolean: true },
      {
        entityId: captainWren.id,
        fieldId: npcFields.get("faction")!,
        valueString: goldenRose.id
      },
      {
        entityId: captainWren.id,
        fieldId: npcFields.get("notes")!,
        valueText: "Rumored to be double-booked by rival courts."
      }
    ]
  });
  await createEntityAccess(captainWren.id, EntityAccessScope.GLOBAL);

  const aetherLens = await prisma.entity.create({
    data: {
      name: "Aether Lens",
      worldId: worldA.id,
      entityTypeId: artifactType.id,
      currentLocationId: crimsonVault.id,
      createdById: dmUser.id,
      description: "A relic that maps hidden ley lines."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: aetherLens.id, fieldId: artifactFields.get("rarity")!, valueString: "legendary" },
      {
        entityId: aetherLens.id,
        fieldId: artifactFields.get("keeper")!,
        valueString: captainWren.id
      },
      {
        entityId: aetherLens.id,
        fieldId: artifactFields.get("origin")!,
        valueText: "Recovered from the Crimson Vault during the Ashfall Pact."
      }
    ]
  });
  await createEntityAccess(aetherLens.id, EntityAccessScope.CHARACTER, vale.id);

  const { entityType: orderType, fieldMap: orderFields } = await createEntityType(
    worldB.id,
    dmUser.id,
    "Order",
    [
      { fieldKey: "tenet", label: "Tenet", fieldType: EntityFieldType.TEXTAREA },
      {
        fieldKey: "sanctum",
        label: "Sanctum",
        fieldType: EntityFieldType.LOCATION_REFERENCE
      }
    ]
  );

  const frostbound = await prisma.entity.create({
    data: {
      name: "Frostbound Circle",
      worldId: worldB.id,
      entityTypeId: orderType.id,
      currentLocationId: frostkeep.id,
      createdById: dmUser.id,
      description: "Wardens of the storm gate."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      {
        entityId: frostbound.id,
        fieldId: orderFields.get("tenet")!,
        valueText: "Protect the north wind at any cost."
      },
      {
        entityId: frostbound.id,
        fieldId: orderFields.get("sanctum")!,
        valueString: frostkeep.id
      }
    ]
  });
  await createEntityAccess(frostbound.id, EntityAccessScope.GLOBAL);

  const { entityType: crewType, fieldMap: crewFields } = await createEntityType(
    worldC.id,
    otherGm.id,
    "Crew",
    [
      { fieldKey: "shipName", label: "Ship Name", fieldType: EntityFieldType.TEXT },
      { fieldKey: "contract", label: "Contract", fieldType: EntityFieldType.TEXTAREA }
    ]
  );

  const voidwakeCrew = await prisma.entity.create({
    data: {
      name: "Voidwake Crew",
      worldId: worldC.id,
      entityTypeId: crewType.id,
      currentLocationId: driftPort.id,
      createdById: otherGm.id,
      description: "A salvage crew bound to a missing ship contract."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: voidwakeCrew.id, fieldId: crewFields.get("shipName")!, valueString: "Horizon Needle" },
      {
        entityId: voidwakeCrew.id,
        fieldId: crewFields.get("contract")!,
        valueText: "Recover the lost ship and return to Driftport."
      }
    ]
  });
  await createEntityAccess(voidwakeCrew.id, EntityAccessScope.GLOBAL);

  const alliedType = await prisma.relationshipType.create({
    data: {
      worldId: worldA.id,
      name: "Allied",
      description: "Two factions share intelligence and resources.",
      fromLabel: "Allied with",
      toLabel: "Allied with",
      pastFromLabel: "Allied with",
      pastToLabel: "Allied with",
      isPeerable: true
    }
  });
  await prisma.relationshipTypeRule.create({
    data: {
      relationshipTypeId: alliedType.id,
      fromEntityTypeId: factionType.id,
      toEntityTypeId: factionType.id
    }
  });

  const owesType = await prisma.relationshipType.create({
    data: {
      worldId: worldA.id,
      name: "Debt",
      description: "A favor owed that can be called in later.",
      fromLabel: "Owes",
      toLabel: "Is owed",
      pastFromLabel: "Owed",
      pastToLabel: "Was owed"
    }
  });
  await prisma.relationshipTypeRule.create({
    data: {
      relationshipTypeId: owesType.id,
      fromEntityTypeId: npcType.id,
      toEntityTypeId: factionType.id
    }
  });

  const custodyType = await prisma.relationshipType.create({
    data: {
      worldId: worldA.id,
      name: "Custody",
      description: "A secret keepsake held by a trusted NPC.",
      fromLabel: "Holds",
      toLabel: "Held by",
      pastFromLabel: "Held",
      pastToLabel: "Was held"
    }
  });
  await prisma.relationshipTypeRule.create({
    data: {
      relationshipTypeId: custodyType.id,
      fromEntityTypeId: npcType.id,
      toEntityTypeId: artifactType.id
    }
  });

  await prisma.relationship.create({
    data: {
      worldId: worldA.id,
      relationshipTypeId: alliedType.id,
      fromEntityId: goldenRose.id,
      toEntityId: ashenCourt.id,
      status: RelationshipStatus.ACTIVE,
      visibilityScope: EntityAccessScope.GLOBAL,
      createdById: dmUser.id
    }
  });

  await prisma.relationship.create({
    data: {
      worldId: worldA.id,
      relationshipTypeId: owesType.id,
      fromEntityId: captainWren.id,
      toEntityId: ashenCourt.id,
      status: RelationshipStatus.ACTIVE,
      visibilityScope: EntityAccessScope.CAMPAIGN,
      visibilityRefId: ashfall.id,
      createdById: dmUser.id
    }
  });

  await prisma.relationship.create({
    data: {
      worldId: worldA.id,
      relationshipTypeId: custodyType.id,
      fromEntityId: captainWren.id,
      toEntityId: aetherLens.id,
      status: RelationshipStatus.EXPIRED,
      visibilityScope: EntityAccessScope.CHARACTER,
      visibilityRefId: vale.id,
      createdById: dmUser.id,
      expiredAt: new Date()
    }
  });

  const contractType = await prisma.relationshipType.create({
    data: {
      worldId: worldC.id,
      name: "Contract",
      description: "A binding salvage contract.",
      fromLabel: "Bound to",
      toLabel: "Held by",
      pastFromLabel: "Was bound to",
      pastToLabel: "Was held by"
    }
  });
  await prisma.relationshipTypeRule.create({
    data: {
      relationshipTypeId: contractType.id,
      fromEntityTypeId: crewType.id,
      toEntityTypeId: crewType.id
    }
  });

  const rivalType = await prisma.relationshipType.create({
    data: {
      worldId: worldC.id,
      name: "Rival",
      description: "An ongoing rivalry between crews.",
      fromLabel: "Rivals",
      toLabel: "Rivals",
      pastFromLabel: "Rivals",
      pastToLabel: "Rivals",
      isPeerable: true
    }
  });
  await prisma.relationshipTypeRule.create({
    data: {
      relationshipTypeId: rivalType.id,
      fromEntityTypeId: crewType.id,
      toEntityTypeId: crewType.id
    }
  });

  const shadowCrew = await prisma.entity.create({
    data: {
      name: "Shadow Drift",
      worldId: worldC.id,
      entityTypeId: crewType.id,
      currentLocationId: driftPort.id,
      createdById: otherGm.id,
      description: "A competitor crew with their own claim."
    }
  });
  await prisma.entityFieldValue.createMany({
    data: [
      { entityId: shadowCrew.id, fieldId: crewFields.get("shipName")!, valueString: "Nightglass" },
      {
        entityId: shadowCrew.id,
        fieldId: crewFields.get("contract")!,
        valueText: "Recover the ship before Voidwake reaches it."
      }
    ]
  });
  await createEntityAccess(shadowCrew.id, EntityAccessScope.GLOBAL);

  await prisma.relationship.create({
    data: {
      worldId: worldC.id,
      relationshipTypeId: contractType.id,
      fromEntityId: voidwakeCrew.id,
      toEntityId: shadowCrew.id,
      status: RelationshipStatus.ACTIVE,
      visibilityScope: EntityAccessScope.CAMPAIGN,
      visibilityRefId: voidwake.id,
      createdById: otherGm.id
    }
  });

  await prisma.relationship.create({
    data: {
      worldId: worldC.id,
      relationshipTypeId: rivalType.id,
      fromEntityId: voidwakeCrew.id,
      toEntityId: shadowCrew.id,
      status: RelationshipStatus.ACTIVE,
      visibilityScope: EntityAccessScope.GLOBAL,
      createdById: otherGm.id
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
