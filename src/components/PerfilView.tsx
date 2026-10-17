import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { DEL_PERFIL, type View } from "../lib/vistas";
import { seVe, type Parte } from "../lib/partes";
import { fotoDesdeArchivo, limpiarArroba, tocarYo, useYo } from "../lib/perfil";
import { listSkills, nombreDeCuenta, type Account } from "../lib/pty";
import { fotoRapida } from "../lib/mundo";
import { limitesDe, loQueTePara } from "../lib/cuota";
import { providerOf } from "../lib/providers";
import { useDiaDeHoy } from "../lib/goals";
import { boveda, memoriaVaults } from "../lib/memoria";
import { useT, type Translate } from "../lib/i18n";
import IconoPestana from "./IconoPestana";
import { ProfileIcon } from "./Icons";
import Espera from "./Espera";

// El Perfil: una sola página que baja (Munir, 2026-10-17, «A3»): «tu tarjeta
// arriba y debajo un resumen de cada sección con su cifra; al tocar una, se
// abre en grande». Se tragó cuatro pestañas de la cabecera (Cuentas, Agenda,
// Memoria y Comandos, ver `lib/vistas.ts`), pero sus pantallas NO se
// reescriben: al tocar un resumen se abre la de siempre, la misma que monta
// `App.tsx`, y encima de ella la vuelta al Perfil (`VueltaAlPerfil`).
//
// Por eso este componente se monta también estando en una de las cuatro: ahí
// solo pinta la vuelta, que queda en la columna de la app justo encima de la
// pantalla de la sección.

// Las dos piezas que llevan otras sesiones a la vez que esta: la tarjeta para
// compartir (el panel 1) y tu uso con sus calendarios («Perfil: tu uso»). Se
// montan solas en cuanto existe su archivo; con las dos ya hechas, esto vuelve
// a ser un `import` normal.
//
// La tarjeta NO es una sección de la página (Munir, 2026-10-17: «no sé por qué
// es una sección más»): es una ventana encima de todo, con el fondo atenuado,
// que abre el botón de compartir de tu uso con el evento `adeorq:abrir-tarjeta`.
// Hasta entonces no pinta nada. Va FUERA de `.panel`, que es `relative` con su
// propio `z-index`: dentro, lo flotante de la app le quedaría por encima.
const piezas = import.meta.glob<{ default: ComponentType<{ cuentas: Account[] }> }>("./Perfil{Tarjeta,Uso}.tsx");
const pieza = (n: string) => (piezas[n] ? lazy(piezas[n]) : null);
const PerfilTarjeta = pieza("./PerfilTarjeta.tsx");
const PerfilUso = pieza("./PerfilUso.tsx");

interface Props {
  /** «perfil», o la sección que está abierta. */
  vista: View;
  irA: (v: View) => void;
  /** Las cuentas que publican su gasto (`cuentasDeUso` de `App.tsx`). */
  cuentas: Account[];
  apagadas: Parte[];
}

export default function PerfilView({ vista, irA, cuentas, apagadas }: Props) {
  const { t } = useT();
  if (vista !== "perfil") return <VueltaAlPerfil vista={vista} irA={irA} t={t} />;
  // Con la Memoria apagada en Ajustes su resumen no sale: apagar es apagar
  // entera (`docs/contexto/partes.md`), y una cifra suya sería leer su bóveda.
  const secciones = DEL_PERFIL.filter((s) => s.key !== "memoria" || seVe("memoria", apagadas, { cabina: 0, lienzo: 0 }));
  return (
    <>
      <div className="panel perfil">
        {/* La 4 (Munir, 2026-10-17): tu nombre y tus secciones en una misma
            fila, y tu uso debajo a todo lo ancho. */}
        <Tu t={t} />
        <section className="perfil-secciones" aria-label={t("Tus secciones")}>
          {secciones.map((s) => (
            <button key={s.key} className="perfil-seccion" data-seccion={s.key} onClick={() => irA(s.key)}>
              <span className="perfil-seccion-cab">
                <IconoPestana vista={s.key} />
                {t(s.label)}
                <span className="perfil-seccion-ir" aria-hidden="true">›</span>
              </span>
              {s.key === "cuentas" && <ResumenCuentas cuentas={cuentas} t={t} />}
              {s.key === "agenda" && <ResumenAgenda t={t} />}
              {s.key === "memoria" && <ResumenMemoria t={t} />}
              {s.key === "comandos" && <ResumenComandos t={t} />}
            </button>
          ))}
        </section>
        <Suspense fallback={null}>{PerfilUso && <PerfilUso cuentas={cuentas} />}</Suspense>
      </div>
      <Suspense fallback={null}>{PerfilTarjeta && <PerfilTarjeta cuentas={cuentas} />}</Suspense>
    </>
  );
}

/** «‹ Perfil › Agenda», encima de la pantalla de la sección. */
function VueltaAlPerfil({ vista, irA, t }: { vista: View; irA: (v: View) => void; t: Translate }) {
  const aqui = DEL_PERFIL.find((s) => s.key === vista);
  return (
    <nav className="perfil-volver" aria-label={t("Dónde estás")}>
      <button className="perfil-volver-btn" onClick={() => irA("perfil")}>
        <span aria-hidden="true">‹</span> {t("Perfil")}
      </button>
      {aqui && <span className="perfil-volver-aqui">{t(aqui.label)}</span>}
    </nav>
  );
}

/** Tu foto, tu nombre y tu @. Se cambian aquí mismo: la tarjeta lee lo mismo. */
function Tu({ t }: { t: Translate }) {
  const yo = useYo();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(yo.nombre);
  const [arroba, setArroba] = useState(yo.arroba);
  const [error, setError] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  const editar = () => {
    setNombre(yo.nombre);
    setArroba(yo.arroba);
    setEditando(true);
  };
  const guardar = () => {
    tocarYo({ nombre, arroba });
    setEditando(false);
  };
  const elegirFoto = (f: File | undefined) => {
    if (!f) return;
    setError("");
    fotoDesdeArchivo(f)
      .then((foto) => tocarYo({ foto }))
      .catch(() => setError(t("Esa imagen no se ha podido abrir.")));
  };
  return (
    <header className="panel-hero perfil-tu">
      {/* Sin foto, el icono suelto: una inicial dentro de un círculo tintado es
          una cárcel (Munir, 2026-10-17: «hasta los cojones de las cárceles»). */}
      <button className="perfil-foto" data-tip={t("Cambiar la foto")} aria-label={t("Cambiar la foto")} onClick={() => archivo.current?.click()}>
        {yo.foto ? <img src={yo.foto} alt="" /> : <ProfileIcon size={64} />}
      </button>
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          elegirFoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {editando ? (
        <form
          className="perfil-quien perfil-editando"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <input className="perfil-campo perfil-campo-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Tu nombre")} aria-label={t("Tu nombre")} autoFocus />
          <label className="perfil-campo-arroba">
            <span aria-hidden="true">@</span>
            <input className="perfil-campo" value={arroba} onChange={(e) => setArroba(limpiarArroba(e.target.value))} placeholder={t("tu_usuario")} aria-label={t("Tu @")} />
          </label>
          <span className="perfil-botones">
            <button type="submit" className="perfil-texto" data-principal="">{t("Guardar")}</button>
            <button type="button" className="perfil-texto" onClick={() => setEditando(false)}>{t("Cancelar")}</button>
            {yo.foto && <button type="button" className="perfil-texto" onClick={() => tocarYo({ foto: "" })}>{t("Quitar la foto")}</button>}
          </span>
        </form>
      ) : (
        <div className="perfil-quien">
          <h1>{yo.nombre || t("Tu perfil")}</h1>
          {yo.arroba ? <p className="perfil-arroba">@{yo.arroba}</p> : <p className="perfil-arroba perfil-falta">{t("Sin @ todavía")}</p>}
          <button className="perfil-texto perfil-editar" onClick={() => editar()}>{t("Editar")}</button>
        </div>
      )}
      {error && <p className="perfil-error" role="alert">{error}</p>}
    </header>
  );
}

/** Lo que cabe en un resumen, igual para los cuatro: la cifra, qué es, y unas
    filas de detalle. */
function Cifra({ n, que, cargando, t }: { n: number | null; que: string; cargando: boolean; t: Translate }) {
  return (
    <span className="perfil-cifra">
      {n === null ? <Espera activo={cargando} como="span">{t("Leyendo…")}</Espera> : <b>{n.toLocaleString()}</b>}
      {n !== null && <span>{que}</span>}
    </span>
  );
}

interface FilaCuenta {
  clave: string;
  nombre: string;
  /** Lo gastado de la ventana que más aprieta; null si su cliente no lo dice. */
  pct: number | null;
}

/** Cuentas: las conectadas y cuánto llevan de su límite. */
function ResumenCuentas({ cuentas, t }: { cuentas: Account[]; t: Translate }) {
  const [filas, setFilas] = useState<FilaCuenta[] | null>(null);
  useEffect(() => {
    let vivo = true;
    fotoRapida(cuentas, 2500)
      .then((vivas) => {
        const conectadas = cuentas.filter((c) => vivas.some((v) => v.cuenta.id === c.id && v.instalado && v.conectada));
        const base = conectadas.map((c) => ({
          clave: `${c.provider}|${c.dir}`,
          nombre: `${providerOf(c.provider).label} · ${nombreDeCuenta(c.label, t)}`,
          pct: null as number | null,
        }));
        if (vivo) setFilas(base);
        conectadas.forEach((c, i) => {
          limitesDe(c)
            .then((l) => vivo && setFilas((prev) => prev && prev.map((f, j) => (j === i ? { ...f, pct: loQueTePara(l).percent } : f))))
            .catch(() => {});
        });
      })
      .catch(() => vivo && setFilas([]));
    return () => {
      vivo = false;
    };
  }, [cuentas, t]);

  const orden = filas ? [...filas].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)) : [];
  return (
    <>
      <Cifra n={filas ? filas.length : null} que={filas?.length === 1 ? t("conectada") : t("conectadas")} cargando={!filas} t={t} />
      {filas && filas.length === 0 && <span className="perfil-linea">{t("Ninguna con sesión abierta")}</span>}
      <span className="perfil-filas">
        {orden.slice(0, 3).map((f) => (
          <span key={f.clave} className="perfil-fila">
            <span className="perfil-fila-nombre">{f.nombre}</span>
            {f.pct === null ? (
              <span className="perfil-fila-dato">{t("sin cifra")}</span>
            ) : (
              <>
                <span className="perfil-barra" data-tono={f.pct >= 90 ? "mal" : f.pct >= 78 ? "alto" : "bien"}>
                  <i style={{ width: `${Math.min(100, f.pct)}%` }} />
                </span>
                <span className="perfil-fila-dato">{Math.round(f.pct)} %</span>
              </>
            )}
          </span>
        ))}
      </span>
    </>
  );
}

/** Agenda: lo de hoy, que son tus objetivos del día. */
function ResumenAgenda({ t }: { t: Translate }) {
  const dia = useDiaDeHoy();
  const hechos = dia ? dia.goals.filter((g) => g.done).length : 0;
  const pendientes = dia ? dia.goals.filter((g) => !g.done) : [];
  return (
    <>
      <Cifra n={dia ? pendientes.length : null} que={pendientes.length === 1 ? t("pendiente hoy") : t("pendientes hoy")} cargando={!dia} t={t} />
      {dia && dia.goals.length === 0 && <span className="perfil-linea">{t("Nada apuntado para hoy")}</span>}
      {dia && hechos > 0 && <span className="perfil-linea">{t(hechos === 1 ? "{n} hecho" : "{n} hechos", { n: hechos })}</span>}
      <span className="perfil-filas">
        {pendientes.slice(0, 3).map((g) => (
          <span key={g.idx} className="perfil-fila">
            <span className="perfil-fila-nombre">{g.text}</span>
          </span>
        ))}
      </span>
    </>
  );
}

/** Memoria: tus notas, contadas en la bóveda que usa la pestaña. */
function ResumenMemoria({ t }: { t: Translate }) {
  const [info, setInfo] = useState<{ nombre: string; docs: number } | null | "nada">(null);
  useEffect(() => {
    let vivo = true;
    const elegida = boveda();
    memoriaVaults()
      .then((vs) => {
        const v = vs.find((x) => x.path === elegida) ?? vs.find((x) => x.abierta) ?? vs[0];
        if (vivo) setInfo(v ? { nombre: v.name, docs: v.docs } : "nada");
      })
      .catch(() => vivo && setInfo("nada"));
    return () => {
      vivo = false;
    };
  }, []);
  if (info === "nada") return <span className="perfil-linea">{t("Sin bóveda todavía")}</span>;
  return (
    <>
      <Cifra n={info ? info.docs : null} que={t("notas")} cargando={!info} t={t} />
      {info && <span className="perfil-linea">{info.nombre}</span>}
    </>
  );
}

/** Comandos: los tuyos, que son tus skills. */
function ResumenComandos({ t }: { t: Translate }) {
  const [nombres, setNombres] = useState<string[] | null>(null);
  useEffect(() => {
    let vivo = true;
    listSkills()
      .then((s) => vivo && setNombres(s.map((x) => x.invocation)))
      .catch(() => vivo && setNombres([]));
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      <Cifra n={nombres ? nombres.length : null} que={nombres?.length === 1 ? t("skill tuya") : t("skills tuyas")} cargando={!nombres} t={t} />
      {/* Sueltas, en una línea: cada una en su píldora eran seis cárceles. */}
      {nombres && nombres.length > 0 && <span className="perfil-linea perfil-skills">{nombres.slice(0, 8).join("  ·  ")}</span>}
    </>
  );
}
