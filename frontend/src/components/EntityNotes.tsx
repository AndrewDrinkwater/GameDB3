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
  visibility: "PRIVATE" | "SHARED" | "GM";
  shareWithArchitect?: boolean;
  shareCharacterIds?: string[];
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
  currentUserId?: string;
  currentUserRole?: "ADMIN" | "USER";
  onOpenEntity: (entityId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  discardVersion?: number;
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
  currentUserId,
  currentUserRole,
  onOpenEntity,
  onDirtyChange,
  discardVersion
}: EntityNotesProps) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED" | "GM">("SHARED");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<{ noteId: string; message: string } | null>(
    null
  );
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editVisibility, setEditVisibility] = useState<"PRIVATE" | "SHARED" | "GM">("PRIVATE");
  const [editSaving, setEditSaving] = useState(false);
  const [editOriginalBody, setEditOriginalBody] = useState("");
  const [editOriginalVisibility, setEditOriginalVisibility] = useState<
    "PRIVATE" | "SHARED" | "GM"
  >("PRIVATE");
  const [editOriginalShareWithArchitect, setEditOriginalShareWithArchitect] = useState(false);
  const [editOriginalShareCharacterIds, setEditOriginalShareCharacterIds] = useState<string[]>([]);
  const [isCampaignGm, setIsCampaignGm] = useState(false);
  const [isWorldArchitect, setIsWorldArchitect] = useState(false);
  const [characterOptions, setCharacterOptions] = useState<Choice[]>([]);
  const [shareWithArchitect, setShareWithArchitect] = useState(false);
  const [shareCharacterIds, setShareCharacterIds] = useState<string[]>([]);
  const [editShareWithArchitect, setEditShareWithArchitect] = useState(false);
  const [editShareCharacterIds, setEditShareCharacterIds] = useState<string[]>([]);

  const isAdmin = currentUserRole === "ADMIN";
  const canShare = Boolean(contextCampaignId);
  const canWriteWithoutCampaign = isAdmin || isWorldArchitect;
  const canAttemptPost = Boolean(currentUserRole) && (canShare || canWriteWithoutCampaign);
  const composerDisabled = !canAttemptPost || entityId === "new";

  const resetComposer = () => {
    setBody("");
    setVisibility(canShare ? "SHARED" : "PRIVATE");
    setShareWithArchitect(false);
    setShareCharacterIds([]);
  };

  const startEdit = (note: NoteEntry) => {
    setEditNoteId(note.id);
    setEditBody(note.body);
    setEditVisibility(note.visibility);
    setEditOriginalBody(note.body);
    setEditOriginalVisibility(note.visibility);
    setEditShareWithArchitect(Boolean(note.shareWithArchitect));
    setEditShareCharacterIds(note.shareCharacterIds ?? []);
    setEditOriginalShareWithArchitect(Boolean(note.shareWithArchitect));
    setEditOriginalShareCharacterIds(note.shareCharacterIds ?? []);
  };

  const cancelEdit = () => {
    setEditNoteId(null);
    setEditBody("");
    setEditVisibility("PRIVATE");
    setEditOriginalBody("");
    setEditOriginalVisibility("PRIVATE");
    setEditShareWithArchitect(false);
    setEditShareCharacterIds([]);
    setEditOriginalShareWithArchitect(false);
    setEditOriginalShareCharacterIds([]);
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

  useEffect(() => {
    if (!token || !worldId) {
      setIsCampaignGm(false);
      setIsWorldArchitect(false);
      return;
    }
    let ignore = false;
    const loadSummary = async () => {
      const params = new URLSearchParams({ worldId });
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      const response = await fetch(`/api/context/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as {
        worldRole?: string | null;
        campaignRole?: string | null;
      };
      if (!ignore) {
        setIsWorldArchitect(data.worldRole === "Architect");
        setIsCampaignGm(data.campaignRole === "GM");
      }
    };
    void loadSummary();
    return () => {
      ignore = true;
    };
  }, [token, worldId, contextCampaignId]);

  useEffect(() => {
    if (!contextCampaignId || !isCampaignGm) {
      setCharacterOptions([]);
      return;
    }
    let ignore = false;
    const loadCharacters = async () => {
      const response = await fetch(
        `/api/related-lists/campaign.characters?parentId=${contextCampaignId}`,
        {
        headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as {
        items: Array<{ relatedId: string; relatedData: Record<string, unknown> }>;
      };
      if (!ignore) {
        const options = data.items.map((item) => ({
          value: item.relatedId,
          label: item.relatedData.name ? String(item.relatedData.name) : item.relatedId
        }));
        setCharacterOptions(options);
      }
    };
    void loadCharacters();
    return () => {
      ignore = true;
    };
  }, [token, contextCampaignId, isCampaignGm]);

  useEffect(() => {
    resetComposer();
    cancelEdit();
  }, [entityId]);

  useEffect(() => {
    if (discardVersion === undefined) return;
    resetComposer();
    cancelEdit();
  }, [discardVersion]);

  useEffect(() => {
    if (visibility === "GM") return;
    setShareWithArchitect(false);
    setShareCharacterIds([]);
  }, [visibility]);

  useEffect(() => {
    if (editVisibility === "GM") return;
    setEditShareWithArchitect(false);
    setEditShareCharacterIds([]);
  }, [editVisibility]);

  useEffect(() => {
    const normalizeIds = (ids: string[]) => [...ids].sort().join(",");
    const composerDirty =
      body.trim().length > 0 ||
      (visibility === "GM" && (shareWithArchitect || shareCharacterIds.length > 0));
    const editDirty =
      Boolean(editNoteId) &&
      (editBody.trim() !== editOriginalBody ||
        editVisibility !== editOriginalVisibility ||
        (editVisibility === "GM" &&
          (editShareWithArchitect !== editOriginalShareWithArchitect ||
            normalizeIds(editShareCharacterIds) !==
              normalizeIds(editOriginalShareCharacterIds))));
    onDirtyChange?.(composerDirty || editDirty);
  }, [
    body,
    editBody,
    editNoteId,
    editOriginalBody,
    editOriginalVisibility,
    editVisibility,
    shareWithArchitect,
    shareCharacterIds,
    editShareWithArchitect,
    editShareCharacterIds,
    editOriginalShareWithArchitect,
    editOriginalShareCharacterIds,
    onDirtyChange
  ]);

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
    if (visibility === "GM" && !isCampaignGm) {
      setError("GM notes require campaign GM access.");
      return;
    }
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
          characterId: contextCharacterId ?? null,
          shareWithArchitect: visibility === "GM" ? shareWithArchitect : undefined,
          shareCharacterIds: visibility === "GM" ? shareCharacterIds : undefined
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

  const handleEditSave = async () => {
    if (!editNoteId || !editBody.trim()) return;
    if (editVisibility === "GM" && !isCampaignGm) {
      setError("GM notes require campaign GM access.");
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/notes/${editNoteId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          body: editBody,
          visibility: editVisibility,
          shareWithArchitect: editVisibility === "GM" ? editShareWithArchitect : undefined,
          shareCharacterIds: editVisibility === "GM" ? editShareCharacterIds : undefined
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update note.");
      }
      const updated = (await response.json()) as NoteEntry;
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update note.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Delete this note?")) return;
    setError(null);
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to delete note.");
      }
      setNotes((current) => current.filter((note) => note.id !== noteId));
      if (editNoteId === noteId) {
        cancelEdit();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete note.");
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
                  setVisibility(event.target.value as "PRIVATE" | "SHARED" | "GM")
                }
                disabled={!canShare && !canWriteWithoutCampaign}
              >
                <option value="PRIVATE">Private</option>
                {canShare ? <option value="SHARED">Shared</option> : null}
                {isCampaignGm && canShare ? <option value="GM">GM Notes</option> : null}
              </select>
            </label>
            {!canShare && !canWriteWithoutCampaign ? (
              <span className="note-visibility__hint">
                Campaign context required unless you are a world architect.
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
            disabled={composerDisabled}
          >
            <Mention
              trigger="@"
              data={fetchTagSuggestions}
              markup="@[__display__](entity:__id__)"
              displayTransform={(id, display) => `@${display}`}
            />
          </MentionsInput>
        </div>

        {visibility === "GM" ? (
          <div className="note-gm-share">
            <label className="note-gm-share__option">
              <input
                type="checkbox"
                checked={shareWithArchitect}
                onChange={(event) => setShareWithArchitect(event.target.checked)}
                disabled={composerDisabled}
              />
              Share with Architect
            </label>
            <div className="note-gm-share__players">
              <div className="note-gm-share__label">Share with players</div>
              {characterOptions.length === 0 ? (
                <div className="note-gm-share__empty">No campaign characters found.</div>
              ) : (
                characterOptions.map((option) => (
                  <label key={option.value} className="note-gm-share__option">
                    <input
                      type="checkbox"
                      checked={shareCharacterIds.includes(option.value)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setShareCharacterIds((current) =>
                          checked
                            ? [...current, option.value]
                            : current.filter((id) => id !== option.value)
                        );
                      }}
                      disabled={composerDisabled}
                    />
                    {option.label}
                  </label>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="entity-notes__composer-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handlePost}
            disabled={posting || !body.trim() || entityId === "new" || !canAttemptPost}
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
                          : note.visibility === "GM"
                            ? "note-card__visibility--gm"
                            : "note-card__visibility--shared"
                      }`}
                    >
                      {note.visibility === "PRIVATE"
                        ? "Private"
                        : note.visibility === "GM"
                          ? "GM"
                          : "Shared"}
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
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleDelete(note.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {editNoteId === note.id ? (
                    <div className="note-card__edit">
                      <MentionsInput
                        className="mentions"
                        value={editBody}
                        onChange={(_, nextValue) => setEditBody(nextValue)}
                        placeholder="Update your note..."
                        allowSuggestionsAboveCursor
                      >
                        <Mention
                          trigger="@"
                          data={fetchTagSuggestions}
                          markup="@[__display__](entity:__id__)"
                          displayTransform={(id, display) => `@${display}`}
                        />
                      </MentionsInput>
                      <div className="note-card__edit-actions">
                        <label>
                          Visibility
                          <select
                            value={editVisibility}
                            onChange={(event) =>
                              setEditVisibility(event.target.value as "PRIVATE" | "SHARED" | "GM")
                            }
                            disabled={!canShare && !canWriteWithoutCampaign}
                          >
                            <option value="PRIVATE">Private</option>
                            {canShare ? <option value="SHARED">Shared</option> : null}
                            {isCampaignGm && canShare ? (
                              <option value="GM">GM Notes</option>
                            ) : null}
                          </select>
                        </label>
                        {editVisibility === "GM" ? (
                          <div className="note-gm-share">
                            <label className="note-gm-share__option">
                              <input
                                type="checkbox"
                                checked={editShareWithArchitect}
                                onChange={(event) =>
                                  setEditShareWithArchitect(event.target.checked)
                                }
                                disabled={editSaving}
                              />
                              Share with Architect
                            </label>
                            <div className="note-gm-share__players">
                              <div className="note-gm-share__label">Share with players</div>
                              {characterOptions.length === 0 ? (
                                <div className="note-gm-share__empty">
                                  No campaign characters found.
                                </div>
                              ) : (
                                characterOptions.map((option) => (
                                  <label key={option.value} className="note-gm-share__option">
                                    <input
                                      type="checkbox"
                                      checked={editShareCharacterIds.includes(option.value)}
                                      onChange={(event) => {
                                        const checked = event.target.checked;
                                        setEditShareCharacterIds((current) =>
                                          checked
                                            ? [...current, option.value]
                                            : current.filter((id) => id !== option.value)
                                        );
                                      }}
                                      disabled={editSaving}
                                    />
                                    {option.label}
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}
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
                            disabled={editSaving || !editBody.trim()}
                          >
                            {editSaving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="note-card__body">
                      {renderNoteBody(note.body, noteTagMap, (tag) =>
                        handleTagClick(note.id, tag)
                      )}
                    </div>
                  )}
                  {notice && notice.noteId === note.id ? (
                    <div className="note-card__notice">
                      <span>{notice.message}</span>
                      <button
                        type="button"
                        className="note-card__notice-close"
                        onClick={() => setNotice(null)}
                        aria-label="Dismiss notice"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}
