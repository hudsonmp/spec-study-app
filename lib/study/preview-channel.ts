import type { ProjectContent } from '@/lib/types/study';

// Same-origin, cross-tab live bridge between the form editor (FormativeEditor)
// and the participant preview (PreviewParticipantFlow). The editor pushes its
// in-memory reducer state on every change; the preview applies it immediately —
// no DB round-trip and no manual reload, so the preview never lags the editor.
//
// BroadcastChannel is structured-clone based (ProjectContent is plain JSON) and
// only reaches tabs in the SAME browser, which is exactly the editor↔preview
// workflow (the "Preview" link opens a sibling tab).
const CHANNEL = 'spec-study:preview';

export type PreviewMessage = {
  type: 'content';
  projectId: string;
  content: ProjectContent;
};

// Returns null during SSR / where BroadcastChannel is unavailable so callers
// can no-op safely.
export function openPreviewChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  return new BroadcastChannel(CHANNEL);
}
