// La tarjeta de un esquema de terminal, y el bloque de los importados de Warp
// y de Ghostty. Quien lee los archivos es `lib/temasDeFuera.ts`; dónde se
// guardan, `lib/temasTerm.ts`.

import { useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { leerTema, nombreDeArchivo } from "../lib/temasDeFuera";
import { guardarImportado, quitarImportado, temasImportados, type TemaTerm } from "../lib/temasTerm";
import { CheckIcon, CloseIcon, DownloadIcon } from "./Icons";

/**
 * Un esquema enseñado como lo que es: cuatro líneas de terminal escritas con
 * SUS colores, sobre el fondo que le va a tocar (el de la casa). Seis rayitas
 * de color dicen qué colores tiene; esto dice cómo se va a leer.
 */
export function TarjetaTerm({ tema, elegido, onElegir }: { tema: TemaTerm; elegido: boolean; onElegir: () => void }) {
  const { lang } = useT();
  const c = tema.colores;
  return (
    <button className="tema-tarjeta term-tarjeta" data-tema-term={tema.id} data-on={elegido} onClick={() => onElegir()}>
      <span className="term-prev" aria-hidden="true">
        <span style={{ color: c.cyan }}>~/adeorq</span> <span style={{ color: c.green }}>❯</span>{" "}
        <span style={{ color: c.foreground }}>pnpm build</span>
        <br />
        <span style={{ color: c.green }}>✓</span> <span style={{ color: c.foreground }}>listo en 3,1 s</span>
        <br />
        <span style={{ color: c.yellow }}>⚠</span> <span style={{ color: c.brightBlack }}>2 avisos</span>
        <br />
        <span style={{ color: c.red }}>✗</span> <span style={{ color: c.magenta }}>auth.ts</span>
        <span style={{ color: c.brightBlack }}>:42</span>
        <span className="term-prev-cursor" style={{ background: c.cursor }} />
      </span>
      <span className="tema-nombre">
        {lang === "es" ? tema.es : tema.en}
        {elegido && <CheckIcon size={13} />}
      </span>
    </button>
  );
}

/** Lo que pasó con cada archivo elegido: entró, o por qué no. */
interface Parte {
  archivo: string;
  ok: boolean;
  texto: string;
}

/**
 * Los esquemas que has traído tú, y el botón para traer más.
 *
 * `elegido` y `onElegir` son los del selector de arriba: un importado se elige
 * igual que uno de la casa, y quitar el que está puesto vuelve al de la casa.
 */
export function TemasImportados({ elegido, onElegir }: { elegido: string; onElegir: (id: string) => void }) {
  const { t } = useT();
  const [temas, setTemas] = useState<TemaTerm[]>(temasImportados);
  const [partes, setPartes] = useState<Parte[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const traer = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    const nuevos: Parte[] = [];
    let ultimo = "";
    for (const archivo of Array.from(archivos)) {
      // Un tema son unos cientos de bytes: algo de megas no lo es, y no se lee.
      if (archivo.size > 200_000) {
        nuevos.push({ archivo: archivo.name, ok: false, texto: t("No es un tema de Warp ni de Ghostty.") });
        continue;
      }
      const leido = leerTema(await archivo.text());
      if (!leido.ok) {
        nuevos.push({ archivo: archivo.name, ok: false, texto: `${t(leido.error)}${leido.detalle ? ` ${leido.detalle}` : ""}` });
        continue;
      }
      ultimo = guardarImportado(nombreDeArchivo(archivo.name), leido.colores).id;
      nuevos.push({ archivo: archivo.name, ok: true, texto: leido.formato === "warp" ? "Warp" : "Ghostty" });
    }
    setPartes(nuevos);
    setTemas(temasImportados());
    // Importar es para usarlo: el último que entró queda puesto.
    if (ultimo) onElegir(ultimo);
    if (entrada.current) entrada.current.value = "";
  };

  return (
    <div className="tema-familia" data-importados>
      <h3 className="tema-familia-eti">{t("Traídos de Warp o de Ghostty")}</h3>
      {temas.length > 0 && (
        <div className="term-rejilla">
          {temas.map((tema) => (
            <div key={tema.id} className="term-importado">
              <TarjetaTerm tema={tema} elegido={elegido === tema.id} onElegir={() => onElegir(tema.id)} />
              <button
                className="term-quitar"
                aria-label={`${t("Quitar")} ${tema.es}`}
                data-tip={t("Quitar")}
                onClick={() => {
                  quitarImportado(tema.id);
                  setTemas(temasImportados());
                  if (elegido === tema.id) onElegir("casa");
                }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="term-traer">
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          data-traer-tema
          onChange={(e) => void traer(e.currentTarget.files)}
        />
        <button className="mini" onClick={() => entrada.current?.click()}>
          <DownloadIcon size={14} />
          {t("Importar un tema…")}
        </button>
        <span className="card-hint">
          {t(
            "Elige el archivo del tema: un .yaml de Warp o un tema de Ghostty. Se traen sus letras y sus colores; el fondo lo sigue poniendo Adeorq.",
          )}
        </span>
      </div>
      {partes.length > 0 && (
        <ul className="term-partes">
          {partes.map((p) => (
            <li key={p.archivo} data-ok={p.ok}>
              <b>{p.archivo}</b> {p.ok ? `${t("importado, era de")} ${p.texto}` : p.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
