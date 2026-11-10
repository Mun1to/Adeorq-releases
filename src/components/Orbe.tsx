// El orbe del Asistente: un planeta azul y un satélite blanco dando vueltas.
//
// Tres formas y ni una más: el círculo del planeta, la elipse de su órbita y el
// punto que la recorre. Se llegó aquí quitando, no añadiendo: hubo una versión
// con anillos girando, barrido de sonar y una onda dentro del núcleo, y otra
// con degradados y halo. Las dos eran peores por el mismo motivo, y Munir lo
// dijo las dos veces: en 22 píxeles, lo que se mueve tiene que ser UNA cosa, y
// lo demás tiene que estarse quieto para que se note que esa se mueve.
//
// Azul el planeta y BLANCO el satélite. No es decisión de gusto: es lo único
// que lo distingue de su propio planeta al pasar por delante, que es justo
// donde el movimiento se tiene que leer.
//
// CÓMO SE MUEVE, que costó tres intentos:
//
// A mano, desde JavaScript. Antes se probó `offset-path` de CSS y
// luego `<animateMotion>` de SVG, y en este WebView no movió NADA ninguno de
// los dos (Munir, 2026-08-06, dos veces: «sigue sin moverse»). Lo declarativo
// es más bonito hasta que no funciona.
//
// Y resulta que además hacía falta: el satélite tiene que ESCONDERSE detrás del
// planeta, y para eso hay que saber dónde está. Con una animación declarativa
// la posición la conoce el navegador y no nosotros; teniéndola aquí se puede
// preguntar si en este instante lo tapa el planeta, que es la pregunta exacta.
//
// Rotar un grupo, que habría sido lo barato, no valía: girar da un CÍRCULO, no
// una elipse, y a velocidad angular constante, que es lo único que una órbita
// no tiene.
//
// CADA CUÁNTO SE MUEVE, que es lo que costaba (2026-11-10): iba con un
// `requestAnimationFrame` que se volvía a pedir en cada fotograma, y eso obliga
// a la ventana entera a recalcular estilos y maquetar en CADA fotograma de la
// pantalla: 199 veces por segundo, medido. Con la app vacía, el orbe solo se
// comía el 61% de un núcleo en el proceso de gráficos y el 56% en la página
// (`scripts/laboratorio/pintado-en-reposo.mjs`), y en su portátil, que pinta en
// la gráfica integrada, era la mitad del gasto de fondo que dejaba la app sin
// margen y la congelaba a ratos. Ahora va con un reloj a los pasos justos para
// que el satélite no avance más de un píxel por paso (`PASOS_S`): se ve igual
// de suave y despierta a la ventana diez veces menos. Un solo reloj para todos
// los orbes que haya (el de la barra y el de la ventana de Adeo): con uno cada
// uno y sin alinear, la ventana despertaba el doble de veces.
//
// Y el satélite se apaga y se enciende al pasar por detrás SIN transición de
// CSS: una transición pinta en cada fotograma de la pantalla mientras dura, y
// a 30 pasos por segundo pensando no acababa nunca (unos 125 fotogramas por
// segundo, medido). El brillo sale de la posición (`satelite`), en el mismo
// paso que lo mueve.
//
// Lo que cambia entre estados es la VELOCIDAD, no lo que se dibuja. Como un
// reloj: no le salen piezas nuevas, va más deprisa.

import { useEffect, useRef } from "react";

export type EstadoOrbe = "reposo" | "escucha" | "piensa" | "listo";

interface Props {
  estado?: EstadoOrbe;
  /** Tamaño en píxeles. El dibujo escala entero, no hay tamaños prohibidos. */
  size?: number;
  onClick?: () => void;
  title?: string;
}

/* La geometría, en las unidades del viewBox de 24. Está aquí y no repartida
   entre el JSX y la hoja de estilos porque el satélite tiene que recorrer LA
   MISMA elipse que se dibuja: dos copias del mismo número se separan. */
const CX = 12;
const CY = 11.5;
/** El planeta. */
const R_PLANETA = 5.4;
/** Los dos radios de la órbita y su inclinación. */
const RX = 10;
const RY = 4.1;
const GIRO = (-22 * Math.PI) / 180;

/** Cuánto tarda una vuelta, en segundos. Siete en reposo es un movimiento que
    se ve si lo miras y no distrae si no; poco más de uno, pensando, es lo que
    se ve desde la otra punta de la pantalla. */
const VUELTA: Record<EstadoOrbe, number> = {
  reposo: 7,
  escucha: 3.4,
  piensa: 1.1,
  listo: 2.2,
};

/** Pasos por segundo en cada estado. Una vuelta son unos 48 de las 24 unidades
    del dibujo, o sea ~56 píxeles a tamaño 28: en reposo el satélite recorre 8
    por segundo y pensando 51. Con estos pasos avanza menos de un píxel cada vez
    en reposo y menos de dos pensando, que a ese tamaño es movimiento continuo.
    Más pasos no se ven y cuestan: cada uno es un fotograma de la ventana. */
const PASOS_S: Record<EstadoOrbe, number> = {
  reposo: 12,
  escucha: 20,
  piensa: 30,
  listo: 24,
};

/** Cada cuánto toca el siguiente paso, en milisegundos. Exportado para su
    prueba: que ningún estado vuelva a ir a un paso por fotograma. */
export function esperaEntrePasos(estado: EstadoOrbe): number {
  return Math.round(1000 / PASOS_S[estado]);
}

const suave = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Dónde está el satélite en un ángulo de su vuelta y cuánto se ve. Puro y
    exportado para su prueba: que el brillo no dé saltos en ningún punto. */
export function satelite(angulo: number): { x: number; y: number; brillo: number } {
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  // El punto sobre la elipse, y luego la misma inclinación que tiene dibujada
  // la órbita.
  const ex = RX * c;
  const ey = RY * s;
  const x = CX + ex * Math.cos(GIRO) - ey * Math.sin(GIRO);
  const y = CY + ex * Math.sin(GIRO) + ey * Math.cos(GIRO);
  // Detrás, la mitad de arriba de la elipse, se ve a media luz. Y solo se
  // esconde donde el planeta LO TAPA de verdad, no en toda esa mitad: pasar
  // por detrás pero por fuera del disco se sigue viendo, que es lo que hace una
  // luna. Las dos cosas en rampa, para que entrar y salir no sea un parpadeo.
  const delante = suave(-0.25, 0.25, s);
  const fuera = suave(R_PLANETA - 0.5, R_PLANETA + 1.5, Math.hypot(ex, ey));
  return { x, y, brillo: delante + (1 - delante) * 0.45 * fuera };
}

/** Donde nace, que es donde lo pone el primer paso: así no salta al empezar. */
const INICIO = satelite(0);

/** Un satélite que mueve el reloj común. */
interface Paso {
  paso: () => void;
  espera: () => number;
  /** Al volver a verse la ventana: que no cuente el rato escondida. */
  reanudar: () => void;
}
const pasos = new Set<Paso>();
let reloj = 0;
let atento = false;

/** El siguiente paso, al ritmo del orbe más rápido de los que hay. */
function programar() {
  if (reloj || !pasos.size || document.hidden) return;
  let espera = Infinity;
  for (const p of pasos) espera = Math.min(espera, p.espera());
  reloj = window.setTimeout(() => {
    reloj = 0;
    for (const p of pasos) p.paso();
    programar();
  }, espera);
}

function alReloj(p: Paso): () => void {
  if (!atento) {
    atento = true;
    // Con la ventana escondida no se mueve: nadie lo ve, y así el reloj no
    // despierta a la página para nada.
    document.addEventListener("visibilitychange", () => {
      window.clearTimeout(reloj);
      reloj = 0;
      if (document.hidden) return;
      for (const q of pasos) q.reanudar();
      programar();
    });
  }
  pasos.add(p);
  // El primero ya, sin esperar al reloj: si no, el satélite nace en la punta
  // de la órbita y salta a su sitio un paso después.
  p.paso();
  programar();
  return () => {
    pasos.delete(p);
    if (!pasos.size) {
      window.clearTimeout(reloj);
      reloj = 0;
    }
  };
}

export default function Orbe({ estado = "reposo", size = 22, onClick, title }: Props) {
  const punto = useRef<SVGCircleElement>(null);
  /** La velocidad viva, en un ref: cambiar de estado NO reinicia la vuelta.
      Con la duración como dependencia del efecto, el satélite daba un salto
      al empezar a escribir. */
  const vuelta = useRef(VUELTA[estado]);
  vuelta.current = VUELTA[estado];
  const espera = useRef(esperaEntrePasos(estado));
  espera.current = esperaEntrePasos(estado);

  useEffect(() => {
    /** Quien pide menos movimiento no lo pierde: se le va a la mitad de
        velocidad. Es la regla de la casa para las webs de Munir y aquí vale
        igual, porque este punto no es un adorno, es el estado del Asistente:
        apagarlo del todo quitaría información en vez de quitar molestia. */
    const lento = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 2.5 : 1;
    /** El ángulo se ACUMULA en vez de calcularse desde el reloj: así, al
        cambiar de velocidad, sigue desde donde iba y no salta. */
    let angulo = 0;
    let antes = performance.now();

    const paso = () => {
      const ahora = performance.now();
      const dt = Math.min(ahora - antes, 250) / 1000;
      antes = ahora;
      angulo += (2 * Math.PI * dt) / (vuelta.current * lento);
      const { x, y, brillo } = satelite(angulo);
      const el = punto.current;
      if (el) {
        el.setAttribute("cx", x.toFixed(2));
        el.setAttribute("cy", y.toFixed(2));
        el.style.opacity = brillo.toFixed(2);
      }
    };

    return alReloj({
      paso,
      espera: () => espera.current,
      reanudar: () => {
        antes = performance.now();
      },
    });
  }, []);

  const cuerpo = (
    <span className="orbe" data-estado={estado} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        {/* La órbita, por debajo del planeta: la mitad de atrás queda tapada
            por él, que es lo que la convierte en una órbita y no en un aro
            alrededor. */}
        <ellipse
          className="orbe-orbita"
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          transform={`rotate(-22 ${CX} ${CY})`}
        />
        <circle className="orbe-planeta" cx={CX} cy={CY} r={R_PLANETA} />
        {/* El satélite va DESPUÉS del planeta, así que se pinta encima; cuando
            pasa por detrás lo esconde el bucle de arriba, que sabe dónde
            está. */}
        <circle
          ref={punto}
          className="orbe-satelite"
          cx={INICIO.x.toFixed(2)}
          cy={INICIO.y.toFixed(2)}
          r="1.5"
          style={{ opacity: INICIO.brillo }}
        />
      </svg>
    </span>
  );

  if (!onClick) return cuerpo;
  return (
    <button className="orbe-boton" onClick={onClick} data-tip={title} aria-label={title}>
      {cuerpo}
    </button>
  );
}
