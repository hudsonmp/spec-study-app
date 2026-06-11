// Decides whether the LLM help-seeking assistant panel is shown for a given
// module. Pure + dependency-free so it can run on the client (panel render
// gate) and the server (route-handler authorization) from one source of truth.
//
// Per the IRB amendment, the assistant is available on:
//   • the REAL scenario task module(s)  → module.type === 'task'
//   • the Vending Machine warmup task   → title contains "vending"
// and is HIDDEN on the Parking Meter worked example (title contains "parking").
//
// Verified against the live study's authored_data (studies row, visibility
// 'shown') on 2026-06-10:
//   idx2 task_example  "Parking Meter — worked example"  → HIDDEN
//   idx3 task_warmup   " Warmup - Vending Machine"       → SHOWN
//   idx4 task          "Rideshare Matching Platform"     → SHOWN (type 'task')

export function isAssistantEnabled(args: {
  moduleType: string;
  moduleTitle?: string | null;
}): boolean {
  const title = (args.moduleTitle ?? '').toLowerCase();

  // Explicit exclusion: the parking-meter example is never assisted, even if
  // some future edit changes its type.
  if (title.includes('parking')) return false;

  // Real scenario task(s): the canonical assisted surface.
  if (args.moduleType === 'task') return true;

  // The vending-machine warmup: assisted practice before the real task.
  if (title.includes('vending')) return true;

  return false;
}
