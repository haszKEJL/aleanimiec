type UploadStatus = "idle" | "uploading" | "converting" | "swapping" | "done" | "error";

export type UploadJobState = {
  status: UploadStatus;
  message: string;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  bytesReceived: number;
  maxBytes: number;
  filename: string | null;
  error: string | null;
};

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

declare global {
  var __adminUploadJobState: UploadJobState | undefined;
  var __adminUploadJobRunning: boolean | undefined;
}

const initialState: UploadJobState = {
  status: "idle",
  message: "Gotowy na nowy upload.",
  updatedAt: Date.now(),
  startedAt: null,
  finishedAt: null,
  bytesReceived: 0,
  maxBytes: MAX_UPLOAD_BYTES,
  filename: null,
  error: null,
};

if (!globalThis.__adminUploadJobState) {
  globalThis.__adminUploadJobState = initialState;
}

if (typeof globalThis.__adminUploadJobRunning !== "boolean") {
  globalThis.__adminUploadJobRunning = false;
}

export function getUploadJobState(): UploadJobState {
  return globalThis.__adminUploadJobState ?? initialState;
}

export function updateUploadJobState(patch: Partial<UploadJobState>): UploadJobState {
  const nextState: UploadJobState = {
    ...getUploadJobState(),
    ...patch,
    updatedAt: Date.now(),
  };

  globalThis.__adminUploadJobState = nextState;
  return nextState;
}

export function isUploadJobRunning(): boolean {
  return Boolean(globalThis.__adminUploadJobRunning);
}

export function setUploadJobRunning(running: boolean): void {
  globalThis.__adminUploadJobRunning = running;
}
