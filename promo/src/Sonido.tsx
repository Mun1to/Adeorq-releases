import { Html5Audio, Loop, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cinta } from "./Adeo";
import { TEXTOS } from "./guion";
import { useDecir, useIdioma } from "./idioma";
import { despierta } from "./Portada";
import { CAPITULO, GANCHO, LLEGA, QUE_ES, VOZ, llegaDato, parte, preguntasDelGancho, totalDe, type Tramo, type Voces } from "./tiempos";

/**
 * Todo lo que se oye.
 *
 * No hay ni un tiempo escrito a mano: cada sonido cuelga de un corte del guion
 * o de uno de los números de `tiempos.ts`, los mismos con los que se pinta. Si
 * una escena cambia de sitio o de duración, su sonido va detrás.
 *
 * Dos orígenes, y los dos valen para vender (están anotados en el README):
 * - `sonido/hecho/` lo escribe `sonido.mjs`: la música, el paso entre escenas,
 *   la campana y las chispas. No es de nadie más.
 * - `sonido/kenney/` son cinco clics del paquete «Interface Sounds» de Kenney,
 *   CC0, con su `License.txt` al lado.
 */
const hecho = (n: string) => staticFile(`sonido/hecho/${n}.wav`);
const kenney = (n: string) => staticFile(`sonido/kenney/${n}.ogg`);
const TECLAS = ["click_002", "click_003", "click_004"].map(kenney);

/** Cuánto se sube todo a la vez. Con 1, el MP4 medía -18,1 LUFS con el pico en
    -3,6 dBFS (`ffmpeg -af ebur128=peak=true`); las redes normalizan hacia -16,
    y esos 2 dB de más caben sin recortar. Si se toca un nivel de abajo, se
    vuelve a medir y se ajusta este. */
const MAESTRO = 1.25;

/** La mezcla. La música va por debajo de todo lo demás a propósito: es lo que
    acompaña, no lo que se escucha. */
const NIVEL = {
  cama: 0.6 * MAESTRO,
  ritmo: 0.58 * MAESTRO,
  final: 0.85 * MAESTRO,
  paso: 0.34 * MAESTRO,
  campana: 0.5 * MAESTRO,
  tic: 0.3 * MAESTRO,
  pop: 0.34 * MAESTRO,
  tecla: 0.2 * MAESTRO,
  chispa: 0.4 * MAESTRO,
  /** La voz llega ya nivelada de `voz.mjs` (-16 LUFS) y no pasa por el
      maestro: es la referencia, y lo demás se pone por debajo de ella. */
  voz: 1,
} as const;

/** Cuánto se queda de la música mientras alguien habla, y de los efectos en
    toda la pieza cuando lleva voz: la música acompaña y los clics puntúan,
    pero lo que se tiene que entender es la frase. */
const BAJO_LA_VOZ = { musica: 0.34, efectos: 0.62 } as const;

/** El pico del `whoosh` está a 0,42 s de su principio: se adelanta eso para
    que caiga en el corte y no después. */
const PICO_DEL_PASO = 0.42;

type Efecto = { en: number; src: string; nivel: number };

function efectos(tramos: Tramo[], fps: number, orden: string): Efecto[] {
  const lista: Efecto[] = [];
  const pon = (en: number, src: string, nivel: number) => lista.push({ en: Math.max(0, Math.round(en)), src, nivel });

  tramos.forEach((t, i) => {
    const e = t.escena;
    if (i > 0) pon(t.corte - PICO_DEL_PASO * fps, hecho("whoosh"), NIVEL.paso);

    if (e.tipo === "gancho") {
      // Un clic por ventana que se abre, y un golpe por pregunta.
      for (let k = 0; k < 7; k++) pon(t.corte + GANCHO.primera + k * GANCHO.entreVentanas, TECLAS[k % TECLAS.length], NIVEL.tecla * 1.6);
      preguntasDelGancho(t).forEach((en) => pon(t.corte + en, kenney("drop_002"), NIVEL.pop * 1.2));
    }
    if (e.tipo === "capitulo") {
      pon(t.corte + CAPITULO.titulo, hecho("campana"), NIVEL.campana * 0.8);
      for (let k = 0; k < 3; k++) pon(t.corte + CAPITULO.pantallas + k * CAPITULO.entrePantallas, kenney("tick_002"), NIVEL.tic);
    }
    if (e.tipo === "portada") {
      pon(t.corte + 2, hecho("campana"), NIVEL.campana);
      pon(t.corte + despierta(t.largo), kenney("drop_002"), NIVEL.pop);
    }
    if (e.tipo === "que-es") {
      // Una tecla por letra de la orden; los espacios no suenan.
      [...orden].forEach((letra, k) => {
        if (letra !== " ") pon(t.corte + QUE_ES.tecleo + k * QUE_ES.porLetra, TECLAS[k % TECLAS.length], NIVEL.tecla);
      });
      TEXTOS.queEs.clientes.forEach((_, k) => pon(t.corte + QUE_ES.clientes + k * QUE_ES.entreClientes, kenney("tick_002"), NIVEL.tic));
      pon(t.corte + QUE_ES.cuenta, kenney("drop_002"), NIVEL.pop);
    }
    if (e.tipo === "pantalla") {
      pon(t.corte + LLEGA.titulo, kenney("tick_002"), NIVEL.tic);
      e.datos.forEach((_, k) => pon(t.corte + llegaDato(t.largo, e.datos.length, k), kenney("drop_002"), NIVEL.pop));
    }
    if (e.tipo === "adeo") {
      const estados = TEXTOS.adeo.estados;
      estados.forEach((estado, k) => {
        // La primera parte de la escena es el saludo: los estados van detrás.
        const en = t.corte + parte(t, estados.length + 1, k + 1);
        const dura = parte(t, estados.length + 1, k + 2) - parte(t, estados.length + 1, k + 1);
        if (estado.animo === "trabaja") {
          // Las mismas teclas que pulsa: se recorre su guion con la misma
          // semilla que `EscenaAdeo` y suena cada vez que una se enciende.
          let tecla = 0;
          for (const paso of cinta("trabaja", (dura / fps) * 1000, [], k + 3)) {
            if (paso.pose.cosa && paso.pose.cosa !== "teclado") pon(en + (paso.ms / 1000) * fps, TECLAS[tecla++ % TECLAS.length], NIVEL.tecla * 1.4);
          }
        }
        if (estado.animo === "espera") {
          pon(en + 1, kenney("tick_002"), NIVEL.tic * 1.5);
          pon(en + 8, kenney("tick_002"), NIVEL.tic * 1.5);
        }
        if (estado.animo === "lista") pon(en + 2, hecho("chispa"), NIVEL.chispa);
      });
    }
  });
  return lista;
}

export function Sonido({ tramos, voz }: { tramos: Tramo[]; voz: Voces }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const decir = useDecir();
  const idioma = useIdioma();
  const total = totalDe(tramos);
  /** Los dos bucles duran ocho compases de 2,5 s, y la subida del final, uno. */
  const bucle = Math.round(20 * fps);
  const subida = Math.round(2.5 * fps);
  const pinza = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // El ritmo entra con el primer capítulo (o con la primera pantalla, en la
  // corta): el problema, la portada y el «qué es» van solo con el colchón, y
  // el vídeo arranca de verdad cuando aparece la app.
  const primera = tramos.find((t) => t.escena.tipo === "capitulo" || t.escena.tipo === "pantalla");
  const cierre = tramos.find((t) => t.escena.tipo === "cierre");
  const fin = cierre ? cierre.corte : total;

  // Dónde se habla: desde un poco después del corte de la escena, lo que dure
  // su frase. Mientras se habla, la música y los efectos se agachan.
  const frases = tramos.flatMap((t) => {
    const dicho = voz[t.escena.id];
    return dicho ? [{ id: t.escena.id, desde: t.corte + VOZ.entra, hasta: t.corte + VOZ.entra + Math.round(dicho.dura * fps) }] : [];
  });
  const hablando = Math.max(0, ...frases.map((v) => interpolate(frame, [v.desde - 10, v.desde, v.hasta, v.hasta + 14], [0, 1, 1, 0], pinza)));
  const musica = 1 - hablando * (1 - BAJO_LA_VOZ.musica);
  const golpes = frases.length ? BAJO_LA_VOZ.efectos : 1;

  // La música se aparta durante el compás de subida y calla en el corte: lo
  // que suena en el cierre es el acorde del final, que empieza justo ahí.
  const sale = interpolate(frame, [fin - subida, fin - 18, fin], [1, 0.5, 0], pinza);
  const cama = NIVEL.cama * interpolate(frame, [0, 24], [0, 1], pinza) * sale * musica;
  const ritmo = primera ? NIVEL.ritmo * interpolate(frame, [primera.corte - 4, primera.corte + 8], [0, 1], pinza) * sale * musica : 0;

  return (
    <>
      <Loop durationInFrames={bucle} layout="none">
        <Html5Audio src={hecho("cama")} volume={cama} />
      </Loop>
      <Loop durationInFrames={bucle} layout="none">
        <Html5Audio src={hecho("ritmo")} volume={ritmo} />
      </Loop>
      {cierre && (
        <Sequence from={fin - subida} layout="none">
          <Html5Audio
            src={hecho("final")}
            volume={(f) => NIVEL.final * golpes * interpolate(f + fin - subida, [total - 20, total], [1, 0], pinza)}
          />
        </Sequence>
      )}
      {efectos(tramos, fps, decir(TEXTOS.queEs.orden)).map((e, i) => (
        <Sequence key={i} from={e.en} layout="none">
          <Html5Audio src={e.src} volume={e.nivel * golpes} />
        </Sequence>
      ))}
      {frases.map((v) => (
        <Sequence key={v.id} from={v.desde} layout="none">
          <Html5Audio src={staticFile(`voz/${idioma}/${v.id}.wav`)} volume={NIVEL.voz} />
        </Sequence>
      ))}
    </>
  );
}
