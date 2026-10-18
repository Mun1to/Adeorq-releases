// Saca las fotos de un idioma. Monta la casa (sesiones, agenda, decisiones,
// lienzo), abre el tablero de la Cabina con las sesiones grabadas y va vista por
// vista. Uso: node fotos.mjs <en|es> [vista...]   (sin vistas: todas)
import { abrir, apartarRaton, clicExacto, dormir, sinWebgl, vista } from "./escena.mjs";
import { cabina, montar as montarTablero } from "./tablero.mjs";
import { TEXTOS } from "./textos.mjs";

const [idioma, ...pedidas] = process.argv.slice(2);
const quiere = (v) => !pedidas.length || pedidas.includes(v);
const SALIDA = `salida/${idioma}`;
const t = TEXTOS[idioma];
const es = idioma === "es";

const p = await abrir();
const montar = (layout, lateral = "") => montarTablero(p, idioma, layout, lateral);

const foto = async (nombre) => {
  await apartarRaton(p);
  await dormir(500);
  console.log(await p.foto(`${SALIDA}/${nombre}.png`));
};

const algunaDeCabina = ["cockpit", "dashboard", "profile", "agenda", "decisions", "commands", "accounts", "settings", "canvas"].some(quiere);
if (algunaDeCabina) {
  // ── La Cabina: cuatro agentes, cada uno en lo suyo ─────────────────────────
  await montar(cabina(idioma));
  if (quiere("cockpit")) {
    // La barra no se toca: un clic en un proyecto le abre una sesión nueva.
    await foto("cockpit");
  }
  if (quiere("dashboard")) {
    await vista(p, "panel", 2500);
    // El saludo sale de la hora a la que se hace la foto: de madrugada dice «Aún
    // en pie, Sam.», que en una portada se lee raro. El de la tarde, como en la
    // demostración (`hacer-demo.mjs`).
    await p.js(`(() => { const h = document.querySelector('.inicio h1'); if (h) h.textContent = h.textContent.replace(/^(Aún en pie|Buenos días|Buenas noches),/, 'Buenas tardes,').replace(/^(Still up|Good morning|Good evening),/, 'Good afternoon,'); })()`);
    await foto("dashboard");
  }
  if (quiere("profile")) {
    // Tu nombre, las cuatro secciones con su resumen y tu uso (el de ejemplo de Sam).
    await vista(p, "perfil", 4000);
    await foto("profile");
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
    // Dónde quedan en esa foto el tablero de tareas y el enjambre, en píxeles
    // de la página: la portada enseña cada uno solo, recortado de `canvas.png`
    // (que va a doble escala, así que el recorte multiplica por dos).
    for (const [nombre, clase] of [["tablero", "kanban"], ["enjambre", "enjambre"]]) {
      const caja = await p.js(`(() => { const r = document.querySelector(".react-flow__node-${clase}")?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round).join(" ") : ""; })()`);
      if (caja) console.log(`  ${nombre}: ${caja}`);
    }
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
