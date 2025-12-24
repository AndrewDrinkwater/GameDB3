import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextBar from "../components/ContextBar";

type FetchHandler = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

const createResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    json: async () => data
  } as Response);

const setupFetch = (handler: FetchHandler) => {
  (global as typeof globalThis).fetch = jest.fn(handler) as jest.Mock;
};

describe("ContextBar", () => {
  it("selects a world and clears other context", async () => {
    setupFetch((input) => {
      const url = String(input);
      if (url.startsWith("/api/references?entityKey=worlds")) {
        return createResponse([{ id: "world-1", label: "Faerun" }]);
      }
      return createResponse([]);
    });

    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<ContextBar token="token" context={{}} onChange={onChange} />);

    const input = screen.getByPlaceholderText("Select world");
    await user.click(input);

    const option = await screen.findByRole("button", { name: "Faerun" });
    await user.click(option);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        worldId: "world-1",
        worldLabel: "Faerun"
      });
    });
  });

  it("selects a character and auto-populates world and campaign when only one", async () => {
    setupFetch((input) => {
      const url = String(input);
      if (url.startsWith("/api/references?entityKey=characters")) {
        return createResponse([{ id: "char-1", label: "Riven" }]);
      }
      if (url.startsWith("/api/characters/char-1")) {
        return createResponse({ worldId: "world-1", campaignIds: ["camp-1"] });
      }
      if (url.startsWith("/api/references?entityKey=campaigns")) {
        return createResponse([{ id: "camp-1", label: "Dragonfall" }]);
      }
      if (url.startsWith("/api/references?entityKey=worlds")) {
        return createResponse([{ id: "world-1", label: "Faerun" }]);
      }
      return createResponse([]);
    });

    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<ContextBar token="token" context={{}} onChange={onChange} />);

    const input = screen.getByPlaceholderText("Select character");
    await user.click(input);

    const option = await screen.findByRole("button", { name: "Riven" });
    await user.click(option);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        worldId: "world-1",
        worldLabel: "Faerun",
        campaignId: "camp-1",
        campaignLabel: "Dragonfall",
        characterId: "char-1",
        characterLabel: "Riven"
      });
    });
  });
});
