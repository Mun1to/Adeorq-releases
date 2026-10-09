// El icono de cada pestaña de la cabecera. Aparte de `lib/vistas.ts` para que
// esa lista sea solo datos y la pueda leer Ajustes sin arrastrar JSX.

import type { View } from "../lib/vistas";
import {
  AccountIcon,
  AgendaIcon,
  CanvasIcon,
  ChatIcon,
  CockpitIcon,
  CommandIcon,
  DecisionIcon,
  MemoryIcon,
  PanelIcon,
  SettingsIcon,
} from "./Icons";

const ICONOS: Record<View, (p: { size?: number }) => React.ReactElement> = {
  panel: PanelIcon,
  cabina: CockpitIcon,
  chat: ChatIcon,
  agenda: AgendaIcon,
  decisiones: DecisionIcon,
  lienzo: CanvasIcon,
  memoria: MemoryIcon,
  cuentas: AccountIcon,
  comandos: CommandIcon,
  ajustes: SettingsIcon,
};

export default function IconoPestana({ vista }: { vista: View }) {
  const Icono = ICONOS[vista];
  return <Icono size={16} />;
}
