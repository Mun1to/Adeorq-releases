// La lista de skills de la barra derecha, en la app de verdad: Rust leyendo una
// casa de pruebas con skills sembradas y el WebView2 pintándolas con la hoja
// entera. Es la forma que eligió Munir el 2026-10-30 («A3 B2»).
//
// Lo que mira:
//   · los grupos y su orden: las que más usas (de más a menos, con «N veces»),
//     las demás tuyas y, al final, las de claude.ai y los plugins encendidos
//     (el apagado no sale);
//   · que una descripción escrita como bloque `>-` se lee entera y no «>-»;
//   · que de cada una sale su primera frase, sin el «Úsalo cuando…»;
//   · que ninguna fila se aplasta aunque no quepan todas (fallo del 2026-10-30:
//     28 px de 41), y que nada se sale por la derecha;
//   · la letra: de la app y no de código, y nada por debajo de 12 px;
//   · suelta en reposo y de cristal con el ratón encima (forzado, sin ratón);
//   · sin cárceles ni mayúsculas espaciadas (los detectores de la casa).
//
// Con `--suyas`, en vez de las sembradas copia a la casa de pruebas las skills,
// los plugins y el historial de TU `~/.claude` (solo se leen, y la casa se
// borra al acabar), para ver la lista con lo de verdad. Ahí solo saca la foto.
//
//   1. `pnpm dev` (o el :1420 de otra sesión de este mismo árbol) y
//      `cargo build --manifest-path src-tauri/Cargo.toml`, copiado fuera de C:\ct
//   2. node scripts/laboratorio/skills-de-verdad.mjs <adeorq.exe> [--fotos <carpeta>] [--suyas]
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, carceles, conRatonEncima, dormir, hasta, mayusculas } from "./aislada.mjs";

const args = process.argv.slice(2);
const exe = args.find((a) => a.endsWith(".exe"));
const fotos = args.includes("--fotos") ? args[args.indexOf("--fotos") + 1] : tmpdir();
const suyas = args.includes("--suyas");
if (!exe) {
  console.error("Uso: node scripts/laboratorio/skills-de-verdad.mjs <adeorq.exe> [--fotos <carpeta>] [--suyas]");
  process.exit(1);
}

const escribir = (ruta, texto) => {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, texto);
};

/** La casa de pruebas: `datos` es `<base>\datos\Adeorq`, y la casa, `<base>\casa`. */
function sembrar(datos) {
  const claude = join(datos, "..", "..", "casa", ".claude");
  if (suyas) {
    const real = join(homedir(), ".claude");
    cpSync(join(real, "skills"), join(claude, "skills"), { recursive: true });
    for (const f of ["settings.json", "history.jsonl", join("plugins", "installed_plugins.json")]) {
      if (existsSync(join(real, f))) cpSync(join(real, f), join(claude, f));
    }
    return;
  }
  const skill = (dir, fm) => escribir(join(dir, "SKILL.md"), `---\n${fm}\n---\n# Cuerpo\n`);
  skill(join(claude, "skills", "fin"), "name: fin\ndescription: Cierre de sesión. Úsalo SIEMPRE que escriba /fin.");
  skill(join(claude, "skills", "diretto"), "name: diretto\ndescription: >-\n  Formato de respuesta directo: veredicto en una frase\n  y lista numerada.");
  skill(join(claude, "skills", "ateneo"), "name: ateneo\ndescription: Convierte una carpeta en un espacio de aprendizaje: lecciones y fichas.\ndisable-model-invocation: true");
  // Las suficientes para que la lista no quepa entera y se vea si aplasta.
  for (let i = 1; i <= 22; i++) skill(join(claude, "skills", `relleno-${String(i).padStart(2, "0")}`), `name: relleno-${String(i).padStart(2, "0")}\ndescription: Una skill de relleno con dos frases. La segunda no sale.`);
  skill(join(claude, "skills", "synced", "cuenta", "pdf"), "name: pdf\ndescription: Use this skill whenever the user wants to do anything with PDF files.");
  const encendido = join(claude, "plugins", "cache", "finito");
  const apagado = join(claude, "plugins", "cache", "apagado");
  skill(encendido, "name: finito\ndescription: Cierra una sesión de trabajo.");
  skill(join(apagado, "skills", "nada"), "name: nada\ndescription: No tiene que salir.");
  escribir(join(claude, "plugins", "installed_plugins.json"), JSON.stringify({
    plugins: { "finito@vibeset": [{ installPath: encendido }], "apagado@x": [{ installPath: apagado }] },
  }));
  escribir(join(claude, "settings.json"), JSON.stringify({ enabledPlugins: { "finito@vibeset": true, "apagado@x": false } }));
  const linea = (d) => JSON.stringify({ display: d, project: "C:\\demo" });
  escribir(join(claude, "history.jsonl"), ["/fin", "/fin sin commits", "/fin", "/diretto", "arregla esto", "/finito"].map(linea).join("\n") + "\n");
}

const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "ok  " : "FALLA"} ${que}`);
  if (!ok) fallos.push(que);
};

const aislada = await abrirAislada({ nombre: "skills", puertoMcp: 3097, depurar: 9397, fotos, exe, sembrar });
const { v } = aislada;
try {
  await v.js(`document.querySelector('[data-tab="cabina"]')?.click(); "ok"`);
  await dormir(800);
  // De fábrica la cara abierta es Skills, y entonces su botón dice «Ocultar panel».
  const abierta = await v.js(`(() => {
    if (document.querySelector(".lateral .skills-list")) return "ya";
    const b = [...document.querySelectorAll("nav.franja .franja-btn")].find((x) => x.getAttribute("data-tip") === "Skills");
    b?.click();
    return b ? "pulsada" : "";
  })()`);
  debe(!!abierta, `el panel de Skills abierto (${abierta || "sin botón en la franja"})`);
  await hasta(() => v.js(`document.querySelectorAll(".lateral .skill").length > 0`), 10_000);
  await dormir(600);

  const lista = await v.js(`(() => {
    const px = (e, p) => parseFloat(getComputedStyle(e)[p]);
    const grupos = [...document.querySelectorAll(".lateral .skills-grupo")].map((g) => ({
      titulo: g.querySelector(".skills-grupo-titulo").firstChild.textContent.trim(),
      cuantas: g.querySelector(".skills-grupo-titulo > span").textContent.trim(),
      filas: [...g.querySelectorAll(".skill")].map((s) => ({
        orden: s.querySelector(".skill-orden").textContent,
        veces: s.querySelector(".skill-veces")?.textContent ?? "",
        frase: s.querySelector(".skill-desc")?.textContent ?? "",
      })),
    }));
    const filas = [...document.querySelectorAll(".lateral .skill")];
    const caja = document.querySelector(".lateral-cuerpo");
    const letras = [...document.querySelectorAll(".lateral-cuerpo *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    return {
      grupos,
      aplastadas: filas.filter((s) => s.getBoundingClientRect().height + 0.5 < s.scrollHeight).length,
      altoFila: Math.round(filas[0].getBoundingClientRect().height),
      noCabe: document.querySelector(".skills-list").scrollHeight > document.querySelector(".skills-list").clientHeight,
      seSale: caja.scrollWidth > caja.clientWidth + 1,
      minimaLetra: Math.min(...letras.map((e) => px(e, "fontSize"))),
      letraNombre: getComputedStyle(document.querySelector(".lateral .skill-name")).fontFamily,
    };
  })()`);

  const titulos = lista.grupos.map((g) => `${g.titulo} ${g.cuantas}`);
  console.log(`grupos: ${titulos.join(" · ")}; al final: ${lista.grupos.at(-1)?.filas.map((f) => f.orden).join(", ")}`);
  if (!suyas) {
    debe(JSON.stringify(titulos) === JSON.stringify(["Las que más usas 2", "Las demás 23", "De claude.ai y plugins 2"]), `los grupos y su orden (${JSON.stringify(titulos)})`);
    const usadas = lista.grupos[0]?.filas.map((f) => `${f.orden}|${f.veces}`);
    debe(JSON.stringify(usadas) === JSON.stringify(["fin|3 veces", "diretto|1 vez"]), `las usadas, de más a menos y con sus veces (${JSON.stringify(usadas)})`);
    const fuera = lista.grupos[2]?.filas.map((f) => f.orden);
    debe(JSON.stringify(fuera) === JSON.stringify(["finito:finito", "anthropic-skills:pdf"]), `las de fuera, con su orden de verdad y sin la del plugin apagado (${JSON.stringify(fuera)})`);
    const diretto = lista.grupos[0]?.filas[1]?.frase;
    debe(diretto === "Formato de respuesta directo", `el bloque «>-» se lee y sale su primera frase (${JSON.stringify(diretto)})`);
    const fin = lista.grupos[0]?.filas[0]?.frase;
    debe(fin === "Cierre de sesión", `sin el «Úsalo…» del modelo (${JSON.stringify(fin)})`);
    debe(lista.noCabe && lista.aplastadas === 0, `ninguna fila aplastada aunque no quepan (${lista.aplastadas} aplastadas, alto ${lista.altoFila}, no cabe: ${lista.noCabe})`);
  }
  debe(!lista.seSale, "nada se sale por la derecha");
  debe(lista.minimaLetra >= 12, `nada por debajo de 12 px (${lista.minimaLetra})`);
  debe(!/mono|consolas/i.test(lista.letraNombre), `el nombre en la letra de la app (${lista.letraNombre})`);

  const raton = await conRatonEncima(v, ".lateral .skill");
  debe(!!raton && /none/.test(raton.antes.sombra) && raton.encima.sombra !== "none" && raton.encima.mueve !== "none", `suelta en reposo, de cristal con el ratón encima (${JSON.stringify(raton)})`);
  const c = await carceles(v, ".lateral");
  debe(!c.fallos.length, `sin cárceles (${JSON.stringify(c.fallos)})`);
  const m = await mayusculas(v, ".lateral");
  debe(!m.fallos.length, `sin mayúsculas espaciadas (${JSON.stringify(m.fallos)})`);

  const rect = await v.js(`(() => { const r = document.querySelector(".lateral-zona").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  console.log(`foto: ${await aislada.foto(rect, suyas ? "skills-suyas.png" : "skills-sembradas.png")}`);
} finally {
  await aislada.cerrar();
}
console.log(fallos.length ? `\n${fallos.length} FALLOS` : "\nTODO BIEN");
process.exit(fallos.length ? 1 : 0);
