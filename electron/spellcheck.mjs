import { loadSpellingDictionary } from "./spellcheck-client.mjs";

export const spellingLanguages = ["nl", "en-US", "en-GB", "fr", "de"];

export function spellcheckLanguage(
  preference,
  locale,
  available = spellingLanguages,
) {
  if (preference !== "system") {
    if (!available.includes(preference))
      throw new Error("Unsupported spellcheck language.");
    return preference;
  }
  return (
    available.find((code) => code.toLowerCase() === locale.toLowerCase()) ||
    available.find((code) => code.split("-")[0] === locale.split("-")[0]) ||
    "en-US"
  );
}

export function createSpellcheck(
  locale,
  changed,
  load = loadSpellingDictionary,
) {
  let revision = 0;
  let enabled = false;
  let language = "";
  let status = "ready";
  let checker;
  let generation = 0;
  let controller;
  const cache = new Map();
  const info = () => ({
    enabled,
    language,
    status,
    revision,
    languages: spellingLanguages,
    systemLanguage: spellcheckLanguage("system", locale),
  });
  const notify = () => {
    revision++;
    changed(info());
  };
  return {
    info,
    validate(preference) {
      spellcheckLanguage(preference, locale);
    },
    dispose() {
      generation++;
      controller?.abort();
    },
    async configure(settings) {
      const next = spellcheckLanguage(settings.spellcheckLanguage, locale);
      if (language === next && enabled === settings.spellcheckEnabled) return;
      const run = ++generation;
      controller?.abort();
      controller = new AbortController();
      language = next;
      enabled = settings.spellcheckEnabled;
      checker = undefined;
      cache.clear();
      status = enabled ? "loading" : "ready";
      notify();
      if (!enabled) return;
      try {
        const loaded = await load(language, controller.signal);
        if (run !== generation) return;
        checker = loaded;
        status = "ready";
      } catch {
        if (run !== generation) return;
        status = "error";
      }
      notify();
    },
    async check(words, requestedRevision) {
      if (
        !Array.isArray(words) ||
        words.length > 500 ||
        words.some((word) => typeof word !== "string" || word.length > 128)
      )
        throw new Error("Invalid spelling request.");
      if (requestedRevision !== revision || status !== "ready")
        return { ready: false, misspelled: [] };
      if (!enabled) return { ready: true, misspelled: [] };
      const unknown = [...new Set(words.filter((word) => !cache.has(word)))];
      try {
        if (unknown.length) {
          const missing = new Set(await checker.check(unknown));
          if (requestedRevision !== revision)
            return { ready: false, misspelled: [] };
          unknown.forEach((word) => cache.set(word, missing.has(word)));
        }
      } catch {
        if (requestedRevision === revision) {
          status = "error";
          notify();
        }
        return { ready: false, misspelled: [] };
      }
      const misspelled = [];
      for (const word of words) {
        if (cache.get(word)) misspelled.push(word);
      }
      // Bound memory without changing the verdict for repeated words.
      if (cache.size > 20000) cache.clear();
      return { ready: true, misspelled };
    },
  };
}
