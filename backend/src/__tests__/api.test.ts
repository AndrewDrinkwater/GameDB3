import request from "supertest";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { app } from "../index";

type TestContext = {
  token: string;
  adminId: string;
  worldId: string;
  campaignId: string;
  characterId: string;
  architectId: string;
  architectToken: string;
  viewerId: string;
  viewerToken: string;
  outsiderId: string;
  outsiderToken: string;
  gmId: string;
  gmToken: string;
  gmCampaignId: string;
  viewerCharacterId: string;
  entityTypeId: string;
  entityFieldId: string;
  entityIdOne: string;
  entityIdTwo: string;
  noteEntityId: string;
  mentionTargetEntityId: string;
  mentionSourceGlobalEntityId: string;
  mentionSourceCharacterEntityId: string;
  mentionRestrictedTargetEntityId: string;
  personaEntityTypeId: string;
  personaEntityFieldId: string;
  personaChoiceId: string;
  locationTypeId: string;
  locationId: string;
};

const prisma = new PrismaClient();
const context: Partial<TestContext> = {};

const adminEmail = "admin@example.com";
const adminPassword = "Admin123!";

const ensureAdminUser = async () => {
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  return prisma.user.create({
    data: {
      email: adminEmail,
      name: "Admin User",
      role: Role.ADMIN,
      passwordHash
    }
  });
};

const ensureUser = async (email: string, name: string, password: string) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: {
      email,
      name,
      role: Role.USER,
      passwordHash
    }
  });
};

beforeAll(async () => {
  const admin = await ensureAdminUser();
  context.adminId = admin.id;

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: adminEmail, password: adminPassword });

  context.token = login.body.token;

  const world = await prisma.world.create({
    data: {
      name: `Test World ${Date.now()}`,
      description: "Test world",
      primaryArchitectId: admin.id
    }
  });
  context.worldId = world.id;

  const campaign = await prisma.campaign.create({
    data: {
      name: `Test Campaign ${Date.now()}`,
      description: "Test campaign",
      worldId: world.id,
      ownerId: admin.id,
      gmUserId: admin.id,
      createdById: admin.id
    }
  });
  context.campaignId = campaign.id;

  const character = await prisma.character.create({
    data: {
      name: `Test Character ${Date.now()}`,
      description: "Test character",
      worldId: world.id,
      playerId: admin.id
    }
  });
  context.characterId = character.id;

  await prisma.characterCampaign.upsert({
    where: {
      characterId_campaignId: {
        characterId: character.id,
        campaignId: campaign.id
      }
    },
    update: {},
    create: {
      characterId: character.id,
      campaignId: campaign.id,
      status: "ACTIVE"
    }
  });

  const architectUser = await ensureUser("architect@example.com", "World Architect", "Architect123!");
  context.architectId = architectUser.id;
  await prisma.worldArchitect.upsert({
    where: { worldId_userId: { worldId: world.id, userId: architectUser.id } },
    update: {},
    create: { worldId: world.id, userId: architectUser.id }
  });

  const architectLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "architect@example.com", password: "Architect123!" });
  context.architectToken = architectLogin.body.token;

  const viewerUser = await ensureUser("viewer@example.com", "World Viewer", "Viewer123!");
  context.viewerId = viewerUser.id;
  const viewerLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "viewer@example.com", password: "Viewer123!" });
  context.viewerToken = viewerLogin.body.token;

  const outsiderUser = await ensureUser("outsider@example.com", "Outside User", "Outside123!");
  context.outsiderId = outsiderUser.id;
  const outsiderLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "outsider@example.com", password: "Outside123!" });
  context.outsiderToken = outsiderLogin.body.token;

  const gmUser = await ensureUser("gm@example.com", "World GM", "Gm123!");
  context.gmId = gmUser.id;
  await prisma.worldGameMaster.upsert({
    where: { worldId_userId: { worldId: world.id, userId: gmUser.id } },
    update: {},
    create: { worldId: world.id, userId: gmUser.id }
  });
  const gmLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "gm@example.com", password: "Gm123!" });
  context.gmToken = gmLogin.body.token;

  const entityType = await prisma.entityType.create({
    data: {
      worldId: world.id,
      name: "Test Entity Type",
      description: "Test type",
      createdById: admin.id
    }
  });
  context.entityTypeId = entityType.id;

  const entityField = await prisma.entityField.create({
    data: {
      entityTypeId: entityType.id,
      fieldKey: "test_field",
      label: "Test Field",
      fieldType: "TEXT",
      formOrder: 1,
      listOrder: 1
    }
  });
  context.entityFieldId = entityField.id;

  const locationType = await prisma.locationType.create({
    data: {
      worldId: world.id,
      name: "Test Location Type",
      description: "Test location type"
    }
  });
  context.locationTypeId = locationType.id;

  const location = await prisma.location.create({
    data: {
      worldId: world.id,
      locationTypeId: locationType.id,
      name: "Test Location",
      description: "Test location",
      createdById: admin.id
    }
  });
  context.locationId = location.id;
});

afterAll(async () => {
  if (context.entityFieldId) {
    await prisma.entityFieldChoice.deleteMany({
      where: { entityFieldId: context.entityFieldId }
    });
    await prisma.entityField.delete({ where: { id: context.entityFieldId } }).catch(() => undefined);
  }
  if (context.entityTypeId) {
    await prisma.entityType.delete({ where: { id: context.entityTypeId } }).catch(() => undefined);
  }
  if (context.campaignId && context.characterId) {
    await prisma.characterCampaign.deleteMany({
      where: { campaignId: context.campaignId, characterId: context.characterId }
    });
  }
  if (context.gmCampaignId) {
    await prisma.campaign.delete({ where: { id: context.gmCampaignId } }).catch(() => undefined);
  }
  if (context.viewerCharacterId) {
    await prisma.characterCampaign.deleteMany({
      where: { characterId: context.viewerCharacterId }
    });
    await prisma.character.delete({ where: { id: context.viewerCharacterId } }).catch(() => undefined);
  }
  const entityCleanupIds = [
    context.entityIdOne,
    context.entityIdTwo,
    context.noteEntityId,
    context.mentionTargetEntityId,
    context.mentionSourceGlobalEntityId,
    context.mentionSourceCharacterEntityId,
    context.mentionRestrictedTargetEntityId
  ].filter(Boolean) as string[];

  if (entityCleanupIds.length > 0) {
    await prisma.noteTag.deleteMany({
      where: { note: { entityId: { in: entityCleanupIds } } }
    });
    await prisma.note.deleteMany({ where: { entityId: { in: entityCleanupIds } } });
  }
  if (entityCleanupIds.length > 0) {
    await prisma.entityAccess.deleteMany({
      where: {
        entityId: {
          in: entityCleanupIds
        }
      }
    });
    await prisma.entityFieldValue.deleteMany({
      where: {
        entityId: {
          in: entityCleanupIds
        }
      }
    });
    await prisma.entity.deleteMany({
      where: {
        id: {
          in: entityCleanupIds
        }
      }
    });
  }
  if (context.personaChoiceId) {
    await prisma.entityFieldChoice.delete({ where: { id: context.personaChoiceId } }).catch(() => undefined);
  }
  if (context.personaEntityFieldId) {
    await prisma.entityField.delete({ where: { id: context.personaEntityFieldId } }).catch(() => undefined);
  }
  if (context.personaEntityTypeId) {
    await prisma.entityType.delete({ where: { id: context.personaEntityTypeId } }).catch(() => undefined);
  }

  if (context.locationId) {
    await prisma.locationAccess.deleteMany({ where: { locationId: context.locationId } });
    await prisma.locationFieldValue.deleteMany({ where: { locationId: context.locationId } });
    await prisma.location.delete({ where: { id: context.locationId } }).catch(() => undefined);
  }

  if (context.locationTypeId) {
    await prisma.locationTypeRule.deleteMany({
      where: {
        OR: [
          { parentTypeId: context.locationTypeId },
          { childTypeId: context.locationTypeId }
        ]
      }
    });
    await prisma.locationTypeFieldChoice.deleteMany({
      where: { field: { locationTypeId: context.locationTypeId } }
    });
    await prisma.locationTypeField.deleteMany({ where: { locationTypeId: context.locationTypeId } });
    await prisma.locationType.delete({ where: { id: context.locationTypeId } }).catch(() => undefined);
  }

  if (context.worldId && context.adminId) {
    await prisma.worldCharacterCreator.deleteMany({
      where: { worldId: context.worldId, userId: context.adminId }
    });
  }

  if (context.characterId) {
    await prisma.character.delete({ where: { id: context.characterId } }).catch(() => undefined);
  }
  if (context.campaignId) {
    await prisma.campaign.delete({ where: { id: context.campaignId } }).catch(() => undefined);
  }
  if (context.worldId) {
    await prisma.world.delete({ where: { id: context.worldId } }).catch(() => undefined);
  }

  await prisma.$disconnect();
});

describe("API health", () => {
  it("returns ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});

describe("Auth", () => {
  it("logs in a seeded admin user", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: adminEmail, password: adminPassword });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.role).toBe("ADMIN");
  });
});

describe("Related lists", () => {
  it("lists related lists for campaigns", async () => {
    const response = await request(app)
      .get("/api/related-lists?entityKey=campaigns")
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const keys = response.body.map((item: { key: string }) => item.key);
    expect(keys).toContain("campaign.characters");
  });

  it("adds and fetches related characters", async () => {
    const addResponse = await request(app)
      .post("/api/related-lists/campaign.characters")
      .set("Authorization", `Bearer ${context.token}`)
      .send({ parentId: context.campaignId, relatedId: context.characterId });

    expect(addResponse.status).toBe(201);

    const response = await request(app)
      .get(`/api/related-lists/campaign.characters?parentId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
  });

  it("adds world character creators", async () => {
    const addResponse = await request(app)
      .post("/api/related-lists/world.character_creators")
      .set("Authorization", `Bearer ${context.token}`)
      .send({ parentId: context.worldId, relatedId: context.adminId });

    expect(addResponse.status).toBe(201);

    const response = await request(app)
      .get(`/api/related-lists/world.character_creators?parentId=${context.worldId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { relatedId: string }) => item.relatedId);
    expect(ids).toContain(context.adminId);
  });
});

describe("Context filters", () => {
  it("returns campaignIds on character detail", async () => {
    const response = await request(app)
      .get(`/api/characters/${context.characterId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    expect(response.body.campaignIds).toContain(context.campaignId);
  });

  it("filters characters by campaign", async () => {
    const response = await request(app)
      .get(`/api/characters?campaignId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(context.characterId);
  });

  it("filters campaigns by character", async () => {
    const response = await request(app)
      .get(`/api/campaigns?characterId=${context.characterId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(context.campaignId);
  });

  it("shows campaigns where the user is a player", async () => {
    const viewerCharacter = await prisma.character.create({
      data: {
        name: `Viewer Character ${Date.now()}`,
        worldId: context.worldId as string,
        playerId: context.viewerId as string
      }
    });
    context.viewerCharacterId = viewerCharacter.id;

    await prisma.characterCampaign.upsert({
      where: {
        characterId_campaignId: {
          characterId: viewerCharacter.id,
          campaignId: context.campaignId as string
        }
      },
      update: {},
      create: {
        characterId: viewerCharacter.id,
        campaignId: context.campaignId as string,
        status: "ACTIVE"
      }
    });

    const response = await request(app)
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(context.campaignId);
  });

  it("filters character references by campaign", async () => {
    const response = await request(app)
      .get(`/api/references?entityKey=characters&campaignId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(context.characterId);
  });

    it("includes ownerLabel for character references when GM", async () => {
      const response = await request(app)
        .get(`/api/references?entityKey=characters&campaignId=${context.campaignId}`)
        .set("Authorization", `Bearer ${context.token}`);

      expect(response.status).toBe(200);
      const entry = response.body.find((item: { id: string }) => item.id === context.characterId);
      expect(entry.ownerLabel).toBeTruthy();
    });

    it("shows campaign GM all world characters when adding to a campaign", async () => {
      const gmCampaign = await prisma.campaign.create({
        data: {
          name: `GM Scope Campaign ${Date.now()}`,
          description: "GM scope test",
          worldId: context.worldId as string,
          ownerId: context.gmId as string,
          gmUserId: context.gmId as string,
          createdById: context.gmId as string
        }
      });

      const otherCharacter = await prisma.character.create({
        data: {
          name: `Other Character ${Date.now()}`,
          worldId: context.worldId as string,
          playerId: context.viewerId as string
        }
      });

      try {
        const response = await request(app)
          .get(`/api/references?entityKey=characters&campaignId=${gmCampaign.id}`)
          .set("Authorization", `Bearer ${context.gmToken}`);

        expect(response.status).toBe(200);
        const entry = response.body.find((item: { id: string }) => item.id === otherCharacter.id);
        expect(entry).toBeTruthy();
        expect(entry.ownerLabel).toBeTruthy();
      } finally {
        await prisma.campaign.delete({ where: { id: gmCampaign.id } }).catch(() => undefined);
        await prisma.character.delete({ where: { id: otherCharacter.id } }).catch(() => undefined);
      }
    });

    it("returns context summary roles", async () => {
      const response = await request(app)
        .get(
        `/api/context/summary?worldId=${context.worldId}&campaignId=${context.campaignId}&characterId=${context.characterId}`
      )
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    expect(response.body.worldRole).toBe("Architect");
    expect(response.body.campaignRole).toBe("GM");
    expect(response.body.characterOwnerLabel).toBeTruthy();
  });
});

describe("World admin access", () => {
  it("grants admin and architect access to world admin", async () => {
    const adminResponse = await request(app)
      .get(`/api/worlds/${context.worldId}/world-admin`)
      .set("Authorization", `Bearer ${context.token}`);

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.allowed).toBe(true);

    const architectResponse = await request(app)
      .get(`/api/worlds/${context.worldId}/world-admin`)
      .set("Authorization", `Bearer ${context.architectToken}`);

    expect(architectResponse.status).toBe(200);
    expect(architectResponse.body.allowed).toBe(true);
  });

  it("denies non-architect access to world admin", async () => {
    const response = await request(app)
      .get(`/api/worlds/${context.worldId}/world-admin`)
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.allowed).toBe(false);
  });

  it("allows architects to list entity types and fields by world", async () => {
    const typesResponse = await request(app)
      .get(`/api/entity-types?worldId=${context.worldId}`)
      .set("Authorization", `Bearer ${context.architectToken}`);

    expect(typesResponse.status).toBe(200);
    const typeIds = typesResponse.body.map((item: { id: string }) => item.id);
    expect(typeIds).toContain(context.entityTypeId);

    const fieldsResponse = await request(app)
      .get(`/api/entity-fields?worldId=${context.worldId}`)
      .set("Authorization", `Bearer ${context.architectToken}`);

    expect(fieldsResponse.status).toBe(200);
    const fieldIds = fieldsResponse.body.map((item: { id: string }) => item.id);
    expect(fieldIds).toContain(context.entityFieldId);
  });

  it("denies non-architect access to entity types and fields by world", async () => {
    const typesResponse = await request(app)
      .get(`/api/entity-types?worldId=${context.worldId}`)
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(typesResponse.status).toBe(403);

    const fieldsResponse = await request(app)
      .get(`/api/entity-fields?worldId=${context.worldId}`)
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(fieldsResponse.status).toBe(403);
  });

  it("hydrates entity views on demand", async () => {
    const response = await request(app)
      .get("/api/views/entity_types.list")
      .set("Authorization", `Bearer ${context.architectToken}`);

    expect(response.status).toBe(200);
    expect(response.body.key).toBe("entity_types.list");
  });
});

describe("Campaign creation permissions", () => {
  it("blocks non-GM users from creating campaigns", async () => {
    const response = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({ worldId: context.worldId, name: "Viewer Campaign" });

    expect(response.status).toBe(403);
  });

  it("allows world GMs to create campaigns", async () => {
    const response = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${context.gmToken}`)
      .send({ worldId: context.worldId, name: "GM Campaign", gmUserId: context.gmId });

    expect(response.status).toBe(201);
    context.gmCampaignId = response.body.id;
  });
});

describe("List view preferences", () => {
  it("saves and loads user list view preferences with filter groups", async () => {
    const payload = {
      columns: ["name", "description"],
      filters: {
        logic: "OR",
        rules: [{ fieldKey: "name", operator: "contains", value: "Test" }]
      }
    };

    const putResponse = await request(app)
      .put("/api/list-view-preferences?viewKey=entities.list")
      .set("Authorization", `Bearer ${context.token}`)
      .send(payload);

    expect(putResponse.status).toBe(200);

    const getResponse = await request(app)
      .get("/api/list-view-preferences?viewKey=entities.list")
      .set("Authorization", `Bearer ${context.token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.user.columnsJson).toEqual(payload.columns);
    expect(getResponse.body.user.filtersJson).toEqual(payload.filters);
  });

  it("stores entity type list defaults for admins", async () => {
    const payload = {
      columns: ["name"],
      filters: { logic: "AND", rules: [{ fieldKey: "name", operator: "contains", value: "NPC" }] }
    };

    const response = await request(app)
      .put(`/api/entity-type-list-defaults?entityTypeId=${context.entityTypeId}`)
      .set("Authorization", `Bearer ${context.token}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.entityTypeId).toBe(context.entityTypeId);
    expect(response.body.filtersJson).toEqual(payload.filters);
  });
});

describe("Entity list filters", () => {
  it("applies OR filter logic for entity list queries", async () => {
    const entityOne = await prisma.entity.create({
      data: {
        worldId: context.worldId as string,
        entityTypeId: context.entityTypeId as string,
        currentLocationId: context.locationId as string,
        name: "Goblin Scout",
        description: "Test entry one",
        createdById: context.adminId as string
      }
    });
    const entityTwo = await prisma.entity.create({
      data: {
        worldId: context.worldId as string,
        entityTypeId: context.entityTypeId as string,
        currentLocationId: context.locationId as string,
        name: "Forest Sprite",
        description: "Goblin ally",
        createdById: context.adminId as string
      }
    });
    context.entityIdOne = entityOne.id;
    context.entityIdTwo = entityTwo.id;

    const filters = {
      logic: "OR",
      rules: [
        { fieldKey: "name", operator: "contains", value: "Goblin" },
        { fieldKey: "description", operator: "contains", value: "Goblin" }
      ]
    };

    const response = await request(app)
      .get(
        `/api/entities?worldId=${context.worldId}&entityTypeId=${context.entityTypeId}&filters=${encodeURIComponent(
          JSON.stringify(filters)
        )}`
      )
      .set("Authorization", `Bearer ${context.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([entityOne.id, entityTwo.id]));
  });
});

describe("Entity type and field permissions", () => {
  const cleanupEntityType = async (entityTypeId: string) => {
    const fields = await prisma.entityField.findMany({
      where: { entityTypeId },
      select: { id: true }
    });
    const fieldIds = fields.map((field) => field.id);
    if (fieldIds.length > 0) {
      await prisma.entityFieldChoice.deleteMany({ where: { entityFieldId: { in: fieldIds } } });
      await prisma.entityFieldValue.deleteMany({ where: { fieldId: { in: fieldIds } } });
      await prisma.entityField.deleteMany({ where: { id: { in: fieldIds } } });
    }
    await prisma.entityFormSection.deleteMany({ where: { entityTypeId } });
    await prisma.entityType.delete({ where: { id: entityTypeId } });
  };

  beforeAll(async () => {
    if (context.personaEntityTypeId) return;
    const response = await request(app)
      .post("/api/entity-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId: context.worldId, name: "Architect Type" });

    if (response.status !== 201) {
      throw new Error(`Failed to create architect entity type: ${response.status}`);
    }
    context.personaEntityTypeId = response.body.id;
  });

  it("allows admins and architects to create entity types", async () => {
    const adminResponse = await request(app)
      .post("/api/entity-types")
      .set("Authorization", `Bearer ${context.token}`)
      .send({ worldId: context.worldId, name: "Admin Type" });

    expect(adminResponse.status).toBe(201);
    await cleanupEntityType(adminResponse.body.id);

    const architectResponse = await request(app)
      .post("/api/entity-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId: context.worldId, name: "Architect Type Second" });

    expect(architectResponse.status).toBe(201);
    await cleanupEntityType(architectResponse.body.id);
  });

  it("blocks viewers from creating entity types", async () => {
    const response = await request(app)
      .post("/api/entity-types")
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({ worldId: context.worldId, name: "Viewer Type" });

    expect(response.status).toBe(403);
  });

  it("allows architects to create fields and choices", async () => {
    const fieldResponse = await request(app)
      .post("/api/entity-fields")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({
        entityTypeId: context.personaEntityTypeId,
        fieldKey: "choice_field",
        label: "Choice Field",
        fieldType: "CHOICE"
      });

    expect(fieldResponse.status).toBe(201);
    context.personaEntityFieldId = fieldResponse.body.id;

    const choiceResponse = await request(app)
      .post("/api/entity-field-choices")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({
        entityFieldId: context.personaEntityFieldId,
        value: "alpha",
        label: "Alpha"
      });

    expect(choiceResponse.status).toBe(201);
    context.personaChoiceId = choiceResponse.body.id;
  });

  it("blocks viewers from creating fields and choices", async () => {
    const fieldResponse = await request(app)
      .post("/api/entity-fields")
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({
        entityTypeId: context.personaEntityTypeId,
        fieldKey: "viewer_field",
        label: "Viewer Field",
        fieldType: "TEXT"
      });

    expect(fieldResponse.status).toBe(403);

    const choiceResponse = await request(app)
      .post("/api/entity-field-choices")
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({
        entityFieldId: context.personaEntityFieldId,
        value: "viewer",
        label: "Viewer"
      });

    expect(choiceResponse.status).toBe(403);
  });
});

describe("Access visibility", () => {
  it("hides worlds from unrelated users", async () => {
    const response = await request(app)
      .get("/api/worlds")
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(context.worldId);
  });

  it("blocks unrelated users from campaign and character detail", async () => {
    const campaignResponse = await request(app)
      .get(`/api/campaigns/${context.campaignId}`)
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(campaignResponse.status).toBe(403);

    const characterResponse = await request(app)
      .get(`/api/characters/${context.characterId}`)
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(characterResponse.status).toBe(403);
  });
});

describe("Notes access", () => {
  let sharedNoteId: string;
  let gmPrivateNoteId: string;
  let playerPrivateNoteId: string;

  beforeAll(async () => {
    if (!context.viewerCharacterId) {
      const viewerCharacter = await prisma.character.create({
        data: {
          name: `Viewer Character ${Date.now()}`,
          worldId: context.worldId as string,
          playerId: context.viewerId as string
        }
      });
      context.viewerCharacterId = viewerCharacter.id;

      await prisma.characterCampaign.upsert({
        where: {
          characterId_campaignId: {
            characterId: viewerCharacter.id,
            campaignId: context.campaignId as string
          }
        },
        update: {},
        create: {
          characterId: viewerCharacter.id,
          campaignId: context.campaignId as string,
          status: "ACTIVE"
        }
      });
    }

    const entityResponse = await request(app)
      .post("/api/entities")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId: context.worldId,
        entityTypeId: context.entityTypeId,
        currentLocationId: context.locationId,
        name: `Notes Entity ${Date.now()}`,
        access: {
          read: { global: true },
          write: { global: true }
        }
      });

    expect(entityResponse.status).toBe(201);
    context.noteEntityId = entityResponse.body.id;

    const sharedResponse = await request(app)
      .post(`/api/entities/${context.noteEntityId}/notes`)
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        body: "Shared note for campaign",
        visibility: "SHARED",
        campaignId: context.campaignId
      });

    expect(sharedResponse.status).toBe(201);
    sharedNoteId = sharedResponse.body.id;

    const gmResponse = await request(app)
      .post(`/api/entities/${context.noteEntityId}/notes`)
      .set("Authorization", `Bearer ${context.gmToken}`)
      .send({
        body: "GM private note",
        visibility: "PRIVATE",
        campaignId: context.campaignId
      });

    expect(gmResponse.status).toBe(201);
    gmPrivateNoteId = gmResponse.body.id;

    const playerResponse = await request(app)
      .post(`/api/entities/${context.noteEntityId}/notes`)
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({
        body: "Player private note",
        visibility: "PRIVATE",
        campaignId: context.campaignId,
        characterId: context.viewerCharacterId
      });

    expect(playerResponse.status).toBe(201);
    playerPrivateNoteId = playerResponse.body.id;
  });

  it("requires campaign context for shared notes", async () => {
    const response = await request(app)
      .post(`/api/entities/${context.noteEntityId}/notes`)
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        body: "Shared note without campaign",
        visibility: "SHARED"
      });

    expect(response.status).toBe(400);
  });

  it("blocks players from authoring without character context", async () => {
    const response = await request(app)
      .post(`/api/entities/${context.noteEntityId}/notes`)
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({
        body: "Player note without character",
        visibility: "PRIVATE",
        campaignId: context.campaignId
      });

    expect(response.status).toBe(403);
  });

  it("returns shared notes to unrelated users but hides private notes", async () => {
    const response = await request(app)
      .get(`/api/entities/${context.noteEntityId}/notes?campaignId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(sharedNoteId);
    expect(ids).not.toContain(gmPrivateNoteId);
    expect(ids).not.toContain(playerPrivateNoteId);
  });

  it("shows campaign GMs all notes in that campaign", async () => {
    const response = await request(app)
      .get(`/api/entities/${context.noteEntityId}/notes?campaignId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.gmToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([sharedNoteId, gmPrivateNoteId, playerPrivateNoteId])
    );
  });

  it("shows players their own private notes in campaign context", async () => {
    const response = await request(app)
      .get(
        `/api/entities/${context.noteEntityId}/notes?campaignId=${context.campaignId}&characterId=${context.viewerCharacterId}`
      )
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(sharedNoteId);
    expect(ids).toContain(playerPrivateNoteId);
    expect(ids).not.toContain(gmPrivateNoteId);
  });
});

describe("Mentions access", () => {
  let mentionNoteGlobalId: string;
  let mentionNoteCharacterId: string;

  beforeAll(async () => {
    if (!context.viewerCharacterId) {
      const viewerCharacter = await prisma.character.create({
        data: {
          name: `Viewer Character ${Date.now()}`,
          worldId: context.worldId as string,
          playerId: context.viewerId as string
        }
      });
      context.viewerCharacterId = viewerCharacter.id;

      await prisma.characterCampaign.upsert({
        where: {
          characterId_campaignId: {
            characterId: viewerCharacter.id,
            campaignId: context.campaignId as string
          }
        },
        update: {},
        create: {
          characterId: viewerCharacter.id,
          campaignId: context.campaignId as string,
          status: "ACTIVE"
        }
      });
    }

    const targetResponse = await request(app)
      .post("/api/entities")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId: context.worldId,
        entityTypeId: context.entityTypeId,
        currentLocationId: context.locationId,
        name: `Mention Target ${Date.now()}`,
        access: {
          read: { global: true },
          write: { global: true }
        }
      });
    expect(targetResponse.status).toBe(201);
    context.mentionTargetEntityId = targetResponse.body.id;

    const sourceGlobalResponse = await request(app)
      .post("/api/entities")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId: context.worldId,
        entityTypeId: context.entityTypeId,
        currentLocationId: context.locationId,
        name: `Mention Source Global ${Date.now()}`,
        access: {
          read: { global: true },
          write: { global: true }
        }
      });
    expect(sourceGlobalResponse.status).toBe(201);
    context.mentionSourceGlobalEntityId = sourceGlobalResponse.body.id;

    const sourceCharacterResponse = await request(app)
      .post("/api/entities")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId: context.worldId,
        entityTypeId: context.entityTypeId,
        currentLocationId: context.locationId,
        name: `Mention Source Character ${Date.now()}`,
        access: {
          read: { characters: [context.viewerCharacterId] },
          write: { global: true }
        }
      });
    expect(sourceCharacterResponse.status).toBe(201);
    context.mentionSourceCharacterEntityId = sourceCharacterResponse.body.id;

    const restrictedTargetResponse = await request(app)
      .post("/api/entities")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId: context.worldId,
        entityTypeId: context.entityTypeId,
        currentLocationId: context.locationId,
        name: `Mention Target Restricted ${Date.now()}`,
        access: {
          read: { characters: [context.viewerCharacterId] },
          write: { global: true }
        }
      });
    expect(restrictedTargetResponse.status).toBe(201);
    context.mentionRestrictedTargetEntityId = restrictedTargetResponse.body.id;

    const globalMentionResponse = await request(app)
      .post(`/api/entities/${context.mentionSourceGlobalEntityId}/notes`)
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        body: `Global mention @[Target](entity:${context.mentionTargetEntityId})`,
        visibility: "SHARED",
        campaignId: context.campaignId
      });
    expect(globalMentionResponse.status).toBe(201);
    mentionNoteGlobalId = globalMentionResponse.body.id;

    const characterMentionResponse = await request(app)
      .post(`/api/entities/${context.mentionSourceCharacterEntityId}/notes`)
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        body: `Character mention @[Target](entity:${context.mentionTargetEntityId})`,
        visibility: "SHARED",
        campaignId: context.campaignId
      });
    expect(characterMentionResponse.status).toBe(201);
    mentionNoteCharacterId = characterMentionResponse.body.id;
  });

  it("returns mentions from accessible entities", async () => {
    const response = await request(app)
      .get(
        `/api/entities/${context.mentionTargetEntityId}/mentions?campaignId=${context.campaignId}&characterId=${context.viewerCharacterId}`
      )
      .set("Authorization", `Bearer ${context.viewerToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([mentionNoteGlobalId, mentionNoteCharacterId]));
  });

  it("hides mentions from character-scoped entities without character context", async () => {
    const response = await request(app)
      .get(`/api/entities/${context.mentionTargetEntityId}/mentions?campaignId=${context.campaignId}`)
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(response.status).toBe(200);
    const ids = response.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(mentionNoteGlobalId);
    expect(ids).not.toContain(mentionNoteCharacterId);
  });

  it("blocks mentions when the target entity is not readable", async () => {
    const response = await request(app)
      .get(
        `/api/entities/${context.mentionRestrictedTargetEntityId}/mentions?campaignId=${context.campaignId}`
      )
      .set("Authorization", `Bearer ${context.outsiderToken}`);

    expect(response.status).toBe(403);
  });
});

describe("Location types, fields, and rules", () => {
  const createdLocationIds: string[] = [];
  const createdLocationTypeIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdFieldIds: string[] = [];

  const trackLocationType = (id: string) => {
    createdLocationTypeIds.push(id);
    return id;
  };
  const trackLocation = (id: string) => {
    createdLocationIds.push(id);
    return id;
  };
  const trackRule = (id: string) => {
    createdRuleIds.push(id);
    return id;
  };
  const trackField = (id: string) => {
    createdFieldIds.push(id);
    return id;
  };

  afterAll(async () => {
    if (createdLocationIds.length > 0) {
      await prisma.locationAccess.deleteMany({
        where: { locationId: { in: createdLocationIds } }
      });
      await prisma.locationFieldValue.deleteMany({
        where: { locationId: { in: createdLocationIds } }
      });
      await prisma.location.deleteMany({
        where: { id: { in: createdLocationIds } }
      });
    }

    if (createdRuleIds.length > 0) {
      await prisma.locationTypeRule.deleteMany({
        where: { id: { in: createdRuleIds } }
      });
    }

    if (createdFieldIds.length > 0) {
      await prisma.locationTypeFieldChoice.deleteMany({
        where: { locationTypeFieldId: { in: createdFieldIds } }
      });
      await prisma.locationTypeField.deleteMany({
        where: { id: { in: createdFieldIds } }
      });
    }

    if (createdLocationTypeIds.length > 0) {
      await prisma.locationType.deleteMany({
        where: { id: { in: createdLocationTypeIds } }
      });
    }
  });

  it("allows architects to create location types and fields", async () => {
    const typeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({
        worldId: context.worldId,
        name: `Fielded Type ${Date.now()}`
      });

    expect(typeResponse.status).toBe(201);
    const locationTypeId = trackLocationType(typeResponse.body.id);

    const fieldResponse = await request(app)
      .post("/api/location-type-fields")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({
        locationTypeId,
        fieldKey: `field_${Date.now()}`,
        fieldLabel: "Detail",
        fieldType: "TEXT",
        listOrder: 1,
        formOrder: 1
      });

    expect(fieldResponse.status).toBe(201);
    trackField(fieldResponse.body.id);
  });

  it("blocks viewers from creating location types", async () => {
    const response = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.viewerToken}`)
      .send({
        worldId: context.worldId,
        name: `Viewer Location Type ${Date.now()}`
      });

    expect(response.status).toBe(403);
  });

  it("enforces location type rules for parent selection and deny overrides", async () => {
    const worldId = context.worldId as string;
    const parentTypeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId, name: `Region ${Date.now()}` });
    expect(parentTypeResponse.status).toBe(201);
    const parentTypeId = trackLocationType(parentTypeResponse.body.id);

    const midTypeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId, name: `City ${Date.now()}` });
    expect(midTypeResponse.status).toBe(201);
    const midTypeId = trackLocationType(midTypeResponse.body.id);

    const childTypeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId, name: `District ${Date.now()}` });
    expect(childTypeResponse.status).toBe(201);
    const childTypeId = trackLocationType(childTypeResponse.body.id);

    const ruleOne = await request(app)
      .post("/api/location-type-rules")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ parentTypeId, childTypeId: midTypeId, allowed: true });
    expect(ruleOne.status).toBe(201);
    trackRule(ruleOne.body.id);

    const ruleTwo = await request(app)
      .post("/api/location-type-rules")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ parentTypeId: midTypeId, childTypeId, allowed: true });
    expect(ruleTwo.status).toBe(201);
    trackRule(ruleTwo.body.id);

    const parentLocationResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: parentTypeId,
        name: `Region Location ${Date.now()}`
      });
    expect(parentLocationResponse.status).toBe(201);
    const parentLocationId = trackLocation(parentLocationResponse.body.id);

    const childAllowedResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: childTypeId,
        parentLocationId,
        name: `District Allowed ${Date.now()}`
      });
    expect(childAllowedResponse.status).toBe(201);
    trackLocation(childAllowedResponse.body.id);

    const denyRule = await request(app)
      .post("/api/location-type-rules")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ parentTypeId, childTypeId, allowed: false });
    expect(denyRule.status).toBe(201);
    trackRule(denyRule.body.id);

    const deniedResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: childTypeId,
        parentLocationId,
        name: `District Denied ${Date.now()}`
      });
    expect(deniedResponse.status).toBe(400);
  });

  it("prevents location cycles when reparenting", async () => {
    const worldId = context.worldId as string;
    const typeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId, name: `Node ${Date.now()}` });
    expect(typeResponse.status).toBe(201);
    const nodeTypeId = trackLocationType(typeResponse.body.id);

    const ruleResponse = await request(app)
      .post("/api/location-type-rules")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ parentTypeId: nodeTypeId, childTypeId: nodeTypeId, allowed: true });
    expect(ruleResponse.status).toBe(201);
    trackRule(ruleResponse.body.id);

    const rootResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: nodeTypeId,
        name: `Root ${Date.now()}`
      });
    expect(rootResponse.status).toBe(201);
    const rootId = trackLocation(rootResponse.body.id);

    const childResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: nodeTypeId,
        parentLocationId: rootId,
        name: `Child ${Date.now()}`
      });
    expect(childResponse.status).toBe(201);
    const childId = trackLocation(childResponse.body.id);

    const cycleResponse = await request(app)
      .put(`/api/locations/${rootId}`)
      .set("Authorization", `Bearer ${context.token}`)
      .send({ parentLocationId: childId });

    expect(cycleResponse.status).toBe(400);
  });

  it("returns location field values in list view when requested", async () => {
    const worldId = context.worldId as string;
    const typeResponse = await request(app)
      .post("/api/location-types")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({ worldId, name: `Fielded ${Date.now()}` });
    expect(typeResponse.status).toBe(201);
    const fieldedTypeId = trackLocationType(typeResponse.body.id);

    const fieldKey = `alias_${Date.now()}`;
    const fieldResponse = await request(app)
      .post("/api/location-type-fields")
      .set("Authorization", `Bearer ${context.architectToken}`)
      .send({
        locationTypeId: fieldedTypeId,
        fieldKey,
        fieldLabel: "Alias",
        fieldType: "TEXT",
        listOrder: 1,
        formOrder: 1
      });
    expect(fieldResponse.status).toBe(201);
    trackField(fieldResponse.body.id);

    const locationResponse = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${context.token}`)
      .send({
        worldId,
        locationTypeId: fieldedTypeId,
        name: `Fielded Location ${Date.now()}`,
        fieldValues: {
          [fieldKey]: "Hidden Hollow"
        }
      });
    expect(locationResponse.status).toBe(201);
    const locationId = trackLocation(locationResponse.body.id);

    const listResponse = await request(app)
      .get(
        `/api/locations?worldId=${worldId}&locationTypeId=${fieldedTypeId}&fieldKeys=${fieldKey}`
      )
      .set("Authorization", `Bearer ${context.token}`);

    expect(listResponse.status).toBe(200);
    const entry = listResponse.body.find(
      (item: { id: string; fieldValues?: Record<string, string | null> }) => item.id === locationId
    );
    expect(entry).toBeTruthy();
    expect(entry?.fieldValues?.[fieldKey]).toBe("Hidden Hollow");
  });
});
