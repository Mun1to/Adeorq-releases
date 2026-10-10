// Abrir un archivo escribiendo parte de su nombre (Ctrl+P): qué sale y en qué
// orden. Puro, para probarlo sin la app (`pnpm bancos abrir-por-nombre`).
//
// La lista entera la da Rust una vez al abrir (`listar_nombres`); aquí solo se
// filtra y se ordena en cada tecla, que con veinte mil rutas tiene que ser un
// recorrido y nada más.

/** Un archivo de la lista, partido en lo que se enseña. */
export interface ArchivoHallado {
  /** La ruta relativa a la raíz, con barras normales: lo que identifica la fila. */
  ruta: string;
  nombre: string;
  /** La carpeta donde está, vacía si cuelga de la raíz. */
  carpeta: string;
}

/** Cuántas filas se pintan como mucho: nadie baja más allá, y pintar mil sí se nota. */
export const TOPE_FILAS = 60;

/** Sin tildes y en minúsculas, como la paleta. */
const llano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function partir(ruta: string): ArchivoHallado {
  const corte = ruta.lastIndexOf("/");
  return { ruta, nombre: ruta.slice(corte + 1), carpeta: corte < 0 ? "" : ruta.slice(0, corte) };
}

/**
 * Los archivos que casan con lo escrito, lo más probable arriba.
 *
 * Cada palabra tiene que estar en la ruta, en cualquier orden («pty lib» da
 * `src/lib/pty.ts`). Y manda el NOMBRE: primero los que empiezan por lo
 * escrito, luego los que lo llevan dentro, y al final los que solo casan por
 * la carpeta. A igualdad, la ruta más corta, que suele ser la que se busca.
 *
 * Sin nada escrito salen los de arriba del proyecto, por lo mismo: es donde
 * están el README y el `package.json`.
 */
export function filtrarArchivos(rutas: string[], q: string, tope = TOPE_FILAS): ArchivoHallado[] {
  const palabras = llano(q).split(/\s+/).filter(Boolean);
  const hondo = (r: string) => r.split("/").length;
  if (!palabras.length) {
    return rutas
      .slice()
      .sort((a, b) => hondo(a) - hondo(b) || a.localeCompare(b))
      .slice(0, tope)
      .map(partir);
  }
  const primera = palabras[0];
  const hallados: Array<{ a: ArchivoHallado; nota: number }> = [];
  for (const ruta of rutas) {
    const llana = llano(ruta);
    if (!palabras.every((p) => llana.includes(p))) continue;
    const a = partir(ruta);
    const nombre = llano(a.nombre);
    hallados.push({ a, nota: nombre.startsWith(primera) ? 0 : nombre.includes(primera) ? 1 : 2 });
  }
  return hallados
    .sort((x, y) => x.nota - y.nota || x.a.ruta.length - y.a.ruta.length || x.a.ruta.localeCompare(y.a.ruta))
    .slice(0, tope)
    .map((x) => x.a);
}

/** La ruta entera de un hallado, con el separador de la raíz (en Windows, `\`). */
export function rutaEntera(raiz: string, relativa: string): string {
  const sep = raiz.includes("\\") ? "\\" : "/";
  return `${raiz.replace(/[\\/]+$/, "")}${sep}${relativa.split("/").join(sep)}`;
}
