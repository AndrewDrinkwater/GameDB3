import React, { useMemo } from "react";

export type HierarchyNode = {
  id: string;
  label: string;
  parentId?: string | null;
  disabled?: boolean;
};

type ParentOption = {
  id: string | null;
  label: string;
  disabled?: boolean;
  reason?: string;
};

type HierarchyTreeProps = {
  nodes: HierarchyNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChangeParent?: (id: string, parentId: string | null) => void;
  parentOptions: Record<string, ParentOption[]>;
  allowedChildren?: Record<string, string[]>;
};

const buildTreeOrder = (nodes: HierarchyNode[]) => {
  const children = new Map<string | null, HierarchyNode[]>();
  nodes.forEach((node) => {
    const parentKey = node.parentId ?? null;
    const bucket = children.get(parentKey) ?? [];
    bucket.push(node);
    children.set(parentKey, bucket);
  });
  const ordered: Array<{ node: HierarchyNode; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const entries = children.get(parentId) ?? [];
    entries.sort((a, b) => a.label.localeCompare(b.label));
    entries.forEach((entry) => {
      ordered.push({ node: entry, depth });
      walk(entry.id, depth + 1);
    });
  };
  walk(null, 0);
  return ordered;
};

export default function HierarchyTree({
  nodes,
  selectedId,
  onSelect,
  onChangeParent,
  parentOptions,
  allowedChildren = {}
}: HierarchyTreeProps) {
  const orderedNodes = useMemo(() => buildTreeOrder(nodes), [nodes]);

  return (
    <div className="hierarchy-tree">
      {orderedNodes.map(({ node, depth }) => {
        const options = parentOptions[node.id] ?? [];
        const allowed = allowedChildren[node.id] ?? [];
        return (
          <div
            key={node.id}
            className={`hierarchy-tree__node ${selectedId === node.id ? "is-selected" : ""}`}
            style={{ paddingLeft: `${depth * 1.5}rem` }}
          >
            <button
              type="button"
              className="hierarchy-tree__label"
              onClick={() => onSelect?.(node.id)}
              disabled={node.disabled}
            >
              <span className="hierarchy-tree__depth">{depth + 1}</span>
              <span>{node.label}</span>
            </button>
            {onChangeParent ? (
              <label className="hierarchy-tree__parent">
                <span>Parent</span>
                <select
                  value={node.parentId ?? ""}
                  onChange={(event) =>
                    onChangeParent(node.id, event.target.value ? event.target.value : null)
                  }
                  disabled={node.disabled}
                >
                  {options.map((option) => (
                    <option
                      key={option.id ?? "none"}
                      value={option.id ?? ""}
                      disabled={option.disabled}
                      title={option.reason}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="hierarchy-tree__allowed">
              <span>Allowed children</span>
              <div>
                {allowed.length === 0 ? (
                  <em>None</em>
                ) : (
                  allowed.map((child) => (
                    <span key={child} className="hierarchy-tree__child">
                      {child}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
