import ReactDOM from "react-dom/client";
import App from "./App";
import { leerPerfil, raizPorDefecto, tocarPerfil } from "./lib/perfil";

// La carpeta de proyectos se resuelve ANTES de montar nada. Media app la usa
// como el «dónde» de una terminal que no tiene un proyecto detrás, así que si
// llegara un render tarde, la primera terminal del arranque podría nacer en la
// carpeta equivocada. Es una sola lectura de disco y pasa una única vez: en
// cuanto está en el perfil, ya no se vuelve a preguntar.
async function arrancar() {
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
    <App />,
  );
}

void arrancar();
