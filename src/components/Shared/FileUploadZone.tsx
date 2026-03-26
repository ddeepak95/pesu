"use client";

import { useCallback, useRef, useState } from "react";
import { FileSubmissionConfig } from "@/types/assignment";
import { SubmissionFile } from "@/types/submission";
import {
  uploadSubmissionFile,
  deleteSubmissionFile,
} from "@/lib/queries/submissionFiles";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, CheckCircle, Loader2, AlertCircle } from "lucide-react";
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

const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading...",
  uploaded: "Uploaded",
  processing: "Processing...",
  processed: "Ready",
  failed: "Processing failed",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleDelete = async (fileId: string) => {
    try {
      await deleteSubmissionFile(fileId);
      onFilesChanged(existingFiles.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Delete error:", err);
      showErrorToast("Failed to delete file");
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

  const statusIcon = (status: string) => {
    switch (status) {
      case "uploaded":
      case "processed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
    }
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
          className="flex items-center gap-3 p-3 border rounded-lg"
        >
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{u.name}</p>
            {u.error ? (
              <p className="text-xs text-destructive">{u.error}</p>
            ) : (
              <div className="mt-1">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {u.progress}%
                </p>
              </div>
            )}
          </div>
          {u.error && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
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
          className="flex items-center gap-3 p-3 border rounded-lg"
        >
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.filename}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {statusIcon(file.processing_status)}
              <span className="text-xs text-muted-foreground">
                {STATUS_LABELS[file.processing_status] || file.processing_status}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.file_size)}
              </span>
            </div>
          </div>
          {!disabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(file.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
