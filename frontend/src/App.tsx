import { useEffect, useMemo, useState } from "react";
import ListView from "./components/ListView";
import FormView from "./components/FormView";

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

const viewRegistry: Record<string, ViewConfig> = {
  worlds: { listKey: "worlds.list", formKey: "worlds.form", label: "Worlds" },
  campaigns: { listKey: "campaigns.list", formKey: "campaigns.form", label: "Campaigns" },
  characters: { listKey: "characters.list", formKey: "characters.form", label: "Characters" }
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

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(tokenStorageKey));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("collapsed");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [route, setRoute] = useState("/home");
  const [homepage, setHomepage] = useState("/home");

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
      .then((data: User) => {
        setUser(data);
        setToken(tokenValue);
        void resolvePreferences(tokenValue);
      })
      .catch(() => {
        localStorage.removeItem(tokenStorageKey);
        setToken(null);
      });
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
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(sidebarStorageKey, sidebarMode);
  }, [sidebarMode]);

  const isSidebarOpen = sidebarMode !== "collapsed";

  const resolvePreferences = async (tokenValue: string) => {
    try {
      const [userPrefsResponse, defaultsResponse] = await Promise.all([
        fetch("/api/user/preferences", {
          headers: { Authorization: `Bearer ${tokenValue}` }
        }),
        fetch("/api/user/preferences/defaults", {
          headers: { Authorization: `Bearer ${tokenValue}` }
        })
      ]);

      if (!userPrefsResponse.ok || !defaultsResponse.ok) {
        return;
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

      setHomepage(userHomepage ?? defaultHomepage ?? "/home");
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
    } catch {
      setHomepage("/home");
      setTheme("light");
      setIsSidebarPinned(true);
      setSidebarMode(resolveSidebarMode(true));
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
      await resolvePreferences(data.token);
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

  const toggleSidebarPin = () => {
    void setSidebarPinnedPreference(!isSidebarPinned);
  };

  const sidebarTitle = useMemo(() => {
    if (sidebarMode === "menu") return "Menu";
    if (sidebarMode === "favorites") return "Favorites";
    return "Navigation";
  }, [sidebarMode]);

  const routeParts = route.replace(/^#/, "").split("/").filter(Boolean);

  const renderContent = () => {
    if (!user || !token) return null;

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
          </div>
        </section>
      );
    }

    if (routeParts[0] === "list" && routeParts[1]) {
      const config = viewRegistry[routeParts[1]];
      if (!config) return null;
      return (
        <section className="app__panel app__panel--wide">
          <ListView
            token={token}
            viewKey={config.listKey}
            formViewKey={config.formKey}
            onOpenForm={(id) => {
              window.location.hash = `/form/${routeParts[1]}/${id}`;
              handleSidebarSelect();
            }}
          />
        </section>
      );
    }

    if (routeParts[0] === "form" && routeParts[1] && routeParts[2]) {
      const config = viewRegistry[routeParts[1]];
      if (!config) return null;
      return (
        <section className="app__panel app__panel--wide">
          <FormView
            token={token}
            viewKey={config.formKey}
            recordId={routeParts[2]}
            onBack={() => {
              window.location.hash = `/list/${routeParts[1]}`;
            }}
            currentUserId={user.id}
            currentUserLabel={user.name ?? user.email}
            currentUserRole={user.role}
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
                window.location.hash = `/admin/${routeParts[1]}`;
              }}
              currentUserId={user.id}
              currentUserLabel={user.name ?? user.email}
              currentUserRole={user.role}
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
            onOpenForm={(id) => {
              window.location.hash = `/admin/${routeParts[1]}/${id}`;
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
                className={`ghost-button ${sidebarMode === "menu" ? "is-active" : ""}`}
                onClick={() => toggleSidebar("menu")}
              >
                Menu
              </button>
              <button
                type="button"
                className={`ghost-button ${sidebarMode === "favorites" ? "is-active" : ""}`}
                onClick={() => toggleSidebar("favorites")}
              >
                Favorites
              </button>
            </div>

            <div className="app__context">
              <div className="context-pill">World</div>
              <div className="context-pill">Campaign</div>
              <div className="context-pill">Character</div>
            </div>

            <div className="app__header-actions">
              <div className="app__user">
                <span>
                  {user.name ?? user.email} - {user.role}
                </span>
                <a className="profile-link" href="#/profile">
                  {user.name ?? "Profile"}
                </a>
                <button type="button" className="ghost-button" onClick={handleLogout}>
                  Log out
                </button>
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
                        window.location.hash = "/list/worlds";
                        handleSidebarSelect();
                      }}
                    >
                      Worlds
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = "/list/campaigns";
                        handleSidebarSelect();
                      }}
                    >
                      Campaigns
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = "/list/characters";
                        handleSidebarSelect();
                      }}
                    >
                      Characters
                    </button>
                    {user.role === "ADMIN" ? (
                      <div className="sidebar__section">
                        <div className="sidebar__section-title">Admin</div>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/system_choices";
                            handleSidebarSelect();
                          }}
                        >
                          System Choices
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/system_properties";
                            handleSidebarSelect();
                          }}
                        >
                          System Properties
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/user_preferences";
                            handleSidebarSelect();
                          }}
                        >
                          User Preferences
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/system_controls";
                            handleSidebarSelect();
                          }}
                        >
                          System Controls
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/system_related_lists";
                            handleSidebarSelect();
                          }}
                        >
                          Related Lists
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/system_related_list_fields";
                            handleSidebarSelect();
                          }}
                        >
                          Related List Fields
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = "/admin/users";
                            handleSidebarSelect();
                          }}
                        >
                          Users
                        </button>
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

            <main className="app__main">{renderContent()}</main>
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

export default App;
