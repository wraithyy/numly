import { mount } from 'svelte';
import App from './App.svelte';
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
