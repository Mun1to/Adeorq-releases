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
// A mano, con `requestAnimationFrame`. Antes se probó `offset-path` de CSS y
// luego `<animateMotion>` de SVG, y en este WebView no movió NADA ninguno de
// los dos (Munir, 2026-08-06, dos veces: «sigue sin moverse»). Lo declarativo
// es más bonito hasta que no funciona.
//
// Y resulta que además hacía falta: el satélite tiene que ESCONDERSE detrás del
// planeta, y para eso hay que saber dónde está. Con una animación declarativa
// la posición la conoce el navegador y no nosotros; teniéndola aquí se puede
// preguntar si en este instante lo tapa el planeta, que es la pregunta exacta.
//
// El coste es un `rAF` para tres atributos: se para solo con la ventana
// oculta, y con nueve terminales al lado eso no se nota. Rotar un grupo, que
// habría sido lo barato, tampoco valía: girar da un CÍRCULO, no una elipse, y
// a velocidad angular constante, que es lo único que una órbita no tiene.
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

export default function Orbe({ estado = "reposo", size = 22, onClick, title }: Props) {
  const punto = useRef<SVGCircleElement>(null);
  /** La velocidad viva, en un ref: cambiar de estado NO reinicia la vuelta.
      Con la duración como dependencia del efecto, el satélite daba un salto
      al empezar a escribir. */
  const vuelta = useRef(VUELTA[estado]);
  vuelta.current = VUELTA[estado];

  useEffect(() => {
    /** Quien pide menos movimiento no lo pierde: se le va a la mitad de
        velocidad. Es la regla de la casa para las webs de Munir y aquí vale
        igual, porque este punto no es un adorno, es el estado del Asistente:
        apagarlo del todo quitaría información en vez de quitar molestia. */
    const lento = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 2.5 : 1;
    let pedido = 0;
    /** El ángulo se ACUMULA en vez de calcularse desde el reloj: así, al
        cambiar de velocidad, sigue desde donde iba y no salta. */
    let angulo = 0;
    let antes = performance.now();

    const paso = (ahora: number) => {
      const dt = Math.min(ahora - antes, 250) / 1000;
      antes = ahora;
      angulo += (2 * Math.PI * dt) / (vuelta.current * lento);

      const c = Math.cos(angulo);
      const s = Math.sin(angulo);
      // El punto sobre la elipse, y luego la misma inclinación que tiene
      // dibujada la órbita.
      const ex = RX * c;
      const ey = RY * s;
      const x = CX + ex * Math.cos(GIRO) - ey * Math.sin(GIRO);
      const y = CY + ex * Math.sin(GIRO) + ey * Math.cos(GIRO);

      // Detrás: la mitad de arriba de la elipse. Y solo se esconde donde el
      // planeta LO TAPA de verdad, no en toda esa mitad: pasar por detrás pero
      // por fuera del disco se sigue viendo, que es lo que hace una luna.
      const detras = s < 0;
      const tapado = detras && Math.hypot(ex, ey) < R_PLANETA + 0.9;

      const el = punto.current;
      if (el) {
        el.setAttribute("cx", x.toFixed(2));
        el.setAttribute("cy", y.toFixed(2));
        el.style.opacity = tapado ? "0" : detras ? "0.45" : "1";
      }
      pedido = requestAnimationFrame(paso);
    };

    pedido = requestAnimationFrame(paso);
    // Con la ventana escondida no se pinta nada: el navegador ya frena el rAF,
    // pero soltarlo del todo es gratis y deja el hilo limpio.
    const visibilidad = () => {
      cancelAnimationFrame(pedido);
      if (!document.hidden) {
        antes = performance.now();
        pedido = requestAnimationFrame(paso);
      }
    };
    document.addEventListener("visibilitychange", visibilidad);
    return () => {
      cancelAnimationFrame(pedido);
      document.removeEventListener("visibilitychange", visibilidad);
    };
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
        <circle ref={punto} className="orbe-satelite" cx={CX + RX} cy={CY} r="1.5" />
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
