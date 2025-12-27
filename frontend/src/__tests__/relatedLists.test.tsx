import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RelatedLists from "../components/RelatedLists";
import PopoutProvider from "../components/PopoutProvider";

type MockResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

describe("RelatedLists", () => {
  const createResponse = (data: unknown): MockResponse => ({
    ok: true,
    json: async () => data
  });

  const renderWithProvider = (ui: React.ReactElement) =>
    render(<PopoutProvider>{ui}</PopoutProvider>);

  beforeEach(() => {
    (global as typeof globalThis).fetch = jest.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/related-lists?entityKey=campaigns")) {
        return Promise.resolve(
          createResponse([
            {
              id: "list-1",
              key: "campaign.characters",
              title: "Characters",
              parentEntityKey: "campaigns",
              relatedEntityKey: "characters",
              joinEntityKey: "characterCampaign",
              parentFieldKey: "campaignId",
              relatedFieldKey: "characterId",
              listOrder: 1,
              adminOnly: false,
              fields: [
                { id: "field-1", fieldKey: "name", label: "Name", source: "RELATED", listOrder: 1 }
              ]
            }
          ])
        );
      }

      if (url.startsWith("/api/related-lists/campaign.characters?parentId=camp-1")) {
        return Promise.resolve(createResponse({ items: [] }));
      }

      if (url.startsWith("/api/references?entityKey=characters&query=")) {
        return Promise.resolve(
          createResponse([
            { id: "char-1", label: "Test Character" }
          ])
        );
      }

      if (url.startsWith("/api/related-lists/campaign.characters") && init?.method === "POST") {
        return Promise.resolve(createResponse({ ok: true }));
      }

      return Promise.resolve(createResponse({}));
    }) as jest.Mock;
  });

  it("renders related list tabs", async () => {
    renderWithProvider(
      <RelatedLists token="token" parentEntityKey="campaigns" parentId="camp-1" />
    );

    expect(await screen.findByText("Related Lists")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Characters" })).toBeInTheDocument();
  });

  it("adds an item using the search box", async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <RelatedLists token="token" parentEntityKey="campaigns" parentId="camp-1" />
    );

    const input = await screen.findByPlaceholderText("Add Characters...");
    await user.type(input, "Test");

    const option = await screen.findByRole("button", { name: "Test Character" });
    await user.click(option);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/related-lists/campaign.characters",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows a disabled message when record is new", () => {
    renderWithProvider(
      <RelatedLists
        token="token"
        parentEntityKey="campaigns"
        parentId="camp-1"
        disabled
      />
    );

    expect(screen.getByText("Save this record to manage related lists.")).toBeInTheDocument();
  });
});
