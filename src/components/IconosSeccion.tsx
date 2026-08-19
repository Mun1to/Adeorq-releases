// Los iconos de las barras de secciones del Panel, Cuentas y la Agenda.
//
// Misma rejilla de 24 y mismo trazo de 1.9 que el resto de la app (Icons.tsx):
// los de Ajustes se dibujaron un día en una rejilla de 20 con trazo 1.6 y
// salían más finos y más pequeños que cualquier icono de al lado, que es justo
// lo que los hacía costar de reconocer (Munir, 2026-07-30).

const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      {children}
    </svg>
  );
}

/** El pulso: lo que está pasando ahora mismo. */
export const IconoAhora = () => (
  <Svg>
    <path d="M3 12h4l2.4-6 4.2 12L16 12h5" {...P} />
  </Svg>
);

/** La carpeta, que es lo que un proyecto es en el disco. */
export const IconoProyectos = () => (
  <Svg>
    <path d="M3.2 6.6a1.8 1.8 0 0 1 1.8-1.8h3.6l2 2.4h7.4a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5a1.8 1.8 0 0 1-1.8-1.8Z" {...P} />
  </Svg>
);


/** La tarjeta de una cuenta. */
export const IconoCuentas = () => (
  <Svg>
    <rect x="3" y="5.4" width="18" height="13.2" rx="2.4" {...P} />
    <path d="M3 9.6h18M6.6 14.6h4" {...P} />
  </Svg>
);

/** La llave de una clave de API. */
export const IconoLlave = () => (
  <Svg>
    <circle cx="8.2" cy="8.2" r="3.6" {...P} />
    <path d="m10.8 10.8 8 8M16.4 16.4l-1.8 1.8M19 14.2l-1.8 1.8" {...P} />
  </Svg>
);

/** El rayo de los atajos. */
export const IconoAtajo = () => (
  <Svg>
    <path d="M13.4 2.8 4.6 13.6h6.2l-1.2 7.6 8.8-10.8h-6.2Z" {...P} />
  </Svg>
);

/** La caja de lo que no está instalado. */
export const IconoDescargar = () => (
  <Svg>
    <path d="M12 3.4v11" {...P} />
    <path d="m7.6 10.2 4.4 4.4 4.4-4.4" {...P} />
    <path d="M4 17.2v1.6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.6" {...P} />
  </Svg>
);

/** La diana de los objetivos del día. */
export const IconoObjetivos = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.6" {...P} />
    <circle cx="12" cy="12" r="4.4" {...P} />
    <circle cx="12" cy="12" r="0.6" {...P} strokeWidth="2.6" />
  </Svg>
);



