// La lista de lo protegido (`escudo/lista.json`), leída como la lee el gancho.
//
// Las reglas de lectura están escritas en el propio archivo («como_se_lee») y
// en `docs/contexto/escudo.md`. Si esta lectura y la del gancho dejan de
// coincidir, el vigilante avisa de cambios que el gancho dejó pasar sin mirar
// (o calla los que el gancho sí paró), así que aquí no se interpreta nada por
// cuenta propia: minúsculas, `/`, sin `.` ni `..`, las cuatro fichas, y un `*`
// que vale dentro de un trozo de la ruta y nunca cruza una barra.

use std::path::{Path, PathBuf};

use serde::Deserialize;

/// Lo duro que es cada clase. El orden importa: si una ruta cae en varias,
/// manda la más dura (`max`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Clase {
    /// Te pide la verificación solo si esa terminal leyó algo de fuera.
    Memoria,
    /// Te pide la verificación siempre.
    Rojo,
    /// Ningún agente lo puede cambiar, ni con la verificación.
    Escudo,
}

fn clase_de(texto: &str) -> Result<Clase, String> {
    match texto {
        "memoria" => Ok(Clase::Memoria),
        "rojo" => Ok(Clase::Rojo),
        "escudo" => Ok(Clase::Escudo),
        otra => Err(format!("la lista trae una clase que no conozco: «{otra}»")),
    }
}

fn si() -> bool {
    true
}

#[derive(Deserialize)]
struct Nombre {
    clase: String,
    nombre: String,
    #[serde(default = "si")]
    vigilar: bool,
}

#[derive(Deserialize)]
struct Carpeta {
    clase: String,
    carpeta: String,
    #[serde(default = "si")]
    vigilar: bool,
}

#[derive(Deserialize)]
struct ArchivoSuelto {
    clase: String,
    archivo: String,
    #[serde(default = "si")]
    vigilar: bool,
}

#[derive(Deserialize)]
struct Vigilar {
    raices: Vec<String>,
    profundidad: usize,
    #[serde(default)]
    saltar: Vec<String>,
}

#[derive(Deserialize)]
struct EnDisco {
    version: u32,
    #[serde(default)]
    nombres: Vec<Nombre>,
    #[serde(default)]
    carpetas: Vec<Carpeta>,
    #[serde(default)]
    archivos: Vec<ArchivoSuelto>,
    vigilar: Vigilar,
}

/// Lo que valen las cuatro fichas en este equipo, ya normalizado.
#[derive(Clone, Debug)]
pub struct Fichas {
    pub casa: String,
    pub proyectos: String,
    pub datos: String,
    pub programas: String,
}

impl Fichas {
    /// Las de este equipo: la carpeta del usuario, la raíz de proyectos que
    /// tiene puesta Adeorq, `LOCALAPPDATA` y Archivos de programa.
    pub fn de_aqui() -> Fichas {
        let casa = crate::dir_casa().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let proyectos = crate::workspace::raiz_por_defecto().to_string_lossy().into_owned();
        // `{datos}/adeorq/escudo` es la carpeta del escudo: `{datos}` es la que
        // contiene la de Adeorq, no la de Adeorq.
        let datos = crate::dir_datos()
            .ok()
            .and_then(|d| d.parent().map(Path::to_path_buf))
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        Fichas {
            casa: normalizar(&casa),
            proyectos: normalizar(&proyectos),
            datos: normalizar(&datos),
            programas: normalizar(&programas().to_string_lossy()),
        }
    }

    fn poner(&self, patron: &str) -> String {
        normalizar(
            &patron
                .replace("{casa}", &self.casa)
                .replace("{proyectos}", &self.proyectos)
                .replace("{datos}", &self.datos)
                .replace("{programas}", &self.programas),
        )
    }
}

/// Archivos de programa. La lista dice `C:/Program Files`; se lee de
/// `ProgramFiles` por si Windows vive en otra letra.
pub fn programas() -> PathBuf {
    PathBuf::from(std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into()))
}

/// Una ruta como la compara la lista: minúsculas, `/` en vez de `\`, sin `//`,
/// sin `.` y con los `..` resueltos. Quita el `\\?\` de las rutas largas de
/// Windows, que es la misma ruta escrita de otra forma.
pub fn normalizar(ruta: &str) -> String {
    let s = ruta.replace('\\', "/").to_lowercase();
    let s = s.strip_prefix("//?/").unwrap_or(&s);
    let absoluta_unix = s.starts_with('/');
    let mut trozos: Vec<&str> = Vec::new();
    for t in s.split('/') {
        match t {
            "" | "." => {}
            ".." => {
                // Nunca por encima de la unidad: `c:/..` sigue siendo `c:`.
                if trozos.len() > 1 || (absoluta_unix && !trozos.is_empty()) {
                    trozos.pop();
                }
            }
            otro => trozos.push(otro),
        }
    }
    let unido = trozos.join("/");
    if absoluta_unix {
        format!("/{unido}")
    } else {
        unido
    }
}

/// Un trozo de ruta contra un trozo del patrón, donde `*` vale cualquier cosa
/// (también nada) y nunca una barra, porque los trozos ya vienen partidos.
fn coincide(patron: &str, trozo: &str) -> bool {
    if !patron.contains('*') {
        return patron == trozo;
    }
    let partes: Vec<&str> = patron.split('*').collect();
    let (primera, ultima) = (partes[0], partes[partes.len() - 1]);
    if !trozo.starts_with(primera) || trozo.len() < primera.len() + ultima.len() || !trozo.ends_with(ultima) {
        return false;
    }
    let mut resto = &trozo[primera.len()..trozo.len() - ultima.len()];
    for medio in &partes[1..partes.len() - 1] {
        match resto.find(medio) {
            Some(i) => resto = &resto[i + medio.len()..],
            None => return false,
        }
    }
    true
}

fn trozos(norm: &str) -> Vec<&str> {
    norm.split('/').collect()
}

/// Una entrada ya leída: su clase, su patrón partido y si la mira el vigilante.
#[derive(Clone, Debug)]
struct Entrada {
    clase: Clase,
    patron: Vec<String>,
    vigilar: bool,
}

#[derive(Clone, Debug)]
pub struct Lista {
    nombres: Vec<Entrada>,
    carpetas: Vec<Entrada>,
    archivos: Vec<Entrada>,
    /// Dónde busca el vigilante los `nombres`, ya con las fichas puestas.
    pub raices: Vec<String>,
    pub profundidad: usize,
    /// Las carpetas por las que no entra, en minúsculas.
    pub saltar: Vec<String>,
}

impl Lista {
    pub fn leer(texto: &str, fichas: &Fichas) -> Result<Lista, String> {
        let d: EnDisco = serde_json::from_str(texto).map_err(|e| format!("la lista del escudo no se entiende: {e}"))?;
        if d.version != 1 {
            return Err(format!("la lista del escudo es de la versión {} y esta Adeorq lee la 1", d.version));
        }
        let partir = |p: String| trozos(&p).into_iter().map(str::to_owned).collect::<Vec<_>>();
        let mut nombres = Vec::new();
        for n in d.nombres {
            nombres.push(Entrada { clase: clase_de(&n.clase)?, patron: partir(normalizar(&n.nombre)), vigilar: n.vigilar });
        }
        let mut carpetas = Vec::new();
        for c in d.carpetas {
            carpetas.push(Entrada { clase: clase_de(&c.clase)?, patron: partir(fichas.poner(&c.carpeta)), vigilar: c.vigilar });
        }
        let mut archivos = Vec::new();
        for a in d.archivos {
            archivos.push(Entrada { clase: clase_de(&a.clase)?, patron: partir(fichas.poner(&a.archivo)), vigilar: a.vigilar });
        }
        Ok(Lista {
            nombres,
            carpetas,
            archivos,
            raices: d.vigilar.raices.iter().map(|r| fichas.poner(r)).collect(),
            profundidad: d.vigilar.profundidad,
            saltar: d.vigilar.saltar.iter().map(|s| s.to_lowercase()).collect(),
        })
    }

    /// La clase de una ruta ya normalizada y si la mira el vigilante (si alguna
    /// de las entradas en que cae no dice `vigilar: false`). `None`: no es nada
    /// protegido.
    pub fn clasificar(&self, norm: &str) -> Option<(Clase, bool)> {
        let ruta = trozos(norm);
        let mut mejor: Option<Clase> = None;
        let mut vigilada = false;
        let mut cae = |e: &Entrada| {
            mejor = Some(mejor.map_or(e.clase, |m| m.max(e.clase)));
            vigilada |= e.vigilar;
        };
        for e in &self.nombres {
            let n = e.patron.len();
            if ruta.len() >= n && e.patron.iter().zip(&ruta[ruta.len() - n..]).all(|(p, t)| coincide(p, t)) {
                cae(e);
            }
        }
        for e in &self.carpetas {
            let n = e.patron.len();
            if ruta.len() > n && e.patron.iter().zip(&ruta[..n]).all(|(p, t)| coincide(p, t)) {
                cae(e);
            }
        }
        for e in &self.archivos {
            if ruta.len() == e.patron.len() && e.patron.iter().zip(&ruta).all(|(p, t)| coincide(p, t)) {
                cae(e);
            }
        }
        mejor.map(|c| (c, vigilada))
    }

    /// Las carpetas y los archivos sueltos de la lista que existen en el disco,
    /// con sus `*` resueltos. Los `nombres` no: esos se buscan recorriendo las
    /// raíces, porque pueden estar en cualquier sitio.
    pub fn sitios(&self) -> (Vec<PathBuf>, Vec<PathBuf>) {
        let mut carpetas = Vec::new();
        for e in self.carpetas.iter().filter(|e| e.vigilar) {
            carpetas.extend(expandir(&e.patron).into_iter().filter(|p| p.is_dir()));
        }
        let mut archivos = Vec::new();
        for e in self.archivos.iter().filter(|e| e.vigilar) {
            archivos.extend(expandir(&e.patron).into_iter().filter(|p| p.is_file()));
        }
        (carpetas, archivos)
    }
}

/// Un patrón partido, contra el disco: cada trozo con `*` se compara con lo que
/// hay en esa carpeta, sin distinguir mayúsculas (como Windows).
fn expandir(patron: &[String]) -> Vec<PathBuf> {
    let Some(primero) = patron.first() else { return Vec::new() };
    // `c:` sola no es una carpeta en Windows (es «la carpeta actual de C:»).
    let raiz = if primero.is_empty() {
        PathBuf::from("/")
    } else if primero.ends_with(':') {
        PathBuf::from(format!("{primero}/"))
    } else {
        PathBuf::from(primero)
    };
    let mut vivos = vec![raiz];
    for trozo in &patron[1..] {
        let mut siguientes = Vec::new();
        for base in &vivos {
            if !trozo.contains('*') {
                let p = base.join(trozo);
                if p.exists() {
                    siguientes.push(p);
                }
                continue;
            }
            let Ok(dentro) = std::fs::read_dir(base) else { continue };
            for e in dentro.flatten() {
                if coincide(trozo, &e.file_name().to_string_lossy().to_lowercase()) {
                    siguientes.push(e.path());
                }
            }
        }
        vivos = siguientes;
        if vivos.is_empty() {
            break;
        }
    }
    vivos
}

/// Dónde está la lista que manda: la instalada en Archivos de programa (que un
/// agente no puede cambiar) o, sin instalar, la del repositorio.
pub fn donde() -> Option<PathBuf> {
    let instalada = programas().join("Adeorq Escudo").join("lista.json");
    if instalada.is_file() {
        return Some(instalada);
    }
    let del_repo = crate::workspace::raiz_por_defecto().join("Adeorq").join("escudo").join("lista.json");
    del_repo.is_file().then_some(del_repo)
}

#[cfg(test)]
pub(super) mod pruebas {
    use super::*;

    fn fichas() -> Fichas {
        Fichas {
            casa: "c:/users/muni".into(),
            proyectos: "c:/proyectos".into(),
            datos: "c:/users/muni/appdata/local".into(),
            programas: "c:/program files".into(),
        }
    }

    fn la_de_verdad() -> Lista {
        Lista::leer(&texto_del_repo(), &fichas()).unwrap()
    }

    /// La lista del repositorio, la que también lee el gancho. Se lee al correr
    /// y no al compilar: es de otra pieza (`escudo/`), y sin ella lo que falla
    /// es la prueba que la necesita, con su porqué, no la compilación entera.
    pub(crate) fn texto_del_repo() -> String {
        let ruta = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("escudo").join("lista.json");
        std::fs::read_to_string(&ruta).unwrap_or_else(|e| panic!("falta {} ({e}): la deja la pieza del gancho", ruta.display()))
    }

    #[test]
    fn una_ruta_se_compara_normalizada() {
        assert_eq!(normalizar(r"C:\Proyectos\.\Adeorq\..\Adeorq\AGENTS.md"), "c:/proyectos/adeorq/agents.md");
        assert_eq!(normalizar(r"\\?\C:\Proyectos\Adeorq\AGENTS.md"), "c:/proyectos/adeorq/agents.md");
        assert_eq!(normalizar("c://proyectos//x/"), "c:/proyectos/x");
        assert_eq!(normalizar(r"C:\..\..\Windows"), "c:/windows", "nunca por encima de la unidad");
        assert_eq!(normalizar("/home/munir/./x/../AGENTS.md"), "/home/munir/agents.md");
    }

    #[test]
    fn el_asterisco_no_cruza_una_barra() {
        assert!(coincide("claude-*", "claude-pro"));
        assert!(coincide("claude-*", "claude-"));
        assert!(!coincide("claude-*", ".claude"));
        assert!(coincide("*", "lo-que-sea"));
        assert!(coincide("a*b*c", "a-x-b-y-c"));
        assert!(!coincide("a*b*c", "a-x-c"));
        let l = la_de_verdad();
        // `{casa}/claude-*/hooks` no alcanza una carpeta dos niveles más abajo
        // por el asterisco: el asterisco es UN trozo.
        assert!(l.clasificar("c:/users/muni/claude-pro/hooks/x.mjs").is_some());
        assert!(l.clasificar("c:/users/muni/a/claude-pro/hooks/x.mjs").is_none());
    }

    #[test]
    fn la_lista_de_verdad_se_lee_como_dice() {
        let l = la_de_verdad();
        // Un nombre vale esté donde esté.
        assert_eq!(l.clasificar("c:/proyectos/adeorq/agents.md"), Some((Clase::Rojo, true)));
        assert_eq!(l.clasificar("d:/otra/cosa/claude.md"), Some((Clase::Rojo, true)));
        // Un nombre con carpeta tiene que acabar con esa carpeta delante.
        assert_eq!(l.clasificar("c:/proyectos/x/.claude/settings.json"), Some((Clase::Rojo, true)));
        assert_eq!(l.clasificar("c:/proyectos/x/settings.json"), None);
        // `vigilar: false`: el gancho la para, el vigilante no la mira.
        assert_eq!(l.clasificar("c:/proyectos/x/.claude/settings.local.json"), Some((Clase::Rojo, false)));
        // La carpeta del escudo: lo más duro, aunque caiga en otras.
        assert_eq!(l.clasificar("c:/users/muni/appdata/local/adeorq/escudo/permisos.jsonl").map(|c| c.0), Some(Clase::Escudo));
        assert_eq!(l.clasificar("c:/program files/adeorq escudo/llave-publica.der").map(|c| c.0), Some(Clase::Escudo));
        // Un AGENTS.md dentro de la carpeta del escudo es del escudo, no rojo.
        assert_eq!(l.clasificar("c:/program files/adeorq escudo/agents.md").map(|c| c.0), Some(Clase::Escudo));
        // La memoria de cualquier proyecto, y la de otra cuenta.
        assert_eq!(l.clasificar("c:/users/muni/.claude/projects/c--proyectos/memory/x.md"), Some((Clase::Memoria, true)));
        assert_eq!(l.clasificar("c:/users/muni/claude-pro/projects/c--x/memory/memory.md"), Some((Clase::Memoria, true)));
        // Una carpeta no se protege a sí misma, solo lo que cuelga de ella.
        assert_eq!(l.clasificar("c:/users/muni/.claude/skills"), None);
        assert_eq!(l.clasificar("c:/users/muni/.claude/skills/fin/skill.md").map(|c| c.0), Some(Clase::Rojo));
        // Un archivo suelto es esa ruta exacta.
        assert_eq!(l.clasificar("c:/users/muni/.codex/config.toml").map(|c| c.0), Some(Clase::Rojo));
        assert_eq!(l.clasificar("c:/users/muni/.codex/otro/config.toml"), None);
        assert_eq!(l.clasificar("c:/proyectos/_docs/gustos-de-diseno.md"), Some((Clase::Memoria, true)));
        // Y lo de todos los días, nada.
        assert_eq!(l.clasificar("c:/proyectos/adeorq/src/app.tsx"), None);
        assert_eq!(l.raices[0], "c:/proyectos");
        assert!(l.saltar.contains(&"node_modules".to_string()));
    }

    #[test]
    fn una_lista_rara_se_dice_en_vez_de_adivinarla() {
        let mal = r#"{"version":1,"nombres":[{"clase":"azul","nombre":"x"}],"vigilar":{"raices":[],"profundidad":1}}"#;
        assert!(Lista::leer(mal, &fichas()).unwrap_err().contains("azul"));
        let otra = r#"{"version":2,"vigilar":{"raices":[],"profundidad":1}}"#;
        assert!(Lista::leer(otra, &fichas()).unwrap_err().contains("versión 2"));
    }
}
