"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import type { Idea, IdeaStatus } from "@/lib/types";
import Column from "./Column";
import IdeaCard from "./IdeaCard";
import IdeaForm from "./IdeaForm";

const COLUMNS: { status: IdeaStatus; label: string; accent: string }[] = [
  { status: "to_start", label: "To Start", accent: "text-zinc-400" },
  { status: "in_progress", label: "In Progress", accent: "text-amber-400" },
  { status: "complete", label: "Complete", accent: "text-lime-400" },
];

export default function Board() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ideas");
      const data: Idea[] = await res.json();
      setIdeas(data);
    } catch {
      setToast("Couldn't load ideas — is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(idea: Idea) {
    setEditing(idea);
    setFormOpen(true);
  }

  function handleSaved(saved: Idea) {
    setIdeas((prev) => {
      const exists = prev.some((i) => i.id === saved.id);
      return exists
        ? prev.map((i) => (i.id === saved.id ? saved : i))
        : [saved, ...prev];
    });
    setFormOpen(false);
    setEditing(null);
  }

  async function handleDelete(idea: Idea) {
    if (!window.confirm(`Delete "${idea.title}"?`)) return;
    const previous = ideas;
    setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    try {
      const res = await fetch(`/api/ideas/${idea.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setIdeas(previous);
      showToast("Couldn't delete — try again.");
    }
  }

  function handleAddToCalendar() {
    showToast("Calendar is coming next — this will schedule the idea then.");
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const id = Number(active.id);
    const newStatus = over.id as IdeaStatus;
    const idea = ideas.find((i) => i.id === id);
    if (!idea || idea.status === newStatus) return;

    const previousStatus = idea.status;
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)),
    );

    try {
      const res = await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setIdeas((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: previousStatus } : i)),
      );
      showToast("Couldn't move card — try again.");
    }
  }

  const activeIdea = activeId
    ? ideas.find((i) => i.id === activeId) ?? null
    : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Content Ideas
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Capture ideas, track them across stages, and drag between columns.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-lime-300"
        >
          + New idea
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-600">Loading…</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            {COLUMNS.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                label={col.label}
                accent={col.accent}
                ideas={ideas.filter((i) => i.status === col.status)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAddToCalendar={handleAddToCalendar}
              />
            ))}
          </div>

          <DragOverlay>
            {activeIdea ? (
              <IdeaCard
                idea={activeIdea}
                onEdit={() => {}}
                onDelete={() => {}}
                onAddToCalendar={() => {}}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {formOpen && (
        <IdeaForm
          idea={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
