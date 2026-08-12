# promo — el vídeo de Adeorq

Pieza de promoción hecha con [Remotion](https://remotion.dev): un vídeo escrito en React,
así que se cambia editando un archivo y se vuelve a renderizar, sin abrir ningún editor de
vídeo ni volver a grabar nada.

```bash
cd promo
pnpm install          # tiene su propio pnpm-workspace.yaml, no cuelga del repo
pnpm ver              # abre el estudio: se ve moverse y se puede recorrer con el ratón
pnpm render           # MP4 1920x1080  -> out/adeorq.mp4
pnpm vertical         # MP4 1080x1920  -> out/adeorq-vertical.mp4  (Instagram, TikTok)
pnpm gif              # GIF corto      -> out/adeorq.gif           (ver el aviso de abajo)
```

## Qué tocar

**`src/guion.ts` y nada más.** Ahí está la lista de escenas: qué captura sale, qué frase la
acompaña, cuánto dura y si la ventana se acerca o se aleja. La duración del vídeo sale de
sumar esa lista, así que añadir o quitar una escena no obliga a tocar ningún otro archivo.

Las capturas viven en `public/pantallas/`. Para cambiarlas, se sustituye el archivo por otro
con **el mismo nombre**: el marco toma la proporción de la imagen que le pongas, sea cual
sea, así que no hay medidas que ajustar.

`src/casa.ts` tiene los colores y las fuentes, copiados de donde viven de verdad
(`src/App.css` y `web/fonts`). Si cambia la identidad de la app, ese es el único archivo a
tocar aquí.

## Licencia de Remotion

**Gratis para un individuo, también para uso comercial**, y para organizaciones de hasta 3
empleados. Si algún día esto lo usa una empresa más grande (la Fundación, por ejemplo), hace
falta comprar una licencia de compañía. Está comprobado contra su `LICENSE.md` el
2026-08-12.

## Tres cosas que ya costaron un rato, para no repetirlas

1. **TypeScript se queda en la 5.x.** La 7 es el compilador nuevo y cambió la API de JS que
   usa el empaquetador de Remotion: `typescript.sys` sale `undefined` y el render se cae
   leyendo el `tsconfig`, con un error que no menciona la versión por ninguna parte.
2. **Las opciones de un códec concreto no van en `remotion.config.ts`.** El `setCrf` global
   se le aplicaba también al GIF, que no lo admite, y tiraba el render con un `TypeError`
   que tampoco señalaba al archivo culpable. El CRF va en el script de `render`.
3. **`loadFont` va dentro de un `if (typeof window !== "undefined")`.** Remotion evalúa
   `Root.tsx` en Node para enterarse de qué composiciones hay, y allí no existe `FontFace`.

## El GIF pesa, y es del formato

`pnpm gif` saca la versión corta (tres vistas, unos 20 segundos) a 720 px y aun así **pesa
unos 20 MB**. No es un ajuste mal puesto: un GIF son 256 colores sin compresión entre
fotogramas, y veinte segundos de capturas de pantalla no bajan de ahí por mucho que se
recorte. La pieza entera en GIF pasa de 33 MB.

**Para el README, usa el MP4.** GitHub reproduce vídeo en Markdown, pero solo desde sus
propios servidores: hay que **arrastrar `out/adeorq.mp4` a un comentario de un issue** (o al
editor del README en la web), copiar la URL de `user-attachments` que genera y pegar esa URL
en el README. Son veinte segundos y queda un reproductor de verdad, con sonido si algún día
lo lleva, en vez de un GIF de 20 MB que tarda en cargar.

## Pendiente

Las capturas de `public/pantallas/` son **las viejas de la web y enseñan datos reales de
Munir**: nombres de sus proyectos privados, sus horarios y trozos de conversación (auditado
el 2026-08-11). Sirven para ver la pieza moverse; **no para publicar**. En cuanto haya
capturas nuevas se sustituyen por el mismo nombre y el vídeo sale solo.
