type ColorPickerProps = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return "#000000";
};

export default function ColorPicker({
  value,
  placeholder,
  onChange,
  disabled
}: ColorPickerProps) {
  const safeValue = normalizeHexColor(value);

  return (
    <div className="color-picker">
      <input
        className="color-picker__swatch"
        type="color"
        value={safeValue}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder ?? "Pick colour"}
        disabled={disabled}
      />
      <input
        className="color-picker__input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
