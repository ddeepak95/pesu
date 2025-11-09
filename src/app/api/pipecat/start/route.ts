import { NextRequest, NextResponse } from "next/server";

// Determine if we're using cloud or local based on explicit env variable
const USE_CLOUD = process.env.PIPECAT_USE_CLOUD === "true";

// Get the API base URL - either local development or Pipecat Cloud
const API_BASE_URL = USE_CLOUD
  ? `https://api.pipecat.daily.co/v1/public/${process.env.AGENT_NAME || "pesu-pipecat"}`
  : process.env.PIPECAT_LOCAL_ENDPOINT || "http://localhost:7860";

console.log(
  "🔷 Pipecat API: Using",
  API_BASE_URL,
  USE_CLOUD ? "(CLOUD)" : "(LOCAL)"
);

export async function POST(request: NextRequest) {
  console.log("🔷 Pipecat API: Request received");

  try {
    // Receive the custom data from the client
    const customData = await request.json();
    console.log("🔷 Custom data:", JSON.stringify(customData, null, 2));

    // Prepare headers - only add Authorization for cloud
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add auth header for Pipecat Cloud
    if (USE_CLOUD && process.env.PIPECAT_API_KEY) {
      headers.Authorization = `Bearer ${process.env.PIPECAT_API_KEY}`;
      console.log("🔷 Added Authorization header for cloud");
    }

    // Prepare the request body
    const requestBody = {
      createDailyRoom: true,
      dailyRoomProperties: { start_video_off: false },
      body: customData,
    };

    console.log("🔷 Forwarding to:", `${API_BASE_URL}/start`);

    const response = await fetch(`${API_BASE_URL}/start`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log("🔷 Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔴 API error:", errorText);
      return NextResponse.json(
        { error: `API responded with status: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("✅ Success, returning response");

    // Both local and cloud return the same format
    return NextResponse.json(data);
  } catch (error) {
    console.error("🔴 API error:", error);
    return NextResponse.json(
      { error: "Failed to start agent", details: String(error) },
      { status: 500 }
    );
  }
}

