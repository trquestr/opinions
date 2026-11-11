"use client";

import { useEffect } from "react";

/*
 * Старые модули героя (vanilla JS, IIFE) работают с готовым DOM и глобалами
 * (THREE, gsap, CloudRelief), поэтому грузим их строго по порядку и только
 * ПОСЛЕ гидрации: иначе React увидит DOM, изменённый скриптами (облака,
 * стили), посчитает это рассинхроном и перерисует корень, оборвав ссылки.
 *
 * Разметка при этом целиком рендерится на сервере (page.tsx) — для SEO.
 * ?v=N — кэш-бастинг файлов из public/: изменил файл — подними его v.
 */
export const SCRIPTS = [
  "/js/three.min.js",
  "/js/cloud-relief.js?v=23",
  "/js/gsap.min.js",
  "/js/landing.js?v=26",
  "/js/bust-section.js?v=2",
];

declare global {
  interface Window {
    __landingScriptsLoaded?: boolean;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Не загрузился скрипт ${src}`));
    document.body.appendChild(el);
  });
}

export function LandingScripts() {
  useEffect(() => {
    // Модули не умеют разбираться (destroy нет), поэтому повторно не грузим:
    // защищает от двойного эффекта StrictMode в dev и от возврата на страницу.
    if (window.__landingScriptsLoaded) return;
    window.__landingScriptsLoaded = true;
    (async () => {
      for (const src of SCRIPTS) await loadScript(src);
    })().catch((err) => console.error(err));
  }, []);
  return null;
}
