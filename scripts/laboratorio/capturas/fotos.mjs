// Saca las fotos de un idioma. Monta la casa (sesiones, agenda, decisiones,
// lienzo), abre el tablero de la Cabina con las sesiones grabadas y va vista por
// vista. Uso: node fotos.mjs <en|es> [vista...]   (sin vistas: todas)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { montarCasa } from "./casa.mjs";
import { abrir, apartarRaton, cerrarTerminales, clicExacto, dormir, panelGrabado, ponerFondo, recargarCon, sinWebgl, vista } from "./escena.mjs";
import { PANELES, TEXTOS } from "./textos.mjs";

const [idioma, ...pedidas] = process.argv.slice(2);
const quiere = (v) => !pedidas.length || pedidas.includes(v);
const SALIDA = `salida/${idioma}`;
const t = TEXTOS[idioma];
const es = idioma === "es";

const p = await abrir();
const paneles = PANELES[idioma].map(([proyecto, grabacion, cli, titulo]) => panelGrabado({ nombre: `${proyecto} · ${titulo}`, proyecto, grabacion: `${grabacion}.bin`, cli }));

/** Una sesión sale como VIVA cuando su CLI deja un fichero con su pid en
 *  `~/.claude/sessions`. Aquí quien enseña cada sesión es su reproductor, así
 *  que ese es el pid que se apunta: mientras el panel siga abierto, está viva. */
function marcarVivas() {
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

async function montar(layout, lateral = "") {
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
  console.log("vivas:", marcarVivas());
  // El botón de releer de la barra, para que las vea ya.
  await p.js(`(() => { const b = [...document.querySelectorAll('.sidebar button, aside button')].filter((x) => x.getBoundingClientRect().y < 175 && x.getBoundingClientRect().y > 130).pop(); b?.click(); return !!b; })()`);
  await dormir(3500);
  await apartarRaton(p);
}

const foto = async (nombre) => {
  await apartarRaton(p);
  await dormir(500);
  console.log(await p.foto(`${SALIDA}/${nombre}.png`));
};

const algunaDeCabina = ["cockpit", "dashboard", "agenda", "decisions", "commands", "accounts", "settings", "canvas"].some(quiere);
if (algunaDeCabina) {
  // ── La Cabina: cuatro agentes, cada uno en lo suyo ─────────────────────────
  await montar({
    panes: paneles,
    cols: [
      { w: 1, hs: [1, 1], idx: [0, 1] },
      { w: 1, hs: [1, 1], idx: [2, 3] },
    ],
    ocultos: [],
  });
  if (quiere("cockpit")) {
    // La barra no se toca: un clic en un proyecto le abre una sesión nueva.
    await foto("cockpit");
  }
  if (quiere("dashboard")) {
    await vista(p, "panel", 2500);
    await foto("dashboard");
  }
  if (quiere("agenda")) {
    await vista(p, "agenda", 3000);
    // Con un proyecto elegido, la portada cuenta sus metas. El clic lo quita si
    // ya estaba puesto, así que se mira antes.
    const elegido = () => p.js(`(document.querySelectorAll('button.ag-cifra')[2]?.textContent ?? '').includes('storefront-api')`);
    if (!(await elegido())) await p.clic("aside.ag-rail button.project-logo", "SA").catch((e) => console.log(String(e)));
    await dormir(1200);
    console.log("  proyecto elegido:", await elegido());
    // El panel de objetivos del día, que flota sobre cualquier vista.
    const objetivos = () => p.js(`!!document.querySelector('.objetivos')`);
    if (!(await objetivos())) await p.clic(".objetivos-toggle");
    await dormir(1500);
    await foto("agenda");
    if (await objetivos()) await p.clic(".objetivos-toggle");
    await dormir(600);
  }
  if (quiere("decisions")) {
    await vista(p, "decisiones", 2500);
    await p.clic("button.dec-fila").catch(() => {});
    await dormir(1000);
    await clicExacto(p, t.decisiones[0].preguntas[0].opciones[0].texto);
    await dormir(900);
    await foto("decisions");
  }
  if (quiere("commands")) {
    await vista(p, "comandos", 2500);
    await foto("commands");
  }
  if (quiere("accounts")) {
    await vista(p, "cuentas", 5000);
    await foto("accounts");
  }
  if (quiere("settings")) {
    await vista(p, "ajustes", 2000);
    await clicExacto(p, es ? "Tema" : "Theme", "nav.set-nav");
    await dormir(2200);
    await foto("settings");
  }
  if (quiere("canvas")) {
    await vista(p, "lienzo", 7000);
    await sinWebgl(p);
    await dormir(3000);
    await foto("canvas");
  }
}

if (quiere("files")) {
  // ── Archivos: el árbol del proyecto, un archivo abierto y sus terminales ──
  const raiz = "P:\\projects\\storefront-api";
  await montar(
    {
      panes: [
        { name: "storefront-api · tests", cwd: raiz },
        { name: "storefront-api · git", cwd: raiz },
        { name: "cart.js", cwd: raiz, archivos: [`${raiz}\\src\\cart.js`, `${raiz}\\test\\cart.test.js`, `${raiz}\\docs\\discounts.md`], activo: `${raiz}\\src\\cart.js` },
      ],
      cols: [
        { w: 1, hs: [1, 1], idx: [0, 1] },
        { w: 1, hs: [1], idx: [2] },
      ],
      ocultos: [],
    },
    "archivos",
  );
  // Las dos consolas de este tablero (las del lienzo llevan su comando propio).
  const consolas = (await p.inv("pty_vivas")).filter((v) => !v.command && v.cwd === raiz).sort((a, b) => a.id - b.id);
  const ordenes = ["cls; node --test\r", "cls; git --no-pager diff\r"];
  for (const [i, v] of consolas.slice(0, 2).entries()) await p.inv("pty_write", { id: v.id, data: ordenes[i] });
  await dormir(5000);
  // Con una terminal enfocada, el árbol enseña SU proyecto.
  await p.clic(".view-cabina .xterm-screen").catch((e) => console.log(String(e)));
  await dormir(1500);
  for (const carpeta of ["src", "test", "docs"]) {
    await p.clic('button.arch-fila[data-carpeta="true"]', carpeta).catch((e) => console.log(String(e)));
    await dormir(500);
  }
  await dormir(1200);
  await foto("files");
}
p.cerrar();
