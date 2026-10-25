"use client";

import Link from "next/link";
import { useClassDocuments } from "@/hooks/swr/useClassDocuments";

export function ClassDocumentPicker({ classId, classDbId, selected, onChange, disabled }: {
  classId: string; classDbId: string | null; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const { data, error } = useClassDocuments(classDbId);
  const ready = data?.documents.filter((document) => document.status === "ready" || selected.includes(document.id)) || [];
  return <section className="rounded border p-4 space-y-2">
    <h3 className="font-semibold">Context documents</h3>
    <p className="text-sm text-muted-foreground">Attach reviewed PDFs from this class. The Document-guided learning template uses approved content during the learner conversation.</p>
    {error && <p className="text-destructive">Could not load class documents.</p>}
    {ready.map((document) => <label key={document.id} className="flex items-center gap-2"><input type="checkbox" disabled={disabled || document.status !== "ready" && !selected.includes(document.id)} checked={selected.includes(document.id)} onChange={(event) => onChange(event.target.checked ? [...selected, document.id] : selected.filter((id) => id !== document.id))} />{document.title}{document.status !== "ready" && <span className="text-sm text-muted-foreground">(needs review)</span>}</label>)}
    {!ready.length && <p className="text-sm text-muted-foreground">No reviewed documents yet.</p>}
    <Link className="text-sm underline" href={`/teacher/classes/${classId}/documents`}>Open class document library</Link>
  </section>;
}
