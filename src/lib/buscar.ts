// Buscar como busca la gente, no como compara un ordenador.
//
// En toda la app se venía haciendo `a.toLowerCase().includes(b)`, y eso deja
// fuera dos cosas que cualquiera da por hechas: que «sesion» encuentre
// «sesión», y que escribir dos palabras sueltas encuentre una frase que las
// tiene en otro orden. Un buscador que no perdona una tilde parece roto, no
// estricto.

/**
 * El texto en su forma comparable: sin tildes, sin diéresis y en minúsculas.
 *
 * `NFD` separa cada letra de su acento y el rango `̀-ͯ` son esos
 * acentos ya sueltos, así que quitarlos deja la letra base. La eñe se conserva
 * a propósito: en castellano no es una ene con virgulilla, es otra letra, y
 * quien escribe «año» no está buscando «ano».
 */
export function llano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, (m, i, orig: string) => (orig[i - 1] === "n" ? m : ""))
    .normalize("NFC")
    .toLowerCase();
}

/**
 * ¿Este texto responde a esta búsqueda?
 *
 * Cada palabra de la consulta tiene que aparecer en alguna parte, pero no en
 * orden ni juntas: «hover boton» encuentra «arreglar el hover del botón». Con
 * la consulta vacía responde que sí, que es lo que hace que una lista sin
 * filtrar salga entera.
 */
export function encaja(texto: string, consulta: string): boolean {
  const q = llano(consulta).trim();
  if (!q) return true;
  const t = llano(texto);
  return q.split(/\s+/).every((palabra) => t.includes(palabra));
}
