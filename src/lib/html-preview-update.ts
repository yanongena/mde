function compatible(before: Node, after: Node) {
  return (
    before.nodeType === after.nodeType &&
    before.nodeName === after.nodeName &&
    (before as Element).namespaceURI === (after as Element).namespaceURI
  );
}

function patch(current: Node, before: Node, after: Node) {
  if (before.isEqualNode(after)) return;
  if (after.nodeType !== 1) {
    current.nodeValue = after.nodeValue;
    return;
  }
  const element = current as Element;
  const oldElement = before as Element;
  const newElement = after as Element;
  for (const attr of oldElement.attributes) {
    if (!newElement.hasAttributeNS(attr.namespaceURI, attr.localName))
      element.removeAttributeNS(attr.namespaceURI, attr.localName);
  }
  for (const attr of newElement.attributes) {
    if (
      oldElement.getAttributeNS(attr.namespaceURI, attr.localName) !==
      attr.value
    )
      element.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
  }
  const children = Array.from(current.childNodes);
  const remaining = Array.from(before.childNodes, (source, index) => ({
    source,
    node: children[index],
  }));
  let cursor = current.firstChild;
  for (const source of after.childNodes) {
    // Prefer unchanged nodes and stable IDs so insertions don't reload images
    // or recreate form controls further down the page.
    let index = remaining.findIndex((entry) =>
      entry.source.isEqualNode(source),
    );
    if (index < 0 && source.nodeType === 1 && (source as Element).id)
      index = remaining.findIndex(
        (entry) =>
          compatible(entry.source, source) &&
          (entry.source as Element).id === (source as Element).id,
      );
    if (index < 0 && remaining[0] && compatible(remaining[0].source, source))
      index = 0;
    const entry = index < 0 ? undefined : remaining.splice(index, 1)[0];
    const node = entry?.node ?? current.ownerDocument!.importNode(source, true);
    if (node !== cursor) current.insertBefore(node, cursor);
    if (entry) patch(node, entry.source, source);
    cursor = node.nextSibling;
  }
  for (const { node } of remaining) node?.parentNode?.removeChild(node);
}

/** Apply already sandboxed preview markup without navigating the iframe. */
export function updatePreviewDocument(
  document: Document,
  before: string,
  after: string,
) {
  const parser = new DOMParser();
  patch(
    document.documentElement,
    parser.parseFromString(before, "text/html").documentElement,
    parser.parseFromString(after, "text/html").documentElement,
  );
}

/** Keep the old stylesheet painted until its refreshed replacement is ready. */
export function refreshPreviewAssets(document: Document) {
  const pending: HTMLLinkElement[] = [];
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel~="stylesheet"][href]',
  )) {
    if (!link.href.startsWith("margin-asset://workspace/")) continue;
    const replacement = link.cloneNode(true) as HTMLLinkElement;
    pending.push(replacement);
    replacement.onload = () => {
      replacement.onload = replacement.onerror = null;
      if (link.isConnected) link.replaceWith(replacement);
      else replacement.remove();
    };
    replacement.onerror = () => {
      replacement.onload = replacement.onerror = null;
      replacement.remove();
    };
    link.after(replacement);
  }
  for (const image of document.querySelectorAll<HTMLImageElement>("img[src]")) {
    if (image.src.startsWith("margin-asset://workspace/"))
      image.src = image.src;
  }
  return () => {
    let cancelled = false;
    for (const link of pending) {
      // A completed replacement is the current stylesheet, not pending work.
      if (!link.onload) continue;
      link.onload = link.onerror = null;
      link.remove();
      cancelled = true;
    }
    return cancelled;
  };
}
