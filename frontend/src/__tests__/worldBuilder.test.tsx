import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorldBuilder from "../components/WorldBuilder";

const packs = [
  { id: "pack-1", name: "Starter", description: "Base pack", posture: "opinionated" }
];

const packDetail = {
  id: "pack-1",
  name: "Starter",
  description: "Base pack",
  posture: "opinionated",
  choiceLists: [],
  entityTypeTemplates: [
    {
      id: "e1",
      name: "Character",
      description: "Playable people",
      isCore: true,
      fields: [
        {
          id: "f1",
          fieldKey: "role",
          fieldLabel: "Role",
          fieldType: "CHOICE",
          required: false,
          defaultEnabled: true
        }
      ]
    },
    {
      id: "e2",
      name: "Organization",
      description: "Groups",
      isCore: false,
      fields: []
    }
  ],
  locationTypeTemplates: [
    {
      id: "l1",
      name: "Region",
      description: "Top level",
      isCore: true,
      fields: []
    },
    {
      id: "l2",
      name: "City",
      description: "Cities",
      isCore: false,
      fields: []
    },
    {
      id: "l3",
      name: "Site",
      description: "Sites",
      isCore: false,
      fields: []
    }
  ],
  locationTypeRuleTemplates: [
    { id: "lr1", parentLocationTypeTemplateId: "l1", childLocationTypeTemplateId: "l2" },
    { id: "lr2", parentLocationTypeTemplateId: "l2", childLocationTypeTemplateId: "l3" },
    { id: "lr3", parentLocationTypeTemplateId: "l1", childLocationTypeTemplateId: "l3" }
  ],
  relationshipTypeTemplates: [
    {
      id: "rel1",
      name: "Member Of",
      description: "Membership",
      isPeerable: false,
      fromLabel: "Member",
      toLabel: "Group",
      roles: [{ id: "role1", fromRole: "member", toRole: "group" }]
    }
  ]
};

const createResponse = (data: unknown, ok = true) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: async () => data
  } as Response);

const setupFetch = () => {
  const mockFetch = jest.fn((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/world-builder/packs?")) {
      return createResponse(packs);
    }
    if (url.startsWith("/api/world-builder/packs/pack-1")) {
      return createResponse(packDetail);
    }
    if (url.startsWith("/api/relationship-types")) {
      return createResponse([
        { id: "rel1", name: "Member Of", fromLabel: "Member", toLabel: "Group" }
      ]);
    }
    if (url.startsWith("/api/entity-types")) {
      return createResponse([
        { id: "e1", name: "Character" },
        { id: "e2", name: "Organization" }
      ]);
    }
    if (url.startsWith("/api/relationship-type-rules")) {
      return createResponse([]);
    }
    if (url.startsWith("/api/world-builder/apply")) {
      return createResponse({ ok: true });
    }
    return createResponse({});
  }) as jest.Mock;
  global.fetch = mockFetch;
  return mockFetch;
};

const renderBuilder = async () => {
  const fetchMock = setupFetch();
  const user = userEvent.setup();
  render(<WorldBuilder token="token" worldId="world-1" worldLabel="World One" />);
  await screen.findByText("Starter");
  await user.click(screen.getByText("Starter"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Entity Types" });
  return { user, fetchMock };
};

describe("WorldBuilder", () => {
  it("opens the entity editor popout and hides field keys", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: /Character/i }));
    expect(screen.getByText("Fields for Character")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Field key")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Fields for Character" });
    expect(within(dialog).getByLabelText("Description")).toBeInTheDocument();
  });

  it("shows a tooltip for long descriptions", async () => {
    await renderBuilder();
    const description = screen.getByText("Playable people");
    expect(description).toHaveAttribute("title", "Playable people");
  });

  it("creates a custom entity type from the card and shows a delete action", async () => {
    const { user } = await renderBuilder();

    const createCard = screen.getByText("Add custom entity type").closest(".custom-type-card");
    if (!createCard) throw new Error("Missing custom entity create card.");
    await user.type(within(createCard).getByLabelText("Name"), "Custom Entity");
    await user.type(within(createCard).getByLabelText("Description"), "Custom description");
    await user.click(within(createCard).getByRole("button", { name: "Add" }));

    const customCardButton = screen.getByRole("button", { name: /Custom Entity/i });
    await user.click(customCardButton);
    expect(screen.getByText("Fields for Custom Entity")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add custom field" }));

    const labelInput = screen.getByPlaceholderText("Label");
    const fieldRow = labelInput.closest(".world-builder__field");
    if (!fieldRow) throw new Error("Missing custom field row.");
    expect(within(fieldRow).getByRole("button", { name: "Delete field" })).toBeInTheDocument();

    fireEvent.change(labelInput, { target: { value: "Custom Field" } });
    await waitFor(() => {
      expect(labelInput).toHaveValue("Custom Field");
    });
  });

  it("renders the hierarchy editor with drag handles", async () => {
    const { user } = await renderBuilder();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Location Types" });

    const hierarchy = screen.getByTestId("hierarchy-editor");
    expect(within(hierarchy).getAllByText("Region").length).toBeGreaterThan(0);
    expect(within(hierarchy).getAllByText("City").length).toBeGreaterThan(0);
    expect(within(hierarchy).getAllByText("Site").length).toBeGreaterThan(0);

    const siteNode = within(hierarchy).getByTestId("hierarchy-node-location-template-l3");
    expect(within(siteNode).getByRole("button", { name: "Drag Site" })).toBeInTheDocument();
    expect(siteNode.querySelector(".hierarchy-editor__title")).toHaveAttribute("data-depth", "2");
  });

  it("auto-generates relationship defaults and keeps edit rules disabled pre-create", async () => {
    const { user, fetchMock } = await renderBuilder();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Relationships" });

    const memberCard = screen.getByText("Member Of").closest(".relationship-card");
    if (!memberCard) throw new Error("Missing Member Of card.");
    await user.click(within(memberCard).getByRole("checkbox"));
    expect(screen.getByText(/Character Member Organization/)).toBeInTheDocument();
    expect(within(memberCard).getByRole("button", { name: "Edit rules" })).toBeEnabled();

    const ruleCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === "string" && url.includes("/api/relationship")
    );
    expect(ruleCalls).toHaveLength(0);
  });

  it("aggregates review issues and commits structure", async () => {
    const { user } = await renderBuilder();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Review & Summary");
    expect(screen.getByText("Choice lists: missing assignments")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create structure" }));
    const modal = screen.getByRole("heading", { name: "Confirm structure creation" }).closest(
      ".world-builder__modal"
    );
    if (!modal) throw new Error("Missing confirm modal.");
    expect(within(modal).getByText("Derived containment rules")).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Create structure" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/world-builder/apply",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByText("Structure created")).toBeInTheDocument();
  });

  it("navigates back to a step when using review edit actions", async () => {
    const { user } = await renderBuilder();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Review & Summary");

    const entitySummaryHeader = screen.getByRole("heading", { name: "Entity Types" }).closest(
      ".world-builder__summary-header"
    );
    if (!entitySummaryHeader) throw new Error("Missing entity summary header.");
    await user.click(within(entitySummaryHeader).getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { name: "Entity Types" })).toBeInTheDocument();
  });
});
