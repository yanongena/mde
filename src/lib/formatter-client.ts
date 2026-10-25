import type { FormatRequest, FormatResult } from "./formatting";

let worker: Worker | undefined,
  sequence = 0;
const pending = new Map<
  number,
  {
    resolve(result: FormatResult): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function reset(error: Error) {
  worker?.terminate();
  worker = undefined;
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(error);
  }
  pending.clear();
}
export function requestFormatting(
  request: FormatRequest,
): Promise<FormatResult> {
  if (!worker) {
    worker = new Worker(new URL("./formatter.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      clearTimeout(task.timer);
      if (event.data.error) task.reject(new Error(event.data.error));
      else task.resolve(event.data.result);
    });
    worker.addEventListener("error", () =>
      reset(new Error("The code formatter could not start.")),
    );
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reset(
          new Error("Formatting took too long. Your code was left unchanged."),
        ),
      15000,
    );
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, request });
  });
}
