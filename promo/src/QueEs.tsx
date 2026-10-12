import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS } from "./guion";
import { trocear, useDecir, useMedidas } from "./idioma";
import { Dato } from "./Rotulo";
import { QUE_ES } from "./tiempos";

/**
 * Qué es Adeorq, dicho antes de enseñar ninguna pantalla.
 *
 * Empieza como empieza todo en Adeorq: alguien teclea una pregunta en una
 * terminal. La respuesta llega palabra a palabra, luego los programas con los
 * que funciona (por su nombre, escrito: los logotipos son marcas de otros), y
 * al final la frase que distingue al producto, la de la cuenta.
 */
export function QueEs({ entra }: { entra: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;
  const muelle = (desde: number, masa = 0.6) => spring({ frame: f - desde, fps, config: { damping: 200, mass: masa } });

  const orden = decir(TEXTOS.queEs.orden);
  const escritas = Math.max(0, Math.min(orden.length, Math.floor((f - QUE_ES.tecleo) / QUE_ES.porLetra)));
  // Mientras escribe, el cursor está fijo; al acabar, parpadea.
  const cursor = escritas < orden.length || Math.floor(f / 14) % 2 === 0;
  const caja = muelle(0);

  const palabras = trocear(decir(TEXTOS.queEs.titular)).flatMap((t) =>
    t.texto
      .trim()
      .split(/\s+/)
      .map((palabra) => ({ palabra, marca: t.marca })),
  );
  const clientes = [...TEXTOS.queEs.clientes];
  const yMas = muelle(QUE_ES.clientes + clientes.length * QUE_ES.entreClientes);
  const cuenta = muelle(QUE_ES.cuenta);
  const aviso = muelle(QUE_ES.clientes);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 * u, padding: "0 7%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14 * u,
          padding: `${12 * u}px ${22 * u}px`,
          borderRadius: 8 * u,
          border: `1px solid ${COLOR.bordeFuerte}`,
          backgroundColor: COLOR.panel,
          fontFamily: FUENTE.mono,
          fontSize: 28 * u,
          color: COLOR.texto,
          opacity: caja,
          transform: `translateY(${interpolate(caja, [0, 1], [14, 0]) * u}px)`,
        }}
      >
        <span style={{ color: COLOR.acento, fontWeight: 700 }}>&gt;</span>
        <span style={{ whiteSpace: "pre" }}>{orden.slice(0, escritas)}</span>
        <span
          style={{
            width: 15 * u,
            height: 32 * u,
            marginLeft: -8 * u,
            backgroundColor: COLOR.acento,
            opacity: cursor ? 1 : 0,
          }}
        />
      </div>

      <div
        style={{
          maxWidth: 1500 * u,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: 20 * u,
          fontFamily: FUENTE.texto,
          fontSize: 76 * u,
          lineHeight: 1.14,
          fontWeight: 800,
          letterSpacing: "-0.03em",
        }}
      >
        {palabras.map(({ palabra, marca }, i) => {
          const s = muelle(QUE_ES.titular + i * QUE_ES.porPalabra, 0.5);
          return (
            <span
              key={i}
              style={{
                color: marca ? COLOR.marcaClaro : COLOR.texto,
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [26, 0]) * u}px)`,
                filter: s < 0.98 ? `blur(${(1 - s) * 8 * u}px)` : undefined,
              }}
            >
              {palabra}
            </span>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 12 * u }}>
        {clientes.map((c, i) => (
          <Dato key={c} texto={c} letra={FUENTE.mono} entra={entra + QUE_ES.clientes + i * QUE_ES.entreClientes} />
        ))}
        <span
          style={{
            fontFamily: FUENTE.texto,
            fontSize: 24 * u,
            color: COLOR.apagado,
            marginLeft: 6 * u,
            opacity: yMas,
          }}
        >
          {decir(TEXTOS.queEs.yMas)}
        </span>
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 36 * u,
          fontWeight: 600,
          color: COLOR.texto,
          textAlign: "center",
          textWrap: "balance",
          opacity: cuenta,
          transform: `translateY(${interpolate(cuenta, [0, 1], [18, 0]) * u}px)`,
        }}
      >
        {trocear(decir(TEXTOS.queEs.cuenta)).map((t, i) => (
          <span key={i} style={{ color: t.marca ? COLOR.hecho : undefined, fontWeight: t.marca ? 800 : undefined }}>
            {t.texto}
          </span>
        ))}
      </div>

      {/* El aviso de marcas va en la misma escena que los nombres, no al final
          entre los créditos: quien ve «Claude Code» escrito tiene que poder
          leer ahí mismo que Adeorq no es de Anthropic. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 34 * u,
          padding: "0 6%",
          textAlign: "center",
          fontFamily: FUENTE.texto,
          fontSize: 17 * u,
          color: COLOR.apagado,
          opacity: aviso * 0.85,
        }}
      >
        {decir(TEXTOS.queEs.aviso)}
      </div>
    </AbsoluteFill>
  );
}
