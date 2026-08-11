// La primera vez que se abre Adeorq.
//
// No es una bienvenida decorativa: son las cuatro respuestas sin las cuales la
// app no puede funcionar en un ordenador que no sea el de quien la escribió.
// Dónde viven tus proyectos era una constante dentro de Rust, así que una
// instalación nueva enseñaba un panel vacío y ni un sitio donde arreglarlo.
//
// Cada paso hace algo de verdad en cuanto lo contestas: la carpeta se guarda y
// se cuentan los proyectos que hay dentro, los clientes se detectan en el PATH,
// el tema se aplica a la ventana mientras lo eliges. Nada de recoger respuestas
// para usarlas al final, que es como se cuelan los formularios que mienten.

import { useEffect, useMemo, useState } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { detectClis, listProjects } from "../lib/pty";
import { fijarRaiz, leerPerfil, raizPorDefecto, tocarPerfil, type Perfil } from "../lib/perfil";
import { PROVIDERS, providerOf } from "../lib/providers";
import { THEMES, useT, type Lang, type ThemeId } from "../lib/i18n";
import ProviderMark from "./ProviderMark";
import { ChevronIcon } from "./Icons";

interface Props {
  lang: Lang;
  theme: ThemeId;
  onLang: (l: Lang) => void;
  onTheme: (t: ThemeId) => void;
  /** Terminado: `tour` dice si quiere ver el recorrido a continuación. */
  onDone: (tour: boolean) => void;
}

type Paso = 0 | 1 | 2 | 3 | 4;
const ULTIMO: Paso = 4;

export default function Onboarding({ lang, theme, onLang, onTheme, onDone }: Props) {
  const { t } = useT();
  const [paso, setPaso] = useState<Paso>(0);
  const [perfil, setPerfil] = useState<Perfil>(() => leerPerfil());
  /** Cuántos proyectos hay en la carpeta elegida. null = aún sin mirar. */
  const [cuantos, setCuantos] = useState<number | null>(null);
  const [errorRaiz, setErrorRaiz] = useState<string | null>(null);
  const [instalados, setInstalados] = useState<string[]>([]);

  const cambiar = (c: Partial<Perfil>) => setPerfil(tocarPerfil(c));

  // La carpeta que Rust usaría si nadie dijera nada: es la propuesta, y en la
  // máquina de Munir sigue siendo C:\proyectos.
  useEffect(() => {
    // Quien ya dijo que no tiene carpeta madre no recibe una propuesta: la
    // bienvenida se puede repetir desde Ajustes y volvería a colársela.
    if (perfil.sinRaiz) return;
    if (perfil.raiz) {
      void contar(perfil.raiz);
      return;
    }
    raizPorDefecto()
      .then((r) => {
        cambiar({ raiz: r });
        void contar(r);
      })
      .catch(() => {});
    // Solo al abrir: después manda lo que el usuario elija.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    detectClis(PROVIDERS.map((p) => [p.id, p.exe] as [string, string]))
      .then((found) => {
        const ids = found.map((c) => c.id);
        setInstalados(ids);
        // Lo instalado es la propuesta: nadie quiere marcar a mano lo que la
        // app ya ve en su ordenador.
        if (!leerPerfil().clis.length && ids.length) cambiar({ clis: ids });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function contar(dir: string) {
    try {
      await fijarRaiz(dir);
      setErrorRaiz(null);
      const list = await listProjects();
      setCuantos(list.length);
    } catch (e) {
      setErrorRaiz(String(e));
      setCuantos(null);
    }
  }

  const elegirCarpeta = () => {
    void pickFolder({
      directory: true,
      defaultPath: perfil.raiz || undefined,
      title: t("Dónde viven tus proyectos"),
    })
      .then((path) => {
        if (typeof path !== "string") return;
        cambiar({ raiz: path, sinRaiz: false });
        setCuantos(null);
        void contar(path);
      })
      .catch((e) => setErrorRaiz(String(e)));
  };

  /** No todo el mundo tiene sus repositorios en una sola carpeta, y forzarle a
      señalar una acababa metiéndole Descargas y Escritorio en el panel. Se
      entra sin nada y se van añadiendo proyectos de donde estén. */
  const sinCarpeta = () => {
    cambiar({ sinRaiz: true, raiz: "" });
    setErrorRaiz(null);
    setCuantos(null);
  };

  const alternarCli = (id: string) => {
    const s = new Set(perfil.clis);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    cambiar({ clis: [...s] });
  };

  const terminar = (tour: boolean) => {
    cambiar({ hecho: true, tour: !tour ? leerPerfil().tour : false });
    onDone(tour);
  };

  const nombre = perfil.nombre.trim();

  // El paso 0 no se puede pasar sin nombre: es lo único que se le pide de
  // verdad, y sin él el panel seguiría saludando a otro.
  const puedeSeguir = useMemo(() => {
    if (paso === 0) return nombre.length > 0;
    if (paso === 1) return perfil.sinRaiz || (!!perfil.raiz && !errorRaiz);
    return true;
  }, [paso, nombre, perfil.raiz, perfil.sinRaiz, errorRaiz]);

  return (
    <div className="onb-velo">
      <div className="onb">
        <header className="onb-head">
          <h2 className="onb-tit">
            {paso === 0
              ? t("Bienvenido a Adeorq")
              : paso === 1
                ? t("Dónde viven tus proyectos")
                : paso === 2
                  ? t("Tus agentes")
                  : paso === 3
                    ? t("El aspecto")
                    : t("Listo")}
          </h2>
          <div className="onb-pips">
            {([0, 1, 2, 3, 4] as Paso[]).map((n) => (
              <span key={n} className="onb-pip" data-on={n <= paso} />
            ))}
          </div>
        </header>

        <div className="onb-cuerpo">
          {paso === 0 && (
            <>
              <p className="onb-txt">
                {t(
                  "Un panel para trabajar con agentes de IA por terminales de verdad, con tus proyectos a un clic. Cuatro preguntas y entras.",
                )}
              </p>
              <label className="onb-campo">
                <span>{t("¿Cómo te llamas?")}</span>
                <input
                  className="finder"
                  autoFocus
                  value={perfil.nombre}
                  placeholder={t("Tu nombre")}
                  onChange={(e) => cambiar({ nombre: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nombre) setPaso(1);
                  }}
                />
              </label>
              <div className="onb-idioma">
                <span className="onb-eti">{t("Idioma")}</span>
                <button className="mini" data-on={lang === "es"} onClick={() => onLang("es")}>
                  Español
                </button>
                <button className="mini" data-on={lang === "en"} onClick={() => onLang("en")}>
                  English
                </button>
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <p className="onb-txt">
                {t(
                  "Si tienes tus repositorios juntos en una carpeta, señálala y cada subcarpeta suya será un proyecto del panel. Si no los tienes así, entra sin carpeta y añade luego los que quieras, estén donde estén.",
                )}
              </p>
              <div className="onb-ruta" data-off={perfil.sinRaiz || undefined}>
                <code>{perfil.sinRaiz ? t("sin carpeta de proyectos") : perfil.raiz || "…"}</code>
                <button className="mini" onClick={elegirCarpeta}>
                  {perfil.sinRaiz ? t("Elegir una carpeta") : t("Elegir carpeta")}
                </button>
              </div>
              {perfil.sinRaiz ? (
                <p className="onb-txt onb-flojo">
                  {t(
                    "Entras a una barra vacía y cada terminal que abras vive suelta, con su carpeta a la vista. Cuando una te importe, un botón la convierte en proyecto del panel.",
                  )}
                </p>
              ) : (
                <>
                  {errorRaiz ? (
                    <p className="onb-mal">{errorRaiz}</p>
                  ) : cuantos !== null ? (
                    <p className="onb-bien">
                      {cuantos === 1
                        ? t("Veo 1 proyecto ahí dentro.")
                        : t("Veo {n} proyectos ahí dentro.", { n: cuantos })}
                    </p>
                  ) : null}
                  {cuantos === 0 && (
                    <p className="onb-txt onb-flojo">
                      {t(
                        "Sin proyectos todavía. Puedes crear el primero desde el Panel, o elegir otra carpeta.",
                      )}
                    </p>
                  )}
                  <button className="mini onb-sinraiz" onClick={sinCarpeta}>
                    {t("No los tengo en una sola carpeta")}
                  </button>
                </>
              )}
            </>
          )}

          {paso === 2 && (
            <>
              <p className="onb-txt">
                {t(
                  "Estos son los que he encontrado instalados en tu ordenador. Marca los que uses: el Asistente no te mandará a uno que no usas.",
                )}
              </p>
              <div className="onb-clis">
                {PROVIDERS.map((p) => {
                  const hay = instalados.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className="onb-cli"
                      data-on={perfil.clis.includes(p.id)}
                      data-hay={hay}
                      onClick={() => alternarCli(p.id)}
                    >
                      <ProviderMark id={p.id} />
                      <span>{p.label}</span>
                      <small>{hay ? t("instalado") : t("no está")}</small>
                    </button>
                  );
                })}
              </div>
              <label className="onb-check">
                <input
                  type="checkbox"
                  checked={perfil.leerSesiones}
                  onChange={(e) => cambiar({ leerSesiones: e.currentTarget.checked })}
                />
                <span>
                  <strong>{t("Recoger las sesiones que ya tienes")}</strong>
                  <small>
                    {t(
                      "Lee el historial que Claude Code y Codex dejan en tu carpeta de usuario para enseñártelo agrupado por proyecto. Se lee de tu disco y no sale de aquí.",
                    )}
                  </small>
                </span>
              </label>
            </>
          )}

          {paso === 3 && (
            <>
              <p className="onb-txt">
                {t("Elige el color de la casa. Se cambia cuando quieras en Ajustes.")}
              </p>
              <div className="onb-temas">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    className="onb-tema"
                    data-on={theme === th.id}
                    data-theme={th.id}
                    onClick={() => onTheme(th.id)}
                  >
                    <span className="onb-tema-muestra" />
                    <span className="onb-tema-nom">{lang === "en" ? th.en : th.es}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {paso === ULTIMO && (
            <>
              <p className="onb-txt">
                {t("Todo listo, {n}.", { n: nombre })}{" "}
                {t(
                  "Ahora te enseño lo que hay dentro en un minuto: es la parte que a nadie le apetece leer en la guía.",
                )}
              </p>
              <ul className="onb-resumen">
                <li>
                  <b>{t("Proyectos")}</b>
                  <span>
                    {perfil.sinRaiz ? t("sueltos, los vas añadiendo tú") : perfil.raiz}
                  </span>
                </li>
                <li>
                  <b>{t("Clientes")}</b>
                  <span>
                    {perfil.clis.length
                      ? perfil.clis.map((c) => providerOf(c).label).join(", ")
                      : t("ninguno marcado")}
                  </span>
                </li>
                <li>
                  <b>{t("Sesiones")}</b>
                  <span>
                    {perfil.leerSesiones ? t("se recogen las que ya tienes") : t("no se leen")}
                  </span>
                </li>
              </ul>
            </>
          )}
        </div>

        <footer className="onb-pie">
          <button className="mini onb-saltar" onClick={() => terminar(false)}>
            {t("Saltar")}
          </button>
          <div className="onb-nav">
            {paso > 0 && (
              <button className="mini volver" onClick={() => setPaso((p) => (p - 1) as Paso)}>
                <ChevronIcon size={13} izq />
                {t("Atrás")}
              </button>
            )}
            {paso < ULTIMO ? (
              <button
                className="np-btn"
                disabled={!puedeSeguir}
                onClick={() => setPaso((p) => (p + 1) as Paso)}
              >
                {t("Seguir")}
              </button>
            ) : (
              <>
                <button className="mini" onClick={() => terminar(false)}>
                  {t("Entrar directamente")}
                </button>
                <button className="np-btn" onClick={() => terminar(true)}>
                  {t("Enséñame las funciones")}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
