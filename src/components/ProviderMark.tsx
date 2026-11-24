// La marca de cada CLI, para los botones que abren una sesión con él.
//
// Hasta la 0.9.11 solo Claude tenía la suya y el resto salía con dos letras
// («CO», «GE», «CU»), que a 15px y en una fila de nueve botones no distingue
// nada: hay que leerlos uno a uno para encontrar el que quieres.
//
// Están DIBUJADOS aquí, no descargados. Son marcas registradas de otras
// empresas, un SVG de trazo hereda `currentColor` y se tiñe con el tono del
// proveedor y del tema (un PNG bajado de una web se queda con su fondo blanco
// en los 24 temas oscuros), y no añaden ni un archivo que se pueda perder.
//
// Los que Munir mandó el 29 de julio de 2026 —Codex, Cursor, opencode, Copilot
// y Antigravity— están rehechos MIRANDO su logo, así que siguen
// su forma real y no una idea mía de por dónde iban. Los que llevan hueco
// (Codex, Cursor, opencode, Copilot) lo llevan de verdad: se recortan con una
// máscara o con `fill-rule="evenodd"`, y por el agujero se ve el fondo que haya
// detrás. Pintar el hueco de un color no valdría: aquí el fondo cambia con el
// tema y con la fila donde esté el botón.
//
// El criterio de cada dibujo es que se reconozca de un vistazo a 15px, que es
// el tamaño real en la fila. Por eso son formas, no letras.
//
// Quien no está en esta lista sale con sus iniciales, que es honesto: dos letras
// no pretenden ser el logo de nadie (Munir quitó el 2026-07-29 dos dibujos que
// eran míos y no venían de su logo). Hoy le pasa a Pi: su marca es un patrón
// geométrico que no se leyó con claridad. Kimi llegó el 2026-11-23 y desde el
// 24 lleva su K de siempre.

import { useId } from "react";
import type { ReactElement } from "react";

// Once rayos alrededor de un núcleo: el estallido que todo el mundo lee como
// Claude, a diferencia de la chispa de cuatro puntas, que en 2026 la usa todo
// producto de la tierra para decir «esto lleva IA».
export const CLAUDE_BURST =
  "M12 10.8V2.8M12.65 10.99 16.97 4.26M13.09 11.5 20.37 8.18M13.19 12.17 21.11 13.31" +
  "M12.91 12.79 18.95 18.02M12.34 13.15 14.59 20.83M11.66 13.15 9.41 20.83" +
  "M11.09 12.79 5.05 18.02M10.81 12.17 2.89 13.31M10.91 11.5 3.63 8.18" +
  "M11.35 10.99 7.03 4.26";

/** Los trazos comparten estos ajustes: sin relleno y con las puntas redondas,
    que es lo que hace que a 15px se lean como un icono y no como un borrón. */
const T = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * El dibujo de cada uno. Recibe un id único porque los que llevan máscara la
 * tienen que referenciar por nombre, y en una página puede haber doce copias
 * del mismo icono: con el id repetido, todas usarían la máscara de la primera.
 */
const MARCAS: Record<string, (uid: string) => ReactElement> = {
  claude: () => <path d={CLAUDE_BURST} strokeWidth="2.5" {...T} />,

  // Codex: su nube de lóbulos con el prompt `>_` recortado dentro.
  codex: (uid) => (
    <>
      <mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        {/* Blanco es lo que se ve. La nube se compone de círculos solapados, que
            es más fiel a su silueta de lóbulos que un contorno dibujado a mano. */}
        <g fill="#fff">
          <circle cx="12" cy="12" r="7.1" />
          <circle cx="8.7" cy="6.7" r="4.9" />
          <circle cx="15.4" cy="7" r="4.8" />
          <circle cx="18.4" cy="12.6" r="4.8" />
          <circle cx="15" cy="17.9" r="4.8" />
          <circle cx="8.2" cy="17.6" r="4.8" />
          <circle cx="5.2" cy="11.8" r="4.8" />
        </g>
        {/* Negro es el agujero: por aquí se ve el fondo. */}
        <g fill="none" stroke="#000" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.6 8.5 9.9 11.9 6.6 15.3" />
          <path d="M12.9 15.3h5" />
        </g>
      </mask>
      <rect x="0" y="0" width="24" height="24" fill="currentColor" mask={`url(#${uid})`} />
    </>
  ),

  // Gemini: la estrella de cuatro puntas de lados cóncavos.
  gemini: () => (
    <path
      d="M12 1.6c0 5.7 4.7 10.4 10.4 10.4C16.7 12 12 16.7 12 22.4 12 16.7 7.3 12 1.6 12 7.3 12 12 7.3 12 1.6Z"
      fill="currentColor"
    />
  ),

  // Copilot: su cara. Las dos lentes y la banda de abajo son huecos de verdad,
  // y los dos ojos vuelven a ser marca dentro del hueco.
  copilot: (uid) => (
    <>
      <mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <path
          d="M2.6 13.4a9.4 9.4 0 0 1 18.8 0c0 4.7-4.2 7.8-9.4 7.8s-9.4-3.1-9.4-7.8Z"
          fill="#fff"
        />
        <g fill="#000">
          <rect x="4.9" y="6.9" width="6.1" height="6.5" rx="2.7" />
          <rect x="13" y="6.9" width="6.1" height="6.5" rx="2.7" />
          <rect x="4.8" y="13.5" width="14.4" height="5.7" rx="2.5" />
        </g>
        <g fill="#fff">
          <rect x="9.2" y="15" width="1.6" height="3.2" rx="0.8" />
          <rect x="13.2" y="15" width="1.6" height="3.2" rx="0.8" />
        </g>
      </mask>
      <rect x="0" y="0" width="24" height="24" fill="currentColor" mask={`url(#${uid})`} />
    </>
  ),

  // opencode: su bloque, un marco grueso y vertical con el hueco dentro. Los
  // dos rectángulos van en un solo path para que `evenodd` recorte el interior.
  opencode: () => (
    <path
      d="M4.6 2.4h14.8v19.2H4.6ZM8.3 6.3h7.4v11.4H8.3Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),

  // Antigravity: su «A» de dos arcos, ancha en el centro y afilada en las
  // puntas. Va monocroma: la de verdad lleva un degradado de cuatro colores que
  // aquí impediría teñirla con el tono del tema.
  agy: () => (
    <path
      d="M2.2 21.3C3.4 13.5 6.8 1.4 12 1.4s8.6 12.1 9.8 19.9c.1.8-1 1.1-1.4.4-2-3.5-5-8.1-8.4-8.1s-6.4 4.6-8.4 8.1c-.4.7-1.5.4-1.4-.4Z"
      fill="currentColor"
    />
  ),

  // Cursor: su prisma, con la cara de dentro recortada en forma de flecha.
  cursor: () => (
    <path
      d="M12 1.6 21.4 7v10L12 22.4 2.6 17V7ZM4.3 7.4h15.4L12 21Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  ),

  // Grok: el logo de la propia app, no la X de xAI que iba aquí hasta el
  // 2026-11-24 (Munir: «¿estás seguro que ese es el logo [...] de grok?»).
  // Son los dos trazos blancos del favicon oficial, grok.com/images/favicon.svg
  // (bajado ese día), sin su cuadrado negro: ocupan de 56 a 456 en su caja de
  // 512, y el `transform` los lleva a la de 24.
  grok: () => (
    <g transform="translate(-3.36 -3.36) scale(.06)" fill="currentColor">
      <path d="M210.484 312.759L343.465 210.383C349.984 205.364 359.302 207.322 362.408 215.117C378.758 256.231 371.454 305.64 338.925 339.563C306.397 373.487 261.137 380.927 219.768 363.983L174.577 385.803C239.394 432.008 318.104 420.581 367.289 369.251C406.303 328.564 418.386 273.104 407.088 223.091L407.19 223.198C390.807 149.726 411.218 120.359 453.03 60.3072C454.02 58.8833 455.01 57.4595 456 56L400.978 113.382V113.204L210.45 312.794Z" />
      <path d="M183.042 337.641C136.519 291.294 144.54 219.567 184.236 178.203C213.59 147.59 261.683 135.096 303.666 153.464L348.755 131.75C340.632 125.627 330.221 119.042 318.275 114.414C264.277 91.2407 199.63 102.774 155.735 148.516C113.513 192.549 100.236 260.254 123.036 318.027C140.069 361.206 112.148 391.748 84.0229 422.575C74.0561 433.503 64.0553 444.431 56 456L183.007 337.677Z" />
    </g>
  ),

  // Kiro: su fantasma.
  kiro: () => (
    <g strokeWidth="1.8" {...T}>
      <path d="M4.6 20.2V10.4a7.4 7.4 0 0 1 14.8 0v9.8l-2.5-1.8-2.4 1.8-2.5-1.8-2.4 1.8-2.5-1.8Z" />
      <path d="M9.6 10.6v1.6M14.4 10.6v1.6" strokeWidth="2.2" />
    </g>
  ),

  // Kimi: su K de siempre, fina, con el punto en gota arriba a la derecha.
  // Calcada fila a fila del icono de su app (kimi.com/pwa-512.png, 2026-11-24):
  // el palo, el brazo a 45° y la pierna a ~36°, en las coordenadas de ese
  // icono de 512 y escalada a 24. Munir, 2026-11-24: «cambia el logo de kimi por
  // su mítica K»; el 23-nov llevaba el de Kimi Code (la cúpula con `>_`).
  kimi: () => (
    <g transform="translate(12 12) scale(.0777) translate(-289.5 -227)" fill="currentColor">
      <path d="M148 140H189V252L301 140H359L253 246L343 310Q357 313 364 320V364H354Q342 363 332 357L225 279L189 315V364H148Z" />
      <path d="M380 141V115.5A25.5 25.5 0 1 1 405.5 141Z" />
    </g>
  ),

  // PowerShell: el prompt, un galón y su línea.
  shell: () => (
    <g strokeWidth="2.1" {...T}>
      <path d="M4.5 7.5 9 12l-4.5 4.5" />
      <path d="M12 17h7.5" />
    </g>
  ),
};

export function tieneMarca(id: string): boolean {
  return id in MARCAS;
}

/**
 * La marca del proveedor. Devuelve null si no tenemos dibujo suyo, para que
 * quien la use caiga en las iniciales en vez de pintar un hueco.
 */
export default function ProviderMark({ id, title }: { id: string; title?: string }) {
  // Un id por instancia: dos máscaras con el mismo nombre en la misma página y
  // todas las copias del icono usan la primera.
  const uid = `pm${useId().replace(/:/g, "")}-${id}`;
  const Dibujo = MARCAS[id];
  if (!Dibujo) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      className="prov-mark"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {Dibujo(uid)}
    </svg>
  );
}
