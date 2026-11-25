// Banco del horario de salud (`src/lib/salud.ts`): en qué fase está cada
// momento de la noche, cada noche con su hora, y qué hace posponer.
//
//   pnpm bancos salud
//
// Las fechas se escriben con la hora de la máquina (`new Date(año, mes, día,
// h, m)`), como las cuenta la app: «la 1 del martes» es la 1 donde estés.

import { faseDeSalud, posponer, saludDe, SALUD_DE_FABRICA, type Fase, type Salud } from "../src/lib/salud";

let fallos = 0;
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle && !cond ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

// El lunes 23 y el martes 24 de noviembre de 2026.
const t = (dia: number, h: number, m = 0) => new Date(2026, 10, dia, h, m).getTime();
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** La fase en corto: «libre», «aviso 24 01:00» o «cerrado 24 01:00». */
const corta = (f: Fase) => (f.fase === "libre" ? "libre" : `${f.fase} ${hhmm(f.cierre)}`);

const fija: Salud = { ...SALUD_DE_FABRICA, activo: true };

// --- apagado, nada -----------------------------------------------------------------------
es("apagado, a las 3 de la madrugada está libre", corta(faseDeSalud(t(24, 3), SALUD_DE_FABRICA)), "libre");

// --- a la 1, avisando a las 0:45 y tapando hasta las 7 -----------------------------------
es(
  "la noche del lunes, de la tarde a la mañana",
  [t(23, 23), t(24, 0, 44), t(24, 0, 45), t(24, 0, 59), t(24, 1), t(24, 3), t(24, 6, 59), t(24, 7), t(24, 12)].map((x) => corta(faseDeSalud(x, fija))),
  ["libre", "libre", "aviso 24 01:00", "aviso 24 01:00", "cerrado 24 01:00", "cerrado 24 01:00", "cerrado 24 01:00", "libre", "libre"],
);
{
  const f = faseDeSalud(t(24, 3), fija);
  ok("tapada, dice hasta cuándo: las 7 del martes", f.fase === "cerrado" && f.despierta === t(24, 7));
}

// --- un cierre antes de medianoche es de esa misma tarde ---------------------------------
{
  const s = { ...fija, cierre: "23:30" };
  es(
    "a las 23:30: aviso a las 23:15 y tapada pasada la medianoche",
    [t(23, 23, 14), t(23, 23, 15), t(23, 23, 30), t(24, 0, 30), t(24, 7)].map((x) => corta(faseDeSalud(x, s))),
    ["libre", "aviso 23 23:30", "cerrado 23 23:30", "cerrado 23 23:30", "libre"],
  );
}
// Y uno justo después: el aviso empieza el día antes.
es("a las 0:10, el aviso de las 23:55 ya es de esa noche", corta(faseDeSalud(t(23, 23, 55), { ...fija, cierre: "00:10" })), "aviso 24 00:10");
es("un cierre a la hora de despertar no tapa nunca", corta(faseDeSalud(t(24, 7), { ...fija, cierre: "07:00" })), "libre");

// --- cada noche la suya --------------------------------------------------------------------
{
  const dias = [...SALUD_DE_FABRICA.dias];
  dias[1] = null; // la noche del lunes, sin tope
  dias[2] = "02:00"; // la del martes, a las 2
  const s = { ...fija, porDia: true, dias };
  es(
    "el lunes sin tope y el martes a las 2",
    [t(24, 0, 50), t(24, 3), t(25, 1, 44), t(25, 1, 45), t(25, 2)].map((x) => corta(faseDeSalud(x, s))),
    ["libre", "libre", "libre", "aviso 25 02:00", "cerrado 25 02:00"],
  );
  es("sin «cada noche», manda la hora de todas", corta(faseDeSalud(t(24, 1), { ...s, porDia: false })), "cerrado 24 01:00");
}

// --- posponer --------------------------------------------------------------------------------
{
  const p1 = posponer(t(24, 1, 5), fija, null);
  es("tapada a la 1:05, un clic la lleva a la 1:20", p1 && hhmm(p1.hasta), "24 01:20");
  es("y vuelve a ser aviso, sin tapar", corta(faseDeSalud(t(24, 1, 5), fija, p1)), "aviso 24 01:20");
  es("a la 1:20 se tapa otra vez", corta(faseDeSalud(t(24, 1, 20), fija, p1)), "cerrado 24 01:20");
  const p2 = posponer(t(24, 1, 21), fija, p1);
  es("y se pospone cuanto quieras", p2 && hhmm(p2.hasta), "24 01:36");

  const a1 = posponer(t(24, 0, 50), fija, null);
  es("pospuesto en el aviso, el aviso se va hasta la 1", corta(faseDeSalud(t(24, 0, 51), fija, a1)), "libre");
  const a2 = posponer(t(24, 1, 1), fija, a1);
  es("en el aviso, cuenta desde el cierre: 1:15 y luego 1:30", [a1, a2].map((p) => p && hhmm(p.hasta)), ["24 01:15", "24 01:30"]);
  es("entre la 1 y el aviso nuevo, libre", corta(faseDeSalud(t(24, 1, 5), fija, a2)), "libre");

  es("lo pospuesto el martes no mueve la noche siguiente", corta(faseDeSalud(t(25, 1), fija, p2)), "cerrado 25 01:00");
  es("de día no hay nada que posponer", posponer(t(24, 12), fija, null), null);
}

// --- lo guardado, leído -----------------------------------------------------------------------
es("basura, de fábrica", saludDe("hola"), SALUD_DE_FABRICA);
es("null, de fábrica", saludDe(null), SALUD_DE_FABRICA);
{
  const s = saludDe({ activo: true, cierre: "25:00", avisoMin: -3, dias: ["02:00"], despierta: "6:00" });
  es(
    "lo roto se queda de fábrica campo a campo",
    [s.activo, s.cierre, s.avisoMin, s.dias, s.despierta],
    [true, "01:00", 15, SALUD_DE_FABRICA.dias, "07:00"],
  );
  const d = saludDe({ porDia: true, dias: [null, "02:00", "x", "00:30", "01:00", "01:00", "23:45"] });
  es("cada noche se lee, y una hora rota vuelve a la de fábrica", d.dias, [null, "02:00", "01:00", "00:30", "01:00", "01:00", "23:45"]);
}

if (fallos) {
  console.error(`\n${fallos} en rojo:\n  ${rojos.join("\n  ")}`);
  process.exit(1);
}
console.log("\nEl horario de salud, en verde.");
