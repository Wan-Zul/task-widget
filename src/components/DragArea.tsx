import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import type { Task } from "../db/tasks";

/** Droppable id prefix for calendar days: "day:2026-10-17". */
export const DAY_DROP = "day:";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// Prefer whatever is under the pointer (a calendar day); otherwise the nearest list item.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

interface Props {
  children: ReactNode;
  /** Called when a task is dropped on a calendar day. Without it, drags stay vertical. */
  onDropOnDay?: (task: Task, date: string) => void;
}

/**
 * Drag-and-drop context for task lists. Reordering is handled inside TaskList (useDndMonitor);
 * this adds dropping onto calendar days, and a floating chip so the dragged task stays visible
 * outside the scrolling list.
 */
export function DragArea({ children, onDropOnDay }: Props) {
  // A small move threshold keeps clicks and checkbox ticks from starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<Task | null>(null);

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const task = active.data.current?.task as Task | undefined;
    const target = over ? String(over.id) : "";
    if (task && onDropOnDay && target.startsWith(DAY_DROP)) onDropOnDay(task, target.slice(DAY_DROP.length));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={onDropOnDay ? collision : closestCenter}
      modifiers={onDropOnDay ? [] : [verticalOnly]}
      onDragStart={({ active }) => setDragging((active.data.current?.task as Task) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      {children}
      {onDropOnDay && (
        <DragOverlay dropAnimation={null}>{dragging && <div className="drag-chip">{dragging.title}</div>}</DragOverlay>
      )}
    </DndContext>
  );
}
