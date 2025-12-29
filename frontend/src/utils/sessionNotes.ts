export type SessionNoteReference = {
  targetType: "entity" | "location";
  targetId: string;
  label: string;
};

export type SessionNoteContent = {
  version: 1;
  format: "markdown";
  text: string;
  references: SessionNoteReference[];
};

const referencePattern = /@\[(.+?)\]\((entity|location):([^)]+)\)/g;

export const extractSessionNoteReferences = (text: string): SessionNoteReference[] => {
  referencePattern.lastIndex = 0;
  const references: SessionNoteReference[] = [];
  if (!text) return references;
  const seen = new Set<string>();
  let match: RegExpExecArray | null = null;
  while ((match = referencePattern.exec(text))) {
    const [, label, rawType, targetId] = match;
    if (!label || !targetId) continue;
    const targetType = rawType === "location" ? "location" : "entity";
    const key = `${targetType}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ targetType, targetId, label });
  }
  return references;
};

export const buildSessionNoteContent = (text: string): SessionNoteContent => {
  const normalizedText = text.replace(/\r\n/g, "\n");
  return {
    version: 1,
    format: "markdown",
    text: normalizedText,
    references: extractSessionNoteReferences(normalizedText)
  };
};

export const getSessionNoteText = (content?: SessionNoteContent | null) => content?.text ?? "";
