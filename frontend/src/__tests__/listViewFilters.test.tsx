import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListView from "../components/ListView";
import PopoutProvider from "../components/PopoutProvider";

type FetchHandler = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

const createResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    json: async () => data
  } as Response);

const setupFetch = (handler: FetchHandler) => {
  (global as typeof globalThis).fetch = jest.fn(handler) as jest.Mock;
};

describe("ListView filters", () => {
  it("renders the AND/OR selector and sends filter logic in queries", async () => {
    const viewData = {
      id: "view-1",
      key: "entities.list",
      title: "Entities",
      entityKey: "entities",
      viewType: "LIST",
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
          required: false,
          optionsListKey: null,
          referenceEntityKey: null,
          referenceScope: null,
          allowMultiple: false,
          readOnly: false,
          listVisible: true,
          formVisible: true
        }
      ]
    };

    const entitiesUrls: string[] = [];
    let prefsLoaded = false;

    setupFetch((input) => {
      const url = String(input);
      if (url.startsWith("/api/views/entities.list")) {
        return createResponse(viewData);
      }
      if (url.startsWith("/api/choices")) {
        return createResponse([]);
      }
      if (url.startsWith("/api/entity-fields?entityTypeId=type-1")) {
        return createResponse([
          {
            fieldKey: "test_field",
            label: "Test Field",
            fieldType: "TEXT",
            listOrder: 1,
            choices: []
          }
        ]);
      }
      if (url.startsWith("/api/list-view-preferences")) {
        prefsLoaded = true;
        return createResponse({
          user: {
            columnsJson: null,
            filtersJson: {
              logic: "AND",
              rules: [{ fieldKey: "name", operator: "contains", value: "Test" }]
            }
          },
          defaults: null
        });
      }
      if (url.startsWith("/api/entities")) {
        entitiesUrls.push(url);
        return createResponse([]);
      }
      return createResponse([]);
    });

    const user = userEvent.setup();

    render(
      <PopoutProvider>
        <ListView
          token="token"
          viewKey="entities.list"
          formViewKey="entities.form"
          extraParams={{ entityTypeId: "type-1" }}
          currentUserRole="ADMIN"
          onOpenForm={jest.fn()}
        />
      </PopoutProvider>
    );

    await screen.findByRole("heading", { name: "Entities" });
    await screen.findByText("Name contains Test");
    await waitFor(() => {
      expect(prefsLoaded).toBe(true);
      expect(entitiesUrls.length).toBeGreaterThan(0);
    });

    const matchSelect = await screen.findByLabelText("Match");
    await user.selectOptions(matchSelect, "OR");

    await waitFor(() => {
      const matched = entitiesUrls.some((url) => {
        if (!url.includes("filters=")) return false;
        const parsedUrl = new URL(url, "http://localhost");
        const filtersParam = parsedUrl.searchParams.get("filters");
        if (!filtersParam) return false;
        const parsed = JSON.parse(filtersParam) as { logic?: string };
        return parsed.logic === "OR";
      });
      expect(matched).toBe(true);
    });
  });
});
