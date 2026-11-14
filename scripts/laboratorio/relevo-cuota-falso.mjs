// El Claude Code de mentira del laboratorio del relevo por cuota
// (`relevo-cuota-de-verdad.mjs`). No llama a ningún modelo.
//
// Con `--session-id <id>` (lo que abre `open_pane`) escribe su transcript en su
// `CLAUDE_CONFIG_DIR` como lo deja Claude Code 2.1.323 al quedarse sin cuota: la
// respuesta de mentira con el 429 y `quotaLimits` (copiada de la terminal de la
// papelera del 2026-11-13), la nota de «continuing automatically» y el fin de
// turno. Con `--resume <id>`, mira si esa conversación está en SU cuenta, le
// añade el «sigue» y una respuesta, y lo dice. Todo queda en `diario.txt`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const config = process.env.CLAUDE_CONFIG_DIR || join(process.env.USERPROFILE ?? "", ".claude");
const carpeta = join(config, "projects", process.cwd().replace(/[^A-Za-z0-9]/g, "-"));
const ultimo = args.filter((a) => !a.startsWith("--")).at(-1) ?? "";
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const diario = join(import.meta.dirname, "diario.txt");
appendFileSync(diario, `${JSON.stringify({ config: process.env.CLAUDE_CONFIG_DIR ?? "", resumeMin: process.env.CLAUDE_CODE_RESUME_THRESHOLD_MINUTES ?? "", args })}\n`);

const linea = (o) => `${JSON.stringify(o)}\n`;
const nueva = valor("--session-id");
const retoma = valor("--resume");
if (nueva) {
  mkdirSync(carpeta, { recursive: true });
  const renueva = Math.floor((Date.now() + 2 * 3_600_000) / 1000);
  writeFileSync(
    join(carpeta, `${nueva}.jsonl`),
    linea({ type: "user", sessionId: nueva, timestamp: iso(Date.now() - 5000), message: { role: "user", content: ultimo || "Tarea de laboratorio" } }) +
      linea({ type: "assistant", sessionId: nueva, timestamp: iso(Date.now() - 4000), message: { model: "claude-opus-5-5", role: "assistant", content: [{ type: "text", text: "Empiezo con la tarea. MARCA-DE-LA-CUENTA-VIEJA" }] } }) +
      linea({
        type: "assistant", sessionId: nueva, timestamp: iso(),
        message: { model: "<synthetic>", role: "assistant", content: [{ type: "text", text: "You've hit your 5-hour limit · resets 3:40am (Europe/Madrid)" }] },
        apiError: "usage_limit_reached",
        quotaLimits: { status: "rejected", resetsAt: renueva, unifiedRateLimitFallbackAvailable: false, rateLimitType: "five_hour", overageStatus: "rejected" },
        error: "rate_limit", isApiErrorMessage: true, apiErrorStatus: 429,
      }) +
      linea({ type: "system", subtype: "informational", level: "notice", timestamp: iso(), content: "Usage limit reached · continuing automatically at 3:40am · esc to cancel" }) +
      linea({ type: "system", subtype: "turn_duration", timestamp: iso() }),
  );
  console.log(`FALSO NACE CONFIG=[${process.env.CLAUDE_CONFIG_DIR ?? ""}] SESION=${nueva}`);
  console.log("You've hit your 5-hour limit · resets 3:40am (Europe/Madrid)");
  console.log("Usage limit reached · continuing automatically at 3:40am · esc to cancel");
} else if (retoma) {
  const ruta = join(carpeta, `${retoma}.jsonl`);
  if (!existsSync(ruta)) {
    console.log(`FALSO NO ENCUENTRA CONFIG=[${process.env.CLAUDE_CONFIG_DIR ?? ""}] SESION=${retoma}`);
  } else {
    const antes = readFileSync(ruta, "utf8");
    appendFileSync(
      ruta,
      linea({ type: "user", sessionId: retoma, timestamp: iso(), message: { role: "user", content: ultimo } }) +
        linea({ type: "assistant", sessionId: retoma, timestamp: iso(), message: { model: "claude-opus-5-5", role: "assistant", content: [{ type: "text", text: "Sigo con lo pendiente. MARCA-DE-LA-CUENTA-NUEVA" }] } }) +
        linea({ type: "system", subtype: "turn_duration", timestamp: iso() }),
    );
    const vieja = antes.includes("MARCA-DE-LA-CUENTA-VIEJA") ? "SI" : "NO";
    console.log(`FALSO RETOMA CONFIG=[${process.env.CLAUDE_CONFIG_DIR ?? ""}] SESION=${retoma} HISTORIA=${antes.trim().split("\n").length} VIEJA=${vieja}`);
    console.log(`SIGUE=${ultimo.slice(0, 90)}`);
  }
} else {
  console.log(`FALSO SIN SESION ARGS=${args.join(" ")}`);
}
