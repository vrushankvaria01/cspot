"use client";

import { useDroppable } from "@dnd-kit/core";

import type { Idea, IdeaStatus } from "@/lib/types";
import IdeaCard from "./IdeaCard";

interface Props {
  status: IdeaStatus;
  label: string;
  accent: string;
  ideas: Idea[];
  onEdit: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  onAddToCalendar: (idea: Idea) => void;
}

export default function Column({
  status,
  label,
  accent,
  ideas,
  onEdit,
  onDelete,
  onAddToCalendar,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[280px] flex-1 flex-col rounded-xl border p-3 transition-colors ${
        isOver
          ? "border-lime-400/60 bg-lime-400/5"
          : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2
          className={`text-xs font-semibold uppercase tracking-wider ${accent}`}
        >
          {label}
        </h2>
        <span className="text-xs text-zinc-500">{ideas.length}</span>
      </div>

      <div className="flex flex-col gap-3">
        {ideas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddToCalendar={onAddToCalendar}
          />
        ))}
        {ideas.length === 0 && (
          <p className="px-1 py-8 text-center text-xs text-zinc-600">
            Nothing here yet
          </p>
        )}
      </div>
    </div>
  );
}
