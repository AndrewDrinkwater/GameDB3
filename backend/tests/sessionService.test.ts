import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prismaClient";
import * as helpers from "../src/lib/helpers";
import { createSession, listSessions } from "../src/services/sessionService";
import { ServiceError } from "../src/services/serviceError";

describe("sessionService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects listing when campaign access is denied", async () => {
    const user = { id: "user-1", role: Role.USER } as any;
    jest.spyOn(helpers, "canAccessCampaign").mockResolvedValue(false);

    await expect(
      listSessions({ user, worldId: "world-1", campaignId: "camp-1" })
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("creates a session when access is granted", async () => {
    const user = { id: "user-2", role: Role.USER } as any;
    jest.spyOn(helpers, "canAccessCampaign").mockResolvedValue(true);
    const createdSession = {
      id: "session-1",
      title: "Session",
      worldId: "world-1",
      campaignId: "camp-1",
      startedAt: null,
      endedAt: null,
      createdAt: new Date("2025-01-01"),
      _count: { notes: 5 }
    };
    jest.spyOn(prisma.session, "create").mockResolvedValue(createdSession as any);

    const result = await createSession({
      user,
      worldId: "world-1",
      campaignId: "camp-1",
      title: "Session"
    });

    expect(result.noteCount).toBe(5);
  });
});
