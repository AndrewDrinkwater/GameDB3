import { useCallback, useEffect, useState } from "react";
import { Mention, MentionsInput } from "react-mentions";
import { dispatchUnauthorized } from "../utils/auth";

type NoteTag = {
  id: string;
  tagType: "ENTITY" | "LOCATION";
  targetId: string;
  label: string;
  canAccess: boolean;
};

type NoteEntry = {
  id: string;
  body: string;
  visibility: "PRIVATE" | "SHARED";
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  authorLabel?: string;
  authorRoleLabel?: string | null;
  tags: NoteTag[];
};

type EntityNotesProps = {
  token: string;
  entityId: string;
  worldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  currentUserRole?: "ADMIN" | "USER";
  onOpenEntity: (entityId: string) => void;
};

const tagPattern = /@\[(.+?)\]\((entity|location):([^)]+)\)/g;

const formatTimestamp = (value: string) => new Date(value).toLocaleString();

const renderNoteBody = (
  body: string,
  tagMap: Map<string, NoteTag>,
  onTagClick: (tag: NoteTag) => void
) => {
  tagPattern.lastIndex = 0;
  const parts: Array<JSX.Element | string> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = tagPattern.exec(body))) {
    const [full, label, type, targetId] = match;
    const start = match.index;
    const end = start + full.length;
    if (start > lastIndex) {
      parts.push(body.slice(lastIndex, start));
    }
    const key = `${type.toUpperCase()}:${targetId}`;
    const tag = tagMap.get(key) ?? {
      id: `${key}-inline`,
      tagType: type === "location" ? "LOCATION" : "ENTITY",
      targetId,
      label,
      canAccess: false
    };
    parts.push(
      <button
        type="button"
        key={`${start}-${targetId}`}
        className={`note-tag note-tag--${type} ${tag.canAccess ? "" : "is-locked"}`}
        onClick={() => onTagClick(tag)}
        aria-disabled={!tag.canAccess}
        title={tag.canAccess ? "Open tagged item" : "Access limited"}
      >
        @{tag.label}
      </button>
    );
    lastIndex = end;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  if (parts.length === 0) {
    parts.push(body);
  }

  return parts;
};

export default function EntityNotes({
  token,
  entityId,
  worldId,
  contextCampaignId,
  contextCharacterId,
  currentUserRole,
  onOpenEntity
}: EntityNotesProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("SHARED");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<{ noteId: string; message: string } | null>(
    null
  );

  const canShare = Boolean(contextCampaignId);
  const canAttemptPost = Boolean(currentUserRole);

  const resetComposer = () => {
    setBody("");
    setVisibility(canShare ? "SHARED" : "PRIVATE");
  };

  const loadNotes = useCallback(async () => {
    if (!entityId || entityId === "new") return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      const response = await fetch(
        `/api/entities/${entityId}/notes?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load notes.");
      }
      const data = (await response.json()) as NoteEntry[];
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notes.");
    } finally {
      setLoading(false);
    }
  }, [entityId, token, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (canShare) {
      setVisibility("SHARED");
      return;
    }
    setVisibility("PRIVATE");
  }, [canShare]);

  const handleTagClick = (noteId: string, tag: NoteTag) => {
    if (tag.tagType !== "ENTITY") {
      setNotice({ noteId, message: "Locations are not available yet." });
      return;
    }
    if (!tag.canAccess) {
      setNotice({
        noteId,
        message: "You can see this tag, but you do not have access to the entity."
      });
      return;
    }
    setNotice(null);
    onOpenEntity(tag.targetId);
  };

  const fetchTagSuggestions = useCallback(
    async (query: string, callback: (data: Array<{ id: string; display: string }>) => void) => {
      if (!worldId) {
        callback([]);
        return;
      }
      const params = new URLSearchParams({ worldId });
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      if (query.trim() !== "") params.set("query", query);
      const response = await fetch(`/api/entity-tags?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        callback([]);
        return;
      }
      if (!response.ok) {
        callback([]);
        return;
      }
      const data = (await response.json()) as Array<{ id: string; label: string }>;
      callback(data.map((item) => ({ id: item.id, display: item.label })));
    },
    [token, worldId, contextCampaignId, contextCharacterId]
  );

  const handlePost = async () => {
    if (!body.trim()) return;
    if (entityId === "new") return;
    if (!canAttemptPost) return;
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(`/api/entities/${entityId}/notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          body,
          visibility,
          campaignId: contextCampaignId ?? null,
          characterId: contextCharacterId ?? null
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to post note.");
      }
      resetComposer();
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post note.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="entity-notes">
      <div className="entity-notes__composer">
        <div className="entity-notes__composer-header">
          <div>
            <h2>Notes</h2>
            <p>Post updates and tag entities with @ to keep the party aligned.</p>
          </div>
          <div className="note-visibility">
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value === "PRIVATE" ? "PRIVATE" : "SHARED")
                }
                disabled={!canShare}
              >
                <option value="SHARED">Shared</option>
                <option value="PRIVATE">Private</option>
              </select>
            </label>
            {!canShare ? (
              <span className="note-visibility__hint">
                Shared notes require a campaign context.
              </span>
            ) : null}
          </div>
        </div>

        <div className="note-editor">
          <MentionsInput
            className="mentions"
            value={body}
            onChange={(_, nextValue) => setBody(nextValue)}
            placeholder="Write a note and type @ to tag an entity."
            allowSuggestionsAboveCursor
          >
            <Mention
              trigger="@"
              data={fetchTagSuggestions}
              markup="@[__display__](entity:__id__)"
              displayTransform={(id, display) => `@${display}`}
            />
          </MentionsInput>
        </div>

        <div className="entity-notes__composer-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handlePost}
            disabled={posting || !body.trim() || entityId === "new"}
          >
            {posting ? "Posting..." : "Post note"}
          </button>
          <button type="button" className="ghost-button" onClick={resetComposer}>
            Clear
          </button>
          {entityId === "new" ? (
            <span className="note-visibility__hint">Save the entity to add notes.</span>
          ) : null}
        </div>
      </div>

      <div className="entity-notes__feed">
        {loading ? <div className="entity-notes__state">Loading notes...</div> : null}
        {error ? <div className="entity-notes__state">{error}</div> : null}
        {!loading && !error && notes.length === 0 ? (
          <div className="entity-notes__state">No notes yet.</div>
        ) : null}
        {!loading && !error
          ? notes.map((note) => {
              const noteTagMap = new Map<string, NoteTag>();
              note.tags.forEach((tag) => {
                noteTagMap.set(`${tag.tagType}:${tag.targetId}`, tag);
              });
              return (
                <div className="note-card" key={note.id}>
                  <div className="note-card__meta">
                    <div className="note-card__author">
                      {note.authorLabel ?? note.author.name ?? note.author.email}
                    </div>
                    <div className="note-card__timestamp">
                      {formatTimestamp(note.createdAt)}
                    </div>
                    {note.authorRoleLabel ? (
                      <span className="note-card__role">{note.authorRoleLabel}</span>
                    ) : null}
                    <span
                      className={`note-card__visibility ${
                        note.visibility === "PRIVATE"
                          ? "note-card__visibility--private"
                          : "note-card__visibility--shared"
                      }`}
                    >
                      {note.visibility === "PRIVATE" ? "Private" : "Shared"}
                    </span>
                  </div>
                  <div className="note-card__body">
                    {renderNoteBody(note.body, noteTagMap, (tag) =>
                      handleTagClick(note.id, tag)
                    )}
                  </div>
                  {notice && notice.noteId === note.id ? (
                    <div className="note-card__notice">{notice.message}</div>
                  ) : null}
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}
