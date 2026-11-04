// Las funciones de las cuentas de Adeorq (supabase/migrations y supabase/tests) en
// un Postgres 17 de usar y tirar, sin tocar el proyecto de Supabase y sin mandar
// ningún correo. Lo que aquí se comprueba de verdad:
//   - las migraciones se aplican en orden y sus pruebas dicen TODO BIEN;
//   - el cerrojo: con el rol del servidor de Auth el alta se rechaza, y deja de
//     rechazarse solo al abrirlo a mano;
//   - la carrera de dos altas con el mismo nombre, en DOS CONEXIONES de verdad;
//   - que la prueba se pone roja si erase_account se deja algo (visto fallar).
//
// Lo que NO demuestra: el resto de `auth` es un doble (supabase/tests/doble-auth.sql),
// así que supabase/tests/cuentas.sql hay que lanzarlo también en el proyecto de verdad
// después de aplicar la migración.
//
//   pnpm --dir <carpeta> add embedded-postgres@17.5.0-beta.15 pg --ignore-workspace
//   ADEORQ_PG=<carpeta> node scripts/laboratorio/cuentas-sql-de-verdad.mjs
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SUPA = join(RAIZ, "supabase");
const CARPETA = process.env.ADEORQ_PG;
if (!CARPETA) throw new Error("falta ADEORQ_PG: la carpeta con embedded-postgres y pg instalados (mira la cabecera)");

const PUERTO = 8765;
const pnpmDir = join(CARPETA, "node_modules", ".pnpm");
const paquete = readdirSync(pnpmDir).find((n) => n.startsWith("@embedded-postgres+"));
const nombre = paquete.split("@")[1].replace("embedded-postgres+", "");
const BIN = join(pnpmDir, paquete, "node_modules", "@embedded-postgres", nombre, "native", "bin");
const exe = (n) => join(BIN, process.platform === "win32" ? `${n}.exe` : n);
const { Client } = createRequire(join(CARPETA, "package.json"))("pg");

let fallos = 0;
function ver(bien, texto, detalle = "") {
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `: ${detalle}` : ""}`);
  if (!bien) fallos++;
}

async function conexion(user = "postgres") {
  const c = new Client({ host: "127.0.0.1", port: PUERTO, user, database: "postgres" });
  await c.connect();
  return c;
}

/** Lanza un archivo entero en una conexión propia y devuelve la última fila o el error. */
async function lanzar(sql) {
  const c = await conexion();
  try {
    const r = await c.query(sql);
    const ultimas = Array.isArray(r) ? r : [r];
    const conFilas = ultimas.filter((x) => x.rows?.length);
    return { fila: conFilas.at(-1)?.rows[0] };
  } catch (e) {
    return { error: e.message };
  } finally {
    await c.end();
  }
}

const alta = (id, correo, usuario) => ({
  text: `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1,'authenticated','authenticated',$2,'',now(),'{"provider":"email","providers":["email"]}',$3,now(),now())`,
  values: [id, correo, JSON.stringify({ usuario })],
});

const datos = mkdtempSync(join(tmpdir(), "adeorq-pg-"));
const log = join(datos, "..", `${datos.split(/[\\/]/).pop()}.log`);
execFileSync(exe("initdb"), ["-D", datos, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], { stdio: "ignore" });
execFileSync(exe("pg_ctl"), ["start", "-w", "-D", datos, "-l", log, "-o", `-p ${PUERTO} -c listen_addresses=127.0.0.1`], { stdio: "ignore" });

try {
  const dueno = await conexion();
  console.log((await dueno.query("select version()")).rows[0].version.split(",")[0]);
  await dueno.query(readFileSync(join(SUPA, "tests", "doble-auth.sql"), "utf8"));

  const migraciones = readdirSync(join(SUPA, "migrations")).filter((n) => n.endsWith(".sql")).sort();
  for (const m of migraciones) {
    // pg_cron no existe aquí: su sitio lo ocupa la tabla del doble.
    const sql = readFileSync(join(SUPA, "migrations", m), "utf8").replace(/create extension if not exists pg_cron[^;]*;/, "");
    await dueno.query(sql);
    console.log(`     migración aplicada: ${m}`);
  }

  // Las pruebas de SQL, tal cual se lanzarían en el proyecto.
  const cuentasSql = readFileSync(join(SUPA, "tests", "cuentas.sql"), "utf8");
  for (const [archivo, sql] of [
    ["perfiles.sql", readFileSync(join(SUPA, "tests", "perfiles.sql"), "utf8")],
    ["cuentas.sql", cuentasSql],
  ]) {
    const r = await lanzar(sql);
    ver(r.fila?.resultado === "TODO BIEN", `tests/${archivo}`, r.error ?? r.fila?.resultado);
  }
  ver((await dueno.query("select count(*)::int as n from auth.users")).rows[0].n === 0, "las pruebas no dejan usuarios");

  // El cerrojo, con el rol que usa de verdad el servidor de Auth.
  const authAdmin = await conexion("supabase_auth_admin");
  const ID_CERROJO = "00000000-0000-4000-8000-00000000e501";
  try {
    await authAdmin.query(alta(ID_CERROJO, "e5-cerrojo@invalid.test", "prueba_e5_cerrojo"));
    ver(false, "con el registro cerrado, el servidor de Auth no puede crear usuarios", "entró");
  } catch (e) {
    ver(e.code === "42501" && /todavía no está abierto/.test(e.message), "con el registro cerrado, el servidor de Auth no puede crear usuarios", `${e.code} ${e.message}`);
  }
  await dueno.query("update private.registro set abierto = true");
  await authAdmin.query(alta(ID_CERROJO, "e5-cerrojo@invalid.test", "prueba_e5_cerrojo"));
  ver((await dueno.query("select usuario from public.perfiles where id = $1", [ID_CERROJO])).rows[0]?.usuario === "prueba_e5_cerrojo", "al abrirlo a mano, el alta entra y crea su perfil");
  await dueno.query("delete from auth.users where id = $1", [ID_CERROJO]);
  await dueno.query("update private.registro set abierto = false");
  await authAdmin.end();

  // La carrera: A tiene el alta a medias y B pide el mismo nombre desde otra conexión.
  const a = await conexion();
  const b = await conexion();
  await a.query("begin");
  await a.query(alta("00000000-0000-4000-8000-00000000e511", "e5-a@invalid.test", "prueba_e5_carrera"));
  const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
  let resultadoB = "pendiente";
  const altaB = b.query(alta("00000000-0000-4000-8000-00000000e512", "e5-b@invalid.test", "PRUEBA_E5_CARRERA")).then(
    () => { resultadoB = "entró"; },
    (e) => { resultadoB = `${e.code} ${e.message}`; },
  );
  let esperaB = "";
  for (let i = 0; i < 50 && esperaB !== "Lock"; i++) {
    await new Promise((r) => setTimeout(r, 100));
    esperaB = (await dueno.query("select wait_event_type from pg_stat_activity where pid = $1", [pidB])).rows[0]?.wait_event_type ?? "";
  }
  ver(esperaB === "Lock" && resultadoB === "pendiente", "la carrera: B se queda esperando a que A decida", `esperando por ${esperaB || "nada"}`);
  await a.query("commit");
  await altaB;
  ver(resultadoB === "23505 Ese nombre de usuario ya está ocupado.", "la carrera: al confirmar A, B recibe el error del nombre ocupado", resultadoB);
  const quedan = (await dueno.query("select count(*)::int as n from public.perfiles where lower(usuario) = 'prueba_e5_carrera'")).rows[0].n;
  ver(quedan === 1, "la carrera: solo queda un perfil con ese nombre", `${quedan}`);
  await dueno.query("delete from auth.users where email in ('e5-a@invalid.test', 'e5-b@invalid.test')");
  await a.end();
  await b.end();

  // La prueba tiene que saber fallar. Se le quita a erase_account lo que los
  // cascades no se llevan y tiene que protestar: si no, su verde no vale nada.
  const original = (await dueno.query("select pg_get_functiondef('private.erase_account(uuid)'::regprocedure) as d")).rows[0].d;
  for (const quitar of [/delete from auth\.refresh_tokens[^;]*;/, /delete from auth\.flow_state[^;]*;/, /delete from auth\.audit_log_entries[\s\S]*?\);\s*(?=delete from auth\.users)/]) {
    const roto = original.replace(quitar, "");
    if (roto === original) {
      ver(false, `no encuentro qué romper: ${quitar}`);
      continue;
    }
    await dueno.query(roto);
    const r = await lanzar(cuentasSql);
    ver(/queda rastro/.test(r.error ?? ""), "visto fallar sin borrar todo", r.error ?? "dio verde");
    await dueno.query(original);
  }
  const conVecina = original.replace(`'"' || v_email || '"'`, `v_email`);
  await dueno.query(conVecina);
  const vecina = await lanzar(cuentasSql);
  ver(/vecina/.test(vecina.error ?? ""), "visto fallar si el correo se busca sin comillas", vecina.error ?? "dio verde");
  await dueno.query(original);

  await dueno.end();
} finally {
  execFileSync(exe("pg_ctl"), ["stop", "-w", "-m", "fast", "-D", datos], { stdio: "ignore" });
  rmSync(datos, { recursive: true, force: true });
  if (existsSync(log)) rmSync(log, { force: true });
}

console.log(fallos ? `\n${fallos} fallos.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
