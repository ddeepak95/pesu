"use client";
import { useConversation } from "@/contexts/ConversationContext";
import { supportedLanguages } from "@/utils/supportedLanguages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";

export function ConversationSettings() {
  const { topic, language, setTopic, setLanguage } = useConversation();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg shadow-md w-full">
      <div className="flex flex-col gap-2">
        <label htmlFor="topic" className="font-semibold">
          Topic of Discussion:
        </label>
        <Textarea
          id="topic"
          value={topic}
          disabled={isConnected}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter topic..."
          className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="language" className="font-semibold">
          Language:
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isConnected}
            className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-left w-25 cursor-pointer ${
              isConnected ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {supportedLanguages.find((lang) => lang.code === language)?.name ||
              "Select Language"}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {supportedLanguages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className="cursor-pointer px-3 py-2"
              >
                {lang.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
