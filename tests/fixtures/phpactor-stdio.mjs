// Protocol fixture: real child process, deliberately split UTF-8 stdio frames.
let buffer = Buffer.alloc(0);
const documents = new Map();
const send = (value) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...value }));
  const frame = Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
    body,
  ]);
  process.stdout.write(frame.subarray(0, 19));
  process.stdout.write(frame.subarray(19));
};
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) return;
    const length = +/Content-Length:\s*(\d+)/i.exec(
      buffer.subarray(0, end).toString(),
    )[1];
    if (buffer.length < end + 4 + length) return;
    const value = JSON.parse(
      buffer.subarray(end + 4, end + 4 + length).toString(),
    );
    buffer = buffer.subarray(end + 4 + length);
    const { method, params, id } = value;
    if (method === "initialize")
      send({
        id,
        result: {
          capabilities: {
            completionProvider: {},
            signatureHelpProvider: {},
            textDocumentSync: 1,
          },
        },
      });
    if (method === "textDocument/didOpen")
      documents.set(params.textDocument.uri, params.textDocument.text);
    if (method === "textDocument/didChange")
      documents.set(params.textDocument.uri, params.contentChanges[0].text);
    if (method === "textDocument/didClose")
      documents.delete(params.textDocument.uri);
    if (method === "textDocument/completion")
      send({
        id,
        result: {
          items: [
            {
              label: "méthode",
              kind: 2,
              detail: JSON.stringify({
                documents: [...documents],
                position: params.position,
              }),
              textEdit: {
                range: { start: params.position, end: params.position },
                newText: "méthode()",
              },
            },
          ],
        },
      });
    if (method === "textDocument/signatureHelp")
      send({
        id,
        result: {
          signatures: [
            {
              label: "méthode(string $naam, int $leeftijd = 12)",
              parameters: [{ label: [8, 20] }, { label: [22, 40] }],
            },
          ],
          activeParameter: 1,
        },
      });
  }
});
