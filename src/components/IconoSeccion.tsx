// El icono de cada grupo de Ajustes, en la barra de la izquierda (`SettingsView.tsx`).
// Vive aparte desde el 2026-11-24, cuando SettingsView llegó a su tope de 2.000 líneas
// (`gordos-check`) al añadir el grupo «Salud».

import { CommandIcon, RobotIcon, TerminalIcon } from "./Icons";

/**
 * Un icono por grupo.
 *
 * Iban dibujados en una rejilla de 20 y con trazo 1.6, y toda la app usa la de
 * 24 con trazo 1.9 (Icons.tsx): salían más finos y más pequeños que cualquier
 * otro icono de al lado, y eso es justo lo que los hacía costar de reconocer
 * (Munir, 2026-07-30). Ahora comparten rejilla y grosor con el resto.
 *
 * Y tres no se dibujan aquí porque ya existen: la terminal, la tecla de atajo y
 * el robot de los agentes, que es el de «Bots». Un segundo dibujo de lo mismo es
 * un dibujo que un día se queda distinto.
 */
export default function IconoSeccion({ id }: { id: string }) {
  if (id === "terminales") return <TerminalIcon size={17} />;
  if (id === "atajos") return <CommandIcon size={17} />;
  if (id === "bots") return <RobotIcon size={17} />;

  const P = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      {/* La paleta del pintor: es de lo que va el grupo, y se lee antes que un
          círculo medio pintado, que puede ser cualquier cosa. */}
      {id === "aspecto" && (
        <>
          <path
            d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.3 0 2-.8 2-1.8 0-.9-.6-1.4-.6-2.1 0-.8.6-1.4 1.5-1.4h1.6a4.5 4.5 0 0 0 4.3-4.6c0-4.3-3.9-7.7-8.8-7.7Z"
            {...P}
          />
          <path d="M8.2 10.6h.01M12 8.2h.01M15.6 10.6h.01" {...P} strokeWidth="2.6" />
        </>
      )}
      {/* El salvavidas: se lee como «ayuda» antes que un interrogante suelto,
          que en una barra de iconos parece «no sé qué es esto». */}
      {id === "ayuda" && (
        <>
          <circle cx="12" cy="12" r="8.8" {...P} />
          <circle cx="12" cy="12" r="3.6" {...P} />
          <path d="m5.8 5.8 3.7 3.7M18.2 5.8l-3.7 3.7M5.8 18.2l3.7-3.7M18.2 18.2l-3.7-3.7" {...P} />
        </>
      )}
      {/* La luna: el horario de la noche, que es de lo que va Salud. */}
      {id === "salud" && <path d="M19.6 14.6A8 8 0 1 1 9.4 4.4a6.4 6.4 0 0 0 10.2 10.2Z" {...P} />}
      {/* El escudo, con la marca de «a salvo» dentro. */}
      {id === "escudo" && (
        <>
          <path d="M12 3.2 4.8 6v5.4c0 4.4 3 8.1 7.2 9.4 4.2-1.3 7.2-5 7.2-9.4V6Z" {...P} />
          <path d="m8.9 12.1 2.2 2.2 4-4.2" {...P} />
        </>
      )}
      {/* La campana, con su badajo: sin él es una seta. */}
      {id === "avisos" && (
        <>
          <path d="M18.4 9.6a6.4 6.4 0 1 0-12.8 0c0 5.4-2.2 7-2.2 7h17.2s-2.2-1.6-2.2-7Z" {...P} />
          <path d="M13.9 19.8a2.2 2.2 0 0 1-3.8 0" {...P} />
        </>
      )}
      {/* El chip: el cuadrado con su núcleo y sus patillas. Es el dibujo con el
          que se entiende «algo que corre en TU máquina». */}
      {id === "modelo" && (
        <>
          <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.8" {...P} />
          <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" {...P} />
          <path
            d="M9.4 2.6v2.8M14.6 2.6v2.8M9.4 18.6v2.8M14.6 18.6v2.8M2.6 9.4h2.8M2.6 14.6h2.8M18.6 9.4h2.8M18.6 14.6h2.8"
            {...P}
          />
        </>
      )}
      {/* El móvil: el marco con su botón abajo. */}
      {id === "movil" && (
        <>
          <rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.6" {...P} />
          <path d="M10.6 18.2h2.8" {...P} />
        </>
      )}
      {/* Las capas: un mod es la tuya, puesta encima de la de la app. */}
      {id === "mods" && (
        <>
          <path d="M12 3.4 20.6 8 12 12.6 3.4 8Z" {...P} />
          <path d="m3.4 12.4 8.6 4.6 8.6-4.6M3.4 16.6l8.6 4.6 8.6-4.6" {...P} />
        </>
      )}
      {/* Discord: su silueta, con las dos patas de abajo, que es lo que la
          distingue de cualquier otro bocadillo con ojos. */}
      {id === "discord" && (
        <>
          <path
            d="M8.9 17.6c-2.3-.5-4.1-1.5-5.2-2.8.3-5 1.8-8.4 2.8-9.5 1.4-.8 3-1.3 3-1.3l.7 1.5a12.4 12.4 0 0 1 5.6 0l.7-1.5s1.6.5 3 1.3c1 1.1 2.5 4.5 2.8 9.5-1.1 1.3-2.9 2.3-5.2 2.8"
            {...P}
          />
          <path d="M8.9 17.6 7.4 20.6M15.1 17.6l1.5 3" {...P} />
          <path d="M9.4 12.4h.01M14.6 12.4h.01" {...P} strokeWidth="2.8" />
        </>
      )}
      {/* La app: el círculo con la i, que en todas partes significa «acerca de
          esto». Aquí dentro está la versión y la cuota. */}
      {id === "adeorq" && (
        <>
          <circle cx="12" cy="12" r="9" {...P} />
          <path d="M12 11.2v5M12 7.8h.01" {...P} strokeWidth="2.2" />
        </>
      )}
    </svg>
  );
}
