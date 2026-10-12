import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo } from "./Adeo";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS, WEB } from "./guion";
import { useDecir, useMedidas } from "./idioma";
import { Marca } from "./Marca";

/**
 * La última pantalla: dónde se descarga.
 *
 * La dirección es lo que tiene que quedar en la retina, así que es lo único
 * con caja y con color, y Adeo celebra subido encima de ella: el ojo va al
 * muñeco que se mueve y de ahí cae a lo que pisa. No se funde a negro al
 * acabar: el último fotograma es el que se queda de miniatura cuando el vídeo
 * se para, y tiene que seguir diciendo `adeorq.com`.
 */
export function Cierre({ entra }: { entra: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;
  const muelle = (desde: number, masa = 0.7) => spring({ frame: f - desde, fps, config: { damping: 200, mass: masa } });

  const marca = muelle(0, 0.9);
  const titulo = muelle(5);
  const web = muelle(12);
  const salta = spring({ frame: f - 20, fps, config: { damping: 11, mass: 0.55 } });
  const linea = muelle(24);
  const sistemas = muelle(32);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 24 * u, padding: "0 6%" }}>
      <div
        style={{
          opacity: marca,
          transform: `scale(${interpolate(marca, [0, 1], [0.82, 1])})`,
          filter: `drop-shadow(0 0 ${40 * u}px rgba(72,194,255,0.45))`,
        }}
      >
        <Marca tam={112 * u} />
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 92 * u,
          lineHeight: 1.04,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: COLOR.texto,
          textAlign: "center",
          opacity: titulo,
          transform: `translateY(${interpolate(titulo, [0, 1], [16, 0]) * u}px)`,
        }}
      >
        {decir(TEXTOS.cierre.titulo)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ transform: `scale(${salta})`, transformOrigin: "50% 100%" }}>
          <Adeo animo="lista" alto={126 * u} desde={entra + 22} semilla={9} />
        </div>
        <div
          style={{
            padding: `${14 * u}px ${38 * u}px`,
            borderRadius: 10 * u,
            border: `1px solid ${COLOR.bordeFuerte}`,
            backgroundColor: COLOR.panel,
            boxShadow: `0 0 ${46 * u}px rgba(77,159,255,0.28), inset 0 1px 0 rgba(255,255,255,0.10)`,
            fontFamily: FUENTE.mono,
            fontSize: 46 * u,
            fontWeight: 700,
            color: COLOR.marcaClaro,
            opacity: web,
            transform: `scale(${interpolate(web, [0, 1], [0.92, 1])})`,
          }}
        >
          {WEB}
        </div>
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 27 * u,
          fontWeight: 500,
          color: COLOR.texto,
          textAlign: "center",
          textWrap: "balance",
          opacity: linea,
          transform: `translateY(${interpolate(linea, [0, 1], [12, 0]) * u}px)`,
        }}
      >
        {decir(TEXTOS.cierre.linea)}
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 22 * u,
          color: COLOR.apagado,
          opacity: sistemas * 0.9,
        }}
      >
        {/* Windows y Linux, que es lo que hay hoy. Si algún día sale el de
            Mac, se cambia en `guion.ts`. */}
        {decir(TEXTOS.cierre.sistemas)}
      </div>
    </AbsoluteFill>
  );
}
