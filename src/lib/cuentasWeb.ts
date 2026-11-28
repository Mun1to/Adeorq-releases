// Las cuentas del navegador de los agentes: lo que pinta Perfil › Cuentas › «En la web».
//
// Qué se lee, qué se abre y qué se borra lo decide Rust (`src-tauri/src/cuentas_web.rs`, con
// la lista `SITIOS` y el porqué de cada marca); aquí vive cómo se enseña cada web: su nombre,
// su logo y, en las bloqueadas, su porqué en una frase.
//
// Los logos son los de Simple Icons (CC0, https://simpleicons.org), dibujados en la rejilla de
// 24 de la app y con el color de cada marca, como `ProviderMark` con los CLI. Las marcas son de
// sus dueños: se enseñan para que se reconozca cada web, no como nuestras.

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type Grupo = "cuentas" | "vivo" | "bloqueado";

export interface SitioEstado {
  id: string;
  grupo: Grupo;
  /** null: desde las cookies no se puede saber. */
  dentro: boolean | null;
  /** Hasta cuándo dura la sesión, en segundos Unix, si lo dice su cookie. */
  caduca: number | null;
  /** Con qué cuenta se entra (de `%LOCALAPPDATA%\Adeorq\cuentas-web.json`). */
  pista: string | null;
  /** Va con la sesión de otra web (Search Console con Google). */
  con: string | null;
}

export interface EstadoCuentasWeb {
  disponible: boolean;
  abierto: boolean;
  entrando: string | null;
  /** La lista es de una lectura anterior: segundos Unix de cuando. */
  de_antes: number | null;
  error: string | null;
  sitios: SitioEstado[];
}

export const leerCuentasWeb = () => invoke<EstadoCuentasWeb>("cuentas_web_estado");

/** Cada cuánto se relee mientras la pantalla de Cuentas está abierta, y durante los dos
 *  minutos siguientes a «Añadir», que es cuando se entra en la web. */
const CADA_MS = 20_000;
const CADA_MS_ENTRANDO = 4_000;
const ENTRANDO_MS = 120_000;

/** Si este equipo tiene la sección, según la última lectura. La pestaña sale ya en el primer
 *  pintado: si saliera al llegar la lectura, quien la dejó abierta volvería a «Tus cuentas»
 *  (`Secciones` cae a la primera cuando la suya no existe). */
const HAY = "adeorq-cuentas-web";
export function hayCuentasWeb(): boolean {
  return localStorage.getItem(HAY) === "1";
}

/** El estado de las cuentas del navegador de los agentes, al día. `null` hasta la primera
 *  lectura, y siempre fuera de la app de escritorio (la demo de la web no tiene Rust). */
export function useCuentasWeb(): [EstadoCuentasWeb | null, (rapido?: boolean) => void] {
  const [estado, setEstado] = useState<EstadoCuentasWeb | null>(null);
  const rapidoHasta = useRef(0);
  const leer = useCallback(() => {
    leerCuentasWeb()
      .then((e) => {
        localStorage.setItem(HAY, e.disponible ? "1" : "0");
        setEstado(e);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    let vivo = true;
    let reloj = 0;
    const vuelta = () => {
      const ms = Date.now() < rapidoHasta.current ? CADA_MS_ENTRANDO : CADA_MS;
      reloj = window.setTimeout(() => {
        if (!vivo) return;
        if (!document.hidden) leer();
        vuelta();
      }, ms);
    };
    leer();
    vuelta();
    const alVolver = () => {
      if (!document.hidden) leer();
    };
    window.addEventListener("focus", alVolver);
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      window.removeEventListener("focus", alVolver);
    };
  }, [leer]);
  const releer = useCallback(
    (rapido?: boolean) => {
      if (rapido) rapidoHasta.current = Date.now() + ENTRANDO_MS;
      leer();
    },
    [leer],
  );
  return [estado, releer];
}
export const anadirCuentaWeb = (id: string) => invoke<{ en_el_abierto: boolean }>("cuentas_web_anadir", { id });
export const quitarCuentaWeb = (id: string) => invoke<void>("cuentas_web_quitar", { id });

export interface Presentacion {
  nombre: string;
  /** El trazado de su logo (relleno, en 24×24). Sin él, `dibujo`. */
  d?: string;
  /** Un dibujo de trazo de la casa, para lo que no tiene logo de nadie. */
  dibujo?: "globo" | "banco";
  /** El color de la marca. Sin él, el del texto (las que son negras: X, GitHub, Resend). */
  color?: string;
  /** Por qué está bloqueada, en una frase. */
  porque?: string;
  /** Guarda la sesión fuera de las cookies: «Quitar» enciende el navegador si está cerrado. */
  local?: boolean;
}

export const PRESENTACION: Record<string, Presentacion> = {
  google: {
    nombre: "Google",
    color: "#4285F4",
    d: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133c-1.147 1.147-2.933 2.4-6.053 2.4c-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0C5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36c2.16-2.16 2.84-5.213 2.84-7.667c0-.76-.053-1.467-.173-2.053z",
  },
  "search-console": {
    nombre: "Search Console",
    color: "#458CF5",
    d: "M8.548 1.156L6.832 2.872v1.682h1.716zm0 3.398v.035H6.832v-.035H3.386L0 7.844v3.577h2.826V8.94c0-.525.429-.954.954-.954h16.476c.525 0 .954.43.954.954v2.48h2.754V7.844l-3.386-3.29H17.3v.035h-1.717v-.035zm7.035 0H17.3V2.872l-1.717-1.716zM8.679 1.188V2.84h6.773V1.188zm11.471 7.07a1 1 0 0 0-.132.01l-.543.002c-5.216.014-10.432-.008-15.648.01c-.435-.063-.794.436-.716.883v2.264h17.812c-.016-.888.045-1.782-.034-2.666c-.104-.342-.427-.502-.739-.502zm-15.422.634a.689.698 0 0 1 .689.698a.689.698 0 0 1-.689.697a.689.698 0 0 1-.688-.697a.689.698 0 0 1 .688-.698m2.134 0a.689.698 0 0 1 .689.698a.689.698 0 0 1-.689.697a.689.698 0 0 1-.688-.697a.689.698 0 0 1 .688-.698M.036 11.645v9.156c0 1.05.858 1.908 1.907 1.908h.883V11.645zm21.174 0v11.064h.882c1.05 0 1.908-.858 1.908-1.908v-9.156zM4.057 13.133v6.85h6.137v-6.85zm13.243.021v3.777l-1.708.977l-1.708-.977v-3.758a4.006 4.006 0 0 0 0 7.23v2.441h3.457v-2.442a4.006 4.006 0 0 0-.041-7.248m-13.243 8.26v1.43h7.925v-1.43z",
  },
  youtube: {
    nombre: "YouTube",
    color: "#FF0000",
    d: "M23.498 6.186a3.02 3.02 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.02 3.02 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.02 3.02 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.02 3.02 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814M9.545 15.568V8.432L15.818 12z",
  },
  x: {
    nombre: "X",
    d: "M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z",
  },
  canva: {
    nombre: "Canva",
    color: "#00C4CC",
    d: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12s12-5.373 12-12S18.627 0 12 0M6.962 7.68c.754 0 1.337.549 1.405 1.2c.069.583-.171 1.097-.822 1.406c-.343.171-.48.172-.549.069c-.034-.069 0-.137.069-.206c.617-.514.617-.926.548-1.508c-.034-.378-.308-.618-.583-.618c-1.2 0-2.914 2.674-2.674 4.629c.103.754.549 1.646 1.509 1.646c.308 0 .65-.103.96-.24c.5-.264.799-.47 1.097-.8c-.073-.885.704-2.046 1.851-2.046c.515 0 .926.205.96.583c.068.514-.377.582-.514.582s-.378-.034-.378-.17c-.034-.138.309-.07.275-.378c-.035-.206-.24-.274-.446-.274c-.72 0-1.131.994-1.029 1.611c.035.275.172.549.447.549c.205 0 .514-.31.617-.755c.068-.308.343-.514.583-.514c.102 0 .17.034.205.171v.138c-.034.137-.137.548-.102.651c0 .069.034.171.17.171c.092 0 .436-.18.777-.459c.117-.59.253-1.298.253-1.357c.034-.24.137-.48.617-.48c.103 0 .171.034.205.171v.138l-.136.617c.445-.583 1.097-.994 1.508-.994c.172 0 .309.102.309.274c0 .103 0 .274-.069.446c-.137.377-.309.96-.412 1.474c0 .137.035.274.207.274s.685-.206 1.096-.754l.007-.004c-.002-.068-.007-.134-.007-.202c0-.411.035-.754.104-.994c.068-.274.411-.514.617-.514c.103 0 .205.069.205.171c0 .035 0 .103-.034.137c-.137.446-.24.857-.24 1.269c0 .24.034.582.102.788c0 .034.035.069.07.069c.068 0 .548-.445.89-1.028c-.308-.206-.48-.549-.48-.96c0-.72.446-1.097.858-1.097c.343 0 .617.24.617.72c0 .308-.103.65-.274.96h.102a.77.77 0 0 0 .584-.24a.3.3 0 0 1 .134-.117c.335-.425.83-.74 1.41-.74c.48 0 .924.205.959.582c.068.515-.378.618-.515.618l-.002-.002c-.138 0-.377-.035-.377-.172s.309-.068.274-.376c-.034-.206-.24-.275-.446-.275c-.686 0-1.13.891-1.028 1.611c.034.275.171.583.445.583c.206 0 .515-.308.652-.754c.068-.274.343-.514.583-.514c.103 0 .17.034.205.171c0 .069 0 .206-.137.652c-.17.308-.171.48-.137.617c.034.274.171.48.309.583c.034.034.068.102.068.102c0 .069-.034.138-.137.138c-.034 0-.068 0-.103-.035c-.514-.205-.72-.548-.789-.891c-.205.24-.445.377-.72.377c-.445 0-.89-.411-.96-.926a1.6 1.6 0 0 1 .075-.649c-.203.13-.422.203-.623.203h-.17c-.447.652-.927 1.098-1.27 1.303a.9.9 0 0 1-.377.104c-.068 0-.171-.035-.205-.104c-.095-.152-.156-.392-.193-.667c-.481.527-1.145.805-1.453.805c-.343 0-.548-.206-.582-.55v-.376c.102-.754.377-1.2.377-1.337a.074.074 0 0 0-.069-.07c-.24 0-1.028.824-1.166 1.373l-.103.445c-.068.309-.377.515-.582.515c-.103 0-.172-.035-.206-.172v-.137l.046-.233c-.435.31-.87.508-1.075.508c-.308 0-.48-.172-.514-.412c-.206.274-.445.412-.754.412c-.352 0-.696-.24-.862-.593c-.244.275-.523.553-.852.764c-.48.309-1.028.549-1.68.549c-.582 0-1.097-.309-1.371-.583c-.412-.377-.651-.96-.686-1.509c-.205-1.68.823-3.84 2.4-4.8c.378-.205.755-.343 1.132-.343m9.77 3.291c-.104 0-.172.172-.172.343c0 .274.137.583.309.755a1.7 1.7 0 0 0 .102-.583c0-.343-.137-.515-.24-.515z",
  },
  helpbnk: { nombre: "HelpBnk", dibujo: "globo" },
  github: {
    nombre: "GitHub",
    d: "M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  },
  cloudflare: {
    nombre: "Cloudflare",
    color: "#F38020",
    d: "M16.509 16.845c.147-.507.09-.971-.155-1.316c-.225-.316-.605-.499-1.062-.52l-8.66-.113a.16.16 0 0 1-.133-.07a.2.2 0 0 1-.02-.156a.24.24 0 0 1 .203-.156l8.736-.113c1.035-.049 2.16-.886 2.554-1.913l.499-1.302a.27.27 0 0 0 .014-.168a5.689 5.689 0 0 0-10.937-.584a2.58 2.58 0 0 0-1.794-.498a2.56 2.56 0 0 0-2.223 3.18A3.634 3.634 0 0 0 0 16.751q.002.264.035.527a.174.174 0 0 0 .17.148h15.98a.22.22 0 0 0 .204-.155zm2.757-5.564c-.077 0-.161 0-.239.011c-.056 0-.105.042-.127.098l-.337 1.174c-.148.507-.092.971.154 1.317c.225.316.605.498 1.062.52l1.844.113c.056 0 .105.026.133.07a.2.2 0 0 1 .021.156a.24.24 0 0 1-.204.156l-1.92.112c-1.042.049-2.159.887-2.553 1.914l-.141.358c-.028.072.021.142.099.142h6.597a.174.174 0 0 0 .17-.126a5 5 0 0 0 .175-1.28a4.74 4.74 0 0 0-4.734-4.727",
  },
  supabase: {
    nombre: "Supabase",
    color: "#3FCF8E",
    local: true,
    d: "M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z",
  },
  resend: {
    nombre: "Resend",
    d: "M14.679 0c4.648 0 7.413 2.765 7.413 6.434s-2.765 6.434-7.413 6.434H12.33L24 24h-8.245l-8.88-8.44c-.636-.588-.93-1.273-.93-1.86c0-.831.587-1.565 1.713-1.883l4.574-1.224c1.737-.465 2.936-1.81 2.936-3.572c0-2.153-1.761-3.4-3.939-3.4H0V0z",
  },
  linkedin: {
    nombre: "LinkedIn",
    color: "#0A66C2",
    porque: "Nunca con un navegador automático: lo prohíbe LinkedIn y es tu regla.",
    d: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037c-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85c3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.06 2.06 0 0 1-2.063-2.065a2.064 2.064 0 1 1 2.063 2.065m1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z",
  },
  stripe: {
    nombre: "Stripe",
    color: "#635BFF",
    porque: "Cobros y pagos: ningún agente entra ahí.",
    d: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409c0-.831.683-1.305 1.901-1.305c2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0C9.667 0 7.589.654 6.104 1.872C4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219c2.585.92 3.445 1.574 3.445 2.583c0 .98-.84 1.545-2.354 1.545c-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813c1.664-1.305 2.525-3.236 2.525-5.732c0-4.128-2.524-5.851-6.594-7.305z",
  },
  bancos: {
    nombre: "Bancos y pagos",
    dibujo: "banco",
    porque: "Tu dinero: nunca en el navegador de los agentes.",
  },
};

export function presentacionDe(id: string): Presentacion {
  return PRESENTACION[id] ?? { nombre: id, dibujo: "globo" };
}

/** Cuántas webs de trabajo tienen sesión: sin las bloqueadas (van aparte, en su aviso) ni las
 *  que van con la sesión de otra (Search Console contaría Google dos veces). */
export function contarDentro(sitios: SitioEstado[]): number {
  return sitios.filter((s) => s.dentro === true && !s.con && s.grupo !== "bloqueado").length;
}

/** Lo que se pinta a la derecha de cada web. */
export type Lado = "dentro" | "fuera" | "nose";

export function ladoDe(s: SitioEstado): Lado {
  return s.dentro === true ? "dentro" : s.dentro === false ? "fuera" : "nose";
}

/** Qué botones lleva una web. Bloqueada: solo «Quitar», y solo si puede haber sesión. Con la
 *  sesión de otra: solo «Añadir» mientras esté fuera. «No se sabe»: los dos. */
export function botonesDe(s: SitioEstado): { anadir: boolean; quitar: boolean } {
  const lado = ladoDe(s);
  if (s.grupo === "bloqueado") return { anadir: false, quitar: lado !== "fuera" };
  if (s.con) return { anadir: lado !== "dentro", quitar: false };
  return { anadir: lado !== "dentro", quitar: lado !== "fuera" };
}
