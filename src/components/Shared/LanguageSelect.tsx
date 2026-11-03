"use client";
import type { ComponentProps } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { APP_LOCALES } from "@/lib/locales";
const options = APP_LOCALES.map((locale) => ({
  value: locale.locale,
  label: locale.label,
}));
export function LanguageSelect(
  props: Omit<ComponentProps<typeof SearchableSelect>, "options">,
) {
  return (
    <SearchableSelect
      options={options}
      placeholder="Select a language"
      {...props}
    />
  );
}
