/** Gateway-internal transport. Exactly one request; the caller owns metering. */
export async function requestDecisions(apiKey: string, body: unknown, timeoutMs: number) {
  if (timeoutMs <= 0) throw new Error("Image matching timed out");
  const response = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
  });
  if (!response.ok) throw new Error(`Decisions request failed (${response.status})`);
  const result = await response.json();
  return { result, requestId: response.headers.get("x-request-id") };
}
