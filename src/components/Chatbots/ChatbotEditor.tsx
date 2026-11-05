"use client";

import { useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { useClassGroups } from "@/hooks/swr/useGroups";
import {
  invalidateContentItemsByClass,
  invalidateContentItemsByGroup,
} from "@/hooks/swr/useContentItems";
import { invalidateChatbots } from "@/hooks/swr/useChatbots";
import { createChatbot, updateChatbot } from "@/lib/queries/chatbots";
import {
  DEFAULT_CHATBOT_CONFIG,
  validateChatbotConfig,
} from "@/lib/chatbots/config";
import type { Chatbot, ChatbotConfig } from "@/types/chatbot";
import PageLayout from "@/components/PageLayout";
import PageTitle from "@/components/Shared/PageTitle";
import BackButton from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TabsContent } from "@/components/ui/tabs";
import { SettingsCard } from "@/components/ui/settings-card";
import { CollapsibleSection } from "@/components/Teacher/Assignments/CollapsibleSection";
import { ContentEditorTabs } from "@/components/Shared/ContentEditorTabs";
import { ContentFormFooter } from "@/components/Shared/ContentFormFooter";
import { LanguageSelect } from "@/components/Shared/LanguageSelect";
import { postChatbotAction } from "@/lib/queries/chatbots";
import ChatbotChat from "./ChatbotChat";
import ChatbotImageLibrary from "./ChatbotImageLibrary";

export default function ChatbotEditor({
  classDbId,
  classId,
  bot,
}: {
  classDbId: string;
  classId: string;
  bot?: Chatbot;
}) {
  const [savedBot, setSavedBot] = useState(bot);
  const [previewOpen, setPreviewOpen] = useState(false);
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { data: groups, error: groupsError } = useClassGroups(classDbId);
  const groupId = searchParams.get("groupId") ?? "";
  const selectedGroup = groupId
    ? groups?.some((g) => g.id === groupId)
      ? groupId
      : ""
    : (groups?.[0]?.id ?? "");
  const [config, setConfig] = useState<ChatbotConfig>(() =>
    bot
      ? { ...bot, status: bot.status === "active" ? "active" : "draft" }
      : { ...DEFAULT_CHATBOT_CONFIG },
  );
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = <K extends keyof ChatbotConfig>(
    key: K,
    value: ChatbotConfig[K],
  ) => setConfig((c) => ({ ...c, [key]: value }));
  const backHref = `/teacher/classes/${classId}?tab=content${selectedGroup ? `&groupId=${selectedGroup}` : ""}`;

  async function save(action: "draft" | "preview" | "publish" | "library") {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const validated = validateChatbotConfig({
        ...config,
        status:
          action === "draft"
            ? "draft"
            : action === "publish"
              ? "active"
              : savedBot?.status === "active"
                ? "active"
                : "draft",
      });
      const saved = savedBot
        ? await updateChatbot(savedBot, validated)
        : await createChatbot({
            ...validated,
            class_id: classDbId,
            class_group_id: selectedGroup,
          });
      setSavedBot(saved);
      setConfig(validated);
      await Promise.allSettled([
        invalidateChatbots(),
        invalidateContentItemsByClass(classDbId),
        ...(selectedGroup
          ? [invalidateContentItemsByGroup(classDbId, selectedGroup)]
          : []),
      ]);
      if (action === "library") return saved;
      if (action === "preview") {
        await postChatbotAction(saved.chatbot_id, "conversation", {
          preview: true,
          restart: false,
        });
        await invalidateChatbots();
        setPreviewOpen(true);
        return;
      }
      router.push(
        `/teacher/classes/${classId}/chatbots/${saved.chatbot_id}${selectedGroup ? `?groupId=${selectedGroup}` : ""}`,
      );
    } catch (err) {
      if (action === "library") throw err;
      setError(
        err instanceof Error
          ? err.message
          : ((err as { message?: string })?.message ??
              "Could not save chatbot"),
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <PageLayout>
      <BackButton onClick={() => router.push(backHref)} />
      <PageTitle
        title={bot ? "Edit chatbot" : "Create chatbot"}
        className="my-6"
      />
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void save("publish");
        }}
        className="space-y-6 pb-28"
      >
        <ContentEditorTabs>
          <TabsContent value="content" className="space-y-6 pt-6">
            {(groupsError || (groups && !selectedGroup)) && !savedBot && (
              <p role="alert">
                Could not load the content placement. Please refresh and try
                again.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="chatbot-title">Title</Label>
              <Input
                id="chatbot-title"
                value={config.title}
                maxLength={200}
                onChange={(e) => change("title", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatbot-prompt">System prompt</Label>
              <Textarea
                id="chatbot-prompt"
                rows={7}
                value={config.system_prompt}
                maxLength={20000}
                onChange={(e) => change("system_prompt", e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                Use {"{topic_title}"} and {"{language}"} to insert the title and
                conversation language.
              </p>
            </div>
            <ChatbotImageLibrary bot={savedBot} classId={classDbId} mode={config.image_mode ?? "off"}
              onModeChange={value => change("image_mode", value)} disabled={pending}
              ensureSaved={async () => { const saved = await save("library"); if (!saved) throw new Error("Could not save chatbot"); return saved; }} />
          </TabsContent>
          <TabsContent value="settings" className="space-y-6 pt-6">
            <SettingsCard className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="chatbot-public" checked={config.is_public} disabled={pending}
                  onCheckedChange={(checked) => change("is_public", checked === true)} />
                <Label htmlFor="chatbot-public">Make chatbot public</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Once published, anyone with the public link can enter their name and chat without signing in.
                Public conversations use this class’s AI allowance and appear in your transcript review.
                Conversation limits apply per browser session; clearing cookies or changing browsers starts a new session.
              </p>
            </SettingsCard>
            <CollapsibleSection title="Language" defaultOpen disabled={pending}>
              <SettingsCard className="space-y-2">
                <Label htmlFor="chatbot-language">Conversation language</Label>
                <LanguageSelect
                  id="chatbot-language"
                  value={config.language}
                  onValueChange={(value) => change("language", value)}
                  disabled={pending}
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="chatbot-lock-language"
                    checked={config.lock_language}
                    onCheckedChange={(checked) =>
                      change("lock_language", checked === true)
                    }
                    disabled={pending}
                  />
                  <Label htmlFor="chatbot-lock-language">
                    Lock conversation language for students
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  When unlocked, students can change the language during their
                  conversation.
                </p>
              </SettingsCard>
            </CollapsibleSection>
            <SettingsCard>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chatbot-turns">
                    Student messages per conversation
                  </Label>
                  <Input
                    id="chatbot-turns"
                    type="number"
                    min={1}
                    max={1000}
                    value={config.turn_limit}
                    onChange={(e) =>
                      change("turn_limit", e.target.valueAsNumber)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chatbot-conversations">
                    Conversations per student
                  </Label>
                  <Input
                    id="chatbot-conversations"
                    type="number"
                    min={1}
                    max={1001}
                    disabled={config.max_conversations === null}
                    value={config.max_conversations ?? ""}
                    onChange={(e) =>
                      change("max_conversations", e.target.valueAsNumber)
                    }
                    required={config.max_conversations !== null}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="chatbot-unlimited"
                      checked={config.max_conversations === null}
                      onCheckedChange={(checked) =>
                        change("max_conversations", checked === true ? null : 1)
                      }
                      disabled={pending}
                    />
                    <Label htmlFor="chatbot-unlimited">
                      Unlimited conversations
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Includes the first conversation. Starting another
                    conversation uses one allowance.
                  </p>
                </div>
              </div>
            </SettingsCard>
            <CollapsibleSection
              title="Allowed tools"
              defaultOpen
              disabled={pending}
            >
              <SettingsCard>
                <fieldset className="space-y-3 rounded-md border p-4">
                  <legend className="px-1 font-medium">Allowed tools</legend>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="chatbot-web"
                      checked={config.web_search}
                      onCheckedChange={(checked) =>
                        change("web_search", checked === true)
                      }
                      disabled={pending}
                    />
                    <Label htmlFor="chatbot-web">Web search</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="chatbot-images"
                      checked={config.image_search}
                      onCheckedChange={(checked) =>
                        change("image_search", checked === true)
                      }
                      disabled={pending}
                    />
                    <Label htmlFor="chatbot-images">Image search</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Search uses the class AI provider. Image links depend on
                    available search results and are not guaranteed. Unsupported
                    tools will show an error.
                  </p>
                </fieldset>
              </SettingsCard>
            </CollapsibleSection>
            {savedBot && (
              <p className="text-sm text-muted-foreground">
                Changes apply immediately to future messages and new
                conversations. Previous transcripts are preserved.
              </p>
            )}
          </TabsContent>
        </ContentEditorTabs>
        <ContentFormFooter
          mode={savedBot ? "edit" : "create"}
          primaryText={savedBot?.status === "active" ? "Update" : "Publish"}
          loading={pending}
          disabled={!savedBot && !selectedGroup}
          error={error}
          onCancel={() => router.push(backHref)}
          onSaveDraft={() => void save("draft")}
          onSaveAndPreview={() => void save("preview")}
        />
      </form>
      {previewOpen && savedBot && (
        <ChatbotChat
          initialBot={savedBot}
          preview
          onExit={() => setPreviewOpen(false)}
        />
      )}
    </PageLayout>
  );
}
