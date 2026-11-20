import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { sellarAlCompilar } from "./scripts/novedades-publicar.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** El sello de lo nuevo de la versión: al compilar el instalador, la huella de la
    entrada de `src/novedades.json` que de verdad entró en el bundle, junto al
    instalador. `publicar-version` y `pnpm latest` la comparan con la de ahora
    (`scripts/novedades-publicar.mjs`). Se toma el texto que llega al bundle, y no
    el del disco al final, por si alguien lo toca a mitad de compilación. */
function selloDeNovedades(): Plugin {
  let texto: string | null = null;
  return {
    name: "adeorq-sello-novedades",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      if (/[\\/]src[\\/]novedades\.json$/.test(id.split("?")[0])) texto = code;
      return null;
    },
    closeBundle() {
      // @ts-expect-error process is a nodejs global
      sellarAlCompilar(texto, process.env, process.cwd());
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), selloDeNovedades()],

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
