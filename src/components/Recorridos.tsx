// Los dos recorridos de la ventana: el de la bienvenida, que enseña para qué es
// cada parte, y el de lo nuevo de cada versión («en cada actualización nueva un
// tour nuevo de las cosas nuevas», Munir, 2026-11-20). Los dos son `Tour.tsx`;
// aquí se decide cuál toca y cuándo. Qué hay de nuevo y qué se ha visto lo lleva
// `lib/novedades.ts`.
//
// Cómo lo quiso (A1 y B1 del 2026-11-20, entre tres formas con su foto): al abrir
// una versión nueva, Adeo avisa y PREGUNTA, con un bocadillo que le sale de la
// barra de arriba y no tapa nada; solo si dices que sí empieza el recorrido. Y si
// te saltaste varias versiones, se enseña todo lo que te perdiste. Las otras dos
// formas eran que el recorrido saliera solo, tapando la ventana al volver de
// actualizar, y una ventana con la lista.

import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT, type Lang } from "../lib/i18n";
import {
  AJUSTES_IR,
  ANTES_DEL_RECORRIDO,
  leerVista,
  marcarVista,
  pendientes,
  SECCION_AJUSTES,
  textoDe,
  ultimaConNovedades,
  VER_NOVEDADES,
  type Pendiente,
} from "../lib/novedades";
import { NOVEDADES } from "../lib/novedadesDatos";
import { leerPerfil, tocarPerfil } from "../lib/perfil";
import type { View } from "../lib/vistas";
import Tour, { type Parada } from "./Tour";

/** Lo que espera a que la ventana esté pintada antes de ofrecer lo nuevo: al
    arrancar todo se mueve, y un bocadillo que nace entonces se coloca mal. */
const TRAS_ARRANCAR_MS = 1800;

const aParada = (p: Pendiente, lang: Lang): Parada => {
  const tx = textoDe(p.novedad, lang);
  return {
    donde: p.novedad.donde ?? [],
    titulo: tx.titulo,
    texto: tx.texto,
    vista: p.novedad.vista,
    ajustes: p.novedad.ajustes,
    bloque: p.novedad.bloque,
    version: p.version,
  };
};

/** Adeo te avisa y te pregunta: un bocadillo que le sale a la mascota de la
    barra de arriba, con su piquito apuntándole. */
function AvisoNovedades({ ofrecidas, onSi, onNo }: { ofrecidas: Pendiente[]; onSi: () => void; onNo: () => void }) {
  const { t } = useT();
  const [sitio, setSitio] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const r = document.querySelector(".campana")?.getBoundingClientRect();
      setSitio(r ? { x: Math.max(8, r.left), y: r.bottom + 12 } : { x: 16, y: 64 });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  if (!sitio) return null;
  const n = ofrecidas.length;
  const versiones = new Set(ofrecidas.map((p) => p.version));
  const v = ofrecidas[ofrecidas.length - 1]?.version ?? "";
  const titulo =
    versiones.size > 1
      ? t("Desde la última vez hay {n} cosas nuevas", { n })
      : n === 1
        ? t("La {v} trae una cosa nueva", { v })
        : t("La {v} trae {n} cosas nuevas", { v, n });
  return createPortal(
    <div className="novedades-aviso" role="dialog" aria-label={titulo} style={{ left: sitio.x, top: sitio.y }}>
      <h3>{titulo}</h3>
      <p>
        {n === 1
          ? t("¿Te la enseño? Te llevo hasta ella y la puedes probar.")
          : t("¿Te las enseño? Te llevo a cada una y la puedes probar.")}
      </p>
      <div className="novedades-aviso-pie">
        <button className="np-btn" onClick={() => onSi()}>
          {n === 1 ? t("Enséñamela") : t("Enséñamelas")}
        </button>
        <button className="mini" onClick={() => onNo()}>
          {t("Ahora no")}
        </button>
      </div>
      <small>{t("Lo de la {v} lo vuelves a ver cuando quieras en Ajustes › Ayuda.", { v })}</small>
    </div>,
    document.body,
  );
}

export default function Recorridos({
  bienvenida,
  onBienvenidaCerrada,
  ir,
}: {
  /** El de la bienvenida está abierto (lo abre la bienvenida o Ajustes). */
  bienvenida: boolean;
  onBienvenidaCerrada: () => void;
  /** Cambia de pestaña (`setView` de `App`). */
  ir: (v: View) => void;
}) {
  const { lang } = useT();
  const [version, setVersion] = useState("");
  /** Lo que toca enseñar al arrancar, a la espera de que digas sí. */
  const [ofrecidas, setOfrecidas] = useState<Pendiente[]>([]);
  /** El recorrido de lo nuevo, abierto. */
  const [abiertas, setAbiertas] = useState<Parada[] | null>(null);
  /** Sube cada vez que se abre: reabrirlo desde su propia parada empieza de cero
      (el `Tour` lee sus paradas una vez, al montarse). */
  const [vez, setVez] = useState(0);

  useEffect(() => {
    let reloj = 0;
    getVersion()
      .then((v) => {
        setVersion(v);
        // Quien estrena Adeorq tiene la bienvenida, y para él todo es nuevo: lo
        // de esta versión ya no se le ofrece.
        if (!leerPerfil().hecho) {
          marcarVista(v);
          return;
        }
        const toca = pendientes(NOVEDADES, v, leerVista() ?? ANTES_DEL_RECORRIDO);
        if (toca.length === 0) {
          marcarVista(v);
          return;
        }
        reloj = window.setTimeout(() => setOfrecidas(toca), TRAS_ARRANCAR_MS);
      })
      .catch(() => {});
    return () => window.clearTimeout(reloj);
  }, []);

  // Desde Ajustes › Ayuda: lo que aún no has visto, si queda algo (el bocadillo
  // sin contestar, con lo de varias versiones); si no, lo de la última que trajo
  // algo. Enseñar solo la última y marcarlo todo visto perdía lo de las otras.
  useEffect(() => {
    const ver = () => {
      if (!version) return;
      const toca = pendientes(NOVEDADES, version, leerVista() ?? ANTES_DEL_RECORRIDO);
      const v = ultimaConNovedades(NOVEDADES, version);
      const lista = toca.length > 0 ? toca : v ? pendientes(NOVEDADES, v, null) : [];
      if (lista.length === 0) return;
      // Verlo desde aquí también es haberlo visto: el bocadillo no vuelve a ofrecerlo.
      marcarVista(version);
      setOfrecidas([]);
      setAbiertas(lista.map((p) => aParada(p, lang)));
      setVez((n) => n + 1);
    };
    window.addEventListener(VER_NOVEDADES, ver);
    return () => window.removeEventListener(VER_NOVEDADES, ver);
  }, [version, lang]);

  const irA = useCallback(
    (p: Parada) => {
      if (p.ajustes) {
        try {
          localStorage.setItem(SECCION_AJUSTES, p.ajustes);
        } catch {
          /* sin almacén, Ajustes se abre por su primer grupo y el evento lo mueve */
        }
        window.dispatchEvent(new CustomEvent(AJUSTES_IR, { detail: p.ajustes }));
      }
      if (p.vista) ir(p.vista as View);
    },
    [ir],
  );

  /** Contestes lo que contestes, ya está visto: «Ahora no» no vuelve a salir
      en el siguiente arranque, y sigue a mano en Ajustes › Ayuda. */
  const contestar = (si: boolean) => {
    marcarVista(version);
    if (si) setAbiertas(ofrecidas.map((p) => aParada(p, lang)));
    setOfrecidas([]);
  };

  return (
    <>
      {bienvenida && (
        <Tour
          onClose={() => {
            onBienvenidaCerrada();
            tocarPerfil({ tour: true });
          }}
        />
      )}
      {!bienvenida && !abiertas && ofrecidas.length > 0 && (
        <AvisoNovedades ofrecidas={ofrecidas} onSi={() => contestar(true)} onNo={() => contestar(false)} />
      )}
      {!bienvenida && abiertas && (
        <Tour key={vez} paradas={abiertas} ir={irA} traducir={false} probar onClose={() => setAbiertas(null)} />
      )}
    </>
  );
}
