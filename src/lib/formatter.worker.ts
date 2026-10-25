import { formatCode, type FormatRequest } from "./formatting";

self.addEventListener(
  "message",
  async (event: MessageEvent<{ id: number; request: FormatRequest }>) => {
    const { id, request } = event.data;
    try {
      self.postMessage({ id, result: await formatCode(request) });
    } catch (error) {
      self.postMessage({ id, error: (error as Error).message });
    }
  },
);
