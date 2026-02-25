export function getCloudFunctionUrl(functionName: string): string {
  if (process.env.CLOUD_FUNCTIONS_LOCAL === "true") {
    const base = process.env.CLOUD_FUNCTIONS_LOCAL_ENDPOINT ?? "http://localhost:5001";
    const projectId = process.env.FIREBASE_PROJECT_ID ?? "speak2learn-88da0";
    const region = process.env.FIREBASE_FUNCTIONS_REGION ?? "us-central1";
    return `${base}/${projectId}/${region}/${functionName}`;
  }
  const base = process.env.CLOUD_FUNCTION_PRODUCTION_ENDPOINT;
  return `${base}/${functionName}`;
}
