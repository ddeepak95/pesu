"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChatbotConversations, useChatbotPublicParticipants, invalidateChatbots } from "@/hooks/swr/useChatbots";
import { useClassStudents } from "@/hooks/swr/useStudents";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { getLocaleLabel } from "@/lib/locales";
import type { Chatbot } from "@/types/chatbot";
import PageLayout from "@/components/PageLayout";
import PageTitle from "@/components/Shared/PageTitle";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import { ContentLinkShare } from "@/components/Shared/ContentLinkShare";
import ChatbotTranscript from "./ChatbotTranscript";
import { CircleDot, Globe, MessageSquare, Share2, Loader2 } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SettingsCard } from "@/components/ui/settings-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MutedPrimaryTabsList, MutedPrimaryTabsTrigger } from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { CollapsibleSection } from "@/components/Teacher/Assignments/CollapsibleSection";
import { useMaterialLinkedAcrossGroups, invalidateContentItemsByClass, invalidateContentItemsByGroup } from "@/hooks/swr/useContentItems";
import { updateChatbot, deleteChatbot } from "@/lib/queries/chatbots";
import { countContentItemPlacementsByRefTracked } from "@/lib/swr/imperativeReads";
import { removeTeacherMaterialPlacementOrEntity } from "@/lib/teacherMaterialRemove";
import { showErrorToast } from "@/lib/toast";

export default function TeacherChatbot({
  bot: initialBot,
  classId,
}: {
  bot: Chatbot;
  classId: string;
}) {
  const router = useTrackedRouter();
  const [bot, setBot] = useState(initialBot);
  const [pending, setPending] = useState(false);
  const actionInFlight = useRef(false);
  const isLinked = useMaterialLinkedAcrossGroups(bot.class_id, "chatbot", bot.id);
  const [shareOpen, setShareOpen] = useState(false);
  const { data: publicParticipants, error: participantsError } = useChatbotPublicParticipants(bot.id);
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId") || undefined;
  const detailPath = `/teacher/classes/${classId}/chatbots/${bot.chatbot_id}`;
  const backParams = new URLSearchParams({ tab: "content" });
  if (groupId) backParams.set("groupId", groupId);
  const backPath = `/teacher/classes/${classId}?${backParams}`;
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "content" || tabParam === "config" || tabParam === "conversations"
    ? tabParam : searchParams.has("studentId") ? "conversations" : "content";
  function setTab(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`${detailPath}?${params}`, { scroll: false });
  }
  async function refreshCaches() {
    await Promise.all([
      invalidateChatbots(),
      invalidateContentItemsByClass(bot.class_id),
      ...(groupId ? [invalidateContentItemsByGroup(bot.class_id, groupId)] : []),
    ]);
  }
  async function manage(action: "publish" | "delete") {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPending(true);
    try {
      if (action === "publish") {
        setBot(await updateChatbot(bot, { ...bot, status: "active" }));
        await refreshCaches();
      } else {
        const count = await countContentItemPlacementsByRefTracked({ classId: bot.class_id, type: "chatbot", refId: bot.id });
        if (!window.confirm(count > 1
          ? "This chatbot is linked in more than one group. Remove it only from this group's feed?"
          : "Are you sure you want to delete this chatbot?")) return;
        await removeTeacherMaterialPlacementOrEntity({
          classDbId: bot.class_id, type: "chatbot", refId: bot.id,
          placementGroupId: groupId, deleteEntitySoft: () => deleteChatbot(bot.id),
          contentItemsAlreadyHandledWithEntity: true,
        });
        await refreshCaches();
        router.push(backPath);
      }
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Could not update chatbot. Please try again.");
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }
  const {
    data: conversations,
    error,
  } = useChatbotConversations(bot.id);
  const { data: students } = useClassStudents(bot.class_id);
  const names = useMemo(
    () =>
      new Map(
        [...(students?.map((s) => [
          s.student_id,
          s.student_display_name || s.student_email || s.student_id,
        ] as const) ?? []), ...(publicParticipants?.map((p) => [p.id, `${p.name} (public)`] as const) ?? [])],
      ),
    [students, publicParticipants],
  );
  const [studentId, setStudentId] = useState(
    searchParams.get("studentId") ?? "",
  );
  const [conversationId, setConversationId] = useState("");
  const visible =
    conversations?.filter((c) => !studentId || (c.student_id ?? c.public_participant_id) === studentId) ??
    [];
  const selected = visible.find((c) => c.id === conversationId) ?? visible[0];
  const participants = [
    ...new Set(
      conversations?.flatMap((c) => (c.student_id || c.public_participant_id ? [c.student_id ?? c.public_participant_id!] : [])),
    ),
  ];
  return (
    <PageLayout>
      <ContentLinkShare open={shareOpen} onOpenChange={setShareOpen} contentLabel="Chatbot"
        publicPath={`/chatbot/${bot.chatbot_id}`} classroomPath={`/student/classes/${classId}/chatbots/${bot.chatbot_id}`}
        isPublic={bot.is_public && bot.status === "active"} />
      <div className="mb-4">
        <BackButton label="Back to class" onClick={() => router.push(backPath)} />
      </div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <PageTitle title={bot.title} variant="hero" isLinked={isLinked} className="min-w-0 flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Options
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {bot.status === "draft" && <DropdownMenuItem onClick={() => void manage("publish")}>Publish</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => setShareOpen(true)} disabled={bot.status !== "active"}>
              <Share2 className="mr-2 h-4 w-4" />Share Links
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`${detailPath}/edit?${searchParams.toString()}`)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void manage("delete")} className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Turns per conversation:</span>
          <span className="font-medium">{bot.turn_limit}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleDot className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Status:</span>
          <span className="font-medium capitalize">{bot.status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Access:</span>
          <span className="font-medium">{bot.is_public ? "Public" : "Classroom"}</span>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
          <MutedPrimaryTabsTrigger value="content" className="rounded-sm px-4 py-2">Content</MutedPrimaryTabsTrigger>
          <MutedPrimaryTabsTrigger value="config" className="rounded-sm px-4 py-2">Config</MutedPrimaryTabsTrigger>
          <MutedPrimaryTabsTrigger value="conversations" className="rounded-sm px-4 py-2">Conversations</MutedPrimaryTabsTrigger>
        </MutedPrimaryTabsList>
        <TabsContent value="content" className="space-y-6">
          <SettingsCard className="space-y-2">
            <h2 className="text-sm font-medium">Title</h2>
            <p>{bot.title}</p>
          </SettingsCard>
          <SettingsCard className="space-y-2">
            <h2 className="text-sm font-medium">System prompt</h2>
            <p className="whitespace-pre-wrap break-words text-sm">{bot.system_prompt}</p>
          </SettingsCard>
        </TabsContent>
        <TabsContent value="config" className="space-y-6">
          <CollapsibleSection title="Language" defaultOpen>
            <SettingsCard className="mt-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm text-muted-foreground">Conversation language</dt><dd className="mt-1">{getLocaleLabel(bot.language)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Student language changes</dt><dd className="mt-1">{bot.lock_language ? "Locked by teacher" : "Allowed"}</dd></div>
              </dl>
            </SettingsCard>
          </CollapsibleSection>
          <SettingsCard>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">Student messages per conversation</dt><dd className="mt-1">{bot.turn_limit}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Conversations per student</dt><dd className="mt-1">{bot.max_conversations ?? "Unlimited"}</dd></div>
            </dl>
          </SettingsCard>
          <CollapsibleSection title="Allowed tools" defaultOpen>
            <SettingsCard className="mt-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm text-muted-foreground">Web search</dt><dd className="mt-1">{bot.web_search ? "Allowed" : "Off"}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Image search</dt><dd className="mt-1">{bot.image_search ? "Allowed" : "Off"}</dd></div>
              </dl>
            </SettingsCard>
          </CollapsibleSection>
          <SettingsCard className="space-y-2">
            <h2 className="text-sm font-medium">Public access</h2>
            <p className="text-sm">{bot.is_public ? "Enabled. Once published, anyone with the public link can chat without signing in." : "Off. Only assigned students can use this chatbot."}</p>
            {bot.is_public && <p className="text-sm text-muted-foreground">Public conversation allowances apply per browser session.</p>}
          </SettingsCard>
        </TabsContent>
        <TabsContent value="conversations" className="space-y-6">
      {(error || participantsError) && (
        <RetryErrorCard
          message="Could not load conversations."
          variant="block"
          retryable
          onRetry={() => void invalidateChatbots()}
        />
      )}
      {conversations?.length === 0 ? (
        <p className="text-muted-foreground">No conversations yet.</p>
      ) : conversations ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transcript-student">Participant</Label>
              <SearchableSelect
                id="transcript-student"
                value={studentId || "all"}
                onValueChange={(value) => {
                  setStudentId(value === "all" ? "" : value);
                  setConversationId("");
                }}
                options={[
                  { value: "all", label: "All participants" },
                  ...participants.map((id) => ({
                    value: id,
                    label: names.get(id) || id,
                  })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transcript-conversation">Conversation</Label>
              <SearchableSelect
                id="transcript-conversation"
                value={selected?.id ?? ""}
                onValueChange={setConversationId}
                options={visible.map((c) => ({
                  value: c.id,
                  label: `${names.get(c.student_id ?? c.public_participant_id ?? "") || c.student_id || c.public_participant_id} — conversation ${c.sequence} (${c.turns_used} turns)${c.closed_at ? " (previous)" : ""}`,
                }))}
              />
            </div>
          </div>
          <ChatbotTranscript conversationId={selected?.id ?? null} />
        </>
      ) : null}
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
