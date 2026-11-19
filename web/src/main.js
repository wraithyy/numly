import { mount } from 'svelte';
import App from './App.svelte';
// Self-hosted fonts (OFL), Latin and Central European only: no request leaves for Google.
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-ext-700';
import '@fontsource/big-shoulders-display/latin-900';
import '@fontsource/big-shoulders-display/latin-ext-900';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-ext-700.css';
import './app.css';

mount(App, { target: document.body });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // When a new version's worker takes over an already-controlled page, reload once so the page
  // is not left running the previous release's code.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
}
