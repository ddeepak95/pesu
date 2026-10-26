import "server-only";

import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";

export type DocumentTask = {
  documentId: string;
  runId: string;
  phase: "poll";
};

export function documentQueueEnabled(): boolean {
  return Boolean(
    process.env.CLOUD_TASKS_DOCUMENT_QUEUE &&
      process.env.CLASS_DOCUMENT_WORKER_URL &&
      process.env.CLASS_DOCUMENT_TASK_INVOKER,
  );
}

export async function enqueueDocumentTask(
  task: DocumentTask,
  delaySeconds = 0,
): Promise<void> {
  if (!documentQueueEnabled()) return; // Local development advances from the teacher detail poll.
  const credentials = JSON.parse(
    Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "",
      "base64",
    ).toString("utf8"),
  );
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await auth.getAccessToken();
  const queue = process.env.CLOUD_TASKS_DOCUMENT_QUEUE!;
  const workerUrl = process.env.CLASS_DOCUMENT_WORKER_URL!;
  const audience =
    process.env.CLASS_DOCUMENT_WORKER_AUDIENCE || new URL(workerUrl).origin;
  const taskId = randomUUID();
  const body = {
    task: {
      name: `${queue}/tasks/${taskId}`,
      dispatchDeadline: "900s",
      ...(delaySeconds
        ? {
            scheduleTime: new Date(
              Date.now() + delaySeconds * 1000,
            ).toISOString(),
          }
        : {}),
      httpRequest: {
        httpMethod: "POST",
        url: workerUrl,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(task)).toString("base64"),
        oidcToken: {
          serviceAccountEmail: process.env.CLASS_DOCUMENT_TASK_INVOKER,
          audience,
        },
      },
    },
  };
  const response = await fetch(
    `https://cloudtasks.googleapis.com/v2/${queue}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (response.status === 409) return; // A duplicate worker completed or is already queued.
  if (!response.ok)
    throw new Error(
      `Could not enqueue document task: ${response.status} ${await response.text()}`,
    );
}
