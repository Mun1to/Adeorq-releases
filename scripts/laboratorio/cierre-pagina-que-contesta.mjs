// La página que sirve `al-cerrar-de-verdad.ps1` en el devUrl (localhost:1420):
// hace de ventana de Adeorq SOLO para el cierre. Oye `cierre:pedido` y contesta
// a Rust según el modo, sin interfaz, sin paneles y sin tocar el localStorage
// (que este Adeorq de desarrollo comparte con el instalado).
//
//   node cierre-pagina-que-contesta.mjs <mudo|cancelar|salir|fondo|fondo-y-vuelve>
import { createServer } from "node:http";

const modo = process.argv[2] ?? "mudo";
const html = `<!doctype html><meta charset=utf-8><title>prueba de cierre (${modo})</title>
<body style="background:#15171c;color:#ebe7df;font:20px system-ui;padding:40px">
Adeorq de prueba: al cerrar, «${modo}». Se cierra solo.
<script>
  const I = window.__TAURI_INTERNALS__;
  const modo = ${JSON.stringify(modo)};
  I.invoke("plugin:event|listen", {
    event: "cierre:pedido",
    target: { kind: "Any" },
    handler: I.transformCallback(async () => {
      if (modo === "mudo") return;
      await I.invoke("cierre_acuse");
      if (modo === "salir") await I.invoke("cierre_salir");
      if (modo.startsWith("fondo")) {
        await I.invoke("cierre_a_fondo", { abrir: "Abrir", salir: "Salir", pista: "Adeorq de prueba" });
        if (modo === "fondo-y-vuelve") setTimeout(() => I.invoke("cierre_volver"), 4000);
      }
    }),
  });
</script>`;
createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(1420, () => console.log(`contesta «${modo}» en :1420`));
