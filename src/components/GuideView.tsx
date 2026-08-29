import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { limpiar } from "../lib/markdown";
import { readGuide } from "../lib/pty";
import { useT } from "../lib/i18n";

/** Un apartado de la guía, para el índice de al lado. */
interface Apartado {
  id: string;
  texto: string;
}

export default function GuideView() {
  const { lang, t } = useT();
  const [html, setHtml] = useState("");
  const [indice, setIndice] = useState<Apartado[]>([]);
  const [aqui, setAqui] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  // Reloads when the language changes: the guide has its own English file.
  useEffect(() => {
    setHtml(`<p>${t("Cargando la guía…")}</p>`);
    setIndice([]);
    readGuide(lang)
      .then((text) => {
        /* Se numeran los apartados para poder saltar a ellos.
           `marked` no pone `id` en los títulos, así que se hace aquí sobre el
           HTML ya generado en vez de con un renderer propio: son tres líneas y
           no hay que mantener una copia de cómo pinta marked un `h2`. */
        const doc = new DOMParser().parseFromString(marked.parse(text) as string, "text/html");
        /* Fuera el índice que trae el propio fichero. Aquí sobra dos veces: al
           lado ya hay uno que sí funciona, y los enlaces de ese van a anclas
           que en esta pantalla no existen (los `id` los pone la línea de abajo,
           por posición). Era lo primero que se leía al abrir la guía y no
           llevaba a ningún sitio. En GitHub y en la web sí sirve, así que se
           quita aquí y no del fichero. */
        for (const h of Array.from(doc.querySelectorAll("h2"))) {
          const nom = (h.textContent ?? "").trim().toLowerCase();
          if (nom !== "índice" && nom !== "indice" && nom !== "contents") continue;
          let n: Element | null = h.nextElementSibling;
          while (n && n.tagName !== "H2") {
            const sig: Element | null = n.nextElementSibling;
            n.remove();
            n = sig;
          }
          h.remove();
        }
        const hs = Array.from(doc.querySelectorAll("h2"));
        hs.forEach((h, i) => {
          h.id = `guia-${i}`;
        });
        // Se limpia al final y no antes: los `id` de arriba los pone esta
        // pantalla, así que el filtro tiene que ver el HTML definitivo.
        setHtml(limpiar(doc.body.innerHTML));
        setIndice(hs.map((h, i) => ({ id: `guia-${i}`, texto: h.textContent ?? "" })));
      })
      .catch((e) => setHtml(`<p>${t("No pude leer la guía")}: ${String(e)}</p>`));
  }, [lang]);

  /* Qué apartado estás leyendo, para encenderlo en el índice.
     Con el scroll y no con un observador de intersección: el contenedor que
     hace scroll es este `div` y no la ventana, y ahí un `IntersectionObserver`
     necesita que le digas la raíz y el margen, o sea la misma cuenta con más
     piezas. Aquí basta con mirar qué título ha pasado por arriba. */
  useEffect(() => {
    const el = caja.current;
    if (!el || indice.length === 0) return;
    const mirar = () => {
      const arriba = el.getBoundingClientRect().top + 90;
      let actual = indice[0]?.id ?? "";
      for (const a of indice) {
        const h = el.querySelector<HTMLElement>(`#${a.id}`);
        if (h && h.getBoundingClientRect().top <= arriba) actual = a.id;
      }
      setAqui(actual);
    };
    mirar();
    el.addEventListener("scroll", mirar, { passive: true });
    return () => el.removeEventListener("scroll", mirar);
  }, [indice]);

  const ir = (id: string) => {
    caja.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="guide-wrap" ref={caja}>
      {/* El índice, pegado a la izquierda mientras lees.
          La guía tiene veinte apartados y hasta ahora la única forma de ir a
          uno era bajar buscándolo. Y de paso llena la ventana, que era lo otro
          que sobraba: un texto de ancho legible en una pantalla de 1900 px deja
          medio monitor en blanco (Munir, 2026-08-12). */}
      {indice.length > 1 && (
        <nav className="guide-toc">
          <span className="guide-toc-tit">{t("En esta guía")}</span>
          {indice.map((a) => (
            <button
              key={a.id}
              className="guide-toc-item"
              data-on={aqui === a.id || undefined}
              onClick={() => ir(a.id)}
            >
              {a.texto}
            </button>
          ))}
        </nav>
      )}
      <article className="guide" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
