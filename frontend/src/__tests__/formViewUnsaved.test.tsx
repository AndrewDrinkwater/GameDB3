import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormView from "../components/FormView";
import PopoutProvider from "../components/PopoutProvider";

type FetchHandler = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

const createResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: async () => data
  } as Response);

const setupFetch = (handler: FetchHandler) => {
  (global as typeof globalThis).fetch = jest.fn(handler) as jest.Mock;
};

describe("FormView unsaved state", () => {
  it("clears the unsaved marker after saving a new entity", async () => {
    const viewData = {
      id: "view-1",
      key: "entities.form",
      title: "Entity",
      entityKey: "entities",
      viewType: "FORM",
      endpoint: "/api/entities",
      adminOnly: false,
      fields: [
        {
          id: "field-1",
          fieldKey: "name",
          label: "Name",
          fieldType: "TEXT",
          listOrder: 1,
          formOrder: 1,
          required: true,
          readOnly: false,
          listVisible: true,
          formVisible: true
        },
        {
          id: "field-2",
          fieldKey: "worldId",
          label: "World",
          fieldType: "REFERENCE",
          listOrder: 2,
          formOrder: 2,
          required: true,
          readOnly: false,
          listVisible: true,
          formVisible: true,
          referenceEntityKey: "worlds",
          allowMultiple: false
        },
        {
          id: "field-3",
          fieldKey: "entityTypeId",
          label: "Type",
          fieldType: "REFERENCE",
          listOrder: 3,
          formOrder: 3,
          required: true,
          readOnly: false,
          listVisible: true,
          formVisible: true,
          referenceEntityKey: "entity_types",
          allowMultiple: false
        }
      ]
    };

    setupFetch((input, init) => {
      const url = String(input);
      if (url.startsWith("/api/views/entities.form")) {
        return createResponse(viewData);
      }
      if (url.startsWith("/api/choices")) {
        return createResponse([]);
      }
      if (url.startsWith("/api/entity-fields?entityTypeId=type-1")) {
        return createResponse([]);
      }
      if (url.startsWith("/api/entity-form-sections?entityTypeId=type-1")) {
        return createResponse([]);
      }
      if (url.startsWith("/api/references?entityKey=worlds")) {
        return createResponse([{ id: "world-1", label: "World One" }]);
      }
      if (url.startsWith("/api/references?entityKey=entity_types")) {
        return createResponse([{ id: "type-1", label: "NPC" }]);
      }
      if (url.startsWith("/api/permissions?")) {
        return createResponse({ canCreate: true, canEdit: true, canDelete: true });
      }
      if (url === "/api/entities" && init?.method === "POST") {
        return createResponse({ id: "entity-1" });
      }
      if (url.startsWith("/api/entities/entity-1/access")) {
        return createResponse({
          read: { global: true, campaigns: [], characters: [] },
          write: { global: true, campaigns: [], characters: [] }
        });
      }
      if (url.startsWith("/api/entities/entity-1")) {
        return createResponse({
          id: "entity-1",
          name: "Test Entity",
          worldId: "world-1",
          entityTypeId: "type-1",
          description: "",
          fieldValues: {}
        });
      }
      return createResponse([]);
    });

    const user = userEvent.setup();

    const { rerender } = render(
      <PopoutProvider>
        <FormView
          token="token"
          viewKey="entities.form"
          recordId="new"
          onBack={jest.fn()}
          currentUserRole="ADMIN"
          initialValues={{ name: "Test Entity", worldId: "world-1", entityTypeId: "type-1" }}
          initialLabels={{ worldId: "World One", entityTypeId: "NPC" }}
        />
      </PopoutProvider>
    );

    await screen.findByRole("heading", { name: "Entity" });

    const saveButton = await screen.findByRole("button", { name: "Save" });
    await user.click(saveButton);

    await waitFor(() => {
      const fetchMock = (global as typeof globalThis).fetch as jest.Mock;
      const postCall = fetchMock.mock.calls.find(
        (call) => call[0] === "/api/entities" && call[1]?.method === "POST"
      );
      expect(postCall).toBeTruthy();
    });

    rerender(
      <PopoutProvider>
        <FormView
          token="token"
          viewKey="entities.form"
          recordId="entity-1"
          onBack={jest.fn()}
          currentUserRole="ADMIN"
        />
      </PopoutProvider>
    );

    await screen.findByRole("heading", { name: "Test Entity" });
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });
});
