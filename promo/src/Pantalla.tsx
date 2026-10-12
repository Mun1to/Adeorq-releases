import { AbsoluteFill, Easing, Img, getStaticFiles, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES, altoDeAdeo, anchoDeAdeo, bucle, gesto, type Paso } from "./Adeo";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS, type Animo, type EscenaPantalla, type Foco, type Idioma } from "./guion";
import { useDecir, useIdioma, useMedidas } from "./idioma";
import { PANTALLA, PASO, clicEn, focosQueCaben, haciaElFoco, llegaDato, saleLaCamara } from "./tiempos";

/** Si hay una captura hecha en el idioma de la pieza (`pantallas/en/...`), esa;
    si no, la de todos. Una Cabina con las pestañas en inglés dentro del vídeo
    en español se nota, pero no tener el vídeo por eso se nota más. */
function captura(imagen: string, idioma: Idioma) {
  const hay = (ruta: string) => getStaticFiles().some((f) => f.name === ruta);
  const propia = `pantallas/${idioma}/${imagen}`;
  const comun = `pantallas/${imagen}`;
  return hay(propia) ? staticFile(propia) : hay(comun) ? staticFile(comun) : null;
}

/** Las capturas las saca el equipo de `scripts/laboratorio/capturas` a 3840 x
    2160. Una de otra proporción se ve entera, con bandas del color del panel,
    y sus focos caerían corridos. */
const PROPORCION = 16 / 9;

/** Cuánto mide Adeo al lado de la ventana, y el aire que los separa. */
const adeoDe = (u: number, vertical: boolean) => ({ alto: (vertical ? 154 : 126) * u, hueco: (vertical ? 22 : 34) * u });

/**
 * Dónde va la ventana en el cuadro, en píxeles. Centrada: ya no comparte el
 * alto con un rótulo debajo, así que es más grande que antes y lo que hay que
 * leer va en el centro, encima de ella. Lo lee también `transiciones.tsx`,
 * que necesita saber por dónde entra la cámara.
 */
export function marcoDe(width: number, height: number) {
  const vertical = height > width;
  const ancho = Math.min(width * (vertical ? 0.92 : 0.74), height * (vertical ? 0.42 : 0.74) * PROPORCION);
  const alto = ancho / PROPORCION;
  return { x: (width - ancho) / 2, y: (height - alto) / 2, ancho, alto };
}

/** El ojo del Adeo que acompaña a la ventana, en píxeles del cuadro: por ahí
    entra la cámara cuando lo siguiente es su escena. El ojo está en el centro
    de su rejilla, a un tercio de su alto (`CUERPO`, en `src/lib/mascota.ts`). */
export function ojoDeAdeo(width: number, height: number) {
  const vertical = height > width;
  const m = marcoDe(width, height);
  const { alto, hueco } = adeoDe(Math.min(width, height) / 1080, vertical);
  const h = altoDeAdeo(alto);
  return vertical
    ? { x: width / 2, y: m.y - hueco - h * 0.64 }
    : { x: m.x - hueco - anchoDeAdeo(alto) / 2, y: m.y + m.alto - h * 0.64 };
}

/** El hueco de una captura que todavía no existe: una ventana vacía con su
    nombre. Así una pantalla nueva se puede escribir en el guion, y ver el
    vídeo entero, antes de tener su imagen; y lo que falta se ve de lejos en
    vez de tumbar el render con un 404. */
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

/** Lo que Adeo hace nada más llegar, delante del guion de su ánimo. En la app
    un gesto tarda entre seis y once segundos en salir, y aquí una escena dura
    cinco: sin esto se pasaría el vídeo parpadeando. */
const AL_LLEGAR: Partial<Record<Animo, readonly Paso[]>> = {
  // Saluda, se pone en jarra y guiña un ojo.
  quieta: [...REACCIONES.hola, ...gesto("quieta", 4), ...gesto("quieta", 6)],
  // Le da una vuelta, y se le ocurre.
  piensa: [...bucle("piensa"), ...gesto("piensa", 2)],
  // Escucha, y asiente.
  escucha: [...bucle("escucha"), ...gesto("escucha", 0)],
  // Empieza por el salto con los brazos arriba.
  baila: gesto("baila", 0),
};

/** Qué mira la cámara: el punto de la captura que cae en el centro de la
    ventana (de 0 a 1) y cuántos aumentos. */
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
 * Una pantalla de la app: su título en el centro, y la cámara de función en
 * función.
 *
 * 1. Llega la ventana, apagada, y encima de ella, EN EL CENTRO DEL CUADRO, el
 *    nombre de la pestaña y la frase grande. La segunda versión los ponía en
 *    una franja debajo de la ventana y Munir la devolvió: «el texto abajo del
 *    todo, tiene que estar más centrado».
 * 2. El título sube a su sitio, encima de la ventana, y la captura se
 *    enciende.
 * 3. La cámara se acerca a cada función (`focos`): lo demás se apaga, un marco
 *    la señala, su frase sale pegada a ella y, si lo lleva, el puntero entra y
 *    hace clic. La segunda versión enseñaba la captura entera y quieta («no
 *    hay zooms a las capturas»).
 *
 * La ventana no cambia de tamaño: lo que se mueve es la captura por dentro,
 * como en una lupa. Así Adeo y el título se quedan donde están y lo único que
 * viaja es lo que se está contando.
 */
export function Pantalla({ escena, numero, entra, largo }: { escena: EscenaPantalla; numero: number; entra: number; largo: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical, width, height } = useMedidas();
  const idioma = useIdioma();
  const decir = useDecir();
  const src = captura(escena.imagen, idioma);
  const f = frame - entra;
  const m = marcoDe(width, height);
  const adeo = adeoDe(u, vertical);

  // La ventana llega girada y se pone de frente: es lo que hace que entre como
  // un objeto y no como una diapositiva.
  const llega = spring({ frame: f + PASO / 2, fps, config: { damping: 200, mass: 0.9 } });
  const giro = interpolate(llega, [0, 1], [vertical ? 0 : -11, 0]);
  // Y un brillo la cruza una vez, como a un cristal al que le da la luz.
  const brillo = interpolate(f, [2, 30], [-70, 170], PINZA);
  const aparece = spring({ frame: f - 8, fps, config: { damping: 11, mass: 0.55 } });

  // El título: llega al centro y, cuando sale la cámara, sube a su sitio.
  const sale = saleLaCamara(largo);
  const titulo = spring({ frame: f - PANTALLA.titulo, fps, config: { damping: 200, mass: 0.5 } });
  const sube = spring({ frame: f - sale + 6, fps, config: { damping: 200, mass: 0.7 } });
  const yCabecera = vertical ? m.y - altoDeAdeo(adeo.alto) - adeo.hueco - 74 * u : m.y / 2;
  /** Cuánto manda el título: de 0 a 1 mientras está en el centro. */
  const espera = titulo * (1 - sube);

  // La cámara: entera mientras manda el título, y luego de foco en foco.
  const focos = escena.focos.slice(0, focosQueCaben(largo, escena.focos.length));
  const n = focos.length;
  const camaras = focos.map((foco) => camaraDe(foco.en));
  const desde = (i: number) => haciaElFoco(largo, n, i);
  let camara = ENTERA;
  focos.forEach((_, i) => {
    const t = interpolate(f, [desde(i), desde(i) + PANTALLA.viaje], [0, 1], SUAVE);
    camara = entre(camara, camaras[i], t);
  });
  // Nunca se queda clavada: sigue entrando un pelo mientras se lee.
  const deriva = 1 + 0.03 * interpolate(f, [0, largo + PASO], [0, 1], PINZA);
  const z = camara.z * deriva;
  /** Un punto de la captura, en píxeles de la ventana, con la cámara de ahora. */
  const aVentana = (px: number, py: number, c: Camara = { ...camara, z }) => ({
    x: ((px - c.cx) * c.z + 0.5) * m.ancho,
    y: ((py - c.cy) * c.z + 0.5) * m.alto,
  });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: m.x, top: m.y, width: m.ancho, height: m.alto }}>
        <div
          style={{
            position: "absolute",
            // Los pies de Adeo, a la altura del borde de abajo de la ventana:
            // está de pie a su lado, no flotando. En vertical no hay margen a
            // los lados y se sube encima.
            ...(vertical
              ? { bottom: "100%", left: "50%", marginLeft: -anchoDeAdeo(adeo.alto) / 2, marginBottom: adeo.hueco }
              : { right: "100%", bottom: 0, marginRight: adeo.hueco }),
            transform: `scale(${aparece})`,
            transformOrigin: "50% 100%",
            filter: `drop-shadow(0 ${8 * u}px ${14 * u}px rgba(0,0,0,0.5))`,
          }}
        >
          <Adeo
            animo={escena.adeo}
            alto={adeo.alto}
            antes={AL_LLEGAR[escena.adeo]}
            mirada={vertical ? "bajo" : "der"}
            desde={entra + 8}
            semilla={escena.id.length + largo}
          />
        </div>

        <div style={{ position: "absolute", inset: 0, perspective: 1900 * u }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14 * u,
              overflow: "hidden",
              border: `1px solid ${COLOR.bordeFuerte}`,
              boxShadow: `0 ${40 * u}px ${90 * u}px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)`,
              backgroundColor: COLOR.panel,
              transform: `rotateY(${giro}deg)`,
            }}
          >
            {/* La captura y lo que va pintado sobre ella: todo esto se mueve
                con la cámara. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: m.ancho,
                height: m.alto,
                transformOrigin: "0 0",
                transform: `translate(${(0.5 - camara.cx * z) * m.ancho}px, ${(0.5 - camara.cy * z) * m.alto}px) scale(${z})`,
                // Desenfocada mientras manda el título: una captura nítida
                // debajo de una frase son dos textos peleándose.
                filter: espera > 0.02 ? `blur(${espera * 7 * u}px)` : undefined,
              }}
            >
              {src ? (
                <Img src={src} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <Hueco escena={escena} />
              )}
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
                      boxShadow: `0 0 ${(26 * u * late) / z}px rgba(72,194,255,0.6), 0 0 0 ${m.ancho * 3}px rgba(4,7,13,0.56)`,
                      opacity: enciende * apaga,
                    }}
                  />
                );
              })}
            </div>

            {/* Mientras manda el título, la captura espera a media luz. */}
            <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(5,8,14,${0.66 * espera})` }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(105deg, transparent 40%, rgba(190,220,255,0.16) 50%, transparent 60%)",
                transform: `translateX(${brillo}%)`,
              }}
            />
          </div>
        </div>

        {/* Las frases y el puntero: encima de la ventana y sin recortar, que
            una frase puede asomar por debajo de su borde. */}
        {focos.map((foco, i) => {
          const [x, y, w, h] = foco.en;
          const c = camaras[i];
          const arriba = aVentana(x, y, c);
          const abajo = aVentana(x + w, y + h, c);
          const altoFrase = 58 * u;
          const aire = 20 * u;
          // Debajo de lo que señala; si no cabe, encima; y si tampoco, dentro.
          const top =
            abajo.y + aire + altoFrase <= m.alto + 64 * u
              ? abajo.y + aire
              : arriba.y - aire - altoFrase >= -64 * u
                ? arriba.y - aire - altoFrase
                : abajo.y - aire - altoFrase;
          const borde = Math.min(m.ancho / 2, 430 * u);
          const left = Math.max(borde, Math.min(m.ancho - borde, (arriba.x + abajo.x) / 2));
          const s = spring({ frame: f - llegaDato(largo, n, i), fps, config: { damping: 13, mass: 0.5 } });
          const raya = spring({ frame: f - llegaDato(largo, n, i) - 4, fps, config: { damping: 200, mass: 0.5 } });
          const fuera = i < n - 1 ? interpolate(f, [desde(i + 1) - 4, desde(i + 1) + 3], [1, 0], PINZA) : 1;
          // SIN caja. La tercera versión la llevaba (una pastilla con su borde)
          // y Munir la llamó «cárcel»: el texto pequeño va suelto y se tiene
          // que notar. Lo que lo separa de la captura es su sombra, que hace
          // de halo oscuro, y lo que lo ata a lo que señala es la raya de
          // debajo, del color del marco.
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
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 7 * u,
                opacity: Math.min(1, s * 2) * fuera,
                transform: `translate(-50%, ${interpolate(s, [0, 1], [18, 0]) * u}px) scale(${interpolate(s, [0, 1], [0.86, 1])})`,
              }}
            >
              {/* Una sombra ancha y sin bordes detrás, que apaga las letras de
                  la captura que quedan debajo. No es una caja: no tiene canto. */}
              <span
                style={{
                  position: "absolute",
                  inset: `${-26 * u}px ${-90 * u}px`,
                  background: "radial-gradient(closest-side, rgba(4,7,13,0.94) 45%, rgba(4,7,13,0.6) 72%, transparent)",
                  filter: `blur(${10 * u}px)`,
                }}
              />
              <span
                style={{
                  position: "relative",
                  fontFamily: FUENTE.texto,
                  fontSize: 40 * u,
                  lineHeight: 1,
                  fontWeight: 760,
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                  whiteSpace: "nowrap",
                  textShadow: halo,
                }}
              >
                {decir(foco.dato)}
              </span>
              <span
                style={{
                  position: "relative",
                  width: "100%",
                  height: 5 * u,
                  borderRadius: 3 * u,
                  backgroundColor: COLOR.marcaClaro,
                  boxShadow: `0 0 ${16 * u}px rgba(72,194,255,0.7)`,
                  transform: `scaleX(${raya})`,
                }}
              />
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
          const destino = aVentana(foco.clic[0], foco.clic[1]);
          // Entra desde abajo a la derecha, frenando, y se queda en su sitio.
          const va = interpolate(f, [llega, pulsa - 3], [1, 0], { ...PINZA, easing: Easing.out(Easing.cubic) });
          const x = destino.x + va * 150 * u;
          const y = destino.y + va * 110 * u;
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
                    width: 86 * u,
                    height: 86 * u,
                    marginLeft: -43 * u,
                    marginTop: -43 * u,
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
                  left: x - 5 * u,
                  top: y - 3 * u,
                  transform: `scale(${aprieta})`,
                  transformOrigin: "20% 12%",
                  filter: `drop-shadow(0 ${4 * u}px ${7 * u}px rgba(0,0,0,0.6))`,
                }}
              >
                <Puntero tam={38 * u} />
              </div>
            </div>
          );
        })}
      </div>

      {/* El título. Un solo bloque que viaja del centro del cuadro a su sitio
          de encima de la ventana, encogiendo: lo que se leyó en grande es lo
          mismo que se queda arriba, y el ojo no lo tiene que buscar. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: interpolate(sube, [0, 1], [height / 2, yCabecera]),
          height: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16 * u,
            width: width * 0.86,
            flexShrink: 0,
            textAlign: "center",
            opacity: titulo,
            transform: `translateY(${interpolate(titulo, [0, 1], [26, 0]) * u}px) scale(${interpolate(sube, [0, 1], [1, 0.5]) * interpolate(titulo, [0, 1], [0.94, 1])})`,
          }}
        >
          <div
            style={{
              // La misma letra que el título, en negrita y abierta: la de
              // terminal, pequeña, espaciada y en mayúsculas, no se leía.
              fontFamily: FUENTE.texto,
              // Al encoger el bloque la etiqueta se quedaría en nada: crece
              // por dentro lo que el bloque mengua por fuera.
              fontSize: interpolate(sube, [0, 1], [28, 46]) * u,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COLOR.marcaClaro,
            }}
          >
            {`${String(numero).padStart(2, "0")} · ${decir(escena.nombre)}`}
          </div>
          <div
            style={{
              fontFamily: FUENTE.texto,
              fontSize: (vertical ? 70 : 92) * u,
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: COLOR.texto,
              textWrap: "balance",
              textShadow: `0 ${6 * u}px ${40 * u}px rgba(0,0,0,${0.75 * (1 - sube)})`,
            }}
          >
            {decir(escena.titulo)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
