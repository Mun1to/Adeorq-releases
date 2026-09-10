//! Cuánto se queda quieta la ventana en cada comando.
//!
//! Un comando de Tauri sin `async` corre en el hilo de la ventana: mientras
//! dura, la app entera está congelada. Eso ya está escrito en `AGENTS.md`, pero
//! escrito no dice CUÁNTO, y sin el cuánto no se puede decidir cuáles merecen
//! salir de ahí. Este módulo es el banco que pone el número, y el comprobador
//! (`scripts/hilo-check.mjs`) es el que impide que entre uno nuevo.
//!
//! El de medir se lanza a mano porque toca el disco de verdad de esta máquina:
//!
//! ```text
//! cargo test --lib hilo -- --ignored --nocapture
//! ```

/// Los comandos que se quedan en el hilo de la ventana A PROPÓSITO.
///
/// No es una lista de pendientes: cada uno tiene una razón para no salir de
/// ahí, y `scripts/hilo-check.mjs` lee justo esta tabla para no volver a
/// proponerlos. Vive en el código y no solo en el script para que un cambio en
/// uno de estos ficheros pase por delante del motivo.
pub const EN_EL_HILO_DE_LA_VENTANA: &[(&str, &str)] = &[
    ("pty_write", "paralelizarlo podría reordenar las teclas"),
    ("pty_historial", "solo copia un buffer que ya está en memoria"),
    ("mcp_reply", "solo suelta un valor en un cerrojo"),
    ("forget_project_icons", "solo vacía un mapa en memoria"),
    ("datos_panel", "solo lee un cerrojo que ya está en memoria"),
    ("raton_en_pantalla", "pregunta por la ventana, y eso es del hilo principal"),
    ("devolver_panel", "cierra una ventana, y eso es del hilo principal"),
    ("media_set_volume", "COM de Windows, que se inicializa por hilo"),
    ("secretos_donde", "devuelve un texto fijo"),
    ("inbox_where", "arma una ruta, no la abre"),
];

#[cfg(test)]
mod tests {
    use std::time::Instant;

    /// Lo peor de tres pasadas, no la media: la ventana se congela lo que dure
    /// la PEOR, y la primera además paga la caché de disco del sistema, que es
    /// justo el caso del arranque de la app.
    fn medir<T>(nombre: &str, f: impl Fn() -> T) -> f64 {
        let mut peor = 0u128;
        for _ in 0..3 {
            let t = Instant::now();
            let salida = f();
            peor = peor.max(t.elapsed().as_micros());
            drop(salida);
        }
        let ms = peor as f64 / 1000.0;
        println!("{nombre:24} {ms:>9.2} ms");
        ms
    }

    #[test]
    #[ignore = "mide el disco real de esta máquina; se lanza a mano"]
    fn cuanto_bloquea_cada_comando() {
        println!("\nLo que tarda cada comando, o sea lo que la ventana no responde:\n");

        let pesados = [
            medir("list_projects", || {
                crate::pty::list_projects(None, None, None)
            }),
            medir("detect_clis", || crate::accounts::detect_clis(vec![])),
            medir("list_account_dirs", crate::accounts::list_account_dirs),
            medir("find_agy", crate::sessions::find_agy),
            medir("note_list", crate::notes::note_list),
            medir("read_inbox", crate::inbox::read_inbox),
            medir("read_board", crate::manage::read_board),
            medir("gasto_leer", crate::chat::gasto_leer),
        ];

        let total: f64 = pesados.iter().sum();
        println!("\nsuma de los medidos: {total:.2} ms");
        println!(
            "de los que NO se miden aquí, los caros son los que lanzan un .exe\n\
             (open_in_antigravity, create_project): ahí el coste es arrancar el\n\
             programa, no leer el disco.\n"
        );
    }

    /// La tabla de excepciones no vale de nada si el script y el código no
    /// hablan de los mismos comandos.
    #[test]
    fn el_script_y_el_codigo_listan_las_mismas_excepciones() {
        let script = include_str!("../../scripts/hilo-check.mjs");
        for (nombre, _) in super::EN_EL_HILO_DE_LA_VENTANA {
            assert!(
                script.contains(nombre),
                "«{nombre}» está exento aquí y el comprobador no lo sabe"
            );
        }
    }
}
