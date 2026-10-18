// Lo que el agente está haciendo con los archivos, encima del árbol.
//
// Munir, 2026-10-12, con el vídeo de otro producto delante: «me gusta esta
// animación de la parte de archivos que está tocando el agente». Son dos
// piezas, y las dos pintan lo que ya decidió `lib/tocados.ts`:
//
//   · la tarjeta: lo último que importa (está editando tal archivo, editó dos,
//     hizo el commit), debajo la lista de lo que tocó (cada archivo con su
//     etiqueta, y se abre al pulsarlo), y al pie la rama con lo que lleva sin
//     subir y lo que suma el árbol. Eran dos cajas hasta el 2026-10-18, y
//     Munir las fundió: «el recuadro de Working y Claude Touch no tiene mucho
//     sentido, hay que fusionar esas dos cosas»;
//   · el pie del árbol: «haciendo commit…» y, cuando entra, su hash.
//
// Aquí no se decide nada. Lo que se mueve (una etiqueta que entra, un nombre
// que brilla al cambiar, una fila que pasa a verde) lo hace la hoja
// (`35-archivos.css`): cada pieza que cambia lleva su marca en la `key`, así
// React la monta de nuevo y la animación de entrada vuelve a correr. Los
// números de líneas cuentan hasta su valor (`lib/cifra.ts`).

import { useState } from "react";
import { useT, type Translate } from "../lib/i18n";
import type { EstadoArchivos } from "../lib/archivos";
import { nombreDeRuta, rutaCorta } from "../lib/arbol";
import { useCifra } from "../lib/cifra";
import { totalesDe, type MarcaAgente, type Resumen, type Titular } from "../lib/tocados";
import { tipoDeArchivo } from "../lib/tipoArchivo";
import IconoArchivo from "./IconoArchivo";
import { CheckIcon, EyeIcon, GitBranchIcon, PencilIcon } from "./Icons";

/** Cuántas filas de la lista se ven sin pedir más. */
const A_LA_VISTA = 5;

/** La etiqueta de cada marca, en la lista y en el árbol. */
export const ETIQUETA: Record<MarcaAgente, string> = {
  editando: "Editando",
  leyendo: "Leyendo",
  editado: "Editado",
  commit: "En el commit",
  leido: "Abierto",
};

/** La ruta como se lee dentro del proyecto: sin la raíz y con barras normales. */
const relativa = (ruta: string, raiz: string) => rutaCorta(ruta, raiz).replace(/\\/g, "/");

/** «+3 −1», con cada número de su color y contando hasta llegar. Sin líneas no pinta nada. */
export function Lineas({ mas, menos }: { mas: number; menos: number }) {
  const { t } = useT();
  const m = useCifra(mas);
  const n = useCifra(menos);
  if (!mas && !menos) return null;
  return (
    <span className="arch-lineas" data-tip={t("Líneas añadidas y quitadas desde el último commit")}>
      {mas > 0 && <i className="arch-mas">+{m}</i>}
      {menos > 0 && <i className="arch-menos">−{n}</i>}
    </span>
  );
}

/**
 * El titular en palabras: una frase y, debajo, el commit del que habla. El
 * archivo que está leyendo o editando ya va en la lista de debajo, con su
 * etiqueta: repetirlo aquí era decirlo dos veces.
 */
function frases(tit: Titular, q: string, t: Translate): { titulo: string; sub: string } {
  const plural = (n: number, uno: string, varios: string) => t(n === 1 ? uno : varios, { q, n });
  switch (tit.que) {
    case "commitEnCurso":
      return { titulo: t("{q} está haciendo el commit", { q }), sub: "" };
    case "editando":
      return { titulo: t("{q} está editando", { q }), sub: "" };
    case "leyendo":
      return { titulo: t("{q} está leyendo", { q }), sub: "" };
    case "commit":
      return { titulo: plural(tit.n, "{q} hizo commit de {n} archivo", "{q} hizo commit de {n} archivos"), sub: `${tit.hash} · ${tit.asunto}` };
    case "edito":
      return { titulo: plural(tit.n, "{q} editó {n} archivo", "{q} editó {n} archivos"), sub: "" };
    case "abrio":
      return { titulo: plural(tit.n, "{q} abrió {n} archivo", "{q} abrió {n} archivos"), sub: "" };
    default:
      return { titulo: "", sub: "" };
  }
}

function IconoDeTitular({ que }: { que: Titular["que"] }) {
  if (que === "commit") return <CheckIcon size={15} />;
  if (que === "commitEnCurso") return <GitBranchIcon size={15} />;
  if (que === "leyendo" || que === "abrio") return <EyeIcon size={15} />;
  return <PencilIcon size={15} />;
}

/**
 * La tarjeta de arriba, con la lista de lo que tocó dentro. Sin nada del
 * agente se queda en la línea de git (la rama y lo que suma el árbol); sin git
 * y sin agente, no se pinta.
 */
export function TarjetaAgente({
  resumen,
  git,
  quien,
  raiz,
  nota,
  conLeyenda,
  onAbrir,
}: {
  resumen: Resumen;
  git: EstadoArchivos | null;
  quien: string;
  raiz: string;
  /** Lo que este CLI no deja escrito, dicho en una línea. */
  nota: string;
  /** Hay un agente del que se sabe qué toca: los tres colores significan algo. */
  conLeyenda: boolean;
  onAbrir: (ruta: string) => void;
}) {
  const { t } = useT();
  const tit = resumen.titular;
  const hayAgente = tit.que !== "nada";
  const hayLista = resumen.filas.length > 0 || resumen.fuera > 0;
  const hayGit = !!git?.git;
  if (!hayAgente && !hayLista && !hayGit && !nota) return null;
  const { titulo, sub } = frases(tit, quien, t);
  const suma = totalesDe(git?.cambios ?? []);
  const delante = git?.delante ?? 0;
  return (
    <div className="arch-tarjeta" data-que={tit.que} data-marcha={resumen.enMarcha || undefined}>
      {hayAgente && (
        <div className="arch-tj-cab">
          {/* La `key` monta un icono nuevo cuando cambia de qué se habla: es lo que lo hace entrar. */}
          <span className="arch-tj-ico" key={tit.que}>
            <IconoDeTitular que={tit.que} />
          </span>
          <div className="arch-tj-txt">
            <span className="arch-tj-estado">{t(resumen.enMarcha ? "Trabajando" : "Hecho")}</span>
            <b className="arch-tj-tit" key={titulo}>
              {titulo}
            </b>
            {(sub || tit.que === "edito") && (
              <span className="arch-tj-sub" data-tip={sub || undefined}>
                {/* La ruta lleva la `key` y las líneas no: así siguen contando desde donde iban. */}
                {sub && (
                  <span className="arch-tj-ruta" key={sub}>
                    {sub}
                  </span>
                )}
                {tit.que === "edito" && <Lineas mas={tit.mas} menos={tit.menos} />}
              </span>
            )}
          </div>
        </div>
      )}
      {hayLista && <ListaTocados resumen={resumen} raiz={raiz} onAbrir={onAbrir} />}
      {hayGit && (
        <div className="arch-tj-git">
          <GitBranchIcon size={13} />
          <b className="arch-tj-rama" data-tip={git?.rama || t("Sin rama: la cabeza está suelta")}>
            {git?.rama || "HEAD"}
          </b>
          {delante > 0 && (
            <i className="arch-tj-delante" data-tip={t(delante === 1 ? "{n} commit sin subir" : "{n} commits sin subir", { n: delante })}>
              ↑{delante}
            </i>
          )}
          <span className="arch-tj-suma">
            {suma.n > 0 ? (
              <>
                <Lineas mas={suma.mas} menos={suma.menos} />
                {t(suma.n === 1 ? "{n} cambiado" : "{n} cambiados", { n: suma.n })}
              </>
            ) : (
              t("limpio, nada cambiado")
            )}
          </span>
        </div>
      )}
      {conLeyenda && (
        <div className="arch-leyenda">
          <span data-agente="leido">
            <i className="arch-punto" />
            {t("Leído por {q}", { q: quien })}
          </span>
          <span data-agente="editado">
            <i className="arch-punto" />
            {t("Editado por {q}", { q: quien })}
          </span>
          <span data-agente="commit">
            <i className="arch-punto" />
            {t("En el commit")}
          </span>
        </div>
      )}
      {nota && <p className="arch-tj-nota">{nota}</p>}
    </div>
  );
}

/** La lista de lo que tocó: cada archivo con su carpeta, sus líneas y su etiqueta. */
function ListaTocados({ resumen, raiz, onAbrir }: { resumen: Resumen; raiz: string; onAbrir: (ruta: string) => void }) {
  const { t } = useT();
  const [entera, setEntera] = useState(false);
  const { filas, fuera } = resumen;
  const vistas = entera ? filas : filas.slice(0, A_LA_VISTA);
  const resto = filas.length - vistas.length;
  return (
    <div className="arch-tocados">
      {vistas.map((f, i) => {
        const nombre = nombreDeRuta(f.ruta);
        const rel = relativa(f.ruta, raiz);
        const carpeta = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        return (
          <button
            key={f.ruta}
            className="arch-toc"
            data-agente={f.marca}
            style={{ ["--i" as string]: i }}
            data-tip={rel}
            onClick={() => onAbrir(f.ruta)}
          >
            <span className="arch-ico" data-tipo={tipoDeArchivo(nombre)}>
              <IconoArchivo tipo={tipoDeArchivo(nombre)} />
            </span>
            {/* El nombre y la etiqueta se montan de nuevo cuando cambia la marca: el brillo y la entrada vuelven a correr. */}
            <span className="arch-nom" key={f.marca}>
              {nombre}
            </span>
            <span className="arch-toc-dir">{carpeta}</span>
            <Lineas mas={f.mas} menos={f.menos} />
            <span className="arch-etq" key={`etq-${f.marca}`}>
              {t(ETIQUETA[f.marca])}
            </span>
          </button>
        );
      })}
      {(resto > 0 || entera) && filas.length > A_LA_VISTA && (
        <button className="arch-toc-mas" onClick={() => setEntera((v) => !v)}>
          {entera ? t("Ver menos") : t("y {n} más", { n: resto })}
        </button>
      )}
      {fuera > 0 && <p className="arch-toc-fuera">{t("y {n} fuera de esta carpeta", { n: fuera })}</p>}
    </div>
  );
}

/** El pie del árbol: el commit que se está haciendo, o el que acaba de entrar. */
export function PieCommit({ resumen }: { resumen: Resumen }) {
  const { t } = useT();
  if (resumen.haciendoCommit) {
    return (
      <div className="arch-pie" data-que="haciendo" key="haciendo">
        <i className="arch-punto" />
        {t("haciendo commit…")}
      </div>
    );
  }
  if (!resumen.cierre) return null;
  return (
    <div className="arch-pie" data-que="hecho" key={resumen.cierre.hash} data-tip={resumen.cierre.asunto}>
      <i className="arch-punto" />
      {t("commit")} <b>{resumen.cierre.hash}</b>
    </div>
  );
}
