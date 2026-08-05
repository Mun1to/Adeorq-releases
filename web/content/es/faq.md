# Preguntas · español

Claves `data-content`. Van en `sections/faq.html`. Seis preguntas, incluidas las incómodas: si
las quitamos, el resto de la web deja de ser creíble.

## faq.eyebrow **[nueva]**
Preguntas

## faq.titulo
Lo que suelen preguntar.

## faq.lead
Las respuestas cortas están aquí. Si te falta una, dilo y se añade.

---

## faq.0.p
¿Necesito una API key o pagar algo aparte?

## faq.0.r
No. Adeorq usa el CLI que ya tienes instalado y la sesión que ya tienes iniciada en él. No pide
claves, no guarda credenciales y no manda tu código a ningún servidor nuestro. Lo que gastes de
cuota lo gastas igual que si escribieras en la terminal a mano.

## faq.1.p
¿Funciona con algo que no sea Claude Code?

## faq.1.r
Las terminales son reales, así que dentro puedes ejecutar lo que quieras: Antigravity, Codex,
Gemini o tu propio script. Lo que hoy está afinado para Claude Code es la lectura de sesiones,
porque es el único que las guarda en archivos legibles. Los demás están en la lista de lo que
viene.

## faq.2.p
¿Por qué Windows me avisa al instalar?

## faq.2.r
Porque el instalador todavía no tiene certificado de editor, y SmartScreen desconfía por
defecto de lo que se ha descargado poco. Las actualizaciones sí van firmadas y verificadas por
la app. Antes de ejecutar nada, comprueba que el archivo viene de nuestra página de releases en
GitHub y que el nombre es `Adeorq_<versión>_x64-setup.exe`.

## faq.3.p
¿Hay versión para macOS o Linux?

## faq.3.r
Hoy no. Las terminales se apoyan en ConPTY, que es de Windows, así que portarlo es trabajo de
verdad y no una casilla que marcar. Si te interesa, dilo: eso es lo que hará que se priorice.

## faq.4.p
¿Cuánto ocupa y cuánto consume?

## faq.4.r
El instalador pesa 3,5 MB. Es una app nativa hecha con Tauri, no lleva un navegador entero
empaquetado dentro, así que arranca al instante y en reposo casi no se nota. Lo que consuma de
más será lo que consuman tus agentes y tus terminales, que es lo mismo que ya consumen ahora.

## faq.5.p
¿Mis datos salen del ordenador?

## faq.5.r
Solo lo que ya salía por tu CLI. Adeorq lee archivos locales para enseñarte tus proyectos y tus
sesiones, y pregunta si hay una versión nueva. Nada más. Además trae un modo emisión que tapa
rutas, nombres y claves para cuando compartes pantalla o retransmites.
