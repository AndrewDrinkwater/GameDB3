import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Mention, MentionsInput } from "react-mentions";

type RichTextNoteEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  onBlur?: () => void;
  onReferenceInsert?: () => void;
  fetchSuggestions: (
    query: string,
    callback: (data: Array<{ id: string; display: string }>) => void
  ) => void;
  placeholder?: string;
  disabled?: boolean;
};

const wrapSelection = (
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string
) => ({
  nextValue: `${value.slice(0, start)}${prefix}${value.slice(start, end)}${suffix}${value.slice(end)}`,
  nextStart: start + prefix.length,
  nextEnd: end + prefix.length
});

const prefixLines = (value: string, start: number, end: number, prefix: string) => {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectionEnd = end;
  const selection = value.slice(lineStart, selectionEnd);
  const lines = selection.split("\n");
  const prefixed = lines
    .map((line) => (line.trim().length > 0 ? `${prefix}${line}` : line))
    .join("\n");
  const nextValue = `${value.slice(0, lineStart)}${prefixed}${value.slice(selectionEnd)}`;
  const addedChars = prefixed.length - selection.length;
  return {
    nextValue,
    nextStart: start + prefix.length,
    nextEnd: end + addedChars
  };
};

export default function RichTextNoteEditor({
  value,
  onChange,
  onBlur,
  onReferenceInsert,
  fetchSuggestions,
  placeholder,
  disabled
}: RichTextNoteEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const applySelection = useCallback(() => {
    const next = pendingSelectionRef.current;
    const input = inputRef.current;
    if (!next || !input) return;
    input.setSelectionRange(next.start, next.end);
    pendingSelectionRef.current = null;
  }, []);

  const updateSelection = useCallback(
    (start: number, end: number) => {
      pendingSelectionRef.current = { start, end };
      requestAnimationFrame(applySelection);
    },
    [applySelection]
  );

  const handleWrap = useCallback(
    (prefix: string, suffix = prefix) => {
      const input = inputRef.current;
      if (!input) return;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const { nextValue, nextStart, nextEnd } = wrapSelection(value, start, end, prefix, suffix);
      onChange(nextValue);
      updateSelection(nextStart, nextEnd);
    },
    [onChange, updateSelection, value]
  );

  const handleBullet = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const { nextValue, nextStart, nextEnd } = prefixLines(value, start, end, "- ");
    onChange(nextValue);
    updateSelection(nextStart, nextEnd);
  }, [onChange, updateSelection, value]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        handleWrap("**");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        handleWrap("*");
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "8") {
        event.preventDefault();
        handleBullet();
      }
    },
    [handleWrap, handleBullet]
  );

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Note formatting">
        <button type="button" onClick={() => handleWrap("**")} disabled={disabled}>
          Bold
        </button>
        <button type="button" onClick={() => handleWrap("*")} disabled={disabled}>
          Italic
        </button>
        <div className="rich-text-toolbar__divider" aria-hidden="true" />
        <button type="button" onClick={handleBullet} disabled={disabled}>
          Bullets
        </button>
      </div>
      <div className="note-editor">
        <MentionsInput
          className="mentions"
          value={value}
          onChange={(_, nextValue) => onChange(nextValue)}
          placeholder={placeholder}
          allowSuggestionsAboveCursor
          disabled={disabled}
          inputRef={(ref) => {
            inputRef.current = ref;
          }}
          onKeyDown={handleKeyDown}
          onBlur={onBlur}
        >
          <Mention
            trigger="@"
            data={fetchSuggestions}
            markup="@[__display__](__id__)"
            displayTransform={(_, display) => `@${display}`}
            onAdd={onReferenceInsert}
          />
        </MentionsInput>
      </div>
    </div>
  );
}
