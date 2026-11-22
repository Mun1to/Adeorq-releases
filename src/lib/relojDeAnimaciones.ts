// Los tramos que dan vueltas, todos al mismo paso.
//
// El tramo azul de una terminal que trabaja (`aro-vuelta`), el hilo de su fila
// en la barra (`hilo-vuelta`) y el parpadeo del rojo y el amarillo
// (`aro-parpadeo`) van a pasos (`steps`) y no por fotograma, porque en la
// Cabina lo que cuesta es cuántas veces por segundo cambia la pantalla: medido
// el 2026-11-21 con seis terminales, el cono girando por fotograma 227 % de un
// núcleo en la tarjeta gráfica y a pasos 110 %. Pero cada animación empieza
// cuando su terminal se pone a trabajar, y seis tramos a destiempo cambian la
// pantalla en seis momentos distintos de cada paso: lo mismo que ir por
// fotograma. Así que se ponen todas en el reloj del documento (`startTime = 0`)
// y, como los pasos de todas duran lo mismo (40 ms, y 80 en el modo
// rendimiento), cambian en el mismo fotograma. De paso, dos terminales que
// parpadean lo hacen a la vez y no a contratiempo.

const AL_MISMO_PASO = new Set(["aro-vuelta", "hilo-vuelta", "aro-parpadeo"]);

/** Quien pone el reloj: al empezar cada una de esas animaciones, la cuelga del
    principio del documento. Devuelve con qué soltarlo. */
export function alinearAnimaciones(doc: Document = document): () => void {
  const alEmpezar = (e: AnimationEvent) => {
    if (!AL_MISMO_PASO.has(e.animationName)) return;
    const el = e.target as Element | null;
    // `subtree` también trae las de sus `::before` (el hilo gira en uno).
    for (const a of el?.getAnimations?.({ subtree: true }) ?? []) {
      if ((a as CSSAnimation).animationName === e.animationName && a.startTime !== 0) a.startTime = 0;
    }
  };
  doc.addEventListener("animationstart", alEmpezar);
  return () => doc.removeEventListener("animationstart", alEmpezar);
}
