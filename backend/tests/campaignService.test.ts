import { Role } from "@prisma/client";
import { ServiceError } from "../src/services/serviceError";
import { addCharacterToCampaign } from "../src/services/campaignService";
import { prisma } from "../src/lib/prismaClient";
import * as helpers from "../src/lib/helpers";

describe("campaignService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects adding characters from a different world", async () => {
    const user = { id: "user-1", role: Role.ADMIN } as any;
    const campaignId = "camp-1";
    const characterId = "char-1";

    jest.spyOn(prisma.campaign, "findUnique").mockResolvedValue({
      id: campaignId,
      worldId: "world-a"
    } as any);
    jest.spyOn(prisma.character, "findUnique").mockResolvedValue({
      id: characterId,
      worldId: "world-b"
    } as any);
    jest.spyOn(helpers, "canManageCampaign").mockResolvedValue(true);

    await expect(
      addCharacterToCampaign({ user, campaignId, characterId })
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
