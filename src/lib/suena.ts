// ¿Suena música en el PC?
//
// Lo sabe el reproductor de la barra (`components/NowPlaying.tsx`), que ya le
// pregunta a Windows cada pocos segundos, y lo quiere saber Adeo, la mascota,
// que baila cuando suena algo y nadie te reclama (`animoDe`, en
// `lib/campana.ts`). En vez de preguntar dos veces, el reproductor lo apunta
// aquí y ella lo lee.

import { create } from "zustand";

export const useSuena = create<{ suena: boolean }>(() => ({ suena: false }));
