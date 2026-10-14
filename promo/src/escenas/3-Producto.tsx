import { AbsoluteFill, Easing, Img, getStaticFiles, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES } from "../Adeo";
import { COLOR, FUENTE } from "../casa";
import { TEXTOS, type EscenaPantalla, type Foco, type Idioma } from "../guion";
import { useDecir, useIdioma, useMedidas } from "../idioma";
import { Palabras } from "../Palabras";
import { PANTALLA, PASO, clicEn, focosQueCaben, haciaElFoco, llegaDato, saleLaCamara } from "../tiempos";

/** Si hay una captura hecha en el idioma de la pieza (`pantallas/en/...`), esa;
    si no, la de todos. Una Cabina con las pestañas en inglés dentro del vídeo
    en español se nota, pero no tener el vídeo por eso se nota más. */
function captura(imagen: string, idioma: Idioma) {
  const hay = (ruta: string) => getStaticFiles().some((f) => f.name === ruta);
  const propia = `pantallas/${idioma}/${imagen}`;
  const comun = `pantallas/${imagen}`;
  return hay(propia) ? staticFile(propia) : hay(comun) ? staticFile(comun) : null;
}

/** Las capturas de pantalla entera las saca el equipo de
    `scripts/laboratorio/capturas` a 3840 x 2160. */
const PROPORCION = 16 / 9;

/** Dónde va la captura en el cuadro, en píxeles. Una de 16:9 lo llena entero.
    Una suelta de otra proporción (la del enjambre es una pieza recortada) sale
    como una ventana flotando sobre el fondo de la marca, a cuatro quintos del
    alto: estirada hasta llenar el cuadro se vería borrosa y sin bordes. */
function marcoDe(width: number, height: number, proporcion = PROPORCION) {
  if (Math.abs(proporcion - PROPORCION) < 0.01) {
    const ancho = Math.min(width, height * PROPORCION);
    const alto = ancho / PROPORCION;
    return { x: (width - ancho) / 2, y: (height - alto) / 2, ancho, alto, ventana: false };
  }
  const alto = Math.min(height * 0.8, (width * 0.8) / proporcion);
  const ancho = alto * proporcion;
  return { x: (width - ancho) / 2, y: (height - alto) / 2, ancho, alto, ventana: true };
}

/** El hueco de una captura que todavía no existe: su nombre sobre un rayado.
    Así una pantalla nueva se puede escribir en el guion, y ver el vídeo
    entero, antes de tener su imagen; y lo que falta se ve de lejos en vez de
    tumbar el render con un 404. */
function Hueco({ escena }: { escena: EscenaPantalla }) {
  const { u } = useMedidas();
  const decir = useDecir();
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 14 * u,
        lineHeight: 1.2,
        fontFamily: FUENTE.mono,
        color: COLOR.apagado,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 ${22 * u}px, rgba(140,170,220,0.05) ${22 * u}px ${44 * u}px)`,
      }}
    >
      <span style={{ fontSize: 20 * u, letterSpacing: "0.16em", textTransform: "uppercase" }}>{decir(TEXTOS.pendiente)}</span>
      <span style={{ fontFamily: FUENTE.texto, fontSize: 76 * u, fontWeight: 750, color: COLOR.texto }}>{decir(escena.nombre)}</span>
      <span style={{ fontSize: 20 * u }}>{escena.imagen}</span>
    </AbsoluteFill>
  );
}

/** Qué mira la cámara: el punto de la captura que cae en el centro del cuadro
    (de 0 a 1) y cuántos aumentos. */
type Camara = { cx: number; cy: number; z: number };
const ENTERA: Camara = { cx: 0.5, cy: 0.5, z: 1 };

/** La cámara de una función: la encuadra con aire alrededor, un poco subida
    para dejarle sitio a su frase debajo, y sin salirse de la captura. */
function camaraDe([x, y, w, h]: Foco["en"]): Camara {
  const z = Math.max(1.15, Math.min(2.6, 0.78 / w, 0.6 / h));
  const medio = 0.5 / z;
  const pinza = (v: number) => Math.max(medio, Math.min(1 - medio, v));
  return { cx: pinza(x + w / 2), cy: pinza(y + h / 2 + 0.05 / z), z };
}

/** La misma cámara, un poco más abierta y sin salirse de la captura: desde
    ahí se acerca a su pieza una escena que entra `directo`. */
function abierta(c: Camara): Camara {
  const z = Math.max(1, c.z * 0.78);
  const medio = 0.5 / z;
  const pinza = (v: number) => Math.max(medio, Math.min(1 - medio, v));
  return { cx: pinza(c.cx), cy: pinza(c.cy), z };
}

/** De una cámara a otra. Los aumentos se mezclan en escala logarítmica: de 1 a
    2 y de 2 a 4 son el mismo empujón para el ojo. */
function entre(a: Camara, b: Camara, t: number): Camara {
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, z: a.z * Math.pow(b.z / a.z, t) };
}

const PINZA = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SUAVE = { ...PINZA, easing: Easing.inOut(Easing.cubic) } as const;

/** El puntero del ratón, dibujado: una flecha clara con el borde oscuro. */
function Puntero({ tam }: { tam: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ display: "block", overflow: "visible" }}>
      <path
        d="M4 2.5 L4 19 L8.6 14.9 L11.6 21.5 L14.4 20.2 L11.5 13.8 L17.8 13.4 Z"
        fill="#f4f8ff"
        stroke="#070b13"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Una función del producto: la app de verdad a pantalla completa, y la cámara
 * viajando por dentro.
 *
 * 1. Llega la captura, llenando el cuadro, y encima de ella, EN EL CENTRO, la
 *    frase grande, palabra a palabra. Mientras se lee, la app espera a media
 *    luz: una captura nítida debajo de una frase son dos textos peleándose.
 * 2. La frase se va, la app se enciende y la cámara entra hasta cada función
 *    (`focos`): lo demás se apaga, un marco la señala, su frase sale pegada a
 *    ella y, si lo lleva, el puntero entra y hace clic.
 *
 * Una escena que entra `directo` se salta el plano de la pantalla entera: la
 * cámara ya está en su pieza y la frase grande es una pregunta, que se lee
 * sobre ella a media luz. Es como van las preguntas de la segunda pasada
 * (2026-10-14): la app entera, llena de código, era lo que Munir llamó
 * «difícil para el usuario».
 *
 * El corte anterior metía la captura en una ventana que ocupaba tres cuartos
 * del cuadro, con Adeo al lado y el título encima. De su vídeo de referencia
 * Munir se quedó con «la app REAL a pantalla completa, con la cámara viajando
 * por dentro» (2026-10-13), y eso es esto: no hay ventana, el cuadro ES la
 * app. Lo que ya había pedido antes sigue igual: el texto en el centro y
 * suelto, sin caja, sin número y sin el nombre de la pestaña.
 */
export function Producto({ escena, entra, largo }: { escena: EscenaPantalla; entra: number; largo: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useMedidas();
  const idioma = useIdioma();
  const decir = useDecir();
  const src = captura(escena.imagen, idioma);
  const f = frame - entra;
  const m = marcoDe(width, height, escena.proporcion);

  // La frase grande: llega al centro y, cuando sale la cámara, se va.
  const sale = saleLaCamara(largo);
  const titulo = spring({ frame: f - PANTALLA.titulo, fps, config: { damping: 200, mass: 0.5 } });
  const seVa = interpolate(f, [sale - 8, sale + 4], [0, 1], SUAVE);
  /** Cuánto manda la frase grande: de 0 a 1 mientras está en el centro. */
  const espera = titulo * (1 - seVa);
  /** Adeo, que la dice, llega antes que ella y con rebote. */
  const aparece = spring({ frame: f, fps, config: { damping: 11, mass: 0.55 } });

  // La cámara: entera mientras manda la frase, y luego de foco en foco. Si la
  // escena entra directo, ya está dentro de su primera pieza desde el primer
  // fotograma, un poco más abierta, y se acerca mientras se lee la pregunta.
  const focos = escena.focos.slice(0, focosQueCaben(largo, escena.focos.length));
  const n = focos.length;
  const camaras = focos.map((foco) => camaraDe(foco.en));
  const desde = (i: number) => haciaElFoco(largo, n, i);
  const directo = escena.directo === true && n > 0;
  let camara = directo ? abierta(camaras[0]) : ENTERA;
  focos.forEach((_, i) => {
    const arranca = i === 0 && directo ? -PASO / 2 : desde(i);
    const t = interpolate(f, [arranca, desde(i) + PANTALLA.viaje], [0, 1], SUAVE);
    camara = entre(camara, camaras[i], t);
  });
  // Nunca se queda clavada: sigue entrando un pelo mientras se lee.
  const deriva = 1 + 0.04 * interpolate(f, [-PASO / 2, largo + PASO / 2], [0, 1], PINZA);
  const z = camara.z * deriva;
  /** Un punto de la captura, en píxeles del marco, con la cámara de ahora. */
  const aCuadro = (px: number, py: number, c: Camara = { ...camara, z }) => ({
    x: ((px - c.cx) * c.z + 0.5) * m.ancho,
    y: ((py - c.cy) * c.z + 0.5) * m.alto,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: m.ventana ? undefined : COLOR.panel }}>
      <div
        style={{
          position: "absolute",
          left: m.x,
          top: m.y,
          width: m.ancho,
          height: m.alto,
          overflow: "hidden",
          // Una ventana suelta lleva su canto y su sombra, como en la app; la
          // que llena el cuadro, nada.
          ...(m.ventana && {
            borderRadius: 18 * u,
            border: `1px solid ${COLOR.bordeFuerte}`,
            boxShadow: `0 ${40 * u}px ${90 * u}px rgba(0,0,0,0.55)`,
            backgroundColor: COLOR.panel,
          }),
        }}
      >
        {/* La captura y lo que va pintado sobre ella: todo esto se mueve con
            la cámara. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: m.ancho,
            height: m.alto,
            transformOrigin: "0 0",
            transform: `translate(${(0.5 - camara.cx * z) * m.ancho}px, ${(0.5 - camara.cy * z) * m.alto}px) scale(${z})`,
            filter: espera > 0.02 ? `blur(${espera * 5 * u}px)` : undefined,
          }}
        >
          {src ? <Img src={src} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} /> : <Hueco escena={escena} />}
          {focos.map((foco, i) => {
            const [x, y, w, h] = foco.en;
            const llega = desde(i) + PANTALLA.viaje;
            const enciende = interpolate(f, [llega - 9, llega], [0, 1], PINZA);
            const apaga = i < n - 1 ? interpolate(f, [desde(i + 1), desde(i + 1) + 8], [1, 0], PINZA) : 1;
            const late = 1 + 0.5 * Math.max(0, 1 - Math.abs(f - llega - 4) / 8);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x * m.ancho,
                  top: y * m.alto,
                  width: w * m.ancho,
                  height: h * m.alto,
                  boxSizing: "border-box",
                  borderRadius: (9 * u) / z,
                  border: `${(2.5 * u) / z}px solid ${COLOR.marcaClaro}`,
                  // El marco, su halo, y todo lo de alrededor a media luz.
                  boxShadow: `0 0 ${(26 * u * late) / z}px rgba(72,194,255,0.6), 0 0 0 ${m.ancho * 3}px rgba(4,7,13,0.66)`,
                  opacity: enciende * apaga,
                }}
              />
            );
          })}
        </div>

        {/* Mientras manda la frase grande, la app espera a media luz. */}
        <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(5,8,14,${0.62 * espera})` }} />
      </div>

      {/* Las frases de cada función y el puntero, encima de todo. */}
      <div style={{ position: "absolute", left: m.x, top: m.y, width: m.ancho, height: m.alto }}>
        {focos.map((foco, i) => {
          const [x, y, w, h] = foco.en;
          const c = camaras[i];
          const arriba = aCuadro(x, y, c);
          const abajo = aCuadro(x + w, y + h, c);
          // Del alto de Adeo, que va al lado: la frase la dice él.
          const altoFrase = 116 * u;
          const aire = 22 * u;
          const margen = 44 * u;
          // Debajo de lo que señala; si no cabe en el cuadro, encima; y si
          // tampoco, dentro, pegada a su borde de abajo.
          const top =
            abajo.y + aire + altoFrase <= m.alto - margen
              ? abajo.y + aire
              : arriba.y - aire - altoFrase >= margen
                ? arriba.y - aire - altoFrase
                : abajo.y - aire - altoFrase;
          const borde = Math.min(m.ancho / 2, 590 * u);
          const left = Math.max(borde, Math.min(m.ancho - borde, (arriba.x + abajo.x) / 2));
          const llega = llegaDato(largo, n, i);
          const raya = spring({ frame: f - llega - 4, fps, config: { damping: 200, mass: 0.5 } });
          // Adeo llega de un brinco, un pelo antes que su primera palabra.
          const brinca = spring({ frame: f - llega + 3, fps, config: { damping: 11, mass: 0.5 } });
          const fuera = i < n - 1 ? interpolate(f, [desde(i + 1) - 4, desde(i + 1) + 3], [1, 0], PINZA) : 1;
          if (f < llega - 3) return null;
          // SIN caja: un texto pequeño dentro de un rectángulo con borde es lo
          // que Munir llamó «cárcel». Lo que lo separa de la captura es su
          // sombra, que hace de halo oscuro, y lo que lo ata a lo que señala
          // es la raya de debajo, del color del marco.
          const halo = `0 ${2 * u}px ${3 * u}px rgba(0,0,0,0.95), 0 0 ${14 * u}px #04070d, 0 0 ${30 * u}px #04070d, 0 0 ${60 * u}px #04070d`;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left,
                top,
                height: altoFrase,
                display: "flex",
                alignItems: "center",
                gap: 20 * u,
                opacity: fuera,
                transform: "translateX(-50%)",
              }}
            >
              {/* Una sombra ancha y sin bordes detrás, que apaga las letras de
                  la captura que quedan debajo. No es una caja: no tiene canto. */}
              <span
                style={{
                  position: "absolute",
                  inset: `${-22 * u}px ${-90 * u}px`,
                  background: "radial-gradient(closest-side, rgba(4,7,13,0.94) 45%, rgba(4,7,13,0.6) 72%, transparent)",
                  filter: `blur(${10 * u}px)`,
                  opacity: Math.min(1, brinca * 1.5),
                }}
              />
              {/* Adeo, que es quien lo dice (Munir, 2026-10-14: «pon a Adeo de
                  protagonista, Adeo explica la plataforma»). Llega con el
                  brinco de cuando lo tocas y se queda con el ánimo de la
                  respuesta. */}
              <div
                style={{
                  position: "relative",
                  flexShrink: 0,
                  transform: `scale(${brinca})`,
                  transformOrigin: "50% 100%",
                  filter: `drop-shadow(0 ${6 * u}px ${12 * u}px rgba(0,0,0,0.6))`,
                }}
              >
                <Adeo animo={escena.adeo} alto={112 * u} antes={REACCIONES.toque} mirada="der" desde={entra + llega} semilla={escena.id.length + i} />
              </div>
              <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * u }}>
                <Palabras
                  texto={decir(foco.dato)}
                  entra={entra + llega}
                  cada={PANTALLA.cada}
                  style={{
                    fontFamily: FUENTE.texto,
                    fontSize: 52 * u,
                    lineHeight: 1,
                    fontWeight: 780,
                    letterSpacing: "-0.02em",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                    textShadow: halo,
                  }}
                />
                <span
                  style={{
                    width: "100%",
                    height: 5 * u,
                    borderRadius: 3 * u,
                    backgroundColor: COLOR.marcaClaro,
                    boxShadow: `0 0 ${16 * u}px rgba(72,194,255,0.7)`,
                    transform: `scaleX(${raya})`,
                  }}
                />
              </div>
            </div>
          );
        })}
        {focos.map((foco, i) => {
          if (!foco.clic) return null;
          const llega = desde(i) + PANTALLA.viaje;
          const pulsa = clicEn(largo, n, i);
          // El de la última función no se va: se queda hasta que acaba la escena.
          const hasta = i < n - 1 ? desde(i + 1) : null;
          if (f < llega - 2 || (hasta !== null && f > hasta + 6)) return null;
          const destino = aCuadro(foco.clic[0], foco.clic[1]);
          // Entra desde abajo a la derecha, frenando, y se queda en su sitio.
          const va = interpolate(f, [llega, pulsa - 3], [1, 0], { ...PINZA, easing: Easing.out(Easing.cubic) });
          const x = destino.x + va * 190 * u;
          const y = destino.y + va * 140 * u;
          const visto = interpolate(f, [llega - 2, llega + 5], [0, 1], PINZA) * (hasta === null ? 1 : interpolate(f, [hasta, hasta + 6], [1, 0], PINZA));
          const aprieta = 1 - 0.16 * Math.max(0, 1 - Math.abs(f - pulsa) / 4);
          const onda = interpolate(f, [pulsa, pulsa + 16], [0, 1], PINZA);
          return (
            <div key={`clic-${i}`} style={{ position: "absolute", left: 0, top: 0, opacity: visto }}>
              {f >= pulsa && onda < 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: destino.x,
                    top: destino.y,
                    width: 110 * u,
                    height: 110 * u,
                    marginLeft: -55 * u,
                    marginTop: -55 * u,
                    borderRadius: "50%",
                    border: `${3 * u}px solid ${COLOR.marcaClaro}`,
                    backgroundColor: "rgba(72,194,255,0.18)",
                    opacity: 1 - onda,
                    transform: `scale(${0.25 + 0.75 * onda})`,
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  left: x - 6 * u,
                  top: y - 4 * u,
                  transform: `scale(${aprieta})`,
                  transformOrigin: "20% 12%",
                  filter: `drop-shadow(0 ${4 * u}px ${7 * u}px rgba(0,0,0,0.6))`,
                }}
              >
                <Puntero tam={48 * u} />
              </div>
            </div>
          );
        })}
      </div>

      {/* La frase grande, en el centro del cuadro, y Adeo diciéndola: con
          duda si es una pregunta, saludando si presenta la pantalla. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 4%",
          opacity: 1 - seVa,
          transform: `translateY(${-seVa * 40 * u}px)`,
          filter: seVa > 0.02 ? `blur(${seVa * 8 * u}px)` : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 44 * u }}>
          <div
            style={{
              flexShrink: 0,
              transform: `scale(${aparece})`,
              transformOrigin: "50% 100%",
              filter: `drop-shadow(0 ${10 * u}px ${24 * u}px rgba(0,0,0,0.6))`,
            }}
          >
            <Adeo
              animo={directo ? "duda" : "quieta"}
              alto={210 * u}
              antes={directo ? undefined : REACCIONES.hola}
              mirada="der"
              desde={entra}
              semilla={escena.id.length}
            />
          </div>
          <Palabras
            texto={decir(escena.titulo)}
            entra={entra + PANTALLA.titulo}
            cada={PANTALLA.cada}
            style={{
              fontFamily: FUENTE.texto,
              // Una pregunta corta va en grande; una más larga o de dos
              // renglones, menos, que Adeo ocupa su sitio al lado.
              fontSize: (decir(escena.titulo).length > 30 ? 80 : decir(escena.titulo).length > 20 ? 92 : 112) * u,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              color: COLOR.texto,
              textAlign: "left",
              textShadow: `0 ${6 * u}px ${44 * u}px rgba(0,0,0,0.8)`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
