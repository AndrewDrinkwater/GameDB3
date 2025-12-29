import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

export type ContextSelection = {
  worldId?: string;
  worldLabel?: string;
  campaignId?: string;
  campaignLabel?: string;
  characterId?: string;
  characterLabel?: string;
};

type Choice = { value: string; label: string; meta?: string };

type ContextBarProps = {
  token: string;
  context: ContextSelection;
  onChange: (next: ContextSelection) => void;
  onReset?: () => void;
};

type DropdownState = {
  query: string;
  options: Choice[];
  open: boolean;
};

const emptyState: DropdownState = { query: "", options: [], open: false };

const fetchOptions = async (
  token: string,
  entityKey: "worlds" | "campaigns" | "characters",
  query: string,
  filters: Record<string, string | undefined>
) => {
  const params = new URLSearchParams({ entityKey, query });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const response = await fetch(`/api/references?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    dispatchUnauthorized();
    return [];
  }

  if (!response.ok) return [];
  const data = (await response.json()) as Array<{ id: string; label: string; ownerLabel?: string }>;
  return data.map((item) => ({
    value: item.id,
    label: item.label,
    meta: item.ownerLabel ? `Owner: ${item.ownerLabel}` : undefined
  }));
};

const useDropdown = (initialLabel?: string) => {
  const [state, setState] = useState<DropdownState>({
    query: initialLabel ?? "",
    options: [],
    open: false
  });

  useEffect(() => {
    setState((current) => ({ ...current, query: initialLabel ?? "" }));
  }, [initialLabel]);

  return { state, setState };
};

export default function ContextBar({ token, context, onChange, onReset }: ContextBarProps) {
  const worldDropdown = useDropdown(context.worldLabel);
  const campaignDropdown = useDropdown(context.campaignLabel);
  const characterDropdown = useDropdown(context.characterLabel);
  const hasContext = Boolean(context.worldId || context.campaignId || context.characterId);

  const applyContext = (next: ContextSelection) => {
    onChange(next);
  };

  const handleWorldSelect = (option: Choice) => {
    applyContext({
      worldId: option.value,
      worldLabel: option.label
    });
  };

  const handleCampaignSelect = async (option: Choice) => {
    const response = await fetch(`/api/campaigns/${option.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }

    if (!response.ok) return;
    const data = (await response.json()) as { worldId: string };

    let worldLabel = context.worldLabel;
    if (!worldLabel) {
      const worldOptions = await fetchOptions(token, "worlds", "", {});
      const worldMatch = worldOptions.find((item) => item.value === data.worldId);
      worldLabel = worldMatch?.label;
    }

    applyContext({
      worldId: data.worldId,
      worldLabel,
      campaignId: option.value,
      campaignLabel: option.label
    });
  };

  const handleCharacterSelect = async (option: Choice) => {
    const response = await fetch(`/api/characters/${option.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }

    if (!response.ok) return;
    const data = (await response.json()) as {
      worldId: string;
      campaignIds?: string[];
    };

    let campaignId = context.campaignId;
    let campaignLabel = context.campaignLabel;
    let worldLabel = context.worldLabel;

    if (Array.isArray(data.campaignIds) && data.campaignIds.length === 1) {
      campaignId = data.campaignIds[0];
      const campaignOptions = await fetchOptions(token, "campaigns", "", { worldId: data.worldId });
      const match = campaignOptions.find((item) => item.value === campaignId);
      campaignLabel = match?.label;
    }

    if (!worldLabel) {
      const worldOptions = await fetchOptions(token, "worlds", "", {});
      const worldMatch = worldOptions.find((item) => item.value === data.worldId);
      worldLabel = worldMatch?.label;
    }

    applyContext({
      worldId: data.worldId,
      worldLabel,
      campaignId,
      campaignLabel,
      characterId: option.value,
      characterLabel: option.label
    });
  };

  const renderDropdown = (
    label: string,
    placeholder: string,
    dropdown: ReturnType<typeof useDropdown>,
    onSelect: (option: Choice) => void,
    onClear: () => void,
    optionsLoader: (query: string) => Promise<Choice[]>
  ) => (
    <div className="context-field" onBlur={(event) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
      dropdown.setState((current) => ({ ...current, open: false }));
    }}>
      <span className="context-field__label">{label}</span>
      <div className="context-field__input">
        <input
          type="text"
          value={dropdown.state.query}
          placeholder={placeholder}
          onFocus={async () => {
            const options = await optionsLoader(dropdown.state.query);
            dropdown.setState({ query: dropdown.state.query, options, open: true });
          }}
          onChange={async (event) => {
            const nextQuery = event.target.value;
            const options = await optionsLoader(nextQuery);
            dropdown.setState({ query: nextQuery, options, open: true });
          }}
        />
        {dropdown.state.query ? (
          <button
            type="button"
            className="context-field__clear"
            onClick={() => {
              dropdown.setState((current) => ({ ...current, query: "", options: [] }));
              onClear();
            }}
          >
            x
          </button>
        ) : null}
      </div>
      {dropdown.state.open ? (
        <div className="context-field__options">
          {dropdown.state.options.length > 0 ? (
            dropdown.state.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelect(option);
                  dropdown.setState({ query: option.label, options: [], open: false });
                }}
              >
                <span>{option.label}</span>
                {option.meta ? <span className="context-field__meta">{option.meta}</span> : null}
              </button>
            ))
          ) : (
            <div className="context-field__empty">No matches.</div>
          )}
        </div>
      ) : null}
    </div>
  );

  const worldOptionsLoader = (query: string) =>
    fetchOptions(token, "worlds", query, {});

  const campaignOptionsLoader = (query: string) =>
    fetchOptions(token, "campaigns", query, {
      worldId: context.worldId,
      characterId: context.characterId
    });

  const characterOptionsLoader = (query: string) =>
    fetchOptions(token, "characters", query, {
      worldId: context.worldId,
      campaignId: context.campaignId
    });

  return (
    <div className="context-bar">
      {renderDropdown(
        "World",
        "Select world",
        worldDropdown,
        handleWorldSelect,
        () => applyContext({}),
        worldOptionsLoader
      )}
      {renderDropdown(
        "Campaign",
        "Select campaign",
        campaignDropdown,
        handleCampaignSelect,
        () => applyContext({ worldId: context.worldId, worldLabel: context.worldLabel }),
        campaignOptionsLoader
      )}
      {renderDropdown(
        "Character",
        "Select character",
        characterDropdown,
        handleCharacterSelect,
        () =>
          applyContext({
            worldId: context.worldId,
            worldLabel: context.worldLabel,
            campaignId: context.campaignId,
            campaignLabel: context.campaignLabel
          }),
        characterOptionsLoader
      )}
      {onReset ? (
        <button
          type="button"
          className={`context-bar__reset ${hasContext ? "" : "is-hidden"}`}
          onClick={onReset}
          aria-label="Reset context"
          title="Reset context"
        >
          <svg viewBox="0 0 24 24" role="presentation" focusable="false" aria-hidden="true">
            <path d="M12 5a7 7 0 1 1-6.32 4H3l3.5-3.5L10 9H7.7A5 5 0 1 0 12 7c.64 0 1.26.12 1.82.33l1.1-1.1A6.96 6.96 0 0 0 12 5Z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
