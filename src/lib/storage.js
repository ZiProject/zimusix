/** Đọc/ghi cờ bật-tắt đơn giản trong localStorage (không ném lỗi khi bị chặn). */
export function readFlag(key, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch (_) {}
}
