// The test vector both sides check: the same fields must give the same bytes, and the signature of a
// software RSA key over them must verify. Adeorq's Rust side (escudo.rs) reads vector.json in its
// tests. Only the public key and the signature are kept; the private key dies with this process.
//
//   node escudo/pruebas/vector.mjs          checks vector.json
//   node escudo/pruebas/vector.mjs --nuevo  writes a new one
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { mensajeAFirmar, firmaValida } from "../gancho.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA = path.join(AQUI, "vector.json");

if (process.argv.includes("--nuevo")) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const campos = {
    tipo: "rojo",
    sesion: "00ff98ac-8dd8-4681-8b84-200149470d8a",
    objeto: "c:/proyectos/adeorq/agents.md",
    desde: "2026-11-06T22:10:00.000Z",
    hasta: "2026-11-06T22:40:00.000Z",
    nonce: "q9mF2b8wqv1lX6zV0aJ3c5tTj0yK8nR4sE7uH2dP1oA",
  };
  const mensaje = mensajeAFirmar(campos);
  const firma = crypto.sign("sha256", Buffer.from(mensaje, "utf8"), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
  const vector = {
    que_es: "Vector de prueba del escudo (docs/contexto/escudo.md). La llave es de software y de usar y tirar: no vale para nada mas.",
    campos,
    mensaje,
    mensaje_hex: Buffer.from(mensaje, "utf8").toString("hex"),
    llave_publica_der_b64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    firma_b64: firma.toString("base64"),
  };
  fs.writeFileSync(RUTA, `${JSON.stringify(vector, null, 2)}\n`);
  console.log(`escrito ${RUTA}`);
}

const v = JSON.parse(fs.readFileSync(RUTA, "utf8"));
const llave = crypto.createPublicKey({ key: Buffer.from(v.llave_publica_der_b64, "base64"), format: "der", type: "spki" });
const mismo = mensajeAFirmar(v.campos) === v.mensaje && Buffer.from(v.mensaje, "utf8").toString("hex") === v.mensaje_hex;
const vale = firmaValida({ ...v.campos, firma: v.firma_b64 }, llave);
const cambiado = firmaValida({ ...v.campos, objeto: "c:/proyectos/otro/agents.md", firma: v.firma_b64 }, llave);
console.log(`mismo mensaje: ${mismo}, firma valida: ${vale}, con otro objeto no vale: ${!cambiado}`);
process.exit(mismo && vale && !cambiado ? 0 : 1);
