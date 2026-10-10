// La terminal del lienzo que nace con un encargo dentro.
//
// Vivía en `App.tsx`, que estaba en su techo de líneas. Salió tal cual, movida
// por un guion y con la misma huella antes y después
// (`scripts/laboratorio/lanzar-nota.js`): lo que toca del componente son tres
// cosas, y las tres le llegan por aquí.

import { useCallback } from "react";
import { planDeArranque } from "./arranque";
import { sessionIdOf } from "./comandos";
import { comandoDelPlan } from "./lanzar";
import { cerebroPorDefecto } from "./models";
import { fotoRapida, reglasDeLaMemoria } from "./mundo";
import { leerPerfil } from "./perfil";
import { PROVIDERS } from "./providers";
import { mainAccount, saveEncargo, type Account, type Project } from "./pty";
import { exigenciaDeRol, modoAviso, recetarConMemoria } from "./router";
import type { Aparte } from "./encargosDelLienzo";
import type { CanvasPane } from "../components/CanvasView";

interface Ref<T> {
  current: T;
}

export interface ManosDeLanzar {
  /** Pone la terminal en el lienzo. Es de App, que es quien lleva la lista. */
  createCanvasPane: (
    kind: "claude" | "shell" | "agy",
    project: Project,
    propio?: { name?: string; command?: string[] },
    cuenta?: Account,
  ) => CanvasPane;
  accountsRef: Ref<{ list: Account[] }>;
  agyExe: Ref<string | null>;
}

export function useLanzarEnLienzo({ createCanvasPane, accountsRef, agyExe }: ManosDeLanzar) {
  /**
   * Una terminal del LIENZO que nace con un encargo dentro.
   *
   * Es lo que pasa al arrastrar una tarjeta del tablero a «Trabajando». El
   * encargo va en la línea de comando y no escrito después, por lo mismo que en
   * `openClaudePrompt`: una terminal que nace con su encargo no gasta ni un
   * token en no tenerlo. Y queda apuntado por su id de sesión, que es lo que
   * luego permite saber para qué se abrió cada una.
   */
  return useCallback(
    async (texto: string, project: Project, aparte?: Aparte) => {
      const limpio = texto.trim();
      if (!limpio) return;
      // De qué va, que es lo que se juzga, se apunta y da nombre. En una tarjeta
      // es el propio encargo. En una nota no: su encargo trae la ruta del
      // archivo y las reglas de marcar casillas, y la terminal salía llamándose
      // «Estás conectado a mi nota…» y elegida por palabras que no eran tuyas.
      const sobre = aparte?.juzgar.trim() || limpio;
      const rotulo = aparte?.nombre.trim() || limpio;
      // El MISMO router que usa el Asistente decide con qué nace. Hasta ahora
      // toda tarjeta arrastrada abría un Claude con el modelo por defecto:
      // «traduce los tooltips» y «audita el login» salían iguales. Deducirlo de
      // las palabras de la tarjeta no cuesta un token, es una tabla, así que la
      // tarjeta sigue abriéndose de un tirón.
      const receta = recetarConMemoria(exigenciaDeRol(sobre), {
        cuentas: await fotoRapida([
          ...PROVIDERS.map((p) => mainAccount(p.id)),
          ...accountsRef.current.list,
        ]),
        avisos: modoAviso(),
        usa: leerPerfil().clis,
        reglas: await reglasDeLaMemoria(),
      }, undefined, cerebroPorDefecto(), { proyecto: project.name, encargo: sobre });
      const titulo = rotulo.length > 30 ? `${rotulo.slice(0, 30)}…` : rotulo;
      const nombre = `${project.name} · ${titulo}`;

      // Solo Claude y Antigravity aceptan el encargo en la línea de arranque;
      // al resto se les abre la terminal y el encargo va al portapapeles. Es la
      // misma regla que `openReceta` aplica en la cabina.
      const plan = planDeArranque({
        cli: receta.cli,
        encargo: limpio,
        modelo: receta.modelo,
        esfuerzo: receta.esfuerzo,
        agyExe: agyExe.current,
      });
      // A quien no acepta el encargo al arrancar se le copia y se le abre la
      // terminal: el plan devuelve el texto justo para esto, así que copiarlo y
      // decidirlo no pueden separarse.
      if (plan.tipo === "linea" && plan.alPortapapeles) {
        void navigator.clipboard.writeText(plan.alPortapapeles).catch(() => {});
      }
      const command = comandoDelPlan(plan);
      if (plan.tipo !== "claude") {
        createCanvasPane(plan.tipo === "agy" ? "agy" : "shell", project, {
          name: nombre,
          command,
        }, receta.cuenta);
        return;
      }
      const sid = sessionIdOf(command);
      if (sid) {
        void saveEncargo(sid, {
          encargo: sobre.slice(0, 600),
          cuando: new Date().toISOString(),
        }).catch(() => {});
      }
      // El nombre, con el encargo cortado: siete terminales llamadas «claude»
      // no se distinguen, y el título que pone Claude tarda en llegar.
      createCanvasPane("claude", project, { name: nombre, command }, receta.cuenta);
    },
    [createCanvasPane],
  );
}
