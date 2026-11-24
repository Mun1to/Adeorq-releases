// «Así se verá tu terminal»: la columna de la derecha de Ajustes › Aspecto y
// Ajustes › Terminales. Munir, 2026-11-24: «poner a la derecha un como se
// veria en tu termnal para no estar yendo y volviendo».
//
// No es una captura ni una terminal de verdad: son unas líneas de una sesión
// normal (un encargo, el agente leyendo y editando, un diff, las pruebas)
// escritas con los colores del esquema puesto, la letra elegida y el mismo
// fondo que pinta una terminal (`--xterm-bg` sobre `--pane-bg`, que App.tsx
// recalcula al mover «cuánto se ve»). Todo lo que cambia en esas pestañas se
// ve aquí al momento, sin cerrar Ajustes.

import { useT } from "../lib/i18n";
import { coloresTerm, esquemaClaro, esquemaReal } from "../lib/temasTerm";

interface Props {
  /** El esquema de terminal elegido (puede ser el «a juego con el tema»). */
  temaTerm: string;
  /** El tema de la casa, que decide el esquema cuando va «a juego». */
  tema: string;
  /** El tamaño de la letra de las terminales, en px. */
  letra: number;
}

export default function VistaTerminal({ temaTerm, tema, letra }: Props) {
  const { t } = useT();
  const esquema = esquemaReal(temaTerm, tema);
  const c = coloresTerm(esquema);
  return (
    <aside className="set-vista" aria-label={t("Así se verá tu terminal")}>
      <p className="set-vista-tit">{t("Así se verá tu terminal")}</p>
      <div className="vista-term" data-claro={esquemaClaro(esquema)}>
        <div className="vista-term-cab">
          <i className="vista-term-punto" aria-hidden="true" />
          <span>adeorq</span>
          <span className="vista-term-cli">claude</span>
        </div>
        <div className="vista-term-cuerpo" aria-hidden="true" style={{ fontSize: `${letra}px`, color: c.foreground }}>
          <div>
            <span style={{ color: c.cyan }}>~/adeorq</span> <span style={{ color: c.green }}>❯</span>{" "}
            {t("arregla el login")}
          </div>
          <div>
            <span style={{ color: c.magenta }}>●</span> {t("Leo")} <span style={{ color: c.blue }}>src/auth.ts</span>
          </div>
          <div>
            <span style={{ color: c.magenta }}>●</span> {t("Edito")} <span style={{ color: c.blue }}>src/auth.ts</span>
          </div>
          <div style={{ color: c.red }}>{"  - if (token) return"}</div>
          <div style={{ color: c.green }}>{"  + if (!token) return"}</div>
          <div>
            <span style={{ color: c.green }}>✓</span> pnpm test <span style={{ color: c.brightBlack }}>{t("12 pasan")}</span>
          </div>
          <div>
            <span style={{ color: c.yellow }}>⚠</span> <span style={{ color: c.brightBlack }}>{t("2 avisos")}</span>
          </div>
          <div>
            <span style={{ color: c.green }}>❯</span>
            <span className="vista-term-cursor" style={{ background: c.cursor }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
