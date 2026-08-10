// Lo que decide la sesión suprema cuando pide abrir una terminal.
//
// Nada de esto se puede probar abriendo la app: hay que tener un agente dentro
// pidiéndolo. Aquí se prueba lo único que puede salir mal de verdad, que es
// interpretar lo que escribe un modelo.
//
//   npx tsc scripts/supremo-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/supremo-check.js

import {
  ARRANCAN_CON_ENCARGO,
  carpetaDe,
  cliPedido,
  nombreDe,
  parteDeApertura,
  type PedidoMcp,
} from "../src/lib/supremo";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const PROYECTOS = [
  { name: "Adeorq", path: "C:\\proyectos\\Adeorq" },
  { name: "VoCript", path: "C:\\proyectos\\VoCript" },
];
const pedido = (p: Partial<PedidoMcp>): PedidoMcp => ({ peticion: 1, clase: "open_pane", ...p });

// --- qué CLI ---------------------------------------------------------------
ok("sin decir nada, claude", "cli" in cliPedido(undefined) && (cliPedido(undefined) as any).cli === "claude");
ok("vacio tambien es claude", (cliPedido("  ") as any).cli === "claude");
ok("mayusculas y espacios se limpian", (cliPedido("  Codex ") as any).cli === "codex");
ok(
  "el sufijo del paquete no es el CLI",
  (cliPedido("claude-code") as any).cli === "claude" && (cliPedido("codex_cli") as any).cli === "codex",
  "un modelo escribe el nombre del paquete con la misma intencion",
);
ok("uno que no existe se rechaza CON la lista", (() => {
  const r = cliPedido("chatgpt") as any;
  return !!r.error && r.error.includes("gemini");
})());
ok("shell vale: no todo puesto necesita modelo", (cliPedido("shell") as any).cli === "shell");
ok(
  "solo claude y agy admiten encargo al arrancar",
  ARRANCAN_CON_ENCARGO.has("claude") &&
    ARRANCAN_CON_ENCARGO.has("agy") &&
    !ARRANCAN_CON_ENCARGO.has("codex") &&
    !ARRANCAN_CON_ENCARGO.has("gemini"),
);

// --- dónde -----------------------------------------------------------------
ok(
  "una ruta entera se respeta tal cual",
  (carpetaDe(pedido({ cwd: "D:\\otra\\cosa" }), PROYECTOS) as any).cwd === "D:\\otra\\cosa",
);
ok(
  "un nombre de proyecto se traduce a su ruta",
  (carpetaDe(pedido({ project: "VoCript" }), PROYECTOS) as any).cwd === "C:\\proyectos\\VoCript",
);
ok(
  "sin distinguir mayusculas, que cada uno lo escribe a su manera",
  (carpetaDe(pedido({ project: "adeorq" }), PROYECTOS) as any).cwd === "C:\\proyectos\\Adeorq",
);
ok(
  "el NOMBRE puesto en cwd por error se busca igual",
  (carpetaDe(pedido({ cwd: "VoCript" }), PROYECTOS) as any).cwd === "C:\\proyectos\\VoCript",
  "abrir en una carpeta inventada es abrir en cualquier sitio",
);
ok(
  "un proyecto que no existe se dice, no se inventa",
  !!(carpetaDe(pedido({ project: "Fantasma" }), PROYECTOS) as any).error,
);
ok("sin nada, se pide", !!(carpetaDe(pedido({}), PROYECTOS) as any).error);
ok(
  "una ruta relativa con barra cuenta como ruta",
  (carpetaDe(pedido({ cwd: "./web" }), PROYECTOS) as any).cwd === "./web",
);

// --- cómo se llama ---------------------------------------------------------
ok(
  "sin nombre propio, proyecto y CLI",
  nombreDe(pedido({}), "C:\\proyectos\\Adeorq", "codex") === "Adeorq · codex",
);
ok(
  "con nombre propio, proyecto y nombre",
  nombreDe(pedido({ name: "tests" }), "C:\\proyectos\\Adeorq", "codex") === "Adeorq · tests",
);
ok(
  "un nombre kilometrico se corta: compite con la cabecera",
  nombreDe(pedido({ name: "x".repeat(80) }), "C:\\proyectos\\Adeorq", "claude").length <= 49,
);

// --- lo que se le cuenta al agente -----------------------------------------
const conCodex = parteDeApertura({
  paneId: 7,
  cli: "codex",
  donde: "lienzo",
  conEncargo: false,
});
ok(
  "si el CLI no arranca con encargo, se le DICE que lo mande el",
  conCodex.includes("send_command(7") && conCodex.includes("no admite"),
  "si no, se queda esperando un trabajo que nadie encargo",
);
const enCabina = parteDeApertura({
  paneId: 3,
  cli: "claude",
  donde: "cabina",
  conEncargo: true,
});
ok(
  "en la cabina se avisa de que alli no hay flechas",
  enCabina.includes("cabina") && enCabina.includes("flechas"),
);
ok(
  "en el lienzo y con encargo, el parte no mete ruido",
  !parteDeApertura({ paneId: 3, cli: "claude", donde: "lienzo", conEncargo: true }).includes(
    "no admite",
  ),
);
ok(
  "una flecha que no se pudo dibujar se confiesa",
  parteDeApertura({
    paneId: 3,
    cli: "claude",
    donde: "cabina",
    conEncargo: true,
    flecha: "sin-lienzo",
  }).includes("NO se ha dibujado"),
);
ok(
  "el parte nunca lleva saltos de linea",
  !parteDeApertura({ paneId: 9, cli: "gemini", donde: "cabina", conEncargo: false }).includes("\n"),
  "va dentro de una respuesta de herramienta",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
