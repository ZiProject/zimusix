/** Tạo DOM an toàn (không dùng innerHTML với dữ liệu từ bài hát). */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on"))
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style" && typeof value === "object")
      Object.assign(el.style, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat(Infinity))
    if (kid != null && kid !== false)
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const fmtTime = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
