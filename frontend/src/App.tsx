import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchUnauthorized } from "./utils/auth";
import ListView from "./components/ListView";
import FormView from "./components/FormView";
import ContextBar, { ContextSelection } from "./components/ContextBar";
import PopoutProvider from "./components/PopoutProvider";
import { useUnsavedChangesPrompt } from "./utils/unsavedChanges";
import ErrorBoundary from "./components/ErrorBoundary";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
};

type ViewConfig = {
  listKey: string;
  formKey: string;
  label: string;
};

const tokenStorageKey = "ttrpg.token";
const sidebarStorageKey = "ttrpg.sidebar";

type Theme = "light" | "dark";
type SidebarMode = "menu" | "favorites" | "collapsed";

type ContextDefaults = {
  enabled: boolean;
  worldId?: string;
  campaignId?: string;
  characterId?: string;
  worldLabel?: string;
  campaignLabel?: string;
  characterLabel?: string;
};

const viewRegistry: Record<string, ViewConfig> = {
  worlds: { listKey: "worlds.list", formKey: "worlds.form", label: "Worlds" },
  campaigns: { listKey: "campaigns.list", formKey: "campaigns.form", label: "Campaigns" },
  characters: { listKey: "characters.list", formKey: "characters.form", label: "Characters" },
  entity_types: { listKey: "entity_types.list", formKey: "entity_types.form", label: "Entity Types" },
  entity_fields: { listKey: "entity_fields.list", formKey: "entity_fields.form", label: "Entity Fields" },
  entity_field_choices: {
    listKey: "entity_field_choices.list",
    formKey: "entity_field_choices.form",
    label: "Entity Field Choices"
  },
  entities: { listKey: "entities.list", formKey: "entities.form", label: "Entities" },
  location_types: {
    listKey: "location_types.list",
    formKey: "location_types.form",
    label: "Location Types"
  },
  location_type_fields: {
    listKey: "location_type_fields.list",
    formKey: "location_type_fields.form",
    label: "Location Fields"
  },
  location_type_field_choices: {
    listKey: "location_type_field_choices.list",
    formKey: "location_type_field_choices.form",
    label: "Location Field Choices"
  },
  location_type_rules: {
    listKey: "location_type_rules.list",
    formKey: "location_type_rules.form",
    label: "Location Rules"
  },
  locations: { listKey: "locations.list", formKey: "locations.form", label: "Locations" }
};

const adminViewRegistry: Record<string, ViewConfig> = {
  system_choices: {
    listKey: "admin.system_choices.list",
    formKey: "admin.system_choices.form",
    label: "System Choices"
  },
  system_properties: {
    listKey: "admin.system_properties.list",
    formKey: "admin.system_properties.form",
    label: "System Properties"
  },
  user_preferences: {
    listKey: "admin.user_preferences.list",
    formKey: "admin.user_preferences.form",
    label: "User Preferences"
  },
  system_controls: {
    listKey: "admin.system_controls.list",
    formKey: "admin.system_controls.form",
    label: "System Controls"
  },
  system_related_lists: {
    listKey: "admin.system_related_lists.list",
    formKey: "admin.system_related_lists.form",
    label: "Related Lists"
  },
  system_related_list_fields: {
    listKey: "admin.system_related_list_fields.list",
    formKey: "admin.system_related_list_fields.form",
    label: "Related List Fields"
  },
  users: {
    listKey: "admin.users.list",
    formKey: "admin.users.form",
    label: "Users"
  }
};

function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(tokenStorageKey));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("collapsed");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [route, setRoute] = useState("/home");
  const [homepage, setHomepage] = useState("/home");
  const [context, setContext] = useState<ContextSelection>({});
  const [contextDefaults, setContextDefaults] = useState<ContextDefaults>({ enabled: false });
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [worldAdminExpanded, setWorldAdminExpanded] = useState(true);
  const [worldAdminAllowed, setWorldAdminAllowed] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
    const [entityTypeStats, setEntityTypeStats] = useState<
      Array<{ id: string; name: string; count: number }>
    >([]);
  const [entityTypeStatsVersion, setEntityTypeStatsVersion] = useState(0);
  const [locationMenuTypes, setLocationMenuTypes] = useState<
    Array<{ id: string; name: string; count: number }>
  >([]);
  const [locationMenuVersion, setLocationMenuVersion] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastEntitiesListRoute, setLastEntitiesListRoute] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

    const contextStorageKey = "ttrpg.context";
    const contextPanelRef = useRef<HTMLDivElement | null>(null);
    const hasUnsavedChangesRef = useRef(false);
    const lastHashRef = useRef(window.location.hash);
    const suppressHashRef = useRef(false);
    const pendingHashRef = useRef<string | null>(null);

    const handleUnauthorized = (response: Response) => {
      if (response.status === 401) {
        dispatchUnauthorized();
        return true;
      }
      return false;
    };

    useEffect(() => {
      hasUnsavedChangesRef.current = hasUnsavedChanges;
    }, [hasUnsavedChanges]);

    useEffect(() => {
      const handleDirty = (event: Event) => {
        const customEvent = event as CustomEvent<{ dirty?: boolean }>;
        const nextDirty = Boolean(customEvent.detail?.dirty);
        hasUnsavedChangesRef.current = nextDirty;
        setHasUnsavedChanges(nextDirty);
      };

      window.addEventListener("ttrpg:form-dirty", handleDirty as EventListener);
      return () => window.removeEventListener("ttrpg:form-dirty", handleDirty as EventListener);
    }, []);

    const requestFormSave = useCallback(() => {
      return new Promise<boolean>((resolve) => {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const handleResult = (event: Event) => {
          const customEvent = event as CustomEvent<{ requestId?: string; ok?: boolean }>;
          if (customEvent.detail?.requestId !== requestId) return;
          cleanup();
          resolve(Boolean(customEvent.detail?.ok));
        };
        const cleanup = () => {
          window.clearTimeout(timeoutId);
          window.removeEventListener(
            "ttrpg:form-save-result",
            handleResult as EventListener
          );
        };
        const timeoutId = window.setTimeout(() => {
          cleanup();
          resolve(false);
        }, 8000);

        window.addEventListener("ttrpg:form-save-result", handleResult as EventListener);
        window.dispatchEvent(
          new CustomEvent("ttrpg:form-save-request", { detail: { requestId } })
        );
      });
    }, []);

    const confirmUnsavedChanges = useUnsavedChangesPrompt({
      isDirtyRef: hasUnsavedChangesRef,
      onSave: requestFormSave,
      onDiscard: () => {
        hasUnsavedChangesRef.current = false;
        setHasUnsavedChanges(false);
      }
    });

    const navigateWithGuard = useCallback(
      (nextHash: string) => {
        if (!hasUnsavedChangesRef.current) {
          window.location.hash = nextHash;
          return;
        }
        confirmUnsavedChanges(() => {
          suppressHashRef.current = true;
          window.location.hash = nextHash;
        });
      },
      [confirmUnsavedChanges]
    );

    useEffect(() => {
      const handleHashChange = () => {
        if (suppressHashRef.current) {
          suppressHashRef.current = false;
          lastHashRef.current = window.location.hash;
          return;
        }

        const nextHash = window.location.hash;
        if (!hasUnsavedChangesRef.current) {
          lastHashRef.current = nextHash;
          return;
        }

        pendingHashRef.current = nextHash;
        suppressHashRef.current = true;
        window.location.hash = lastHashRef.current;
        confirmUnsavedChanges(() => {
          const target = pendingHashRef.current;
          pendingHashRef.current = null;
          if (!target) return;
          suppressHashRef.current = true;
          window.location.hash = target;
        });
      };

      window.addEventListener("hashchange", handleHashChange);
      return () => window.removeEventListener("hashchange", handleHashChange);
    }, [confirmUnsavedChanges]);

  const resolveSidebarMode = (pinned: boolean) => {
    if (!pinned) return "collapsed";
    const storedSidebar = localStorage.getItem(sidebarStorageKey) as SidebarMode | null;
    if (storedSidebar === "menu" || storedSidebar === "favorites") {
      return storedSidebar;
    }
    return "menu";
  };

  useEffect(() => {
    const storedSidebar = localStorage.getItem(sidebarStorageKey) as SidebarMode | null;
    if (storedSidebar === "menu" || storedSidebar === "favorites" || storedSidebar === "collapsed") {
      setSidebarMode(storedSidebar);
    }
  }, []);

  const attemptRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }
    const refreshPromise = (async () => {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        return false;
      }
      const data = (await response.json()) as { token?: string };
      if (!data.token) return false;
      localStorage.setItem(tokenStorageKey, data.token);
      setToken(data.token);
      const meResponse = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.token}` }
      });
      if (!meResponse.ok) return false;
      const userData = (await meResponse.json()) as User;
      setUser(userData);
      return true;
    })();

    refreshInFlightRef.current = refreshPromise;
    const ok = await refreshPromise;
    refreshInFlightRef.current = null;
    return ok;
  }, []);

  useEffect(() => {
    const tokenValue = localStorage.getItem(tokenStorageKey);
    if (!tokenValue) return;

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${tokenValue}` }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Session expired");
        }
        return response.json();
      })
      .then(async (data: User) => {
        setUser(data);
        setToken(tokenValue);
        const preferences = await resolvePreferences(tokenValue);
        await resolveContextFromDefaults(tokenValue, preferences.defaults);
      })
      .catch(async () => {
        const refreshed = await attemptRefresh();
        if (refreshed) {
          const refreshedToken = localStorage.getItem(tokenStorageKey);
          if (!refreshedToken) return;
          const preferences = await resolvePreferences(refreshedToken);
          await resolveContextFromDefaults(refreshedToken, preferences.defaults);
          return;
        }
        localStorage.removeItem(tokenStorageKey);
        sessionStorage.removeItem(contextStorageKey);
        setToken(null);
        setUser(null);
      });
  }, [attemptRefresh]);

  useEffect(() => {
    const handleUnauthorized = async () => {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return;
      }
      localStorage.removeItem(tokenStorageKey);
      sessionStorage.removeItem(contextStorageKey);
      setToken(null);
      setUser(null);
    };

    window.addEventListener("ttrpg:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("ttrpg:unauthorized", handleUnauthorized);
  }, [attemptRefresh]);

  useEffect(() => {
    const handleSaved = () => {
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    };
    window.addEventListener("ttrpg:form-saved", handleSaved);
    return () => window.removeEventListener("ttrpg:form-saved", handleSaved);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("App error:", event.error || event.message);
      setGlobalError("We hit a problem, but you can keep working.");
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      setGlobalError("We hit a problem, but you can keep working.");
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) {
        window.location.hash = homepage;
        return;
      }
      setRoute(hash);
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [homepage]);

  useEffect(() => {
    const stored = sessionStorage.getItem(contextStorageKey);
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as ContextSelection;
      setContext(data ?? {});
    } catch {
      setContext({});
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(contextStorageKey, JSON.stringify(context));
  }, [context]);

  useEffect(() => {
    if (!token) return;
    if (!context.worldId && !context.campaignId && !context.characterId) {
      setContextSummary(null);
      return;
    }
    const loadSummary = async () => {
      const params = new URLSearchParams();
      if (context.worldId) params.set("worldId", context.worldId);
      if (context.campaignId) params.set("campaignId", context.campaignId);
      if (context.characterId) params.set("characterId", context.characterId);
      const response = await fetch(`/api/context/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as {
        worldRole?: string | null;
        campaignRole?: string | null;
        characterOwnerLabel?: string | null;
      };
      const parts: string[] = [];
      if (context.worldLabel) {
        parts.push(
          data.worldRole ? `${context.worldLabel} (${data.worldRole})` : context.worldLabel
        );
      }
      if (context.campaignLabel) {
        parts.push(
          data.campaignRole
            ? `${context.campaignLabel} (${data.campaignRole})`
            : context.campaignLabel
        );
      }
      if (context.characterLabel) {
        const owner = data.characterOwnerLabel ? `Owner: ${data.characterOwnerLabel}` : undefined;
        parts.push(owner ? `${context.characterLabel} - ${owner}` : context.characterLabel);
      }
      setContextSummary(parts.length > 0 ? parts.join(" / ") : null);
    };
    void loadSummary();
  }, [token, context]);

  useEffect(() => {
    let ignore = false;
    if (!user) return;

    if (user.role === "ADMIN") {
      setWorldAdminAllowed(true);
      return;
    }

    if (!context.worldId) {
      setWorldAdminAllowed(false);
      return;
    }

    const loadWorldAdminAccess = async () => {
      const response = await fetch(`/api/worlds/${context.worldId}/world-admin`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        if (!ignore) setWorldAdminAllowed(false);
        return;
      }
      const data = (await response.json()) as { allowed: boolean };
      if (!ignore) setWorldAdminAllowed(data.allowed);
    };

    void loadWorldAdminAccess();

    return () => {
      ignore = true;
    };
  }, [user, token, context.worldId]);

  useEffect(() => {
    let ignore = false;
    if (!token || !context.worldId) {
      setEntityTypeStats([]);
      return;
    }

    const loadEntityTypeStats = async () => {
      const params = new URLSearchParams({ worldId: context.worldId as string });
      if (context.campaignId) params.set("campaignId", context.campaignId);
      if (context.characterId) params.set("characterId", context.characterId);

      const response = await fetch(`/api/entity-type-stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        if (!ignore) setEntityTypeStats([]);
        return;
      }
      const data = (await response.json()) as Array<{ id: string; name: string; count: number }>;
      if (!ignore) setEntityTypeStats(data);
    };

    void loadEntityTypeStats();

    return () => {
      ignore = true;
    };
  }, [token, context.worldId, context.campaignId, context.characterId, entityTypeStatsVersion]);

  useEffect(() => {
    const handleEntityUpdate = () => {
      setEntityTypeStatsVersion((current) => current + 1);
    };
    window.addEventListener("ttrpg:entities-updated", handleEntityUpdate);
    return () => window.removeEventListener("ttrpg:entities-updated", handleEntityUpdate);
  }, []);

  useEffect(() => {
    let ignore = false;
    if (!token || !context.worldId) {
      setLocationMenuTypes([]);
      return;
    }

    const loadLocationMenuTypes = async () => {
      const params = new URLSearchParams({ worldId: context.worldId as string });
      if (context.campaignId) params.set("campaignId", context.campaignId);
      if (context.characterId) params.set("characterId", context.characterId);
      const response = await fetch(`/api/location-type-stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        if (!ignore) setLocationMenuTypes([]);
        return;
      }
      const data = (await response.json()) as Array<{
        id: string;
        name: string;
        count: number;
      }>;
      if (!ignore) {
        setLocationMenuTypes(data);
      }
    };

    void loadLocationMenuTypes();

    return () => {
      ignore = true;
    };
  }, [
    token,
    context.worldId,
    context.campaignId,
    context.characterId,
    locationMenuVersion
  ]);

  useEffect(() => {
    const handleLocationTypeUpdate = () => {
      setLocationMenuVersion((current) => current + 1);
    };
    window.addEventListener("ttrpg:location-types-updated", handleLocationTypeUpdate);
    window.addEventListener("ttrpg:locations-updated", handleLocationTypeUpdate);
    return () => {
      window.removeEventListener("ttrpg:location-types-updated", handleLocationTypeUpdate);
      window.removeEventListener("ttrpg:locations-updated", handleLocationTypeUpdate);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!contextOpen) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (contextPanelRef.current?.contains(target)) return;
      setContextOpen(false);
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("touchstart", handlePointer);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("touchstart", handlePointer);
    };
  }, [contextOpen]);

  useEffect(() => {
    localStorage.setItem(sidebarStorageKey, sidebarMode);
  }, [sidebarMode]);

  const isSidebarOpen = sidebarMode !== "collapsed";

  const resolvePreferences = async (
    tokenValue: string
  ): Promise<{ defaults: ContextDefaults; homepage: string }> => {
    const fallbackHomepage = "/home";
    const fallbackDefaults: ContextDefaults = { enabled: false };

    try {
      const [userPrefsResponse, defaultsResponse] = await Promise.all([
        fetch("/api/user/preferences", {
          headers: { Authorization: `Bearer ${tokenValue}` }
        }),
        fetch("/api/user/preferences/defaults", {
          headers: { Authorization: `Bearer ${tokenValue}` }
        })
      ]);

      if (handleUnauthorized(userPrefsResponse) || handleUnauthorized(defaultsResponse)) {
        return { defaults: fallbackDefaults, homepage: fallbackHomepage };
      }

      if (!userPrefsResponse.ok || !defaultsResponse.ok) {
        return { defaults: fallbackDefaults, homepage: fallbackHomepage };
      }

      const userPrefs = (await userPrefsResponse.json()) as Array<{
        key: string;
        value: string;
      }>;
      const defaults = (await defaultsResponse.json()) as Array<{
        key: string;
        value: string;
      }>;

      const userHomepage = userPrefs.find((pref) => pref.key === "homepage")?.value;
      const defaultHomepage = defaults.find((pref) => pref.key === "homepage")?.value;
      const userTheme = userPrefs.find((pref) => pref.key === "theme")?.value;
      const defaultTheme = defaults.find((pref) => pref.key === "theme")?.value;
      const userPinned = userPrefs.find((pref) => pref.key === "sidebarPinned")?.value;
      const defaultPinned = defaults.find((pref) => pref.key === "sidebarPinned")?.value;
      const useDefaultContext = userPrefs.find((pref) => pref.key === "contextUseDefault")?.value;
      const defaultWorldId = userPrefs.find((pref) => pref.key === "contextWorldId")?.value || undefined;
      const defaultCampaignId = userPrefs.find((pref) => pref.key === "contextCampaignId")?.value || undefined;
      const defaultCharacterId = userPrefs.find((pref) => pref.key === "contextCharacterId")?.value || undefined;

      const resolvedHomepage = userHomepage ?? defaultHomepage ?? fallbackHomepage;
      setHomepage(resolvedHomepage);
      setTheme(
        userTheme === "dark" || userTheme === "light"
          ? (userTheme as Theme)
          : defaultTheme === "dark" || defaultTheme === "light"
            ? (defaultTheme as Theme)
            : "light"
      );
      const pinned =
        userPinned === "true" || userPinned === "false"
          ? userPinned === "true"
          : defaultPinned === "true";
      setIsSidebarPinned(pinned);
      setSidebarMode(resolveSidebarMode(pinned));

      const defaultsValue: ContextDefaults = {
        enabled: useDefaultContext === "true",
        worldId: defaultWorldId ?? undefined,
        campaignId: defaultCampaignId ?? undefined,
        characterId: defaultCharacterId ?? undefined
      };
      setContextDefaults(defaultsValue);
      return { defaults: defaultsValue, homepage: resolvedHomepage };
    } catch {
      setHomepage(fallbackHomepage);
      setTheme("light");
      setIsSidebarPinned(true);
      setSidebarMode(resolveSidebarMode(true));
      setContextDefaults(fallbackDefaults);
      return { defaults: fallbackDefaults, homepage: fallbackHomepage };
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Login failed");
      }

      const data = (await response.json()) as { token: string; user: User };
      localStorage.setItem(tokenStorageKey, data.token);
      setUser(data.user);
      setToken(data.token);
      setEmail("");
      setPassword("");
      sessionStorage.removeItem(contextStorageKey);
      setContext({});
      const preferences = await resolvePreferences(data.token);
      await resolveContextFromDefaults(data.token, preferences.defaults);
      window.location.hash = preferences.homepage;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const tokenValue = localStorage.getItem(tokenStorageKey);
    if (tokenValue) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenValue}` }
      });
    }
    localStorage.removeItem(tokenStorageKey);
    setUser(null);
    setToken(null);
    setHomepage("/home");
    setTheme("light");
    setIsSidebarPinned(true);
    setContext({});
    setContextDefaults({ enabled: false });
    sessionStorage.removeItem(contextStorageKey);
  };

  const setThemePreference = async (nextTheme: Theme) => {
    setTheme(nextTheme);

    const tokenValue = localStorage.getItem(tokenStorageKey);
    if (!tokenValue) return;

    await fetch("/api/user/preferences/theme", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenValue}`
      },
      body: JSON.stringify({ valueType: "STRING", value: nextTheme })
    });
  };

  const setSidebarPinnedPreference = async (nextPinned: boolean) => {
    setIsSidebarPinned(nextPinned);
    setSidebarMode((current) => {
      if (nextPinned) return current === "collapsed" ? "menu" : current;
      return "collapsed";
    });

    const tokenValue = localStorage.getItem(tokenStorageKey);
    if (!tokenValue) return;

    await fetch("/api/user/preferences/sidebarPinned", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenValue}`
      },
      body: JSON.stringify({ valueType: "BOOLEAN", value: String(nextPinned) })
    });
  };

  const toggleSidebar = (mode: SidebarMode) => {
    setSidebarMode((current) => (current === mode ? "collapsed" : mode));
  };

  const handleSidebarSelect = () => {
    if (!isSidebarPinned) {
      setSidebarMode("collapsed");
    }
  };

  const handleSidebarClose = () => {
    if (!isSidebarPinned) {
      setSidebarMode("collapsed");
    }
  };

  const handleContextSwitch = (next: { worldId: string; worldLabel?: string }) => {
    setContext({
      worldId: next.worldId,
      worldLabel: next.worldLabel,
      campaignId: undefined,
      campaignLabel: undefined,
      characterId: undefined,
      characterLabel: undefined
    });
  };

  const toggleSidebarPin = () => {
    void setSidebarPinnedPreference(!isSidebarPinned);
  };

  const resolveContextFromDefaults = async (
    tokenValue: string,
    defaultsValue: ContextDefaults = contextDefaults
  ) => {
    const stored = sessionStorage.getItem(contextStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ContextSelection;
        if (parsed?.worldId || parsed?.campaignId || parsed?.characterId) {
          return;
        }
      } catch {
        // ignore invalid stored value
      }
      sessionStorage.removeItem(contextStorageKey);
    }
    if (!defaultsValue.enabled) return;

    const applyContext = (next: ContextSelection) => {
      setContext(next);
      sessionStorage.setItem(contextStorageKey, JSON.stringify(next));
    };

    if (defaultsValue.characterId) {
      const response = await fetch(`/api/characters/${defaultsValue.characterId}`, {
        headers: { Authorization: `Bearer ${tokenValue}` }
      });
      if (handleUnauthorized(response)) return;
      if (response.ok) {
        const data = (await response.json()) as { worldId: string; campaignIds?: string[] };
        const campaignId =
          Array.isArray(data.campaignIds) && data.campaignIds.length === 1
            ? data.campaignIds[0]
            : defaultsValue.campaignId;
        applyContext({
          worldId: data.worldId,
          campaignId,
          characterId: defaultsValue.characterId
        });
        return;
      }
    }

    if (defaultsValue.campaignId) {
      const response = await fetch(`/api/campaigns/${defaultsValue.campaignId}`, {
        headers: { Authorization: `Bearer ${tokenValue}` }
      });
      if (handleUnauthorized(response)) return;
      if (response.ok) {
        const data = (await response.json()) as { worldId: string };
        applyContext({
          worldId: data.worldId,
          campaignId: defaultsValue.campaignId
        });
        return;
      }
    }

    if (defaultsValue.worldId) {
      applyContext({
        worldId: defaultsValue.worldId
      });
    }
  };

  const resolveLabel = async (tokenValue: string, entityKey: string, id?: string) => {
    if (!id) return undefined;
    const response = await fetch(`/api/references?entityKey=${entityKey}&ids=${id}`, {
      headers: { Authorization: `Bearer ${tokenValue}` }
    });
    if (handleUnauthorized(response)) return undefined;
    if (!response.ok) return undefined;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    return data[0]?.label;
  };

  useEffect(() => {
    if (!token) return;
    const fillLabels = async () => {
      const next: ContextSelection = { ...context };
      if (context.worldId && !context.worldLabel) {
        next.worldLabel = await resolveLabel(token, "worlds", context.worldId);
      }
      if (context.campaignId && !context.campaignLabel) {
        next.campaignLabel = await resolveLabel(token, "campaigns", context.campaignId);
      }
      if (context.characterId && !context.characterLabel) {
        next.characterLabel = await resolveLabel(token, "characters", context.characterId);
      }
      if (JSON.stringify(next) !== JSON.stringify(context)) {
        setContext(next);
      }
    };
    void fillLabels();
  }, [token, context]);

  useEffect(() => {
    if (!token) return;
    const fillDefaultLabels = async () => {
      const next: ContextDefaults = { ...contextDefaults };
      if (contextDefaults.worldId && !contextDefaults.worldLabel) {
        next.worldLabel = await resolveLabel(token, "worlds", contextDefaults.worldId);
      }
      if (contextDefaults.campaignId && !contextDefaults.campaignLabel) {
        next.campaignLabel = await resolveLabel(token, "campaigns", contextDefaults.campaignId);
      }
      if (contextDefaults.characterId && !contextDefaults.characterLabel) {
        next.characterLabel = await resolveLabel(token, "characters", contextDefaults.characterId);
      }
      if (JSON.stringify(next) !== JSON.stringify(contextDefaults)) {
        setContextDefaults(next);
      }
    };
    void fillDefaultLabels();
  }, [token, contextDefaults]);

  const sidebarTitle = useMemo(() => {
    if (sidebarMode === "menu") return "Menu";
    if (sidebarMode === "favorites") return "Favorites";
    return "Navigation";
  }, [sidebarMode]);

  const [routePath, routeSearch = ""] = route.replace(/^#/, "").split("?");
  const routeParts = routePath.split("/").filter(Boolean);
  const routeParams = new URLSearchParams(routeSearch);
  const entityTypeIdParam = routeParams.get("entityTypeId") ?? undefined;
  const locationTypeIdParam = routeParams.get("locationTypeId") ?? undefined;

  useEffect(() => {
    if (routeParts[0] === "list" && routeParts[1] === "entities") {
      const nextRoute = entityTypeIdParam
        ? `/list/entities?entityTypeId=${entityTypeIdParam}`
        : "/list/entities";
      setLastEntitiesListRoute(nextRoute);
    }
  }, [routeParts, entityTypeIdParam]);

    const renderContent = () => {
      if (!user || !token) return null;

      const selectedEntityType = entityTypeIdParam
        ? entityTypeStats.find((type) => type.id === entityTypeIdParam)
        : undefined;

      if (routeParts[0] === "profile") {
        return (
        <section className="app__panel">
          <div className="profile">
            <div className="profile__header">
              <div className="profile__badge">
                {user.name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1>{user.name ?? user.email}</h1>
                <p>{user.email}</p>
              </div>
            </div>

            <div className="profile__section">
              <h2>Account</h2>
              <div className="profile__grid">
                <div>
                  <span className="profile__label">Role</span>
                  <div className="profile__value">{user.role}</div>
                </div>
                <div>
                  <span className="profile__label">Status</span>
                  <div className="profile__value">Active</div>
                </div>
              </div>
            </div>

            <div className="profile__section">
              <h2>Theme</h2>
              <div className="theme-toggle">
                <button
                  type="button"
                  className={theme === "light" ? "active" : ""}
                  onClick={() => setThemePreference("light")}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => setThemePreference("dark")}
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="profile__section">
              <h2>Default context</h2>
              <div className="profile__grid">
                <label className="profile__label">
                  <input
                    type="checkbox"
                    checked={contextDefaults.enabled}
                    onChange={async (event) => {
                      const enabled = event.target.checked;
                      setContextDefaults((current) => ({ ...current, enabled }));
                      const tokenValue = localStorage.getItem(tokenStorageKey);
                      if (!tokenValue) return;
                      await fetch("/api/user/preferences/contextUseDefault", {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${tokenValue}`
                        },
                        body: JSON.stringify({ valueType: "BOOLEAN", value: String(enabled) })
                      });
                    }}
                  />
                  Use default context on login
                </label>
              </div>
              <div className="profile__section">
                <ContextBar
                  token={token}
                  context={{
                    worldId: contextDefaults.worldId,
                    worldLabel: contextDefaults.worldLabel,
                    campaignId: contextDefaults.campaignId,
                    campaignLabel: contextDefaults.campaignLabel,
                    characterId: contextDefaults.characterId,
                    characterLabel: contextDefaults.characterLabel
                  }}
                  onChange={async (next) => {
                    setContextDefaults((current) => ({
                      ...current,
                      worldId: next.worldId,
                      worldLabel: next.worldLabel,
                      campaignId: next.campaignId,
                      campaignLabel: next.campaignLabel,
                      characterId: next.characterId,
                      characterLabel: next.characterLabel
                    }));
                    const tokenValue = localStorage.getItem(tokenStorageKey);
                    if (!tokenValue) return;
                    await Promise.all([
                      fetch("/api/user/preferences/contextWorldId", {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${tokenValue}`
                        },
                        body: JSON.stringify({ valueType: "STRING", value: next.worldId ?? "" })
                      }),
                      fetch("/api/user/preferences/contextCampaignId", {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${tokenValue}`
                        },
                        body: JSON.stringify({ valueType: "STRING", value: next.campaignId ?? "" })
                      }),
                      fetch("/api/user/preferences/contextCharacterId", {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${tokenValue}`
                        },
                        body: JSON.stringify({ valueType: "STRING", value: next.characterId ?? "" })
                      })
                    ]);
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      );
    }

      if (routeParts[0] === "list" && routeParts[1]) {
        const config = viewRegistry[routeParts[1]];
        if (!config) return null;
        const extraParams =
          routeParts[1] === "entities" && entityTypeIdParam
            ? { entityTypeId: entityTypeIdParam }
            : routeParts[1] === "locations" && locationTypeIdParam
              ? { locationTypeId: locationTypeIdParam }
              : undefined;
        const titleOverride =
          routeParts[1] === "entities" && selectedEntityType
            ? selectedEntityType.name
            : undefined;
        const subtitleOverride =
          routeParts[1] === "entities" && selectedEntityType ? "Entities" : undefined;
        return (
          <section className="app__panel app__panel--wide">
            <ListView
              token={token}
              viewKey={config.listKey}
              formViewKey={config.formKey}
              contextWorldId={context.worldId}
              contextCampaignId={context.campaignId}
              contextCharacterId={context.characterId}
              extraParams={extraParams}
              titleOverride={titleOverride}
              subtitleOverride={subtitleOverride}
              currentUserRole={user.role}
              onOpenForm={(id) => {
                if (routeParts[1] === "entities" && id === "new" && entityTypeIdParam) {
                  navigateWithGuard(`/form/entities/new?entityTypeId=${entityTypeIdParam}`);
                } else if (
                  routeParts[1] === "locations" &&
                  id === "new" &&
                  locationTypeIdParam
                ) {
                  navigateWithGuard(`/form/locations/new?locationTypeId=${locationTypeIdParam}`);
                } else {
                  navigateWithGuard(`/form/${routeParts[1]}/${id}`);
                }
                handleSidebarSelect();
              }}
            />
          </section>
        );
      }

      if (routeParts[0] === "form" && routeParts[1] && routeParts[2]) {
        const config = viewRegistry[routeParts[1]];
        if (!config) return null;
        const initialValues =
          routeParts[2] === "new"
            ? routeParts[1] === "campaigns"
              ? context.worldId
                ? { worldId: context.worldId }
                : undefined
              : routeParts[1] === "characters"
                ? context.worldId
                  ? { worldId: context.worldId }
                  : undefined
                : routeParts[1] === "entities"
                  ? context.worldId || entityTypeIdParam
                    ? {
                        ...(context.worldId ? { worldId: context.worldId } : {}),
                        ...(entityTypeIdParam ? { entityTypeId: entityTypeIdParam } : {})
                      }
                    : undefined
                  : routeParts[1] === "locations"
                    ? context.worldId || locationTypeIdParam
                      ? {
                          ...(context.worldId ? { worldId: context.worldId } : {}),
                          ...(locationTypeIdParam
                            ? { locationTypeId: locationTypeIdParam }
                            : {})
                        }
                      : undefined
                  : routeParts[1] === "entity_types"
                    ? context.worldId
                      ? { worldId: context.worldId }
                      : undefined
                    : routeParts[1] === "location_types"
                      ? context.worldId
                        ? { worldId: context.worldId }
                        : undefined
                : undefined
            : undefined;
        const initialLabels =
          routeParts[2] === "new"
            ? {
                ...(context.worldLabel ? { worldId: context.worldLabel } : {}),
                ...(selectedEntityType?.name
                  ? { entityTypeId: selectedEntityType.name }
                  : {})
              }
            : undefined;
      return (
        <section className="app__panel app__panel--wide">
            <FormView
              token={token}
              viewKey={config.formKey}
              recordId={routeParts[2]}
                onBack={() => {
                  if (routeParts[1] === "entities") {
                    navigateWithGuard(lastEntitiesListRoute ?? "/list/entities");
                    return;
                  }
                  const listPath = `/list/${routeParts[1]}`;
                  navigateWithGuard(listPath);
                }}
              currentUserId={user.id}
              currentUserLabel={user.name ?? user.email}
              currentUserRole={user.role}
              initialValues={initialValues}
              initialLabels={initialLabels}
              contextWorldId={context.worldId}
              contextWorldLabel={context.worldLabel}
              contextCampaignId={context.campaignId}
              contextCharacterId={context.characterId}
              onContextSwitch={handleContextSwitch}
            />
        </section>
      );
    }

    if (routeParts[0] === "admin" && routeParts[1]) {
      if (user.role !== "ADMIN") {
        return (
          <section className="app__panel">
            <h1>Forbidden</h1>
            <p>Admin access required.</p>
          </section>
        );
      }

      const config = adminViewRegistry[routeParts[1]];
      if (!config) return null;

      if (routeParts[2]) {
        return (
          <section className="app__panel app__panel--wide">
            <FormView
              token={token}
              viewKey={config.formKey}
              recordId={routeParts[2]}
              onBack={() => {
                navigateWithGuard(`/admin/${routeParts[1]}`);
              }}
              currentUserId={user.id}
              currentUserLabel={user.name ?? user.email}
              currentUserRole={user.role}
              contextWorldLabel={context.worldLabel}
              onContextSwitch={handleContextSwitch}
            />
          </section>
        );
      }

      return (
        <section className="app__panel app__panel--wide">
            <ListView
              token={token}
              viewKey={config.listKey}
              formViewKey={config.formKey}
              currentUserRole={user.role}
              onOpenForm={(id) => {
                navigateWithGuard(`/admin/${routeParts[1]}/${id}`);
                handleSidebarSelect();
              }}
            />
        </section>
      );
    }

    if (route === "/home") {
      return (
        <section className="app__panel">
          <h1>Home</h1>
          <p>
            Your configured landing page. Use the Menu to jump into worlds, campaigns,
            and character workspaces.
          </p>
        </section>
      );
    }

    return (
      <section className="app__panel">
        <h1>Campaign workspace</h1>
        <p>
          You are signed in. Next up we can wire in the data model, authorization
          rules, and the context-aware UI.
        </p>
      </section>
    );
  };

    return (
      <div className="app">
        {user ? (
          <>
          <header className="app__header">
            <a className="app__brand" href={`#${homepage}`}>
              <span className="app__logo">TTRPG</span>
              <span className="app__brand-text">Database</span>
            </a>

            <div className="app__header-nav">
              <button
                type="button"
                className={`header-link ${sidebarMode === "menu" ? "is-active" : ""}`}
                onClick={() => toggleSidebar("menu")}
              >
                Menu
              </button>
              <button
                type="button"
                className={`header-link ${sidebarMode === "favorites" ? "is-active" : ""}`}
                onClick={() => toggleSidebar("favorites")}
              >
                Favorites
              </button>
            </div>

            <div className="app__context">
              <div
                className="context-panel"
                ref={contextPanelRef}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setContextOpen(false);
                }}
              >
                <button
                  type="button"
                  className="context-pill context-pill--button"
                  aria-haspopup="dialog"
                  aria-expanded={contextOpen}
                  onClick={() => setContextOpen((open) => !open)}
                >
                  <span className="context-pill__title">Game Context</span>
                  <span className="context-pill__value">
                    {contextSummary ?? "No context selected"}
                  </span>
                </button>
                {contextOpen ? (
                  <div className="context-popover" role="dialog" aria-label="Game context">
                    <ContextBar
                      token={token}
                      context={context}
                      onChange={setContext}
                      onReset={() => setContext({})}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="app__header-actions">
              <div
                className="app__user"
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                  setProfileOpen(false);
                }}
              >
                <button
                  type="button"
                  className="profile-button"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((open) => !open)}
                >
                  {(user.name ?? user.email).charAt(0).toUpperCase()}
                </button>
                {profileOpen ? (
                  <>
                    <div className="profile-menu__overlay" onClick={() => setProfileOpen(false)} />
                    <div className="profile-menu" role="menu">
                    <div className="profile-menu__header">
                      <div className="profile-menu__name">{user.name ?? user.email}</div>
                      <div className="profile-menu__meta">{user.role}</div>
                    </div>
                    <a className="profile-menu__item" href="#/profile" role="menuitem">
                      Profile
                    </a>
                    <button
                      type="button"
                      className="profile-menu__item profile-menu__item--danger"
                      onClick={handleLogout}
                      role="menuitem"
                    >
                      Log out
                    </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <div className="app__body">
            {isSidebarOpen && !isSidebarPinned ? (
              <div className="sidebar__overlay" onClick={handleSidebarClose} />
            ) : null}
            <aside className={`sidebar ${isSidebarOpen ? "sidebar--open" : ""}`}>
              <div className="sidebar__panel">
                <div className="sidebar__header">
                  <div className="sidebar__title">{sidebarTitle}</div>
                  <button
                    type="button"
                    className={`pin-button ${isSidebarPinned ? "is-pinned" : ""}`}
                    onClick={toggleSidebarPin}
                    aria-pressed={isSidebarPinned}
                    title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                  >
                    <span className="pin-button__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                        <path d="M9 3h6v2l-1 1v4l3 3v2H7v-2l3-3V6L9 5V3Zm2 14h2v4l-1 1-1-1v-4Z" />
                      </svg>
                    </span>
                  </button>
                </div>
                  {sidebarMode === "menu" ? (
                  <nav className="sidebar__nav">
                    <button
                      type="button"
                      onClick={() => {
                        navigateWithGuard("/list/worlds");
                        handleSidebarSelect();
                      }}
                    >
                      Worlds
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigateWithGuard("/list/campaigns");
                        handleSidebarSelect();
                      }}
                    >
                      Campaigns
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigateWithGuard("/list/characters");
                        handleSidebarSelect();
                      }}
                    >
                      Characters
                    </button>
                    {context.worldId ? (
                      entityTypeStats.length > 0 ? (
                        <div className="sidebar__section">
                          <span className="sidebar__section-title">Entities</span>
                          <div className="sidebar__section-body sidebar__entity-list">
                            <button
                              type="button"
                              className="sidebar__entity-item"
                              onClick={() => {
                                navigateWithGuard("/list/entities");
                                handleSidebarSelect();
                              }}
                            >
                              <span>All Entities</span>
                            </button>
                            {entityTypeStats.map((type) => (
                              <button
                                key={type.id}
                                type="button"
                                className="sidebar__entity-item"
                                onClick={() => {
                                  navigateWithGuard(`/list/entities?entityTypeId=${type.id}`);
                                  handleSidebarSelect();
                                }}
                              >
                                <span>{type.name}</span>
                                <span className="sidebar__entity-count">{type.count}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="sidebar__section">
                          <span className="sidebar__section-title">Entities</span>
                          <div className="sidebar__section-body sidebar__entity-list">
                            <button
                              type="button"
                              className="sidebar__entity-item"
                              onClick={() => {
                                navigateWithGuard("/list/entities");
                                handleSidebarSelect();
                              }}
                            >
                              <span>All Entities</span>
                            </button>
                          </div>
                        </div>
                      )
                    ) : null}
                    {context.worldId ? (
                      <div className="sidebar__section">
                        <span className="sidebar__section-title">Locations</span>
                        <div className="sidebar__section-body sidebar__entity-list">
                          <button
                            type="button"
                            className="sidebar__entity-item"
                            onClick={() => {
                              navigateWithGuard("/list/locations");
                              handleSidebarSelect();
                            }}
                          >
                            <span>All Locations</span>
                          </button>
                          {locationMenuTypes.map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              className="sidebar__entity-item"
                              onClick={() => {
                                navigateWithGuard(`/list/locations?locationTypeId=${type.id}`);
                                handleSidebarSelect();
                              }}
                            >
                              <span>{type.name}</span>
                              <span className="sidebar__entity-count">{type.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {worldAdminAllowed ? (
                      <div className="sidebar__section">
                        <button
                          type="button"
                          className="sidebar__section-toggle"
                          onClick={() => setWorldAdminExpanded((current) => !current)}
                        >
                          <span className="sidebar__section-title">World Admin</span>
                          <span
                            className={`sidebar__chevron ${worldAdminExpanded ? "is-open" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                        {worldAdminExpanded ? (
                          <div className="sidebar__section-body sidebar__subsections">
                            <div className="sidebar__subsection">
                              <span className="sidebar__subsection-title">Entity Admin</span>
                              <div className="sidebar__subsection-body">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/entity_types");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Entity Types
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/entity_fields");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Entity Fields
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/entity_field_choices");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Field Choices
                                </button>
                              </div>
                            </div>
                            <div className="sidebar__subsection">
                              <span className="sidebar__subsection-title">Location Admin</span>
                              <div className="sidebar__subsection-body">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/location_types");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Location Types
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/location_type_fields");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Location Fields
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/location_type_field_choices");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Location Field Choices
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigateWithGuard("/list/location_type_rules");
                                    handleSidebarSelect();
                                  }}
                                >
                                  Location Rules
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {user.role === "ADMIN" ? (
                      <div className="sidebar__section">
                        <button
                          type="button"
                          className="sidebar__section-toggle"
                          onClick={() => setAdminExpanded((current) => !current)}
                        >
                          <span className="sidebar__section-title">Admin</span>
                          <span
                            className={`sidebar__chevron ${adminExpanded ? "is-open" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                        {adminExpanded ? (
                        <div className="sidebar__section-body">
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/system_choices");
                            handleSidebarSelect();
                          }}
                        >
                          System Choices
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/system_properties");
                            handleSidebarSelect();
                          }}
                        >
                          System Properties
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/user_preferences");
                            handleSidebarSelect();
                          }}
                        >
                          User Preferences
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/system_controls");
                            handleSidebarSelect();
                          }}
                        >
                          System Controls
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/system_related_lists");
                            handleSidebarSelect();
                          }}
                        >
                          Related Lists
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/system_related_list_fields");
                            handleSidebarSelect();
                          }}
                        >
                          Related List Fields
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigateWithGuard("/admin/users");
                            handleSidebarSelect();
                          }}
                        >
                          Users
                        </button>
                        </div>
                        ) : null}
                      </div>
                    ) : null}
                  </nav>
                ) : null}
                {sidebarMode === "favorites" ? (
                  <div className="sidebar__empty" onClick={handleSidebarSelect}>
                    No favorites yet.
                  </div>
                ) : null}
                {sidebarMode === "collapsed" ? (
                  <div className="sidebar__empty">Select Menu or Favorites.</div>
                ) : null}
              </div>
            </aside>

            <main className="app__main">
              {globalError ? (
                <div className="global-error">
                  <span>{globalError}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setGlobalError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
              <ErrorBoundary resetKey={route}>{renderContent()}</ErrorBoundary>
            </main>
          </div>
        </>
      ) : (
        <main className="app__main login__page">
          <section className="login">
            <div className="login__panel">
              <h1>Sign in</h1>
              <p>Use the seeded accounts to explore the interface.</p>
              <form className="login__form" onSubmit={handleLogin}>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="admin@example.com"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Admin123!"
                    required
                  />
                </label>
                {status ? <div className="login__status">{status}</div> : null}
                <button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
            <div className="login__aside">
              <h2>Seeded users</h2>
              <div className="login__seed">
                <strong>Admin</strong>
                <span>admin@example.com</span>
                <span>Admin123!</span>
              </div>
              <div className="login__seed">
                <strong>User</strong>
                <span>user@example.com</span>
                <span>User123!</span>
              </div>
            </div>
          </section>
        </main>
      )}
      </div>
    );
  }

function App() {
  return (
    <PopoutProvider>
      <AppShell />
    </PopoutProvider>
  );
}

export default App;
