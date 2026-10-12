// Crea los proyectos de demostración con su historial de git de verdad.
// Uso: node sembrar-proyectos.mjs <carpeta de proyectos>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RAIZ = process.argv[2];
if (!RAIZ) throw new Error("falta la carpeta de proyectos");

const DIA = 86_400_000;
const AHORA = Date.now();

function git(cwd, args, fecha) {
  const env = { ...process.env };
  if (fecha) {
    env.GIT_AUTHOR_DATE = fecha;
    env.GIT_COMMITTER_DATE = fecha;
  }
  return execFileSync(
    "git",
    ["-c", "user.name=Sam Rivera", "-c", "user.email=sam@example.com", "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
}

function escribir(base, rel, texto) {
  const f = join(base, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, texto.replace(/^\n/, ""));
}

/** Un proyecto: commits en orden, cada uno con los archivos que deja escritos. */
function proyecto(nombre, commits, sinGuardar = {}) {
  const base = join(RAIZ, nombre);
  if (existsSync(join(base, ".git"))) {
    console.log(`= ${nombre} ya estaba`);
    return;
  }
  mkdirSync(base, { recursive: true });
  git(base, ["init", "-q", "-b", "main"]);
  for (const c of commits) {
    for (const [rel, texto] of Object.entries(c.archivos)) escribir(base, rel, texto);
    git(base, ["add", "-A"]);
    git(base, ["commit", "-q", "-m", c.msg], new Date(AHORA - c.hace * DIA).toISOString());
  }
  for (const [rel, texto] of Object.entries(sinGuardar)) escribir(base, rel, texto);
  console.log(`+ ${nombre}: ${commits.length} commits`);
}

// ---------------------------------------------------------------- storefront-api
proyecto("storefront-api", [
  {
    hace: 13,
    msg: "chore: project skeleton with node:test",
    archivos: {
      "package.json": `
{
  "name": "storefront-api",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
`,
      ".gitignore": "node_modules/\n.env\n",
      "README.md": `
# storefront-api

The API behind the shop: cart maths, discount codes and checkout.

    npm start     # http://localhost:4000
    npm test

Prices are integer cents everywhere, so totals never drift.
`,
    },
  },
  {
    hace: 11,
    msg: "feat(cart): subtotal and total with tax",
    archivos: {
      "src/cart.js": `
// Cart maths. Prices are integer cents so totals never drift.

export function subtotal(items) {
  return items.reduce((sum, it) => sum + it.priceCents * it.qty, 0);
}

export function total(items, { taxRate = 0.21 } = {}) {
  return Math.round(subtotal(items) * (1 + taxRate));
}
`,
      "test/cart.test.js": `
import assert from "node:assert/strict";
import { test } from "node:test";
import { subtotal, total } from "../src/cart.js";

const items = [
  { sku: "mug", priceCents: 1250, qty: 2 },
  { sku: "tee", priceCents: 1999, qty: 1 },
];

test("subtotal adds price times quantity", () => {
  assert.equal(subtotal(items), 4499);
});

test("total adds tax and stays in whole cents", () => {
  assert.equal(total(items), 5444);
});
`,
    },
  },
  {
    hace: 8,
    msg: "feat(server): /health and /cart/total",
    archivos: {
      "src/server.js": `
import { createServer } from "node:http";
import { total } from "./cart.js";

const PORT = Number(process.env.PORT ?? 4000);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.method === "POST" && req.url === "/cart/total") {
    const { items = [], code } = await body(req);
    return json(res, 200, { totalCents: total(items, { code }) });
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log("storefront-api on :" + PORT));
`,
    },
  },
  {
    hace: 3,
    msg: "feat(cart): discount codes",
    archivos: {
      "src/cart.js": `
// Cart maths. Prices are integer cents so totals never drift.

const CODES = { WELCOME10: 0.1, SUMMER25: 0.25 };

export function subtotal(items) {
  return items.reduce((sum, it) => sum + it.priceCents * it.qty, 0);
}

export function applyDiscount(cents, code) {
  const rate = CODES[code] ?? 0;
  return cents - cents * rate;
}

export function total(items, { code, taxRate = 0.21 } = {}) {
  const net = applyDiscount(subtotal(items), code);
  return Math.round(net * (1 + taxRate));
}
`,
      "test/cart.test.js": `
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDiscount, subtotal, total } from "../src/cart.js";

const items = [
  { sku: "mug", priceCents: 1250, qty: 2 },
  { sku: "tee", priceCents: 1999, qty: 1 },
];

test("subtotal adds price times quantity", () => {
  assert.equal(subtotal(items), 4499);
});

test("total adds tax and stays in whole cents", () => {
  assert.equal(total(items), 5444);
});

test("WELCOME10 takes ten percent off, in whole cents", () => {
  assert.equal(applyDiscount(4499, "WELCOME10"), 4049);
});

test("an unknown code changes nothing", () => {
  assert.equal(applyDiscount(4499, "NOPE"), 4499);
});
`,
    },
  },
  {
    hace: 1,
    msg: "docs: how discount codes are applied",
    archivos: {
      "docs/discounts.md": `
# Discount codes

A code is a rate applied to the subtotal, before tax.

| Code | Off |
|---|---|
| WELCOME10 | 10% |
| SUMMER25 | 25% |

The discounted amount is still whole cents: a customer is never charged a fraction.
`,
    },
  },
]);

// ---------------------------------------------------------------- landing-web
proyecto(
  "landing-web",
  [
    {
      hace: 12,
      msg: "feat: hero and pricing sections",
      archivos: {
        "index.html": `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Northwind Coffee</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="hero">
      <h1>Coffee that shows up before you run out.</h1>
      <p>Freshly roasted, on your schedule.</p>
      <a class="cta" href="#plans">See the plans</a>
    </header>
    <section id="plans" class="plans">
      <article><h2>Solo</h2><p>250 g every two weeks</p></article>
      <article><h2>Household</h2><p>1 kg every two weeks</p></article>
    </section>
    <script src="script.js"></script>
  </body>
</html>
`,
        "styles.css": `
:root { --ink: #1c1917; --paper: #faf7f2; --accent: #b45309; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
.hero { padding: 96px 24px; text-align: center; }
.hero h1 { font-size: clamp(2rem, 6vw, 4rem); margin: 0 0 12px; text-wrap: balance; }
.cta { display: inline-block; padding: 12px 20px; border-radius: 999px; background: var(--accent); color: #fff; text-decoration: none; }
.plans { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); padding: 24px; }
.plans article { padding: 24px; border: 1px solid #e7e5e4; border-radius: 16px; background: #fff; }
`,
        "script.js": `document.querySelector(".cta")?.addEventListener("click", () => console.log("plans"));\n`,
        "README.md": `
# landing-web

The marketing site. Plain HTML and CSS, no build step.

    npx serve .
`,
      },
    },
    { hace: 6, msg: "feat: faq section", archivos: { "faq.html": "<!doctype html>\n<title>FAQ</title>\n<h1>Questions</h1>\n<p>Can I pause? Any time.</p>\n" } },
    { hace: 2, msg: "fix: hero heading wraps badly on narrow phones", archivos: { "styles.css": `
:root { --ink: #1c1917; --paper: #faf7f2; --accent: #b45309; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
.hero { padding: 96px 24px; text-align: center; }
.hero h1 { font-size: clamp(1.75rem, 6vw, 4rem); margin: 0 0 12px; text-wrap: balance; }
.cta { display: inline-block; padding: 12px 20px; border-radius: 999px; background: var(--accent); color: #fff; text-decoration: none; }
.plans { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); padding: 24px; }
.plans article { padding: 24px; border: 1px solid #e7e5e4; border-radius: 16px; background: #fff; }
` } },
  ],
  {
    "index.html": `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Northwind Coffee</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="hero">
      <h1>Coffee that shows up before you run out.</h1>
      <p>Freshly roasted, on your schedule. Pause or skip any time.</p>
      <a class="cta" href="#plans">See the plans</a>
    </header>
    <section id="plans" class="plans">
      <article><h2>Solo</h2><p>250 g every two weeks</p></article>
      <article><h2>Household</h2><p>1 kg every two weeks</p></article>
      <article><h2>Office</h2><p>3 kg every week</p></article>
    </section>
    <script src="script.js"></script>
  </body>
</html>
`,
  },
);

// ---------------------------------------------------------------- invoice-cli
proyecto("invoice-cli", [
  {
    hace: 10,
    msg: "feat: invoice totals from a json file",
    archivos: {
      "invoice.py": `
"""Turn a JSON list of line items into an invoice total."""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Line:
    description: str
    quantity: int
    unit_cents: int

    @property
    def cents(self) -> int:
        return self.quantity * self.unit_cents


def load(path: Path) -> list[Line]:
    return [Line(**row) for row in json.loads(path.read_text(encoding="utf-8"))]


def total(lines: list[Line], tax_rate: float = 0.21) -> int:
    net = sum(line.cents for line in lines)
    return round(net * (1 + tax_rate))


def main() -> None:
    parser = argparse.ArgumentParser(prog="invoice")
    parser.add_argument("file", type=Path)
    parser.add_argument("--tax", type=float, default=0.21)
    args = parser.parse_args()
    cents = total(load(args.file), args.tax)
    print(f"{cents / 100:.2f}")


if __name__ == "__main__":
    main()
`,
      "README.md": `
# invoice-cli

    python invoice.py examples/october.json --tax 0.21

Reads line items from JSON and prints the total with tax.
`,
      "examples/october.json": `
[
  { "description": "Design review", "quantity": 6, "unit_cents": 9000 },
  { "description": "Hosting", "quantity": 1, "unit_cents": 2400 }
]
`,
    },
  },
  {
    hace: 5,
    msg: "test: totals round to whole cents",
    archivos: {
      "tests/test_invoice.py": `
from invoice import Line, total


def test_total_adds_tax():
    lines = [Line("Design review", 6, 9000), Line("Hosting", 1, 2400)]
    assert total(lines) == 68244


def test_no_lines_is_zero():
    assert total([]) == 0
`,
      "pyproject.toml": `
[project]
name = "invoice-cli"
version = "0.2.0"
requires-python = ">=3.11"

[tool.pytest.ini_options]
pythonpath = ["."]
`,
    },
  },
]);

// ---------------------------------------------------------------- mobile-app
proyecto("mobile-app", [
  {
    hace: 9,
    msg: "feat: order list screen",
    archivos: {
      "package.json": `
{
  "name": "mobile-app",
  "version": "0.1.0",
  "private": true,
  "scripts": { "start": "expo start", "test": "jest" }
}
`,
      "App.tsx": `
import { OrderList } from "./src/screens/OrderList";

export default function App() {
  return <OrderList />;
}
`,
      "src/screens/OrderList.tsx": `
import { FlatList, Text, View } from "react-native";
import { useOrders } from "../useOrders";

export function OrderList() {
  const orders = useOrders();
  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => (
        <View style={{ padding: 16 }}>
          <Text>{item.title}</Text>
          <Text>{item.status}</Text>
        </View>
      )}
    />
  );
}
`,
      "src/useOrders.ts": `
import { useEffect, useState } from "react";

export interface Order {
  id: string;
  title: string;
  status: "roasting" | "shipped" | "delivered";
}

export function useOrders(): Order[] {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    fetch("https://api.example.com/orders")
      .then((r) => r.json())
      .then(setOrders);
  }, []);
  return orders;
}
`,
      "README.md": "# mobile-app\n\nThe customer app: orders, pauses and skips.\n",
    },
  },
  { hace: 4, msg: "feat: pull to refresh", archivos: { "src/screens/Refresh.tsx": "export const REFRESH_MS = 30_000;\n" } },
]);

// ---------------------------------------------------------------- docs-site
proyecto("docs-site", [
  {
    hace: 14,
    msg: "docs: getting started and api reference",
    archivos: {
      "README.md": "# docs-site\n\nEverything a new teammate reads in week one.\n",
      "docs/getting-started.md": "# Getting started\n\n1. Clone the three repos.\n2. `npm install` in each.\n3. Start the API, then the site.\n",
      "docs/api.md": "# API reference\n\n## POST /cart/total\n\nBody: `{ items, code }`. Returns `{ totalCents }`.\n",
      "mkdocs.yml": "site_name: Northwind docs\nnav:\n  - Getting started: getting-started.md\n  - API: api.md\n",
    },
  },
  { hace: 7, msg: "docs: release checklist", archivos: { "docs/release.md": "# Release checklist\n\n- [ ] Tests green\n- [ ] Changelog written\n- [ ] Tag pushed\n" } },
  { hace: 2, msg: "docs: how we name branches", archivos: { "docs/branches.md": "# Branches\n\n`feat/…`, `fix/…`, `docs/…`. One change, one branch.\n" } },
]);

// ---------------------------------------------------------------- design-tokens
proyecto("design-tokens", [
  {
    hace: 6,
    msg: "feat: colour and spacing tokens",
    archivos: {
      "tokens.json": `
{
  "color": { "ink": "#1c1917", "paper": "#faf7f2", "accent": "#b45309" },
  "space": { "1": "4px", "2": "8px", "3": "16px", "4": "24px" },
  "radius": { "card": "16px", "pill": "999px" }
}
`,
      "build.mjs": `
import { readFileSync, writeFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync("tokens.json", "utf8"));
const lines = [];
for (const [group, values] of Object.entries(tokens)) {
  for (const [name, value] of Object.entries(values)) lines.push("  --" + group + "-" + name + ": " + value + ";");
}
writeFileSync("tokens.css", ":root {\\n" + lines.join("\\n") + "\\n}\\n");
`,
      "README.md": "# design-tokens\n\nOne JSON file, one CSS file. `node build.mjs`.\n",
    },
  },
]);
