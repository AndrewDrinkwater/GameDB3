import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export type HierarchyNode = {
  id: string;
  label: string;
  description?: string;
  parentId: string | null;
  status?: "active" | "retired";
  disabled?: boolean;
  badge?: "core" | "optional" | "custom";
};

type HierarchyEditorProps = {
  nodes: HierarchyNode[];
  canReparent: (nodeId: string, newParentId: string | null) => boolean;
  onChange: (updatedNodes: HierarchyNode[]) => void;
  onSelectNode?: (nodeId: string) => void;
  renderNodeActions?: (node: HierarchyNode) => ReactNode;
  renderAfterNode?: (node: HierarchyNode, depth: number) => ReactNode;
  header?: ReactNode;
};

type DropIntent =
  | { type: "root" }
  | { type: "inside"; targetId: string }
  | { type: "before"; targetId: string }
  | { type: "after"; targetId: string };

const getBadgeLabel = (badge?: HierarchyNode["badge"]) => {
  if (badge === "core") return "Core";
  if (badge === "optional") return "Optional";
  if (badge === "custom") return "Custom";
  return "";
};

const buildOrderMap = (nodes: HierarchyNode[]) => {
  const order = new Map<string | null, string[]>();
  nodes.forEach((node) => {
    const key = node.parentId ?? null;
    const bucket = order.get(key) ?? [];
    bucket.push(node.id);
    order.set(key, bucket);
  });
  return order;
};

const buildChildrenMap = (nodes: HierarchyNode[]) => {
  const children = new Map<string | null, string[]>();
  nodes.forEach((node) => {
    const key = node.parentId ?? null;
    const bucket = children.get(key) ?? [];
    bucket.push(node.id);
    children.set(key, bucket);
  });
  return children;
};

const flattenTree = (nodes: HierarchyNode[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const order = buildOrderMap(nodes);
  const flattened: Array<{ node: HierarchyNode; depth: number }> = [];

  const walk = (parentId: string | null, depth: number) => {
    const children = order.get(parentId) ?? [];
    children.forEach((childId) => {
      const child = byId.get(childId);
      if (!child) return;
      flattened.push({ node: child, depth });
      walk(child.id, depth + 1);
    });
  };

  walk(null, 0);

  if (flattened.length !== nodes.length) {
    const seen = new Set(flattened.map((entry) => entry.node.id));
    nodes.forEach((node) => {
      if (!seen.has(node.id)) {
        flattened.push({ node, depth: 0 });
      }
    });
  }

  return flattened;
};

const findDescendants = (nodeId: string, childrenMap: Map<string | null, string[]>) => {
  const descendants = new Set<string>();
  const stack = [...(childrenMap.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || descendants.has(current)) continue;
    descendants.add(current);
    (childrenMap.get(current) ?? []).forEach((childId) => {
      if (!descendants.has(childId)) stack.push(childId);
    });
  }
  return descendants;
};

const getIntentParent = (
  intent: DropIntent,
  nodesById: Map<string, HierarchyNode>
): string | null => {
  if (intent.type === "root") return null;
  if (intent.type === "inside") return intent.targetId;
  const target = nodesById.get(intent.targetId);
  return target?.parentId ?? null;
};

const reorderNodes = (
  nodes: HierarchyNode[],
  dragId: string,
  intent: DropIntent
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const dragNode = nodesById.get(dragId);
  if (!dragNode) return nodes;

  const orderMap = buildOrderMap(nodes);
  const sourceParent = dragNode.parentId ?? null;
  const targetParent = getIntentParent(intent, nodesById);

  const sourceList = [...(orderMap.get(sourceParent) ?? [])].filter((id) => id !== dragId);
  const targetList =
    sourceParent === targetParent
      ? sourceList
      : [...(orderMap.get(targetParent) ?? [])];

  let insertIndex = targetList.length;
  if (intent.type === "before" || intent.type === "after") {
    const targetIndex = targetList.indexOf(intent.targetId);
    if (targetIndex >= 0) {
      insertIndex = intent.type === "before" ? targetIndex : targetIndex + 1;
    }
  }

  targetList.splice(insertIndex, 0, dragId);
  orderMap.set(sourceParent, sourceList);
  orderMap.set(targetParent, targetList);

  const updatedById = new Map(nodes.map((node) => [node.id, node]));
  if (dragNode.parentId !== targetParent) {
    updatedById.set(dragId, { ...dragNode, parentId: targetParent });
  }

  const nextNodes: HierarchyNode[] = [];
  const seen = new Set<string>();

  const walk = (parentId: string | null) => {
    (orderMap.get(parentId) ?? []).forEach((childId) => {
      const child = updatedById.get(childId);
      if (!child || seen.has(childId)) return;
      seen.add(childId);
      nextNodes.push(child);
      walk(childId);
    });
  };

  walk(null);
  nodes.forEach((node) => {
    if (!seen.has(node.id)) {
      nextNodes.push(updatedById.get(node.id) ?? node);
    }
  });

  return nextNodes;
};

const DraggableRow = ({
  node,
  depth,
  isRetired,
  childCount,
  onSelect,
  canDropInside,
  isSelected,
  renderNodeActions,
  dropEnabled
}: {
  node: HierarchyNode;
  depth: number;
  isRetired: boolean;
  childCount: number;
  onSelect?: () => void;
  canDropInside: boolean;
  isSelected: boolean;
  renderNodeActions?: (node: HierarchyNode) => ReactNode;
  dropEnabled: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id
  });
  const style = {
    transform: CSS.Translate.toString(transform)
  };
  const badgeLabel = getBadgeLabel(node.badge);

  const { setNodeRef: setInsideRef, isOver } = useDroppable({
    id: `inside:${node.id}`,
    disabled: !dropEnabled,
    data: { type: "inside", targetId: node.id } satisfies DropIntent
  });

  return (
    <div
      ref={(element) => {
        setNodeRef(element);
        setInsideRef(element);
      }}
      className={`hierarchy-editor__node ${isOver ? "is-over" : ""} ${
        isRetired ? "is-retired" : ""
      } ${node.disabled ? "is-disabled" : ""} ${isDragging ? "is-dragging" : ""} ${
        isSelected ? "is-selected" : ""
      } ${
        dropEnabled && isOver ? (canDropInside ? "is-drop-valid" : "is-drop-invalid") : ""
      }`}
      style={{
        ...style,
        marginLeft: `${depth * 28}px`,
        ["--depth" as string]: depth,
        ["--indent" as string]: "28px"
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      data-testid={`hierarchy-node-${node.id}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className="hierarchy-editor__handle"
        aria-label={`Drag ${node.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        ::
      </button>
      <div className="hierarchy-editor__content">
        <div className="hierarchy-editor__title" data-depth={depth}>
          <span className="hierarchy-editor__label">{node.label}</span>
        {badgeLabel ? (
          <span className="hierarchy-editor__badge">/ {badgeLabel}</span>
        ) : null}
        {isRetired ? <span className="hierarchy-editor__retired">Retired</span> : null}
      </div>
      {childCount > 0 ? (
        <div className="hierarchy-editor__meta">
          <span>{childCount} children</span>
        </div>
      ) : null}
      </div>
      {renderNodeActions ? (
        <div
          className="hierarchy-editor__actions"
          onClick={(event) => event.stopPropagation()}
        >
          {renderNodeActions(node)}
        </div>
      ) : null}
    </div>
  );
};

const DropZone = ({
  id,
  label,
  hidden,
  disabled,
  isAllowed,
  indent
}: {
  id: string;
  label: string;
  hidden: boolean;
  disabled: boolean;
  isAllowed: boolean;
  indent: number;
}) => {
  const targetId = id.split(":")[1] as string | undefined;
  const data: DropIntent =
    id === "root"
      ? { type: "root" }
      : id.startsWith("before")
      ? { type: "before", targetId: targetId ?? "" }
      : { type: "after", targetId: targetId ?? "" };

  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data
  });

  if (hidden || disabled) return null;

  const position =
    id === "root"
      ? "root"
      : id.startsWith("before")
        ? "before"
        : id.startsWith("after")
          ? "after"
          : "inside";

  return (
    <div
      ref={setNodeRef}
      style={{ ["--indent" as string]: `${indent}px` }}
      className={`hierarchy-editor__dropzone ${isOver ? "is-over" : ""} ${
        isOver ? (isAllowed ? "is-allowed" : "is-blocked") : ""
      }`}
      aria-label={label}
      data-testid={`hierarchy-dropzone-${id}`}
      data-position={position}
    />
  );
};

export default function HierarchyEditor({
  nodes,
  canReparent,
  onChange,
  onSelectNode,
  renderNodeActions,
  renderAfterNode,
  header
}: HierarchyEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const flattened = useMemo(() => flattenTree(nodes), [nodes]);
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach((node) => {
      counts[node.id] = (childrenMap.get(node.id) ?? []).length;
    });
    return counts;
  }, [childrenMap, nodes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isValidParent = (nodeId: string, newParentId: string | null) => {
    if (nodeId === newParentId) return false;
    const parentNode = newParentId ? nodesById.get(newParentId) : null;
    if (parentNode?.status === "retired") return false;
    const descendants = findDescendants(nodeId, childrenMap);
    if (newParentId && descendants.has(newParentId)) return false;
    return canReparent(nodeId, newParentId);
  };

  const isValidIntent = (nodeId: string, intent: DropIntent) => {
    const newParentId = getIntentParent(intent, nodesById);
    if (!isValidParent(nodeId, newParentId)) return false;
    if (intent.type === "before" || intent.type === "after") {
      if (intent.targetId === nodeId) return false;
    }
    return true;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id;
    if (typeof id === "string") {
      setActiveId(id);
      setSelectedId(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const id = event.active.id;
    const over = event.over?.data.current as DropIntent | undefined;
    setActiveId(null);
    if (!over || typeof id !== "string") return;
    if (!isValidIntent(id, over)) return;

    const nextNodes = reorderNodes(nodes, id, over);
    const changed =
      nextNodes.length !== nodes.length ||
      nextNodes.some(
        (node, index) =>
          node.id !== nodes[index]?.id || node.parentId !== nodes[index]?.parentId
      );
    if (changed) {
      onChange(nextNodes);
    }
  };

  const activeNode = activeId ? nodesById.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="hierarchy-editor" data-testid="hierarchy-editor">
        {header ? <div className="hierarchy-editor__header">{header}</div> : null}
        <DropZone
          id="root"
          label="Drop to move to top level"
          hidden={!activeId}
          disabled={!activeId}
          isAllowed={Boolean(activeId) && isValidParent(activeId, null)}
          indent={0}
        />
        {flattened.map(({ node, depth }) => {
          const isRetired = node.status === "retired";
          const showDropZones = Boolean(activeId) && node.id !== activeId;
          const canDropInside = activeId
            ? isValidIntent(activeId, { type: "inside", targetId: node.id })
            : false;
          const beforeValid = activeId
            ? isValidIntent(activeId, { type: "before", targetId: node.id })
            : false;
          const afterValid = activeId
            ? isValidIntent(activeId, { type: "after", targetId: node.id })
            : false;
          const afterContent = renderAfterNode ? renderAfterNode(node, depth) : null;
          return (
            <div key={node.id} className="hierarchy-editor__row">
              {showDropZones ? (
                <DropZone
                  id={`before:${node.id}`}
                  label="Drop before"
                  hidden={false}
                  disabled={false}
                  isAllowed={beforeValid}
                  indent={depth * 28}
                />
              ) : null}
              <DraggableRow
                node={node}
                depth={depth}
                isRetired={isRetired}
                childCount={childCounts[node.id] ?? 0}
                onSelect={() => {
                  setSelectedId(node.id);
                  onSelectNode?.(node.id);
                }}
                canDropInside={canDropInside}
                isSelected={node.id === selectedId}
                renderNodeActions={renderNodeActions}
                dropEnabled={Boolean(activeId) && node.id !== activeId}
              />
              {showDropZones ? (
                <DropZone
                  id={`after:${node.id}`}
                  label="Drop after"
                  hidden={false}
                  disabled={false}
                  isAllowed={afterValid}
                  indent={depth * 28}
                />
              ) : null}
              {showDropZones ? (
                <div className="hierarchy-editor__drop-hint">
                  Drop on row to make it a child
                </div>
              ) : null}
              {afterContent ? (
                <div className="hierarchy-editor__after">{afterContent}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeNode ? (
          <div className="hierarchy-editor__overlay">
            <span>{activeNode.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
