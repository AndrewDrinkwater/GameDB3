import { useCallback, useEffect, useMemo, useState } from "react";
import SessionNotes from "./SessionNotes";
import EntitySidePanel from "./EntitySidePanel";
import LocationSidePanel from "./LocationSidePanel";
import { dispatchUnauthorized } from "../utils/auth";

type SessionEntry = {
  id: string;
  title: string;
  createdAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  worldId: string;
  campaignId?: string | null;
  noteCount?: number;
};

type SessionsPanelProps = {
  token: string;
  worldId?: string;
  campaignId?: string;
  contextCharacterId?: string;
  currentUserId?: string;
  sessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onOpenEntity: (entityId: string) => void;
  onOpenLocation: (locationId: string) => void;
};

const formatSessionDate = (value?: string | null) => {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
};

const formatSessionMeta = (session: SessionEntry) => {
  const dateLabel = formatSessionDate(session.startedAt ?? session.createdAt);
  const noteCount = session.noteCount ?? 0;
  return `${dateLabel} • ${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
};

export default function SessionsPanel({
  token,
  worldId,
  campaignId,
  contextCharacterId,
  currentUserId,
  sessionId,
  onSelectSession,
  onOpenEntity,
  onOpenLocation
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [entityPanelId, setEntityPanelId] = useState<string | null>(null);
  const [locationPanelId, setLocationPanelId] = useState<string | null>(null);

  const canLoad = Boolean(campaignId);
  const canCreate = Boolean(campaignId);

  const loadSessions = useCallback(async () => {
    if (!worldId || !campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ worldId });
      if (campaignId) params.set("campaignId", campaignId);
      const response = await fetch(`/api/sessions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load sessions.");
      }
      const data = (await response.json()) as SessionEntry[];
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [token, worldId, campaignId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleCreate = useCallback(async () => {
    if (!worldId || !campaignId || createTitle.trim() === "") return;
    setCreating(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          worldId,
          campaignId: campaignId ?? null,
          title: createTitle.trim()
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to create session.");
      }
      const created = (await response.json()) as SessionEntry;
      setSessions((current) => [created, ...current]);
      setCreateTitle("");
      setCreateOpen(false);
      onSelectSession(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create session.");
    } finally {
      setCreating(false);
    }
  }, [token, worldId, campaignId, createTitle, onSelectSession]);

  const sessionLookup = useMemo(
    () => new Map(sessions.map((session) => [session.id, session] as const)),
    [sessions]
  );
  const activeSession = sessionId ? sessionLookup.get(sessionId) : undefined;

  if (!canLoad) {
    return (
      <section className="app__panel">
        <h1>Sessions</h1>
        <p>Select a campaign context to view sessions.</p>
      </section>
    );
  }

  return (
    <section className="app__panel app__panel--wide">
      <div className="sessions-panel">
        <div className="sessions-panel__sidebar">
          <div className="sessions-panel__header">
            <div>
              <h2>Sessions</h2>
              <p>
                {campaignId
                  ? "Campaign sessions for this context."
                  : "World sessions for this context."}
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => setCreateOpen((current) => !current)}
              disabled={!canCreate}
            >
              New session
            </button>
          </div>
          {createOpen ? (
            <div className="sessions-panel__create">
              <label>
                Session title
                <input
                  type="text"
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder="Session 12: The Glass Road"
                />
              </label>
              <div className="sessions-panel__create-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateTitle("");
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleCreate}
                  disabled={creating || createTitle.trim() === ""}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="sessions-panel__list">
            {loading ? <div className="sessions-panel__state">Loading sessions...</div> : null}
            {error ? <div className="sessions-panel__state">{error}</div> : null}
            {!loading && !error && sessions.length === 0 ? (
              <div className="sessions-panel__state">No sessions yet.</div>
            ) : null}
            {!loading && !error
              ? sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    className={`sessions-panel__item ${
                      sessionId === session.id ? "is-active" : ""
                    }`}
                    onClick={() => onSelectSession(session.id)}
                  >
                    <span className="sessions-panel__item-title">{session.title}</span>
                    <span className="sessions-panel__item-meta">
                      {formatSessionMeta(session)}
                    </span>
                  </button>
                ))
              : null}
          </div>
        </div>
        <div className="sessions-panel__content">
          {activeSession ? (
            <SessionNotes
              token={token}
              sessionId={activeSession.id}
              worldId={activeSession.worldId}
              campaignId={activeSession.campaignId ?? undefined}
              currentUserId={currentUserId}
              onOpenEntity={(entityId) => {
                setLocationPanelId(null);
                setEntityPanelId(entityId);
              }}
              onOpenLocation={(locationId) => {
                setEntityPanelId(null);
                setLocationPanelId(locationId);
              }}
            />
          ) : (
            <div className="sessions-panel__empty">
              <h3>Select a session</h3>
              <p>Pick a session to start capturing notes.</p>
            </div>
          )}
        </div>
      </div>
      <EntitySidePanel
        token={token}
        entityId={entityPanelId}
        contextCampaignId={campaignId}
        contextCharacterId={contextCharacterId}
        onClose={() => setEntityPanelId(null)}
        onOpenRecord={(id) => {
          setEntityPanelId(null);
          onOpenEntity(id);
        }}
      />
      <LocationSidePanel
        token={token}
        locationId={locationPanelId}
        contextCampaignId={campaignId}
        contextCharacterId={contextCharacterId}
        onClose={() => setLocationPanelId(null)}
        onOpenRecord={(id) => {
          setLocationPanelId(null);
          onOpenLocation(id);
        }}
      />
    </section>
  );
}
