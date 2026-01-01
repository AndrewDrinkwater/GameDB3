import { Role } from "@prisma/client";
import { createCharacter } from "../src/services/characterService";
import { prisma } from "../src/lib/prismaClient";
import { ServiceError } from "../src/services/serviceError";

describe("characterService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects creation when campaign world mismatch occurs", async () => {
    const user = { id: "user-1", role: Role.USER } as any;
    jest.spyOn(prisma.campaign, "findUnique").mockResolvedValue({
      id: "camp-1",
      worldId: "world-other"
    } as any);

    await expect(
      createCharacter({
        user,
        worldId: "world-1",
        name: "Hero",
        campaignId: "camp-1"
      })
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
