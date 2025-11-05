import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { useConversation } from "@/contexts/ConversationContext";

export function ConnectButton() {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);
  const { language, topic } = useConversation();

  const handleClick = async () => {
    if (!client) {
      console.error("Pipecat client is not initialized");
      return;
    }

    try {
      if (isConnected) {
        await client.disconnect();
      } else {
        console.log("Connecting to bot with language:", language);
        console.log("Connecting to bot with topic:", topic);
        await client.startBotAndConnect({
          endpoint: "http://localhost:7860/start",
          requestData: {
            body: {
              language,
              topic,
            },
          },
        });
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  return (
    <div className="controls">
      <button
        className={
          "border border-white text-white px-4 py-2 rounded-md cursor-pointer"
        }
        onClick={handleClick}
        disabled={
          !client || ["connecting", "disconnecting"].includes(transportState)
        }
      >
        {isConnected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
}
