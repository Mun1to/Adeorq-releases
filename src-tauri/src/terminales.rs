// El proceso de terminales: `adeorq.exe --terminales`.
//
// Munir, 2026-10-10: «hazlo» (sacar las terminales de la ventana), y el
// 2026-10-11, a la pregunta de si los agentes deben morir cuando Adeorq se cae
// sola: «aguantan». El plano entero, con sus riesgos y sus etapas, está en
// `docs/contexto/terminales-fuera.md`. Esto es la etapa 1: el proceso y su
// protocolo. La app todavía no lo usa.
//
// Cómo va: un proceso aparte abre las terminales con el MISMO motor que la app
// (`pty::abrir` y las operaciones sobre el mapa, que no saben de ventanas) y
// habla con un solo cliente, la app, por una conexión TCP en 127.0.0.1 con una
// contraseña que vive en un fichero del usuario. Por qué TCP y no una tubería
// con nombre: es la misma idea en Windows y en Linux, ya la usa el MCP (3012), y
// con la contraseña en `%LOCALAPPDATA%` nadie que no sea el usuario se engancha.
//
// Una línea JSON por mensaje. La app manda órdenes con un número `n` y el
// proceso contesta con ese número; lo que dicen las terminales llega aparte,
// como avisos sin número.
//
// Las leyes que ya se pagaron en `pty.rs` siguen aquí: el lector de un panel no
// espera NUNCA al cliente (si el cliente se atrasa, se le corta y vuelve a pedir
// el historial), y nada que tarde (abrir, cambiar el tamaño, matar) se hace en
// el hilo que lee las órdenes.

use crate::pty::{self, Alta, Mapa, Salida};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// La versión del protocolo. Un cliente de otra versión no se engancha: es la
/// convivencia de versiones de la etapa 4, que todavía no existe.
pub const VERSION: u32 = 1;

/// Cuánto aguanta el proceso sin nadie al otro lado, con terminales vivas,
/// cuando la app se fue sin despedirse (una caída: «aguantan»). Pasado esto,
/// mata a todos y se va: un agente sin ventana gasta cuota y nadie lo ve, que
/// es lo que la regla del 2026-10-06 quería evitar.
pub const TOPE_SIN_CLIENTE: Duration = Duration::from_secs(30 * 60);

/// Cuántos mensajes se le guardan a un cliente que no lee. Pasado esto se le
/// corta, y al volver pide el historial: antes que bloquear a un lector.
const COLA_CLIENTE: usize = 4096;

/// Lo que manda la app.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Orden {
    /// La primera, siempre. `retener`: si la app se va sin despedirse, se
    /// guardan las terminales para cuando vuelva (etapa 3). Sin él, se matan,
    /// que es lo que pasa hoy al morir la app.
    Hola { token: String, version: u32, #[serde(default)] retener: bool },
    Crear { n: u64, alta: Alta },
    Escribir { id: u32, texto: String },
    Tamano { n: u64, id: u32, cols: u16, rows: u16 },
    Matar { n: u64, id: u32 },
    MatarTodas { n: u64 },
    Historial { n: u64, id: u32, bytes: Option<usize> },
    Listar { n: u64 },
    /// La app se cierra de verdad: se mata todo y el proceso se va.
    Adios,
}

/// Lo que se sabe de una terminal, como viaja.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct FichaRemota {
    pub id: u32,
    pub cwd: String,
    pub command: Option<Vec<String>>,
    pub pid: Option<u32>,
    pub tamano: Option<String>,
    pub alternativa: bool,
    pub pegado: bool,
}

impl From<pty::Ficha> for FichaRemota {
    fn from(f: pty::Ficha) -> Self {
        FichaRemota { id: f.id, cwd: f.cwd, command: f.command, pid: f.pid, tamano: f.tamano, alternativa: f.alternativa, pegado: f.pegado }
    }
}

/// Lo que manda el proceso.
#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Aviso {
    Hola { pid: u32, version: u32, terminales: usize },
    Ok { n: u64, #[serde(default, skip_serializing_if = "Option::is_none")] texto: Option<String> },
    Fichas { n: u64, fichas: Vec<FichaRemota> },
    Error { n: u64, error: String },
    Datos { id: u32, texto: String },
    Fin { id: u32, code: Option<u32> },
    Mudo { id: u32 },
}

/// Dónde se apunta un proceso de terminales: su puerto, su contraseña y su pid.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Señas {
    pub puerto: u16,
    pub token: String,
    pub pid: u32,
    pub version: u32,
}

/// El canal separa procesos que no deben verse: la app instalada y la de
/// desarrollo, o cada prueba de laboratorio (`ADEORQ_TERMINALES_CANAL`).
pub fn canal() -> String {
    std::env::var("ADEORQ_TERMINALES_CANAL")
        .ok()
        .filter(|c| !c.is_empty() && c.chars().all(|x| x.is_ascii_alphanumeric() || x == '-'))
        .unwrap_or_else(|| if cfg!(debug_assertions) { "desarrollo".into() } else { "estable".into() })
}

pub fn ruta_de_señas(dir: &Path, canal: &str) -> PathBuf {
    dir.join(format!("{canal}.json"))
}

fn token_nuevo() -> Result<String, String> {
    let mut b = [0u8; 24];
    getrandom::fill(&mut b).map_err(|e| format!("sin aleatoriedad del sistema: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn linea<T: Serialize>(m: &T) -> String {
    let mut s = serde_json::to_string(m).unwrap_or_default();
    s.push('\n');
    s
}

/// El cliente enganchado ahora mismo, si hay.
#[derive(Default)]
struct Enganche {
    tx: Option<SyncSender<String>>,
    /// Para cortarle de verdad: soltar el canal no le avisa de nada.
    sock: Option<TcpStream>,
    /// Qué enganche es. El lector de órdenes de uno viejo, al acabar, solo
    /// desengancha si sigue siendo el suyo: si no, dejaría mudo al nuevo.
    vez: u64,
    /// Cuándo se fue el último, si no hay ninguno.
    solo_desde: Option<Instant>,
}

#[derive(Default)]
struct Cliente(Mutex<Enganche>);

impl Cliente {
    fn estado(&self) -> std::sync::MutexGuard<'_, Enganche> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// La salida de cada terminal escribe aquí con `try_send`, que no espera:
    /// lleno es que el cliente no lee, y se le corta (cerrando su conexión, para
    /// que se entere, vuelva y pida el historial). Lo que se diga mientras tanto
    /// queda en el historial de cada terminal.
    fn mandar(&self, aviso: &Aviso) {
        let mut e = self.estado();
        let Some(t) = e.tx.as_ref() else { return };
        if let Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) = t.try_send(linea(aviso)) {
            crate::anotar("terminales: la app no lee lo que dicen sus terminales; se le corta para que vuelva a pedirlo");
            Self::soltar(&mut e);
        }
    }

    fn soltar(e: &mut Enganche) {
        if let Some(s) = e.sock.take() {
            let _ = s.shutdown(std::net::Shutdown::Both);
        }
        e.tx = None;
        e.solo_desde = Some(Instant::now());
    }
}

struct SalidaHost(Arc<Cliente>);

impl Salida for SalidaHost {
    fn datos(&self, id: u32, texto: String) {
        self.0.mandar(&Aviso::Datos { id, texto });
    }
    fn fin(&self, id: u32, code: Option<u32>) {
        self.0.mandar(&Aviso::Fin { id, code });
    }
    fn mudo(&self, id: u32) {
        self.0.mandar(&Aviso::Mudo { id });
    }
}

/// Dice que no y cierra. Lee antes su saludo: cerrar un socket con lo que el
/// otro mandó sin leer hace que Windows corte en seco, y el «no» se pierde por
/// el camino (pasaba una vez de cada pocas en la prueba).
fn rechazar(flujo: TcpStream, por: &str) {
    let _ = flujo.set_nonblocking(false);
    let _ = flujo.set_read_timeout(Some(Duration::from_millis(500)));
    let mut lee = BufReader::new(flujo);
    let mut primera = String::new();
    let _ = lee.read_line(&mut primera);
    let mut f = lee.into_inner();
    let _ = f.write_all(linea(&Aviso::Error { n: 0, error: por.into() }).as_bytes());
    let _ = f.shutdown(std::net::Shutdown::Write);
}

/// Por qué se acabó el proceso de terminales.
#[derive(Debug, PartialEq)]
pub enum Final {
    /// La app se despidió (`Adios`): se cerró de verdad.
    Despedida,
    /// La app se fue sin despedirse y no pidió que se guardaran.
    SinRetener,
    /// Nadie volvió en `TOPE_SIN_CLIENTE`.
    Plazo,
    /// No quedan terminales y nadie al otro lado.
    Vacio,
}

/// El proceso de terminales. `dir` es donde deja sus señas; `tope`, cuánto
/// espera sin cliente (las pruebas lo acortan).
pub struct Servidor {
    mapa: Mapa,
    cliente: Arc<Cliente>,
    señas: Señas,
    ruta: PathBuf,
    escucha: TcpListener,
    tope: Duration,
    retener: Mutex<bool>,
}

impl Servidor {
    pub fn nuevo(dir: &Path, canal: &str, tope: Duration) -> Result<Servidor, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let escucha = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
        let puerto = escucha.local_addr().map_err(|e| e.to_string())?.port();
        let señas = Señas { puerto, token: token_nuevo()?, pid: std::process::id(), version: VERSION };
        let ruta = ruta_de_señas(dir, canal);
        let temporal = ruta.with_extension("json.tmp");
        std::fs::write(&temporal, serde_json::to_vec(&señas).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::rename(&temporal, &ruta).map_err(|e| e.to_string())?;
        // Sin esperar en `accept`: el bucle mira el plazo entre cliente y cliente.
        escucha.set_nonblocking(true).map_err(|e| e.to_string())?;
        let cliente = Cliente::default();
        cliente.estado().solo_desde = Some(Instant::now());
        Ok(Servidor {
            mapa: Default::default(),
            cliente: Arc::new(cliente),
            señas,
            ruta,
            escucha,
            tope,
            retener: Mutex::new(false),
        })
    }

    pub fn señas(&self) -> &Señas {
        &self.señas
    }

    /// Atiende hasta que toca acabar, y deja todo muerto al salir: ninguna
    /// terminal sobrevive a su proceso (el corral de `pty.rs` es la red si
    /// esto no llega a correr).
    pub fn servir(self) -> Final {
        let final_ = self.bucle();
        pty::matar_todas(&self.mapa);
        // Las señas solo se borran si siguen siendo las nuestras: otro proceso
        // del mismo canal pudo arrancar mientras tanto.
        if std::fs::read(&self.ruta).ok().and_then(|b| serde_json::from_slice::<Señas>(&b).ok()).as_ref() == Some(&self.señas) {
            let _ = std::fs::remove_file(&self.ruta);
        }
        final_
    }

    fn bucle(&self) -> Final {
        let (tx_final, rx_final) = std::sync::mpsc::channel::<Final>();
        loop {
            if let Ok(f) = rx_final.try_recv() {
                return f;
            }
            let (hay_cliente, desde) = {
                let e = self.cliente.estado();
                (e.tx.is_some(), e.solo_desde)
            };
            if !hay_cliente {
                if let Some(desde) = desde {
                    let vacio = pty::fichas_de(&self.mapa).is_empty();
                    if vacio && desde.elapsed() > Duration::from_secs(20) {
                        return Final::Vacio;
                    }
                    if !vacio && desde.elapsed() > self.tope {
                        crate::anotar("terminales: nadie volvió a por ellas a tiempo; se cierran todas");
                        return Final::Plazo;
                    }
                }
            }
            match self.escucha.accept() {
                Ok((flujo, _)) => {
                    if hay_cliente {
                        // Uno solo a la vez: dos ventanas mandando teclas al
                        // mismo panel es exactamente lo que no puede pasar.
                        rechazar(flujo, "ya hay una app enganchada");
                        continue;
                    }
                    self.atender(flujo, tx_final.clone());
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    }

    /// Engancha un cliente: comprueba su contraseña y le monta su escritor y su
    /// lector de órdenes, cada uno en su hilo.
    fn atender(&self, flujo: TcpStream, tx_final: std::sync::mpsc::Sender<Final>) {
        let _ = flujo.set_nonblocking(false);
        let _ = flujo.set_nodelay(true);
        let Ok(escribe) = crate::clon_sin_herencia(&flujo) else { return };
        let mut lee = BufReader::new(flujo);
        // La primera línea tiene que ser el `Hola` con la contraseña, y pronto.
        let _ = lee.get_ref().set_read_timeout(Some(Duration::from_secs(5)));
        let mut primera = String::new();
        let hola = lee.read_line(&mut primera).ok().and_then(|_| serde_json::from_str::<Orden>(primera.trim()).ok());
        let retener = match hola {
            Some(Orden::Hola { token, version, retener }) if token == self.señas.token && version == VERSION => retener,
            _ => {
                let mut e = escribe;
                let _ = e.write_all(linea(&Aviso::Error { n: 0, error: "no".into() }).as_bytes());
                let _ = e.shutdown(std::net::Shutdown::Write);
                return;
            }
        };
        let _ = lee.get_ref().set_read_timeout(None);
        *self.retener.lock().unwrap_or_else(|e| e.into_inner()) = retener;

        let (tx, rx) = sync_channel::<String>(COLA_CLIENTE);
        // El saludo, antes que nada de las terminales.
        let _ = tx.try_send(linea(&Aviso::Hola { pid: self.señas.pid, version: VERSION, terminales: pty::fichas_de(&self.mapa).len() }));
        let vez = {
            let mut e = self.cliente.estado();
            e.vez += 1;
            e.tx = Some(tx.clone());
            e.sock = crate::clon_sin_herencia(&escribe).ok();
            e.solo_desde = None;
            e.vez
        };

        // El escritor: el único que toca el socket de salida.
        let mut sale = escribe;
        std::thread::spawn(move || {
            for l in rx {
                if sale.write_all(l.as_bytes()).is_err() {
                    break;
                }
            }
            let _ = sale.shutdown(std::net::Shutdown::Both);
        });

        // El lector de órdenes.
        let mapa = self.mapa.clone();
        let cliente = self.cliente.clone();
        let salida: Arc<dyn Salida> = Arc::new(SalidaHost(self.cliente.clone()));
        let retiene = retener;
        std::thread::spawn(move || {
            let responde = |a: Aviso| {
                let _ = tx.try_send(linea(&a));
            };
            let mut despedida = false;
            for l in lee.lines() {
                let Ok(l) = l else { break };
                let Ok(orden) = serde_json::from_str::<Orden>(&l) else { continue };
                match orden {
                    Orden::Hola { .. } => {}
                    Orden::Escribir { id, texto } => {
                        let _ = pty::escribir(&mapa, id, texto.into_bytes());
                    }
                    Orden::Historial { n, id, bytes } => responde(match pty::historial(&mapa, id, bytes) {
                        Ok(t) => Aviso::Ok { n, texto: Some(t) },
                        Err(e) => Aviso::Error { n, error: e },
                    }),
                    Orden::Listar { n } => {
                        responde(Aviso::Fichas { n, fichas: pty::fichas_de(&mapa).into_iter().map(FichaRemota::from).collect() })
                    }
                    // Lo que tarda, en su hilo: una terminal que tarda en
                    // abrirse no puede hacer esperar a la tecla de otra.
                    Orden::Crear { n, alta } => {
                        let (mapa, salida, tx) = (mapa.clone(), salida.clone(), tx.clone());
                        std::thread::spawn(move || {
                            let a = match pty::abrir(&mapa, alta, salida) {
                                Ok(()) => Aviso::Ok { n, texto: None },
                                Err(e) => Aviso::Error { n, error: e },
                            };
                            let _ = tx.try_send(linea(&a));
                        });
                    }
                    Orden::Tamano { n, id, cols, rows } => {
                        let (mapa, tx) = (mapa.clone(), tx.clone());
                        std::thread::spawn(move || {
                            let a = match pty::tamano(&mapa, id, cols, rows) {
                                Ok(()) => Aviso::Ok { n, texto: None },
                                Err(e) => Aviso::Error { n, error: e },
                            };
                            let _ = tx.try_send(linea(&a));
                        });
                    }
                    Orden::Matar { n, id } => {
                        let (mapa, tx) = (mapa.clone(), tx.clone());
                        std::thread::spawn(move || {
                            pty::matar(&mapa, id);
                            let _ = tx.try_send(linea(&Aviso::Ok { n, texto: None }));
                        });
                    }
                    Orden::MatarTodas { n } => {
                        let (mapa, tx) = (mapa.clone(), tx.clone());
                        std::thread::spawn(move || {
                            pty::matar_todas(&mapa);
                            let _ = tx.try_send(linea(&Aviso::Ok { n, texto: None }));
                        });
                    }
                    Orden::Adios => {
                        despedida = true;
                        break;
                    }
                }
            }
            // Se fue. Sin cliente, la salida de las terminales cae al historial.
            // Solo si el enganche sigue siendo este: si le cortamos por lento,
            // puede haber vuelto ya.
            {
                let mut e = cliente.estado();
                if e.vez != vez {
                    return;
                }
                Cliente::soltar(&mut e);
            }
            if despedida {
                let _ = tx_final.send(Final::Despedida);
            } else if !retiene {
                let _ = tx_final.send(Final::SinRetener);
            } else {
                crate::anotar("terminales: la app se fue sin despedirse; se guardan sus terminales para cuando vuelva");
            }
        });
    }
}

/// `adeorq.exe --terminales`: monta el servidor en su sitio de siempre y
/// atiende hasta que toca acabar.
pub fn principal() -> Result<(), String> {
    let servidor = Servidor::nuevo(&dir_de_verdad()?, &canal(), TOPE_SIN_CLIENTE)?;
    let final_ = servidor.servir();
    crate::anotar(&format!("terminales: el proceso se va ({final_:?})"));
    Ok(())
}

fn dir_de_verdad() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("terminales"))
}

// ─── EL CLIENTE: LA APP ENGANCHADA AL PROCESO ───────────────────────────────
//
// La app habla con el proceso por una sola conexión y lleva un ESPEJO de cada
// terminal: su ficha, su historial y sus modos (pantalla alternativa, pegado),
// alimentado por lo mismo que pinta la ventana. Así lo que pregunta el resto de
// la app (el MCP, `pty_historial` en el hilo de la ventana, las decisiones) se
// contesta sin esperar a la conexión, que es la ley de `hilo.rs`.

/// Una terminal vista desde la app.
struct Sombra {
    ficha: FichaRemota,
    historia: Arc<Mutex<String>>,
    alternativa: Arc<std::sync::atomic::AtomicBool>,
    pegado: Arc<std::sync::atomic::AtomicBool>,
    cola_modos: Vec<u8>,
}

impl Sombra {
    fn nueva(ficha: FichaRemota) -> Sombra {
        let alternativa = Arc::new(std::sync::atomic::AtomicBool::new(ficha.alternativa));
        let pegado = Arc::new(std::sync::atomic::AtomicBool::new(ficha.pegado));
        Sombra { ficha, historia: Default::default(), alternativa, pegado, cola_modos: Vec::new() }
    }
    fn ficha(&self) -> pty::Ficha {
        let f = &self.ficha;
        pty::Ficha {
            id: f.id,
            cwd: f.cwd.clone(),
            command: f.command.clone(),
            pid: f.pid,
            tamano: f.tamano.clone(),
            alternativa: self.alternativa.load(std::sync::atomic::Ordering::Relaxed),
            pegado: self.pegado.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
}

/// La app enganchada a un proceso de terminales.
pub struct Remoto {
    sale: std::sync::mpsc::Sender<String>,
    pendientes: Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<Aviso>>>,
    n: std::sync::atomic::AtomicU64,
    espejo: Arc<Mutex<std::collections::HashMap<u32, Sombra>>>,
    vivo: Arc<std::sync::atomic::AtomicBool>,
    pub pid: u32,
    /// Para cortar la conexión a mano (las pruebas hacen así de «app que se cae»).
    sock: TcpStream,
}

/// Cuánto se espera a que el proceso conteste una orden.
const ESPERA_ORDEN: Duration = Duration::from_secs(15);

impl Remoto {
    /// Se engancha a un proceso de terminales. Lo que digan sus terminales va a
    /// `salida` (en la app, los eventos de siempre). Si el proceso ya tenía
    /// terminales (la app se cayó y vuelve), se traen al espejo con su historial.
    pub fn conectar(señas: &Señas, salida: Arc<dyn Salida>) -> Result<Arc<Remoto>, String> {
        let dir = std::net::SocketAddr::from(([127, 0, 0, 1], señas.puerto));
        let flujo = TcpStream::connect_timeout(&dir, Duration::from_secs(2)).map_err(|e| e.to_string())?;
        let _ = flujo.set_nodelay(true);
        let mut escribe = crate::clon_sin_herencia(&flujo).map_err(|e| e.to_string())?;
        let sock = crate::clon_sin_herencia(&flujo).map_err(|e| e.to_string())?;
        let lee = BufReader::new(flujo);

        // El escritor: lo único que toca el socket de salida, y el canal no
        // bloquea a quien manda (la tecla, en el hilo de la ventana).
        let (sale, rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            for l in rx {
                if escribe.write_all(l.as_bytes()).is_err() {
                    break;
                }
            }
            let _ = escribe.shutdown(std::net::Shutdown::Both);
        });
        let _ = sale.send(linea(&Orden::Hola { token: señas.token.clone(), version: VERSION, retener: true }));

        let remoto = Arc::new(Remoto {
            sale,
            pendientes: Mutex::new(Default::default()),
            n: std::sync::atomic::AtomicU64::new(1),
            espejo: Default::default(),
            vivo: Arc::new(std::sync::atomic::AtomicBool::new(true)),
            pid: señas.pid,
            sock,
        });

        // El lector: avisos de las terminales al espejo y a la ventana, y las
        // respuestas a quien las espera.
        let (tx_hola, rx_hola) = std::sync::mpsc::channel::<Result<usize, String>>();
        let r = remoto.clone();
        std::thread::spawn(move || {
            let mut hola = Some(tx_hola);
            for l in lee.lines() {
                let Ok(l) = l else { break };
                let Ok(aviso) = serde_json::from_str::<Aviso>(&l) else { continue };
                match aviso {
                    Aviso::Hola { terminales, .. } => {
                        if let Some(t) = hola.take() {
                            let _ = t.send(Ok(terminales));
                        }
                    }
                    Aviso::Error { n: 0, error } => {
                        if let Some(t) = hola.take() {
                            let _ = t.send(Err(error));
                        }
                    }
                    Aviso::Datos { id, texto } => {
                        r.al_espejo(id, &texto);
                        salida.datos(id, texto);
                    }
                    Aviso::Fin { id, code } => {
                        r.espejo.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
                        salida.fin(id, code);
                    }
                    Aviso::Mudo { id } => salida.mudo(id),
                    otro @ (Aviso::Ok { .. } | Aviso::Fichas { .. } | Aviso::Error { .. }) => {
                        let n = match &otro {
                            Aviso::Ok { n, .. } | Aviso::Fichas { n, .. } | Aviso::Error { n, .. } => *n,
                            _ => 0,
                        };
                        if let Some(t) = r.pendientes.lock().unwrap_or_else(|e| e.into_inner()).remove(&n) {
                            let _ = t.send(otro);
                        }
                    }
                }
            }
            // Se cortó. Si el proceso murió, murieron sus terminales con él (su
            // corral): se avisa de cada una, para que ningún panel se quede
            // esperando a un proceso que no existe.
            r.vivo.store(false, std::sync::atomic::Ordering::Relaxed);
            r.pendientes.lock().unwrap_or_else(|e| e.into_inner()).clear();
            let ids: Vec<u32> = r.espejo.lock().unwrap_or_else(|e| e.into_inner()).drain().map(|(id, _)| id).collect();
            crate::anotar(&format!("terminales: se cortó la conexión con el proceso; {} terminales se dan por cerradas", ids.len()));
            for id in ids {
                salida.fin(id, None);
            }
        });

        let terminales = rx_hola.recv_timeout(Duration::from_secs(5)).map_err(|_| "el proceso de terminales no saludó".to_string())??;
        if terminales > 0 {
            remoto.traer_las_vivas()?;
        }
        Ok(remoto)
    }

    /// Las que ya corrían en el proceso (la app se cayó y vuelve): al espejo,
    /// con lo que dijeron mientras tanto.
    fn traer_las_vivas(&self) -> Result<(), String> {
        let Aviso::Fichas { fichas, .. } = self.pedir(|n| Orden::Listar { n })? else {
            return Err("el proceso no dio la lista".into());
        };
        for f in fichas {
            let id = f.id;
            let sombra = Sombra::nueva(f);
            if let Ok(Aviso::Ok { texto: Some(t), .. }) = self.pedir(|n| Orden::Historial { n, id, bytes: None }) {
                pty::tomar(&sombra.historia).push_str(&t);
            }
            self.espejo.lock().unwrap_or_else(|e| e.into_inner()).insert(id, sombra);
        }
        Ok(())
    }

    fn al_espejo(&self, id: u32, texto: &str) {
        let mut espejo = self.espejo.lock().unwrap_or_else(|e| e.into_inner());
        let Some(s) = espejo.get_mut(&id) else { return };
        pty::marcar_pantalla(texto.as_bytes(), &mut s.cola_modos, &s.alternativa, &s.pegado);
        let mut h = pty::tomar(&s.historia);
        h.push_str(texto);
        pty::recortar_historial(&mut h);
    }

    /// Manda una orden con su número y espera su respuesta.
    fn pedir(&self, orden: impl FnOnce(u64) -> Orden) -> Result<Aviso, String> {
        if !self.vivo.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("el proceso de terminales no está".into());
        }
        let n = self.n.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let (tx, rx) = std::sync::mpsc::channel();
        self.pendientes.lock().unwrap_or_else(|e| e.into_inner()).insert(n, tx);
        self.sale.send(linea(&orden(n))).map_err(|_| "el proceso de terminales no está".to_string())?;
        let r = rx.recv_timeout(ESPERA_ORDEN).map_err(|_| {
            self.pendientes.lock().unwrap_or_else(|e| e.into_inner()).remove(&n);
            "el proceso de terminales no contestó".to_string()
        })?;
        match r {
            Aviso::Error { error, .. } => Err(error),
            otro => Ok(otro),
        }
    }

    pub fn crear(&self, alta: Alta) -> Result<(), String> {
        let id = alta.id;
        // Si ya está en el espejo es un reenganche: el proceso contesta que sí
        // sin abrir nada, como `pty::abrir` con un id que ya existe.
        let ya = self.existe(id);
        let ficha = FichaRemota {
            id,
            cwd: alta.cwd.clone(),
            command: alta.command.clone(),
            pid: None,
            tamano: Some(format!("{}x{}", alta.cols, alta.rows)),
            alternativa: false,
            pegado: false,
        };
        // Al espejo ANTES de pedirlo: lo primero que diga puede llegar antes
        // que el «hecho».
        if !ya {
            self.espejo.lock().unwrap_or_else(|e| e.into_inner()).insert(id, Sombra::nueva(ficha));
        }
        if let Err(e) = self.pedir(|n| Orden::Crear { n, alta }) {
            if !ya {
                self.espejo.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
            }
            return Err(e);
        }
        // El pid, para el pulso: lo sabe el proceso.
        if let Ok(Aviso::Fichas { fichas, .. }) = self.pedir(|n| Orden::Listar { n }) {
            let mut espejo = self.espejo.lock().unwrap_or_else(|e| e.into_inner());
            for f in fichas {
                if let Some(s) = espejo.get_mut(&f.id) {
                    s.ficha.pid = f.pid;
                }
            }
        }
        Ok(())
    }

    pub fn existe(&self, id: u32) -> bool {
        self.espejo.lock().unwrap_or_else(|e| e.into_inner()).contains_key(&id)
    }

    pub fn fichas(&self) -> Vec<pty::Ficha> {
        let espejo = self.espejo.lock().unwrap_or_else(|e| e.into_inner());
        let mut v: Vec<pty::Ficha> = espejo.values().map(Sombra::ficha).collect();
        v.sort_by_key(|f| f.id);
        v
    }

    pub fn historia(&self, id: u32) -> Option<(Arc<Mutex<String>>, bool)> {
        let espejo = self.espejo.lock().unwrap_or_else(|e| e.into_inner());
        espejo.get(&id).map(|s| (s.historia.clone(), s.alternativa.load(std::sync::atomic::Ordering::Relaxed)))
    }

    /// Lo mismo que `pty::historial`, del espejo.
    pub fn historial(&self, id: u32, bytes: Option<usize>) -> Result<String, String> {
        let (h, _) = self.historia(id).ok_or(pty::NO_ESTA)?;
        let hist = pty::tomar(&h);
        let tope = bytes.unwrap_or(100_000);
        if hist.len() <= tope {
            return Ok(hist.clone());
        }
        let (corte, preambulo) = crate::modos_terminal::cortar(&hist, hist.len() - tope);
        Ok(format!("{preambulo}{}", &hist[corte..]))
    }

    /// No espera: va al canal del escritor.
    pub fn escribir(&self, id: u32, bytes: Vec<u8>) -> Result<(), String> {
        if !self.existe(id) {
            return Err(pty::NO_ESTA.into());
        }
        let texto = String::from_utf8_lossy(&bytes).into_owned();
        self.sale.send(linea(&Orden::Escribir { id, texto })).map_err(|_| "pty cerrado".to_string())
    }

    pub fn tamano(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        if !self.existe(id) {
            return Err(pty::NO_ESTA.into());
        }
        self.pedir(|n| Orden::Tamano { n, id, cols, rows })?;
        if let Some(s) = self.espejo.lock().unwrap_or_else(|e| e.into_inner()).get_mut(&id) {
            s.ficha.tamano = Some(format!("{cols}x{rows}"));
        }
        Ok(())
    }

    pub fn matar(&self, id: u32) -> Result<(), String> {
        if !self.existe(id) {
            return Ok(());
        }
        self.pedir(|n| Orden::Matar { n, id }).map(|_| ())
    }

    /// Corta la conexión sin despedirse: lo que le pasa al proceso cuando la app
    /// muere de golpe. Lo usan las pruebas para hacer de app que se cae.
    pub fn cortar(&self) {
        let _ = self.sock.shutdown(std::net::Shutdown::Both);
    }

    /// Cerrar Adeorq de verdad: el proceso mata a todas y se va.
    pub fn adios(&self) {
        let _ = self.sale.send(linea(&Orden::Adios));
        // Un respiro para que la despedida salga antes de que la app se vaya.
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// El enganche de la app, si las terminales van en su proceso.
#[derive(Default)]
pub struct Conexion(pub std::sync::OnceLock<Arc<Remoto>>);

/// La app se va a cerrar para actualizarse (o reiniciarse): entonces NO se
/// despide. El proceso guarda las terminales y la versión nueva las recoge al
/// abrir. Lo pone la tarjeta de actualizar justo antes de instalar.
static POR_ACTUALIZAR: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

///
/// Sin el proceso de terminales, en cambio, las terminales mueren con la app:
/// en Windows el instalador la cierra de golpe y las mata el corral, sin pasar
/// por `kill_all`. Así que aquí se despide antes a los Claude Code, o cada
/// actualización le contaría un fallo por panel y le apagaría la pantalla
/// completa (`pty::despedir_todas`, 2026-10-15).
#[tauri::command(async)]
pub fn terminales_por_actualizar(app: tauri::AppHandle) {
    POR_ACTUALIZAR.store(true, std::sync::atomic::Ordering::Relaxed);
    if remoto(&app).is_none() {
        crate::pty::despedir_todas(&app);
    }
}

/// Lo que hace `pty::kill_all` al cerrarse la app con el proceso de terminales:
/// despedirse (se cierran todas), o, si se va para actualizarse, cortar sin más
/// (aguantan y la nueva las recoge).
pub fn al_cerrar_la_app(r: &Remoto) {
    if POR_ACTUALIZAR.load(std::sync::atomic::Ordering::Relaxed) {
        crate::anotar("terminales: la app se cierra para actualizarse; las terminales se quedan para la versión nueva");
        r.cortar();
    } else {
        r.adios();
    }
}

/// El proceso de terminales de esta app, si va con él.
pub fn remoto(app: &tauri::AppHandle) -> Option<Arc<Remoto>> {
    use tauri::Manager;
    app.try_state::<Conexion>()?.0.get().cloned()
}

// ─── EL AJUSTE ──────────────────────────────────────────────────────────────
//
// Apagado de fábrica mientras se prueba. Vive en un fichero y no en el
// `localStorage` de la ventana porque se decide al ARRANCAR, antes de que la
// ventana abra ninguna terminal: cambiar de motor con terminales abiertas no
// tiene sentido, así que se aplica al volver a abrir Adeorq.

fn ruta_del_ajuste() -> Result<PathBuf, String> {
    Ok(dir_de_verdad()?.join("encendido"))
}

pub fn encendido() -> bool {
    ruta_del_ajuste().map(|r| r.exists()).unwrap_or(false)
}

#[tauri::command(async)]
pub fn terminales_aparte() -> bool {
    encendido()
}

#[tauri::command(async)]
pub fn terminales_aparte_poner(encender: bool) -> Result<(), String> {
    let r = ruta_del_ajuste()?;
    if encender {
        std::fs::create_dir_all(r.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        std::fs::write(&r, b"1").map_err(|e| e.to_string())
    } else if r.exists() {
        std::fs::remove_file(&r).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

/// Las señas del proceso de este canal, si hay uno vivo que conteste.
fn señas_vivas(dir: &Path, canal: &str) -> Option<Señas> {
    let s: Señas = serde_json::from_slice(&std::fs::read(ruta_de_señas(dir, canal)).ok()?).ok()?;
    (s.version == VERSION).then_some(s)
}

/// Desde dónde se lanza el proceso: en Windows, una COPIA del ejecutable fuera
/// de la carpeta de instalación (`terminales\motor\<versión>\adeorq.exe`).
///
/// El instalador cierra a la fuerza todo proceso que use `$INSTDIR\adeorq.exe`
/// (lo registra en el Restart Manager, leído en el guion de NSIS que genera
/// Tauri): corriendo desde ahí, actualizar se llevaría el proceso y con él a sus
/// agentes. Desde la copia, el motor viejo sigue hasta que se cierren todas, que
/// es lo que eligió Munir (decisión D1, 2026-10-11). Orca hace lo mismo por lo
/// mismo. El ejecutable va solo, sin librerías al lado (comprobado en su
/// carpeta instalada). Si la copia falla, se lanza el de siempre y lo único que
/// se pierde es sobrevivir a una actualización.
///
/// En desarrollo no: cada compilación cambia el binario sin cambiar la versión,
/// y una copia vieja correría código viejo. En Linux tampoco: el AppImage lleva
/// sus librerías dentro y el binario suelto no arrancaría.
fn ejecutable_del_motor() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("adeorq.exe"));
    if cfg!(debug_assertions) || !cfg!(windows) {
        return exe;
    }
    match dir_de_verdad().and_then(|d| copiar_motor(&exe, &d.join("motor"), env!("CARGO_PKG_VERSION"))) {
        Ok(c) => c,
        Err(e) => {
            crate::anotar(&format!("terminales: no se pudo copiar el motor fuera de la instalación ({e}); va desde ahí y una actualización lo cerraría"));
            exe
        }
    }
}

/// Copia `exe` a `motor\<versión>\` si no está ya (mismo tamaño), y borra las
/// copias de otras versiones. La de una versión con un proceso vivo no se deja
/// borrar en Windows, y así tiene que ser: ese motor sigue hasta que se vacíe.
fn copiar_motor(exe: &Path, motor: &Path, version: &str) -> Result<PathBuf, String> {
    let dir = motor.join(version);
    let copia = dir.join(exe.file_name().unwrap_or_else(|| std::ffi::OsStr::new("adeorq.exe")));
    let tam = |p: &Path| std::fs::metadata(p).map(|m| m.len()).ok();
    if tam(&copia).is_none() || tam(&copia) != tam(exe) {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let temporal = copia.with_extension("tmp");
        std::fs::copy(exe, &temporal).map_err(|e| e.to_string())?;
        std::fs::rename(&temporal, &copia).map_err(|e| e.to_string())?;
    }
    for e in std::fs::read_dir(motor).into_iter().flatten().flatten() {
        if e.path() != dir {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
    Ok(copia)
}

/// Lanza el proceso de terminales sin que caiga en el corral de nadie: tiene
/// que sobrevivir a la app. En Windows, sin ventana y fuera del Job Object de
/// quien lanzó Adeorq (si ese job no deja salir, se lanza dentro y lo único que
/// se pierde es sobrevivir a ESE cierre).
fn lanzar(canal: &str) -> Result<(), String> {
    let exe = ejecutable_del_motor();
    let mut c = std::process::Command::new(&exe);
    c.arg("--terminales").env("ADEORQ_TERMINALES_CANAL", canal);
    c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        c.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
        if c.spawn().is_ok() {
            return Ok(());
        }
        c.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        c.process_group(0);
    }
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Al arrancar la app: si el ajuste está puesto, se engancha al proceso de
/// terminales de su canal (lanzándolo si no hay ninguno). Si algo falla, la app
/// sigue con sus terminales dentro, como siempre, y queda apuntado.
pub fn arrancar(app: &tauri::AppHandle) {
    use tauri::Manager;
    if !encendido() {
        return;
    }
    let Some(conexion) = app.try_state::<Conexion>() else { return };
    let resultado = (|| -> Result<Arc<Remoto>, String> {
        let dir = dir_de_verdad()?;
        let canal = canal();
        let salida: Arc<dyn Salida> = Arc::new(pty::SalidaVentana(app.clone()));
        if let Some(s) = señas_vivas(&dir, &canal) {
            // Con reintentos: tras una caída, el proceso puede no haberse dado
            // cuenta todavía de que la app anterior se fue, y contesta «ya hay
            // una app». Lanzar otro proceso entonces dejaría dos en el mismo
            // canal y las terminales vivas sin nadie que las vea.
            let hasta = Instant::now() + Duration::from_secs(3);
            loop {
                match Remoto::conectar(&s, salida.clone()) {
                    Ok(r) => {
                        crate::anotar(&format!("terminales: enganchada al proceso {} con {} terminales vivas", s.pid, r.fichas().len()));
                        return Ok(r);
                    }
                    // No escucha nadie: esas señas son de un proceso muerto.
                    Err(e) if e.contains("refused") || e.contains("rechaz") || e.contains("10061") => break,
                    Err(_) if Instant::now() < hasta => std::thread::sleep(Duration::from_millis(200)),
                    Err(_) => break,
                }
            }
        }
        lanzar(&canal)?;
        let hasta = Instant::now() + Duration::from_secs(8);
        while Instant::now() < hasta {
            if let Some(s) = señas_vivas(&dir, &canal) {
                if let Ok(r) = Remoto::conectar(&s, salida.clone()) {
                    crate::anotar(&format!("terminales: proceso {} lanzado y enganchado", s.pid));
                    return Ok(r);
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err("el proceso de terminales no arrancó a tiempo".into())
    })();
    match resultado {
        Ok(r) => {
            let _ = conexion.0.set(r);
        }
        Err(e) => crate::anotar(&format!("terminales: sin proceso aparte ({e}); van dentro de la app, como siempre")),
    }
}

#[cfg(all(test, windows))]
mod pruebas {
    use super::*;

    /// Un cliente de prueba: manda órdenes y lee avisos por la misma conexión.
    struct Probador {
        sale: TcpStream,
        avisos: std::sync::mpsc::Receiver<Aviso>,
        visto: Vec<Aviso>,
    }

    impl Probador {
        fn conectar(señas: &Señas, retener: bool) -> Probador {
            let flujo = TcpStream::connect(("127.0.0.1", señas.puerto)).unwrap();
            let lee = BufReader::new(crate::clon_sin_herencia(&flujo).unwrap());
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                for l in lee.lines() {
                    let Ok(l) = l else { break };
                    if let Ok(a) = serde_json::from_str::<Aviso>(&l) {
                        if tx.send(a).is_err() {
                            break;
                        }
                    }
                }
            });
            let mut p = Probador { sale: flujo, avisos: rx, visto: Vec::new() };
            p.mandar(&Orden::Hola { token: señas.token.clone(), version: VERSION, retener });
            p
        }
        fn mandar(&mut self, o: &Orden) {
            self.sale.write_all(linea(o).as_bytes()).unwrap();
        }
        /// Espera a un aviso que cumpla `cond`, guardando los demás.
        fn esperar(&mut self, cond: impl Fn(&Aviso) -> bool, ms: u64) -> Option<&Aviso> {
            let fin = Instant::now() + Duration::from_millis(ms);
            if let Some(i) = self.visto.iter().position(&cond) {
                return self.visto.get(i);
            }
            while Instant::now() < fin {
                if let Ok(a) = self.avisos.recv_timeout(Duration::from_millis(50)) {
                    let si = cond(&a);
                    self.visto.push(a);
                    if si {
                        return self.visto.last();
                    }
                }
            }
            None
        }
        /// Lo que hace la app al morir: la conexión se corta y ya. (Soltar el
        /// socket no basta: el hilo lector tiene otra copia y lo mantiene vivo.)
        fn caer(&mut self) {
            let _ = self.sale.shutdown(std::net::Shutdown::Both);
        }
        fn dicho(&self, id: u32) -> String {
            self.visto.iter().filter_map(|a| if let Aviso::Datos { id: i, texto } = a { (*i == id).then_some(texto.as_str()) } else { None }).collect()
        }
        /// Lo que dijo la terminal hasta que aparezca `aguja`; contesta al
        /// `ESC[6n` del ConPTY como lo haría xterm.
        fn hasta_que_diga(&mut self, id: u32, aguja: &str, ms: u64) -> bool {
            let fin = Instant::now() + Duration::from_millis(ms);
            let mut contestado = false;
            while Instant::now() < fin {
                if let Ok(a) = self.avisos.recv_timeout(Duration::from_millis(50)) {
                    self.visto.push(a);
                }
                let dicho = self.dicho(id);
                if !contestado && dicho.contains("\x1b[6n") {
                    self.mandar(&Orden::Escribir { id, texto: "\x1b[1;1R".into() });
                    contestado = true;
                }
                if dicho.contains(aguja) {
                    return true;
                }
            }
            false
        }
    }

    fn cmd(id: u32, eco: &str) -> Alta {
        Alta {
            id,
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            cols: 100,
            rows: 30,
            command: Some(vec!["cmd.exe".into(), "/q".into(), "/k".into(), format!("echo {eco}")]),
            env: None,
        }
    }

    fn servidor(tope: Duration) -> (Señas, std::thread::JoinHandle<Final>, PathBuf) {
        let dir = std::env::temp_dir().join(format!("adeorq-terminales-{}-{}", std::process::id(), token_nuevo().unwrap()));
        let s = Servidor::nuevo(&dir, "prueba", tope).unwrap();
        let señas = s.señas().clone();
        assert_eq!(serde_json::from_slice::<Señas>(&std::fs::read(ruta_de_señas(&dir, "prueba")).unwrap()).unwrap(), señas, "las señas en su fichero");
        (señas, std::thread::spawn(move || s.servir()), dir)
    }

    /// Lo de siempre por la conexión: abrir, que llegue lo que dice, escribirle,
    /// el historial, la lista, el tamaño, matarla y su fin; y despedirse lo
    /// cierra todo y borra las señas.
    #[test]
    fn una_terminal_entera_por_el_proceso() {
        let (señas, hilo, dir) = servidor(Duration::from_secs(60));
        let mut p = Probador::conectar(&señas, false);
        assert!(matches!(p.esperar(|a| matches!(a, Aviso::Hola { .. }), 3000), Some(Aviso::Hola { terminales: 0, .. })));
        p.mandar(&Orden::Crear { n: 1, alta: cmd(3, "proceso-listo") });
        assert!(p.esperar(|a| matches!(a, Aviso::Ok { n: 1, .. }), 8000).is_some(), "no contestó al crear");
        assert!(p.hasta_que_diga(3, "proceso-listo", 8000), "no llegó lo que dice: {:?}", p.dicho(3));
        p.mandar(&Orden::Escribir { id: 3, texto: "echo eco-%COMSPEC:~0,0%remoto\r".into() });
        assert!(p.hasta_que_diga(3, "eco-remoto", 8000), "lo escrito no llegó");
        p.mandar(&Orden::Historial { n: 2, id: 3, bytes: None });
        assert!(matches!(p.esperar(|a| matches!(a, Aviso::Ok { n: 2, .. }), 3000), Some(Aviso::Ok { texto: Some(t), .. }) if t.contains("eco-remoto")));
        p.mandar(&Orden::Tamano { n: 3, id: 3, cols: 120, rows: 40 });
        assert!(p.esperar(|a| matches!(a, Aviso::Ok { n: 3, .. }), 3000).is_some());
        p.mandar(&Orden::Listar { n: 4 });
        match p.esperar(|a| matches!(a, Aviso::Fichas { n: 4, .. }), 3000) {
            Some(Aviso::Fichas { fichas, .. }) => {
                assert_eq!(fichas.len(), 1);
                assert_eq!((fichas[0].id, fichas[0].tamano.as_deref()), (3, Some("120x40")));
            }
            otro => panic!("sin lista: {otro:?}"),
        }
        p.mandar(&Orden::Historial { n: 5, id: 9, bytes: None });
        assert!(matches!(p.esperar(|a| matches!(a, Aviso::Error { n: 5, .. }), 3000), Some(Aviso::Error { error, .. }) if error == pty::NO_ESTA));
        p.mandar(&Orden::Matar { n: 6, id: 3 });
        assert!(p.esperar(|a| matches!(a, Aviso::Fin { id: 3, .. }), 8000).is_some(), "matarla no avisó del fin");
        p.mandar(&Orden::Crear { n: 7, alta: cmd(4, "otra") });
        assert!(p.esperar(|a| matches!(a, Aviso::Ok { n: 7, .. }), 8000).is_some());
        p.mandar(&Orden::Adios);
        assert_eq!(hilo.join().unwrap(), Final::Despedida);
        assert!(!ruta_de_señas(&dir, "prueba").exists(), "al irse borra sus señas");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Sin la contraseña no se engancha nadie, y uno más mientras hay otro, tampoco.
    #[test]
    fn sin_contraseña_no_y_de_uno_en_uno() {
        let (señas, hilo, dir) = servidor(Duration::from_secs(60));
        let mut malo = Probador::conectar(&Señas { token: "no-es".into(), ..señas.clone() }, false);
        assert!(matches!(malo.esperar(|a| matches!(a, Aviso::Error { .. }), 3000), Some(Aviso::Error { error, .. }) if error == "no"));
        let mut bueno = Probador::conectar(&señas, false);
        assert!(bueno.esperar(|a| matches!(a, Aviso::Hola { .. }), 3000).is_some());
        std::thread::sleep(Duration::from_millis(200));
        let mut segundo = Probador::conectar(&señas, false);
        assert!(matches!(segundo.esperar(|a| matches!(a, Aviso::Error { .. }), 3000), Some(Aviso::Error { error, .. }) if error.contains("ya hay")));
        // Sin `retener`, irse sin despedirse lo cierra todo, como hoy.
        bueno.caer();
        assert_eq!(hilo.join().unwrap(), Final::SinRetener);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Lo que pidió Munir: si la app se cae, sus terminales aguantan, y la que
    /// vuelve las encuentra con lo que dijeron mientras tanto. Sin `retener`, se
    /// matan como hoy.
    #[test]
    fn si_la_app_se_cae_aguantan_y_la_siguiente_las_encuentra() {
        let (señas, hilo, dir) = servidor(Duration::from_secs(60));
        {
            let mut p = Probador::conectar(&señas, true);
            p.mandar(&Orden::Crear { n: 1, alta: cmd(5, "antes-de-caer") });
            assert!(p.hasta_que_diga(5, "antes-de-caer", 8000));
            p.caer();
        }
        std::thread::sleep(Duration::from_millis(400));
        let mut vuelta = Probador::conectar(&señas, true);
        assert!(matches!(vuelta.esperar(|a| matches!(a, Aviso::Hola { .. }), 3000), Some(Aviso::Hola { terminales: 1, .. })), "la terminal no aguantó");
        vuelta.mandar(&Orden::Historial { n: 2, id: 5, bytes: None });
        assert!(matches!(vuelta.esperar(|a| matches!(a, Aviso::Ok { n: 2, .. }), 3000), Some(Aviso::Ok { texto: Some(t), .. }) if t.contains("antes-de-caer")));
        vuelta.mandar(&Orden::Escribir { id: 5, texto: "echo sigue-%COMSPEC:~0,0%viva\r".into() });
        assert!(vuelta.hasta_que_diga(5, "sigue-viva", 8000), "no contesta después de la caída");
        vuelta.mandar(&Orden::Adios);
        assert_eq!(hilo.join().unwrap(), Final::Despedida);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// La app de verdad como cliente (`Remoto`): abre, su espejo lleva lo que
    /// dice la terminal y sus modos sin preguntar al proceso, la app se cae y la
    /// siguiente se engancha y la encuentra con su historial; y despedirse cierra.
    #[test]
    fn la_app_como_cliente_y_su_espejo() {
        #[derive(Default)]
        struct Libreta {
            datos: Mutex<String>,
            fines: Mutex<Vec<u32>>,
        }
        struct Salidita(Arc<Libreta>);
        impl Salida for Salidita {
            fn datos(&self, _id: u32, t: String) {
                self.0.datos.lock().unwrap().push_str(&t);
            }
            fn fin(&self, id: u32, _c: Option<u32>) {
                self.0.fines.lock().unwrap().push(id);
            }
            fn mudo(&self, _id: u32) {}
        }
        let hasta = |c: &dyn Fn() -> bool, ms: u64| {
            let fin = Instant::now() + Duration::from_millis(ms);
            while Instant::now() < fin && !c() {
                std::thread::sleep(Duration::from_millis(25));
            }
            c()
        };
        let (señas, hilo, dir) = servidor(Duration::from_secs(60));
        let libreta = Arc::new(Libreta::default());
        let r = Remoto::conectar(&señas, Arc::new(Salidita(libreta.clone()))).expect("no se enganchó");
        r.crear(cmd(2, "cliente-listo")).expect("no abrió");
        assert!(hasta(&|| libreta.datos.lock().unwrap().contains("\x1b[6n"), 8000));
        r.escribir(2, b"\x1b[1;1R".to_vec()).unwrap();
        assert!(hasta(&|| libreta.datos.lock().unwrap().contains("cliente-listo"), 8000), "no llegó a la salida");
        assert!(r.historial(2, None).unwrap().contains("cliente-listo"), "el espejo no lleva el historial");
        assert!(r.fichas()[0].pid.is_some(), "el espejo no sabe el pid");
        r.tamano(2, 120, 40).unwrap();
        assert_eq!(r.fichas()[0].tamano.as_deref(), Some("120x40"));
        assert_eq!(r.escribir(9, vec![]).unwrap_err(), pty::NO_ESTA);
        // El pegado entre corchetes lo apunta el espejo leyendo lo que pasa.
        r.escribir(2, b"echo \x1b[?2004h\r".to_vec()).unwrap();

        // La app se cae: la conexión se corta sin despedida, y para ella sus
        // terminales se acaban (no las ve más). Para el proceso, no.
        r.cortar();
        assert!(hasta(&|| libreta.fines.lock().unwrap().contains(&2), 3000), "la app no las dio por cerradas al cortarse");

        // Como `arrancar`: el proceso puede tardar un poco en darse cuenta de
        // que la de antes se fue, y mientras tanto dice «ya hay una app».
        let libreta2 = Arc::new(Libreta::default());
        let fin = Instant::now() + Duration::from_secs(5);
        let r2 = loop {
            match Remoto::conectar(&señas, Arc::new(Salidita(libreta2.clone()))) {
                Ok(r) => break r,
                Err(e) if Instant::now() < fin => {
                    assert!(e.contains("ya hay"), "{e}");
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => panic!("no se reenganchó: {e}"),
            }
        };
        assert_eq!(r2.fichas().iter().map(|f| f.id).collect::<Vec<_>>(), [2], "no encontró la terminal viva");
        assert!(r2.historial(2, None).unwrap().contains("cliente-listo"), "la vuelta no trae lo que dijo antes");
        r2.escribir(2, b"echo vuelta-%COMSPEC:~0,0%ok\r".to_vec()).unwrap();
        assert!(hasta(&|| libreta2.datos.lock().unwrap().contains("vuelta-ok"), 8000), "no contesta tras volver");
        assert!(r2.historial(2, None).unwrap().contains("vuelta-ok"));
        r2.adios();
        assert_eq!(hilo.join().unwrap(), Final::Despedida);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// El binario de verdad, como lo lanza la app (`lanzar`): `adeorq.exe
    /// --terminales` suelto, con su carpeta de datos aparte para no tocar la de
    /// Munir. La app se cae y se reengancha; y la red: matar el PROCESO a la
    /// fuerza se lleva sus terminales (el corral), que ningún agente se quede
    /// suelto gastando cuota.
    ///
    ///   cargo build --manifest-path src-tauri/Cargo.toml
    ///   cargo test --manifest-path src-tauri/Cargo.toml --lib proceso_de_verdad -- --ignored --nocapture
    #[test]
    #[ignore]
    fn proceso_de_verdad() {
        let exe = std::env::current_exe().unwrap().parent().unwrap().parent().unwrap().join("adeorq.exe");
        assert!(exe.exists(), "falta {}: cargo build antes", exe.display());
        let casa = std::env::temp_dir().join(format!("adeorq-lab-terminales-{}", std::process::id()));
        let canal = format!("lab-{}", std::process::id());
        let _ = std::fs::remove_dir_all(&casa);
        std::fs::create_dir_all(&casa).unwrap();
        let lanzar = || {
            let mut c = std::process::Command::new(&exe);
            c.arg("--terminales").env("ADEORQ_TERMINALES_CANAL", &canal).env("LOCALAPPDATA", &casa);
            c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0000_0008 | 0x0000_0200);
            c.spawn().expect("no arrancó")
        };
        let señas_de = || {
            let ruta = ruta_de_señas(&casa.join("Adeorq").join("terminales"), &canal);
            let fin = Instant::now() + Duration::from_secs(10);
            loop {
                if let Some(s) = std::fs::read(&ruta).ok().and_then(|b| serde_json::from_slice::<Señas>(&b).ok()) {
                    return s;
                }
                assert!(Instant::now() < fin, "no dejó sus señas en {}", ruta.display());
                std::thread::sleep(Duration::from_millis(100));
            }
        };
        let vivo = |pid: u32| {
            let o = std::process::Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
            String::from_utf8_lossy(&o.stdout).contains(&pid.to_string())
        };
        struct Nada;
        impl Salida for Nada {
            fn datos(&self, _: u32, _: String) {}
            fn fin(&self, _: u32, _: Option<u32>) {}
            fn mudo(&self, _: u32) {}
        }
        let ping = |id: u32| Alta { command: Some(vec!["ping.exe".into(), "-n".into(), "120".into(), "127.0.0.1".into()]), ..cmd(id, "") };

        // 1. Lanzado suelto, se engancha, abre y la app se cae: la terminal aguanta.
        let mut proceso = lanzar();
        let señas = señas_de();
        assert_eq!(señas.pid, proceso.id());
        let r = Remoto::conectar(&señas, Arc::new(Nada)).expect("no se enganchó al de verdad");
        r.crear(ping(1)).unwrap();
        let hijo = r.fichas()[0].pid.expect("sin pid");
        assert!(vivo(hijo));
        r.cortar();
        std::thread::sleep(Duration::from_millis(800));
        assert!(vivo(proceso.id()) && vivo(hijo), "la caída de la app se llevó la terminal");
        let fin = Instant::now() + Duration::from_secs(5);
        let r2 = loop {
            match Remoto::conectar(&señas, Arc::new(Nada)) {
                Ok(r) => break r,
                Err(_) if Instant::now() < fin => std::thread::sleep(Duration::from_millis(100)),
                Err(e) => panic!("{e}"),
            }
        };
        assert_eq!(r2.fichas()[0].pid, Some(hijo), "la vuelta no la encontró");

        // 2. Despedirse: el proceso mata a todas y se va.
        r2.adios();
        let fin = Instant::now() + Duration::from_secs(10);
        while proceso.try_wait().unwrap().is_none() {
            assert!(Instant::now() < fin, "no se fue tras la despedida");
            std::thread::sleep(Duration::from_millis(100));
        }
        std::thread::sleep(Duration::from_millis(500));
        assert!(!vivo(hijo), "la despedida dejó viva la terminal");

        // 3. La red: matar el proceso a la fuerza se lleva sus terminales.
        let mut proceso = lanzar();
        let señas = señas_de_nuevas(&casa, &canal, proceso.id());
        let r = Remoto::conectar(&señas, Arc::new(Nada)).unwrap();
        r.crear(ping(1)).unwrap();
        let hijo = r.fichas()[0].pid.unwrap();
        proceso.kill().unwrap();
        let _ = proceso.wait();
        std::thread::sleep(Duration::from_millis(800));
        assert!(!vivo(hijo), "matar el proceso de terminales dejó un agente suelto: el corral no está");
        let _ = std::fs::remove_dir_all(&casa);
    }

    /// Las señas de un proceso concreto (el fichero puede traer aún las del anterior).
    fn señas_de_nuevas(casa: &Path, canal: &str, pid: u32) -> Señas {
        let ruta = ruta_de_señas(&casa.join("Adeorq").join("terminales"), canal);
        let fin = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(s) = std::fs::read(&ruta).ok().and_then(|b| serde_json::from_slice::<Señas>(&b).ok()).filter(|s| s.pid == pid) {
                return s;
            }
            assert!(Instant::now() < fin, "el proceso {pid} no dejó sus señas");
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    /// Abrir y matar terminales no puede romper los sockets de al lado. En el
    /// proceso de terminales viven juntos, y en Windows sockets y procesos
    /// comparten la tabla de identificadores: un cierre de más se llevaría lo
    /// que tenga ese número en ese momento, por ejemplo la conexión con la app.
    #[test]
    #[ignore]
    fn abrir_y_matar_no_rompe_un_socket() {
        let escucha = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        // Sockets que nacen MIENTRAS se abren y matan terminales: un cierre de
        // más solo pisa lo que ocupa un número recién liberado.
        let nacen = std::thread::spawn(move || {
            let mut socks = Vec::new();
            for _ in 0..120 {
                let c = TcpStream::connect(("127.0.0.1", puerto)).unwrap();
                let (s, _) = escucha.accept().unwrap();
                socks.push((c, s));
                std::thread::sleep(Duration::from_millis(15));
            }
            socks
        });
        struct Nada;
        impl Salida for Nada {
            fn datos(&self, _: u32, _: String) {}
            fn fin(&self, _: u32, _: Option<u32>) {}
            fn mudo(&self, _: u32) {}
        }
        let mapa: Mapa = Default::default();
        let mut hilos = Vec::new();
        for k in 0..4u32 {
            let mapa = mapa.clone();
            hilos.push(std::thread::spawn(move || {
                for i in 0..15u32 {
                    let id = k * 100 + i;
                    let alta = Alta { command: Some(vec!["ping.exe".into(), "-n".into(), "30".into(), "127.0.0.1".into()]), ..cmd(id, "") };
                    pty::abrir(&mapa, alta, Arc::new(Nada)).unwrap();
                    std::thread::sleep(Duration::from_millis(30));
                    pty::matar(&mapa, id);
                }
            }));
        }
        for h in hilos {
            h.join().unwrap();
        }
        let socks = nacen.join().unwrap();
        std::thread::sleep(Duration::from_millis(1500));
        let rotos: Vec<usize> = socks
            .iter()
            .enumerate()
            .filter(|(_, (c, s))| c.peer_addr().is_err() || s.peer_addr().is_err() || c.try_clone().and_then(|mut x| x.write_all(b"x")).is_err())
            .map(|(i, _)| i)
            .collect();
        assert!(rotos.is_empty(), "abrir y matar terminales rompió {} de {} sockets: {rotos:?}", rotos.len(), socks.len());
    }

    /// Ningún socket nuestro se hereda: si no, cada terminal que se abre se
    /// lleva una copia de la conexión con la app, y al morir esa terminal la
    /// conexión queda tocada sin que el otro lado se entere. `try_clone` a pelo
    /// SÍ da una copia heredable (medido el 2026-10-11); por eso existe
    /// `crate::clon_sin_herencia`, y aquí se fijan las dos cosas.
    #[test]
    fn los_sockets_no_se_heredan() {
        use std::os::windows::io::AsRawSocket;
        use windows_sys::Win32::Foundation::{GetHandleInformation, HANDLE_FLAG_INHERIT};
        let escucha = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let c = TcpStream::connect_timeout(&escucha.local_addr().unwrap(), Duration::from_secs(2)).unwrap();
        let (s, _) = escucha.accept().unwrap();
        let hereda = |raw: u64| {
            let mut f = 0u32;
            unsafe { GetHandleInformation(raw as _, &mut f) };
            f & HANDLE_FLAG_INHERIT != 0
        };
        let a_pelo = c.try_clone().unwrap();
        assert!(hereda(a_pelo.as_raw_socket()), "si try_clone deja de dar copias heredables, clon_sin_herencia sobra");
        let cuales: Vec<(&str, bool)> = vec![
            ("escucha", hereda(escucha.as_raw_socket())),
            ("cliente", hereda(c.as_raw_socket())),
            ("aceptado", hereda(s.as_raw_socket())),
            ("clon sin herencia", hereda(crate::clon_sin_herencia(&c).unwrap().as_raw_socket())),
        ];
        assert!(cuales.iter().all(|(_, h)| !h), "hay sockets heredables: {cuales:?}");
    }

    /// ¿Desmontar una terminal cierra un identificador que ya no es suyo? Tras
    /// cada una se crean centinelas (eventos), que se quedan con los números
    /// recién liberados, y se mira si alguien los cierra por detrás.
    #[test]
    #[ignore]
    fn desmontar_no_cierra_lo_ajeno() {
        use windows_sys::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
        struct Fin(Arc<Mutex<bool>>);
        impl Salida for Fin {
            fn datos(&self, _: u32, _: String) {}
            fn fin(&self, _: u32, _: Option<u32>) {
                *self.0.lock().unwrap() = true;
            }
            fn mudo(&self, _: u32) {}
        }
        let mapa: Mapa = Default::default();
        let mut rotos = 0;
        let mut centinelas = Vec::new();
        for id in 0..25u32 {
            let acabo = Arc::new(Mutex::new(false));
            let alta = Alta { command: Some(vec!["ping.exe".into(), "-n".into(), "30".into(), "127.0.0.1".into()]), ..cmd(id, "") };
            pty::abrir(&mapa, alta, Arc::new(Fin(acabo.clone()))).unwrap();
            std::thread::sleep(Duration::from_millis(80));
            pty::matar(&mapa, id);
            let t = Instant::now();
            while !*acabo.lock().unwrap() && t.elapsed() < Duration::from_secs(5) {
                std::thread::sleep(Duration::from_millis(5));
            }
            for _ in 0..30 {
                let h = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
                centinelas.push(h as usize);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        for h in &centinelas {
            // WAIT_FAILED (0xFFFFFFFF) es que ese identificador ya no es un evento vivo.
            if unsafe { WaitForSingleObject(*h as _, 0) } == 0xFFFF_FFFF {
                rotos += 1;
            }
        }
        assert_eq!(rotos, 0, "desmontar terminales cerró {rotos} de {} identificadores ajenos", centinelas.len());
    }

    /// El motor corre desde una copia fuera de la instalación, una por versión:
    /// copiar una vez, no volver a copiar si ya está, y borrar las de versiones
    /// viejas.
    #[test]
    fn la_copia_del_motor() {
        let base = std::env::temp_dir().join(format!("adeorq-motor-{}-{}", std::process::id(), token_nuevo().unwrap()));
        let exe = base.join("instalado").join("adeorq.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, b"un ejecutable de mentira").unwrap();
        let motor = base.join("motor");
        std::fs::create_dir_all(motor.join("0.9.100")).unwrap();
        std::fs::write(motor.join("0.9.100").join("adeorq.exe"), b"viejo").unwrap();

        let copia = copiar_motor(&exe, &motor, "0.9.192").unwrap();
        assert_eq!(copia, motor.join("0.9.192").join("adeorq.exe"));
        assert_eq!(std::fs::read(&copia).unwrap(), b"un ejecutable de mentira");
        assert!(!motor.join("0.9.100").exists(), "la copia de otra versión sobra");
        let antes = std::fs::metadata(&copia).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(copiar_motor(&exe, &motor, "0.9.192").unwrap(), copia);
        assert_eq!(std::fs::metadata(&copia).unwrap().modified().unwrap(), antes, "si ya estaba, no se vuelve a copiar");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Lo que eligió Munir para actualizar: la app se va sin despedirse, las
    /// terminales aguantan y la versión nueva las recoge. Cerrar de verdad sí
    /// se despide.
    #[test]
    fn al_actualizar_no_se_despide() {
        struct Nada;
        impl Salida for Nada {
            fn datos(&self, _: u32, _: String) {}
            fn fin(&self, _: u32, _: Option<u32>) {}
            fn mudo(&self, _: u32) {}
        }
        let (señas, hilo, dir) = servidor(Duration::from_secs(60));
        let r = Remoto::conectar(&señas, Arc::new(Nada)).unwrap();
        r.crear(Alta { command: Some(vec!["ping.exe".into(), "-n".into(), "60".into(), "127.0.0.1".into()]), ..cmd(3, "") }).unwrap();
        POR_ACTUALIZAR.store(true, std::sync::atomic::Ordering::Relaxed);
        al_cerrar_la_app(&r);
        POR_ACTUALIZAR.store(false, std::sync::atomic::Ordering::Relaxed);
        let fin = Instant::now() + Duration::from_secs(5);
        let nueva = loop {
            match Remoto::conectar(&señas, Arc::new(Nada)) {
                Ok(n) => break n,
                Err(_) if Instant::now() < fin => std::thread::sleep(Duration::from_millis(100)),
                Err(e) => panic!("la versión nueva no se enganchó: {e}"),
            }
        };
        assert_eq!(nueva.fichas().iter().map(|f| f.id).collect::<Vec<_>>(), [3], "no aguantó la actualización");
        al_cerrar_la_app(&nueva);
        assert_eq!(hilo.join().unwrap(), Final::Despedida, "cerrar de verdad tiene que despedirse");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Y si nadie vuelve a tiempo, se cierran todas: un agente sin ventana no
    /// puede quedarse gastando cuota para siempre.
    #[test]
    fn si_nadie_vuelve_a_tiempo_se_cierran() {
        let (señas, hilo, dir) = servidor(Duration::from_millis(800));
        {
            let mut p = Probador::conectar(&señas, true);
            p.mandar(&Orden::Crear {
                n: 1,
                alta: Alta { command: Some(vec!["ping.exe".into(), "-n".into(), "60".into(), "127.0.0.1".into()]), ..cmd(6, "") },
            });
            assert!(p.esperar(|a| matches!(a, Aviso::Ok { n: 1, .. }), 8000).is_some());
            p.caer();
        }
        let t = Instant::now();
        assert_eq!(hilo.join().unwrap(), Final::Plazo);
        assert!(t.elapsed() < Duration::from_secs(10));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
