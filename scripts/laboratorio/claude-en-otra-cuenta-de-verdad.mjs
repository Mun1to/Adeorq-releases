// Un Claude Code DE VERDAD abierto por `open_pane` en otra cuenta, sin `account`.
//
// Gasta un mensaje de Haiku de la cuenta que se le pase (la «2da MAIN» el
// 2026-11-02, con cuota de sobra). Se mira que la terminal nace en esa cuenta
// (`CLAUDE_CONFIG_DIR`), en modo auto, sin pararse en la confianza de la
// carpeta ni en ninguna otra pregunta, y que contesta: su respuesta queda en
// el transcript DE ESA CUENTA.
//
// La app es la aislada (su casa, sus datos, su puerto de MCP); la única cuenta
// que ve es la que se le pasa, así que la elige sola. La principal de la casa
// aislada no tiene sesión, y la de Munir no se toca.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/claude-en-otra-cuenta-de-verdad.mjs <carpeta de la cuenta> [exe]
//
// Al acabar borra el transcript que dejó en esa cuenta. La confianza en la
// carpeta de pruebas se queda en su `.claude.json` (una entrada de una carpeta
// temporal que ya no existe).
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const dirCuenta = process.argv[2];
const exe = process.argv[3] ?? EXE;
if (!dirCuenta || !existsSync(join(dirCuenta, ".credentials.json"))) {
  console.error("Pásame la carpeta de una cuenta de Claude con la sesión iniciada.");
  process.exit(2);
}
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `\n      ${detalle}` : ""}`);
};

// Desde una terminal de Claude Code el entorno trae SU cuenta: fuera.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const etiqueta = "2da MAIN";
const guarda = `localStorage.setItem("adeorq-accounts", ${JSON.stringify(
  JSON.stringify({ accounts: [{ id: "c-real", label: etiqueta, dir: dirCuenta, provider: "claude" }], defaultAccount: "main:claude" }),
)});`;

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: "claude-otra-cuenta", puertoMcp, depurar: 9750 + (process.pid % 100), exe, guarda });
let transcript = "";
try {
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });

  const r = await agente.llamar("open_pane", {
    cli: "claude",
    cwd: a.demo,
    model: "haiku",
    name: "prueba de cuenta",
    brief: "Contesta solo con la palabra LISTO y nada más.",
  });
  const confianza = () => {
    try {
      const j = JSON.parse(readFileSync(join(dirCuenta, ".claude.json"), "utf8"));
      const k = Object.keys(j.projects ?? {}).find((x) => x.toLowerCase() === a.demo.replace(/\\/g, "/").toLowerCase());
      return k ? `${k} → ${j.projects[k].hasTrustDialogAccepted}` : "sin entrada";
    } catch (e) {
      return `ilegible: ${e.message}`;
    }
  };
  console.log(`      confianza tras open_pane: ${confianza()}`);
  console.log(`\n--- open_pane ---\n${r.texto ?? r.error}\n-----------------`);
  const id = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
  dice(Number.isFinite(id) && r.texto.includes(`«${etiqueta}»`), "sin `account` la abre en la cuenta que tiene sesión", r.texto ?? r.error);
  dice(/NO ve la memoria de la principal/.test(r.texto ?? ""), "y avisa de lo que no ve de la principal");

  // La carpeta de pruebas es nueva en cada pasada, así que la conversación que
  // aparezca en ESTA cuenta para ella solo puede ser la de esta terminal.
  const carpeta = join(dirCuenta, "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  const suyo = () => {
    try {
      const f = readdirSync(carpeta).find((x) => x.endsWith(".jsonl"));
      return f ? join(carpeta, f) : "";
    } catch {
      return "";
    }
  };

  // Lo que se ve mientras arranca, por si se para a preguntar algo.
  const pantallas = [];
  const contesto = await hasta(async () => {
    const p = (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
    pantallas.push(p);
    transcript = suyo();
    if (!transcript) return null;
    const lineas = readFileSync(transcript, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const suya = lineas.find((l) => l?.type === "assistant" && JSON.stringify(l.message?.content ?? "").includes("LISTO"));
    return suya ? { modelo: suya.message?.model, pantalla: p } : null;
  }, 120_000, 2000);
  const vistas = pantallas.join("\n");
  console.log(`      confianza al final: ${confianza()}`);
  dice(!!contesto, "contesta, y su respuesta queda en el transcript de ESA cuenta", contesto ? "" : `pantalla:\n${pantallas.slice(-1)[0]}`);
  if (contesto) console.log(`      modelo: ${contesto.modelo}\n      transcript: ${transcript}`);
  dice(/haiku/i.test(contesto?.modelo ?? ""), "con Haiku", contesto?.modelo);
  dice(!/trust (this|the files in this) folder|Do you trust/i.test(vistas), "no se paró en la confianza de la carpeta");
  dice(!/Enable auto mode|auto mode\?|Yes, enable|No, exit/i.test(vistas), "ni en ninguna pregunta del modo auto");
  const ultima = contesto?.pantalla ?? pantallas.slice(-1)[0] ?? "";
  dice(/auto mode on|⏵⏵ auto|auto-accept|auto mode/i.test(ultima), "y en su pie se lee el modo auto", ultima.split("\n").filter((l) => l.trim()).slice(-4).join(" | "));
  console.log(`\n--- última pantalla ---\n${ultima.split("\n").filter((l) => l.trim()).slice(-14).join("\n")}\n----------------------`);
  console.log(`      foto: ${await a.foto(null, "claude-otra-cuenta.png")}`);
  await dormir(500);
} finally {
  await a.cerrar();
  // Lo que dejó la prueba en la cuenta de verdad: su conversación, y la
  // carpeta si quedó vacía.
  if (transcript) {
    rmSync(transcript, { force: true });
    rmSync(transcript.replace(/\.jsonl$/, ""), { recursive: true, force: true });
    const carpeta = join(transcript, "..");
    try { if (!readdirSync(carpeta).length) rmSync(carpeta, { recursive: true, force: true }); } catch {}
  }
}
console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
