type CustomTypeCreateCardProps = {
  title: string;
  name: string;
  description: string;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onAdd: () => void;
  addLabel?: string;
};

export default function CustomTypeCreateCard({
  title,
  name,
  description,
  onChangeName,
  onChangeDescription,
  onAdd,
  addLabel = "Add"
}: CustomTypeCreateCardProps) {
  return (
    <div className="custom-type-card">
      <div className="custom-type-card__header">
        <h3>{title}</h3>
      </div>
      <div className="custom-type-card__body">
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => onChangeName(event.target.value)} />
        </label>
        <label>
          <span>Description</span>
          <input
            value={description}
            onChange={(event) => onChangeDescription(event.target.value)}
          />
        </label>
      </div>
      <div className="custom-type-card__actions">
        <button type="button" className="primary-button" onClick={onAdd} disabled={!name.trim()}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}
