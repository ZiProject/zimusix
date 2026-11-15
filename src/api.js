// Connect to ZiPlayer sidecar (Node.js) spawned by Tauri.
// When running pure web browser mode (npm run web), pass ?port=...&token=... in URL.

let info = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function fetchInfo() {
  const query = new URLSearchParams(location.search);
  if (query.get("port") && query.get("token"))
    return { port: Number(query.get("port")), token: query.get("token") };
  if (!isTauri())
    throw new Error(
      "Backend not found. Please run via Tauri (npm run dev) or open with ?port=...&token=...",
    );
  const { invoke } = await import("@tauri-apps/api/core");
  // Rust throws error (with log tail) if sidecar failed to start or already exited.
  return invoke("backend_info");
}

export async function initBackend(onWait) {
  for (let attempt = 0; attempt < 80; attempt++) {
    info = await fetchInfo(); // re-fetch each time to detect sidecar crash immediately
    try {
      return await call("GET", "/health");
    } catch {
      onWait?.(attempt);
      await sleep(500);
    }
  }
  throw new Error(
    "Backend not responding. Verify Node.js is installed and check app logs.",
  );
}

export const httpBase = () => `http://127.0.0.1:${info.port}`;
export const wsBase = () => `ws://127.0.0.1:${info.port}`;
export const token = () => info.token;

export async function call(method, path, body) {
  const response = await fetch(httpBase() + path, {
    method,
    headers: {
      authorization: `Bearer ${info.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json;
}

export const get = (path) => call("GET", path);
export const post = (path, body = {}) => call("POST", path, body);

/** Track player state via Server-Sent Events. Returns close function. */
export function watchState(
  target,
  onState,
  onPlaybackError,
  onVoiceUnlinked,
  onRpcStatus,
) {
  const source = new EventSource(
    `${httpBase()}/events?target=${encodeURIComponent(target)}&token=${encodeURIComponent(info.token)}`,
  );
  source.addEventListener("state", (event) => {
    try {
      onState(JSON.parse(event.data));
    } catch {}
  });
  source.addEventListener("playback-error", (event) => {
    try {
      onPlaybackError?.(JSON.parse(event.data));
    } catch {}
  });
  source.addEventListener("voice-unlinked", (event) => {
    try {
      onVoiceUnlinked?.(JSON.parse(event.data));
    } catch {}
  });
  source.addEventListener("rpc-status", (event) => {
    try {
      onRpcStatus?.(JSON.parse(event.data));
    } catch {}
  });
  return () => source.close();
}
