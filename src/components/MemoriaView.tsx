// La Memoria: el segundo cerebro, dentro de Adeorq.
//
// Sus notas siguen siendo una carpeta de markdown en su disco y se abren con
// Obsidian como siempre; esto no importa nada ni copia nada, lee donde están.
// Lo que aquí se puede hacer es buscar por lo que DICEN (no solo por cómo se
// llaman), verlas, editarlas, y mirar el mapa de lo que enlaza con qué.
//
// Guardar es lo único que puede hacer daño, así que el botón no aparece hasta
// que hay algo distinto que guardar, y por debajo (`memoria.rs`) se escribe al
// lado y se renombra, después de comprobar que nadie tocó el archivo mientras
// estaba abierto aquí.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  boveda,
  guardarBoveda,
  memoriaRead,
  memoriaScan,
  memoriaSearch,
  memoriaVaults,
  memoriaWrite,
  type Doc,
  type DocText,
  type Hit,
  type Vault,
  type VaultInfo,
} from "../lib/memoria";
import { useT } from "../lib/i18n";
import { listSkills, skillText } from "../lib/pty";
// `hueOf` y `familia` se han ido con los puntos de color de la lista: el color
// por familia solo se pinta ya donde dice algo, que es la constelación.
import { ChevronIcon, RefreshIcon, SearchIcon } from "./Icons";
import MemoriaGrafo from "./MemoriaGrafo";
import MemoriaMapa from "./MemoriaMapa";
import {
  escanearArbol,
  foremanMapa,
  guardarMapa,
  listProjects,
  mapaGuardado,
  pararMapa,
  resumenTaller,
  type Project,
} from "../lib/pty";
import { leerPerfil } from "../lib/perfil";
import { esqueletoParaElCapataz, leerMapa, type Mapa } from "../lib/mapa";

/** Cuánto se espera desde la última tecla para buscar. La búsqueda es local y
    va sobrada, pero repintar la lista en cada letra parpadea. */
const ESPERA_MS = 140;

/**
 * Una ruta acortada por el PRINCIPIO, no por el final.
 *
 * `C:\Apps\Random APPS\obsidian\BUNKER\BUNKER` no cabe en una lista estrecha, y
 * cortada por el final deja «C:\Apps\Random APPS\o…», que es exactamente igual
 * en las dos bóvedas que viven ahí: lo que las distingue está al otro lado
 * (Munir, 2026-08-11, con las dos suyas indistinguibles en pantalla). Se queda
 * con la carpeta y su padre, que es lo que uno reconoce.
 */
function rutaCorta(p: string): string {
  const partes = p.split(/[\\/]/).filter(Boolean);
  if (partes.length <= 2) return p;
  return `…\\${partes.slice(-2).join("\\")}`;
}

/**
 * Markdown a HTML, con dos cosas de la casa:
 * - los `[[wikilinks]]` se convierten a enlaces normales, porque `marked` no
 *   los conoce y en la bóveda existen;
 * - y el HTML resultante se limpia. Los documentos son suyos, pero en
 *   `C:\proyectos` hay READMEs venidos de fuera, y un `<script>` dentro de esta
 *   ventana tendría a mano todo lo que la ventana puede hacer.
 */
function aHtml(md: string): string {
  const conLinks = md.replace(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g, (_m, destino) => {
    const limpio = String(destino).trim();
    return `[${limpio}](${encodeURI(limpio)}.md)`;
  });
  const bruto = marked.parse(conLinks, { async: false }) as string;
  const caja = document.createElement("div");
  caja.innerHTML = bruto;
  for (const malo of caja.querySelectorAll("script,iframe,object,embed,style,link,form")) {
    malo.remove();
  }
  for (const el of caja.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on")) el.removeAttribute(attr.name);
      if ((n === "href" || n === "src") && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return caja.innerHTML;
}

/** Una carpeta de la bóveda, con lo que cuelga de ella. */
interface RamaDatos {
  nombre: string;
  /** Ruta relativa, que es también su identificador para plegar y desplegar. */
  ruta: string;
  hijas: RamaDatos[];
  docs: Doc[];
}

/**
 * De la lista plana de documentos al árbol de carpetas.
 *
 * Rust devuelve cada documento con su ruta relativa entera porque es lo que
 * necesita para resolver enlaces; el árbol se arma aquí, que es donde se pinta,
 * y así el índice no guarda dos formas de lo mismo.
 */
function construirArbol(docs: Doc[]): RamaDatos {
  const raiz: RamaDatos = { nombre: "", ruta: "", hijas: [], docs: [] };
  for (const d of docs) {
    let cur = raiz;
    for (const parte of d.folder ? d.folder.split("/") : []) {
      let h = cur.hijas.find((x) => x.nombre === parte);
      if (!h) {
        h = { nombre: parte, ruta: cur.ruta ? `${cur.ruta}/${parte}` : parte, hijas: [], docs: [] };
        cur.hijas.push(h);
      }
      cur = h;
    }
    cur.docs.push(d);
  }
  // Por nombre y sin distinguir mayúsculas ni tildes, como haría cualquier
  // gestor de archivos: el orden en que Rust leyó el disco no le importa a
  // nadie.
  const ordenar = (r: RamaDatos) => {
    r.hijas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    r.docs.sort((a, b) => a.title.localeCompare(b.title, "es"));
    r.hijas.forEach(ordenar);
  };
  ordenar(raiz);
  return raiz;
}

/** Cuántos documentos hay en una carpeta contando lo que cuelga de ella. */
function cuantos(r: RamaDatos): number {
  return r.docs.length + r.hijas.reduce((n, h) => n + cuantos(h), 0);
}

/** Una carpeta y lo suyo, dibujada. Se pinta a sí misma por dentro, que es lo
    que permite que un árbol de cualquier hondura salga sin escribir un bucle
    por nivel. */
function Rama({
  rama,
  nivel,
  abiertas,
  onAlternar,
  activo,
  onAbrir,
}: {
  rama: RamaDatos;
  nivel: number;
  abiertas: Set<string>;
  onAlternar: (ruta: string) => void;
  activo?: string;
  onAbrir: (id: string) => void;
}) {
  return (
    <>
      {rama.hijas.map((h) => {
        const abierta = abiertas.has(h.ruta);
        return (
          <div key={h.ruta}>
            <button
              className="mem-carpeta"
              /* Mismo tope que las hojas, y por el mismo motivo: si la carpeta
                 sangra más que su contenido, el árbol deja de leerse. */
              style={{ paddingLeft: `${8 + Math.min(nivel, 5) * 13}px` }}
              onClick={() => onAlternar(h.ruta)}
            >
              <ChevronIcon size={13} up={abierta} />
              <span className="mem-carpeta-nombre">{h.nombre}</span>
              <span className="mem-carpeta-n">{cuantos(h)}</span>
            </button>
            {abierta && (
              <Rama
                rama={h}
                nivel={nivel + 1}
                abiertas={abiertas}
                onAlternar={onAlternar}
                activo={activo}
                onAbrir={onAbrir}
              />
            )}
          </div>
        );
      })}
      {rama.docs.map((d) => (
        /* Sin punto de color delante. Lo llevaban los quinientos documentos, y
           quinientos puntos no ordenan nada: hacen ruido y roban el sitio donde
           empieza el título, que es lo único que se lee (Munir, 2026-08-10:
           «quita estos puntitos»). El color de la familia sigue vivo donde sí
           dice algo, que es la constelación. */
        <button
          key={d.id}
          className="mem-hoja"
          data-on={activo === d.id}
          /* La sangría TIENE TOPE. Sin él, cada carpeta se come trece píxeles y
             en un árbol hondo el nombre acababa empezando fuera de la lista: se
             veía una fila con los tres puntos del recorte y nada más, o una
             barra gris al pasar el ratón (Munir, 2026-08-14, con la captura de
             VoCript-Core). A partir del quinto nivel la sangría ya no dice de
             quién eres, y el nombre sí. */
          style={{ paddingLeft: `${20 + Math.min(nivel, 5) * 13}px` }}
          onClick={() => onAbrir(d.id)}
          data-tip={d.id}
        >
          {d.title}
        </button>
      ))}
    </>
  );
}

export default function MemoriaView() {
  const { t } = useT();
  const [raiz, setRaiz] = useState(boveda);
  const [vault, setVault] = useState<Vault | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [abierto, setAbierto] = useState<DocText | null>(null);
  const [borrador, setBorrador] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Memoria abre por el MAPA, no por un documento en blanco. Es lo que hay que
   *  ver primero: quinientos documentos y de dónde tirar. El documento entra en
   *  cuanto abres uno, aquí o en la lista. */
  const [modo, setModo] = useState<"doc" | "grafo" | "esquema">("grafo");
  /* El Esquema: qué carpeta se está mirando y su mapa.
     Vive aquí y no dentro del componente porque el selector de arriba es de
     esta pantalla, y porque así el mapa sobrevive a ir y volver del Cerebro sin
     tener que leerlo otra vez, que aquí son minutos y no un parpadeo. */
  const [proyectos, setProyectos] = useState<Project[]>([]);
  const [queEsquema, setQueEsquema] = useState<string>("");
  /** La carpeta madre de los proyectos, para la opción «todos». Sale del
      perfil, que es donde el usuario la eligió; vacía si dijo que no tiene. */
  const raizProyectos = leerPerfil().raiz;
  const [mapa, setMapa] = useState<Mapa | null>(null);
  /** Cuándo se leyó lo que se está viendo. Un mapa sin fecha se lee como si
      fuera de ahora, y puede ser de la semana pasada. */
  const [cuandoMapa, setCuandoMapa] = useState("");
  /** En qué anda el Capataz, con todas las letras. Tres minutos con un punto
      girando se sienten como una avería; con la frase, como una espera. */
  const [trabajando, setTrabajando] = useState("");
  const [errorMapa, setErrorMapa] = useState("");

  /**
   * Leer el proyecto entero: el Capataz abre su código y dice de qué está
   * hecho y qué pasa cuando haces algo.
   *
   * Lo que devuelve es una cadena escrita por un modelo, así que se valida
   * entera en `lib/mapa.ts` antes de tocar la pantalla.
   */
  const leerProyecto = useCallback(() => {
    const ruta = queEsquema;
    if (!ruta || trabajando) return;
    setErrorMapa("");
    setTrabajando(t("Mirando el proyecto…"));
    // El escáner de carpetas no dibuja nada: es la chuleta de dónde mirar, y
    // eso es lo que evita que el Capataz gaste media conversación buscando los
    // archivos antes de abrir el primero.
    const todos = ruta === raizProyectos;
    // Con «todos» no se escanea el árbol: se le manda un renglón por proyecto
    // con lo que cada uno dice de sí mismo en su README. Leer veintiocho README
    // es trabajo de disco y cuesta milisegundos; dejárselo al Capataz costaba
    // más de seis minutos y no llegaba a terminar.
    (todos ? resumenTaller(ruta) : escanearArbol(ruta).then((a) => esqueletoParaElCapataz(a.nodos)))
      .then((esqueleto) => foremanMapa(ruta, esqueleto, todos))
      .then(async (crudoMapa) => {
        const m = leerMapa(crudoMapa);
        if (!m) throw new Error(t("el Capataz no devolvió un mapa que se pueda leer"));
        setMapa(m);
        const cuando = new Date().toISOString();
        setCuandoMapa(cuando);
        await guardarMapa(ruta, JSON.stringify({ cuando, mapa: crudoMapa })).catch(() => {
          // Sin guardar se trabaja igual; solo se pagará otra lectura.
        });
      })
      // Pararlo lo pediste tú: eso no es un fallo y no se pinta en rojo.
      .catch((e) => setErrorMapa(String(e).includes("parado") ? "" : String(e)))
      .finally(() => setTrabajando(""));
  }, [queEsquema, trabajando, raizProyectos, t]);

  /* En qué anda el Capataz, en vivo. Rust emite un `mapa-paso` por cada archivo
     que abre, y esa frase sustituye a la de espera. Dos minutos con un cartel
     quieto se leen como un cuelgue; los mismos dos minutos diciendo qué archivo
     está leyendo se leen como trabajo (Munir, 2026-08-14). */
  const trabajandoRef = useRef(false);
  trabajandoRef.current = !!trabajando;
  useEffect(() => {
    const fuera = listen<string>("mapa-paso", (e) => {
      if (trabajandoRef.current) setTrabajando(e.payload);
    });
    return () => {
      void fuera.then((f) => f());
    };
  }, []);

  const pararLectura = useCallback(() => {
    void pararMapa().catch(() => {});
  }, []);
  /** Las bóvedas que Obsidian ya conoce. Se preguntan una vez y solo cuando
      todavía no hay carpeta elegida: después no sirven para nada. */
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  /** Cómo se mira la bóveda: por dónde guardaste las cosas, o por lo último
      que tocaste. Son dos preguntas distintas y las dos se hacen. */
  const [vista, setVista] = useState<"arbol" | "recientes">("arbol");
  /** Las skills, que van en el centro del mapa: no son de ningún proyecto y se
      usan en todos. Si no hay ninguna (o el sistema no las sabe leer) el centro
      se queda vacío, como estaba. */
  const [skills, setSkills] = useState<Array<{ name: string; description: string; folder: string }>>(
    [],
  );
  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => setSkills([]));
  }, []);
  /** Qué carpetas están desplegadas. Empieza todo cerrado a propósito: una
      bóveda de cuatrocientas notas abierta de par en par es una pared. */
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [soloConectados, setSoloConectados] = useState(true);
  /** Cómo se mira la bóveda en el Cerebro: la bola de siempre, o la galaxia con
   *  un cúmulo por proyecto. Se recuerda, porque es una preferencia de cómo
   *  entiendes tus notas y no algo de este rato. */
  const [cielo, setCielo] = useState<"esfera" | "galaxia">(() =>
    localStorage.getItem("adeorq-cerebro-forma") === "galaxia" ? "galaxia" : "esfera",
  );
  useEffect(() => {
    try {
      localStorage.setItem("adeorq-cerebro-forma", cielo);
    } catch {
      // Sin recordarlo se trabaja igual: vuelve a la esfera.
    }
  }, [cielo]);
  const cuerpo = useRef<HTMLDivElement>(null);

  const escanear = useCallback((ruta: string) => {
    if (!ruta) return;
    setCargando(true);
    setError("");
    memoriaScan(ruta)
      .then(setVault)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    escanear(raiz);
  }, [raiz, escanear]);

  // Las bóvedas que Obsidian ya conoce, SIEMPRE, tengas una abierta o no: antes
  // solo se leían en la pantalla de bienvenida, así que una vez elegida una, la
  // única forma de cambiar era buscar la carpeta a mano en el disco (Munir,
  // 2026-08-11). Es la lista de Obsidian, no un rastreo: cuesta leer un JSON.
  useEffect(() => {
    memoriaVaults().then(setVaults).catch(() => {});
  }, [raiz]);

  /* Los proyectos, para el selector del Esquema. Solo cuando esa pestaña está
     delante: quien nunca la abre no paga ni una lectura de disco por ella. */
  useEffect(() => {
    if (modo !== "esquema" || proyectos.length) return;
    listProjects().then(setProyectos).catch(() => {});
  }, [modo, proyectos.length]);

  /* Y el mapa de lo elegido, el que se guardó la última vez. Se enseña al
     instante y NO se relee solo: leer un proyecto son minutos, así que hacerlo
     cada vez que tocas el selector sería cobrarte tres minutos por curiosear.
     Volver a leer es un botón, con la fecha de lo que ves al lado. */
  useEffect(() => {
    setMapa(null);
    setCuandoMapa("");
    setErrorMapa("");
    if (!queEsquema) return;
    let vivo = true;
    mapaGuardado(queEsquema)
      .then((s) => {
        if (!vivo || !s) return;
        const g = JSON.parse(s) as { cuando?: string; mapa?: string };
        const m = leerMapa(g.mapa ?? "");
        if (!m) return;
        setMapa(m);
        setCuandoMapa(typeof g.cuando === "string" ? g.cuando : "");
      })
      .catch(() => {
        // Un guardado ilegible se trata como si no hubiera ninguno: sale el
        // cartel de «todavía no hay mapa» y el botón de leerlo.
      });
    return () => {
      vivo = false;
    };
  }, [queEsquema]);

  // La búsqueda, con su respiro entre teclas.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const id = window.setTimeout(() => {
      memoriaSearch(q.trim()).then(setHits).catch(() => setHits([]));
    }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [q]);

  const elegirCarpeta = async () => {
    const elegida = await pickFolder({ directory: true, title: t("Dónde vive tu memoria") });
    if (typeof elegida !== "string") return;
    guardarBoveda(elegida);
    setRaiz(elegida);
    setAbierto(null);
    setBorrador(null);
  };

  const abrir = useCallback(
    (id: string) => {
      if (!raiz) return;
      setBorrador(null);
      setSkillAbierta(null);
      setModo("doc");
      memoriaRead(raiz, id)
        .then((d) => {
          setAbierto(d);
          cuerpo.current?.scrollTo({ top: 0 });
        })
        .catch((e) => setError(String(e)));
    },
    [raiz],
  );

  /** Una skill abierta en el visor. NO se puede guardar desde aquí: vive en
      `~/.claude/skills` y el que escribe es el de la bóveda, así que guardarla
      escribiría en el sitio equivocado. Se lee, y para tocarla, «Abrir fuera». */
  const [skillAbierta, setSkillAbierta] = useState<string | null>(null);
  /** Si está abierta la lista de bóvedas. Se cierra sola al elegir y con un
      clic fuera, como cualquier menú de la casa. */
  const [eligiendo, setEligiendo] = useState(false);
  useEffect(() => {
    if (!eligiendo) return;
    const fuera = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".mem-cambiar")) setEligiendo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEligiendo(false);
    window.addEventListener("mousedown", fuera, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fuera, true);
      window.removeEventListener("keydown", esc);
    };
  }, [eligiendo]);
  const abrirSkill = useCallback((folder: string) => {
    skillText(folder)
      .then((s) => {
        setSkillAbierta(folder);
        setBorrador(null);
        setAbierto({ id: `${folder}/SKILL.md`, text: s.text, stamp: 0, path: s.path });
      })
      .catch((e) => setError(String(e)));
  }, []);

  const guardar = () => {
    if (!abierto || borrador === null || !raiz || skillAbierta) return;
    setGuardando(true);
    setError("");
    memoriaWrite(raiz, abierto.id, borrador, abierto.stamp)
      .then((d) => {
        setAbierto(d);
        setBorrador(null);
        // El índice de Rust ya se enteró; el de aquí es el que pinta la lista.
        setVault((v) =>
          v
            ? {
                ...v,
                docs: v.docs.map((x) => (x.id === d.id ? { ...x, stamp: d.stamp } : x)),
              }
            : v,
        );
      })
      .catch((e) => setError(String(e)))
      .finally(() => setGuardando(false));
  };

  /** Lo que se lista cuando no hay búsqueda: lo último que tocaste, que es lo
      que casi siempre quieres volver a abrir. */
  const recientes = useMemo(() => {
    const docs = [...(vault?.docs ?? [])];
    docs.sort((a, b) => b.stamp - a.stamp);
    return docs.slice(0, 120);
  }, [vault]);

  const arbol = useMemo(() => (vault ? construirArbol(vault.docs) : null), [vault]);

  const alternarCarpeta = useCallback((ruta: string) => {
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(ruta)) s.delete(ruta);
      else s.add(ruta);
      return s;
    });
  }, []);

  const porId = useMemo(() => {
    const m = new Map<string, Doc>();
    for (const d of vault?.docs ?? []) m.set(d.id, d);
    return m;
  }, [vault]);

  /** Quién enlaza al documento abierto. En Obsidian se llaman backlinks y son
      la mitad de la gracia: dicen desde dónde llegabas tú a esta idea. */
  const entrantes = useMemo(() => {
    if (!abierto) return [];
    return (vault?.docs ?? []).filter((d) => d.links.includes(abierto.id));
  }, [abierto, vault]);

  const salientes = useMemo(() => {
    if (!abierto) return [];
    return (porId.get(abierto.id)?.links ?? []).map((id) => porId.get(id)).filter((d): d is Doc => !!d);
  }, [abierto, porId]);

  const editando = borrador !== null;
  const sucio = editando && borrador !== abierto?.text;

  /** El markdown a HTML se calcula una vez por documento. Sin esto se rehacía
      en cada repintado, y un METAS.md de seiscientas líneas se nota. */
  const html = useMemo(
    () => (abierto && !editando ? aHtml(abierto.text) : ""),
    [abierto, editando],
  );

  // Un clic en un enlace del documento no navega: abre esa nota aquí.
  const alPulsarEnElTexto = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    e.preventDefault();
    if (/^https?:/i.test(href)) {
      void openPath(href).catch(() => {});
      return;
    }
    if (!abierto) return;
    // Se resuelve como en Rust: relativo al que enlaza, y si no, por nombre.
    const base = abierto.id.split("/").slice(0, -1);
    const partes = decodeURI(href).split("#")[0].split("/");
    const pila = [...base];
    for (const p of partes) {
      if (p === "" || p === ".") continue;
      if (p === "..") pila.pop();
      else pila.push(p);
    }
    const directo = pila.join("/");
    if (porId.has(directo)) return abrir(directo);
    const suelto = partes[partes.length - 1].toLowerCase();
    const encontrado = (vault?.docs ?? []).find(
      (d) => d.id.toLowerCase().endsWith(`/${suelto}`) || d.id.toLowerCase() === suelto,
    );
    if (encontrado) abrir(encontrado.id);
  };

  if (!raiz) {
    return (
      <div className="panel mem-vacia">
        <div className="mem-bienvenida">
          <h1>{t("Tu memoria")}</h1>
          <p>
            {t(
              "Tus notas, dentro de Adeorq. Se leen donde están: no se copia nada, no se mueve nada, y tu bóveda se sigue abriendo con Obsidian igual que siempre.",
            )}
          </p>

          {/* Las bóvedas que Obsidian ya conoce. Pedirle a alguien que busque
              a mano una carpeta que el programa de al lado tiene apuntada es
              hacerle trabajo que ya está hecho. */}
          {vaults.length > 0 && (
            <>
              <h2 className="mem-bienvenida-eti">
                {vaults.length === 1
                  ? t("Esta es tu bóveda de Obsidian")
                  : t("Estas son tus bóvedas de Obsidian")}
              </h2>
              <div className="mem-vaults">
                {vaults.map((v) => (
                  <button
                    key={v.path}
                    className="mem-vault"
                    onClick={() => {
                      guardarBoveda(v.path);
                      setRaiz(v.path);
                    }}
                  >
                    <span className="mem-vault-nombre">
                      {v.name}
                      {v.abierta && <em>{t("la que tienes abierta")}</em>}
                    </span>
                    <span className="mem-vault-ruta">{v.path}</span>
                    <span className="mem-vault-n">
                      {v.docs} {t("documentos")}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="np-btn" onClick={elegirCarpeta}>
            {vaults.length > 0 ? t("Señalar otra carpeta") : t("Elegir la carpeta")}
          </button>
          {vaults.length === 0 && (
            <p className="card-hint">
              {t("Vale cualquier carpeta con markdown dentro, sea de Obsidian o no.")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mem">
      <header className="mem-head">
        <div className="mem-buscar">
          <SearchIcon size={15} />
          <input
            className="mem-buscar-input"
            placeholder={t("Buscar en tus notas")}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            autoFocus
          />
          {q && (
            <button className="mini" onClick={() => setQ("")}>
              {t("Limpiar")}
            </button>
          )}
        </div>
        {/* UN botón, no dos.
            «Documento» era la mitad de un conmutador que no elegía nada: el
            documento aparece solo en cuanto abres uno, así que ese botón solo
            servía para volver a lo que ya estabas viendo. Ahora Memoria arranca
            en el Cerebro —es el mapa, y desde ahí se entra a lo que sea— y
            este botón es el camino de vuelta (Munir, 2026-08-11).
            Sin el fondo de acento que tenía: se enciende igual que las pestañas
            de la lista, que es como se marca lo activo en esta pantalla. */}
        <div className="mem-modos">
          <button
            data-on={modo === "grafo"}
            data-tip={t("Volver al mapa de la bóveda")}
            onClick={() => setModo("grafo")}
          >
            {t("Cerebro")}
          </button>
          {/* La otra forma de mirar. El Cerebro contesta «qué enlaza con qué» y
              este «de qué está hecho esto», así que van al lado y no uno dentro
              del otro (Munir, 2026-08-14). */}
          <button
            data-on={modo === "esquema"}
            data-tip={t("La estructura de un proyecto o de una carpeta")}
            onClick={() => setModo("esquema")}
          >
            {t("Esquema")}
          </button>
        </div>
        <button
          className="mem-accion"
          data-tip={`${raiz}\n${t("Volver a leer la carpeta")}`}
          onClick={() => escanear(raiz)}
        >
          <RefreshIcon size={15} />
        </button>
        {/* Cambiar de bóveda sin buscar una carpeta: las que Obsidian conoce
            salen aquí ya listadas, y buscar a mano se queda como último
            recurso, que es lo que es. */}
        <div className="mem-cambiar">
          <button className="mem-accion" onClick={() => setEligiendo((v) => !v)}>
            {t("Cambiar bóveda")}
          </button>
          {eligiendo && (
            <div className="mem-cambiar-pop">
              {vaults.length > 0 && (
                <div className="mem-vaults">
                  {vaults.map((v) => (
                    <button
                      key={v.path}
                      className="mem-vault"
                      data-on={v.path === raiz}
                      onClick={() => {
                        setEligiendo(false);
                        if (v.path === raiz) return;
                        guardarBoveda(v.path);
                        setAbierto(null);
                        setRaiz(v.path);
                      }}
                      data-tip={v.path}
                    >
                      <span className="mem-vault-nombre">{v.name}</span>
                      <span className="mem-vault-ruta">{rutaCorta(v.path)}</span>
                      <span className="mem-vault-n">
                        {v.docs} {v.docs === 1 ? t("documento") : t("documentos")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                className="mini"
                onClick={() => {
                  setEligiendo(false);
                  void elegirCarpeta();
                }}
              >
                {t("Buscar otra carpeta…")}
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <p className="np-err mem-err">{error}</p>}

      <div className="mem-cuerpo">
        <aside className="mem-lista">
          {/* Buscando manda la búsqueda: enseñar el árbol al lado de sus
              resultados sería enseñar dos listas que no dicen lo mismo. */}
          {!hits && (
            <div className="mem-lista-tabs">
              <button data-on={vista === "arbol"} onClick={() => setVista("arbol")}>
                {t("Carpetas")}
              </button>
              <button data-on={vista === "recientes"} onClick={() => setVista("recientes")}>
                {t("Recientes")}
              </button>
            </div>
          )}
          <div className="mem-lista-eti">
            {hits
              ? `${hits.length} ${hits.length === 1 ? t("resultado") : t("resultados")}`
              : cargando
                ? t("Leyendo…")
                : `${vault?.docs.length ?? 0} ${t("documentos")}`}
          </div>

          {/* El árbol de carpetas, que es como se mira una bóveda: por dónde
              guardaste las cosas. La lista por fecha responde a otra pregunta
              («qué tocaba ayer») y sigue estando, en su pestaña. */}
          {!hits && vista === "arbol" && arbol && (
            <Rama
              rama={arbol}
              nivel={0}
              abiertas={abiertas}
              onAlternar={alternarCarpeta}
              activo={abierto?.id}
              onAbrir={abrir}
            />
          )}

          {(hits ?? (vista === "recientes" ? recientes : [])).map((d) => {
            const id = d.id;
            const doc = porId.get(id);
            return (
              <button
                key={id}
                className="mem-fila"
                data-on={abierto?.id === id}
                onClick={() => abrir(id)}
              >
                {/* Aquí también fuera el punto: mismo motivo que en el árbol. */}
                <span className="mem-fila-txt">
                  <span className="mem-fila-tit">{d.title}</span>
                  <span className="mem-fila-sub">
                    {"excerpt" in d ? (d as Hit).excerpt : (doc?.folder || t("en la raíz"))}
                  </span>
                </span>
              </button>
            );
          })}
          {!cargando && hits?.length === 0 && <p className="mem-nada">{t("Nada con esas palabras.")}</p>}
          {!cargando && !hits && (vault?.docs.length ?? 0) === 0 && (
            <p className="mem-nada">{t("Ningún markdown en esa carpeta.")}</p>
          )}
        </aside>

        <section className="mem-doc">
          {modo === "esquema" ? (
            <>
              <div className="mem-doc-head">
                <h2>{t("Esquema")}</h2>
                {/* Un proyecto, o todos a la vez.
                    «Todos» estuvo quitado un rato porque leer veintiocho
                    proyectos tarda, y Munir lo pidió de vuelta el mismo día: es
                    la vista de «qué tengo montado», y esa la quiere. Va con la
                    hondura recortada (ver `escanearArbol`) para que el Capataz
                    reciba la foto de arriba y no las novecientas rutas. */}
                <select
                  className="esq-elige"
                  value={queEsquema}
                  onChange={(e) => setQueEsquema(e.currentTarget.value)}
                >
                  <option value="">{t("Elige un proyecto…")}</option>
                  {raizProyectos && (
                    <option value={raizProyectos}>{t("Todos mis proyectos")}</option>
                  )}
                  {proyectos.map((p) => (
                    <option key={p.path} value={p.path}>{p.name}</option>
                  ))}
                </select>
              </div>
              <MemoriaMapa
                mapa={mapa}
                ruta={queEsquema}
                trabajando={trabajando}
                cuando={cuandoMapa}
                error={errorMapa}
                onLeer={leerProyecto}
                onParar={pararLectura}
              />
            </>
          ) : modo === "grafo" ? (
            <>
              <div className="mem-doc-head">
                <h2>{t("Cerebro")}</h2>
                {/* Los dos cielos, con los MISMOS datos. La esfera lo pone todo
                    sobre un cascarón y por eso nada tapa a nada; la galaxia
                    separa los proyectos en cúmulos que flotan. Son dos formas
                    de mirar la misma bóveda, así que van juntas aquí y no en
                    dos pestañas distintas. */}
                <div className="mapa-vistas">
                  <button data-on={cielo === "esfera"} onClick={() => setCielo("esfera")}>
                    {t("Esfera")}
                  </button>
                  <button data-on={cielo === "galaxia"} onClick={() => setCielo("galaxia")}>
                    {t("Galaxia")}
                  </button>
                </div>
                <label className="mem-check">
                  <input
                    type="checkbox"
                    checked={soloConectados}
                    onChange={(e) => setSoloConectados(e.currentTarget.checked)}
                  />
                  {t("Solo los que tienen enlaces")}
                </label>
              </div>
              <MemoriaGrafo
                docs={vault?.docs ?? []}
                activo={abierto?.id}
                onAbrir={abrir}
                forma={cielo}
                soloConectados={soloConectados}
                skills={skills}
                onAbrirSkill={(folder) => {
                  setModo("doc");
                  abrirSkill(folder);
                }}
              />
            </>
          ) : abierto ? (
            <>
              <div className="mem-doc-head">
                <div className="mem-doc-titulo">
                  <h2>{porId.get(abierto.id)?.title ?? abierto.id}</h2>
                  <span className="mem-doc-ruta">{abierto.id}</span>
                </div>
                {sucio && !skillAbierta && (
                  <button className="np-btn" onClick={guardar} disabled={guardando}>
                    {guardando ? t("Guardando…") : t("Guardar")}
                  </button>
                )}
                {/* Una skill se lee aquí y se edita fuera: el guardado de esta
                    pantalla escribe en la bóveda, y una skill no está en ella.
                    Un botón «Editar» que no puede guardar es una trampa. */}
                {!skillAbierta && (
                  <button
                    className="mini"
                    onClick={() => setBorrador(editando ? null : abierto.text)}
                  >
                    {editando ? t("Ver") : t("Editar")}
                  </button>
                )}
                <button className="mini" onClick={() => void openPath(abierto.path).catch(() => {})}>
                  {t("Abrir fuera")}
                </button>
              </div>

              <div className="mem-doc-cuerpo" ref={cuerpo}>
                {editando ? (
                  <textarea
                    className="mem-editor"
                    value={borrador ?? ""}
                    spellCheck={false}
                    onChange={(e) => setBorrador(e.currentTarget.value)}
                  />
                ) : (
                  <div
                    className="mem-md"
                    onClick={alPulsarEnElTexto}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                )}

                {!editando && (entrantes.length > 0 || salientes.length > 0) && (
                  <div className="mem-enlaces">
                    {salientes.length > 0 && (
                      <div>
                        <h3>{t("Lleva a")}</h3>
                        {salientes.map((d) => (
                          <button key={d.id} className="mem-enlace" onClick={() => abrir(d.id)}>
                            {d.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {entrantes.length > 0 && (
                      <div>
                        {/* Los backlinks de Obsidian, con su nombre en
                            castellano: desde dónde llegabas tú a esta idea. */}
                        <h3>{t("Llegan desde")}</h3>
                        {entrantes.map((d) => (
                          <button key={d.id} className="mem-enlace" onClick={() => abrir(d.id)}>
                            {d.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mem-elige">
              <p>{t("Elige una nota de la izquierda, o busca lo que quieras recordar.")}</p>
              {vault && (
                <p className="card-hint">
                  {vault.obsidian
                    ? t("Es una bóveda de Obsidian: se lee tal cual, sin tocar nada.")
                    : t("Carpeta de markdown corriente: se lee igual.")}
                  {` · ${vault.docs.length} ${t("documentos")} · ${
                    vault.docs.filter((d) => d.links.length).length
                  } ${t("con enlaces")}`}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
