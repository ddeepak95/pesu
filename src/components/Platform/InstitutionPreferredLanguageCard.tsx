"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { updateInstitutionPreferredLanguageAction } from "@/app/platform/actions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supportedLanguages } from "@/utils/supportedLanguages";
import type { Institution } from "@/lib/queries/institutions";

interface InstitutionPreferredLanguageCardProps {
  institution: Institution;
  /** Only super admins can change this (matches the institutions RLS write policy). */
  isSuper: boolean;
}

const LANGUAGE_OPTIONS = supportedLanguages.map((lang) => ({
  value: lang.code,
  label: lang.name,
}));

/**
 * Institution-level default language. Seeds `preferredLanguage` when an
 * admin creates a class under this institution via `ClassForm` — a
 * client-side pre-fill only, not a runtime/server-enforced default.
 */
export default function InstitutionPreferredLanguageCard({
  institution,
  isSuper,
}: InstitutionPreferredLanguageCardProps) {
  const router = useTrackedRouter();
  const [language, setLanguage] = useState(institution.preferred_language);
  const [isPending, startTransition] = useTransition();

  const dirty = language !== institution.preferred_language;

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInstitutionPreferredLanguageAction({
        institutionId: institution.id,
        preferredLanguage: language,
      });
      if (!result.ok) {
        showErrorToast(result.error ?? "Failed to update preferred language");
        return;
      }
      showSuccessToast("Preferred language updated");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default class language</CardTitle>
        <CardDescription>
          Pre-fills the language when an admin creates a new class under this
          institution. Doesn&apos;t change existing classes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <SearchableSelect
          value={language}
          onValueChange={setLanguage}
          options={LANGUAGE_OPTIONS}
          disabled={!isSuper || isPending}
          readOnly={!isSuper}
          className="w-[220px]"
        />
        {isSuper && (
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
