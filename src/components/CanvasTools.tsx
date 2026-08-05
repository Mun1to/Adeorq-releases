import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { ToolKind } from "../lib/piezas";
import { useT } from "../lib/i18n";

// Las utilidades del lienzo: lo que uno abre una web para hacer.
//
// Formatear un JSON, probar una expresión regular, comparar dos textos, sacar
// un hash o una contraseña. Cosas de treinta segundos por las que se acaba
// yendo a una página cualquiera, pegando ahí lo que estabas mirando. Y ahí
// está el motivo real de que vivan aquí: lo que se pega en esas webs suele ser
// justo lo que no debería salir de tu equipo (un token, una respuesta de una
// API, un trozo de base de datos). Esto no manda nada a ninguna parte.
//
// Todas comparten forma: una entrada, un resultado y ni un botón de más.

/** Icono de una utilidad, con el mismo trazo que los demás del lienzo. */
const T = ({ children }: { children: ReactElement | ReactElement[] }) => (
  <svg
    viewBox="0 0 20 20"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/* ------------------------------------------------------------------- JSON */

function JsonTool() {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [salida, setSalida] = useState("");
  const [mal, setMal] = useState("");

  const trabajar = (compacto: boolean) => {
    if (!texto.trim()) return;
    try {
      const dato: unknown = JSON.parse(texto);
      setSalida(JSON.stringify(dato, null, compacto ? 0 : 2));
      setMal("");
    } catch (e) {
      // El mensaje del motor dice la POSICIÓN exacta del fallo, que es lo
      // único que de verdad ayuda cuando el JSON viene de un log.
      setMal(e instanceof Error ? e.message : String(e));
      setSalida("");
    }
  };

  return (
    <div className="tool">
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Pega aquí el JSON")}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="tool-row">
        <button className="tool-btn" onClick={() => trabajar(false)}>
          {t("Ordenar")}
        </button>
        <button className="tool-btn" onClick={() => trabajar(true)}>
          {t("Comprimir")}
        </button>
        {!!salida && (
          <button className="tool-btn" onClick={() => void navigator.clipboard.writeText(salida)}>
            {t("Copiar")}
          </button>
        )}
      </div>
      {mal && <p className="tool-mal">{mal}</p>}
      {salida && <pre className="tool-out nowheel">{salida}</pre>}
    </div>
  );
}

/* ------------------------------------------------------------- expresiones */

function RegexTool() {
  const { t } = useT();
  const [patron, setPatron] = useState("");
  const [banderas, setBanderas] = useState("g");
  const [texto, setTexto] = useState("");

  const { hits, mal } = useMemo(() => {
    if (!patron) return { hits: [] as string[], mal: "" };
    try {
      const re = new RegExp(patron, banderas.includes("g") ? banderas : `${banderas}g`);
      return { hits: [...texto.matchAll(re)].map((m) => m[0]), mal: "" };
    } catch (e) {
      return { hits: [], mal: e instanceof Error ? e.message : String(e) };
    }
  }, [patron, banderas, texto]);

  return (
    <div className="tool">
      <div className="tool-row">
        <input
          className="tool-line nodrag"
          placeholder={t("patrón")}
          value={patron}
          onChange={(e) => setPatron(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <input
          className="tool-line tool-flags nodrag"
          placeholder="gi"
          value={banderas}
          onChange={(e) => setBanderas(e.currentTarget.value.replace(/[^gimsuy]/g, ""))}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Texto donde buscar")}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {mal ? (
        <p className="tool-mal">{mal}</p>
      ) : (
        <p className="tool-nota">
          {hits.length} {hits.length === 1 ? t("coincidencia") : t("coincidencias")}
        </p>
      )}
      {!!hits.length && (
        <pre className="tool-out nowheel">{hits.slice(0, 200).join("\n")}</pre>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- comparar */

/** Diferencia por líneas, sin librería: qué falta y qué sobra respecto a la
    otra. No es un diff con contexto ni pretende serlo; para "¿en qué se
    diferencian estos dos pegotes?" es exactamente lo que hace falta. */
function DiffTool() {
  const { t } = useT();
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const filas = useMemo(() => {
    const izq = a.split("\n");
    const der = b.split("\n");
    const enDer = new Set(der);
    const enIzq = new Set(izq);
    return [
      ...izq.filter((l) => !enDer.has(l)).map((l) => ({ signo: "-", l })),
      ...der.filter((l) => !enIzq.has(l)).map((l) => ({ signo: "+", l })),
    ];
  }, [a, b]);

  return (
    <div className="tool">
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Antes")}
        value={a}
        onChange={(e) => setA(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Después")}
        value={b}
        onChange={(e) => setB(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <p className="tool-nota">
        {filas.length ? `${filas.length} ${t("líneas distintas")}` : t("Iguales")}
      </p>
      {!!filas.length && (
        <pre className="tool-out nowheel">
          {filas.map((f, i) => (
            <span key={i} className={f.signo === "+" ? "tool-mas" : "tool-menos"}>
              {f.signo} {f.l}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- codificador */

function CodeTool() {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [salida, setSalida] = useState("");

  const hacer = (que: "b64" | "deb64" | "url" | "deurl") => {
    try {
      if (que === "b64") {
        // Por los bytes UTF-8: btoa a pelo revienta con cualquier tilde.
        setSalida(btoa(String.fromCharCode(...new TextEncoder().encode(texto))));
      } else if (que === "deb64") {
        const bin = atob(texto.trim());
        setSalida(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      } else if (que === "url") {
        setSalida(encodeURIComponent(texto));
      } else {
        setSalida(decodeURIComponent(texto));
      }
    } catch (e) {
      setSalida(e instanceof Error ? `⚠ ${e.message}` : String(e));
    }
  };

  return (
    <div className="tool">
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Texto")}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="tool-row tool-wrap">
        <button className="tool-btn" onClick={() => hacer("b64")}>
          → base64
        </button>
        <button className="tool-btn" onClick={() => hacer("deb64")}>
          base64 →
        </button>
        <button className="tool-btn" onClick={() => hacer("url")}>
          → URL
        </button>
        <button className="tool-btn" onClick={() => hacer("deurl")}>
          URL →
        </button>
      </div>
      {salida && <pre className="tool-out nowheel">{salida}</pre>}
    </div>
  );
}

/* -------------------------------------------------------------------- hash */

function HashTool() {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [hashes, setHashes] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    if (!texto) {
      setHashes([]);
      return;
    }
    let vivo = true;
    const bytes = new TextEncoder().encode(texto);
    void Promise.all(
      (["SHA-256", "SHA-1"] as const).map(async (alg) => {
        const buf = await crypto.subtle.digest(alg, bytes);
        const hex = [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return [alg, hex] as [string, string];
      }),
    ).then((r) => vivo && setHashes(r));
    return () => {
      vivo = false;
    };
  }, [texto]);

  return (
    <div className="tool">
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Texto del que sacar el hash")}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {hashes.map(([alg, hex]) => (
        <div key={alg} className="tool-par">
          <span className="tool-clave">{alg}</span>
          <code className="tool-valor" onClick={() => void navigator.clipboard.writeText(hex)}>
            {hex}
          </code>
        </div>
      ))}
      {/* MD5 no está: el navegador no lo trae y meter una librería para un
          algoritmo roto desde hace veinte años no compensa. */}
    </div>
  );
}

/* ------------------------------------------------------------ contraseñas */

const ABC = {
  letras: "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  numeros: "23456789",
  signos: "!#$%&*+-=?@^_",
};

function PassTool() {
  const { t } = useT();
  const [largo, setLargo] = useState(20);
  const [signos, setSignos] = useState(true);
  const [claves, setClaves] = useState<string[]>([]);

  const generar = () => {
    const abc = ABC.letras + ABC.numeros + (signos ? ABC.signos : "");
    // getRandomValues, no Math.random: Math.random es predecible y esto son
    // contraseñas. Y el módulo se descarta para no sesgar los primeros.
    const salen = Array.from({ length: 5 }, () => {
      const bytes = new Uint32Array(largo);
      crypto.getRandomValues(bytes);
      const tope = Math.floor(0xffffffff / abc.length) * abc.length;
      let clave = "";
      for (let i = 0; clave.length < largo; i++) {
        if (i >= bytes.length) {
          crypto.getRandomValues(bytes);
          i = 0;
        }
        if (bytes[i] < tope) clave += abc[bytes[i] % abc.length];
      }
      return clave;
    });
    setClaves(salen);
  };

  useEffect(generar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tool">
      <div className="tool-row">
        <label className="tool-nota">
          {t("largo")}
          <input
            className="tool-num nodrag"
            type="number"
            min={6}
            max={64}
            value={largo}
            onChange={(e) => setLargo(Math.min(64, Math.max(6, Number(e.currentTarget.value) || 6)))}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        <label className="tool-nota">
          <input type="checkbox" checked={signos} onChange={(e) => setSignos(e.currentTarget.checked)} />
          {t("signos")}
        </label>
        <button className="tool-btn" onClick={generar}>
          {t("Otras")}
        </button>
      </div>
      <div className="tool-lista nowheel">
        {claves.map((c) => (
          <code key={c} className="tool-valor" onClick={() => void navigator.clipboard.writeText(c)}>
            {c}
          </code>
        ))}
      </div>
      <p className="tool-nota">{t("Clic para copiar. No salen de este equipo.")}</p>
    </div>
  );
}

/* --------------------------------------------------------------------- ids */

function IdTool() {
  const { t } = useT();
  const [ids, setIds] = useState<string[]>([]);
  const generar = () => setIds(Array.from({ length: 6 }, () => crypto.randomUUID()));
  useEffect(generar, []);

  return (
    <div className="tool">
      <div className="tool-row">
        <button className="tool-btn" onClick={generar}>
          {t("Otros")}
        </button>
        <span className="tool-nota">UUID v4</span>
      </div>
      <div className="tool-lista nowheel">
        {ids.map((id) => (
          <code key={id} className="tool-valor" onClick={() => void navigator.clipboard.writeText(id)}>
            {id}
          </code>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ color */

/** Convierte lo que el navegador ya sabe interpretar a hex, rgb y hsl. */
function tonos(hex: string): Array<[string, string]> {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    h =
      max === rr
        ? ((gg - bb) / d) % 6
        : max === gg
          ? (bb - rr) / d + 2
          : (rr - gg) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return [
    ["hex", hex.toUpperCase()],
    ["rgb", `rgb(${r}, ${g}, ${b})`],
    ["hsl", `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`],
  ];
}

function ColorTool() {
  const [color, setColor] = useState("#4d9fff");
  return (
    <div className="tool">
      <label className="tool-color">
        <span style={{ background: color }} />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.currentTarget.value)}
          className="nodrag"
        />
      </label>
      {tonos(color).map(([k, v]) => (
        <div key={k} className="tool-par">
          <span className="tool-clave">{k}</span>
          <code className="tool-valor" onClick={() => void navigator.clipboard.writeText(v)}>
            {v}
          </code>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ texto */

function StatsTool() {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const filas = useMemo(() => {
    const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
    return [
      [t("caracteres"), String(texto.length)],
      [t("sin espacios"), String(texto.replace(/\s/g, "").length)],
      [t("palabras"), String(palabras)],
      [t("líneas"), String(texto ? texto.split("\n").length : 0)],
      // Regla de servilleta, no una cuenta exacta: un token viene a ser unos
      // cuatro caracteres. Sirve para "¿esto le cabe al agente?".
      [t("tokens (aprox.)"), String(Math.ceil(texto.length / 4))],
    ] as Array<[string, string]>;
  }, [texto, t]);

  return (
    <div className="tool">
      <textarea
        className="tool-in nodrag nowheel"
        placeholder={t("Pega el texto")}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {filas.map(([k, v]) => (
        <div key={k} className="tool-par">
          <span className="tool-clave">{k}</span>
          <span className="tool-valor">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- catálogo */

export const TOOL_BODIES: Record<ToolKind, () => ReactElement> = {
  json: JsonTool,
  regex: RegexTool,
  diff: DiffTool,
  code: CodeTool,
  hash: HashTool,
  pass: PassTool,
  id: IdTool,
  color: ColorTool,
  stats: StatsTool,
};

export const TOOLS: Array<{ kind: ToolKind; icon: ReactElement; label: string }> = [
  {
    kind: "json",
    icon: (
      <T>
        <path d="M7.5 3.5c-2 0-2.5 1-2.5 2.5S5 8.5 3.5 10c1.5 1.5 1.5 2.5 1.5 4s.5 2.5 2.5 2.5" />
        <path d="M12.5 3.5c2 0 2.5 1 2.5 2.5s0 2.5 1.5 4c-1.5 1.5-1.5 2.5-1.5 4s-.5 2.5-2.5 2.5" />
      </T>
    ),
    label: "JSON",
  },
  {
    kind: "regex",
    icon: (
      <T>
        <path d="M10 4v8M6.5 6l7 4M13.5 6l-7 4" />
        <rect x="4.5" y="14" width="3" height="2.5" rx="0.8" />
      </T>
    ),
    label: "Expresión regular",
  },
  {
    kind: "diff",
    icon: (
      <T>
        <path d="M4 6.5h5M6.5 4v5M11 13.5h5" />
        <rect x="2.5" y="2.5" width="15" height="15" rx="3" />
      </T>
    ),
    label: "Comparar textos",
  },
  {
    kind: "code",
    icon: (
      <T>
        <path d="M7 6.5L3.5 10 7 13.5M13 6.5L16.5 10 13 13.5M11.5 4.5l-3 11" />
      </T>
    ),
    label: "Codificador",
  },
  {
    kind: "hash",
    icon: (
      <T>
        <path d="M4 7.5h12M4 12.5h12M8 3.5l-1.5 13M13.5 3.5L12 16.5" />
      </T>
    ),
    label: "Hash",
  },
  {
    kind: "pass",
    icon: (
      <T>
        <rect x="3.5" y="8.5" width="13" height="8" rx="2.5" />
        <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5M10 11.5v2" />
      </T>
    ),
    label: "Contraseñas",
  },
  {
    kind: "id",
    icon: (
      <T>
        <rect x="2.5" y="4.5" width="15" height="11" rx="2.5" />
        <circle cx="7" cy="9.5" r="1.8" />
        <path d="M4.5 13.5c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M12 8.5h3.5M12 11.5h3.5" />
      </T>
    ),
    label: "Identificadores",
  },
  {
    kind: "color",
    icon: (
      <T>
        <path d="M10 3.2a6.8 6.8 0 1 0 0 13.6c.8 0 1.4-.6 1.4-1.4 0-.9-.8-1.3-.8-2.1 0-.7.6-1.3 1.3-1.3h1.4A3.9 3.9 0 0 0 17 8.1c0-2.7-3.1-4.9-7-4.9z" />
        <circle cx="6.9" cy="9" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </T>
    ),
    label: "Color",
  },
  {
    kind: "stats",
    icon: (
      <T>
        <path d="M4 16.5V9M8 16.5V4.5M12 16.5v-5M16 16.5V7" />
      </T>
    ),
    label: "Contar texto",
  },
];
