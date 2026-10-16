// xterm da por hecho un navegador: con esto arranca en Node sin uno. Se importa
// ANTES que `@xterm/xterm` (los imports se evalúan en orden).
const g = globalThis as unknown as Record<string, unknown>;
g.self = globalThis;
g.window = globalThis;
export {};
