import { useState, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToFirstScrollableAncestor,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./icons";
function Item({
  id,
  note,
  disabled,
}: {
  id: string;
  note: string;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      className={"sort-item" + (isDragging ? " dragging" : "")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="icon-button sort-handle"
        aria-label={`Reorder ${id}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <Icon name="action.drag" />
      </button>
      <strong>{id}</strong>
      <span title={note}>{note || "—"}</span>
    </li>
  );
}
export function SortPKFs({
  initial,
  version,
  remoteVersion,
  notes,
  online,
  save,
  close,
  reload,
  onBusy,
  onDragging,
}: {
  initial: string[];
  version: number;
  remoteVersion: number;
  notes: Record<string, string>;
  online: boolean;
  save: (ids: string[], version: number) => Promise<unknown>;
  close: () => void;
  reload: () => Promise<{ pkfs: string[]; version: number }>;
  onBusy: (value: boolean) => void;
  onDragging: (value: boolean) => void;
}) {
  const [ids, setIds] = useState(initial),
    [base, setBase] = useState(initial),
    [v, setV] = useState(version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => onBusy(busy), [busy, onBusy]);
  useEffect(() => onDragging(dragging), [dragging, onDragging]);
  return (
    <div
      className="sort-body"
      onKeyDownCapture={(e) => {
        if (e.key === "Escape" && dragging) e.preventDefault();
      }}
    >
      <p className="help-text">
        Drag to reorder PKFs. Changes are applied after saving.
      </p>
      {remoteVersion !== v && (
        <p role="status" className="error">
          列表已发生变化，请 Reload 最新顺序。
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        disabled={!online || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const n = await reload();
            setIds(n.pkfs);
            setBase(n.pkfs);
            setV(n.version);
            setError("");
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Reload
      </button>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={({ active, over }) => {
          setDragging(false);
          if (over && active.id !== over.id)
            setIds((a) =>
              arrayMove(
                a,
                a.indexOf(String(active.id)),
                a.indexOf(String(over.id)),
              ),
            );
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="sort-list">
            {ids.map((id) => (
              <Item
                key={id}
                id={id}
                note={notes[id] || ""}
                disabled={busy || !online}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="dialog-actions">
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            busy || !online || JSON.stringify(ids) === JSON.stringify(base)
          }
          onClick={async () => {
            setBusy(true);
            try {
              await save(ids, v);
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
