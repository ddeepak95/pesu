import {
    usePipecatClient,
    usePipecatClientTransportState,
  } from "@pipecat-ai/client-react";
  
  export function ConnectButton() {
    const client = usePipecatClient();
    const transportState = usePipecatClientTransportState();
    const isConnected = ["connected", "ready"].includes(transportState);
  
    const handleClick = async () => {
      if (!client) {
        console.error("Pipecat client is not initialized");
        return;
      }
  
      try {
        if (isConnected) {
          await client.disconnect();
        } else {
          await client.startBotAndConnect({
            endpoint: "http://localhost:7860/start",
            requestData: {
                createDailyRoom: "true"
            }
          });
        }
      } catch (error) {
        console.error("Connection error:", error);
      }
    };
  
    return (
      <div className="controls">

        <button
          className={"border border-white text-white px-4 py-2 rounded-md cursor-pointer"}
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