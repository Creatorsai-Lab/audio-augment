import { executeJob, transferables, type Job } from "./jobs";

// Typed by hand: the project compiles against the DOM lib, not the WebWorker lib.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

// One job per worker: the client spawns a worker, sends a single job once it
// sees "ready", and terminates the worker to cancel.
scope.onmessage = (event) => {
  try {
    let last = -1;
    const result = executeJob(event.data, (fraction) => {
      // Throttle to whole percents so progress doesn't flood the main thread.
      const pct = Math.floor(fraction * 100);
      if (pct === last) return;
      last = pct;
      scope.postMessage({ type: "progress", fraction });
    });
    scope.postMessage({ type: "done", result }, transferables(result));
  } catch (err) {
    scope.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

scope.postMessage({ type: "ready" });
