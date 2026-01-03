import { useCallback, useMemo } from "react";
import { dispatchUnauthorized } from "../utils/auth";

const tokenStorageKey = "ttrpg.token";

const parseResponseText = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const deriveErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    const message = record.message;
    if (typeof error === "string" && error.length) {
      return error;
    }
    if (typeof message === "string" && message.length) {
      return message;
    }
  }
  if (typeof payload === "string" && payload.length) {
    return payload;
  }
  return fallback;
};

export function useApi() {
  const performRequest = useCallback(
    async <T>(method: string, url: string, body?: unknown): Promise<T> => {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem(tokenStorageKey);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      let serializedBody: string | undefined;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        serializedBody = typeof body === "string" ? body : JSON.stringify(body);
      }

      const response = await fetch(url, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: serializedBody
      });

      if (response.status === 401) {
        dispatchUnauthorized();
      }

      const text = await response.text();
      const payload = text ? parseResponseText(text) : undefined;

      if (!response.ok) {
        const message = deriveErrorMessage(payload, response.statusText || "Request failed");
        throw new Error(message);
      }

      return payload as T;
    },
    []
  );

  return useMemo(
    () => ({
      get: <T>(url: string) => performRequest<T>("GET", url),
      post: <T>(url: string, body: unknown) => performRequest<T>("POST", url, body),
      put: <T>(url: string, body: unknown) => performRequest<T>("PUT", url, body),
      patch: <T>(url: string, body: unknown) => performRequest<T>("PATCH", url, body),
      delete: <T>(url: string) => performRequest<T>("DELETE", url)
    }),
    [performRequest]
  );
}
