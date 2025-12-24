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
});

afterAll(async () => {
  if (context.campaignId && context.characterId) {
    await prisma.characterCampaign.deleteMany({
      where: { campaignId: context.campaignId, characterId: context.characterId }
    });
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
