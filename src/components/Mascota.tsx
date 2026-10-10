// La mascota de Adeorq: la A con ojo, brazos y piernas, dibujada a cuadritos.
//
// Munir la pidió el 2026-10-10 («la A de Adeorq, el triángulo es el ojo, las
// patas son las piernas, solo le añades brazos») y de tres dibujos eligió este,
// el de píxeles. Vive en la barra de arriba y es la campana: su ánimo dice lo
// más urgente de todas tus terminales (`animoDe`, en `lib/campana.ts`).
//
// Aquí solo se pinta y se lleva el reloj. Qué posturas hay, qué guion sigue
// cada ánimo y qué fotograma toca lo decide `lib/mascota.ts`, que se prueba
// sin ventana. Además de su guion, reacciona a ti: sigue el ratón con el ojo,
// te saluda si pasas por encima y da un brinco si la pulsas.
//
// Con el modo rendimiento, o si el sistema pide menos movimiento, se queda en
// la postura de su ánimo y no gasta ni un temporizador de animación. Con la
// ventana tapada tampoco se mueve: nadie la ve.

import { useEffect, useRef, useState } from "react";
import type { Animo } from "../lib/campana";
import {
  ALTO,
  ANCHO,
  arrancar,
  avanzar,
  cuadrosDe,
  reaccionar,
  reposoDe,
  type Marcha,
  type Mirada,
  type Pose,
  type Reaccion,
} from "../lib/mascota";
import { modoRendimiento } from "../lib/rendimiento";

/** Cada cuánto se vuelve a mirar si ya se puede animar, cuando no se puede. */
const REVISAR_MS = 1500;
/** Cuánto sigue mirando hacia donde se fue el ratón. */
const MIRADA_MS = 2500;

const quieta = () =>
  modoRendimiento() || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `alto` en píxeles; el ancho sale de la rejilla. `toque` es un contador:
 * cada vez que sube, da un brinco (lo sube quien la pulsa).
 */
export default function Mascota({ animo, alto = 28, toque = 0 }: { animo: Animo; alto?: number; toque?: number }) {
  const [pose, setPose] = useState<Pose>(() => reposoDe(animo));
  const [mirada, setMirada] = useState<Mirada>("");
  const marcha = useRef<Marcha | null>(null);
  const reloj = useRef(0);
  const svg = useRef<SVGSVGElement>(null);
  /** Da el siguiente paso YA, sin esperar al que estaba pendiente. */
  const paso = useRef<() => void>(() => {});

  // El reloj de la animación: un ánimo, un guion.
  useEffect(() => {
    let viva = true;
    marcha.current = arrancar(animo, Date.now(), Math.random);
    paso.current = () => {
      window.clearTimeout(reloj.current);
      if (!viva || !marcha.current) return;
      if (quieta()) {
        setPose(reposoDe(animo));
        reloj.current = window.setTimeout(() => paso.current(), REVISAR_MS);
        return;
      }
      const r = avanzar(marcha.current, Date.now(), Math.random);
      marcha.current = r.marcha;
      setPose(r.marcha.pose);
      reloj.current = window.setTimeout(() => paso.current(), r.espera);
    };
    paso.current();
    return () => {
      viva = false;
      window.clearTimeout(reloj.current);
    };
  }, [animo]);

  const reacciona = (cual: Reaccion) => {
    if (!marcha.current || quieta()) return;
    marcha.current = reaccionar(marcha.current, cual);
    paso.current();
  };
  const reaccionaRef = useRef(reacciona);
  reaccionaRef.current = reacciona;

  // La pulsan: un brinco. El primer pintado no cuenta.
  const primerToque = useRef(toque);
  useEffect(() => {
    if (toque !== primerToque.current) reaccionaRef.current("toque");
  }, [toque]);

  // El ojo sigue al ratón, y al rato vuelve a lo suyo.
  useEffect(() => {
    let vuelve = 0;
    let ultima = 0;
    const mover = (e: MouseEvent) => {
      // Como mucho unas quince veces por segundo: el ratón avisa cientos, y
      // el ojo solo tiene tres sitios a donde ir. Por reloj y no por fotograma
      // (`requestAnimationFrame`), que con la ventana tapada no llega nunca.
      if (e.timeStamp - ultima < 66) return;
      ultima = e.timeStamp;
      const caja = svg.current?.getBoundingClientRect();
      if (!caja) return;
      const dx = e.clientX - (caja.left + caja.width / 2);
      const dy = e.clientY - (caja.top + caja.height / 2);
      // Debajo de ella mira abajo; a los lados, al lado; encima o pegado, de frente.
      const debajo = dy > caja.height && Math.abs(dx) <= caja.width * 2;
      setMirada(debajo ? "bajo" : dx < -caja.width ? "izq" : dx > caja.width ? "der" : "");
      window.clearTimeout(vuelve);
      vuelve = window.setTimeout(() => setMirada(""), MIRADA_MS);
    };
    window.addEventListener("mousemove", mover, { passive: true });
    return () => {
      window.removeEventListener("mousemove", mover);
      window.clearTimeout(vuelve);
    };
  }, []);

  return (
    <svg
      ref={svg}
      className="mascota"
      data-animo={animo}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      width={Math.round((alto * ANCHO) / ALTO)}
      height={alto}
      aria-hidden="true"
      // Si te espera o celebra, ya te está llamando: el saludo es para cuando no.
      onMouseEnter={() => (animo === "espera" || animo === "lista" ? undefined : reacciona("hola"))}
    >
      {cuadrosDe(pose, mirada).map((q, i) => (
        // Un pelo más ancho que la celda, para que no se vea la rejilla entre cuadros.
        <rect key={i} x={q.x} y={q.y} width={1.02} height={1.02} fill={q.c} />
      ))}
    </svg>
  );
}
