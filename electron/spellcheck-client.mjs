import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

export function loadSpellingDictionary(language, signal) {
  // Node workers run outside Electron's ASAR filesystem hooks. Keep their code
  // and dictionary dependencies unpacked in packaged builds.
  const workerPath = fileURLToPath(
    new URL("./spellcheck-worker.mjs", import.meta.url),
  ).replace(/\.asar([\\/])/, ".asar.unpacked$1");
  const worker = new Worker(workerPath, { workerData: { language } });
  let nextId = 0;
  let failed;
  const pending = new Map();
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      failed = error;
      reject(error);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };
    const stop = () => {
      signal.removeEventListener("abort", stop);
      fail(new Error("Spelling dictionary was closed."));
      void worker.terminate();
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) {
      stop();
      return;
    }
    worker.on("error", fail);
    worker.on("exit", () => {
      signal.removeEventListener("abort", stop);
      fail(new Error("Spelling dictionary stopped."));
    });
    worker.on("message", (message) => {
      if (message.ready) {
        resolve({
          check(words) {
            if (failed) return Promise.reject(failed);
            return new Promise((resolveCheck, rejectCheck) => {
              const id = ++nextId;
              pending.set(id, { resolve: resolveCheck, reject: rejectCheck });
              worker.postMessage({ id, words });
            });
          },
        });
      } else {
        pending.get(message.id)?.resolve(message.misspelled);
        pending.delete(message.id);
      }
    });
  });
}
