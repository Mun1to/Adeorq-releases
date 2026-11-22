// La bienvenida sale una vez por instalación, así que viaja en su propio trozo
// (9 kB menos de arranque, medido el 2026-11-22). Vive aquí y no en `App.tsx`
// para que `main.tsx` pueda precargarla antes del primer pintado sin importar
// nada más de la app: esa vez se espera al trozo, o la app asoma sin ella.
import { perezoso } from "../lib/perezoso";

export const Onboarding = perezoso(() => import("./Onboarding"));
