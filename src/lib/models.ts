// Which brain each kind of job wants.
//
// This is the cheap half of the "router de decisión" parked in docs/METAS.md.
// The parked one picks the CLI and the subscription and needs multi-account and
// multi-CLI first; this one only picks the model INSIDE Claude, which needs
// neither, and it does it WITHOUT a single extra token:
//
//   - the table below costs nothing and is right almost always, because the
//     mapping job -> brain is stable;
//   - when the Foreman wants to override it, the model travels in the plan it
//     already generates, so there is no second call and no second "bot".
//
// Deliberately NOT an extra model call: spending tokens to decide which model
// spends tokens only pays off if it is right, and a wrong pick (Sonnet on a
// real security audit) costs far more than the whole saving.

export const MODEL_ALIASES = ["fable", "opus", "sonnet", "haiku"] as const;
export type ModelAlias = (typeof MODEL_ALIASES)[number];

export function isModelAlias(x: string | undefined): x is ModelAlias {
  return !!x && (MODEL_ALIASES as readonly string[]).includes(x);
}

/**
 * The house table, by what the job actually demands:
 *
 *   opus    judgement and consequence — security, audits, review, architecture,
 *           anything where being subtly wrong is expensive and hard to spot.
 *   sonnet  the bulk of the craft — writing features, refactors, tests, styles.
 *           Cheaper and fast, and the mistakes are the kind you catch at once.
 *   haiku   errands — renames, translations, formatting, mechanical sweeps.
 *
 * Matched by substring so labels can be free text ("Seguridad", "Security
 * review", "Bugs de pago"): the caller writes a role, not an enum.
 */
const TABLE: Array<{ hints: string[]; model: ModelAlias }> = [
  {
    model: "opus",
    hints: [
      "segur", "secur", "vulnerab", "audit", "revis", "review", "arquitect",
      "architect", "diseñ", "design", "bug", "error", "fallo", "deuda", "riesgo",
    ],
  },
  {
    model: "haiku",
    hints: ["traduc", "translat", "renombr", "rename", "formate", "format", "recado", "typo"],
  },
  {
    model: "sonnet",
    hints: [
      "front", "back", "api", "código", "codigo", "code", "test", "estilo",
      "style", "css", "refactor", "web", "landing", "ui",
    ],
  },
];

/** The brain a role gets when nobody said otherwise. Sonnet is the default on
    purpose: the common case is craft, and defaulting to Opus is how a board of
    nine terminals quietly becomes expensive. */
export function modelForRole(role: string): ModelAlias {
  const r = role.toLowerCase();
  for (const row of TABLE) {
    if (row.hints.some((h) => r.includes(h))) return row.model;
  }
  return "sonnet";
}

/** One line for the Foreman's prompt, so it proposes from the same table it
    would otherwise have to guess at. */
export function modelPolicyText(): string {
  return (
    "opus = juicio y consecuencia (seguridad, vulnerabilidades, auditoría, revisión, " +
    "arquitectura, bugs difíciles) · sonnet = el grueso del oficio (features, " +
    "refactors, tests, estilos, web) · haiku = recados (traducciones, renombrados, " +
    "formateo). Por defecto sonnet."
  );
}
