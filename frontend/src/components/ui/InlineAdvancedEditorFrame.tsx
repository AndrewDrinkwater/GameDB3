import React from "react";

type InlineAdvancedEditorFrameProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function InlineAdvancedEditorFrame({
  title,
  isOpen,
  onClose,
  children
}: InlineAdvancedEditorFrameProps) {
  if (!isOpen) return null;
  return (
    <div className="inline-editor__overlay">
      <div className="inline-editor" role="dialog" aria-modal="true" aria-label={title}>
        <div className="inline-editor__header">
          <h2>{title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="inline-editor__body">{children}</div>
      </div>
    </div>
  );
}
