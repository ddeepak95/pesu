export function getCloudFunctionUrl(functionName: string): string {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
    const region = process.env.FIREBASE_FUNCTIONS_REGION ?? "";

  if (process.env.CLOUD_FUNCTIONS_LOCAL === "true") {
    const base = "http://localhost:5001";
    return `${base}/${projectId}/${region}/${functionName}`;
  }

  const base = `https://${region}-${projectId}.cloudfunctions.net`;
  return `${base}/${functionName}`;
}
