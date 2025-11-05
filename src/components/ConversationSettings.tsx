"use client";
import { useConversation } from "@/contexts/ConversationContext";
import { supportedLanguages } from "@/utils/supportedLanguages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ConversationSettings() {
  const { topic, language, setTopic, setLanguage } = useConversation();

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg shadow-md">
      <div className="flex flex-col gap-2">
        <label htmlFor="topic" className="font-semibold">
          Topic of Discussion:
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
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
          <DropdownMenuTrigger className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-left">
            {supportedLanguages.find((lang) => lang.code === language)?.name ||
              "Select Language"}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {supportedLanguages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
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
