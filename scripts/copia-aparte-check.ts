// La copia aparte de lo que trabaja solo (`lib/copiaAparte.ts`).
//
// Lo que no puede pasar: que la hija de una terminal de la noche nazca en la
// carpeta de verdad por pedirla con su nombre; montar un espejo encima de otro;
// cerrar por el MCP la dueña de una copia con trabajo dentro, también cuando ese
// trabajo ya está en commits o no se ha podido contar; o no dejar cerrar a una
// hija que solo trabaja dentro.
//
//   pnpm bancos copia-aparte

import {
  apuntarCopia,
  copiaCerrada,
  copiaDe,
  copiaPorCarpeta,
  dentroDe,
  dondeNace,
  notaDeCopia,
  parteDeCopia,
  porQueNoSeCierra,
  proyectoDe,
  soltarCopia,
  type Copia,
} from "../src/lib/copiaAparte";
import { espejoPropio } from "../src/lib/reenganche";

let fallos = 0;
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const RAIZ = "C:\\proyectos";
// Como lo devuelve `shadow_init`: la barra del medio va al revés.
const madre: Copia = { proyecto: "C:\\proyectos\\Demo", arbol: "C:\\proyectos\\Demo\\.adeorq/espejo\\5-abc", base: "main", duena: 5 };
const ARBOL = "C:\\proyectos\\Demo\\.adeorq\\espejo\\5-abc";

// ─── Dónde está cada carpeta ────────────────────────────────────────────────
es("dentro: la misma carpeta, sin resto", dentroDe("C:/proyectos/Demo/", "C:\\proyectos\\demo"), "");
es("dentro: una subcarpeta, con su resto", dentroDe("C:\\proyectos\\Demo\\src\\lib", "C:\\proyectos\\Demo"), "src/lib");
es("dentro, en Linux: la mayúscula sí cuenta", [dentroDe("/home/m/Demo/src", "/home/m/Demo"), dentroDe("/home/m/demo/src", "/home/m/Demo")], ["src", null]);
es("el proyecto en Linux y macOS, con su barra", proyectoDe("/home/m/proyectos/Demo/src", "/home/m/proyectos"), "/home/m/proyectos/Demo");
es("dentro: un nombre que empieza igual no está dentro", dentroDe("C:\\proyectos\\Demo2", "C:\\proyectos\\Demo"), null);
es("el proyecto de una subcarpeta es la de primer nivel", proyectoDe("C:\\proyectos\\Demo\\src", RAIZ), "C:\\proyectos\\Demo");
es("el proyecto de una carpeta de fuera es ella misma", proyectoDe("D:\\otra\\cosa", RAIZ), "D:\\otra\\cosa");
es("sin carpeta de proyectos, la propia carpeta", proyectoDe("C:\\proyectos\\Demo\\src", ""), "C:\\proyectos\\Demo\\src");

// ─── Dónde nace ─────────────────────────────────────────────────────────────
es("de día, sin madre en copia: donde pidió y sin espejo", dondeNace("C:\\proyectos\\Demo", false, undefined), { cwd: "C:\\proyectos\\Demo", copia: null, espejo: false });
es("un encargo de la noche: su propio espejo", dondeNace("C:\\proyectos\\Demo", true, undefined), { cwd: "C:\\proyectos\\Demo", copia: null, espejo: true });
es("la hija que pide la carpeta de verdad nace en la copia de su madre", dondeNace("C:\\proyectos\\Demo", false, madre), { cwd: madre.arbol, copia: madre, espejo: false });
es("y en la misma subcarpeta que pidió", dondeNace("c:/proyectos/demo/src/lib", false, madre).cwd, `${ARBOL}\\src\\lib`);
const madreMac: Copia = { proyecto: "/Users/m/p/Demo", arbol: "/Users/m/p/Demo/.adeorq/espejo/5-abc", base: "main", duena: 5 };
es("en macOS, la subcarpeta de la copia con su barra", dondeNace("/Users/m/p/Demo/web", false, madreMac).cwd, "/Users/m/p/Demo/.adeorq/espejo/5-abc/web");
es("en macOS, no se monta un espejo encima de otro", dondeNace("/Users/m/p/Demo/.adeorq/espejo/9-x", true, undefined).espejo, false);
es("la hija que pide la carpeta de la copia se queda ahí", dondeNace(`${ARBOL}\\web`, false, madre), { cwd: `${ARBOL}\\web`, copia: madre, espejo: false });
es("la hija en OTRO proyecto lleva su propio espejo", dondeNace("C:\\proyectos\\Otro", false, madre), { cwd: "C:\\proyectos\\Otro", copia: null, espejo: true });
es("no se monta un espejo encima del árbol de otro", dondeNace("C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x", true, undefined).espejo, false);
es("ni la hija se mete en la copia de otra terminal", dondeNace("C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x\\src", false, madre), { cwd: "C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x\\src", copia: null, espejo: false });

// ─── Recogida tras una caída, y relevo ──────────────────────────────────────
es("la dueña se reconoce por el número de su espejo", espejoPropio(ARBOL, 5)?.nombre, "5-abc");
es("una hija en la misma carpeta no se hace dueña", espejoPropio(ARBOL, 8), null);
es("la copia se lee de la carpeta de una hija sin registro", copiaPorCarpeta(`${ARBOL}\\src`), { proyecto: "C:\\proyectos\\Demo", arbol: ARBOL, base: "", duena: 5 });
es("y una carpeta normal no tiene copia", copiaPorCarpeta("C:\\proyectos\\Demo\\src"), undefined);
es("su hija nace dentro, aunque la madre se recogiera sin registro", dondeNace("C:\\proyectos\\Demo", false, copiaPorCarpeta(ARBOL)).cwd, ARBOL);

// ─── Cerrar ─────────────────────────────────────────────────────────────────
es("la dueña sin nada pendiente se cierra", porQueNoSeCierra(5, madre, { sueltos: 0, commits: 0 }), null);
const sueltos = porQueNoSeCierra(5, madre, { sueltos: 2, commits: 0 }) ?? "";
ok("la dueña con archivos sueltos NO se cierra, y dice cuántos", /2 archivos sin guardar/.test(sueltos) && /No la cierro/.test(sueltos), sueltos);
const commits = porQueNoSeCierra(5, madre, { sueltos: 0, commits: 1 }) ?? "";
ok("ni con el trabajo ya en commits de su rama", /trabajo sin aceptar: 1 commit\./.test(commits), commits);
ok("ni sin poder mirarlo", /no he podido mirar si tiene trabajo sin aceptar\. No la cierro/.test(porQueNoSeCierra(5, madre, null) ?? ""));
es("una hija que trabaja dentro se cierra como siempre", porQueNoSeCierra(8, madre, { sueltos: 3, commits: 2 }), null);
es("una terminal sin copia, también", porQueNoSeCierra(8, undefined, null), null);

// ─── Lo que se dice ─────────────────────────────────────────────────────────
const nota = notaDeCopia("C:\\proyectos\\Demo");
ok("la nota del encargo empieza en un párrafo aparte con [adeorq]", nota.startsWith("\n\n[adeorq] Trabajas en una copia aparte de C:\\proyectos\\Demo"), nota);
ok("y le pide no cambiar de rama ni hacer push", /No cambies de rama ni hagas push/.test(nota), nota);
ok("sin copia, la respuesta dice por qué y dónde trabaja", parteDeCopia({ sin: "esta carpeta no es un repositorio de git" }).includes("no es un repositorio de git, así que trabaja en la carpeta de verdad"));

// ─── El registro ────────────────────────────────────────────────────────────
apuntarCopia(5, madre);
apuntarCopia(8, madre);
apuntarCopia(9, { ...madre, arbol: "C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x", duena: 9 });
soltarCopia(5);
es("soltar la dueña deja a su hija en la copia", [copiaDe(5), copiaDe(8)?.duena], [undefined, 5]);
copiaCerrada(ARBOL);
es("aceptar o tirar la copia la quita también a sus hijas, y no a otras", [copiaDe(8), copiaDe(9)?.duena], [undefined, 9]);

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
