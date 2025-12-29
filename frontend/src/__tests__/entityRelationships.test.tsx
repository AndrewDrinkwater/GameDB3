import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EntityRelationships from "../components/EntityRelationships";
import PopoutProvider from "../components/PopoutProvider";

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const createResponse = (data: unknown, ok = true, status = ok ? 200 : 400): MockResponse => ({
  ok,
  status,
  json: async () => data
});

const renderWithProvider = (ui: React.ReactElement) =>
  render(<PopoutProvider>{ui}</PopoutProvider>);

describe("EntityRelationships", () => {
  it("shows valid relationship options and preview in by-entity mode", async () => {
    const relationshipTypes = [
      {
        id: "type-mentor",
        name: "Mentor",
        fromLabel: "Mentor",
        toLabel: "Student",
        isPeerable: false
      },
      {
        id: "type-ally",
        name: "Ally",
        fromLabel: "Ally",
        toLabel: "Ally",
        isPeerable: true
      }
    ];

    const relationshipRules = [
      {
        relationshipTypeId: "type-mentor",
        fromEntityTypeId: "type-a",
        toEntityTypeId: "type-b"
      },
      {
        relationshipTypeId: "type-ally",
        fromEntityTypeId: "type-a",
        toEntityTypeId: "type-b"
      },
      {
        relationshipTypeId: "type-ally",
        fromEntityTypeId: "type-b",
        toEntityTypeId: "type-a"
      }
    ];

    (global as typeof globalThis).fetch = jest.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/entities/") && url.includes("/relationships")) {
        return Promise.resolve(createResponse({ canManage: true, relationships: [] }));
      }
      if (url.startsWith("/api/relationship-types")) {
        return Promise.resolve(createResponse(relationshipTypes));
      }
      if (url.startsWith("/api/relationship-type-rules")) {
        return Promise.resolve(createResponse(relationshipRules));
      }
      if (url.startsWith("/api/references?entityKey=entities")) {
        return Promise.resolve(
          createResponse([{ id: "entity-b", label: "Target B", entityTypeId: "type-b" }])
        );
      }
      return Promise.resolve(createResponse({}));
    }) as jest.Mock;

    renderWithProvider(
      <EntityRelationships
        token="token"
        entityId="entity-a"
        entityTypeId="type-a"
        entityName="Hero"
        worldId="world-1"
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: "Add relationship" }));

    const dialog = await screen.findByRole("dialog");
    const typeSelect = await within(dialog).findByLabelText("Relationship Type");
    await userEvent.selectOptions(typeSelect, "type-mentor");

    const input = await within(dialog).findByPlaceholderText("Search entities...");
    await userEvent.click(input);

    const targetButton = await within(dialog).findByRole("button", { name: "Target B" });
    await userEvent.click(targetButton);

    expect(await within(dialog).findByText("Hero Mentor Target B")).toBeInTheDocument();
  });

  it("filters targets by relationship type and shows swap when both directions exist", async () => {
    const relationshipTypes = [
      {
        id: "type-bond",
        name: "Bond",
        fromLabel: "Bond",
        toLabel: "Bond",
        isPeerable: false
      }
    ];

    const relationshipRules = [
      {
        relationshipTypeId: "type-bond",
        fromEntityTypeId: "type-a",
        toEntityTypeId: "type-b"
      },
      {
        relationshipTypeId: "type-bond",
        fromEntityTypeId: "type-b",
        toEntityTypeId: "type-a"
      }
    ];

    (global as typeof globalThis).fetch = jest.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/entities/") && url.includes("/relationships")) {
        return Promise.resolve(createResponse({ canManage: true, relationships: [] }));
      }
      if (url.startsWith("/api/relationship-types")) {
        return Promise.resolve(createResponse(relationshipTypes));
      }
      if (url.startsWith("/api/relationship-type-rules")) {
        return Promise.resolve(createResponse(relationshipRules));
      }
      if (url.startsWith("/api/references?entityKey=entities")) {
        return Promise.resolve(
          createResponse([{ id: "entity-b", label: "Target B", entityTypeId: "type-b" }])
        );
      }
      return Promise.resolve(createResponse({}));
    }) as jest.Mock;

    renderWithProvider(
      <EntityRelationships
        token="token"
        entityId="entity-a"
        entityTypeId="type-a"
        entityName="Hero"
        worldId="world-1"
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: "Add relationship" }));

    const dialog = await screen.findByRole("dialog");
    const typeSelect = await within(dialog).findByLabelText("Relationship Type");
    await userEvent.selectOptions(typeSelect, "type-bond");

    const input = await within(dialog).findByPlaceholderText("Search entities...");
    await userEvent.click(input);

    const fetchCalls = (global.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
    const hasFilterCall = fetchCalls.some((url) => url.includes("entityTypeIds=type-b"));
    expect(hasFilterCall).toBe(true);

    const targetButton = await within(dialog).findByRole("button", { name: "Target B" });
    await userEvent.click(targetButton);

    expect(await within(dialog).findByText("<-> Swap direction")).toBeInTheDocument();
  });
});
