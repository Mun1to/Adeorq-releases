import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Los nombres de las funciones sobreviven al minificado. Cuestan unos pocos
  // KB y a cambio, cuando la interfaz se cae, el rastro dice «at EditorWeb» en
  // vez de «at bg»: sin esto, la pila de componentes en producción son letras
  // sueltas y solo quedan las etiquetas HTML, que no señalan a ningún fichero
  // (2026-08-29, persiguiendo un error #31 a ciegas).
  esbuild: { keepNames: true },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
