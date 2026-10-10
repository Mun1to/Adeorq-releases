import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import { latido } from "../lib/latido";
import type { Project } from "../lib/pty";
import {
  activarProgramado,
  borradorDe,
  borrarProgramado,
  cuandoEnTexto,
  cuandoFalta,
  DIAS,
  EVENTO_PROGRAMADOS,
  faltaEn,
  guardarProgramado,
  letraDia,
  listarProgramados,
  NOMBRE_DIA,
  pedidoDe,
  probarProgramado,
  proximaVez,
  rearmarProgramado,
  type Borrador,
  type EstadoProgramados,
  type Programado,
} from "../lib/programados";

// Los encargos programados: «cada lunes a las 9, esto».
//
// Es un modo de la Agenda y no una pestaña nueva, porque es lo mismo que el
// resto de la Agenda: lo que viene y cuándo. Lo que se ve aquí lo decide Rust
// (`programados.rs`): esta pantalla escribe encargos y enseña cómo les fue,
// pero no lanza ninguno ni lleva la cuenta de los fallos.
//
// Una fila dice cuatro cosas, en este orden: qué es, cuándo toca, cuándo es la
// próxima vez y cómo fueron las tres últimas. Y si el freno lo paró, por qué.

/** La lista, al día: se lee al montar y cada vez que Rust avisa de un cambio.
    La usa también la portada de la Agenda, para su cifra. */
export function useProgramados(): [EstadoProgramados | null, (e: EstadoProgramados) => void] {
  const [estado, setEstado] = useState<EstadoProgramados | null>(null);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      listarProgramados()
        .then((e) => vivo && setEstado(e))
        .catch(() => {});
    leer();
    const quitar = listen(EVENTO_PROGRAMADOS, leer);
    return () => {
      vivo = false;
      void quitar.then((f) => f()).catch(() => {});
    };
  }, []);
  return [estado, setEstado];
}

/** «Adeorq», de `C:\proyectos\Adeorq`. */
function carpeta(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
}

interface FormProps {
  b: Borrador;
  proyectos: Project[];
  error: string;
  guardando: boolean;
  onChange: (b: Borrador) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}

function Formulario({ b, proyectos, error, guardando, onChange, onGuardar, onCancelar }: FormProps) {
  const { t } = useT();
  const falta = faltaEn(b);
  const dia = (d: number) =>
    onChange({ ...b, dias: b.dias.includes(d) ? b.dias.filter((x) => x !== d) : [...b.dias, d] });
  // La carpeta de uno que se edita puede no ser ya un proyecto de la lista
  // (se movió, se quitó): se enseña igual, para no cambiársela sin decirlo.
  const fuera = b.cwd && !proyectos.some((p) => p.path === b.cwd);

  return (
    <div className="prog-form">
      <textarea
        className="finder prog-encargo-in"
        autoFocus
        rows={4}
        placeholder={t("Qué tiene que hacer. Por ejemplo: revisa las dependencias y dime cuáles tienen versión nueva.")}
        value={b.encargo}
        onChange={(e) => onChange({ ...b, encargo: e.currentTarget.value })}
      />
      <div className="prog-campos">
        <label className="prog-campo">
          <span>{t("En el proyecto")}</span>
          <select className="finder" value={b.cwd} onChange={(e) => onChange({ ...b, cwd: e.currentTarget.value })}>
            {!b.cwd && <option value="">{t("elige un proyecto")}</option>}
            {fuera && <option value={b.cwd}>{carpeta(b.cwd)}</option>}
            {proyectos.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="prog-campo">
          <span>{t("Nombre (opcional)")}</span>
          <input
            className="finder"
            value={b.nombre}
            maxLength={60}
            onChange={(e) => onChange({ ...b, nombre: e.currentTarget.value })}
          />
        </label>
      </div>

      <div className="prog-cuando-in">
        <div className="prog-tipos" role="radiogroup">
          <button className="mini" role="radio" aria-checked={b.tipo === "semanal"} data-on={b.tipo === "semanal"} onClick={() => onChange({ ...b, tipo: "semanal" })}>
            {t("Días y hora")}
          </button>
          <button className="mini" role="radio" aria-checked={b.tipo === "cada"} data-on={b.tipo === "cada"} onClick={() => onChange({ ...b, tipo: "cada" })}>
            {t("Cada N horas")}
          </button>
        </div>
        {b.tipo === "semanal" ? (
          <div className="prog-semana">
            {DIAS.map((d) => (
              <button
                key={d}
                className="prog-dia"
                data-dia={d}
                data-on={b.dias.includes(d)}
                aria-pressed={b.dias.includes(d)}
                data-tip={t(NOMBRE_DIA[d])}
                onClick={() => dia(d)}
              >
                {letraDia(d, t)}
              </button>
            ))}
            <span className="prog-a-las">{t("a las")}</span>
            <input
              className="finder prog-hora"
              type="time"
              value={b.hora}
              onChange={(e) => onChange({ ...b, hora: e.currentTarget.value })}
            />
          </div>
        ) : (
          <div className="prog-semana">
            <span className="prog-a-las">{t("cada")}</span>
            <input
              className="finder prog-horas"
              type="number"
              min={1}
              max={168}
              value={Number.isFinite(b.horas) ? b.horas : ""}
              onChange={(e) => onChange({ ...b, horas: e.currentTarget.valueAsNumber })}
            />
            <span className="prog-a-las">{t("horas")}</span>
          </div>
        )}
      </div>

      {error && <p className="np-err">{error}</p>}
      <div className="prog-botones">
        <span className="prog-falta">{falta ? t(falta) : ""}</span>
        <button className="mini" onClick={() => onCancelar()}>
          {t("Cancelar")}
        </button>
        <button className="np-btn" data-guardar disabled={!!falta || guardando} onClick={() => onGuardar()}>
          {t("Guardar")}
        </button>
      </div>
    </div>
  );
}

interface Props {
  proyectos: Project[];
  /** La carpeta del proyecto que se estaba mirando en la Agenda, si había. */
  cwdInicial: string;
  estado: EstadoProgramados | null;
  onEstado: (e: EstadoProgramados) => void;
}

export default function AgendaProgramados({ proyectos, cwdInicial, estado, onEstado }: Props) {
  const { t, lang } = useT();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [seguro, setSeguro] = useState("");
  // La hora de pintar «la próxima vez»: se refresca sola, que una fila que dice
  // «hoy a las 9» a las 9 y media está mintiendo.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => latido(() => setAhora(new Date()), 30_000), []);

  /** Una acción sobre un encargo: lo que conteste Rust es la lista nueva. */
  const hacer = useCallback(
    (id: string, que: () => Promise<EstadoProgramados>) => {
      setOcupado(id);
      setError("");
      que()
        .then((e) => onEstado(e))
        .catch((e) => setError(String(e)))
        .finally(() => setOcupado(""));
    },
    [onEstado],
  );

  const guardar = () => {
    if (!borrador) return;
    setOcupado("form");
    setError("");
    guardarProgramado(pedidoDe(borrador))
      .then((e) => {
        onEstado(e);
        setBorrador(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setOcupado(""));
  };

  /** Borrar pide dos clics: el primero pregunta, y la pregunta caduca sola. */
  const borrar = (id: string) => {
    if (seguro !== id) {
      setSeguro(id);
      window.setTimeout(() => setSeguro((s) => (s === id ? "" : s)), 3500);
      return;
    }
    setSeguro("");
    hacer(id, () => borrarProgramado(id));
  };

  if (!estado) return null;
  const fecha = (ms: number) =>
    new Date(ms).toLocaleString(lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const RESULTADO = { hecho: t("terminó"), fallo: t("falló"), saltado: t("no se lanzó") };

  return (
    <section className="panel-card agenda-card prog">
      <p className="card-hint prog-que">
        {t(
          "Un encargo programado abre él solo una sesión de Claude con lo que le dejes escrito, los días y a la hora que digas. Si falla tres veces seguidas se para y te avisa, en vez de insistir.",
        )}
      </p>
      {!estado.puede && (
        <p className="prog-aviso" data-aviso="sistema">
          {t("En este sistema todavía no se lanzan solos: por ahora, solo en Windows. Puedes dejarlos escritos.")}
        </p>
      )}
      {estado.puede && !estado.reloj && (
        <p className="prog-aviso" data-aviso="reloj">
          {t("En esta ventana el reloj está parado (es la de desarrollo): se lanzan desde la Adeorq instalada, o con «Probar ahora».")}
        </p>
      )}

      {borrador ? (
        <Formulario
          b={borrador}
          proyectos={proyectos}
          error={error}
          guardando={ocupado === "form"}
          onChange={setBorrador}
          onGuardar={guardar}
          onCancelar={() => {
            setBorrador(null);
            setError("");
          }}
        />
      ) : (
        <button className="np-btn prog-nuevo" data-nuevo onClick={() => setBorrador(borradorDe(null, cwdInicial))}>
          + {t("Nuevo encargo programado")}
        </button>
      )}
      {!borrador && error && <p className="np-err">{error}</p>}

      {estado.encargos.length === 0 && !borrador && <p className="prog-vacio">{t("Todavía no hay ninguno.")}</p>}

      <ul className="prog-lista">
        {estado.encargos.map((e: Programado) => {
          const proxima = proximaVez(e, ahora);
          const que = e.cortado ? "cortado" : e.activo ? "activo" : "pausado";
          return (
            <li key={e.id} className="prog-fila" data-programado={e.id} data-estado={que}>
              <div className="prog-cab">
                <strong className="prog-nombre">{e.nombre}</strong>
                <span className="prog-cuando">{cuandoEnTexto(e.cuando, t)}</span>
                <span className="prog-ultimas">
                  {e.ultimas.map((u, i) => (
                    <i
                      key={`${u.cuando}-${i}`}
                      data-r={u.resultado}
                      data-tip={`${fecha(u.cuando)} · ${RESULTADO[u.resultado]}${u.detalle ? `: ${u.detalle}` : ""}`}
                    />
                  ))}
                </span>
              </div>
              <p className="prog-encargo stream-hide">{e.encargo.split("\n")[0]}</p>
              <p className="prog-pie">
                <span className="stream-hide">{carpeta(e.cwd)}</span>
                <span className="prog-proxima">
                  {e.cortado
                    ? t("parado por el freno")
                    : !e.activo
                      ? t("en pausa")
                      : proxima
                        ? t("próxima vez: {c}", { c: cuandoFalta(proxima, ahora, t) })
                        : ""}
                </span>
              </p>
              {e.cortado && (
                <p className="prog-corte">
                  {t("Falló tres veces seguidas y no se lanza más hasta que lo rearmes. La última: {m}", { m: e.cortado.motivo })}
                </p>
              )}
              <div className="prog-acciones">
                {e.cortado && (
                  <button className="mini" data-rearmar disabled={ocupado === e.id} onClick={() => hacer(e.id, () => rearmarProgramado(e.id))}>
                    {t("Rearmar")}
                  </button>
                )}
                <button
                  className="mini"
                  data-probar
                  disabled={ocupado === e.id}
                  data-tip={t("Lo lanza ya, sin esperar a su hora y sin gastar el turno de hoy")}
                  onClick={() => hacer(e.id, () => probarProgramado(e.id))}
                >
                  {t("Probar ahora")}
                </button>
                <button className="mini" data-pausa disabled={ocupado === e.id} onClick={() => hacer(e.id, () => activarProgramado(e.id, !e.activo))}>
                  {e.activo ? t("Pausar") : t("Reanudar")}
                </button>
                <button
                  className="mini"
                  data-editar
                  onClick={() => {
                    setError("");
                    setBorrador(borradorDe(e, cwdInicial));
                  }}
                >
                  {t("Editar")}
                </button>
                <button className="mini" data-borrar data-seguro={seguro === e.id} onClick={() => borrar(e.id)}>
                  {seguro === e.id ? t("¿Borrarlo?") : t("Borrar")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
