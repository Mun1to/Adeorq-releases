// Qué archivos ha tocado el agente de una sesión, leído de su transcript.
//
// Munir, 2026-10-12, con el vídeo de otro producto delante: quiere VER en el
// panel de Archivos lo que el agente lee y edita, y el paso a verde cuando hace
// el commit. `actividad_de` (`sessions.rs`) ya leía cada `tool_use`, pero se
// quedaba con el nombre suelto del archivo para una fila de monitor: ni la
// ruta, ni si fue leer o editar, ni si la llamada seguía en curso. Aquí se lee
// eso y nada más. Juntarlo con git y decidir qué se pinta es de
// `src/lib/tocados.ts`, que es puro y tiene su banco (`scripts/tocados-check.ts`).
//
// Cada CLI deja escrito lo que deja, y lo que no deja no se inventa:
//
//   · Claude Code: cada lectura (`Read`) y cada edición (`Edit`, `Write`…) con
//     su ruta, y el `tool_result` que la cierra o la rechaza.
//   · Codex: las ediciones, que viajan dentro de un parche (`*** Update File:`).
//     Lo que lee lo lee con comandos de consola, y de un `Get-Content` no se
//     adivina nada: `lee` sale en falso y el panel lo dice.
//   · Los demás no dejan nada que Adeorq sepa leer, y por ellos no se pregunta
//     (`archivosDelDisco`, en `src/lib/providers.ts`).

use crate::sessions;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

/// Un archivo que el agente ha leído o editado en la cola leída del transcript.
#[derive(Clone, Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tocado {
    pub ruta: String,
    /// Cuándo lo leyó por última vez, tal como lo escribió el CLI (ISO); vacío si no.
    pub leido: String,
    /// Cuándo lo editó por última vez; vacío si no.
    pub editado: String,
    /// "leer" o "editar" si esa llamada sigue sin contestar; vacío si no.
    pub en_curso: String,
    /// En qué turno de la cola leída fue cada cosa; 0 si no fue.
    pub turno_leido: u32,
    pub turno_editado: u32,
}

#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArchivosSesion {
    /// En el orden en que los tocó por primera vez.
    pub tocados: Vec<Tocado>,
    /// Por qué turno va la cola leída: cada mensaje tuyo abre uno.
    pub turno: u32,
    /// Hay una ronda de herramientas en el aire: está trabajando.
    pub en_marcha: bool,
    /// Hay un `git commit` lanzado que todavía no ha contestado.
    pub commit_en_curso: bool,
    /// Este CLI deja escrito lo que LEE, además de lo que edita.
    pub lee: bool,
}

/// Cuántos archivos se devuelven como mucho; se quedan los últimos tocados.
const TOPE_TOCADOS: usize = 300;

/// Los archivos de la sesión, en el orden en que aparecen y sin repetir.
#[derive(Default)]
struct Cuaderno {
    tocados: Vec<Tocado>,
    /// Dónde está cada uno en `tocados`, por su ruta sin mayúsculas ni barras de Windows.
    donde: HashMap<String, usize>,
}

impl Cuaderno {
    fn de(&mut self, ruta: &str) -> &mut Tocado {
        let clave = ruta.replace('\\', "/").to_lowercase();
        let i = match self.donde.get(&clave) {
            Some(i) => *i,
            None => {
                self.tocados.push(Tocado { ruta: ruta.to_owned(), ..Default::default() });
                self.donde.insert(clave, self.tocados.len() - 1);
                self.tocados.len() - 1
            }
        };
        &mut self.tocados[i]
    }

    fn apuntar(&mut self, uso: &Uso) {
        let t = self.de(&uso.ruta);
        if uso.editar {
            t.editado = uso.hora.clone();
            t.turno_editado = uso.turno;
        } else {
            t.leido = uso.hora.clone();
            t.turno_leido = uso.turno;
        }
    }

    /// Lo que quedó sin contestar al final de la cola: sigue en curso.
    fn en_curso(&mut self, uso: &Uso) {
        let t = self.de(&uso.ruta);
        // Editar manda: quien edita un archivo casi siempre lo acaba de leer.
        if uso.editar || t.en_curso.is_empty() {
            t.en_curso = if uso.editar { "editar" } else { "leer" }.to_owned();
        }
    }

    fn cerrar(mut self) -> Vec<Tocado> {
        if self.tocados.len() > TOPE_TOCADOS {
            // Las horas son ISO en UTC: ordenan igual como texto que como fecha.
            let ultima = |t: &Tocado| if t.editado > t.leido { t.editado.clone() } else { t.leido.clone() };
            let mut horas: Vec<String> = self.tocados.iter().map(ultima).collect();
            horas.sort();
            let corte = horas[horas.len() - TOPE_TOCADOS].clone();
            self.tocados.retain(|t| !t.en_curso.is_empty() || ultima(t) >= corte);
        }
        self.tocados
    }
}

/// Una llamada que toca un archivo, a la espera de su respuesta.
struct Uso {
    ruta: String,
    editar: bool,
    hora: String,
    turno: u32,
}

/// La ruta entera de lo que nombra una llamada: una relativa cuelga de la
/// carpeta en la que trabaja la sesión, y sus `..` se resuelven aquí. Sin eso,
/// `..\otro\a.ts` empezaría por la carpeta de la sesión y el panel lo contaría
/// como un archivo de dentro.
fn ruta_entera(ruta: &str, cwd: &str) -> String {
    use std::path::Component;
    let r = ruta.trim();
    if r.is_empty() || cwd.is_empty() || Path::new(r).is_absolute() || r.starts_with('/') {
        return r.to_owned();
    }
    let mut entera = std::path::PathBuf::new();
    for parte in Path::new(cwd).join(r).components() {
        match parte {
            Component::CurDir => {}
            Component::ParentDir => {
                entera.pop();
            }
            otra => entera.push(otra),
        }
    }
    entera.to_string_lossy().into_owned()
}

/// ¿Ese comando de consola hace un commit? Vale para la línea de una consola y
/// para el guion con el que Codex la lanza: `git`, y `commit` como palabra
/// suelta antes de que el comando acabe. Un ensayo (`--dry-run`) no lo es.
pub fn es_commit(comando: &str) -> bool {
    let c = comando.to_lowercase();
    let b = c.as_bytes();
    let mut desde = 0;
    while let Some(i) = c[desde..].find("git").map(|i| i + desde) {
        desde = i + 3;
        // `git` como programa: ni `.git`, ni `legit`, ni `github`.
        let antes = i == 0 || !(b[i - 1].is_ascii_alphanumeric() || b[i - 1] == b'.' || b[i - 1] == b'-' || b[i - 1] == b'_');
        let despues = matches!(b.get(i + 3), Some(b' ') | Some(b'.'));
        if !antes || !despues {
            continue;
        }
        let resto = &c[i + 3..];
        let fin = resto.find(['\n', ';', '|', '&']).unwrap_or(resto.len());
        let mut palabras = resto[..fin].split_whitespace().map(|p| p.trim_matches(['"', '\'', '\\']));
        // Entre `git` y su orden solo caben opciones (`-C ruta`, `-c clave=valor`).
        let mut salta = false;
        let orden = palabras.find(|p| {
            if std::mem::take(&mut salta) {
                return false;
            }
            // Ya va todo en minúsculas: `-C ruta` y `-c clave=valor` son la misma palabra.
            if *p == "-c" {
                salta = true;
                return false;
            }
            !p.starts_with('-') && *p != ".exe"
        });
        if orden == Some("commit") && !resto[..fin].contains("--dry-run") {
            return true;
        }
    }
    false
}

/// Lo que Claude Code deja escrito: cada `tool_use` de leer o editar con su
/// ruta, y el `tool_result` que lo cierra. Uno rechazado o fallido no cuenta
/// (el archivo no se tocó), y lo que queda sin respuesta al final sigue en curso.
pub fn tocados_de_claude(lineas: &[String], cwd: &str) -> ArchivosSesion {
    let mut cuaderno = Cuaderno::default();
    let mut pendientes: HashMap<String, Uso> = HashMap::new();
    // Las demás llamadas en el aire, y si son un commit.
    let mut abiertas: HashMap<String, bool> = HashMap::new();
    let mut turno = 0u32;
    for linea in lineas {
        // Barato antes de parsear: llamadas, respuestas y lo que escribes tú.
        if !(linea.contains("\"tool_use\"") || linea.contains("\"tool_result\"") || linea.contains("\"user\"")) {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(linea) else { continue };
        // Un subagente tiene su propia conversación y sus propios archivos.
        if v["isSidechain"].as_bool().unwrap_or(false) {
            continue;
        }
        let contenido = &v["message"]["content"];
        match v["type"].as_str() {
            Some("assistant") => {
                let hora = v["timestamp"].as_str().unwrap_or_default();
                let aqui = v["cwd"].as_str().filter(|c| !c.is_empty()).unwrap_or(cwd);
                for b in contenido.as_array().into_iter().flatten().filter(|b| b["type"] == "tool_use") {
                    let (Some(id), Some(nombre)) = (b["id"].as_str(), b["name"].as_str()) else { continue };
                    let entrada = &b["input"];
                    let editar = match nombre {
                        "Read" => Some(false),
                        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" => Some(true),
                        _ => None,
                    };
                    let ruta = entrada["file_path"].as_str().or(entrada["notebook_path"].as_str()).unwrap_or_default();
                    match editar {
                        Some(editar) if !ruta.trim().is_empty() => {
                            pendientes.insert(id.to_owned(), Uso { ruta: ruta_entera(ruta, aqui), editar, hora: hora.to_owned(), turno });
                        }
                        _ => {
                            let consola = matches!(nombre, "Bash" | "PowerShell");
                            abiertas.insert(id.to_owned(), consola && es_commit(entrada["command"].as_str().unwrap_or_default()));
                        }
                    }
                }
            }
            Some("user") => {
                let mut respuestas = false;
                for b in contenido.as_array().into_iter().flatten().filter(|b| b["type"] == "tool_result") {
                    respuestas = true;
                    let Some(id) = b["tool_use_id"].as_str() else { continue };
                    abiertas.remove(id);
                    if let Some(uso) = pendientes.remove(id) {
                        if !b["is_error"].as_bool().unwrap_or(false) {
                            cuaderno.apuntar(&uso);
                        }
                    }
                }
                // Un mensaje tuyo abre turno, y lo que quedara colgado del
                // anterior (lo cortaste con Esc) ya no está en curso.
                let texto = sessions::texto_del_contenido(contenido);
                if !respuestas && !v["isMeta"].as_bool().unwrap_or(false) && !texto.is_empty() && !sessions::es_fontaneria(&texto) {
                    turno += 1;
                    pendientes.clear();
                    abiertas.clear();
                }
            }
            _ => {}
        }
    }
    let a_medias = sessions::last_message_state(lineas).is_some_and(|(_, e)| e == "a_medias");
    let en_marcha = a_medias || !pendientes.is_empty() || !abiertas.is_empty();
    for uso in pendientes.values() {
        cuaderno.en_curso(uso);
    }
    ArchivosSesion {
        tocados: cuaderno.cerrar(),
        turno,
        en_marcha,
        commit_en_curso: abiertas.values().any(|c| *c),
        lee: true,
    }
}

/// Las rutas que nombra un parche de Codex (`*** Add File:`, `*** Update
/// File:`, `*** Delete File:` y `*** Move to:`).
///
/// El parche llega de dos formas y hay que saber cuál es, porque en una ruta de
/// Windows se confunden: suelto, con saltos de línea de verdad y barras
/// sencillas, o dentro de una cadena de un guion (`const patch = "…"`), donde
/// el salto es la pareja barra y ene y cada barra de la ruta va doblada. Leída
/// como la otra, `C:\proyectos\nuevo` se corta en la ene de `nuevo`.
fn rutas_del_parche(texto: &str) -> Vec<String> {
    const MARCAS: [&str; 4] = ["*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "];
    let Some(inicio) = texto.find("*** Begin Patch") else { return Vec::new() };
    // En una cadena, detrás de la cabecera va una barra; suelto, un salto.
    let en_cadena = texto[inicio + "*** Begin Patch".len()..].starts_with('\\');
    let mut rutas = Vec::new();
    let mut resto = &texto[inicio..];
    while let Some((i, marca)) = MARCAS.iter().filter_map(|m| resto.find(m).map(|i| (i, *m))).min_by_key(|(i, _)| *i) {
        resto = &resto[i + marca.len()..];
        let mut ruta = String::new();
        let mut letras = resto.chars();
        while let Some(c) = letras.next() {
            match c {
                '\n' | '\r' => break,
                '\\' if en_cadena => match letras.next() {
                    Some('n') | Some('r') | None => break,
                    Some(otra) => ruta.push(otra),
                },
                '"' if en_cadena => break,
                _ => ruta.push(c),
            }
        }
        let ruta = ruta.trim();
        if !ruta.is_empty() && !rutas.iter().any(|r| r == ruta) {
            rutas.push(ruta.to_owned());
        }
    }
    rutas
}

/// Lo que Codex deja escrito: sus ediciones, que van en parches. Una llamada
/// sin su respuesta sigue en curso, y cada `task_started` abre turno.
pub fn tocados_de_codex(lineas: &[String], cwd: &str) -> ArchivosSesion {
    let mut cuaderno = Cuaderno::default();
    // Por el id de la llamada: los archivos de su parche (si es uno) y si es un commit.
    let mut pendientes: HashMap<String, (Vec<Uso>, bool)> = HashMap::new();
    let mut turno = 0u32;
    for linea in lineas {
        if !(linea.contains("_call") || linea.contains("\"task_started\"")) {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(linea) else { continue };
        let p = &v["payload"];
        let tipo = p["type"].as_str().unwrap_or_default();
        if v["type"] == "event_msg" {
            if tipo == "task_started" {
                turno += 1;
                pendientes.clear();
            }
            continue;
        }
        if v["type"] != "response_item" {
            continue;
        }
        let Some(id) = p["call_id"].as_str() else { continue };
        if tipo.ends_with("_output") {
            let Some((usos, _)) = pendientes.remove(id) else { continue };
            // Un parche que no casa con el archivo no lo cambia, y Codex lo dice así.
            let fallo = p["output"].to_string().contains("verification failed");
            for uso in usos.iter().filter(|_| !fallo) {
                cuaderno.apuntar(uso);
            }
        } else if tipo.ends_with("_call") {
            let texto = p["input"].as_str().or(p["arguments"].as_str()).unwrap_or_default();
            let hora = v["timestamp"].as_str().unwrap_or_default();
            let usos = rutas_del_parche(texto)
                .into_iter()
                .map(|r| Uso { ruta: ruta_entera(&r, cwd), editar: true, hora: hora.to_owned(), turno })
                .collect();
            pendientes.insert(id.to_owned(), (usos, es_commit(texto)));
        }
    }
    let en_marcha = sessions::codex_estado(lineas) == "a_medias" || !pendientes.is_empty();
    for uso in pendientes.values().flat_map(|(usos, _)| usos) {
        cuaderno.en_curso(uso);
    }
    ArchivosSesion {
        tocados: cuaderno.cerrar(),
        turno,
        en_marcha,
        commit_en_curso: pendientes.values().any(|(_, c)| *c),
        lee: false,
    }
}

/// Los archivos que ha tocado la sesión de un panel, para el panel de Archivos.
/// `rollout` dice en qué formato está escrita: el de Codex, o el de Claude Code.
/// Sin la conversación en el disco es un error, y el panel se queda con git.
#[tauri::command(async)]
pub fn session_files(cwd: String, session_id: Option<String>, rollout: bool) -> Result<ArchivosSesion, String> {
    // El id viaja en una ruta, así que no se acepta a ojo (como en `session_activity`).
    let id = session_id.as_deref().filter(|i| !i.is_empty());
    if id.is_some_and(|i| !i.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')) {
        return Err("id de sesión no válido".into());
    }
    let falta = "esa conversación no está en el disco";
    if rollout {
        let path = id.and_then(sessions::rollout_sabido).ok_or(falta)?;
        let lineas = sessions::read_tail(&path).map_err(|e| e.to_string())?;
        return Ok(tocados_de_codex(&lineas, &cwd));
    }
    let path = sessions::transcript_de(&cwd, id).ok_or(falta)?;
    let lineas = sessions::read_tail(&path).map_err(|e| e.to_string())?;
    Ok(tocados_de_claude(&lineas, &cwd))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn del_agente(hora: &str, bloques: Value) -> String {
        json!({ "type": "assistant", "timestamp": hora, "cwd": "C:\\proyectos\\Web", "message": { "role": "assistant", "content": bloques } }).to_string()
    }
    fn uso(id: &str, nombre: &str, entrada: Value) -> Value {
        json!({ "type": "tool_use", "id": id, "name": nombre, "input": entrada })
    }
    fn respuesta(id: &str, error: bool) -> String {
        json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": id, "is_error": error, "content": "…" }] } }).to_string()
    }
    fn tuyo(texto: &str) -> String {
        json!({ "type": "user", "message": { "role": "user", "content": texto } }).to_string()
    }
    fn de<'a>(a: &'a ArchivosSesion, nombre: &str) -> &'a Tocado {
        a.tocados.iter().find(|t| t.ruta.ends_with(nombre)).unwrap_or_else(|| panic!("falta {nombre}: {:?}", a.tocados))
    }

    /// Las rutas de estas pruebas llevan la forma de la máquina que las corre.
    /// En Linux una de Windows («C:\…») no es absoluta, así que se colgaba de
    /// la carpeta de la sesión y dos pruebas salían en rojo allí (la prueba de
    /// Linux de la 0.9.194, el 2026-10-13). No era el lector: eran sus datos.
    #[cfg(windows)]
    mod rutas {
        pub const WEB: &str = "C:\\proyectos\\Web";
        pub const TEST: &str = "C:\\proyectos\\Web\\tests\\client.test.js";
        pub const CLIENTE: &str = "C:\\proyectos\\Web\\src\\api\\client.js";
        /// El mismo archivo, con las barras al revés y otras mayúsculas.
        pub const CLIENTE_DE_OTRA_FORMA: &str = "C:/proyectos/Web/SRC/api/client.js";
        pub const SUELTA: &str = "notas\\plan.md";
        pub const AJENA: &str = "C:\\otro\\sitio.rs";
        pub const NUEVO: &str = "C:\\proyectos\\nuevo";
    }
    #[cfg(not(windows))]
    mod rutas {
        pub const WEB: &str = "/proyectos/Web";
        pub const TEST: &str = "/proyectos/Web/tests/client.test.js";
        pub const CLIENTE: &str = "/proyectos/Web/src/api/client.js";
        pub const CLIENTE_DE_OTRA_FORMA: &str = "/proyectos/Web/SRC/api/client.js";
        pub const SUELTA: &str = "notas/plan.md";
        pub const AJENA: &str = "/otro/sitio.rs";
        pub const NUEVO: &str = "/proyectos/nuevo";
    }

    /// Leer y editar con su ruta entera y su hora; una edición rechazada no
    /// cuenta; un subagente tampoco; y una ruta relativa cuelga de la carpeta.
    #[test]
    fn lo_que_claude_lee_y_edita_sale_con_su_ruta() {
        let lineas = vec![
            tuyo("arregla el cliente"),
            del_agente("2026-10-12T18:00:01.000Z", json!([uso("a", "Read", json!({ "file_path": rutas::TEST }))])),
            respuesta("a", false),
            del_agente("2026-10-12T18:00:05.000Z", json!([
                { "type": "text", "text": "Lo cambio." },
                uso("b", "Edit", json!({ "file_path": rutas::CLIENTE, "old_string": "x", "new_string": "y" })),
                uso("c", "Write", json!({ "file_path": rutas::SUELTA, "content": "…" })),
            ])),
            respuesta("b", false),
            respuesta("c", true),
            json!({ "type": "assistant", "isSidechain": true, "timestamp": "2026-10-12T18:00:06.000Z", "message": { "content": [uso("s", "Edit", json!({ "file_path": rutas::AJENA }))] } }).to_string(),
            del_agente("2026-10-12T18:00:09.000Z", json!([uso("d", "Read", json!({ "file_path": rutas::CLIENTE_DE_OTRA_FORMA }))])),
            respuesta("d", false),
            del_agente("2026-10-12T18:00:12.000Z", json!([{ "type": "text", "text": "Hecho." }])),
        ];
        let a = tocados_de_claude(&lineas, rutas::WEB);
        assert_eq!(a.tocados.len(), 2, "{:?}", a.tocados);
        assert!(a.lee && !a.en_marcha && !a.commit_en_curso);
        assert_eq!(a.turno, 1);
        let test = de(&a, "client.test.js");
        assert_eq!((test.leido.as_str(), test.editado.as_str(), test.turno_leido), ("2026-10-12T18:00:01.000Z", "", 1));
        // La misma ruta escrita de dos formas es el mismo archivo: editado y, después, leído.
        let cliente = de(&a, "client.js");
        assert_eq!(cliente.ruta, rutas::CLIENTE);
        assert_eq!((cliente.editado.as_str(), cliente.leido.as_str()), ("2026-10-12T18:00:05.000Z", "2026-10-12T18:00:09.000Z"));
        assert!(a.tocados.iter().all(|t| t.en_curso.is_empty()));
    }

    /// Lo que no ha contestado sigue en curso, y el commit también; un mensaje
    /// tuyo (cortarlo con Esc lo es) cierra lo que quedara colgado.
    #[test]
    fn lo_que_no_ha_contestado_sigue_en_curso() {
        let mut lineas = vec![
            tuyo("sigue"),
            del_agente("2026-10-12T18:01:00.000Z", json!([uso("a", "Edit", json!({ "file_path": "C:\\proyectos\\Web\\a.ts" }))])),
            respuesta("a", false),
            tuyo("y haz el commit"),
            del_agente("2026-10-12T18:02:00.000Z", json!([
                uso("b", "Edit", json!({ "file_path": "C:\\proyectos\\Web\\b.ts" })),
                uso("c", "Read", json!({ "file_path": "C:\\proyectos\\Web\\b.ts" })),
                uso("d", "Bash", json!({ "command": "git -C /c/proyectos/Web commit -m \"fix: b\"" })),
            ])),
        ];
        let a = tocados_de_claude(&lineas, "");
        assert!(a.en_marcha && a.commit_en_curso);
        assert_eq!(a.turno, 2);
        assert_eq!(de(&a, "b.ts").en_curso, "editar", "editar manda sobre leer");
        assert_eq!(de(&a, "b.ts").editado, "", "todavía no se ha hecho");
        assert_eq!((de(&a, "a.ts").en_curso.as_str(), de(&a, "a.ts").turno_editado), ("", 1));

        lineas.push(tuyo("[Request interrupted by user]"));
        let a = tocados_de_claude(&lineas, "");
        assert!(!a.en_marcha && !a.commit_en_curso);
        assert_eq!(a.tocados.len(), 1, "lo que no llegó a hacerse no se apunta: {:?}", a.tocados);
    }

    #[test]
    fn un_commit_se_reconoce_y_lo_que_se_le_parece_no() {
        for si in [
            "git commit -m \"fix\"",
            "git -C /c/proyectos/Adeorq commit -m x",
            "git add src/a.ts && git commit -m \"feat: a\"",
            "pnpm comprobar --rapido > salida.txt && git -c user.name=x commit -q -m y",
            "const r = await tools.exec_command({\"cmd\":\"git commit -m \\\"fix\\\"\"});",
            "git.exe commit --amend --no-edit",
        ] {
            assert!(es_commit(si), "«{si}» es un commit");
        }
        for no in [
            "git status",
            "git log --oneline -n 3",
            "git commit --dry-run",
            "cat .git/COMMIT_EDITMSG",
            "echo commit",
            "gh api repos/Mun1to/Adeorq/git/commits",
            "git show commit",
            "git-lfs commit",
            "legit commit",
            "",
        ] {
            assert!(!es_commit(no), "«{no}» no es un commit");
        }
    }

    fn de_codex(hora: &str, payload: Value) -> String {
        json!({ "timestamp": hora, "type": "response_item", "payload": payload }).to_string()
    }

    /// Codex edita con parches, y llegan de dos formas: dentro de la cadena de
    /// un guion (barras dobladas) y sueltos. Lo que lee no lo deja escrito.
    #[test]
    fn las_ediciones_de_codex_salen_de_sus_parches() {
        let en_cadena = r#"const patch = "*** Begin Patch\n*** Update File: C:\\proyectos\\nuevo\\src\\raro.ts\n@@\n-a\n+b\n*** Add File: C:\\proyectos\\nuevo\\con espacio\\site.ts\n+hola\n*** End Patch";
const r = await tools.apply_patch(patch);"#;
        assert_eq!(rutas_del_parche(en_cadena), ["C:\\proyectos\\nuevo\\src\\raro.ts", "C:\\proyectos\\nuevo\\con espacio\\site.ts"]);
        let suelto = "*** Begin Patch\n*** Update File: C:\\proyectos\\nuevo\\a.rs\n@@\n-x\n+y\n*** Delete File: docs/viejo.md\n*** Update File: b.rs\n*** Move to: c.rs\n*** End Patch\n";
        assert_eq!(rutas_del_parche(suelto), ["C:\\proyectos\\nuevo\\a.rs", "docs/viejo.md", "b.rs", "c.rs"]);
        assert!(rutas_del_parche("Get-Content -Raw 'C:\\proyectos\\nuevo\\a.rs'").is_empty());

        let lineas = vec![
            json!({ "timestamp": "2026-10-12T18:00:00.000Z", "type": "event_msg", "payload": { "type": "task_started" } }).to_string(),
            de_codex("2026-10-12T18:00:02.000Z", json!({ "type": "custom_tool_call", "call_id": "c1", "name": "exec", "input": "const r = await tools.exec_command({\"cmd\":\"Get-Content -Raw 'C:\\\\proyectos\\\\nuevo\\\\a.rs'\"});" })),
            de_codex("2026-10-12T18:00:03.000Z", json!({ "type": "custom_tool_call_output", "call_id": "c1", "output": [{ "type": "input_text", "text": "…" }] })),
            de_codex("2026-10-12T18:00:04.000Z", json!({ "type": "custom_tool_call", "call_id": "c2", "name": "exec", "input": en_cadena })),
            de_codex("2026-10-12T18:00:05.000Z", json!({ "type": "custom_tool_call_output", "call_id": "c2", "output": [{ "type": "input_text", "text": "Success. Updated the following files:" }] })),
            de_codex("2026-10-12T18:00:06.000Z", json!({ "type": "function_call", "call_id": "c3", "name": "apply_patch", "arguments": suelto })),
            de_codex("2026-10-12T18:00:07.000Z", json!({ "type": "function_call_output", "call_id": "c3", "output": "apply_patch verification failed: no casa" })),
            de_codex("2026-10-12T18:00:08.000Z", json!({ "type": "function_call", "call_id": "c4", "name": "apply_patch", "arguments": "*** Begin Patch\n*** Update File: src/en-curso.ts\n*** End Patch" })),
            de_codex("2026-10-12T18:00:09.000Z", json!({ "type": "custom_tool_call", "call_id": "c5", "name": "exec", "input": "const r = await tools.exec_command({\"cmd\":\"git commit -m \\\"feat\\\"\"});" })),
        ];
        // La carpeta de la sesión, con la forma de esta máquina: de ella cuelga
        // la ruta relativa del parche en curso, y tiene que salir absoluta.
        let a = tocados_de_codex(&lineas, rutas::NUEVO);
        assert!(!a.lee, "lo que Codex lee no está escrito en ninguna parte");
        assert!(a.en_marcha && a.commit_en_curso);
        assert_eq!(a.turno, 1);
        let rutas: Vec<&str> = a.tocados.iter().map(|t| t.ruta.as_str()).collect();
        assert_eq!(rutas.len(), 3, "el parche que no casó no editó nada: {rutas:?}");
        assert_eq!(de(&a, "raro.ts").editado, "2026-10-12T18:00:04.000Z");
        assert_eq!(de(&a, "site.ts").turno_editado, 1);
        let curso = de(&a, "en-curso.ts");
        assert_eq!((curso.en_curso.as_str(), curso.editado.as_str()), ("editar", ""));
        assert!(Path::new(&curso.ruta).is_absolute(), "una ruta relativa cuelga de la carpeta de la sesión: {}", curso.ruta);
        #[cfg(windows)]
        {
            assert_eq!(ruta_entera("..\\otro\\.\\a.ts", "C:\\proyectos\\nuevo"), "C:\\proyectos\\otro\\a.ts", "los «..» se resuelven");
            assert_eq!(ruta_entera("D:\\fuera\\b.ts", "C:\\proyectos\\nuevo"), "D:\\fuera\\b.ts");
        }
        assert!(a.tocados.iter().all(|t| t.leido.is_empty()));
    }

    /// Los más recientes de una carpeta de transcripts, del más nuevo al más viejo.
    fn recientes(dir: &Path, hondo: usize, fuera: &mut Vec<(std::time::SystemTime, std::path::PathBuf)>) {
        let Ok(dentro) = std::fs::read_dir(dir) else { return };
        for e in dentro.flatten() {
            let p = e.path();
            if p.is_dir() {
                if hondo > 0 {
                    recientes(&p, hondo - 1, fuera);
                }
            } else if p.extension().and_then(|x| x.to_str()) == Some("jsonl") {
                if let Ok(m) = e.metadata().and_then(|m| m.modified()) {
                    fuera.push((m, p));
                }
            }
        }
    }

    /// Contra los transcripts REALES de esta máquina, que es donde se ve si el
    /// formato que asume el lector es el que cada CLI escribe de verdad. En una
    /// máquina limpia no afirma nada. Con salida:
    /// `cargo test --lib los_tocados_de_verdad -- --nocapture`.
    #[test]
    fn los_tocados_de_verdad() {
        let Some(casa) = std::env::var_os("USERPROFILE").or(std::env::var_os("HOME")).map(std::path::PathBuf::from) else { return };
        for (nombre, carpeta, hondo, codex) in [("Claude Code", casa.join(".claude").join("projects"), 1, false), ("Codex", casa.join(".codex").join("sessions"), 3, true)] {
            let mut todos = Vec::new();
            recientes(&carpeta, hondo, &mut todos);
            todos.sort_by(|a, b| b.0.cmp(&a.0));
            let (mut con_archivos, mut vistos, mut editaba) = (0, 0, 0);
            for (_, p) in todos.iter().take(8) {
                let Ok(lineas) = sessions::read_tail(p) else { continue };
                vistos += 1;
                let a = if codex { tocados_de_codex(&lineas, "C:\\") } else { tocados_de_claude(&lineas, "C:\\") };
                for t in &a.tocados {
                    assert!(!t.ruta.trim().is_empty(), "un archivo sin ruta en {p:?}");
                    assert!(!t.ruta.contains('\n') && !t.ruta.contains('"'), "una ruta mal cortada en {p:?}: {:?}", t.ruta);
                    assert!(!(t.leido.is_empty() && t.editado.is_empty() && t.en_curso.is_empty()), "uno que no se tocó en {p:?}");
                    assert!(codex || Path::new(&t.ruta).is_absolute() || t.ruta.starts_with('/'), "una ruta a medias en {p:?}: {:?}", t.ruta);
                }
                // Si el transcript habla de ediciones, el lector tiene que haberlas visto.
                let hay_ediciones = lineas.iter().any(|l| if codex { l.contains("*** Update File: ") || l.contains("*** Add File: ") } else { l.contains("\"name\":\"Edit\"") || l.contains("\"name\":\"Write\"") });
                editaba += usize::from(hay_ediciones);
                con_archivos += usize::from(a.tocados.iter().any(|t| !t.editado.is_empty() || t.en_curso == "editar"));
                println!("{nombre}: {} archivos, turno {}, en marcha {}, commit en curso {} · {}", a.tocados.len(), a.turno, a.en_marcha, a.commit_en_curso, p.file_name().unwrap().to_string_lossy());
            }
            if editaba > 0 {
                assert!(con_archivos > 0, "{nombre}: {editaba} de {vistos} transcripts recientes hablan de ediciones y el lector no vio ninguna: o cambió el formato o el lector no lo lee");
            }
        }
    }
}
