// Que dos publicaciones seguidas no se llamen igual.  `node scripts/publicar-check.mjs`
//
// EL FALLO, contado una vez para no volver a diagnosticarlo: el 2026-08-21 salió
// la 0.9.133 y veinte minutos después se volvió a publicar el código con la
// licencia nueva, sin subir el número. Como el mensaje del commit público se
// medía desde el `release:` ANTERIOR, las dos veces salió el mismo texto, y en
// GitHub quedaron dos commits con el título calcado (Munir, con la captura:
// «hay muchos commits con el nombre repetido»). Dos commits que se leen igual
// son dos commits que nadie sabe cuál mirar.
//
// Aquí se prueba la DECISIÓN, no el script: `publicar-codigo.mjs` toca disco,
// clona el repo público y no exporta nada, así que sus tres piezas nuevas están
// escritas otra vez debajo, tal cual. Si se tocan allí, se tocan aquí.
//   1. contar desde `Adeorq-origen:` en vez de desde el release anterior
//   2. caer al asunto suelto cuando no hay feat/fix/perf en el tramo
//   3. el desempate por sha si aun así saldría repetido
const version = "0.9.133";

function queTrae(lineas) {
  const mios = [];
  for (const linea of lineas) {
    const s = linea.trim();
    const rel = s.match(/^release:\s*([\d]+\.[\d]+\.[\d]+)/i);
    if (rel) {
      if (rel[1] === version) continue;
      break;
    }
    const m = s.match(/^(feat|fix|perf)(\([^)]*\))?:\s*(.+)$/i);
    if (m) mios.push(m[3].trim());
  }
  if (!mios.length) {
    const primero = lineas
      .map((x) => x.trim())
      .filter(Boolean)
      .find((x) => !/^release:/i.test(x));
    const m = (primero || "").match(/^[a-z]+(\([^)]*\))?:\s*(.+)$/i);
    const suelto = (m ? m[2] : primero || "").trim();
    if (!suelto) return { titulo: "", cuerpo: "" };
    return { titulo: suelto.length > 72 ? suelto.slice(0, 69) + "…" : suelto, cuerpo: "" };
  }
  const t = mios[0];
  return {
    titulo: t.length > 72 ? t.slice(0, 69) + "…" : t,
    cuerpo: mios.map((x) => "- " + x).join("\n"),
  };
}

function titular(lineas, anterior, sha) {
  const trae = queTrae(lineas);
  let m = trae.titulo ? `Adeorq ${version} — ${trae.titulo}` : `Adeorq ${version}`;
  if (anterior === m) m = `${m} (${sha.slice(0, 7)})`;
  return m;
}

let fallos = 0;
const ok = (n, c, d = "") => {
  if (!c) fallos++;
  console.log(`${c ? "ok  " : "FALLA"} ${n}${d ? " — " + d : ""}`);
};

// ── EL CASO DE HOY, tal cual pasó ──────────────────────────────────────────
const primeraVez = [
  "release: 0.9.133",
  "feat(update): the update card gets an accent frame with a glow",
  "docs(licence): the licence covers the source",
  "release: 0.9.132",
];
const t1 = titular(primeraVez, "Adeorq 0.9.132 — otra cosa", "aaaaaaaaaaaa");
ok("la primera publicacion dice lo que trae", t1.includes("accent frame"), t1);

// La SEGUNDA, contando desde `Adeorq-origen` (solo el commit de licencia).
const segundaVez = ["docs(licence): swap the bespoke EULA for PolyForm Shield 1.0.0"];
const t2 = titular(segundaVez, t1, "bbbbbbbbbbbb");
ok("la segunda NO repite el titulo", t2 !== t1, t2);
ok("y dice lo que de verdad cambio", t2.includes("PolyForm Shield"), t2);

// Y si aun así el tramo saliera idéntico, el sha desempata.
const comoEraAntes = titular(primeraVez, t1, "bbbbbbbbbbbb");
ok("si el tramo saliera igual, el sha desempata", comoEraAntes !== t1, comoEraAntes);

// ── Los bordes ─────────────────────────────────────────────────────────────
ok("un tramo vacio no revienta", titular([], "otro", "cccccccccccc") === "Adeorq 0.9.133");

const normal = ["release: 0.9.133", "feat(x): algo nuevo", "release: 0.9.132"];
ok(
  "una version normal sigue igual que antes",
  titular(normal, "", "dddddddddddd").endsWith("algo nuevo"),
  titular(normal, "", "dddddddddddd"),
);

// El que destapó el simulacro y no el ojo: sin filtrar los `release:` del
// respaldo, el titulo salia siendo el numero que ya esta delante.
const soloRelease = titular(["release: 0.9.133"], "otro", "eeeeeeeeeeee");
ok("un tramo con solo el release no se titula con el numero", soloRelease === "Adeorq 0.9.133", soloRelease);

// Un tramo de solo documentacion: tiene que decir algo, no quedarse mudo.
const soloDocs = titular(["docs: el mapa del ecosistema al dia"], "otro", "ffffffffffff");
ok("un tramo de solo docs dice de que va", soloDocs.includes("mapa del ecosistema"), soloDocs);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
