import { memo, useCallback, useEffect, useRef, useState } from "react";
import RichTextNoteEditor from "./RichTextNoteEditor";
import { dispatchUnauthorized } from "../utils/auth";
import {
  buildSessionNoteContent,
  getSessionNoteText,
  SessionNoteContent,
  SessionNoteReference
} from "../utils/sessionNotes";

type SessionNoteEntry = {
  id: string;
  content: SessionNoteContent;
  createdAt: string;
  updatedAt: string;
  visibility: "SHARED" | "PRIVATE";
  author: { id: string; name: string | null; email: string };
  references: SessionNoteReference[];
};

type SessionNotesProps = {
  token: string;
  sessionId: string;
  worldId: string;
  campaignId?: string;
  currentUserId?: string;
  onOpenEntity: (entityId: string) => void;
  onOpenLocation: (locationId: string) => void;
};

const inlineTokenPattern =
  /@\[(.+?)\]\((entity|location):([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|(https?:\/\/[^\s]+)/g;

const renderInline = (
  text: string,
  referenceMap: Map<string, SessionNoteReference>,
  onOpenEntity: (entityId: string) => void,
  onOpenLocation: (locationId: string) => void
) => {
  inlineTokenPattern.lastIndex = 0;
  const parts: Array<JSX.Element | string> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = inlineTokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      const label = match[1];
      const targetType = match[2] === "location" ? "location" : "entity";
      const targetId = match[3];
      const key = `${targetType}:${targetId}`;
      const refLabel = referenceMap.get(key)?.label ?? label;
      parts.push(
        <button
          type="button"
          key={`${match.index}-${key}`}
          className={`note-tag note-tag--${targetType}`}
          onClick={() => {
            if (targetType === "location") {
              onOpenLocation(targetId);
            } else {
              onOpenEntity(targetId);
            }
          }}
        >
          @{refLabel}
        </button>
      );
    } else if (match[4]) {
      parts.push(
        <strong key={`${match.index}-bold`}>{match[4]}</strong>
      );
    } else if (match[5]) {
      parts.push(
        <em key={`${match.index}-italic`}>{match[5]}</em>
      );
    } else if (match[6]) {
      parts.push(
        <a
          key={`${match.index}-link`}
          href={match[6]}
          target="_blank"
          rel="noreferrer"
        >
          {match[6]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderSessionNoteText = (
  content: SessionNoteContent,
  onOpenEntity: (entityId: string) => void,
  onOpenLocation: (locationId: string) => void
) => {
  const lines = content.text.split("\n");
  const referenceMap = new Map(
    content.references.map((ref) => [`${ref.targetType}:${ref.targetId}`, ref] as const)
  );
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} className="session-note__list">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>
            {renderInline(item, referenceMap, onOpenEntity, onOpenLocation)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isList = line.startsWith("- ") || line.startsWith("* ");
    if (isList) {
      listItems.push(line.slice(2));
      return;
    }
    flushList(`list-${index}`);
    if (trimmed === "") {
      blocks.push(<div key={`spacer-${index}`} className="session-note__spacer" />);
      return;
    }
    blocks.push(
      <p key={`p-${index}`}>
        {renderInline(line, referenceMap, onOpenEntity, onOpenLocation)}
      </p>
    );
  });
  flushList("list-final");
  return blocks;
};

const SessionNoteComposer = ({
  token,
  sessionId,
  worldId,
  campaignId,
  onPublish
}: {
  token: string;
  sessionId: string;
  worldId: string;
  campaignId?: string;
  onPublish: (note: SessionNoteEntry) => void;
}) => {
  const [value, setValue] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [posting, setPosting] = useState(false);
  const [visibility, setVisibility] = useState<"SHARED" | "PRIVATE">("SHARED");
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef("");
  const dirtyRef = useRef(false);
  const draftExistsRef = useRef(false);

  const fetchTagSuggestions = useCallback(
    async (query: string, callback: (data: Array<{ id: string; display: string }>) => void) => {
      if (!worldId) {
        callback([]);
        return;
      }
      const params = new URLSearchParams({ worldId });
      if (campaignId) params.set("campaignId", campaignId);
      if (query.trim() !== "") params.set("query", query);
      try {
        const [entityResponse, locationResponse] = await Promise.all([
          fetch(`/api/entity-tags?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`/api/location-tags?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (entityResponse.status === 401 || locationResponse.status === 401) {
          dispatchUnauthorized();
          callback([]);
          return;
        }
        const entityData = entityResponse.ok
          ? ((await entityResponse.json()) as Array<{ id: string; label: string }>)
          : [];
        const locationData = locationResponse.ok
          ? ((await locationResponse.json()) as Array<{ id: string; label: string }>)
          : [];
        const options = [
          ...entityData.map((item) => ({ id: `entity:${item.id}`, display: item.label })),
          ...locationData.map((item) => ({ id: `location:${item.id}`, display: item.label }))
        ].sort((a, b) => a.display.localeCompare(b.display));
        callback(options);
      } catch {
        callback([]);
      }
    },
    [token, worldId, campaignId]
  );

  const saveDraft = useCallback(
    async (force?: boolean, overrideValue?: string) => {
      const currentValue = overrideValue ?? value;
      if (!dirtyRef.current && !force) return;
      if (currentValue.trim() === "") {
        if (draftExistsRef.current) {
          await fetch(`/api/sessions/${sessionId}/draft`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          draftExistsRef.current = false;
        }
        dirtyRef.current = false;
        lastSavedRef.current = "";
        return;
      }
      if (!force && currentValue === lastSavedRef.current) {
        dirtyRef.current = false;
        return;
      }
      const response = await fetch(`/api/sessions/${sessionId}/draft`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: buildSessionNoteContent(currentValue),
          visibility
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (response.ok) {
        dirtyRef.current = false;
        draftExistsRef.current = true;
        lastSavedRef.current = currentValue;
      }
    },
    [sessionId, token, value, visibility]
  );

  const queueSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void saveDraft();
    }, 2500);
  }, [saveDraft]);

  useEffect(() => {
    if (!sessionId) return;
    let ignore = false;
    const loadDraft = async () => {
      setLoadingDraft(true);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/draft`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          setLoadingDraft(false);
          return;
        }
        const payload = (await response.json()) as {
          content: SessionNoteContent | null;
          visibility?: "SHARED" | "PRIVATE";
        };
        if (ignore) return;
        if (payload.content) {
          const text = getSessionNoteText(payload.content);
          setValue(text);
          lastSavedRef.current = text;
          draftExistsRef.current = true;
        }
        if (payload.visibility) {
          setVisibility(payload.visibility);
        }
      } finally {
        if (!ignore) setLoadingDraft(false);
      }
    };
    void loadDraft();
    return () => {
      ignore = true;
    };
  }, [sessionId, token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!dirtyRef.current) return;
      void saveDraft();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [saveDraft]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        void saveDraft(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [saveDraft]);

  const handleChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      queueSave();
    },
    [queueSave]
  );

  useEffect(() => {
    queueSave();
  }, [visibility, queueSave]);

  const handlePublish = useCallback(async () => {
    if (value.trim() === "") return;
    setPosting(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: buildSessionNoteContent(value),
          visibility
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        return;
      }
      const note = (await response.json()) as SessionNoteEntry;
      setValue("");
      setVisibility("SHARED");
      lastSavedRef.current = "";
      dirtyRef.current = false;
      draftExistsRef.current = false;
      onPublish(note);
    } finally {
      setPosting(false);
    }
  }, [sessionId, token, value, onPublish]);

  const composerDisabled = loadingDraft || posting;

  return (
    <div className="session-notes__composer">
      <div className="session-notes__composer-header">
        <div>
          <h3>Session notes</h3>
          <p>Capture the story as it unfolds. Use @ to reference entities or locations.</p>
        </div>
        <label className="session-notes__visibility">
          Visibility
          <select
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as "SHARED" | "PRIVATE")
            }
            disabled={composerDisabled}
          >
            <option value="SHARED">Shared</option>
            <option value="PRIVATE">Private</option>
          </select>
        </label>
      </div>
      <RichTextNoteEditor
        value={value}
        onChange={handleChange}
        onBlur={() => void saveDraft(true)}
        onReferenceInsert={() => void saveDraft(true)}
        fetchSuggestions={fetchTagSuggestions}
        placeholder="Write what just happened..."
        disabled={composerDisabled}
      />
      <div className="session-notes__composer-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handlePublish}
          disabled={posting || value.trim() === ""}
        >
          {posting ? "Posting..." : "Post note"}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setValue("");
            void saveDraft(true, "");
          }}
          disabled={composerDisabled}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

const MemoSessionNoteComposer = memo(SessionNoteComposer);

export default function SessionNotes({
  token,
  sessionId,
  worldId,
  campaignId,
  currentUserId,
  onOpenEntity,
  onOpenLocation
}: SessionNotesProps) {
  const [notes, setNotes] = useState<SessionNoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editVisibility, setEditVisibility] = useState<"SHARED" | "PRIVATE">("SHARED");
  const [editSaving, setEditSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/notes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load session notes.");
      }
      const data = (await response.json()) as SessionNoteEntry[];
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load session notes.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const handlePublish = useCallback((note: SessionNoteEntry) => {
    setNotes((current) => [note, ...current]);
  }, []);

  const startEdit = useCallback((note: SessionNoteEntry) => {
    setEditNoteId(note.id);
    setEditValue(getSessionNoteText(note.content));
    setEditVisibility(note.visibility);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditNoteId(null);
    setEditValue("");
    setEditVisibility("SHARED");
  }, []);

  const fetchTagSuggestions = useCallback(
    async (query: string, callback: (data: Array<{ id: string; display: string }>) => void) => {
      if (!worldId) {
        callback([]);
        return;
      }
      const params = new URLSearchParams({ worldId });
      if (campaignId) params.set("campaignId", campaignId);
      if (query.trim() !== "") params.set("query", query);
      try {
        const [entityResponse, locationResponse] = await Promise.all([
          fetch(`/api/entity-tags?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`/api/location-tags?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (entityResponse.status === 401 || locationResponse.status === 401) {
          dispatchUnauthorized();
          callback([]);
          return;
        }
        const entityData = entityResponse.ok
          ? ((await entityResponse.json()) as Array<{ id: string; label: string }>)
          : [];
        const locationData = locationResponse.ok
          ? ((await locationResponse.json()) as Array<{ id: string; label: string }>)
          : [];
        const options = [
          ...entityData.map((item) => ({ id: `entity:${item.id}`, display: item.label })),
          ...locationData.map((item) => ({ id: `location:${item.id}`, display: item.label }))
        ].sort((a, b) => a.display.localeCompare(b.display));
        callback(options);
      } catch {
        callback([]);
      }
    },
    [token, worldId, campaignId]
  );

  const handleEditSave = useCallback(async () => {
    if (!editNoteId || editValue.trim() === "") return;
    setEditSaving(true);
    try {
      const response = await fetch(`/api/session-notes/${editNoteId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: buildSessionNoteContent(editValue),
          visibility: editVisibility
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) return;
      const updated = (await response.json()) as SessionNoteEntry;
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
      cancelEdit();
    } finally {
      setEditSaving(false);
    }
  }, [editNoteId, editValue, editVisibility, token, cancelEdit]);

  return (
    <div className="session-notes">
      <div className="session-notes__header">
        <div>
          <h2>Session Notes</h2>
          <p>Fast, low-friction notes with structured references.</p>
        </div>
      </div>

      <MemoSessionNoteComposer
        token={token}
        sessionId={sessionId}
        worldId={worldId}
        campaignId={campaignId}
        onPublish={handlePublish}
      />

      <div className="session-notes__feed">
        {loading ? <div className="session-notes__state">Loading notes...</div> : null}
        {error ? <div className="session-notes__state">{error}</div> : null}
        {!loading && !error && notes.length === 0 ? (
          <div className="session-notes__state">No session notes yet.</div>
        ) : null}
        {!loading && !error
          ? notes.map((note) => (
              <div className="note-card" key={note.id}>
                <div className="note-card__meta">
                  <div className="note-card__author">
                    {note.author.name ?? note.author.email}
                  </div>
                  <div className="note-card__timestamp">
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                  <span
                    className={`note-card__visibility ${
                      note.visibility === "PRIVATE"
                        ? "note-card__visibility--private"
                        : "note-card__visibility--shared"
                    }`}
                  >
                    {note.visibility === "PRIVATE" ? "Private" : "Shared"}
                  </span>
                  {currentUserId && note.author.id === currentUserId ? (
                    <div className="note-card__actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEdit(note)}
                      >
                        Edit
                      </button>
                    </div>
                  ) : null}
                </div>
                {editNoteId === note.id ? (
                  <div className="note-card__edit">
                    <RichTextNoteEditor
                      value={editValue}
                      onChange={setEditValue}
                      fetchSuggestions={fetchTagSuggestions}
                      placeholder="Update the session note..."
                      disabled={editSaving}
                    />
                    <div className="note-card__edit-actions">
                      <label>
                        Visibility
                        <select
                          value={editVisibility}
                          onChange={(event) =>
                            setEditVisibility(event.target.value as "SHARED" | "PRIVATE")
                          }
                          disabled={editSaving}
                        >
                          <option value="SHARED">Shared</option>
                          <option value="PRIVATE">Private</option>
                        </select>
                      </label>
                      <div className="note-card__edit-buttons">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={cancelEdit}
                          disabled={editSaving}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={handleEditSave}
                          disabled={editSaving || editValue.trim() === ""}
                        >
                          {editSaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="note-card__body">
                    {renderSessionNoteText(note.content, onOpenEntity, onOpenLocation)}
                  </div>
                )}
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
