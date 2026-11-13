import type { Job, JobResult } from "./jobs";

export type JobOptions = {
  /** Aborting terminates the worker mid-job and rejects with an AbortError. */
  signal?: AbortSignal | undefined;
  onProgress?: ((fraction: number) => void) | undefined;
};

type WorkerMessage =
  | { type: "ready" }
  | { type: "progress"; fraction: number }
  | { type: "done"; result: unknown }
  | { type: "error"; message: string };

const aborted = () => new DOMException("Cancelled", "AbortError");

export const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/**
 * Run one audio job off the main thread. Each job gets its own short-lived
 * worker, so cancelling is just terminating it. The job's input buffers are
 * transferred (detached) once the worker has started.
 */
export function runJob<J extends Job>(job: J, opts: JobOptions = {}): Promise<JobResult<J>> {
  const { signal, onProgress } = opts;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());

    let worker: Worker;
    try {
      worker = new Worker(new URL("./audio.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return void runInline(job, opts).then(resolve, reject);
    }

    let started = false;
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(aborted());
    };
    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        started = true;
        worker.postMessage(
          job,
          job.channels.map((c) => c.buffer),
        );
      } else if (msg.type === "progress") {
        onProgress?.(msg.fraction);
      } else if (msg.type === "done") {
        finish();
        resolve(msg.result as JobResult<J>);
      } else {
        finish();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      // Failing before "ready" means the worker script itself could not load
      // (e.g. blocked by the environment); the job data is still intact here,
      // so fall back to running it on this thread.
      if (!started) void runInline(job, opts).then(resolve, reject);
      else reject(new Error(event.message || "Audio worker crashed"));
    };
  });
}

async function runInline<J extends Job>(job: J, opts: JobOptions): Promise<JobResult<J>> {
  const { executeJob } = await import("./jobs");
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint a status first
  if (opts.signal?.aborted) throw aborted();
  return executeJob(job, opts.onProgress ?? (() => {}));
}
