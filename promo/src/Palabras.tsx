import type { CSSProperties } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR } from "./casa";
import { useMedidas } from "./idioma";

/** Un renglón del guion, en palabras, y cada palabra en trozos: lo que va
    entre asteriscos, marcado. Los asteriscos pueden abrazar varias palabras
    («*una sola pantalla*») o ir pegados a un signo («*terminado*?»). */
function palabrasDe(renglon: string) {
  let marca = false;
  return renglon
    .split(" ")
    .filter(Boolean)
    .map((cruda) => {
      const trozos: { texto: string; marca: boolean }[] = [];
      cruda.split("*").forEach((t, i) => {
        if (i > 0) marca = !marca;
        if (t) trozos.push({ texto: t, marca });
      });
      return trozos;
    });
}

/**
 * Una frase que entra palabra a palabra: cada una sale de un desenfoque y sube
 * a su sitio, una cada `cada` fotogramas desde `entra`. Lo marcado con
 * asteriscos va en el azul de la marca, y un `\n` parte la frase en renglones.
 *
 * Es como entra TODO lo que se lee en la pieza. En las 21 referencias de Munir
 * el texto llega así, de dos a cinco palabras y con una sola en color; una
 * frase que aparece entera de golpe se lee como un rótulo, no como alguien
 * contándotelo.
 */
export function Palabras({ texto, entra, cada, style }: { texto: string; entra: number; cada: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  let k = 0;
  return (
    <div style={style}>
      {texto.split("\n").map((renglon, r) => (
        <div key={r}>
          {palabrasDe(renglon).map((trozos, i) => {
            const s = spring({ frame: frame - entra - k++ * cada, fps, config: { damping: 200, mass: 0.45 } });
            return (
              <span key={i}>
                {i > 0 && " "}
                <span
                  style={{
                    display: "inline-block",
                    opacity: s,
                    transform: `translateY(${(1 - s) * 0.3}em)`,
                    filter: s < 0.98 ? `blur(${(1 - s) * 10 * u}px)` : undefined,
                  }}
                >
                  {trozos.map((t, j) => (
                    <span key={j} style={t.marca ? { color: COLOR.marcaClaro } : undefined}>
                      {t.texto}
                    </span>
                  ))}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
