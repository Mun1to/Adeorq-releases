// El tablero de partida de las fotos y del volcado: la casa montada para un
// idioma, la Cabina con las cuatro sesiones grabadas y sus sesiones marcadas
// como vivas. Lo comparten `fotos.mjs` y `volcar.mjs`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { BOVEDA, montarCasa } from "./casa.mjs";
import { apartarRaton, cerrarTerminales, dormir, panelGrabado, ponerFondo, recargarCon, sinWebgl } from "./escena.mjs";
import { PANELES } from "./textos.mjs";

export const panelesDe = (idioma) =>
  PANELES[idioma].map(([proyecto, grabacion, cli, titulo]) => panelGrabado({ nombre: `${proyecto} · ${titulo}`, proyecto, grabacion: `${grabacion}.bin`, cli }));

/** La Cabina de las fotos: cuatro agentes en dos columnas. */
export const cabina = (idioma) => ({
  panes: panelesDe(idioma),
  cols: [
    { w: 1, hs: [1, 1], idx: [0, 1] },
    { w: 1, hs: [1, 1], idx: [2, 3] },
  ],
  ocultos: [],
});

/** Una sesión sale como VIVA cuando su CLI deja un fichero con su pid en
 *  `~/.claude/sessions`. Aquí quien enseña cada sesión es su reproductor, así
 *  que ese es el pid que se apunta: mientras el panel siga abierto, está viva. */
export function marcarVivas(idioma) {
  const carpeta = "P:\\home\\.claude\\sessions";
  rmSync(carpeta, { recursive: true, force: true });
  mkdirSync(carpeta, { recursive: true });
  const procesos = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'repetir\\.mjs' } | ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  let n = 0;
  for (const [, grabacion, cli] of PANELES[idioma]) {
    if (cli !== "claude") continue;
    const meta = JSON.parse(readFileSync(`p/rec/${grabacion.replace(/-mid$/, "")}.meta.json`, "utf8"));
    const suyo = procesos.find((l) => l.includes(`\\rec\\${grabacion}.bin`));
    if (!suyo) continue;
    const pid = Number(suyo.split("|")[0]);
    writeFileSync(`${carpeta}\\${pid}.json`, JSON.stringify({ pid, sessionId: meta.sesion, cwd: meta.cwd, startedAt: Date.now() - 600_000, kind: "interactive", entrypoint: "cli" }));
    n++;
  }
  return n;
}

export async function montar(p, idioma, layout, lateral = "") {
  const es = idioma === "es";
  const perfil = JSON.parse((await p.js(`localStorage.getItem("adeorq-perfil")`)) ?? "{}");
  const claves = {
    "adeorq-perfil": { ...perfil, nombre: "Sam", raiz: "P:\\projects", sinRaiz: false, extras: [], leerSesiones: true, hecho: true, tour: true },
    "adeorq-lang": idioma,
    "adeorq-lateral": lateral,
    // Con cuatro terminales la app apaga sola el cristal para ahorrar; aquí se quiere ver.
    "adeorq-rendimiento": "nunca",
    "adeorq-layout": layout,
    // Sam tiene dos cuentas de Claude: la suya y la del trabajo.
    "adeorq-accounts": {
      accounts: [{ id: "c0ffee00-0000-4000-8000-000000000001", label: es ? "Trabajo" : "Work", dir: "P:\\data\\Adeorq\\accounts\\claude-work", provider: "claude" }],
      defaultAccount: "main:claude",
    },
    "adeorq-cuentas-abiertos": ["claude", "codex"],
    "adeorq-cuentas-seccion": null,
    "adeorq-objetivos-abierto": null,
    // La Memoria lee la bóveda de mentira de la casa, nunca una de verdad.
    "adeorq-boveda": BOVEDA,
  };
  await cerrarTerminales(p);
  // La app guarda su lienzo un segundo después de cada cambio (y cerrarle las
  // terminales es un cambio): se espera a que acabe y ENTONCES se escribe lo
  // de disco, o volvería el lienzo de la tanda anterior.
  await dormir(2500);
  montarCasa(idioma);
  await recargarCon(p, claves, 6500);
  console.log(await ponerFondo(p));
  await sinWebgl(p);
  console.log("vivas:", marcarVivas(idioma));
  // El botón de releer de la barra, para que las vea ya.
  await p.js(`(() => { const b = [...document.querySelectorAll('.sidebar button, aside button')].filter((x) => x.getBoundingClientRect().y < 175 && x.getBoundingClientRect().y > 130).pop(); b?.click(); return !!b; })()`);
  await dormir(3500);
  await apartarRaton(p);
}
