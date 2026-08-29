// Cómo se titula el commit del repo público, y SOLO eso.
//
// Vive aparte porque lo usan dos: `publicar-codigo.mjs`, que publica de verdad,
// y `publicar-check.mjs`, que lo prueba. Antes la prueba llevaba una COPIA de
// esta función, con un aviso en su cabecera de que había que tocar las dos a la
// vez, y pasó lo que tenía que pasar: se cambió una y la otra no, así que el
// arreglo salió a producción con su prueba en verde diciendo lo contrario.
// Una decisión, un sitio.

/**
 * De la lista de asuntos de commit (de HEAD hacia atrás) saca el título y el
 * cuerpo del commit público.
 *
 * Se para en el `release:` de OTRA versión, no en el primero que aparezca: los
 * de esta (el del número y el del manifiesto) son parte de publicarla. Contar
 * posiciones no vale, porque encima del release puede haber un `docs:` de otra
 * sesión trabajando en paralelo.
 */
export function queTrae(lineas, version) {
  const mios = [];
  for (const linea of lineas) {
    const s = linea.trim();
    const rel = s.match(/^release:\s*([\d]+\.[\d]+\.[\d]+)/i);
    if (rel) {
      if (rel[1] === version) continue;
      break;
    }
    const m = s.match(/^(feat|fix|perf)(\([^)]*\))?:\s*(.+)$/i);
    if (m) mios.push({ tipo: m[1].toLowerCase(), texto: m[3].trim() });
  }

  /* Si en el tramo no hay ningún `feat`, `fix` ni `perf`, esto no se calla:
     coge el asunto más reciente sea del tipo que sea y le quita el prefijo. Un
     tramo así existe de verdad (una publicación que solo cambia la licencia o
     la documentación), y quedarse en «Adeorq 0.9.133» a secas por segunda vez
     es justo el commit repetido que esto viene a evitar. */
  if (!mios.length) {
    /* Los `release:` se saltan aquí también, o el título saldría siendo el
       número de versión que ya está delante: «Adeorq 0.9.134 — 0.9.134». */
    const primero = lineas
      .map((x) => x.trim())
      .filter(Boolean)
      .find((x) => !/^release:/i.test(x));
    const m = (primero || "").match(/^[a-z]+(\([^)]*\))?:\s*(.+)$/i);
    const suelto = (m ? m[2] : primero || "").trim();
    if (!suelto) return { titulo: "", cuerpo: "" };
    return { titulo: recortar(suelto), cuerpo: "" };
  }

  /* UNA frase en el título y el resto en el cuerpo. Encadenar tres da un título
     de tres renglones con dos «and» dentro, y la lista de commits de GitHub lo
     corta igual: lo que se lee de un vistazo es el principio.

     Y de todas, manda el `feat` más reciente, no el commit más reciente sin
     más. Salió mal dos veces seguidas: la 0.9.141 se tituló con el arreglo de
     dos tests y la 0.9.142 con un aviso, cuando lo que traían era el MCP con
     manos y el editor de la web. Un arreglo hecho DESPUÉS no es más importante
     que la novedad, solo es más nuevo. Sin ningún `feat`, sigue mandando el
     más reciente. */
  const cabeza = mios.find((x) => x.tipo === "feat") ?? mios[0];
  return {
    titulo: recortar(cabeza.texto),
    cuerpo: mios.map((x) => `- ${x.texto}`).join("\n"),
  };
}

const recortar = (s) => (s.length > 72 ? `${s.slice(0, 69)}…` : s);
