// La chapa de la cabecera de un panel: qué herramienta corre ahí dentro.
//
// La cabecera gastaba un tercio de su ancho en las palabras «✦ CLAUDE», más un
// cuadrado verde al lado que solo significaba «el proceso sigue vivo». Los dos
// trabajos caben en un glifo de 22px: la marca dice cuál es, y se apaga cuando
// el proceso se ha ido.
//
// Los dibujos viven todos en ProviderMark.tsx. Aquí solo se decide cuál va y
// de qué color, porque antes esto conocía tres —Claude, Antigravity y la
// consola— y cualquier otra cosa se anunciaba como PowerShell: abrías Codex y
// la cabecera decía otra herramienta distinta de la que estaba corriendo.
// Es el mismo defecto que el modelo inventado, en el mismo sitio de la
// pantalla (Munir, 2026-07-29).

import ProviderMark, { CLAUDE_BURST, tieneMarca } from "./ProviderMark";
import { PROVIDERS, providerOf } from "../lib/providers";

/** El id de un CLI de providers.ts, o "shell" para una consola pelada. */
export type PaneKind = string;

/** El color de la chapa. La consola no es de nadie, así que va con el gris de
    la casa y sin fondo, que es lo que dice el CSS cuando no hay tono. */
export function tonoDeKind(kind: PaneKind): string | undefined {
  return kind === "shell" ? undefined : providerOf(kind).hue;
}

export function nombreDeKind(kind: PaneKind): string {
  if (kind === "shell") return "PowerShell";
  const p = PROVIDERS.find((x) => x.id === kind);
  return p ? (p.id === "agy" ? "Antigravity (agy)" : p.label) : "Terminal";
}

/**
 * De la línea de comando al CLI que arranca. Se mira el ejecutable como un
 * token entero y no con un `includes`: «amp» suelto aparece dentro de
 * cualquier ruta, y bastaría un `C:\campamento\` para que un panel se
 * anunciara como Amp.
 */
export function kindDeComando(joined: string): PaneKind {
  const linea = joined.toLowerCase();
  for (const p of PROVIDERS) {
    const exe = p.exe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[\\\\/\\s"'])${exe}(?:\\.exe|\\.cmd)?(?:\\s|["']|$)`).test(linea)) {
      return p.id;
    }
  }
  return "shell";
}

/**
 * El estallido de Claude por su cuenta, para los botones que abren una sesión
 * suya. Era un ✦, que significa «alguna IA» y nada más preciso.
 */
export function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" className="claude-mark" aria-hidden="true">
      <path
        d={CLAUDE_BURST}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function KindIcon({ kind, exited }: { kind: PaneKind; exited?: boolean }) {
  const nombre = nombreDeKind(kind);
  const label = exited ? `${nombre} · el proceso ya terminó` : nombre;
  const tono = tonoDeKind(kind);
  return (
    <span
      className="pane-kind"
      data-kind={kind}
      data-exited={!!exited}
      data-tip={label}
      // Por variable y no como `color` directo: así el gris del proceso muerto,
      // que va en el CSS, sigue pudiendo ganar. Un color en línea no lo dejaría.
      style={tono ? ({ ["--k"]: tono } as React.CSSProperties) : undefined}
    >
      {tieneMarca(kind) ? (
        <ProviderMark id={kind} title={label} />
      ) : (
        // Un CLI sin dibujo: su inicial antes que un hueco.
        <span className="kind-letra" aria-label={label} role="img">
          {nombre.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
