// The few binary assets that aren't generated in code (Matthew's Zero model
// and market song). Normally fetched next to the page; a single-file build
// can embed them as base64 in `window.__ASSETS` instead, keyed by path.

declare global {
  interface Window {
    __ASSETS?: Record<string, string>;
  }
}

export function loadAsset(path: string): Promise<ArrayBuffer> {
  const inline = window.__ASSETS?.[path];
  if (inline) return Promise.resolve(Uint8Array.from(atob(inline), (c) => c.charCodeAt(0)).buffer);
  return fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
    return r.arrayBuffer();
  });
}
