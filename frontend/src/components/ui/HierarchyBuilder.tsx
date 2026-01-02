import type { DragEvent } from "react";

type HierarchyNode = {
  id: string;
  name: string;
  badge: "CORE" | "OPTIONAL" | "CUSTOM";
  included: boolean;
  parentId: string | null;
  allowedChildren: string[];
};

type ParentOption = {
  id: string | null;
  label: string;
  disabled?: boolean;
  reason?: string;
};

type HierarchyBuilderProps = {
  nodes: HierarchyNode[];
  order: string[];
  parentOptions: Record<string, ParentOption[]>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onToggleInclude?: (id: string, checked: boolean) => void;
  onChangeParent?: (id: string, parentId: string | null) => void;
  onMove?: (dragId: string, dropId: string | null) => void;
  onOpenAdvanced?: (id: string) => void;
};

const buildDepthMap = (nodes: HierarchyNode[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depthCache = new Map<string, number>();

  const getDepth = (id: string): number => {
    if (depthCache.has(id)) return depthCache.get(id) ?? 0;
    const node = byId.get(id);
    if (!node || !node.parentId) {
      depthCache.set(id, 0);
      return 0;
    }
    const depth = getDepth(node.parentId) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  nodes.forEach((node) => getDepth(node.id));
  return depthCache;
};

export default function HierarchyBuilder({
  nodes,
  order,
  parentOptions,
  selectedId,
  onSelect,
  onToggleInclude,
  onChangeParent,
  onMove,
  onOpenAdvanced
}: HierarchyBuilderProps) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const orderedNodes = order.map((id) => nodesById.get(id)).filter(Boolean) as HierarchyNode[];
  const depthMap = buildDepthMap(nodes);

  const handleDrop = (event: DragEvent<HTMLDivElement>, dropId: string | null) => {
    event.preventDefault();
    const dragId = event.dataTransfer.getData("text/plain");
    if (!dragId || dragId === dropId) return;
    onMove?.(dragId, dropId);
  };

  return (
    <div className="hierarchy-builder">
      <div
        className="hierarchy-builder__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(event, null)}
      >
        Drag here to move to top level
      </div>
      {orderedNodes.map((node) => {
        const depth = depthMap.get(node.id) ?? 0;
        return (
          <div
            key={node.id}
            className={`hierarchy-builder__node ${selectedId === node.id ? "is-selected" : ""}`}
            style={{ paddingLeft: `${depth * 24 + 12}px` }}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", node.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, node.id)}
            onClick={() => onSelect?.(node.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(node.id);
              }
            }}
          >
            <div className="hierarchy-builder__header">
              <label className="hierarchy-builder__checkbox" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={node.included}
                  onChange={(event) => onToggleInclude?.(node.id, event.target.checked)}
                />
                <span>{node.name}</span>
              </label>
              <div className="hierarchy-builder__meta">
                <span className="hierarchy-builder__badge">{node.badge}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAdvanced?.(node.id);
                  }}
                >
                  Advanced
                </button>
              </div>
            </div>
            <div className="hierarchy-builder__parent">
              <label>
                <span>Parent</span>
                <select
                  value={node.parentId ?? ""}
                  onChange={(event) =>
                    onChangeParent?.(node.id, event.target.value || null)
                  }
                  onClick={(event) => event.stopPropagation()}
                >
                  {(parentOptions[node.id] ?? []).map((option) => (
                    <option
                      key={option.id ?? "root"}
                      value={option.id ?? ""}
                      disabled={option.disabled}
                      title={option.reason}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="hierarchy-builder__allowed">
              <span>Allowed children</span>
              <div className="hierarchy-builder__chips">
                {node.allowedChildren.length === 0 ? (
                  <span className="hierarchy-builder__chip is-muted">None</span>
                ) : (
                  node.allowedChildren.map((child) => (
                    <span key={child} className="hierarchy-builder__chip">
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
