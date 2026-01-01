import { Role } from "@prisma/client";
import { createWorld } from "../src/services/worldService";
import { prisma } from "../src/lib/prismaClient";
import { ServiceError } from "../src/services/serviceError";

describe("worldService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when required name is missing", async () => {
    const user = { id: "user-1", role: Role.ADMIN } as any;
    const createSpy = jest.spyOn(prisma.world, "create");

    await expect(
      createWorld({
        user,
        name: ""
      } as any)
    ).rejects.toBeInstanceOf(ServiceError);

    expect(createSpy).not.toHaveBeenCalled();
  });
});
