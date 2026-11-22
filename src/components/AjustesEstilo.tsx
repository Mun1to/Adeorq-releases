// Ajustes › Aspecto › Estilo: la forma de toda la app (Cristal, Terminal,
// Consola, Liso). El estilo es la forma y el tema, el color: por eso esta
// tarjeta va justo encima de «Tema». Nació para quien llega de otra terminal y
// juzga por la primera foto (2026-11-21); Munir pidió varios, familiares para
// quien viene de otro sitio, y el cristal de fábrica. Las reglas, en
// `lib/aspecto.ts` y `estilos/42-aspectos.css`.

import { useState } from "react";
import { useT } from "../lib/i18n";
import { guardarAspecto, prefAspecto, type Aspecto } from "../lib/aspecto";

/** Los cuatro, con lo que es cada uno. El cristal va el primero porque es el de
    fábrica; los otros tres, del más de terminal al más de editor. */
const ESTILOS: Array<[Aspecto, string, string]> = [
  ["cristal", "Cristal", "El de fábrica: tu foto detrás y cada terminal en su caja de cristal."],
  [
    "terminal",
    "Terminal",
    "Como una terminal de las de siempre: un solo fondo liso de lado a lado, las terminales pegadas con una raya fina y sus botones al pasar el ratón.",
  ],
  [
    "consola",
    "Consola",
    "Como un multiplexor de terminales: toda la app en la letra de la terminal, y lo que dice quién es cada una baja a una barra al pie, la del foco en tu color.",
  ],
  [
    "liso",
    "Liso",
    "Como un editor de código: las piezas de siempre sin foto ni cristal, en el color de tu tema, y las terminales pegadas.",
  ],
];

/** El estilo elegido y cómo cambiarlo. Lo comparten esta tarjeta y la nota de
    «El fondo», que están en tarjetas distintas de la misma hoja. */
export function useAspecto(): [Aspecto, (a: Aspecto) => void] {
  const [aspecto, setAspecto] = useState<Aspecto>(() => prefAspecto());
  const elegir = (a: Aspecto) => {
    guardarAspecto(a);
    setAspecto(a);
  };
  return [aspecto, elegir];
}

interface Props {
  aspecto: Aspecto;
  elegir: (a: Aspecto) => void;
}

export default function AjustesEstilo({ aspecto, elegir }: Props) {
  const { t } = useT();
  const elegido = ESTILOS.find(([id]) => id === aspecto);
  return (
    <section className="panel-card">
      <h2>{t("Estilo")}</h2>
      <p className="card-hint">
        {t(
          "La forma de toda la app. El color sigue siendo el del tema que elijas debajo, en cualquiera de los cuatro.",
        )}
      </p>
      <div className="chip-row">
        {ESTILOS.map(([id, label]) => (
          <button key={id} className="choice" data-on={aspecto === id} onClick={() => elegir(id)}>
            {t(label)}
          </button>
        ))}
      </div>
      {/* Lo que es el elegido, escrito y no en un globo: con cuatro nombres
          cortos, el porqué de cada uno es lo que ayuda a elegir, y un globo solo
          lo ve quien ya sabe que está. */}
      {elegido && <p className="card-hint">{t(elegido[2])}</p>}
    </section>
  );
}

/** La línea de «El fondo» con un estilo liso: ahí la foto no se pinta, y sin
    esto elegir una parecería no hacer nada. */
export function NotaFondoEstilo({ aspecto, elegir }: Props) {
  const { t } = useT();
  const elegido = ESTILOS.find(([id]) => id === aspecto);
  if (aspecto === "cristal" || !elegido) return null;
  return (
    <p className="card-hint">
      {t("Con el estilo {e} la foto no se ve: ese estilo es liso a propósito. Se ve con Cristal.", {
        e: t(elegido[1]),
      })}{" "}
      <button className="mini" onClick={() => elegir("cristal")}>
        {t("Volver a Cristal")}
      </button>
    </p>
  );
}
