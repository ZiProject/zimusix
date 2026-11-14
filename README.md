# Zimusix

Trình phát nhạc desktop (Tauri v2) dựng trên **ZiPlayer**. Phát nhạc ngay trong app **hoặc** qua **bot Discord** vào kênh thoại. Nguồn nhạc: tìm kiếm qua plugin (YouTube, SoundCloud, Spotify) hoặc file nhạc trên máy.

## Kiến trúc

```
┌──────────────────────── Tauri (Rust) ────────────────────────┐
│  chọn port + token ngẫu nhiên → spawn `node sidecar/server.js` │
│  lệnh `backend_info` trả port/token cho frontend               │
└───────────────┬───────────────────────────────┬────────────────┘
                │ WebView (Vite, JS thuần)      │ stdin pipe: đóng app → sidecar tự thoát
                │                               ▼
  HTTP + SSE (Bearer token)        ┌──────── sidecar (Node.js) ────────┐
  /search /play /control …  ─────► │ ZiPlayer PlayerManager            │
                │                  │  • plugin: YouTube/SoundCloud/    │
  WS /listen (Opus, ZI v1) ◄────── │    Spotify/Attachments (file)     │
  @ziplayer/client giải mã         │  • WebAudioConnection → relay WS  │
  Opus → AudioWorklet              │  • discord.js → @discordjs/voice  │
                                   └───────────────────────────────────┘
```

- Mỗi đích phát là một `Player` của ZiPlayer: `local` (trong app) hoặc `guildId` (Discord).
- Cả hai output dùng chung một `AudioPlayer`, nên khi bot đang phát trong Discord bạn vẫn có thể bật **Nghe trong app** (nút tai nghe) mà không tốn thêm transcode.
- File local đi qua `AttachmentsPlugin`; sidecar đọc thêm tag/thời lượng/ảnh bìa bằng `music-metadata` (plugin trả `duration = 0` nên không seek được nếu thiếu bước này).

## Yêu cầu

- Node.js **>= 20.3** khi chạy dev (bản đóng gói đã kèm Node; có thể ép dùng bản khác bằng `ZIMUSIX_NODE=/đường/dẫn/node`)
- Rust + [điều kiện hệ thống của Tauri v2](https://v2.tauri.app/start/prerequisites/)
- Với Discord: một bot token, bot đã được mời vào server (quyền View Channels, Connect, Speak)

## Chạy thử

```sh
npm run setup      # cài deps frontend + sidecar
npm run dev        # mở app Tauri (dev)
```

Chỉ kiểm tra backend (không cần Rust): `npm test` (sinh file mp3, phát qua sidecar, nhận khung Opus qua WebSocket, kiểm tra queue/seek/volume).

Chạy frontend trong trình duyệt để debug: `npm run sidecar` (in `ZIMUSIX_READY {port, token}`), rồi `npm run web` và mở `http://localhost:1420/?port=<port>&token=<token>`. (Sidecar đứng riêng sẽ in token ra nếu bạn không đặt `ZIMUSIX_TOKEN`.)

## Dùng

| Việc | Cách làm |
| --- | --- |
| Tìm nhạc | Tab **Tìm kiếm**, chọn nguồn (Tất cả/YouTube/SoundCloud/Spotify) hoặc dán link / đường dẫn file. Nút ▶ phát ngay, ⏭ phát tiếp theo, ＋ thêm cuối hàng đợi |
| File local | Tab **File local**: chọn file, chọn thư mục (quét tối đa 3 cấp, 1000 file) hoặc **kéo thả** vào cửa sổ |
| Phát lên Discord | Tab **Discord**: dán token → Đăng nhập → bấm vào kênh thoại. Sidebar mục **Phát tới** sẽ chuyển sang server đó, mọi điều khiển áp dụng cho bot |
| Nghe cả trong app khi phát Discord | Nút tai nghe ở thanh dưới |
| Nối đầu ra | Nút dây ở thanh phát: chọn nguồn, kéo từ cổng nguồn tới **Ứng dụng này** và/hoặc các kênh Discord. Một nguồn nối được nhiều đầu ra cùng lúc (Ứng dụng + mỗi server một kênh), tất cả cùng phát một âm thanh; nguồn không bị dừng hay seek lại khi nối thêm. Cùng một bot không thể phát đồng thời hai kênh trong cùng server |
| Ngắt kết nối | Bấm/kéo lại vào cổng đang nối, hoặc nút **Rút dây khỏi #kênh / Ứng dụng**. Rút một kênh Voice thì bot rời kênh đó, nguồn và các đầu ra còn lại vẫn phát; rút khỏi Ứng dụng thì chỉ ngừng nghe trên máy. Bot bị kick/mất voice thì dây tự rút kèm thông báo |
| Điều khiển | Phát/tạm dừng (phím Space), bài trước/sau, seek, âm lượng, lặp (tắt → hàng đợi → một bài), tự phát bài liên quan, trộn, sắp xếp/xoá trong hàng đợi |
| Ẩn nội dung để xem nền | Nút con mắt ở thanh trên cùng hoặc phím **H**: ẩn nội dung tab (tìm kiếm, file, hàng đợi…) để lộ ảnh/video nền; thanh công cụ vẫn còn để bật lại. Lựa chọn được nhớ cho lần mở sau |
| Toàn màn hình | Nút toàn màn hình hoặc phím **F11** (cần quyền `core:window:allow-set-fullscreen` trong `src-tauri/capabilities/default.json`) |

## Cấu trúc frontend (`src/`)

```
src/
├─ main.js            khởi động app (boot), màn hình lỗi/FFmpeg
├─ events.js          phím tắt & listener toàn cục (Space, H, F11, click ngoài panel)
├─ state.js           `app` (state chung), `root`, `refs`
├─ api.js             gọi sidecar (HTTP/SSE)
├─ lib/               tiện ích: dom.js (h, fmtTime…), icons.js, constants.js, toast.js, storage.js
├─ features/          logic, không dựng DOM chính
│   ├─ audio.js       nghe trong app (WebAudioClient)
│   ├─ playback.js    setState / watch / setTarget / control / playTrack
│   ├─ background.js  nền video + ảnh bìa
│   ├─ lyrics.js  voice.js  related.js  files.js  search.js  discord.js
│   ├─ layout.js      đổi view, ẩn thanh bên, ẩn nội dung
│   └─ window.js      toàn màn hình
├─ ui/                dựng giao diện
│   ├─ main-view.js   khung chính + thanh công cụ trên
│   ├─ sidebar.js  player.js  wiring.js  visualizer.js  bg-panel.js  shared.js
│   ├─ mascot.js      trạng thái mascot (ảnh trong public/mascot/): loading, trống, lỗi, không có kết quả…
│   └─ views/         search, library, queue, related, lyrics, discord
└─ styles/            index.css import base, layout, search, library, player,
                      toast, background, wiring, lyrics, related, effects
```

## Bảo mật

- Sidecar chỉ bind `127.0.0.1`; mọi HTTP/SSE/WS đều cần token ngẫu nhiên được tạo mỗi lần mở app, và CORS chỉ cho origin của Tauri/localhost.
- Token bot Discord lưu dạng văn bản thường trong `settings.json` ở thư mục dữ liệu app (quyền 0600 trên Unix). Dùng nút **Đăng xuất bot** để xoá.
- CSP trong `tauri.conf.json` cho phép `'wasm-unsafe-eval'` và `blob:` vì `opus-decoder` (WASM) và AudioWorklet cần chúng.

## FFmpeg

File local, seek và filter cần FFmpeg. Sidecar tìm theo thứ tự: `FFMPEG_PATH` → `ffmpeg-static` → `ffmpeg` trong PATH.

Lỗi `FFmpeg/avconv not found!` thường do **npm mới chặn script cài đặt** của `ffmpeg-static` (binary không được tải). `sidecar/package.json` đã khai báo `allowScripts` cho gói này; nếu bạn vẫn gặp lỗi:

```sh
npm install --prefix sidecar          # tải lại
node sidecar/node_modules/ffmpeg-static/install.js   # tải thủ công binary
```

hoặc cài FFmpeg hệ thống / đặt `FFMPEG_PATH`. Khi khởi động, nếu thiếu binary sidecar sẽ tự thử tải một lần; nếu vẫn thiếu, `/health` báo `ffmpeg.ok = false`, app hiện cảnh báo và mọi lỗi phát được đẩy lên UI (không chỉ nằm trong console).

## Debug & log

- Sidecar bật `debugLevel: "time"` của `PlayerManager` và in mọi sự kiện `debug` (đổi bằng `ZIMUSIX_DEBUG_LEVEL=off|error|warn|info|debug|verbose|time`).
- Bản release ghi stdout/stderr của sidecar vào `sidecar.log` trong thư mục dữ liệu app (Windows: `%APPDATA%\app.zimusix.desktop`, macOS: `~/Library/Application Support/app.zimusix.desktop`, Linux: `~/.local/share/app.zimusix.desktop`). Nếu sidecar thoát sớm, màn hình lỗi của app hiển thị 15 dòng cuối của log đó.

## Đóng gói (`npm run build`)

`npm run build` chạy `scripts/bundle.mjs` trước: copy `sidecar/`, cài `node_modules` chỉ production (kèm binary FFmpeg) và **copy chính bản Node.js đang chạy** vào `src-tauri/resources/`. Người dùng cuối không cần cài Node. Kết quả khá nặng (~300 MB trước khi nén: Node ~120 MB, FFmpeg ~80 MB, module ~100 MB).

- Cần mạng khi build (npm + GitHub cho FFmpeg); script dừng với lỗi rõ ràng nếu thiếu binary FFmpeg.
- Phải build trên từng hệ điều hành/kiến trúc đích (Node, FFmpeg và các module native là theo nền tảng).
- Rust tìm Node theo thứ tự: `ZIMUSIX_NODE` → bản đóng gói kèm → PATH → vị trí phổ biến (Homebrew, nvm, Volta, Program Files…).

## Giới hạn đã biết

- Nguồn trực tuyến (YouTube/SoundCloud/Spotify) phụ thuộc thư viện bên thứ ba (`youtubei.js`, `@zibot/scdl`, `spotify-url-info`) và có thể hỏng khi các nền tảng đổi API. Lỗi từng nguồn được báo trên toast; kết quả từ các nguồn còn lại vẫn hiển thị.
- Phát nhạc lên Discord cần thư viện voice mã hoá của Discord; nếu kết nối thoại thất bại hãy kiểm tra quyền kênh và phiên bản `@discordjs/voice`/`@snazzah/davey` mà `ziplayer` kéo về.
- Nếu nối voice báo `AbortError`/hết thời gian, bot chưa hoàn tất voice handshake nên chưa thể phát Discord. Kiểm tra quyền **Connect/Speak**, cho phép Node/Zimusix qua firewall và bảo đảm mạng/VPN không chặn UDP; giao diện chỉ đánh dấu dây đã nối khi kết nối Discord đã sẵn sàng.
- Sidecar giữ một cache nhỏ các `Track` kết quả tìm kiếm để phát lại đúng object (giữ metadata và tag file local đã đọc) thay vì tìm lại qua mạng.
- Bản dev của `ziplayer`/`@ziplayer/plugin` (tag `dev`) được dùng vì `WebAudioConnection` chưa có ở bản `latest`.
