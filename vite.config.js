import { defineConfig } from "vite";

// Cấu hình theo khuyến nghị của Tauri v2.
export default defineConfig({
	clearScreen: false,
	server: { port: 1420, strictPort: true, host: "127.0.0.1" },
	envPrefix: ["VITE_", "TAURI_ENV_*"],
	build: {
		target: "es2022",
		minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
});
