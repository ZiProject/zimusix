# Preset Runtime & quy ước Preset

Preset quyết định **toàn bộ cách Zimusix hiển thị**:

| Preset quyết định | Section trong `preset.json` |
| --- | --- |
| Bố cục hiển thị + cách bố trí giao diện web (thanh bên, thanh phát, mật độ, độ rộng) | `layout` |
| **Mọi nút và thành phần điều khiển** (nút chung, nút Phát, điều hướng, thanh công cụ, nền panel, cỡ icon) | `controls` |
| Cách trình bày artwork (ảnh bìa) | `artwork` |
| Kiểu hiển thị thông tin bài hát | `info` |
| Hiệu ứng nền | `background` |
| Visualizer | `visualizer` |
| Cách hiển thị lyrics | `lyrics` |
| Màu sắc, font | `theme` |
| Thông số cho người dùng tự chỉnh | `settings` |

Preset là **dữ liệu khai báo**: nó chọn module có sẵn trong app và đặt tham số. Preset **không chứa JS/HTML**
nên một preset tải từ nơi khác không chạy được mã tuỳ ý. Muốn tạo hiệu ứng riêng thì thêm `style.css`.

## Cấu trúc thư mục

```
my-preset/                 ← tên thư mục = "id" trong preset.json
├─ preset.json             BẮT BUỘC  manifest
├─ preview.png             khuyến nghị  ảnh xem trước, 640×360 (16:9)
├─ style.css               tuỳ chọn  CSS bổ sung
├─ assets/                 tuỳ chọn  ảnh, font, video mà style.css dùng
│   ├─ noise.png
│   └─ ...
└─ README.md               tuỳ chọn  ghi chú, giấy phép
```

Quy ước:

- **Ảnh preview**: nằm ở **gốc thư mục preset**, mặc định tên `preview.png`. Đổi tên bằng `"preview": "ten-khac.webp"`
  (đuôi: png, jpg, jpeg, webp, svg, avif). Khuyên dùng **640×360 px**, tỉ lệ 16:9, dưới 300 KB. Thiếu ảnh thì app hiện khung màu thay thế.
- **`id`**: chữ thường, số, `-` hoặc `_`, 2–48 ký tự, bắt đầu bằng chữ/số. Nên trùng tên thư mục.
- **Đuôi file cho phép**: `json css png jpg jpeg webp gif avif svg woff woff2 ttf otf mp4 webm md txt`.
  Thư mục chứa đuôi khác (đặc biệt `.js`, `.html`) sẽ bị **từ chối** khi thêm.
- **Giới hạn**: ≤ 200 file, ≤ 30 MB, lồng ≤ 6 cấp, không symlink, `preset.json` ≤ 128 KB.
- **Đường dẫn** trong manifest/CSS luôn **tương đối** so với thư mục preset, dùng `/`, không có `..`.

Bản mẫu chép sẵn: [`docs/preset-template/`](./preset-template/).

## Người dùng thêm preset thế nào?

1. Mở tab **Giao diện** → **Thêm thư mục preset**.
2. Chọn *một thư mục preset* (có `preset.json`) **hoặc** một thư mục chứa nhiều thư mục preset con.
3. Sidecar kiểm tra rồi **sao chép** vào kho của app (`<thư mục dữ liệu app>/presets/<id>/`), nên xoá thư mục gốc cũng không sao.
4. Bấm **Dùng preset này**. Thông số nằm trong "Tuỳ chỉnh" ngay bên dưới (chỉ những thông số preset cho phép).

Preset built-in nằm ở `public/presets/<id>/` và dùng **cùng quy ước**; danh sách ở `public/presets/index.json`
(tự cập nhật bằng `npm run presets:index`). Preset người dùng được định danh nội bộ là `user:<id>` nên không bao giờ đè preset built-in.

## `preset.json`

```jsonc
{
  "schema": 1,                    // phiên bản định dạng (hiện là 1)
  "id": "my-preset",
  "name": "Tên hiển thị",
  "version": "1.0.0",
  "author": "…",
  "description": "≤ 300 ký tự",
  "tags": ["…"],                  // ≤ 8 thẻ
  "preview": "preview.png",
  "style": "style.css",           // tuỳ chọn

  "layout": {}, "controls": {}, "artwork": {}, "info": {}, "background": {},
  "visualizer": {}, "lyrics": {}, "theme": {},
  "settings": []
}
```

Section nào bỏ trống thì dùng mặc định (= giao diện gốc `classic`). Tham số sai kiểu/ngoài khoảng **không làm hỏng preset**:
app bỏ qua và dùng mặc định, đồng thời hiện cảnh báo trong thẻ preset.

## Tham số của từng module

Bảng dưới sinh tự động từ `src/presets/schema.js` (nguồn sự thật duy nhất).

### `layout`

Bố cục tổng thể của giao diện web (thanh bên, thanh phát, độ rộng nội dung).

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `shell` | `classic` · `stage` · `focus` · `split` | `classic` | classic: danh sách \| stage: sân khấu giữa \| focus: tập trung lyrics \| split: chia đôi sân khấu + nội dung |
| `sidebar` | `left` · `right` · `rail` · `hidden` | `left` | Vị trí thanh bên: trái, phải, thu gọn (chỉ icon) hoặc ẩn |
| `player` | `bottom` · `floating` · `top` · `minimal` | `bottom` | Thanh phát: dưới, nổi, trên hoặc tối giản |
| `density` | `comfortable` · `compact` | `comfortable` | Độ dày khoảng cách |
| `defaultView` | `keep` · `search` · `library` · `queue` · `related` · `lyrics` · `nowplaying` · `presets` · `discord` | `keep` | Tab mở khi chọn preset ("keep" = giữ tab hiện tại) |
| `contentWidth` | số 560–1400 | `880` | Độ rộng tối đa của nội dung (px) |
| `radius` | số 0–28 | `12` | Bo góc của panel (px) |

### `controls`

Giao diện của mọi nút, thanh công cụ, điều hướng và panel.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `buttons` | `soft` · `pill` · `square` · `ghost` · `outline` | `soft` | Kiểu nút chung: soft (mặc định) \| pill (bo tròn) \| square (vuông) \| ghost (không nền) \| outline (viền nhấn) |
| `playButton` | `circle` · `square` · `accent` | `circle` | Nút Phát/Tạm dừng: tròn \| vuông bo \| tô màu nhấn |
| `nav` | `soft` · `pill` · `bar` | `soft` | Mục điều hướng ở thanh bên: soft \| pill \| bar (vạch nhấn) |
| `toolbar` | `docked` · `floating` · `transparent` · `autohide` | `docked` | Thanh công cụ phía trên: docked \| floating (viên thuốc) \| transparent \| autohide (hiện khi rê chuột) |
| `panels` | `solid` · `glass` · `flat` | `solid` | Nền của thanh bên/thanh phát/popup: đặc \| kính mờ \| phẳng (trong suốt) |
| `iconSize` | số 14–26 | `18` | Cỡ icon của nút và điều hướng (px) |

### `artwork`

Cách trình bày ảnh bìa (thanh phát + khu Đang phát).

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `style` | `square` · `rounded` · `circle` · `vinyl` · `polaroid` · `none` | `rounded` | Kiểu khung ảnh |
| `size` | số 32–96 | `56` | Kích thước ảnh trên thanh phát (px) |
| `stageSize` | số 160–560 | `320` | Kích thước ảnh ở khu Đang phát (px) |
| `react` | `true` / `false` | `true` | Ảnh nhún theo bass |
| `reactAmount` | số 0–20 | `8` | Mức nhún (%) |
| `glow` | `true` / `false` | `true` | Quầng sáng theo bass |
| `spin` | `true` / `false` | `false` | Quay khi đang phát (hợp với circle/vinyl) |
| `spinSpeed` | số 4–60 | `18` | Số giây cho một vòng quay |
| `shadow` | `true` / `false` | `false` | Đổ bóng cố định dưới ảnh |

### `info`

Cách hiển thị thông tin bài hát.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `style` | `inline` · `stacked` · `centered` · `huge` | `inline` | inline: gọn \| stacked: tiêu đề lớn \| centered: căn giữa \| huge: chữ rất lớn |
| `show` | mảng ⊂ {`title`, `artist`, `source`, `duration`} | `["title","artist","source"]` |  |
| `marquee` | `true` / `false` | `true` | Tiêu đề dài tự chạy chữ |
| `titleScale` | số 0.7–2 | `1` | Hệ số phóng chữ tiêu đề |

### `background`

Hiệu ứng nền.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `effect` | `media` · `aurora` · `gradient` · `solid` · `particles` | `media` | media: ảnh bìa/video \| aurora \| gradient \| solid \| particles |
| `media` | `auto` · `on` · `off` | `auto` | Có phủ ảnh bìa/video lên không (auto: chỉ khi effect = media) |
| `colors` | mảng ≤ 4 màu hex | `[]` | Tối đa 4 màu hex; bỏ trống = dùng màu accent |
| `speed` | số 0.2–3 | `1` | Tốc độ hiệu ứng |
| `intensity` | số 0–1 | `0.6` | Độ đậm hiệu ứng |
| `angle` | số 0–360 | `135` | Góc gradient (độ) |
| `count` | số 10–200 | `70` | Số hạt (particles) |
| `react` | `true` / `false` | `true` | Hiệu ứng phản ứng theo nhạc |

### `visualizer`

Visualizer âm thanh.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `type` | `bars` · `mirror` · `wave` · `circle` · `dots` · `none` | `bars` | Kiểu vẽ |
| `placement` | mảng ⊂ {`player`, `stage`, `background`} | `["player"]` | Vẽ ở đâu (có thể nhiều nơi) |
| `bars` | số 8–96 | `32` | Số cột/điểm |
| `colorMode` | `gradient` · `accent` · `solid` | `gradient` | Cách tô màu |
| `color` | màu hex | `#a78bfa` | Màu khi colorMode = solid |
| `thickness` | số 1–10 | `2` | Độ dày nét / khoảng cách giữa cột (px) |
| `smoothing` | số 0–0.95 | `0` | Làm mượt giữa các khung hình |
| `opacity` | số 0.1–1 | `1` | Độ đậm |
| `height` | số 60–420 | `120` | Chiều cao vùng vẽ ở khu Đang phát (px) |

### `lyrics`

Cách hiển thị lời bài hát.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `mode` | `list` · `karaoke` · `focus` · `compact` | `list` | list: cả bài \| karaoke: dòng hiện tại to, mờ dần \| focus: chỉ vài dòng quanh dòng hiện tại \| compact: nhỏ gọn |
| `placement` | `view` · `stage` | `view` | view: tab Lời bài hát \| stage: nhúng trong khu Đang phát |
| `align` | `left` · `center` · `right` | `left` | Căn lề |
| `showTime` | `true` / `false` | `true` | Hiện mốc thời gian từng dòng |
| `size` | số 14–48 | `22` | Cỡ chữ dòng thường (px) |
| `activeScale` | số 1–1.8 | `1.27` | Dòng đang hát phóng to bao nhiêu lần |
| `glow` | `true` / `false` | `true` | Dòng hiện tại phát sáng theo nhạc |

### `theme`

Màu sắc & font. `colors` nhận mã hex.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `colorScheme` | `dark` · `light` | `dark` | Hệ màu của control gốc (thanh cuộn, input) |
| `fontFamily` | chuỗi font-family | — | Danh sách font CSS (an toàn, không ký tự đặc biệt) |
| `colors` | object | `{}` | Khoá: `accent`, `accent2`, `bg`, `panel`, `panel2`, `line`, `text`, `muted`, `ok`, `danger` → mã hex |

## `settings` — thông số cho người dùng chỉnh

Mỗi phần tử khai báo một ô điều khiển trong tab **Giao diện → Tuỳ chỉnh** và **trỏ tới** một tham số bằng `bind`.
Người dùng chỉ chỉnh được những gì bạn khai báo; giá trị được kẹp vào khoảng bạn cho phép và nhớ theo từng preset.

| Trường | Ý nghĩa |
| --- | --- |
| `key` | Tên duy nhất, camelCase (`^[a-z][A-Za-z0-9]{0,31}$`) |
| `label` / `description` | Nhãn và chú thích |
| `type` | `range` (số) · `toggle` (boolean) · `select` (enum) · `color` (hex) |
| `bind` | Đích: `"section.param"` (vd `"visualizer.bars"`), `"theme.colors.accent"`, hoặc `"css:--preset-ten"` |
| `min` `max` `step` `unit` | Cho `range`. Khoảng không được rộng hơn khoảng của tham số được bind |
| `options` | Cho `select`: `[{ "value": "...", "label": "..." }]`, `value` phải hợp lệ với tham số |
| `default` | Tuỳ chọn; thiếu thì lấy giá trị hiện tại của tham số được bind |

Ghép kiểu: `range`→tham số số, `toggle`→boolean, `select`→enum, `color`→tham số màu / `theme.colors.*` / `css:--preset-*`.
`css:--preset-*` đặt một CSS variable để `style.css` của bạn dùng (tiền tố `--preset-` bắt buộc, tránh ghi đè biến lõi).
Thứ tự ưu tiên: giá trị người dùng chọn > `default` của setting > giá trị trong section.

## `style.css`

Được nạp khi preset đang dùng và gỡ khi đổi preset. App **làm sạch** trước khi chèn:

- `@import` bị bỏ.
- `url(...)` chỉ nhận đường dẫn tương đối trong thư mục preset (vd `url(assets/noise.png)` — đường dẫn tính từ vị trí file css) hoặc `data:`. URL `http(s)://` bị chặn → preset chạy offline.
- `expression()`, `behavior`, `-moz-binding` bị bỏ.

Các móc hữu ích: thuộc tính `data-*` trên `<html>` (`data-shell`, `data-sidebar`, `data-player-pos`, `data-artwork`, `data-info`,
`data-btn`, `data-nav`, `data-toolbar`, `data-panels`, `data-bg-effect`, `data-viz`, `data-lyrics-mode`, `data-preset`), class `is-playing` trên `<html>`, biến `--accent`, `--accent-2`,
`--bg`, `--panel`, `--music-bass` / `--music-energy` (0–1, đổi theo nhạc), và các class như `.stage-cover`, `.stage-title`, `.lyric-line`.

## Kiểm tra preset

```sh
npm run presets:check                       # preset built-in + bản mẫu
node scripts/presets.mjs check ./my-preset  # preset của bạn (hoặc thư mục chứa nhiều preset)
```

Công cụ dùng đúng bộ kiểm tra của app và kiểm tra thêm file thật (preview, style.css, đuôi file, dung lượng).

## Kiến trúc runtime (cho người sửa app)

```
src/presets/
├─ schema.js       đăng ký module + tham số, normalizeManifest(), resolveConfig()   (thuần, dùng chung với scripts/)
├─ css.js          làm sạch style.css                                               (thuần)
├─ loader.js       nạp preset built-in (public/presets) và của người dùng (sidecar GET /presets)
├─ store.js        lưu preset đang chọn + giá trị tuỳ chỉnh (localStorage "zimusix-preset")
├─ runtime.js      applyPreset / setPresetSetting; đặt data-* và CSS variables lên <html>; phát sự kiện onPresetChange
├─ visualizers.js  bars · mirror · wave · circle · dots
└─ bg-fx.js        hiệu ứng nền particles (aurora/gradient/solid làm bằng CSS)
src/styles/preset-layout.css   shell / sidebar / player / density
src/styles/preset-modules.css  artwork / info / visualizer / lyrics / background
src/styles/preset-controls.css nút, điều hướng, thanh công cụ, panel, cỡ icon
sidecar/presets.js             cài, liệt kê, xoá, phục vụ file preset (kiểm tra an toàn đường dẫn, đuôi file, dung lượng)
```

Thêm một **giá trị mới cho module** (vd kiểu visualizer mới): thêm vào `MODULES` trong `schema.js`, viết phần vẽ/CSS tương ứng,
rồi `npm run presets:check`. Bảng tham số ở trên sẽ tự cập nhật khi chạy lại bộ sinh tài liệu.

API sidecar (đều cần token): `GET /presets` · `POST /presets/import {path}` · `POST /presets/remove {id}` · `GET /presets/file?id=&path=`.

## Hành vi của app (không do preset quyết định)

- **Ẩn nội dung (phím `H` / nút con mắt)**: đang ẩn mà bấm một tab ở thanh bên (Tìm kiếm, Hàng đợi, Lời bài hát…) hoặc nút Lời bài hát ở thanh phát thì nội dung tự hiện lại.
- Mục **Đang phát** luôn ở đầu thanh bên.
