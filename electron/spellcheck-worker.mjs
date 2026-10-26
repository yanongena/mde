import { parentPort, workerData } from "node:worker_threads";
import nspell from "nspell";

const dictionaries = {
  nl: () => import("dictionary-nl"),
  "en-US": () => import("dictionary-en"),
  "en-GB": () => import("dictionary-en-gb"),
  fr: () => import("dictionary-fr"),
  de: () => import("dictionary-de"),
};
const checker = nspell((await dictionaries[workerData.language]()).default);
parentPort.on("message", ({ id, words }) => {
  parentPort.postMessage({
    id,
    misspelled: words.filter((word) => !checker.correct(word)),
  });
});
parentPort.postMessage({ ready: true });
