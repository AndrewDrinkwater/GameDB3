import { useEffect, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

type AccessEntry = { id: string; label: string };

type AccessSelectorProps = {
  token: string;
  label: string;
  entityKey: "campaigns" | "characters";
  worldId?: string;
  value: AccessEntry[];
  onChange: (next: AccessEntry[]) => void;
};

type Choice = { value: string; label: string };

function AccessSelector({ token, label, entityKey, worldId, value, onChange }: AccessSelectorProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Choice[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const params = new URLSearchParams({ entityKey, query });
      if (worldId) params.set("worldId", worldId);
      const response = await fetch(`/api/references?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as Array<{ id: string; label: string }>;
      setOptions(data.map((item) => ({ value: item.id, label: item.label })));
    };

    void load();
  }, [entityKey, open, query, token, worldId]);

  return (
    <div className="access-selector">
      <span className="access-selector__label">{label}</span>
      {value.length > 0 ? (
        <div className="access-selector__chips">
          {value.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className="reference-field__chip"
              onClick={() => onChange(value.filter((item) => item.id !== entry.id))}
            >
              {entry.label} x
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="reference-field"
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (nextTarget && event.currentTarget.contains(nextTarget)) return;
          setOpen(false);
        }}
      >
        <input
          type="text"
          value={query}
          placeholder={`Add ${label.toLowerCase()}...`}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {open ? (
          <div className="reference-field__options">
            {options.length > 0 ? (
              options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    if (value.some((item) => item.id === option.value)) return;
                    onChange([...value, { id: option.value, label: option.label }]);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="reference-field__empty">No matches.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type EntityAccessEditorProps = {
  token: string;
  worldId?: string;
  value: {
    readGlobal: boolean;
    readCampaigns: AccessEntry[];
    readCharacters: AccessEntry[];
    writeGlobal: boolean;
    writeCampaigns: AccessEntry[];
    writeCharacters: AccessEntry[];
  };
  onChange: (next: EntityAccessEditorProps["value"]) => void;
};

export default function EntityAccessEditor({
  token,
  worldId,
  value,
  onChange
}: EntityAccessEditorProps) {
  return (
    <div className="entity-access">
      <div className="entity-access__section">
        <h3>Read Access</h3>
        <label className="form-view__field form-view__field--boolean">
          <input
            type="checkbox"
            checked={value.readGlobal}
            onChange={(event) => onChange({ ...value, readGlobal: event.target.checked })}
          />
          <span>Global</span>
        </label>
        <AccessSelector
          token={token}
          label="Campaigns"
          entityKey="campaigns"
          worldId={worldId}
          value={value.readCampaigns}
          onChange={(next) => onChange({ ...value, readCampaigns: next })}
        />
        <AccessSelector
          token={token}
          label="Characters"
          entityKey="characters"
          worldId={worldId}
          value={value.readCharacters}
          onChange={(next) => onChange({ ...value, readCharacters: next })}
        />
      </div>
      <div className="entity-access__section">
        <h3>Write Access</h3>
        <label className="form-view__field form-view__field--boolean">
          <input
            type="checkbox"
            checked={value.writeGlobal}
            onChange={(event) => onChange({ ...value, writeGlobal: event.target.checked })}
          />
          <span>Global</span>
        </label>
        <AccessSelector
          token={token}
          label="Campaigns"
          entityKey="campaigns"
          worldId={worldId}
          value={value.writeCampaigns}
          onChange={(next) => onChange({ ...value, writeCampaigns: next })}
        />
        <AccessSelector
          token={token}
          label="Characters"
          entityKey="characters"
          worldId={worldId}
          value={value.writeCharacters}
          onChange={(next) => onChange({ ...value, writeCharacters: next })}
        />
      </div>
    </div>
  );
}
