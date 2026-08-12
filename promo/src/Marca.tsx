import { COLOR } from "./casa";

/**
 * El logotipo de Adeorq: la proa.
 *
 * El `path` está copiado LETRA POR LETRA de `web/assets/adeorq.svg`, incluido
 * el degradado vertical. No se redibuja a ojo: es una marca, y una marca
 * redibujada se nota. El hueco interior conserva su base cóncava, que es lo
 * que hace que se lea como una proa y no como un triángulo.
 */
export function Marca({ tam = 120, opacidad = 1 }: { tam?: number; opacidad?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 1024 1024" style={{ opacity: opacidad }}>
      <defs>
        <linearGradient id="marca" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={COLOR.marcaClaro} />
          <stop offset="1" stopColor={COLOR.marcaOscuro} />
        </linearGradient>
      </defs>
      <path
        fill="url(#marca)"
        fillRule="evenodd"
        d="M 236 112 L 788 112 L 1016 756 L 944 848 L 80 848 L 8 756 Z
           M 512 240 L 712 730 Q 512 572 312 730 Z"
      />
    </svg>
  );
}
