import { cleanup, render } from "@testing-library/react";
import { useApi } from "../src/hooks/useApi";
import * as authUtils from "../src/utils/auth";

const tokenStorageKey = "ttrpg.token";
const originalFetch = global.fetch;

const createResponse = ({
  ok = true,
  status = 200,
  statusText = "OK",
  body = ""
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: string;
} = {}) =>
  ({
    ok,
    status,
    statusText,
    text: async () => body
  } as unknown as Response);

const renderUseApi = () => {
  let api: ReturnType<typeof useApi> | null = null;

  const TestComponent = () => {
    api = useApi();
    return null;
  };

  render(<TestComponent />);

  if (!api) {
    throw new Error("useApi did not mount");
  }

  return api;
};

describe("useApi", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("attaches Authorization header on GET requests", async () => {
    localStorage.setItem(tokenStorageKey, "test-token");
    const payload = { hello: "world" };
    const response = createResponse({ body: JSON.stringify(payload) });
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = renderUseApi();
    await expect(api.get("/api/example")).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token"
        })
      })
    );
  });

  it("serializes POST payloads with JSON headers and token", async () => {
    localStorage.setItem(tokenStorageKey, "another-token");
    const response = createResponse({ body: JSON.stringify({ id: "123" }) });
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = renderUseApi();
    await api.post("/api/create", { name: "entity" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer another-token",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ name: "entity" })
      })
    );
  });

  it("throws an error when the response is not ok", async () => {
    const response = createResponse({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      body: JSON.stringify({ error: "Forbidden access" })
    });
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = renderUseApi();
    await expect(api.get("/api/forbidden")).rejects.toThrow("Forbidden access");
  });

  it("dispatches unauthorized for 401 responses", async () => {
    const dispatchSpy = jest.spyOn(authUtils, "dispatchUnauthorized");
    const response = createResponse({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      body: ""
    });
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = renderUseApi();
    await expect(api.get("/api/secret")).rejects.toThrow("Unauthorized");
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
