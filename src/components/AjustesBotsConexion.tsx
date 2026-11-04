// Ajustes › Bots › Conectar un bot: Hermes, OpenClaw y Grok Bot con las herramientas
// de Adeorq, cada uno con su permiso (decisión B3 de Munir, `docs/contexto/bots.md`).
// Enseña lo que va a escribir antes de escribirlo, el permiso se cambia aquí mismo y
// «Desconectar» deja de valer en el acto. Debajo, lo último que hizo, sin el texto:
// es lo primero que se mirará si algo va mal, también después de desconectarlo.
//
// La puerta está en Rust (`bots_conexion.rs`, `mcp_clientes.rs`).

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import {
  botsConectar,
  botsConectarVista,
  botsConexiones,
  botsDesconectar,
  botsNivel,
  horaDe,
  NIVELES,
  NOMBRE_DE_NIVEL,
  queHizo,
  QUE_HACE_EL_NIVEL,
  type FilaDeBot,
  type VistaDeConexion,
} from "../lib/botsConexion";
import Espera, { Ocupado } from "./Espera";

/** Cuántas cosas se enseñan de cada bot. */
const HECHOS_A_LA_VISTA = 5;

function Estado({ fila }: { fila: FilaDeBot }) {
  const { t } = useT();
  if (!fila.instalado) return <small className="bot-nota">{t("No está instalado en este equipo.")}</small>;
  if (!fila.conectado) {
    return fila.bot === "grok" ? (
      <small className="bot-nota">{t("Vive en la nube. Su app de escritorio ejecuta comandos en este equipo, y te pide permiso por cada uno.")}</small>
    ) : null;
  }
  if (fila.veces > 0) {
    const c = hace(fila.ultima_vez * 1000);
    return <small className="bot-nota">{t("Se conectó {cuando}", { cuando: t(c.clave, { n: c.valor }) })}</small>;
  }
  const pendiente: Record<string, string> = {
    hermes: "Hermes lo carga solo; si no, escribe /reload-mcp en su chat.",
    openclaw: "Arranca su Gateway para que lo vea.",
    grok: "Todavía no lo ha usado.",
  };
  return <small className="bot-nota">{t(pendiente[fila.bot] ?? "Todavía no lo ha usado.")}</small>;
}

function FilaBot({ fila, alCambiar }: { fila: FilaDeBot; alCambiar: (f: FilaDeBot[]) => void }) {
  const { t, lang } = useT();
  const [vista, setVista] = useState<VistaDeConexion | null>(null);
  const [ocupado, setOcupado] = useState<"mirando" | "escribiendo" | "quitando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  /** La línea para Grok Bot, con su clave: solo esta vez. */
  const [linea, setLinea] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const intentar = async (que: "mirando" | "escribiendo" | "quitando", f: () => Promise<void>) => {
    setOcupado(que);
    setError(null);
    setNota(null);
    try {
      await f();
    } catch (e) {
      setError(t(String(e)));
    } finally {
      setOcupado(null);
    }
  };

  const conectar = () =>
    intentar("escribiendo", async () => {
      const r = await botsConectar(fila.bot);
      setVista(null);
      setLinea(r.linea);
      setCopiada(false);
      if (r.copia) setNota(t("Listo. El archivo de antes quedó en {copia}", { copia: r.copia }));
      alCambiar(r.filas);
    });

  const pedirVista = () =>
    intentar("mirando", async () => {
      setVista(await botsConectarVista(fila.bot));
    });

  const desconectar = () =>
    intentar("quitando", async () => {
      const r = await botsDesconectar(fila.bot);
      setLinea(null);
      if (r.aviso) setNota(t("Ya no vale su clave. {aviso}", { aviso: t(r.aviso) }));
      alCambiar(r.filas);
    });

  const ponerNivel = (nivel: FilaDeBot["nivel"]) =>
    void botsNivel(fila.bot, nivel)
      .then(alCambiar)
      .catch((e) => setError(t(String(e))));

  const copiar = (texto: string) =>
    void navigator.clipboard.writeText(texto).then(
      () => setCopiada(true),
      () => setError(t("No pude copiarlo: selecciónalo a mano.")),
    );

  const esGrok = fila.bot === "grok";
  return (
    <div className="bot-conexion" data-bot={fila.bot}>
      <div className="bot-conexion-cab">
        <span className="mcp-cliente-quien">
          <b>{fila.nombre}</b>
          <Estado fila={fila} />
        </span>
        {fila.conectado ? (
          <button className="mini" disabled={ocupado !== null} onClick={() => void desconectar()}>
            <Ocupado activo={ocupado === "quitando"} mientras={t("Desconectando…")}>
              {t("Desconectar")}
            </Ocupado>
          </button>
        ) : (
          fila.instalado &&
          !vista && (
            <button className={esGrok ? "mini" : "np-btn"} disabled={ocupado !== null} onClick={() => void (esGrok ? conectar() : pedirVista())}>
              <Ocupado activo={ocupado !== null} mientras={t("Un momento…")}>
                {esGrok ? t("Darle una clave") : t("Conectar {bot}", { bot: fila.nombre })}
              </Ocupado>
            </button>
          )
        )}
      </div>

      {vista && (
        <div className="bot-vista">
          <p className="bot-nota">
            {vista.archivo
              ? t("Esto se escribe en {archivo}. Lo demás de ese archivo no se toca, y queda una copia al lado.", { archivo: vista.archivo })
              : t("Se lanza esta orden:")}
          </p>
          <pre className="bot-texto">{vista.texto}</pre>
          <div className="foreman-row">
            <button className="np-btn" disabled={ocupado !== null} onClick={() => void conectar()}>
              <Ocupado activo={ocupado === "escribiendo"} mientras={t("Escribiendo…")}>
                {t("Escribirlo")}
              </Ocupado>
            </button>
            <button className="mini" disabled={ocupado !== null} onClick={() => setVista(null)}>
              {t("Cancelar")}
            </button>
          </div>
        </div>
      )}

      {linea && (
        <div className="bot-vista">
          <p className="bot-nota">{t("Pega esto en tu Grok Bot. La línea lleva su clave: se queda en Grok Bot y, si la pegas en una consola, en su historial. Si se escapa, «Desconectar» la retira. Solo se enseña esta vez.")}</p>
          <pre className="bot-texto">{linea}</pre>
          <div className="foreman-row">
            <button className="np-btn" onClick={() => copiar(linea)}>
              {copiada ? t("Copiado") : t("Copiar")}
            </button>
            <button className="mini" onClick={() => setLinea(null)}>
              {t("Ya lo tengo")}
            </button>
          </div>
        </div>
      )}

      {fila.conectado && (
        <>
          <div className="chip-row bot-niveles">
            {NIVELES.map((n) => (
              <button key={n} className="choice" data-on={fila.nivel === n} onClick={() => ponerNivel(n)}>
                {t(NOMBRE_DE_NIVEL[n])}
              </button>
            ))}
          </div>
          <p className="bot-nota">{t(QUE_HACE_EL_NIVEL[fila.nivel])}</p>
          <p className="bot-frase">{t("Con «Manda sin preguntar», quien engañe al bot manda en tu ordenador.")}</p>
        </>
      )}

      {error && <p className="setting-line setting-bad">{error}</p>}
      {nota && <p className="bot-nota">{nota}</p>}

      {fila.hechos.length > 0 && (
        <ul className="bot-hechos">
          {fila.hechos.slice(0, HECHOS_A_LA_VISTA).map((h, i) => (
            <li key={`${h.cuando_ms}-${i}`}>
              <span className="bot-hora">{horaDe(h.cuando_ms, lang)}</span>
              {t(queHizo(h.herramienta))}
              {h.terminal != null && ` · ${t("terminal {n}", { n: h.terminal })}`}
              {h.fallo && <span className="setting-bad"> · {t("no pudo")}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AjustesBotsConexion() {
  const { t } = useT();
  const [filas, setFilas] = useState<FilaDeBot[] | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () =>
      void botsConexiones()
        .then((f) => {
          if (vivo) setFilas(f);
        })
        .catch(() => {});
    leer();
    // Lo que hace un bot se ve aquí sin salir y volver a entrar.
    const reloj = window.setInterval(leer, 6000);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, []);

  return (
    <section className="panel-card" data-sin-mods="">
      <h2>{t("Conectar un bot")}</h2>
      <p className="card-hint">
        {t("Le da a tu bot las herramientas de Adeorq, con su propio permiso. El chat con el bot (Telegram y demás) lo vinculas en el propio bot.")}
      </p>
      {filas ? (
        <div className="bot-conexiones">
          {filas.map((f) => (
            <FilaBot key={f.bot} fila={f} alCambiar={setFilas} />
          ))}
        </div>
      ) : (
        <Espera activo>{t("Leyendo tus bots…")}</Espera>
      )}
    </section>
  );
}
