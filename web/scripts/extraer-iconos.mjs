/* ============================================================================
   Adeorq · web/scripts/extraer-iconos.mjs

   Saca los iconos de la app DE VERDAD (src/components/Icons.tsx) y los escribe
   como un sprite SVG que la maqueta usa con <use href="#i-...">.

   El porque de no redibujarlos a mano: en Adeorq no hay ni un emoji ni un glifo
   de fuente, todos los iconos son SVG de trazo 1.9 en una rejilla de 24 con las
   puntas redondeadas, y ese detalle es la mitad de que la maqueta se parezca al
   programa. Copiados a ojo salen parecidos, no iguales; y en cuanto alguien
   retoca uno en la app, la maqueta se queda con el viejo para siempre.

   Se lanza con:  node scripts/extraer-iconos.mjs

   Solo se traen los que la maqueta enseña, no los 90: un sprite con todo pesaria
   de mas para nada.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ICONS = resolve(AQUI, '../../src/components/Icons.tsx');
const SALIDA = resolve(AQUI, '../demo/iconos.svg');

/** Los que salen en la maqueta, con el nombre corto que usara el HTML. */
const QUIERO = {
  PanelIcon: 'panel',
  CockpitIcon: 'cabina',
  AgendaIcon: 'agenda',
  CanvasIcon: 'lienzo',
  AccountIcon: 'cuentas',
  CommandIcon: 'comandos',
  SettingsIcon: 'ajustes',
  MemoryIcon: 'memoria',
  ChatIcon: 'chat',
  SendIcon: 'enviar',
  KanbanIcon: 'kanban',
  SparkIcon: 'chispa',
  BoltIcon: 'rayo',
  BrowserIcon: 'navegador',
  StreamIcon: 'emision',
  UnminimizeIcon: 'traer',
  TerminalIcon: 'terminal',
  EyeIcon: 'ojo',
  EyeOffIcon: 'ojo-off',
  TrashIcon: 'papelera',
  CloseIcon: 'cerrar',
  MaximizeIcon: 'maximizar',
  MinimizeIcon: 'minimizar',
  RestoreIcon: 'restaurar',
  SearchIcon: 'buscar',
  PlusIcon: 'mas',
  MinusIcon: 'menos',
  RefreshIcon: 'refrescar',
  GridIcon: 'rejilla',
  RowsIcon: 'filas',
  StripIcon: 'tira',
  ChevronIcon: 'chevron',
  CheckIcon: 'check',
  GitBranchIcon: 'rama',
  FolderIcon: 'carpeta',
  FoldersIcon: 'carpetas',
  CalendarIcon: 'calendario',
  BulbIcon: 'bombilla',
  TargetIcon: 'diana',
  FlagIcon: 'bandera',
  PencilIcon: 'lapiz',
  ImageIcon: 'imagen',
  NoteIcon: 'nota',
  GalleryIcon: 'galeria',
  ArchiveIcon: 'archivo',
  DownloadIcon: 'descargar',
  SacarIcon: 'sacar',
  DevolverIcon: 'devolver',
  OpacityIcon: 'opacidad',
  CornerIcon: 'esquina',
  AdeorqMark: 'marca',
};

const src = readFileSync(ICONS, 'utf8');

/** El contenido entre <svg ...> y </svg> de una funcion exportada. */
function dibujoDe(nombre) {
  const i = src.indexOf(`export function ${nombre}(`);
  if (i < 0) return null;
  const fin = src.indexOf('\nexport ', i + 10);
  const trozo = src.slice(i, fin < 0 ? src.length : fin);

  const abre = trozo.search(/<svg[\s\S]*?>/);
  if (abre < 0) return null;
  const tras = trozo.slice(abre).replace(/^<svg[\s\S]*?>/, '');
  const cierra = tras.indexOf('</svg>');
  if (cierra < 0) return null;

  return tras.slice(0, cierra)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    // JSX escribe `/>` igual que SVG, pero cuela expresiones {x} en algun icono
    // con variantes: esos no se pueden traer tal cual y se avisan en vez de
    // dejar un icono roto dentro del sprite.
    .join('\n      ');
}

const buenos = [];
const malos = [];

for (const [fn, id] of Object.entries(QUIERO)) {
  const d = dibujoDe(fn);
  if (!d) { malos.push(fn + ' (no encontrado)'); continue; }
  if (d.includes('{') || d.includes('}')) { malos.push(fn + ' (lleva codigo dentro)'); continue; }
  buenos.push({ id, fn, d });
}

if (!buenos.length) {
  console.error('extraer-iconos: no se ha podido sacar ni uno; ha cambiado Icons.tsx');
  process.exit(1);
}

const svg = `<!-- ============================================================================
     Adeorq · demo/iconos.svg
     GENERADO. No editar a mano: sale de src/components/Icons.tsx con
     scripts/extraer-iconos.mjs.

     Son los iconos de la app tal cual: trazo 1.9, rejilla de 24, puntas
     redondeadas. Se usan con <svg class="ade-i"><use href="iconos.svg#i-panel"/></svg>
     ============================================================================ -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
${buenos.map(b => `  <symbol id="i-${b.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      ${b.d}
  </symbol>`).join('\n')}
</svg>
`;

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, svg, 'utf8');

console.log(`iconos.svg -> ${buenos.length} iconos: ${buenos.map(b => b.id).join(', ')}`);
if (malos.length) console.log('sin traer (hay que mirarlos): ' + malos.join(', '));
