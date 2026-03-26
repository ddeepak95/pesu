"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSubmissionConfig } from "@/types/assignment";
import { SubmissionFile } from "@/types/submission";
import {
  uploadSubmissionFile,
  deleteSubmissionFile,
  getSubmissionFiles,
  getFileDownloadUrl,
} from "@/lib/queries/submissionFiles";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Loader2, Download, FileCode, Check, AlertCircle } from "lucide-react";
import { showErrorToast } from "@/lib/toast";

interface FileUploadZoneProps {
  submissionId: string;
  assignmentId: string;
  config: FileSubmissionConfig;
  existingFiles: SubmissionFile[];
  onFilesChanged: (files: SubmissionFile[]) => void;
  disabled?: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

type StepState = "completed" | "active" | "failed" | "pending";

const STEPS = ["Uploading", "Processing", "Ready"] as const;

function getStepStates(
  status: string,
): [StepState, StepState, StepState] {
  switch (status) {
    case "uploading":
      return ["active", "pending", "pending"];
    case "uploaded":
      return ["completed", "active", "pending"];
    case "processing":
      return ["completed", "active", "pending"];
    case "processed":
      return ["completed", "completed", "completed"];
    case "failed":
      return ["completed", "failed", "pending"];
    default:
      return ["active", "pending", "pending"];
  }
}

function stepTooltip(label: string, state: StepState, index: number): string {
  if (state === "failed" && index === 1) return "Failed";
  if (state === "completed" && index === 0) return "Uploaded";
  if (state === "completed" && index === 1) return "Processed";
  return label;
}

const STATUS_TEXT: Record<string, { label: string; className: string }> = {
  uploading: { label: "Uploading…", className: "text-blue-600 dark:text-blue-400" },
  uploaded: { label: "Uploaded", className: "text-blue-600 dark:text-blue-400" },
  processing: { label: "Processing…", className: "text-blue-600 dark:text-blue-400" },
  processed: { label: "Ready", className: "text-green-600 dark:text-green-500" },
  failed: { label: "Failed", className: "text-destructive" },
};

function FileStatusStepper({ status }: { status: string }) {
  const states = getStepStates(status);
  const info = STATUS_TEXT[status] ?? STATUS_TEXT.uploading;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0 w-full max-w-[100px]">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <span title={stepTooltip(label, states[i], i)}>
              <StepDot state={states[i]} />
            </span>
            {i < STEPS.length - 1 && (
              <div className="flex-1 mx-1">
                <div
                  className={`h-[2px] w-full rounded-full ${
                    states[i + 1] === "completed" || states[i + 1] === "active"
                      ? "bg-green-500 dark:bg-green-400"
                      : states[i] === "failed"
                        ? "bg-destructive/30"
                        : "bg-muted-foreground/20"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <span className={`text-xs font-medium shrink-0 ${info.className}`}>
        {info.label}
      </span>
    </div>
  );
}

function StepDot({ state }: { state: StepState }) {
  const base = "h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0";

  switch (state) {
    case "completed":
      return (
        <span className={`${base} bg-green-500 dark:bg-green-400`}>
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      );
    case "active":
      return (
        <span className={`${base} bg-blue-500 dark:bg-blue-400 animate-pulse`}>
          <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-destructive`}>
          <AlertCircle className="h-2.5 w-2.5 text-white" />
        </span>
      );
    case "pending":
    default:
      return (
        <span
          className={`${base} border-2 border-muted-foreground/25 bg-background`}
        />
      );
  }
}

function truncateFilename(name: string, max = 20): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf(".") !== -1 ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.slice(0, max - ext.length - 1);
  return `${base}…${ext}`;
}

export default function FileUploadZone({
  submissionId,
  assignmentId,
  config,
  existingFiles,
  onFilesChanged,
  disabled = false,
}: FileUploadZoneProps) {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const TERMINAL_STATUSES = new Set(["processed", "failed"]);
  const hasNonTerminal = existingFiles.some(
    (f) => !TERMINAL_STATUSES.has(f.processing_status),
  );

  useEffect(() => {
    if (!hasNonTerminal || !submissionId) return;

    const interval = setInterval(async () => {
      const fresh = await getSubmissionFiles(submissionId);
      if (fresh.length > 0) {
        onFilesChanged(fresh.filter((f) => f.processing_status !== "uploading"));
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasNonTerminal, submissionId, onFilesChanged]);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (
        config.allowed_file_types &&
        config.allowed_file_types.length > 0
      ) {
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!config.allowed_file_types.includes(ext)) {
          return `File type ${ext} is not allowed. Allowed: ${config.allowed_file_types.join(", ")}`;
        }
      }
      if (file.size > 10 * 1024 * 1024) {
        return "File size exceeds 10MB limit";
      }
      return null;
    },
    [config.allowed_file_types],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);

      if (
        !config.allow_multiple &&
        (existingFiles.length + files.length > 1)
      ) {
        showErrorToast("Only one file is allowed");
        return;
      }

      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          showErrorToast(validationError);
          continue;
        }

        const tempId = crypto.randomUUID();
        setUploading((prev) => [
          ...prev,
          { id: tempId, name: file.name, progress: 0 },
        ]);

        try {
          const uploaded = await uploadSubmissionFile(
            submissionId,
            assignmentId,
            file,
            (percent) => {
              setUploading((prev) =>
                prev.map((u) =>
                  u.id === tempId ? { ...u, progress: percent } : u,
                ),
              );
            },
          );

          setUploading((prev) => prev.filter((u) => u.id !== tempId));
          onFilesChanged([...existingFiles, uploaded]);
        } catch (err) {
          console.error("Upload error:", err);
          setUploading((prev) =>
            prev.map((u) =>
              u.id === tempId
                ? { ...u, error: err instanceof Error ? err.message : "Upload failed" }
                : u,
            ),
          );
        }
      }
    },
    [
      submissionId,
      assignmentId,
      config.allow_multiple,
      existingFiles,
      onFilesChanged,
      validateFile,
    ],
  );

  const handleDownload = async (
    file: SubmissionFile,
    type: "original" | "parsed" = "original",
  ) => {
    try {
      const url = await getFileDownloadUrl(file.id, type);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Download error:", err);
      showErrorToast(
        type === "parsed"
          ? "Parsed content not available"
          : "Failed to get download link",
      );
    }
  };

  const handleDelete = async (fileId: string) => {
    setDeleting((prev) => new Set(prev).add(fileId));
    try {
      await deleteSubmissionFile(fileId);
      onFilesChanged(existingFiles.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Delete error:", err);
      showErrorToast("Failed to delete file");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!disabled && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const isUploadDisabled =
    disabled ||
    uploading.length > 0 ||
    (!config.allow_multiple && existingFiles.length >= 1);

  return (
    <div className="space-y-4">
      {config.instructions && (
        <p className="text-sm text-muted-foreground">{config.instructions}</p>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploadDisabled && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragOver
            ? "border-primary bg-primary/5"
            : isUploadDisabled
              ? "border-muted bg-muted/20 cursor-not-allowed"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isUploadDisabled
            ? "Upload complete"
            : "Drop files here or click to browse"}
        </p>
        {config.allowed_file_types && config.allowed_file_types.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Accepted: {config.allowed_file_types.join(", ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">Max 10MB per file</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={config.allow_multiple}
          accept={
            config.allowed_file_types?.join(",") || undefined
          }
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={isUploadDisabled}
        />
      </div>

      {/* Uploading files (in progress) */}
      {uploading.map((u) => (
        <div
          key={u.id}
          className="flex items-center gap-3 px-3 py-2.5 border rounded-lg"
        >
          <FileText className="h-5 w-5 text-muted-foreground/60 shrink-0" />
          <p
            className="text-sm font-medium shrink-0"
            title={u.name}
          >
            {truncateFilename(u.name)}
          </p>
          <div className="flex-1 min-w-0">
            {u.error ? (
              <p className="text-xs text-destructive">{u.error}</p>
            ) : (
              <FileStatusStepper status="uploading" />
            )}
          </div>
          {u.error && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() =>
                setUploading((prev) => prev.filter((x) => x.id !== u.id))
              }
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}

      {/* Uploaded files */}
      {existingFiles.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-3 px-3 py-2.5 border rounded-lg"
        >
          <FileText className="h-5 w-5 text-muted-foreground/60 shrink-0" />
          <p
            className="text-sm font-medium shrink-0"
            title={file.filename}
          >
            {truncateFilename(file.filename)}
          </p>
          <div className="flex-1 min-w-0">
            <FileStatusStepper status={file.processing_status} />
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
              onClick={() => handleDownload(file)}
              title="Download original"
            >
              <Download className="h-4 w-4" />
            </Button>
            {process.env.NODE_ENV === "development" && file.processing_status === "processed" && file.parsed_content_url && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                onClick={() => handleDownload(file, "parsed")}
                title="View parsed content"
              >
                <FileCode className="h-4 w-4" />
              </Button>
            )}
            {!disabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(file.id)}
                disabled={deleting.has(file.id)}
              >
                {deleting.has(file.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
