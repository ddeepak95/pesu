"use client";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Chatbot, ChatbotImage, ChatbotConfig } from "@/types/chatbot";
import { useChatbotImages } from "@/hooks/swr/useChatbotImages";
import { useEffectiveClassSettings } from "@/hooks/swr/useSettings";
import { invalidateChatbots } from "@/hooks/swr/useChatbots";
import { mutateChatbotImage, uploadChatbotImageFile } from "@/lib/queries/chatbotImages";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import MarkdownImage from "@/components/Shared/MarkdownImage";

export default function ChatbotImageLibrary({ bot, classId, mode, onModeChange, ensureSaved, disabled }: {
  bot?: Chatbot; classId: string; mode: NonNullable<ChatbotConfig["image_mode"]>;
  onModeChange: (mode: NonNullable<ChatbotConfig["image_mode"]>) => void;
  ensureSaved: () => Promise<Chatbot>; disabled: boolean;
}) {
  const { data, error: readError, mutate } = useChatbotImages(bot?.chatbot_id ?? null);
  const { data: settings } = useEffectiveClassSettings(classId);
  const allowed = settings?.allow_chatbot_images?.value === true && (!bot || data?.allowed === true);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  async function act(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "Image operation failed"); }
    finally { busy.current = false; setPending(false); setProgress(null); await invalidateChatbots(); }
  }
  async function upload() {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024)
      throw new Error("Choose a PNG, JPEG or WebP up to 10 MB.");
    const saved = await ensureSaved();
    const { id, uploadUrl } = await mutateChatbotImage(saved.chatbot_id, { action: "request", filename: file.name,
      mime_type: file.type, file_size: file.size, description });
    try {
      setProgress(0);
      await uploadChatbotImageFile(uploadUrl, file, setProgress);
      await mutateChatbotImage(saved.chatbot_id, { action: "confirm", id });
    } catch (e) {
      await mutateChatbotImage(saved.chatbot_id, { action: "remove", id }).catch(() => {});
      throw e;
    }
    setFile(null); setDescription("");
    if (fileInput.current) fileInput.current.value = "";
  }
  return <SettingsCard className="space-y-4">
    <h2 className="font-semibold">Images</h2>
    {!allowed && <p className="text-sm text-muted-foreground">An administrator must enable teacher-uploaded images for this class.</p>}
    {readError && <RetryErrorCard variant="block" message="Could not load images." retryable onRetry={() => void mutate()} />}
    {data?.configurationError && <p role="status" className="text-sm text-muted-foreground">{data.configurationError}</p>}
    <Label htmlFor="chatbot-image-mode">Use uploaded images</Label>
    <Select value={mode} disabled={!allowed || disabled || pending} onValueChange={value => onModeChange(value as typeof mode)}>
      <SelectTrigger id="chatbot-image-mode"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="off">Off</SelectItem><SelectItem value="append">Append beside original images</SelectItem><SelectItem value="replace">Replace matching images</SelectItem></SelectContent>
    </Select>
    <p className="text-sm text-muted-foreground">The bot matches images using your descriptions. Original images remain when no upload fits. PNG, JPEG or WebP, up to 10 MB each; 20 images per chatbot.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {data?.images.map(image => <ImageEntry key={image.id} image={image} shortId={bot!.chatbot_id}
        disabled={!allowed || disabled || pending} onSave={text => act(async () => { await mutateChatbotImage(bot!.chatbot_id, { action: "edit", id: image.id, description: text }); })}
        onRemove={() => act(async () => { await mutateChatbotImage(bot!.chatbot_id, { action: "remove", id: image.id }); })} />)}
    </div>
    <Label htmlFor="chatbot-image-file">Upload image</Label>
    <Input ref={fileInput} id="chatbot-image-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!allowed || pending || disabled}
      onChange={e => setFile(e.target.files?.[0] ?? null)} />
    <Label htmlFor="chatbot-image-description">Description and when to use it</Label>
    <Textarea id="chatbot-image-description" value={description} maxLength={2000} disabled={!allowed || pending || disabled} onChange={e => setDescription(e.target.value)} />
    <Button type="button" disabled={!allowed || disabled || pending || !file || !description.trim() || (data?.images.length ?? 0) >= 20} onClick={() => void act(upload)}>
      {pending && <Loader2 className="mr-2 size-4 animate-spin" />}{progress !== null ? (progress === 100 ? "Validating image…" : `Uploading ${progress}%`) : "Upload image"}
    </Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </SettingsCard>;
}

function ImageEntry({ image, shortId, disabled, onSave, onRemove }: { image: ChatbotImage; shortId: string; disabled: boolean; onSave: (text: string) => Promise<void>; onRemove: () => Promise<void> }) {
  const [description, setDescription] = useState(image.description);
  return <div className="space-y-2 rounded-md border p-3">
    <div className="max-h-48 overflow-auto bg-white"><MarkdownImage src={`/api/chatbots/images/${image.id}?chatbotId=${encodeURIComponent(shortId)}`} alt={image.description} /></div>
    <p className="truncate text-xs">{image.filename}</p>
    <Label htmlFor={`image-${image.id}`}>Description</Label>
    <Textarea id={`image-${image.id}`} value={description} maxLength={2000} disabled={disabled} onChange={e => setDescription(e.target.value)} />
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled || !description.trim() || description === image.description} onClick={() => void onSave(description)}>Save description</Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void onRemove()}>Remove</Button></div>
  </div>;
}
