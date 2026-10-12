// Lo que la casa de pruebas tiene EN DISCO para un idioma: las sesiones (con su
// «hace N minutos», que sale de la fecha del fichero), y lo que cada vista lee
// de la carpeta de datos y de los proyectos.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXTOS } from "./textos.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CASA = "P:\\home";
const DATOS = "P:\\data\\Adeorq";
const PROYECTOS = "P:\\projects";
export const BOVEDA = "P:\\notes";

function escribir(ruta, texto) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
}

const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function montarCasa(idioma) {
  const t = TEXTOS[idioma];
  const ahora = Date.now();

  // ── Sesiones ──────────────────────────────────────────────────────────────
  const origen = join(AQUI, "sesiones", idioma);
  rmSync(join(CASA, ".claude", "projects"), { recursive: true, force: true });
  rmSync(join(CASA, ".codex", "sessions"), { recursive: true, force: true });
  cpSync(join(origen, "claude"), join(CASA, ".claude", "projects"), { recursive: true });
  if (existsSync(join(origen, "codex"))) cpSync(join(origen, "codex"), join(CASA, ".codex"), { recursive: true });
  for (const { rel, hace } of JSON.parse(readFileSync(join(origen, "plan.json"), "utf8"))) {
    const destino = rel.startsWith("claude") ? join(CASA, ".claude", "projects", rel.slice("claude".length + 1)) : join(CASA, ".codex", rel.slice("codex".length + 1));
    const cuando = new Date(ahora - hace * 60_000);
    utimesSync(destino, cuando, cuando);
  }

  // ── Skills (lo que enseña Comandos y el carril derecho) ───────────────────
  rmSync(join(CASA, ".claude", "skills"), { recursive: true, force: true });
  for (const [nombre, descripcion] of t.skills) {
    escribir(join(CASA, ".claude", "skills", nombre, "SKILL.md"), `---\nname: ${nombre}\ndescription: ${descripcion}\n---\n\n# ${nombre}\n\n${descripcion}\n`);
  }

  // ── Agenda ────────────────────────────────────────────────────────────────
  escribir(join(DATOS, "bandeja.md"), t.bandeja.map((l) => `- ${l}`).join("\n") + "\n");
  rmSync(join(DATOS, "objetivos"), { recursive: true, force: true });
  for (const [hace, lineas] of t.objetivos) {
    const d = new Date(ahora - hace * 86_400_000);
    escribir(join(DATOS, "objetivos", `${dia(d)}.md`), `# ${dia(d)}\n\n${lineas.map(([hecho, texto]) => `- [${hecho ? "x" : " "}] ${texto}`).join("\n")}\n`);
  }
  for (const [proyecto, metas] of Object.entries(t.metas)) escribir(join(PROYECTOS, proyecto, "docs", "METAS.md"), metas);
  escribir(
    join(DATOS, "programados.json"),
    JSON.stringify({
      version: 1,
      encargos: t.programados.map(([nombre, encargo, proyecto, cuando, resultado], i) => ({
        id: `p${i + 1}`,
        nombre,
        encargo,
        cwd: `${PROYECTOS}\\${proyecto}`,
        cuando,
        // Apagados: en la foto se ven con su historial, pero no lanzan nada.
        activo: false,
        creado: ahora - 12 * 86_400_000,
        ultima: ahora - (i + 1) * 5 * 3_600_000,
        ultimoDia: dia(new Date(ahora)),
        ultimas: [{ cuando: ahora - (i + 1) * 5 * 3_600_000, resultado, detalle: t.detalle[resultado] }],
        fallosSeguidos: 0,
      })),
    }),
  );

  // ── Decisiones: una viva (la fecha por delante la mantiene) y dos de antes ─
  rmSync(join(DATOS, "decisiones"), { recursive: true, force: true });
  t.decisiones.forEach((d, i) => {
    const id = `d1a12c0ffee${i}`;
    const viva = i === 0;
    escribir(
      join(DATOS, "decisiones", `${id}.json`),
      JSON.stringify({
        id,
        titulo: d.titulo,
        contexto: d.contexto,
        proyecto: d.proyecto,
        creada: viva ? ahora + 3_600_000 : ahora - (i * 26 + 3) * 3_600_000,
        preguntas: d.preguntas,
        ...(viva ? {} : { respuesta: { cuando: ahora - (i * 26 + 2) * 3_600_000, desde: "pc", elecciones: d.elegido, entregada: true } }),
      }),
    );
  });

  // ── Memoria: las notas de Sam, en una bóveda de mentira ───────────────────
  rmSync(BOVEDA, { recursive: true, force: true });
  for (const [ruta, texto] of t.boveda) escribir(join(BOVEDA, ruta), texto);

  // ── Lienzo ────────────────────────────────────────────────────────────────
  rmSync(join(DATOS, "notas"), { recursive: true, force: true });
  for (const [id, texto] of Object.entries(t.notas)) escribir(join(DATOS, "notas", `nota-${id}.md`), texto);
  escribir(join(DATOS, "lienzo.json"), JSON.stringify(t.lienzo(new Date(ahora).toISOString())));
}
