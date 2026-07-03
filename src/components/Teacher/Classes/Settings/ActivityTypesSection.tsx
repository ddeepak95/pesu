"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Class } from "@/types/class";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import {
  invalidateActivityTemplatesCache,
  useClassTemplateEnablement,
  useClassTemplates,
  useMyTemplates,
  useSystemTemplates,
} from "@/hooks/swr";
import {
  addTemplateToClass,
  removeTemplateFromClass,
  setSystemTemplateAvailability,
} from "@/lib/templates/actions";

interface ActivityTypesSectionProps {
  classData: Class;
  classShortId: string;
  userId: string;
}

export default function ActivityTypesSection({
  classData,
  classShortId,
  userId,
}: ActivityTypesSectionProps) {
  const classDbId = classData.id;
  const systemQuery = useSystemTemplates();
  const enablementQuery = useClassTemplateEnablement(classDbId);
  const classTemplatesQuery = useClassTemplates(classDbId);
  const myQuery = useMyTemplates(userId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loading =
    systemQuery.isLoading ||
    enablementQuery.isLoading ||
    classTemplatesQuery.isLoading ||
    myQuery.isLoading;

  const systemTemplates = systemQuery.data ?? [];
  const classTemplates = classTemplatesQuery.data ?? [];
  const myTemplates = myQuery.data ?? [];
  const enablement = enablementQuery.data ?? [];
  const prunedSystem = new Set(
    enablement.filter((r) => !r.enabled).map((r) => r.template_id),
  );
  const addedPersonal = new Set(
    enablement.filter((r) => r.enabled).map((r) => r.template_id),
  );

  async function act(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    try {
      await fn();
      await invalidateActivityTemplatesCache();
      showSuccessToast(msg);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Types</CardTitle>
        <CardDescription>
          Choose which activity types teachers can pick when building an
          assignment in this class. Toggle system types on or off, add your own
          from your library, or create class-owned templates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading activity types…
          </div>
        ) : (
          <>
            {/* System activity types — on by default; prune per class */}
            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">System activity types</h4>
                <p className="text-xs text-muted-foreground">
                  The built-in types. Turn off any you don&apos;t want teachers
                  to pick in this class.
                </p>
              </div>
              <div className="space-y-2">
                {systemTemplates.map((t) => {
                  const available = !prunedSystem.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {t.name}
                          </span>
                          <Link
                            href={`/teacher/templates/${t.id}`}
                            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                          >
                            view
                          </Link>
                        </div>
                        {t.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={available}
                        disabled={busyId === t.id}
                        onCheckedChange={(on) =>
                          void act(
                            t.id,
                            () =>
                              setSystemTemplateAvailability(classDbId, t.id, on),
                            on
                              ? `"${t.name}" is available in this class.`
                              : `"${t.name}" is hidden from this class.`,
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Class-owned templates — always available */}
            <section className="space-y-3 border-t pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold">Class templates</h4>
                  <p className="text-xs text-muted-foreground">
                    Class-owned types, always available here. Co-editable by all
                    co-teachers.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/teacher/classes/${classShortId}/templates`}>
                    Manage
                    <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              {classTemplates.length === 0 ? (
                <p className="rounded-md border border-dashed bg-muted/30 px-4 py-5 text-center text-xs text-muted-foreground">
                  No class templates yet. Use{" "}
                  <span className="font-medium">Manage</span> to create one or
                  clone a system type to customize.
                </p>
              ) : (
                <div className="space-y-2">
                  {classTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <Link
                        href={`/teacher/templates/${t.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Available
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Add from my library */}
            <section className="space-y-3 border-t pt-6">
              <div>
                <h4 className="text-sm font-semibold">Add from my library</h4>
                <p className="text-xs text-muted-foreground">
                  Drop one of your personal templates into this class&apos;s
                  picker. It stays yours; this only makes it selectable here.
                </p>
              </div>

              {myTemplates.length === 0 ? (
                <p className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                  You have no personal templates yet.{" "}
                  <Link href="/teacher/templates" className="underline">
                    Create one in My Templates
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-2">
                  {myTemplates.map((t) => {
                    const added = addedPersonal.has(t.id);
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <Link
                          href={`/teacher/templates/${t.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {t.name}
                        </Link>
                        {added ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === t.id}
                            onClick={() =>
                              void act(
                                t.id,
                                () => removeTemplateFromClass(classDbId, t.id),
                                "Removed from this class.",
                              )
                            }
                          >
                            <Check className="mr-1.5 h-3.5 w-3.5" /> Added
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === t.id}
                            onClick={() =>
                              void act(
                                t.id,
                                () => addTemplateToClass(classDbId, t.id),
                                "Added to this class.",
                              )
                            }
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
