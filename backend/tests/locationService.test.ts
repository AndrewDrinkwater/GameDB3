import { LocationStatus, Role } from "@prisma/client";
import { prisma } from "../src/lib/prismaClient";
import * as helpers from "../src/lib/helpers";
import { deleteLocation, listLocations, updateLocation } from "../src/services/locationService";
import { ServiceError } from "../src/services/serviceError";

describe("locationService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects setting a location as its own parent", async () => {
    const user = { id: "admin", role: Role.ADMIN } as any;
    jest.spyOn(prisma.location, "findUnique").mockResolvedValue({
      id: "loc-1",
      worldId: "world-1",
      locationTypeId: "type-1",
      parentLocationId: null,
      name: "Local",
      description: null,
      status: LocationStatus.ACTIVE,
      metadata: null,
      fieldValues: []
    } as any);
    jest.spyOn(prisma.locationTypeField, "findMany").mockResolvedValue([]);
    jest.spyOn(helpers, "canWriteLocation").mockResolvedValue(true);

    await expect(
      updateLocation({
        user,
        locationId: "loc-1",
        payload: { parentLocationId: "loc-1" }
      })
    ).rejects.toThrow("Location cannot be its own parent.");
  });

  it("prevents deletion when children exist", async () => {
    const user = { id: "admin", role: Role.ADMIN } as any;
    jest.spyOn(prisma.location, "findUnique").mockResolvedValue({
      id: "loc-2",
      worldId: "world-2",
      name: "Parent"
    } as any);
    jest.spyOn(prisma.location, "count").mockResolvedValue(1);

    await expect(deleteLocation({ user, locationId: "loc-2" })).rejects.toThrow(
      "Location has child locations."
    );
  });

  it("returns empty list when worldId missing for non-admins", async () => {
    const user = { id: "user", role: Role.USER } as any;
    const result = await listLocations({ user, query: {} });
    expect(result).toEqual([]);
  });
});
