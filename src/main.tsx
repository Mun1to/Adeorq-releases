import ReactDOM from "react-dom/client";
import App from "./App";
import VentanaSuelta from "./components/VentanaSuelta";
import { leerPerfil, raizPorDefecto, tocarPerfil } from "./lib/perfil";
import Salvavidas, { vigilarErrores } from "./components/Salvavidas";
import "./App.css";

// La carpeta de proyectos se resuelve ANTES de montar nada. Media app la usa
// como el «dónde» de una terminal que no tiene un proyecto detrás, así que si
// llegara un render tarde, la primera terminal del arranque podría nacer en la
// carpeta equivocada. Es una sola lectura de disco y pasa una única vez: en
// cuanto está en el perfil, ya no se vuelve a preguntar.
// Antes de montar nada: si algo falla durante el arranque, que quede escrito.
vigilarErrores();

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
  // No StrictMode: its dev-only double-mount would spawn and kill every PTY twice.
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <Salvavidas>
      <App />
    </Salvavidas>,
  );
}

void arrancar();
