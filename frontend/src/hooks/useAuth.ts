import { useCallback, useMemo } from "react";

const tokenStorageKey = "ttrpg.token";

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
};

export function useAuth() {
  const storedToken = typeof window === "undefined" ? null : localStorage.getItem(tokenStorageKey);
  const isAuthenticated = Boolean(storedToken);
  const user: User | null = null;
  const hasRole = useCallback((role: string) => user?.role === role, [user]);

  return useMemo(
    () => ({
      user,
      isAuthenticated,
      hasRole
    }),
    [user, isAuthenticated, hasRole]
  );
}
