"use client";

// Grounding a map in the learner's own syllabus (#30).
//
// Split from `useOnboarding` because it changes for different reasons: this is
// a file crossing the wire to `/api/extract` and the two bits of state that
// describe it, with no opinion about maps, concepts or placement. Onboarding
// only wants the extracted text, and only to hand it to the map prompt.

import { useCallback, useState } from "react";
import type { ToastChannel } from "@/components/atlas/useToast";

export interface OutlineUpload {
  /** Extracted source text the map prompt is grounded in, or null. */
  outline: string | null;
  /** What the picker says under itself — reading, grounded, or nothing. */
  uploadNote: string | null;
  onOutlineFile: (file: File) => void;
  clearOutline: () => void;
}

export function useOutlineUpload(toast: ToastChannel): OutlineUpload {
  const { showError, tc } = toast;
  const [outline, setOutline] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const onOutlineFile = (file: File) => {
    // Drop the previous outline up front: a re-upload must not ground the
    // map in the old source while the new one is still being read.
    setOutline(null);
    setUploadNote(tc().readingFile(file.name));
    const data = new FormData();
    data.append("file", file);
    fetch("/api/extract", { method: "POST", body: data })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          text?: string;
          error?: string;
        } | null;
        if (!res.ok || !json?.text) throw new Error(json?.error ?? tc().unreadableFile);
        setOutline(json.text);
        setUploadNote(tc().groundedIn(file.name));
      })
      .catch((err: Error) => {
        setOutline(null);
        setUploadNote(null);
        showError(err, { context: "upload" });
      });
  };

  // Stable: `reset` lists it as a dependency, and an identity that changed
  // every render would re-create the run's whole reset callback with it.
  const clearOutline = useCallback(() => {
    setOutline(null);
    setUploadNote(null);
  }, []);

  return { outline, uploadNote, onOutlineFile, clearOutline };
}
