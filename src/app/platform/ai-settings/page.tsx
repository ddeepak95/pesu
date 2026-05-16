import Link from "next/link";

import PageLayout from "@/components/PageLayout";
import AiSettingsPageContent from "@/components/Settings/AiConfig/AiSettingsPageContent";

export const metadata = {
  title: "Platform AI settings",
};

export default function PlatformAiSettingsPage() {
  return (
    <PageLayout>
      <div className="space-y-6">
        <header>
          <Link
            href="/platform"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to platform admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Platform AI settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Activate providers, assign models to app functions, and browse the
            model catalog.
          </p>
        </header>

        <AiSettingsPageContent
          scope="platform"
          scopeId="platform"
          title="Platform AI configuration"
          description="Default providers and models for the whole product. Institutions can use platform keys per provider or bring their own."
        />
      </div>
    </PageLayout>
  );
}
