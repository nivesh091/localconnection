import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App.tsx';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// Prevent temporary unhandled network/storage rejections from crashing the whole app
window.addEventListener('unhandledrejection', (event) => {
  console.warn('Recovered from background unhandled rejection:', event.reason);
  // Prevent default browser crash behavior for non-fatal network rejections
  event.preventDefault();
});

// Register PWA Service Worker for offline worker profiles & push notifications in production builds
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onNeedReload() {
      console.log('[SW] New version activated in background without interrupting user.');
    },
    onNeedRefresh() {
      console.log('[SW] New version ready.');
    },
    onOfflineReady() {
      console.log('[SW] App ready for offline use. Worker profiles and search results cached.');
    },
    onRegistered(registration) {
      console.log('[SW] Service worker registered successfully:', registration?.scope);
    },
    onRegisterError(error) {
      console.warn('[SW] Service worker registration error:', error);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

