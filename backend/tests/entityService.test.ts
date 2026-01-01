import { Prisma, Role } from "@prisma/client";
import { prisma } from "../src/lib/prismaClient";
import * as helpers from "../src/lib/helpers";
import { createEntity, listEntities } from "../src/services/entityService";
import { ServiceError } from "../src/services/serviceError";

describe("entityService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("applies list filters and returns field values", async () => {
    const user = { id: "user-1", role: Role.ADMIN } as any;
    jest.spyOn(prisma.entityField, "findMany").mockResolvedValue([
      { fieldKey: "status", fieldType: "TEXT" }
    ] as any);
    const entityRecord = {
      id: "entity-1",
      name: "Test",
      worldId: "world-1",
      entityTypeId: "type-1",
      values: [
        {
          field: { fieldKey: "customField" },
          valueString: "value",
          valueText: null,
          valueBoolean: null,
          valueNumber: null,
          valueJson: null
        }
      ]
    } as any;
    const findManySpy = jest.spyOn(prisma.entity, "findMany").mockResolvedValue([entityRecord]);

    const result = await listEntities({
      user,
      query: {
        worldId: "world-1",
        entityTypeId: "type-1",
        campaignId: "campaign-1",
        characterId: "character-1",
        filters: JSON.stringify([{ fieldKey: "status", operator: "equals", value: "active" }]),
        fieldKeys: "customField"
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("fieldValues", { customField: "value" });
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array)
        }),
        include: expect.objectContaining({ values: expect.any(Object) })
      })
    );
  });

  it("rejects entity creation when required data is missing", async () => {
    const user = { id: "user-1", role: Role.ADMIN } as any;
    await expect(
      createEntity({
        user,
        payload: { name: "incomplete" }
      } as any)
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects unauthorized users from creating entities", async () => {
    const user = { id: "user-2", role: Role.USER } as any;
    jest.spyOn(prisma.entityType, "findUnique").mockResolvedValue({ worldId: "world-1", isTemplate: false } as any);
    jest.spyOn(prisma.location, "findUnique").mockResolvedValue({ id: "loc-1", worldId: "world-1" } as any);
    jest.spyOn(helpers, "canCreateEntityInWorld").mockResolvedValue(false);

    await expect(
      createEntity({
        user,
        payload: {
          worldId: "world-1",
          entityTypeId: "type-1",
          currentLocationId: "loc-1",
          name: "Entity"
        }
      })
    ).rejects.toThrow(ServiceError);
  });

  it("creates an entity with valid data", async () => {
    const user = { id: "admin-user", role: Role.ADMIN } as any;
    jest.spyOn(prisma.entityType, "findUnique").mockResolvedValue({ worldId: "world-1", isTemplate: false } as any);
    jest.spyOn(prisma.location, "findUnique").mockResolvedValue({ id: "loc-1", worldId: "world-1" } as any);
    jest.spyOn(prisma.entityField, "findMany").mockResolvedValue([]);
    const createdEntity = { id: "entity-x" };
    jest.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
      const tx = {
        entity: {
          create: jest.fn().mockResolvedValue(createdEntity)
        },
        entityFieldValue: { create: jest.fn() },
        entityAccess: { createMany: jest.fn() }
      } as unknown as Prisma.TransactionClient;
      return callback(tx);
    });

    const result = await createEntity({
      user,
      payload: {
        worldId: "world-1",
        entityTypeId: "type-1",
        currentLocationId: "loc-1",
        name: "Created Entity"
      }
    });

    expect(result).toEqual(createdEntity);
  });
});
