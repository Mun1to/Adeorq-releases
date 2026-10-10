// Lo que hace que el editor de archivos sea un editor de código: sus colores,
// sus teclas y sus ayudas. `EditorPane.tsx` pone el archivo y el guardado;
// esto, todo lo demás.
//
// **Los colores salen del esquema de la terminal** (`temasTerm.ts`), no de un
// tema de CodeMirror. Hasta el 2026-10-10 el código se pintaba con el resaltado
// por defecto de CodeMirror, que está pensado para fondo blanco: sobre el
// cristal oscuro los nombres salían en azul marino y las palabras clave en
// morado oscuro, y casi no se leían (se ve en `scripts/laboratorio/
// editor-se-ve.js`). Con el esquema de la terminal, el código y la terminal de
// al lado se leen con la misma letra, y cambian a la vez al cambiar de esquema.
//
// Los colores van como variables de CSS (`--cod-…`) puestas en la caja del
// editor, y el resaltado solo las nombra: así cambiar de esquema repinta sin
// tener que rehacer el editor, que perdería el cursor y el deshacer.
//
// Qué trae y de dónde salió la lista: de mirar lo que cualquiera da por hecho
// en VS Code, Orca y opencode (buscar y reemplazar, ir a una línea, corchetes
// que se emparejan y se cierran, plegar, quitar el ajuste de línea). Todo son
// piezas oficiales de CodeMirror, con licencia MIT.

import { useEffect, useState, type CSSProperties } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { tags as e } from "@lezer/highlight";
import { coloresTerm, TEMA_TERM_EVENTO, type ColoresTerm } from "./temasTerm";

/* ── los colores ──────────────────────────────────────────────────────────── */

/**
 * Qué color del esquema de la terminal lleva cada cosa del código.
 *
 * El reparto es el de casi todos los temas de editor, para que no haya que
 * aprender nada: las palabras del lenguaje en magenta, los textos en verde, los
 * números en amarillo, las funciones en azul, los tipos en cian y las notas
 * apagadas.
 */
export function varsDeCodigo(c: ColoresTerm): Record<string, string> {
  return {
    "--cod-texto": c.foreground,
    "--cod-clave": c.magenta,
    "--cod-cadena": c.green,
    "--cod-numero": c.yellow,
    "--cod-nota": c.brightBlack,
    "--cod-funcion": c.blue,
    "--cod-tipo": c.cyan,
    "--cod-propiedad": c.brightBlue,
    "--cod-etiqueta": c.red,
    "--cod-cursor": c.cursor,
  };
}

/** Las variables de color para la caja del editor, al día con el esquema elegido. */
export function useVarsDeCodigo(): CSSProperties {
  const [vars, setVars] = useState(() => varsDeCodigo(coloresTerm()));
  useEffect(() => {
    const repintar = () => setVars(varsDeCodigo(coloresTerm()));
    window.addEventListener(TEMA_TERM_EVENTO, repintar);
    return () => window.removeEventListener(TEMA_TERM_EVENTO, repintar);
  }, []);
  return vars as CSSProperties;
}

const RESALTE = HighlightStyle.define([
  { tag: [e.keyword, e.modifier, e.operatorKeyword, e.self], color: "var(--cod-clave)" },
  { tag: [e.string, e.special(e.string), e.regexp, e.character], color: "var(--cod-cadena)" },
  { tag: [e.escape, e.special(e.brace)], color: "var(--cod-tipo)" },
  { tag: [e.number, e.bool, e.null, e.atom, e.unit, e.color], color: "var(--cod-numero)" },
  { tag: [e.constant(e.variableName), e.standard(e.variableName)], color: "var(--cod-numero)" },
  { tag: [e.comment, e.meta, e.processingInstruction], color: "var(--cod-nota)", fontStyle: "italic" },
  { tag: [e.function(e.variableName), e.function(e.propertyName), e.macroName, e.labelName], color: "var(--cod-funcion)" },
  { tag: [e.typeName, e.className, e.namespace, e.annotation], color: "var(--cod-tipo)" },
  { tag: [e.propertyName, e.attributeName], color: "var(--cod-propiedad)" },
  { tag: [e.tagName, e.invalid, e.deleted], color: "var(--cod-etiqueta)" },
  { tag: [e.operator, e.punctuation, e.derefOperator], color: "color-mix(in srgb, var(--cod-texto) 72%, transparent)" },
  { tag: e.heading, color: "var(--cod-funcion)", fontWeight: "700" },
  { tag: [e.link, e.url], color: "var(--cod-tipo)", textDecoration: "underline" },
  { tag: e.emphasis, fontStyle: "italic" },
  { tag: e.strong, fontWeight: "700" },
  { tag: e.strikethrough, textDecoration: "line-through" },
  { tag: [e.monospace, e.inserted], color: "var(--cod-cadena)" },
  { tag: [e.quote, e.contentSeparator], color: "var(--cod-nota)" },
]);

/* ── el aspecto ───────────────────────────────────────────────────────────── */

/**
 * El aspecto del editor, sacado de las variables de Adeorq.
 *
 * A propósito NO se usa ninguno de los temas que trae CodeMirror: Adeorq tiene
 * su firma (cristal sobre una foto) y un editor con los colores de otro
 * producto se vería pegado encima. Todo sale de `var(--…)`, así que cambia solo
 * con el tema de la casa.
 */
const TEMA = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--cod-texto, var(--text))", height: "100%" },
  ".cm-content": { fontFamily: "var(--mono, Consolas, 'Cascadia Mono', monospace)", caretColor: "var(--cod-cursor, var(--accent))" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { opacity: "0.7", padding: "0 6px 0 10px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--row) 55%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)", opacity: "1" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cod-cursor, var(--accent))", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 34%, transparent)",
  },
  ".cm-scroller": { overflow: "auto" },
  // Otra aparición de lo que tienes seleccionado, y la pareja del corchete.
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--accent) 26%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--accent) 60%, transparent)",
  },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "color-mix(in srgb, var(--wait) 30%, transparent)" },
  // Plegar: la flecha solo se ve al acercarse al margen, para que el margen
  // siga siendo números y no una columna de flechas.
  ".cm-foldGutter .cm-gutterElement": { cursor: "pointer", padding: "0 4px 0 0" },
  ".cod-pliega": { opacity: "0", transition: "opacity .12s ease" },
  // Lo que ya está plegado se ve siempre: si no, no sabrías que falta algo.
  ".cm-gutters:hover .cod-pliega, .cod-plegado": { opacity: "0.85" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--row)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    color: "var(--muted)",
    padding: "0 7px",
    margin: "0 3px",
  },
  // Lo que encuentra la búsqueda.
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--ask) 30%, transparent)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--ask) 62%, transparent)" },
  // El panel de buscar y el de ir a una línea, con los mandos de la casa.
  ".cm-panels": { backgroundColor: "var(--popover)", color: "var(--text)", borderColor: "var(--border)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search, .cm-panel.cm-dialog form": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "8px 34px 8px 10px",
    fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
    fontSize: "12.5px",
  },
  // «Ir a la línea» es un diálogo de CodeMirror (`.cm-dialog`), no un panel de
  // búsqueda: lleva su formulario dentro y su aspa aparte.
  ".cm-panel.cm-search, .cm-panel.cm-dialog": { position: "relative" },
  ".cm-panel.cm-search br": { flexBasis: "100%", height: "0", content: '""' },
  ".cm-panel .cm-textfield": {
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "5px 9px",
    margin: "0",
    fontSize: "12.5px",
    minWidth: "190px",
    outline: "none",
  },
  ".cm-panel .cm-textfield:focus": { borderColor: "var(--accent)" },
  ".cm-panel .cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--row)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "4px 10px",
    margin: "0",
    fontSize: "12.5px",
    cursor: "pointer",
  },
  ".cm-panel .cm-button:hover": { backgroundColor: "var(--row-hover)" },
  ".cm-panel.cm-search label, .cm-panel.cm-dialog label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    color: "var(--muted)",
    fontSize: "12px",
  },
  ".cm-panel.cm-search input[type=checkbox]": { accentColor: "var(--accent)", margin: "0" },
  ".cm-panel.cm-search [name=close], .cm-panel .cm-dialog-close": {
    position: "absolute",
    top: "6px",
    right: "8px",
    backgroundColor: "transparent",
    border: "none",
    color: "var(--muted)",
    fontSize: "18px",
    lineHeight: "1",
    padding: "2px 6px",
    cursor: "pointer",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--text)",
    border: "1px solid var(--border-strong)",
    borderRadius: "8px",
  },
});

/* ── el ajuste de línea ───────────────────────────────────────────────────── */

const AJUSTE_KEY = "adeorq-editor-ajuste";
const AJUSTE_EVENTO = "adeorq:editor-ajuste";
const AJUSTE = new Compartment();

/** Si las líneas largas bajan a la siguiente (lo de fábrica) o siguen de largo. */
export function ajusteDeLinea(): boolean {
  try {
    return localStorage.getItem(AJUSTE_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Lo cambia para TODAS las hojas abiertas, no solo para la que tiene el teclado. */
export function alternarAjuste(): boolean {
  try {
    localStorage.setItem(AJUSTE_KEY, ajusteDeLinea() ? "0" : "1");
  } catch {
    /* sin almacén no se recuerda, pero el cambio de ahora sí se hace */
  }
  window.dispatchEvent(new Event(AJUSTE_EVENTO));
  return true;
}

const sigueElAjuste = ViewPlugin.define((view) => {
  const poner = () => view.dispatch({ effects: AJUSTE.reconfigure(ajusteDeLinea() ? EditorView.lineWrapping : []) });
  window.addEventListener(AJUSTE_EVENTO, poner);
  return {
    destroy() {
      window.removeEventListener(AJUSTE_EVENTO, poner);
    },
  };
});

/* ── las frases ───────────────────────────────────────────────────────────── */

/** Lo que CodeMirror escribe en sus paneles, en español. En inglés ya viene. */
const FRASES_ES: Record<string, string> = {
  "Go to line": "Ir a la línea",
  go: "ir",
  Find: "Buscar",
  Replace: "Reemplazar",
  next: "siguiente",
  previous: "anterior",
  all: "todas",
  "match case": "mayúsculas",
  "by word": "palabra entera",
  regexp: "expresión",
  replace: "reemplazar",
  "replace all": "reemplazar todas",
  close: "cerrar",
  "current match": "esta",
  "replaced $ matches": "$ reemplazadas",
  "replaced match on line $": "reemplazada en la línea $",
  "on line": "en la línea",
  "Fold line": "Plegar",
  "Unfold line": "Desplegar",
  "folded code": "código plegado",
  unfold: "desplegar",
};

/* ── todo junto ───────────────────────────────────────────────────────────── */

function flecha(abierto: boolean): HTMLElement {
  const s = document.createElement("span");
  s.textContent = abierto ? "▾" : "▸";
  s.className = abierto ? "cod-pliega" : "cod-pliega cod-plegado";
  return s;
}

/**
 * Las extensiones del editor, menos el lenguaje y el aviso de cambios, que los
 * pone `EditorPane` porque dependen del archivo.
 *
 * `guardar` se llama con Ctrl+S. Las teclas propias van ANTES que las de
 * CodeMirror: Ctrl+G aquí es «ir a la línea» (lo de VS Code) y en su mapa de
 * búsqueda sería «siguiente».
 */
export function extensionesDeCodigo({ lang, guardar }: { lang: string; guardar: () => void }): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter({ markerDOM: flecha }),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    syntaxHighlighting(RESALTE, { fallback: true }),
    indentUnit.of("  "),
    EditorState.phrases.of(lang === "es" ? FRASES_ES : {}),
    TEMA,
    AJUSTE.of(ajusteDeLinea() ? EditorView.lineWrapping : []),
    sigueElAjuste,
    keymap.of([
      // Ctrl+S guarda, que es lo que va a pulsar cualquiera sin pensarlo.
      { key: "Mod-s", preventDefault: true, run: () => (guardar(), true) },
      { key: "Mod-g", preventDefault: true, run: gotoLine },
      { key: "Alt-z", preventDefault: true, run: alternarAjuste },
      indentWithTab,
      ...closeBracketsKeymap,
      ...searchKeymap,
      ...foldKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
  ];
}
