"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { Idea } from "@/lib/types";

interface Props {
  idea: Idea;
  onEdit: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  onAddToCalendar: (idea: Idea) => void;
  overlay?: boolean;
}

export default function IdeaCard({
  idea,
  onEdit,
  onDelete,
  onAddToCalendar,
  overlay = false,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: idea.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const hasInspiration = idea.inspiration_url.trim().length > 0;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      className={`rounded-lg border border-zinc-800 bg-zinc-900 p-3 ${
        isDragging ? "opacity-40" : ""
      } ${overlay ? "rotate-2 shadow-2xl ring-1 ring-lime-400/40" : ""}`}
    >
      <div
        {...(overlay ? {} : listeners)}
        {...(overlay ? {} : attributes)}
        className="cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <h3 className="mb-1 text-sm font-medium text-zinc-100">{idea.title}</h3>
        {idea.notes.trim() && (
          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-zinc-400">
            {idea.notes}
          </p>
        )}
      </div>

      {hasInspiration && (
        <a
          href={idea.inspiration_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-lime-400 hover:underline"
        >
          ▶ Inspiration
        </a>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-zinc-800 pt-2">
        <button
          type="button"
          onClick={() => onEdit(idea)}
          className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onAddToCalendar(idea)}
          className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Add to calendar
        </button>
        <button
          type="button"
          onClick={() => onDelete(idea)}
          className="ml-auto text-[11px] text-red-400/80 transition-colors hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
