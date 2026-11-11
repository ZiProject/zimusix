// Kết nối tới sidecar ZiPlayer (Node.js) do Tauri khởi chạy.
// Khi chạy thuần trình duyệt (npm run web) có thể truyền ?port=...&token=... trên URL.

let info = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function fetchInfo() {
	const query = new URLSearchParams(location.search);
	if (query.get("port") && query.get("token")) return { port: Number(query.get("port")), token: query.get("token") };
	if (!isTauri()) throw new Error("Không tìm thấy backend. Hãy chạy qua Tauri (npm run dev) hoặc mở với ?port=…&token=…");
	const { invoke } = await import("@tauri-apps/api/core");
	// Rust ném lỗi (kèm đoạn cuối log) nếu sidecar không chạy được hoặc đã thoát.
	return invoke("backend_info");
}

export async function initBackend(onWait) {
	for (let attempt = 0; attempt < 80; attempt++) {
		info = await fetchInfo(); // gọi lại mỗi lần để phát hiện sidecar đã crash và báo ngay thay vì chờ hết giờ
		try {
			return await call("GET", "/health");
		} catch {
			onWait?.(attempt);
			await sleep(500);
		}
	}
	throw new Error("Backend không phản hồi. Kiểm tra Node.js đã được cài và xem log của app.");
}

export const httpBase = () => `http://127.0.0.1:${info.port}`;
export const wsBase = () => `ws://127.0.0.1:${info.port}`;
export const token = () => info.token;

export async function call(method, path, body) {
	const response = await fetch(httpBase() + path, {
		method,
		headers: { authorization: `Bearer ${info.token}`, ...(body ? { "content-type": "application/json" } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(json.error || `Lỗi ${response.status}`);
	return json;
}

export const get = (path) => call("GET", path);
export const post = (path, body = {}) => call("POST", path, body);

/** Theo dõi trạng thái player qua Server-Sent Events. Trả về hàm đóng kết nối. */
export function watchState(target, onState, onPlaybackError, onVoiceUnlinked) {
	const source = new EventSource(`${httpBase()}/events?target=${encodeURIComponent(target)}&token=${encodeURIComponent(info.token)}`);
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
	return () => source.close();
}
