// Los encargos programados, por el lado de la ventana (`lib/programados.ts`):
// cuándo dice la fila que es la próxima vez y cómo lo dice.
//
// Quien lanza de verdad es el reloj de Rust, con sus propias pruebas
// (`cargo test --lib programados`). Lo que no puede pasar AQUÍ es que la fila
// prometa una hora que el reloj no va a cumplir: decir «hoy a las 9» de uno
// que ya se lanzó hoy, o «el lunes» de uno que está cortado.
//
//   pnpm bancos programados

import {
  borradorDe,
  CLIS_PROGRAMABLES,
  cortados,
  cuandoEnTexto,
  cuandoFalta,
  diaDe,
  elSiguiente,
  faltaEn,
  fechaLocal,
  modelosDe,
  pedidoDe,
  proximaVez,
  type Cuando,
  type Programado,
} from "../src/lib/programados";
import { cuentaDeArranque, cuentaPedida, cuentasDe } from "../src/lib/frenoCuota";
import { MAIN_ACCOUNT } from "../src/lib/pty";

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

// Sin diccionario: la clave con sus huecos rellenos, que es lo que se lee en español.
const t = (clave: string, datos?: Record<string, string | number>) =>
  clave.replace(/\{(\w+)\}/g, (_, k) => String(datos?.[k] ?? ""));

const uno = (cuando: Cuando, extra: Partial<Programado> = {}): Programado => ({
  id: "p1",
  nombre: "Dependencias",
  encargo: "Revisa las dependencias",
  cwd: "C:\\proyectos\\Adeorq",
  cli: "claude",
  cuando,
  activo: true,
  creado: new Date(2026, 9, 1, 8, 0).getTime(),
  ultima: 0,
  ultimoDia: "",
  corrida: null,
  ultimas: [],
  fallosSeguidos: 0,
  cortado: null,
  ...extra,
});
const lunes9: Cuando = { tipo: "semanal", dias: [1], hora: "09:00" };
// El 12 de octubre de 2026 es lunes.
const el = (dia: number, h: number, m = 0) => new Date(2026, 9, dia, h, m);
const txt = (d: Date | null) => (d ? `${fechaLocal(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null);

// 1. El calendario de la casa empieza en lunes.
es("el 12 de octubre de 2026 es lunes", diaDe(el(12, 9)), 1);
es("y el 11, domingo, es el 7", diaDe(el(11, 9)), 7);
es("la fecha local, con ceros", fechaLocal(new Date(2026, 0, 5, 23, 59)), "2026-01-05");

// 2. La próxima vez de uno semanal.
es("el lunes antes de su hora: hoy a su hora", txt(proximaVez(uno(lunes9), el(12, 8, 30))), "2026-10-12 09:00");
es("el lunes pasada su hora y sin lanzar: sigue siendo hoy (el reloj lo lanza ya)", txt(proximaVez(uno(lunes9), el(12, 11))), "2026-10-12 09:00");
es("el lunes ya lanzado: el lunes que viene", txt(proximaVez(uno(lunes9, { ultimoDia: "2026-10-12" }), el(12, 11))), "2026-10-19 09:00");
es("un martes: el lunes siguiente", txt(proximaVez(uno(lunes9), el(13, 10))), "2026-10-19 09:00");
es(
  "con varios días, el primero que venga",
  txt(proximaVez(uno({ tipo: "semanal", dias: [1, 3, 5], hora: "18:30" }), el(13, 10))),
  "2026-10-14 18:30",
);
es("apagado no tiene próxima vez", proximaVez(uno(lunes9, { activo: false }), el(12, 8)), null);
es("cortado tampoco", proximaVez(uno(lunes9, { cortado: { cuando: 1, motivo: "x" } }), el(12, 8)), null);
es("una hora que no se entiende, tampoco", proximaVez(uno({ tipo: "semanal", dias: [1], hora: "nueve" }), el(12, 8)), null);
es("sin días, tampoco", proximaVez(uno({ tipo: "semanal", dias: [], hora: "09:00" }), el(12, 8)), null);

// 3. La próxima vez de uno «cada N horas».
const cada6: Cuando = { tipo: "cada", horas: 6 };
es("recién creado, seis horas después de crearlo", txt(proximaVez(uno(cada6), el(1, 9))), "2026-10-01 14:00");
es(
  "ya lanzado, seis horas después de la última",
  txt(proximaVez(uno(cada6, { ultima: el(12, 10).getTime() }), el(12, 11))),
  "2026-10-12 16:00",
);

// 4. Cómo se dice cuándo.
es("un día", cuandoEnTexto(lunes9, t), "Los lunes a las 09:00");
es("todos", cuandoEnTexto({ tipo: "semanal", dias: [7, 1, 2, 3, 4, 5, 6], hora: "08:00" }, t), "Cada día a las 08:00");
es("los laborables", cuandoEnTexto({ tipo: "semanal", dias: [1, 2, 3, 4, 5], hora: "08:00" }, t), "De lunes a viernes a las 08:00");
es("unos cuantos, por su letra y en orden", cuandoEnTexto({ tipo: "semanal", dias: [5, 1, 3], hora: "18:30" }, t), "L, X y V a las 18:30");
es("dos", cuandoEnTexto({ tipo: "semanal", dias: [6, 7], hora: "10:00" }, t), "S y D a las 10:00");
es("cada hora, en singular", cuandoEnTexto({ tipo: "cada", horas: 1 }, t), "Cada hora");
es("cada seis", cuandoEnTexto(cada6, t), "Cada 6 horas");

// 5. Cuánto falta, dicho como lo diría alguien.
es("ya pasó: ahora", cuandoFalta(el(12, 9), el(12, 11), t), "ahora");
es("hoy", cuandoFalta(el(12, 18, 5), el(12, 11), t), "hoy a las 18:05");
es("mañana, aunque falten dos horas", cuandoFalta(el(13, 1), el(12, 23), t), "mañana a las 01:00");
es("otro día, por su nombre", cuandoFalta(el(19, 9), el(12, 11), t), "el lunes a las 09:00");

// 6. El formulario.
const vacio = borradorDe(null, "C:\\proyectos\\Adeorq");
es("uno nuevo nace en lunes a las 9 y en el proyecto que mirabas", [vacio.tipo, vacio.dias, vacio.hora, vacio.cwd], ["semanal", [1], "09:00", "C:\\proyectos\\Adeorq"]);
es("sin encargo no se guarda", faltaEn(vacio), "Escribe qué tiene que hacer.");
es("con encargo, sí", faltaEn({ ...vacio, encargo: "Revisa" }), null);
es("sin días no", faltaEn({ ...vacio, encargo: "Revisa", dias: [] }), "Elige al menos un día.");
es("sin proyecto no", faltaEn({ ...vacio, encargo: "Revisa", cwd: " " }), "Elige el proyecto donde se abre.");
es("cada cero horas no", faltaEn({ ...vacio, encargo: "Revisa", tipo: "cada", horas: 0 }), "Las horas van de 1 a 168.");
es("ni cada hora y media", faltaEn({ ...vacio, encargo: "Revisa", tipo: "cada", horas: 1.5 }), "Las horas van de 1 a 168.");
es(
  "lo que viaja a Rust lleva solo el horario elegido, con los días en orden",
  pedidoDe({ ...vacio, encargo: " Revisa ", nombre: " Deps ", dias: [5, 1] }),
  { id: undefined, nombre: "Deps", encargo: "Revisa", cwd: "C:\\proyectos\\Adeorq", cli: "claude", cuenta: "", modelo: "", cuando: { tipo: "semanal", dias: [1, 5], hora: "09:00" } },
);
es("los CLI que se pueden programar: los que aceptan el encargo al nacer y dejan leer cómo acabó", CLIS_PROGRAMABLES, ["claude", "codex"]);
es("uno nuevo nace con el primero", vacio.cli, "claude");
es("y al editar uno de Codex, sigue siendo de Codex", borradorDe(uno(lunes9, { cli: "codex" }), "").cli, "codex");
es(
  "y al editar uno «cada N horas», el formulario lo abre como estaba",
  (({ id, tipo, horas }) => [id, tipo, horas])(borradorDe(uno(cada6), "")),
  ["p1", "cada", 6],
);

// 7. Lo que avisa la portada de la Agenda.
const varios = [
  uno(lunes9, { id: "a" }),
  uno({ tipo: "semanal", dias: [2], hora: "07:00" }, { id: "b" }),
  uno(lunes9, { id: "c", cortado: { cuando: 1, motivo: "x" } }),
  uno(lunes9, { id: "d", activo: false }),
];
es("cuántos paró el freno", cortados(varios), 1);
es("el siguiente es el que se lanza antes, entre los que se van a lanzar", elSiguiente(varios, el(12, 10))?.e.id, "a");
es("y si ese ya se lanzó hoy, el del martes", elSiguiente([{ ...varios[0], ultimoDia: "2026-10-12" }, varios[1]], el(12, 10))?.e.id, "b");
es("sin ninguno que vaya a lanzarse, nada", elSiguiente([varios[2], varios[3]], el(12, 10)), null);

// 8. El freno por cuota mide la cuenta con la que el encargo va a nacer, que es
//    la que elige `entornoDePane` para una terminal abierta sin decir cuenta.
const segunda = { id: "c2", label: "Segunda", dir: "C:\\cuentas\\segunda", provider: "claude" };
const deCodex = { id: "x1", label: "Codex", dir: "C:\\cuentas\\codex", provider: "codex" };
es("sin tocar nada, la de siempre", cuentaDeArranque("claude", { list: [segunda], def: MAIN_ACCOUNT.id }), { provider: "claude", dir: "" });
es("con otra como predeterminada, esa", cuentaDeArranque("claude", { list: [segunda], def: "c2" }), { provider: "claude", dir: "C:\\cuentas\\segunda" });
es("una predeterminada que ya no existe cae en la de siempre", cuentaDeArranque("claude", { list: [], def: "c2" }), { provider: "claude", dir: "" });
es("la predeterminada de un CLI no decide la de otro", cuentaDeArranque("codex", { list: [segunda, deCodex], def: "c2" }), { provider: "codex", dir: "" });

// 9. Un encargo con su cuenta y su modelo (2026-10-16). El freno mide la que
//    pidió, aunque la predeterminada sea otra, y al abrir se usa esa misma.
es("el freno mide la cuenta que pidió el encargo", cuentaDeArranque("claude", { list: [segunda], def: MAIN_ACCOUNT.id }, "c2"), { provider: "claude", dir: "C:\\cuentas\\segunda" });
es("pedir la principal gana a otra predeterminada", cuentaDeArranque("claude", { list: [segunda], def: "c2" }, "main:claude"), { provider: "claude", dir: "" });
es("la principal de Codex también se puede pedir", cuentaDeArranque("codex", { list: [deCodex], def: "x1" }, "main:codex"), { provider: "codex", dir: "" });
es("al abrir, la pedida tal cual", (cuentaPedida("c2", "claude", [segunda]) as { id: string }).id, "c2");
es("una cuenta que ya no está no se cambia por otra: se dice", "error" in cuentaPedida("c9", "claude", [segunda]), true);
es("ni una de otro agente", "error" in cuentaPedida("x1", "claude", [segunda, deCodex]), true);
es("las que puede elegir un encargo de Claude: la principal y las suyas", cuentasDe("claude", [segunda, deCodex]).map((a) => a.id), ["main:claude", "c2"]);
es("los modelos de Claude son los de la casa", modelosDe("claude").map((m) => m.alias), ["haiku", "sonnet", "opus", "fable"]);
es("los de Codex, con su nombre", modelosDe("codex").length, 3);
es("un agente sin bandera de modelo no ofrece ninguno", modelosDe("shell"), []);
es("al editar, la cuenta y el modelo vuelven al formulario", (({ cuenta, modelo }) => [cuenta, modelo])(borradorDe(uno(lunes9, { cuenta: "c2", modelo: "opus" }), "")), ["c2", "opus"]);
es("y viajan a Rust", (({ cuenta, modelo }) => [cuenta, modelo])(pedidoDe({ ...vacio, encargo: "x", cuenta: "c2", modelo: "haiku" })), ["c2", "haiku"]);

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
