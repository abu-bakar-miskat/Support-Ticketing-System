"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadSprintTemplate } from "@/lib/api/sprints";
import { useImportSprints } from "@/hooks/queries/use-sprints";
import { cn } from "@/lib/utils";

type SprintCSVImportProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: string | null;
};

export function SprintCSVImport({
  open,
  onOpenChange,
  onSuccess,
  projectId,
}: SprintCSVImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const importMutation = useImportSprints({
    onSuccess: (result) => {
      if (result.created > 0) onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = importMutation.isPending;
  const result = importMutation.data ?? null;
  const showResult = importMutation.isSuccess;

  function reset() {
    setSelectedFile(null);
    importMutation.reset();
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (isLoading) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function acceptFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    setSelectedFile(file);
    importMutation.reset();
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) acceptFile(file);
  }

  function handleImport() {
    if (!selectedFile) return;
    if (!projectId) {
      toast.error("Select a project filter before importing sprints");
      return;
    }
    importMutation.mutate({ file: selectedFile, projectId });
  }

  const hasErrors = (result?.errors.length ?? 0) > 0;
  const hasCreated = (result?.created ?? 0) > 0;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(520px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
            <Dialog.Title className="font-sans text-[14px] font-semibold text-pen-foreground">
              Import sprints from CSV
            </Dialog.Title>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
              className="rounded-md p-1 text-pen-muted hover:bg-pen-surface hover:text-pen-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            {/* Template download */}
            <div className="flex items-center justify-between rounded-xl border border-pen-card-border bg-pen-surface px-4 py-3">
              <div>
                <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                  Download template
                </p>
                <p className="font-sans text-[11.5px] text-pen-muted">
                  Required columns: name, startDate, endDate
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadSprintTemplate()}
                className="gap-1.5 font-sans text-[11.5px]"
              >
                <Download className="size-3.5" />
                Template
              </Button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors",
                dragOver
                  ? "border-pen-blue bg-pen-blue-tint"
                  : selectedFile
                    ? "border-pen-green bg-[#e7f7ec] dark:bg-[#26352b]"
                    : "border-pen-card-border hover:border-pen-blue/50 hover:bg-pen-surface",
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
              <Upload
                className={cn(
                  "size-5",
                  selectedFile ? "text-pen-green" : "text-pen-muted",
                )}
              />
              {selectedFile ? (
                <>
                  <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                    {selectedFile.name}
                  </p>
                  <p className="font-sans text-[11.5px] text-pen-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                  </p>
                </>
              ) : (
                <>
                  <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                    Drop your CSV file here
                  </p>
                  <p className="font-sans text-[11.5px] text-pen-muted">
                    or click to browse
                  </p>
                </>
              )}
            </div>

            {/* Result summary */}
            {showResult && result && (
              <div className="flex flex-col gap-2">
                {hasCreated && (
                  <div className="flex items-center gap-2 rounded-lg border border-pen-green/30 bg-[#e7f7ec] px-3 py-2.5 dark:bg-[#26352b]">
                    <CheckCircle2 className="size-4 shrink-0 text-pen-green" />
                    <p className="font-sans text-[12.5px] text-pen-foreground">
                      <span className="font-semibold">{result.created}</span>{" "}
                      sprint{result.created !== 1 ? "s" : ""} created successfully
                      {result.skipped > 0 && (
                        <span className="text-pen-muted">
                          {" "}· {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {!hasCreated && !hasErrors && (
                  <div className="rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2.5">
                    <p className="font-sans text-[12.5px] text-pen-muted">
                      No new sprints were created. All rows were duplicates or had errors.
                    </p>
                  </div>
                )}
                {hasErrors && (
                  <div className="max-h-[180px] overflow-y-auto rounded-lg border border-pen-red/30 bg-pen-red/5 px-3 py-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0 text-pen-red" />
                      <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                        {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} had errors
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {result.errors.map((e, i) => (
                        <li
                          key={i}
                          className="font-mono text-[11.5px] text-pen-red"
                        >
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-pen-card-border px-5 py-4">
            {showResult ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="font-sans text-[12px]"
                >
                  Import another
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  className="bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => handleOpenChange(false)}
                  className="font-sans text-[12px]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedFile || isLoading}
                  onClick={handleImport}
                  className="gap-1.5 bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90 disabled:opacity-50"
                >
                  {isLoading && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  Import
                </Button>
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
