// META 6: the account manager, now for every CLI Adeorq knows.
//
// One account = one config folder. Each CLI keeps its whole identity (login,
// history, settings) in a folder, and one environment variable moves it, so a
// terminal belongs to an account because its PTY was born with that variable.
// The variables live in lib/providers.ts, each one verified on this machine.
//
// What can be shown differs per CLI, and the screen says so instead of faking
// it: Claude hands out its limits for free through `/usage` (a local slash
// command, zero turns), and the others expose nothing local, so theirs read
// "signed in" or "not signed in" and nothing more.
//
// Streaming note: no emails, ever. An account is called whatever Munir types.
import OpenRouterCard from "./OpenRouterCard";
import ApiKeysCard from "./ApiKeysCard";
import { guardarAtajosProv, leerAtajosProv } from "../lib/atajosProveedor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Secciones from "./Secciones";
import {
  IconoAtajo,
  IconoCuentas,
  IconoDescargar,
  IconoLlave,
} from "./IconosSeccion";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  accountReady,
  detectClis,
  logoutAccount,
  skillsEstado,
  compartirSkills,
  dejarDeCompartirSkills,
  type EstadoSkills,
  mainAccount,
  planInfo,
  usageLimits,
  type Account,
  type Limits,
  type PlanInfo,
} from "../lib/pty";
import { PROVIDERS, providerOf, sabe, type Provider } from "../lib/providers";
import { useT } from "../lib/i18n";
import { initials } from "./ProjectAvatar";
import { propsDeVelo } from "../lib/velo";
import ProviderMark, { tieneMarca } from "./ProviderMark";
import {
  ChevronIcon,
  RefreshIcon,
} from "./Icons";

interface Info {
  plan: PlanInfo | null;
  limits: Limits | null;
  ready: boolean;
  error: string;
}

interface Props {
  accounts: Account[];
  defaultAccount: string;
  onAdd: (provider: Provider, label: string) => Promise<void>;
  onRename: (id: string, label: string) => void;
  onRemove: (account: Account) => void;
  onSetDefault: (id: string) => void;
  onTerminal: (account: Account) => void;
  /** Abre una terminal que lo descarga y, si al acabar ya se le puede llamar,
      lo arranca para que hagas el login ahí mismo. */
  onInstall: (provider: Provider) => void;
}

/** "Current week (all models)" does not fit a row. */
function shortLabel(label: string): string {
  const inside = label.match(/\(([^)]+)\)/)?.[1];
  if (/session/i.test(label)) return "sesión";
  if (inside && /all models/i.test(inside)) return "semana";
  if (inside) return `semana · ${inside}`;
  return label.replace(/^current\s+/i, "");
}

/** Lo que se puede poner en la fila de un proyecto: los CLIs que Adeorq sabe
    abrir, más la terminal pelada, que ya no está de fábrica pero puede volver
    si a alguien le sirve. Se listan aquí y no se sacan de PROVIDERS enteros
    porque no todos los de ese catálogo se abren en una terminal. */
const ATAJOS_POSIBLES: Array<{ id: string; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "agy", label: "Antigravity" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "Qwen" },
  { id: "copilot", label: "Copilot" },
  { id: "crush", label: "Crush" },
  { id: "shell", label: "PowerShell" },
];

/** El color de cada chip. PowerShell no es un proveedor de PROVIDERS, así que
    sin esto heredaría el naranja de Claude, que es a donde cae providerOf(). */
function tonoDe(id: string): string {
  return id === "shell" ? "#5391fe" : providerOf(id).hue;
}

/** Qué CLIs dejaste abiertos en esta pantalla. */
const ABIERTOS_KEY = "adeorq-cuentas-abiertos";

export default function AccountsView({
  accounts,
  defaultAccount,
  onAdd,
  onRename,
  onRemove,
  onSetDefault,
  onTerminal,
  onInstall,
}: Props) {
  const { t } = useT();
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  /**
   * Qué CLIs tienes abiertos, por id.
   *
   * La pantalla era una rejilla de tarjetas donde un CLI sin cuenta ocupaba lo
   * mismo que uno con tres barras de uso, y con diez instalados eso son dos
   * pantallas de scroll para mirar un porcentaje (Munir, 2026-08-09: «más
   * profesional, no tan grande, como un menú desplegable»). Ahora cada CLI es
   * una fila que se abre.
   *
   * Nacen abiertos los que TIENEN cuenta, que es lo único que se viene a mirar
   * aquí; los demás, plegados y en un renglón. Y lo que tú abras o cierres se
   * recuerda: `null` mientras no hayas tocado ninguno, y desde el primer clic
   * manda tu lista y no la regla.
   */
  const [abiertos, setAbiertos] = useState<string[] | null>(() => {
    try {
      const g = localStorage.getItem(ABIERTOS_KEY);
      return g ? (JSON.parse(g) as string[]) : null;
    } catch {
      return null;
    }
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Account | null>(null);
  /** Qué se va a cerrar: una cuenta concreta, o "todas". Null = nada. */
  const [cerrando, setCerrando] = useState<Account | "todas" | null>(null);
  /** Qué skills ve cada cuenta, por su carpeta. Se pregunta al pintar y tras
      cada cambio: es leer un directorio, no cuesta nada, y una etiqueta que
      dice «compartidas» cuando ya no lo están sería peor que no decir nada. */
  const [skills, setSkills] = useState<Record<string, EstadoSkills>>({});

  const mirarSkills = useCallback((dir: string) => {
    if (!dir) return;
    void skillsEstado(dir)
      .then((e) => setSkills((p) => ({ ...p, [dir]: e })))
      // En silencio: una cuenta cuya carpeta todavía no existe no es un fallo,
      // y el botón simplemente sale como «Compartir».
      .catch(() => {});
  }, []);

  /**
   * Enlaza o desenlaza. El error de Rust se enseña tal cual, porque el único
   * que llega hasta aquí es el que importa: «esa cuenta ya tiene N skills
   * suyas». Ese caso NO se resuelve solo a la brava —enlazar taparía su
   * carpeta y las perdería de vista sin decir nada—, así que se cuenta y se
   * deja que Munir decida.
   */
  const alternarSkills = useCallback(
    async (dir: string) => {
      try {
        if (skills[dir]?.compartida) await dejarDeCompartirSkills(dir);
        else await compartirSkills(dir);
      } catch (e) {
        setError(String(e));
      }
      mirarSkills(dir);
    },
    [skills, mirarSkills],
  );
  const [saliendo, setSaliendo] = useState(false);
  /** Lo que salió mal, si salió: cerrar en silencio no dice si funcionó. */
  const [salida, setSalida] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [atajosProv, setAtajosProv] = useState<string[]>(() => leerAtajosProv());
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahi un arrastre. */
  const bajoEnVelo = useRef(false);

  const allOf = useCallback(
    (p: Provider): Account[] => [
      mainAccount(p.id),
      ...accounts.filter((a) => a.provider === p.id),
    ],
    [accounts],
  );

  /**
   * Cómo se llama una cuenta en pantalla.
   *
   * La de casa de cada CLI se llama por su CLI. `mainAccount` las titula todas
   * «Principal», y con nueve programas instalados eso son nueve tarjetas con el
   * mismo nombre, que no distinguen nada (Munir, 2026-07-31). Se resuelve aquí
   * y no en `mainAccount` porque ese label también viaja a los títulos de
   * terminal y a la barra lateral, donde «Principal» sí dice lo que tiene que
   * decir; esto es solo cómo se presenta en esta pantalla.
   */
  const nombreDe = useCallback((acc: Account): string => {
    if (acc.dir) return acc.label; // una cuenta añadida ya tiene nombre propio
    return providerOf(acc.provider).label;
  }, []);

  /** Las tres respuestas por las que se abre esta pantalla, sacadas de lo que
      ya se ha leído: cuántas cuentas responden, cuál es la que peor va de
      cuota y con cuál nacen las terminales. */
  const resumen = useMemo(() => {
    const vistos = Object.values(info);
    const conectadas = vistos.filter((i) => i.ready).length;
    let peor: number | null = null;
    let peorCuenta = "";
    for (const [id, i] of Object.entries(info)) {
      for (const l of i.limits?.lines ?? []) {
        if (peor == null || l.percent > peor) {
          peor = l.percent;
          const acc = PROVIDERS.flatMap(allOf).find((a) => a.id === id);
          peorCuenta = acc ? `${nombreDe(acc)} · ${shortLabel(l.label)}` : shortLabel(l.label);
        }
      }
    }
    const suya = PROVIDERS.flatMap(allOf).find((a) => a.id === defaultAccount);
    const porDefecto = suya ? nombreDe(suya) : "";
    return {
      conectadas,
      programas: installed?.size ?? 0,
      peor,
      peorCuenta,
      porDefecto,
    };
  }, [info, installed, defaultAccount, allOf, nombreDe]);

  /** Las cuentas conectadas ahora mismo, de cualquier CLI. Es sobre lo que
      actúa «cerrar en todas», y también lo que decide si ese botón existe. */
  const conectadas = useMemo(
    () =>
      PROVIDERS.filter((p) => installed?.has(p.id))
        .flatMap((p) => allOf(p).map((acc) => ({ acc, p })))
        .filter(({ acc }) => info[acc.id]?.ready),
    [installed, allOf, info],
  );

  /**
   * Cerrar sesión: borra solo el archivo de credenciales, así que la cuenta
   * sigue con sus proyectos, su historial y sus ajustes. Ver
   * `accounts::logout_account`, que es donde están los límites de lo que se
   * puede borrar.
   *
   * Si falla una de varias NO se para: cerrar cinco y fallar en la tercera
   * dejando dos abiertas sin decirlo sería peor que seguir y contarlo al final.
   */
  const cerrarSesion = async () => {
    if (!cerrando) return;
    setSaliendo(true);
    setSalida(null);
    const lista =
      cerrando === "todas"
        ? conectadas
        : [{ acc: cerrando, p: providerOf(cerrando.provider) }];
    const fallos: string[] = [];
    for (const { acc, p } of lista) {
      await logoutAccount(acc.dir, p.creds, p.homeDir).catch((e) => {
        fallos.push(`${nombreDe(acc)}: ${e}`);
      });
    }
    setSaliendo(false);
    if (fallos.length) {
      setSalida(fallos.join(" · "));
      // El diálogo se queda abierto con el fallo escrito: cerrarlo aquí
      // escondería lo único que explica por qué siguen conectadas.
      if (installed) void load(installed);
      return;
    }
    setCerrando(null);
    // Releer: las tarjetas tienen que pasar a «sin conectar» ahora, no en el
    // siguiente repaso, o parecería que el botón no ha hecho nada.
    if (installed) void load(installed);
  };

  const load = useCallback(
    async (ids: Set<string>) => {
      setBusy(true);
      for (const p of PROVIDERS) {
        if (!ids.has(p.id)) continue;
        for (const acc of allOf(p)) {
          const ready = await accountReady(acc.dir, p.creds, p.homeDir).catch(() => false);
          // Only Claude publishes anything readable without spending quota.
          const plan = p.usage ? await planInfo(acc.dir || undefined).catch(() => null) : null;
          let limits: Limits | null = null;
          let err = "";
          if (ready && p.usage) {
            limits = await usageLimits(acc.dir || undefined).catch((e) => {
              err = String(e);
              return null;
            });
          }
          setInfo((prev) => ({ ...prev, [acc.id]: { plan, limits, ready, error: err } }));
        }
      }
      setBusy(false);
    },
    [allOf],
  );

  /** Vuelve a mirar qué CLIs hay en el equipo y relee sus límites. Es lo que
      hace falta después de instalar uno: aparece sin reiniciar la app. */
  const detectar = useCallback(() => {
    setError("");
    detectClis(PROVIDERS.map((p) => [p.id, p.exe] as [string, string]))
      .then((found) => {
        const ids = new Set(found.map((f) => f.id));
        setInstalled(ids);
        void load(ids);
      })
      .catch((e) => setError(String(e)));
  }, [load]);

  useEffect(() => {
    detectar();
    // Re-reads when an account is added or removed; opening the tab is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // Y con ellas, si cada una comparte las skills de la principal. Se pregunta
  // por CARPETA y no por cuenta porque es lo que Rust necesita, y las de casa
  // (sin carpeta propia) no se preguntan: la principal es el origen.
  useEffect(() => {
    for (const a of accounts) if (a.dir) mirarSkills(a.dir);
  }, [accounts, mirarSkills]);

  const add = (p: Provider) => {
    const name = label.trim();
    if (!name) return;
    setLabel("");
    setAdding(null);
    setError("");
    onAdd(p, name).catch((e: Error) => setError(e.message ?? String(e)));
  };

  const card = (p: Provider, acc: Account) => {
    const it = info[acc.id];
    const isDefault = acc.id === defaultAccount;
    const isMain = !acc.dir;
    return (
      <article
        key={acc.id}
        className="panel-card account-card"
        data-default={isDefault}
        style={{ ["--c" as string]: p.hue }}
      >
        <div className="account-top">
          {/* La marca del programa en la cuenta de casa, y las iniciales solo en
              las que tú has creado. Con `initials(acc.label)` salía «Pr» en
              todas, de «Principal», que es la misma pista para nueve tarjetas
              distintas. */}
          <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: p.hue }}>
            {isMain && tieneMarca(p.id) ? <ProviderMark id={p.id} /> : initials(nombreDe(acc))}
          </span>
          {/* «Principal» a secas se repetía en cada CLI y no distinguía nada:
              con nueve instalados eran nueve tarjetas con el mismo título. La
              cuenta de casa de cada programa se llama por su programa. */}
          {renaming === acc.id ? (
            <input
              className="finder account-rename"
              autoFocus
              defaultValue={acc.label}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(acc.id, e.currentTarget.value.trim());
                  setRenaming(null);
                } else if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={(e) => {
                onRename(acc.id, e.currentTarget.value.trim());
                setRenaming(null);
              }}
            />
          ) : (
            <span className="account-name stream-hide">{nombreDe(acc)}</span>
          )}
        </div>

        {/* Las tres chapas, EN COLUMNA y por el lado derecho de la tarjeta
            entera, no en fila detrás del nombre.
            En fila se llevaban un renglón completo para tres palabras, y a la
            vez la mitad derecha de la tarjeta quedaba en blanco desde la
            primera barra hasta abajo (Munir, 2026-08-09, con las flechas
            señalando ese hueco). Puestas de pie ocupan el alto que las barras
            ya gastaban, así que la tarjeta pierde una fila y no gana ninguna. */}
        <div className="account-chips">
          {it?.plan?.subscription && <span className="account-plan">{it.plan.subscription}</span>}
          {isDefault && (
            <span className="account-badge" data-tip={t("Las terminales nuevas usan esta")}>
              {t("predeterminada")}
            </span>
          )}
          {/* El estado, donde se busca: arriba y a la derecha. Antes había que
              leer el párrafo de dentro para saber si esa cuenta responde.

              ⚠ Y de un CLI que no escribe ningún archivo de sesión NO se dice
              «sin conectar», porque no se sabe. Lo decía, y a la vez el párrafo
              de debajo decía «no sé leer si has iniciado sesión»: la misma
              tarjeta afirmando una cosa y su contraria (Munir, 2026-08-09, con
              Crush delante). Este tablero se construyó sobre no mentir del
              estado de nada, así que aquí toca decir que no se sabe. */}
          <span
            className="account-state"
            data-ok={p.creds.length > 0 && it?.ready === true}
            data-off={p.creds.length > 0 && it?.ready === false}
            data-tip={
              p.creds.length === 0
                ? t("Este programa no deja ninguna huella en el equipo al iniciar sesión, así que Adeorq no puede saberlo sin abrirlo.")
                : undefined
            }
          >
            {p.creds.length === 0
              ? t("no se sabe")
              : it == null
                ? "…"
                : it.ready
                  ? t("conectada")
                  : t("sin conectar")}
          </span>
        </div>

        {p.creds.length === 0 ? (
          // Not every CLI writes a file that means "signed in", and inventing
          // one would show a wrong answer with total confidence.
          // Corto: la chapa de arriba ya dice «no se sabe», así que aquí solo
          // queda el qué hacer. La frase larga repetía el estado y se comía dos
          // renglones en siete tarjetas para decir lo mismo siete veces.
          <p className="account-empty">{t("Ábrelo y te lo dirá él.")}</p>
        ) : it && !it.ready ? (
          <p className="account-empty">{t("Abre una terminal aquí y haz el login.")}</p>
        ) : !p.usage ? (
          <p className="account-empty">
            {t("No publica su consumo en el equipo, así que no hay barras que enseñar.")}
          </p>
        ) : (
          // Un límite, UN renglón: nombre, barra, cifra y cuándo se renueva.
          // Eran tres renglones cada uno (nombre y cifra arriba, la barra
          // debajo, la renovación debajo de esa), así que tres límites se
          // comían nueve líneas y media tarjeta para decir tres números. La
          // barra va más GRUESA y más CORTA a la vez, que es justo lo que
          // pidió Munir (2026-08-09): a lo ancho de la tarjeta y con cinco
          // píxeles de alto no era un medidor, era un subrayado.
          // Clases propias y no las `limit-*` de siempre: esas las comparte el
          // panel de Uso, que no ha pedido cambiar.
          <div className="account-limits">
            {(it?.limits?.lines ?? []).map((l) => (
              <div
                key={l.label}
                className="acc-uso"
                data-tip={`${l.label}: ${l.percent}%${
                  l.resets ? `\n${t("se renueva")} ${l.resets}` : ""
                }`}
              >
                <span className="acc-uso-que">{shortLabel(l.label)}</span>
                <span className="acc-uso-barra">
                  <span
                    className="acc-uso-fill"
                    data-hot={l.percent >= 80}
                    style={{ width: `${Math.min(100, l.percent)}%` }}
                  />
                </span>
                <strong data-hot={l.percent >= 80}>{l.percent}%</strong>
                <span className="acc-uso-cuando">
                  {l.resets ? l.resets.replace(/\s*\([^)]*\)\s*$/, "") : ""}
                </span>
              </div>
            ))}
            {!it && <p className="account-empty">{t("Preguntando a Claude…")}</p>}
            {it?.error && <p className="account-empty">{it.error}</p>}
          </div>
        )}

        <div className="account-actions">
          <button className="mini" onClick={() => onTerminal(acc)}>
            {t("Terminal con esta")}
          </button>
          {/* «Por defecto» solo significa algo donde puede haber más de una
              cuenta, que es lo que dice `variasCuentas` de la tabla. Antes
              preguntaba «¿eres Claude?», y era la misma respuesta por
              casualidad. */}
          {!isDefault && sabe(p.id, "variasCuentas") && (
            <button className="mini" onClick={() => onSetDefault(acc.id)}>
              {t("Usar por defecto")}
            </button>
          )}
          {/* Cerrar sesión, en TODAS las cuentas y no solo en las que tú has
              creado: la de casa de cada CLI también se cierra, y era la que no
              tenía forma de hacerlo sin ir a buscar el archivo a mano.
              Solo aparece si está conectada: en una que no lo está sería un
              botón que no hace nada.
              Y no es lo mismo que «Quitar», que se lleva la carpeta entera:
              esto borra el login y deja los proyectos, el historial y los
              ajustes donde estaban. */}
          {it?.ready && (
            <button className="mini" onClick={() => setCerrando(acc)}>
              {t("Cerrar sesión")}
            </button>
          )}
          {/* Compartir las skills con la cuenta principal.
              Una cuenta es una carpeta (`CLAUDE_CONFIG_DIR`), así que cada una
              tiene sus propias skills y lo que escribes en una no existe en las
              demás: Munir lo vio con su cuenta CCC delante, sin ninguna
              (2026-08-09). Esto enlaza su carpeta con la de casa, que es lo que
              él ya hacía a mano con junctions en tres de sus seis skills.
              Solo en las cuentas de Adeorq: la principal ES el origen, y
              enlazarla contra sí misma la dejaría sin nada.
              El texto dice «la misma carpeta» a propósito, porque esa es la
              consecuencia que se paga: borrar una skill desde aquí la borra
              para todas, y eso no puede ir en una nota al pie. */}
          {!isMain && sabe(p.id, "skills") && (
            <button
              className="mini"
              data-tip={
                skills[acc.dir]?.compartida
                  ? t("Deja de ver las skills de tu cuenta principal. No se borra ninguna.")
                  : t("Es la MISMA carpeta, no una copia: lo que escribas lo verán todas tus cuentas, y lo que borres se borrará para todas.")
              }
              onClick={() => void alternarSkills(acc.dir)}
            >
              {skills[acc.dir]?.compartida
                ? t("Skills: compartidas ({n})", { n: skills[acc.dir]?.cuantas ?? 0 })
                : t("Compartir mis skills")}
            </button>
          )}
          {!isMain && (
            <>
              <button className="mini" onClick={() => setRenaming(acc.id)}>
                {t("Renombrar")}
              </button>
              <button className="mini menu-warn" onClick={() => setConfirm(acc)}>
                {t("Quitar")}
              </button>
            </>
          )}
        </div>
      </article>
    );
  };

  const missing = PROVIDERS.filter((p) => installed && !installed.has(p.id));

  return (
    <div className="panel accounts">
      <header className="panel-hero accounts-hero">
        <div>
          <h1>{t("Cuentas")}</h1>
          <p>
            {t(
              "Cada cuenta es un login aparte del mismo CLI, con su propia carpeta. Las terminales nuevas de Claude nacen con la que marques como predeterminada.",
            )}
          </p>
        </div>
        <div className="account-actions accounts-hero-btns">
          {/* Solo con DOS o más conectadas: con una, este botón y el de su
              tarjeta hacen lo mismo, y dos caminos para lo mismo en la misma
              pantalla es una duda, no una comodidad. */}
          {conectadas.length > 1 && (
            <button
              className="mini"
              data-tip={t("Cerrar sesión en todas: cada CLI volverá a pedir login")}
              onClick={() => setCerrando("todas")}
            >
              {t("Cerrar todas ({n})", { n: conectadas.length })}
            </button>
          )}
          <button
            className="mini"
            disabled={busy}
            data-tip={t("Buscar otra vez qué hay instalado y releer los límites (no gasta cuota)")}
            onClick={detectar}
          >
            {busy ? "…" : <RefreshIcon size={13} />}
          </button>
        </div>
      </header>

      {/* El estado de un vistazo, antes de la lista.
          Esta pantalla se abre por dos motivos: para ver cuánto queda de cuota
          y para cambiar de cuenta. Los dos obligaban a bajar leyendo tarjeta
          por tarjeta, porque nueve tarjetas iguales que dicen todas «Principal»
          no se distinguen de lejos. Aquí arriba está la respuesta.

          Y en UN RENGLÓN, no en tres cajas de cien píxeles. Los tres datos
          caben en una línea y ninguno es un titular: son la respuesta a «¿cómo
          voy?», que se lee de paso y no se queda mirando. Ocupaban la quinta
          parte de la pantalla para decir tres cosas que además vuelven a salir
          más abajo, cada una en su sitio (Munir, 2026-08-09). */}
      <p className="accounts-linea">
        <span>
          <b>{resumen.conectadas}</b>{" "}
          {resumen.conectadas === 1 ? t("conectada") : t("conectadas")}
          <em>{t("de {n} instalados", { n: resumen.programas })}</em>
        </span>
        <span data-hot={resumen.peor != null && resumen.peor >= 80 ? "" : undefined}>
          <b>{resumen.peor != null ? `${resumen.peor}%` : "—"}</b>{" "}
          {t("el límite más apretado")}
          <em>{resumen.peorCuenta || t("todavía preguntando…")}</em>
        </span>
        <span>
          <b className="stream-hide">{resumen.porDefecto || "—"}</b>{" "}
          {t("es la de siempre")}
          <em>{t("con ella nacen las terminales nuevas")}</em>
        </span>
      </p>

      {error && <p className="side-error">{error}</p>}

      <Secciones
        memoria="adeorq-cuentas-seccion"
        secciones={[
          {
            id: "cuentas",
            label: "Tus cuentas",
            icon: <IconoCuentas />,
            badge: resumen.conectadas || "",
          },
          { id: "claves", label: "Claves de API", icon: <IconoLlave /> },
          { id: "atajos", label: "Atajos", icon: <IconoAtajo />, badge: atajosProv.length || "" },
          {
            id: "faltan",
            label: "No instalados",
            icon: <IconoDescargar />,
            badge: missing.length || "",
          },
        ]}
      >
        {(activa) => (
          <>
            {activa === "cuentas" && <SeccionCuentas />}
            {activa === "claves" && (
              <>
                <OpenRouterCard />
                <ApiKeysCard />
              </>
            )}
            {activa === "atajos" && <SeccionAtajos />}
            {activa === "faltan" && <SeccionFaltan />}
          </>
        )}
      </Secciones>

      {confirm && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setConfirm(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Quitar cuenta")}</h3>
            <p className="modal-text">
              «{confirm.label}» ({providerOf(confirm.provider).label}) se cerrará y se
              borrará su carpeta de configuración, con su historial. Tu cuenta de siempre y
              tus proyectos no se tocan. Para volver a usarla habría que hacer el login otra vez.
            </p>
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setConfirm(null)}>
                {t("Cancelar")}
              </button>
              <button
                className="np-btn"
                onClick={() => {
                  onRemove(confirm);
                  setConfirm(null);
                }}
              >
                {t("Quitar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cerrar sesión, en una o en todas. Un solo diálogo para los dos casos:
          es la misma pregunta y la misma consecuencia, y lo único que cambia es
          cuántas. Se pregunta SIEMPRE porque volver de aquí cuesta un login por
          cuenta, aunque no se pierda nada más. */}
      {cerrando && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setCerrando(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Cerrar sesión")}</h3>
            <p className="modal-text">
              {cerrando === "todas"
                ? t(
                    "Se cierra la sesión en las {n} cuentas conectadas, de todos los CLIs. No se borra nada más: los proyectos, el historial y los ajustes de cada una siguen donde están, y para volver a entrar hay que hacer el login otra vez en cada una.",
                    { n: conectadas.length },
                  )
                : t(
                    "«{a}» ({p}) deja de estar conectada. No se borra nada más: sus proyectos, su historial y sus ajustes siguen donde están, y para volver a entrar hay que hacer el login otra vez.",
                    { a: nombreDe(cerrando), p: providerOf(cerrando.provider).label },
                  )}
            </p>
            {salida && <p className="modal-warn-note">{salida}</p>}
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setCerrando(null)}>
                {t("Cancelar")}
              </button>
              <button className="np-btn" disabled={saliendo} onClick={() => void cerrarSesion()}>
                {saliendo ? "…" : t("Cerrar sesión")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function SeccionCuentas() {
    return (
      <>
      {/* Envuelto para poder repartir los CLIs en columnas cuando hay pantalla
          de sobra: con seis instalados, uno debajo de otro obligaba a hacer
          scroll con media ventana vacía al lado. */}
      <div className="accounts-groups">
      {PROVIDERS.filter((p) => installed?.has(p.id)).map((p) => {
        // Conectado = alguna de sus cuentas ha contestado que sí. Es el único
        // dato que decide si esta fila merece nacer abierta: los CLIs que no
        // publican nada no tienen nada que enseñar hasta que los abras.
        const conectado = allOf(p).some((a) => info[a.id]?.ready);
        const propias = accounts.filter((a) => a.provider === p.id).length;
        const abierto = abiertos ? abiertos.includes(p.id) : conectado;
        return (
        <section key={p.id} className="account-group" data-abierto={abierto || undefined}>
          {/* La cabecera ES el interruptor, no un título con un botón al lado:
              la fila entera se pulsa, que es lo que uno intenta hacer. */}
          <button
            className="account-group-title"
            aria-expanded={abierto}
            onClick={() => {
              const base = abiertos ?? PROVIDERS.filter((x) => allOf(x).some((a) => info[a.id]?.ready)).map((x) => x.id);
              const nuevo = base.includes(p.id)
                ? base.filter((x) => x !== p.id)
                : [...base, p.id];
              setAbiertos(nuevo);
              localStorage.setItem(ABIERTOS_KEY, JSON.stringify(nuevo));
            }}
          >
            <ChevronIcon size={13} up={abierto} />
            {/* Su marca en lugar del punto de color de antes: doce puntos de
                doce colores no dicen cuál es cuál sin leer el nombre. */}
            {tieneMarca(p.id) ? (
              <span className="account-dot account-dot-marca" style={{ color: p.hue }}>
                <ProviderMark id={p.id} />
              </span>
            ) : (
              <span className="account-dot" style={{ background: p.hue }} />
            )}
            {p.label}
            {!p.envVar && (
              <em
                className="account-note"
                data-tip={t(
                  "No he encontrado forma de moverle la carpeta de configuración, así que solo puede tener una cuenta.",
                )}
              >
                {t("una sola cuenta")}
              </em>
            )}
            {/* Plegado, la fila tiene que decir por sí sola si hay algo dentro,
                o abrirlos todos para mirar es exactamente lo que quitamos. */}
            <span className="account-group-tras">
              {conectado
                ? propias > 0
                  ? t("{n} cuentas", { n: propias + 1 })
                  : t("conectada")
                : t("sin conectar")}
            </span>
          </button>
          <div className="panel-grid accounts-grid">
            {allOf(p).map((acc) => card(p, acc))}

            {p.envVar &&
              (adding === p.id ? (
                <article className="panel-card account-card account-new">
                  <input
                    className="finder"
                    autoFocus
                    placeholder={t("Cómo la llamas (p. ej. Trabajo). Nunca tu correo.")}
                    value={label}
                    onChange={(e) => setLabel(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add(p);
                      else if (e.key === "Escape") setAdding(null);
                    }}
                  />
                  <p className="account-empty">
                    {t("Se crea una carpeta suya y se abre una terminal para que hagas el login. Tu cuenta de siempre no se toca.")}
                  </p>
                  <div className="account-actions">
                    <button className="np-btn" disabled={!label.trim()} onClick={() => add(p)}>
                      {t("Crear")}
                    </button>
                    <button className="mini" onClick={() => setAdding(null)}>
                      {t("Cancelar")}
                    </button>
                  </div>
                </article>
              ) : (
                <button
                  className="panel-card account-add"
                  onClick={() => {
                    setLabel("");
                    setAdding(p.id);
                  }}
                >
                  <span className="account-plus">+</span>
                  {t("Añadir cuenta")}
                </button>
              ))}
          </div>
        </section>
        );
      })}
      </div>
      <p className="accounts-note">
        {t(
          "Varias cuentas TUYAS, sin problema. Turnarte cuentas de otras personas para estirar los límites incumple los términos de Anthropic y lo que te juegas es el cierre de la cuenta.",
        )}
      </p>
      </>
    );
  }

  function SeccionAtajos() {
    return (
      /* Qué se puede abrir de un clic desde cada proyecto. Vive aquí y no en
         Ajustes porque va de CON QUÉ trabajas, que es de lo que trata esta
         pantalla entera. */
      <section className="panel-card">
        <h2>{t("Atajos en tus proyectos")}</h2>
        <p className="card-hint atajos-prov-hint">
          {t(
            "Los botones que salen al pasar el ratón por un proyecto en la barra lateral. Elige los que uses de verdad: los demás siguen estando en el clic derecho, que los lista todos.",
          )}
        </p>
        <div className="chip-row">
          {ATAJOS_POSIBLES.map((p) => {
            const puesto = atajosProv.includes(p.id);
            return (
              <button
                key={p.id}
                className="choice choice-prov"
                style={{ ["--c" as string]: tonoDe(p.id) }}
                data-on={puesto}
                onClick={() => {
                  // Se quita, o se añade AL FINAL: el orden de la fila es el
                  // orden en que los fuiste eligiendo, que es el único que
                  // significa algo para ti.
                  const next = puesto
                    ? atajosProv.filter((x) => x !== p.id)
                    : [...atajosProv, p.id];
                  setAtajosProv(next);
                  guardarAtajosProv(next);
                }}
              >
                {tieneMarca(p.id) && <ProviderMark id={p.id} />}
                {p.label}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function SeccionFaltan() {
    if (missing.length === 0) {
      return (
        <section className="panel-card">
          <h2>{t("No instalados")}</h2>
          <p className="card-hint">
            {t("Los tienes todos. No queda ningún programa de la lista por instalar.")}
          </p>
        </section>
      );
    }
    return (
      <>
        {/* SIN la clase `account-group`, y no es un descuido: esa clase es la de
            un CLI plegable, y su regla esconde la rejilla (`display: none`)
            hasta que la cabecera le pone `data-abierto`. Aquí no hay cabecera
            que pulsar, así que heredarla dejaba la sección en blanco con el
            contador diciendo que había diez (Munir, 2026-08-20). */}
        <section className="accounts-faltan">
          <div className="panel-grid accounts-grid">
            {missing.map((p) => (
              <article key={p.id} className="panel-card account-card account-missing">
                <div className="account-top">
                  <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: p.hue }}>
                    {tieneMarca(p.id) ? <ProviderMark id={p.id} /> : initials(p.label)}
                  </span>
                  <span className="account-name">{p.label}</span>
                </div>
                {p.cmd ? (
                  <p className="account-empty">
                    {t("No está en este equipo. El botón abre una terminal y lo descarga con")}{" "}
                    <code>{p.cmd}</code>.{" "}
                    {t("No te pide ninguna cuenta: solo lo deja instalado, y ya decidirás si lo usas.")}
                  </p>
                ) : (
                  <p className="account-empty">
                    {t("No está en este equipo y no tiene un comando de instalación de fiar, así que hay que bajarlo de su web:")}{" "}
                    <code>{p.install}</code>
                  </p>
                )}
                <div className="account-actions">
                  {p.cmd && (
                    <button className="np-btn" onClick={() => onInstall(p)}>
                      {t("Descargar")}
                    </button>
                  )}
                  {p.web && (
                    <button
                      className="mini"
                      onClick={() => void openUrl(p.web ?? "").catch(() => {})}
                    >
                      {t("Abrir su web")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="accounts-note">
            {t("Cuando termine la instalación, vuelve aquí y dale a ↻: el que acabe de aparecer se coloca solo con los demás.")}
          </p>
        </section>
      </>
    );
  }
}
