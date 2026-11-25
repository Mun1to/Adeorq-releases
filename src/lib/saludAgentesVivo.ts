// El aviso de la noche a los agentes, enganchado a las terminales abiertas. Lo
// que decide (cuándo y a quién) es puro y vive en `saludAgentes.ts`; aquí solo
// se lee cada terminal como la lee la vuelta hacia arriba (`vueltaArribaVivo.ts`):
// su CLI por su comando, su estado del panel y su pantalla con el lector de su
// caja. Se monta una vez, desde la campana (`Campana.tsx`, siempre montada).

import { kindDeComando } from "../components/KindIcon";
import { useCabina } from "./cabina";
import { lectorDeCaja } from "./cajaDeEntrada";
import { enPantalla, trabajaEnPantalla } from "./contexto";
import { tAhora } from "./i18n";
import { proveedorDe, sabe } from "./providers";
import { datosPanel, sendPty } from "./pty";
import { leerPospuesto, leerSalud } from "./salud";
import { crearSaludAgentes, MIRAR_SALUD_MS, type TerminalSalud } from "./saludAgentes";
import { xtermDe } from "./terminales";
import { compactandoEnPantalla } from "./vueltaArriba";

const clis = new Map<number, string>();
const pidiendo = new Set<number>();

/** El CLI de esa terminal por su comando; `undefined` mientras se pregunta. */
function cliDe(id: number): string | undefined {
  const c = clis.get(id);
  if (c !== undefined || pidiendo.has(id)) return c;
  pidiendo.add(id);
  void datosPanel(id)
    .then((x) => void clis.set(id, kindDeComando(x.command?.join(" ") ?? "")))
    .catch(() => {})
    .finally(() => pidiendo.delete(id));
  return undefined;
}

function terminal(id: number): TerminalSalud | null {
  const estado = useCabina.getState().estados[id];
  const cli = cliDe(id);
  if (!estado || cli === undefined) return null;
  const term = xtermDe(id);
  const lector = lectorDeCaja(cli);
  return {
    estado,
    deAgente: !!proveedorDe(cli),
    conCaja: !!lector,
    enSuCaja: !!lector && enPantalla(term, lector.enSuCaja),
    // Compactarse no escribe en el transcript: por él seguiría en «lista».
    trabajando:
      enPantalla(term, trabajaEnPantalla) || (!!lector && enPantalla(term, lector.trabaja)) || enPantalla(term, compactandoEnPantalla),
    turnoEnDisco: sabe(cli, "compactaConTraspaso") || sabe(cli, "estadoDelDisco"),
  };
}

/** Engancha el aviso a las terminales; devuelve cómo soltarlo. */
export function conectarSaludAgentes(): () => void {
  const aviso = crearSaludAgentes({
    ahora: Date.now,
    salud: leerSalud,
    pospuesto: leerPospuesto,
    paneles: () => Object.keys(useCabina.getState().estados).map(Number),
    terminal,
    teclear: (id, linea) => void sendPty(id, linea).catch(() => {}),
    atascada: (id, linea) => {
      const tiene = lectorDeCaja(clis.get(id) ?? "")?.tieneEscrito;
      return !!tiene && enPantalla(xtermDe(id), (l, f) => tiene(l, f, linea));
    },
    intro: (id) => void sendPty(id, "", true).catch(() => {}),
    t: tAhora,
  });
  const reloj = window.setInterval(() => void aviso.mirar(), MIRAR_SALUD_MS);
  return () => window.clearInterval(reloj);
}
