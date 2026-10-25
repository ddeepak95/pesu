alter table public.class_document_figures
  add column source_labels text[] not null default '{}'::text[],
  add column label_source text not null default 'unlabeled'
    check (label_source in ('unlabeled', 'annotation', 'nearby_text', 'teacher'));

create index class_document_figures_source_labels_idx
  on public.class_document_figures using gin (source_labels);
