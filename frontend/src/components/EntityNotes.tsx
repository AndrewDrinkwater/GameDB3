import { useCallback, useEffect, useState } from "react";
import { Mention, MentionsInput } from "react-mentions";
import { dispatchUnauthorized } from "../utils/auth";
import type { SessionNoteContent, SessionNoteReference } from "../utils/sessionNotes";

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

type MentionEntry = NoteEntry & {
  entity?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
};

type SessionMentionEntry = {
  id: string;
  content: SessionNoteContent;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  visibility: "SHARED" | "PRIVATE";
  session?: { id: string; title?: string | null };
  references: SessionNoteReference[];
};

type EntityNotesProps = {
  token: string;
  recordId: string;
  recordType: "entity" | "location";
  worldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  currentUserId?: string;
  currentUserRole?: "ADMIN" | "USER";
  onOpenEntity: (entityId: string) => void;
  onOpenLocation: (locationId: string) => void;
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
  recordId,
  recordType,
  worldId,
  contextCampaignId,
  contextCharacterId,
  currentUserId,
  currentUserRole,
  onOpenEntity,
  onOpenLocation,
  onDirtyChange,
  discardVersion
}: EntityNotesProps) {
  const [activeTab, setActiveTab] = useState<"notes" | "mentions">("notes");
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<MentionEntry[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  const [sessionMentions, setSessionMentions] = useState<SessionMentionEntry[]>([]);
  const [sessionMentionsLoading, setSessionMentionsLoading] = useState(false);
  const [sessionMentionsError, setSessionMentionsError] = useState<string | null>(null);
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
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
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
  const composerDisabled = !canAttemptPost || recordId === "new";
  const recordPath = recordType === "location" ? "locations" : "entities";

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
    if (!recordId || recordId === "new") return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      const response = await fetch(
        `/api/${recordPath}/${recordId}/notes?${params.toString()}`,
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
  }, [recordId, recordPath, token, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const loadMentions = useCallback(async () => {
    if (!recordId || recordId === "new") return;
    setMentionsLoading(true);
    setMentionsError(null);
    try {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      const response = await fetch(
        `/api/${recordPath}/${recordId}/mentions?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load mentions.");
      }
      const data = (await response.json()) as MentionEntry[];
      setMentions(data);
    } catch (err) {
      setMentionsError(err instanceof Error ? err.message : "Unable to load mentions.");
    } finally {
      setMentionsLoading(false);
    }
  }, [recordId, recordPath, token, contextCampaignId, contextCharacterId]);

  const loadSessionMentions = useCallback(async () => {
    if (!recordId || recordId === "new") return;
    if (!contextCampaignId) {
      setSessionMentions([]);
      setSessionMentionsError("Campaign context required for session mentions.");
      return;
    }
    setSessionMentionsLoading(true);
    setSessionMentionsError(null);
    try {
      const params = new URLSearchParams({ campaignId: contextCampaignId });
      const response = await fetch(
        `/api/${recordPath}/${recordId}/session-notes?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load session mentions.");
      }
      const data = (await response.json()) as SessionMentionEntry[];
      setSessionMentions(data);
    } catch (err) {
      setSessionMentionsError(
        err instanceof Error ? err.message : "Unable to load session mentions."
      );
    } finally {
      setSessionMentionsLoading(false);
    }
  }, [recordId, recordPath, token, contextCampaignId]);

  useEffect(() => {
    if (activeTab !== "mentions") return;
    void loadMentions();
    void loadSessionMentions();
  }, [activeTab, loadMentions, loadSessionMentions]);

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
    setActiveTab("notes");
    setMentions([]);
    setMentionsError(null);
    setMentionsLoading(false);
    setSessionMentions([]);
    setSessionMentionsError(null);
    setSessionMentionsLoading(false);
  }, [recordId, recordType]);

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
    if (!tag.canAccess) {
      setNotice({
        noteId,
        message:
          tag.tagType === "LOCATION"
            ? "You can see this tag, but you do not have access to the location."
            : "You can see this tag, but you do not have access to the entity."
      });
      return;
    }
    setNotice(null);
    if (tag.tagType === "LOCATION") {
      onOpenLocation(tag.targetId);
      return;
    }
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
    [token, worldId, contextCampaignId, contextCharacterId]
  );

  const handlePost = async () => {
    if (!body.trim()) return;
    if (recordId === "new") return;
    if (!canAttemptPost) return;
    if (visibility === "GM" && !isCampaignGm) {
      setError("GM notes require campaign GM access.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const response = await fetch(`/api/${recordPath}/${recordId}/notes`, {
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
    if (deletingNoteId === noteId) return;
    if (!window.confirm("Delete this item?")) return;
    setDeletingNoteId(noteId);
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
    } finally {
      setDeletingNoteId(null);
    }
  };

  return (
    <div className="entity-notes">
      <div className="entity-notes__header">
        <div>
          <h2>{activeTab === "notes" ? "Notes" : "Mentions"}</h2>
          <p>
            {activeTab === "notes"
              ? "Post updates and tag entities or locations with @ to keep the party aligned."
              : "Notes from other records that mention this one."}
          </p>
        </div>
        <div className="entity-notes__tabs form-view__tabs" role="tablist">
          <button
            type="button"
            className={`form-view__tab ${activeTab === "notes" ? "is-active" : ""}`}
            onClick={() => setActiveTab("notes")}
            aria-selected={activeTab === "notes"}
            role="tab"
          >
            Notes
          </button>
          <button
            type="button"
            className={`form-view__tab ${activeTab === "mentions" ? "is-active" : ""}`}
            onClick={() => setActiveTab("mentions")}
            aria-selected={activeTab === "mentions"}
            role="tab"
          >
            Mentions
          </button>
        </div>
      </div>

      {activeTab === "notes" ? (
        <div className="entity-notes__composer">
          <div className="entity-notes__composer-header">
            <div>
              <h3>New note</h3>
              <p>Post updates and tag entities or locations with @ to keep the party aligned.</p>
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
              placeholder="Write a note and type @ to tag an entity or location."
              allowSuggestionsAboveCursor
              disabled={composerDisabled}
            >
              <Mention
                trigger="@"
                data={fetchTagSuggestions}
                markup="@[__display__](__id__)"
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
              disabled={posting || !body.trim() || recordId === "new" || !canAttemptPost}
            >
              {posting ? "Posting..." : "Post note"}
            </button>
            <button type="button" className="ghost-button" onClick={resetComposer}>
              Clear
            </button>
            {recordId === "new" ? (
              <span className="note-visibility__hint">Save the record to add notes.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="entity-notes__feed">
        {activeTab === "notes" ? (
          <>
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
                              className="danger-button"
                              onClick={() => handleDelete(note.id)}
                              disabled={deletingNoteId === note.id}
                            >
                              {deletingNoteId === note.id ? "Deleting..." : "Delete"}
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
                              markup="@[__display__](__id__)"
                              displayTransform={(id, display) => `@${display}`}
                            />
                          </MentionsInput>
                          <div className="note-card__edit-actions">
                            <label>
                              Visibility
                              <select
                                value={editVisibility}
                                onChange={(event) =>
                                  setEditVisibility(
                                    event.target.value as "PRIVATE" | "SHARED" | "GM"
                                  )
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
                                  <div className="note-gm-share__label">
                                    Share with players
                                  </div>
                                  {characterOptions.length === 0 ? (
                                    <div className="note-gm-share__empty">
                                      No campaign characters found.
                                    </div>
                                  ) : (
                                    characterOptions.map((option) => (
                                      <label
                                        key={option.value}
                                        className="note-gm-share__option"
                                      >
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
                            A-
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </>
        ) : (
          <>
            {mentionsLoading ? (
              <div className="entity-notes__state">Loading mentions...</div>
            ) : null}
            {mentionsError ? <div className="entity-notes__state">{mentionsError}</div> : null}
            {!mentionsLoading &&
            !mentionsError &&
            !sessionMentionsLoading &&
            !sessionMentionsError &&
            mentions.length === 0 &&
            sessionMentions.length === 0 ? (
              <div className="entity-notes__state">No mentions yet.</div>
            ) : null}
        {!mentionsLoading && !mentionsError
          ? mentions.map((note) => {
              const noteTagMap = new Map<string, NoteTag>();
              note.tags.forEach((tag) => {
                noteTagMap.set(`${tag.tagType}:${tag.targetId}`, tag);
              });
                  return (
                    <div className="note-card" key={note.id}>
                      <div className="note-card__meta">
                        {note.entity || note.location ? (
                          <button
                            type="button"
                            className="note-card__source"
                            onClick={() => {
                              if (note.entity) {
                                onOpenEntity(note.entity.id);
                              } else if (note.location) {
                                onOpenLocation(note.location.id);
                              }
                            }}
                          >
                            From {(note.entity ?? note.location)?.name}
                          </button>
                        ) : null}
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
                      </div>
                      <div className="note-card__body">
                        {renderNoteBody(note.body, noteTagMap, (tag) =>
                          handleTagClick(note.id, tag)
                        )}
                      </div>
                      {notice && notice.noteId === note.id ? (
                        <div className="note-card__notice">
                          <span>{notice.message}</span>
                          <button
                            type="button"
                            className="note-card__notice-close"
                            onClick={() => setNotice(null)}
                            aria-label="Dismiss notice"
                          >
                            A-
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : null}
            {sessionMentionsLoading ? (
              <div className="entity-notes__state">Loading session notes...</div>
            ) : null}
            {sessionMentionsError ? (
              <div className="entity-notes__state">{sessionMentionsError}</div>
            ) : null}
            {!sessionMentionsLoading && !sessionMentionsError && sessionMentions.length === 0 ? (
              <div className="entity-notes__state">No session notes yet.</div>
            ) : null}
            {!sessionMentionsLoading && !sessionMentionsError
              ? sessionMentions.map((note) => {
                  const noteTagMap = new Map<string, NoteTag>();
                  note.references.forEach((ref) => {
                    noteTagMap.set(
                      `${ref.targetType === "location" ? "LOCATION" : "ENTITY"}:${ref.targetId}`,
                      {
                        id: `${ref.targetType}:${ref.targetId}`,
                        tagType: ref.targetType === "location" ? "LOCATION" : "ENTITY",
                        targetId: ref.targetId,
                        label: ref.label,
                        canAccess: true
                      }
                    );
                  });
                  return (
                    <div className="note-card" key={`session-${note.id}`}>
                      <div className="note-card__meta">
                        {note.session?.title ? (
                          <span className="note-card__source">
                            Session: {note.session.title}
                          </span>
                        ) : null}
                        <div className="note-card__author">
                          {note.author.name ?? note.author.email}
                        </div>
                        <div className="note-card__timestamp">
                          {formatTimestamp(note.createdAt)}
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
                      </div>
                      <div className="note-card__body">
                        {renderNoteBody(
                          note.content.text,
                          noteTagMap,
                          (tag) => handleTagClick(note.id, tag)
                        )}
                      </div>
                    </div>
                  );
                })
              : null}
          </>
        )}
      </div>
    </div>
  );
}
