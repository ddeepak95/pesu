import { getCloudFunctionUrl } from "./get-cloud-function-url";

export async function callCloudFunction<T>(
  functionName: string,
  options?: { body?: Record<string, unknown>; method?: string },
): Promise<T> {
  const url = getCloudFunctionUrl(functionName);
  const res = await fetch(url, {
    method: options?.method ?? "POST",
    headers: {
      "x-api-key": process.env.CLOUD_FUNCTIONS_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`Cloud function error: ${res.status}`);
  return res.json();
}
