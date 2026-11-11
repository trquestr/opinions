'use client';

// global-error заменяет корневой layout (а с ним и globals.css), поэтому стили подключаем здесь.
import '@/_app/styles/globals.css';

export { GlobalErrorPage as default } from '@/_pages/errors';
