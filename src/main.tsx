import ReactDOM from "react-dom/client";
import App from "./App";
import VentanaSuelta from "./components/VentanaSuelta";
import { leerPerfil, raizPorDefecto, tocarPerfil } from "./lib/perfil";
import Salvavidas, { vigilarErrores } from "./components/Salvavidas";
import { Onboarding } from "./components/OnboardingPerezoso";
import { vigilarMods } from "./lib/mods";
import { vigilarParones } from "./lib/parones";
import { vigilarParpadeo } from "./lib/parpadeo";
import { alinearAnimaciones } from "./lib/relojDeAnimaciones";
import { aplicarAspecto, prefAspecto } from "./lib/aspecto";
import { temaEsClaro } from "./lib/barraMac";
import { THEME_KEY } from "./lib/i18n";
import { APAGON_KEY, apagon, aplicarApagon, TEMA_TERM_KEY } from "./lib/temasTerm";
import "./App.css";

/* El tema en una terminal suelta. Lo pone `App.tsx` en `<html>`, y aquí no se
 * monta: sin él, un estilo liso salía con la paleta azul de fábrica y «A juego
 * con el tema» con el esquema de la casa, aunque la principal fuera Drácula. Se
 * lee el que guarda la principal y se sigue si cambia allí (el evento `storage`
 * llega a las demás ventanas). */
function ponerTemaDeLaPrincipal(): void {
  const raiz = document.documentElement;
  const tema = localStorage.getItem(THEME_KEY);
  if (tema) raiz.dataset.theme = tema;
  else delete raiz.dataset.theme;
  raiz.toggleAttribute("data-claro", temaEsClaro(tema ?? ""));
  // Pone el apagón, marca si la terminal va oscura y avisa a la terminal.
  aplicarApagon(apagon());
}

// La carpeta de proyectos se resuelve ANTES de montar nada. Media app la usa
// como el «dónde» de una terminal que no tiene un proyecto detrás, así que si
// llegara un render tarde, la primera terminal del arranque podría nacer en la
// carpeta equivocada. Es una sola lectura de disco y pasa una única vez: en
// cuanto está en el perfil, ya no se vuelve a preguntar.
/* La interfaz solo arranca en su propia ventana.
 *
 * Desde que hay navegador de verdad (`navegador.rs`), una web abierta en él
 * podría cargar la propia Adeorq: navegando a ella o metiéndola en un iframe.
 * Ahí dentro tendría los permisos de la app (Tauri trata su dirección como
 * local) y arrancaría un segundo tablero que abre terminales. Rust ya le cierra
 * la puerta a esas direcciones en la pestaña; esto es la segunda cerradura, por
 * si algo se cuela por un iframe, que el filtro de navegación no ve. */
function enSuVentana(): boolean {
  if (window.top !== window.self) return false;
  const meta = (window as { __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata;
  return !meta?.currentWebview?.label?.startsWith("nav-");
}

const SU_VENTANA = enSuVentana();
if (SU_VENTANA) {
  // Antes de montar nada: si algo falla durante el arranque, que quede escrito.
  vigilarErrores();
  // Los mods del usuario, también en una terminal suelta: es la misma página. No
  // se espera a ellos para montar; su hoja llega un instante después.
  vigilarMods();
  // El estilo (Cristal, Terminal, Consola, Liso), antes del primer pintado: así
  // no asoma el cristal un instante, y cada terminal nace leyendo ya su fondo
  // de verdad, que con un estilo liso es opaco (`lib/aspecto.ts`).
  aplicarAspecto(prefAspecto());
  // El borde de las terminales: si el rojo y el amarillo parpadean, y que todos
  // sus tramos y parpadeos den el paso a la vez. También en una terminal suelta.
  vigilarParpadeo();
  alinearAnimaciones();
}

async function arrancar() {
  /* Una terminal sacada a su propia ventana.
   *
   * Es la MISMA página (`index.html`) con un parámetro puesto, y no un HTML
   * aparte: así una terminal suelta y una de dentro son el mismo componente, y
   * lo que se arregle en una queda arreglado en la otra. Lo que cambia es que
   * aquí no se monta Adeorq entera, solo ese panel: montar la app completa
   * abriría un segundo tablero, un segundo Capataz y un segundo todo. */
  const suelta = new URLSearchParams(location.search);
  const idSuelta = Number(suelta.get("suelta"));
  if (idSuelta) {
    ponerTemaDeLaPrincipal();
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === THEME_KEY || e.key === TEMA_TERM_KEY || e.key === APAGON_KEY) ponerTemaDeLaPrincipal();
    });
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <Salvavidas>
        <VentanaSuelta id={idSuelta} nombre={suelta.get("nombre") ?? `Terminal ${idSuelta}`} />
      </Salvavidas>,
    );
    return;
  }
  // Quien dijo que no tiene una carpeta madre no la recibe por la puerta de
  // atrás: rellenarla aquí es lo que convertía «omitir» en «tus Descargas son
  // un proyecto». Sus terminales nacen igual, solo que sueltas.
  if (!leerPerfil().raiz && !leerPerfil().sinRaiz) {
    try {
      tocarPerfil({ raiz: await raizPorDefecto() });
    } catch {
      // Si Rust no contesta, cada llamada sigue mandando vacío y es él quien
      // decide: se pierde el ajuste, no el arranque.
    }
  }
  // Los parones, solo en la ventana principal: el latido hacia Rust es uno, y
  // una terminal suelta escondida le diría que no se ve la que sí se ve.
  vigilarParones();
  // La primera vez, la bienvenida tiene que estar en el primer pintado: se
  // espera a su trozo, que es un archivo del disco. Con tope, para que un trozo
  // que no contesta no deje la ventana en blanco: pasado 1,5 s la app pinta, y
  // la bienvenida sale por su camino perezoso si el trozo acaba llegando.
  if (!leerPerfil().hecho)
    await Promise.race([Onboarding.precargar(), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  // No StrictMode: its dev-only double-mount would spawn and kill every PTY twice.
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <Salvavidas>
      <App />
    </Salvavidas>,
  );
}

if (SU_VENTANA) void arrancar();
