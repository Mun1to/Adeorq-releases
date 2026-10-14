import { Html5Audio, Loop, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cinta } from "./Adeo";
import { TEXTOS } from "./guion";
import { useDecir, useIdioma } from "./idioma";
import { CIERRE, NOMBRE, PANTALLA, TEXTO, VOZ, clicEn, cuantasPalabras, despierta, focosQueCaben, llegaDato, parte, totalDe, type Tramo, type Voces } from "./tiempos";

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

/** Cuánto se sube todo a la vez. Se mide el MP4 (`ffmpeg -af ebur128=peak=true`)
    y se ajusta este: las redes normalizan hacia -14, y el pico tiene que
    quedar por debajo de -1 dBTP. Si se toca un nivel de abajo, se vuelve a
    medir. */
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

/** Cuánto se queda del colchón mientras solo hay texto: la pieza arranca baja
    y la música entra con el nombre. */
const ANTES_DEL_NOMBRE = 0.5;

/** Cuánto se queda de la música mientras alguien habla, y de los efectos en
    toda la pieza cuando lleva voz: la música acompaña y los clics puntúan,
    pero lo que se tiene que entender es la frase. */
const BAJO_LA_VOZ = { musica: 0.34, efectos: 0.62 } as const;

/** El pico del `whoosh` está a 0,42 s de su principio: se adelanta eso para
    que caiga en el corte y no después. */
const PICO_DEL_PASO = 0.42;

type Efecto = { en: number; src: string; nivel: number };

function efectos(tramos: Tramo[], fps: number, decir: ReturnType<typeof useDecir>): Efecto[] {
  const lista: Efecto[] = [];
  const pon = (en: number, src: string, nivel: number) => lista.push({ en: Math.max(0, Math.round(en)), src, nivel });
  /** Una tecla por palabra que entra, al paso al que entran. */
  const teclea = (en: number, texto: string, cada: number, nivel: number) => {
    for (let k = 0; k < cuantasPalabras(texto); k++) pon(en + k * cada, TECLAS[k % TECLAS.length], nivel);
  };

  tramos.forEach((t, i) => {
    const e = t.escena;
    if (i > 0) pon(t.corte - PICO_DEL_PASO * fps, hecho("whoosh"), NIVEL.paso);

    if (e.tipo === "texto") {
      // Cada frase se teclea, y la última (el giro) llega con un golpe.
      e.lineas.forEach((linea, k) => {
        const en = t.corte + parte(t, e.lineas.length, k) + TEXTO.entra;
        teclea(en, decir(linea), TEXTO.cada, NIVEL.tecla * 1.5);
        if (k === e.lineas.length - 1) pon(en - 2, kenney("drop_002"), NIVEL.pop);
      });
    }
    if (e.tipo === "nombre") {
      pon(t.corte + 2, hecho("campana"), NIVEL.campana);
      pon(t.corte + despierta(t.largo), kenney("drop_002"), NIVEL.pop);
      teclea(t.corte + despierta(t.largo) + NOMBRE.linea, decir(TEXTOS.nombre), NOMBRE.cada, NIVEL.tecla * 1.2);
    }
    if (e.tipo === "pantalla") {
      // La frase grande, un «pop» por función a la que llega la cámara y,
      // donde el puntero hace clic, su clic.
      teclea(t.corte + PANTALLA.titulo, decir(e.titulo), PANTALLA.cada, NIVEL.tecla * 1.2);
      const n = focosQueCaben(t.largo, e.focos.length);
      e.focos.slice(0, n).forEach((foco, k) => {
        pon(t.corte + llegaDato(t.largo, n, k), kenney("drop_002"), NIVEL.pop);
        if (foco.clic) pon(t.corte + clicEn(t.largo, n, k), TECLAS[1], NIVEL.tecla * 1.8);
      });
    }
    if (e.tipo === "adeo") {
      const estados = TEXTOS.adeo.estados;
      pon(t.corte + 4, kenney("tick_002"), NIVEL.tic);
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
    if (e.tipo === "cierre") pon(t.corte + CIERRE.web, kenney("drop_002"), NIVEL.pop);
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

  // El ritmo entra con el nombre: el problema va solo con el colchón, bajo, y
  // la pieza arranca de verdad cuando aparece el logotipo.
  const nombre = tramos.find((t) => t.escena.tipo === "nombre");
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
  const arranca = nombre ? interpolate(frame, [nombre.corte - 14, nombre.corte + 6], [ANTES_DEL_NOMBRE, 1], pinza) : 1;
  const cama = NIVEL.cama * interpolate(frame, [0, 24], [0, 1], pinza) * arranca * sale * musica;
  const ritmo = nombre ? NIVEL.ritmo * interpolate(frame, [nombre.corte - 4, nombre.corte + 8], [0, 1], pinza) * sale * musica : 0;

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
      {efectos(tramos, fps, decir).map((e, i) => (
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
