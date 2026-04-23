/**
 * Reliable client-side emitter for activity events.
 *
 * Responsibilities:
 *   - Generate a UUID `eventId` at emit time (not render time) so React
 *     Strict Mode double-mounts don't cause duplicate logical events.
 *   - Transport via `fetch(..., { keepalive: true })` so events survive
 *     page navigation / close.
 *   - If the send fails (network, offline, transient 5xx), enqueue the
 *     payload in a bounded retry queue. `localStorage` is the primary
 *     store so pending events survive reloads; when unavailable we fall
 *     back to an in-memory queue.
 *   - Flush the queue opportunistically on `online`,
 *     `visibilitychange: visible`, and on each successful send.
 *
 * Server-side idempotency on `event_id` guarantees that retries do not
 * produce duplicate rows.
 */

import {
  ActivityEventInput,
  ComponentType,
  EventType,
  InteractionSource,
} from "@/types/activity";

const ENDPOINT = "/api/activity-events";
const STORAGE_KEY = "asr_activity_event_queue_v1";
const MAX_QUEUE_SIZE = 500;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

export interface EmitOptions {
  eventType: EventType;
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  submissionId?: string;
  classId?: string;
  userId?: string;
  interactionSource?: InteractionSource;
}

interface QueuedEvent extends ActivityEventInput {
  attempts: number;
  nextAttemptAt: number;
}

function inferInteractionSource(eventType: EventType): InteractionSource {
  switch (eventType) {
    case "content_item_opened":
    case "navigation_back_clicked":
    case "submit_clicked":
    case "question_next_clicked":
    case "question_previous_clicked":
    case "upload_started":
    case "marked_complete_clicked":
      return "click";
    case "component_closed":
      return "lifecycle";
    case "upload_completed":
    case "bot_disconnected":
      return "async_callback";
    case "attempt_started":
    case "attempt_ended":
    case "bot_connect_initiated":
    default:
      return "system";
  }
}

/** Generate a RFC4122 v4 UUID, preferring the platform implementation. */
function generateUuid(): string {
  if (typeof globalThis !== "undefined") {
    const maybeCrypto = (
      globalThis as unknown as { crypto?: { randomUUID?: () => string } }
    ).crypto;
    if (maybeCrypto?.randomUUID) {
      try {
        return maybeCrypto.randomUUID();
      } catch {
        // fall through to manual generation
      }
    }
  }
  // Manual v4 fallback (non-cryptographic but fine for an event identifier).
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const b = new Uint8Array(16);
  for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const s = Array.from(b, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(
    16,
    20
  )}-${s.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Queue storage (localStorage-primary, in-memory fallback)
// ---------------------------------------------------------------------------

let memoryQueue: QueuedEvent[] = [];
let useMemoryQueue = false;

function canUseLocalStorage(): boolean {
  if (useMemoryQueue) return false;
  if (typeof window === "undefined") return false;
  try {
    const probeKey = `${STORAGE_KEY}__probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    useMemoryQueue = true;
    return false;
  }
}

function readQueue(): QueuedEvent[] {
  if (canUseLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QueuedEvent[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return memoryQueue.slice();
}

function writeQueue(queue: QueuedEvent[]) {
  const bounded =
    queue.length > MAX_QUEUE_SIZE
      ? queue.slice(queue.length - MAX_QUEUE_SIZE)
      : queue;

  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
      return;
    } catch {
      // Storage quota exceeded or disabled mid-session: fall back to memory.
      useMemoryQueue = true;
    }
  }
  memoryQueue = bounded;
}

function enqueue(event: QueuedEvent) {
  const queue = readQueue();
  // De-dupe by eventId so we never enqueue the same event twice.
  if (queue.some((q) => q.eventId === event.eventId)) return;
  queue.push(event);
  writeQueue(queue);
}

function dequeueById(eventId: string) {
  const queue = readQueue();
  const next = queue.filter((q) => q.eventId !== eventId);
  if (next.length !== queue.length) writeQueue(next);
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * Perform a single POST attempt. Returns true when the server accepted the
 * payload (2xx) or rejected it with a 4xx (which means retrying won't help).
 * Returns false for network errors and 5xx so the event stays queued.
 */
async function postEvent(payload: ActivityEventInput): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "include",
    });
    if (res.ok) return true;
    // 4xx => validation problem; dropping avoids a poison-pill loop.
    if (res.status >= 400 && res.status < 500) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

let isFlushing = false;

async function flushQueue() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const queue = readQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    const ready = queue.filter((q) => q.nextAttemptAt <= now);

    for (const item of ready) {
      const { attempts: _attempts, nextAttemptAt: _nextAttemptAt, ...payload } =
        item;
      void _attempts;
      void _nextAttemptAt;
      const ok = await postEvent(payload);
      if (ok) {
        dequeueById(payload.eventId);
      } else {
        const current = readQueue();
        const idx = current.findIndex((q) => q.eventId === payload.eventId);
        if (idx >= 0) {
          const attempts = current[idx].attempts + 1;
          if (attempts >= MAX_RETRIES) {
            current.splice(idx, 1);
          } else {
            const backoff = BASE_BACKOFF_MS * 2 ** (attempts - 1);
            current[idx] = {
              ...current[idx],
              attempts,
              nextAttemptAt: Date.now() + backoff,
            };
          }
          writeQueue(current);
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}

// ---------------------------------------------------------------------------
// Flush triggers
// ---------------------------------------------------------------------------

let listenersInstalled = false;

function installFlushListeners() {
  if (listenersInstalled) return;
  if (typeof window === "undefined") return;
  listenersInstalled = true;

  const tryFlush = () => {
    void flushQueue();
  };

  window.addEventListener("online", tryFlush);
  window.addEventListener("focus", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });

  // One flush on install to drain anything left over from a previous session.
  tryFlush();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a semantic activity event.
 *
 * Generates `eventId` and `clientTs` fresh on every call (safe under React
 * Strict Mode). Attempts an immediate send; on failure the event is queued
 * locally and retried on the next flush trigger.
 */
export async function emitActivityEvent(options: EmitOptions): Promise<void> {
  installFlushListeners();

  const payload: ActivityEventInput = {
    eventId: generateUuid(),
    eventType: options.eventType,
    interactionSource:
      options.interactionSource ?? inferInteractionSource(options.eventType),
    componentType: options.componentType,
    componentId: options.componentId,
    subComponentId: options.subComponentId,
    submissionId: options.submissionId,
    classId: options.classId,
    userId: options.userId,
    clientTs: new Date().toISOString(),
  };

  const ok = await postEvent(payload);
  if (ok) {
    // Drain the queue opportunistically on successful sends.
    void flushQueue();
    return;
  }

  enqueue({ ...payload, attempts: 1, nextAttemptAt: Date.now() + BASE_BACKOFF_MS });
}

/**
 * Manually trigger a retry-queue drain. Exposed for callers that have extra
 * signal (e.g., a user clicking a retry button).
 */
export function flushActivityEventQueue(): Promise<void> {
  return flushQueue();
}
