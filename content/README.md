# web/content · los textos de la web

Aquí viven **todos** los textos de la web, en español y en inglés. Nadie escribe copy
directamente en el HTML: si falta un texto, se pide por `BUZON.md` y se escribe aquí.

## Cómo se consume

- **Español:** el HTML nace en español (así la página se lee entera sin JavaScript), así que
  el texto español va **dentro del HTML**, en el nodo que lleva su clave.
- **Inglés:** va al diccionario `TEXTOS.en` de `js/boot.js`, con la misma clave.
- Dos sistemas de claves conviven, y está bien: `data-i18n` en el nav y el hero,
  `data-content` en las secciones de abajo. Cada archivo dice cuál usa.

## Un archivo por bloque

| Archivo | Bloque | Claves |
|---|---|---|
| `nav.md` | Nav y acciones | `data-i18n` |
| `hero.md` | Hero y maqueta | `data-i18n` |
| `que-es.md` | Qué es Adeorq | `data-content` |
| `features.md` | Las cinco tarjetas | `data-content` |
| `descarga.md` | Descarga | `data-content` |
| `changelog.md` | Novedades | `data-content` |
| `roadmap.md` | Lo que viene | `data-content` |
| `faq.md` | Preguntas | `data-content` |
| `footer.md` | Pie | `data-content` |
| `extra-emision.md` | Bloque opcional de modo emisión | propuesto, sin montar |

## Reglas al copiar

1. **Sin guiones largos.** Comas o barras. También en `alt` y `title`.
2. Las claves marcadas **[nueva]** todavía no existen en el HTML: hay que añadir el atributo.
   Las marcadas **[cambia]** ya existen pero con otro texto o apuntando a otro sitio.
3. Si un texto no cabe en su hueco, **no lo cortes**: dilo por `BUZON.md` y lo reescribo con
   la longitud que necesites. Un texto recortado a mano acaba siendo un texto sin sentido.
4. El tono, los largos de referencia y las palabras prohibidas están en `web/DISENO.md` §9.
