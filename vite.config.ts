import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import webpush from 'web-push';

// @ts-ignore
import { fetchRemoteBranding, buildManifest, generatePwaIcons } from './scripts/generate-icons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedBranding: { name: string; short_name: string } | null = null;
let lastBrandingFetch = 0;

async function getConfiguredBranding(forceRefresh = false): Promise<{ name: string; short_name: string }> {
  const fallback = {
    name: 'Kaam Mitra',
    short_name: 'Kaam Mitra',
  };

  const now = Date.now();
  if (!forceRefresh && cachedBranding && now - lastBrandingFetch < 5000) {
    return cachedBranding;
  }

  try {
    const remote = await fetchRemoteBranding();
    if (remote && remote.name) {
      cachedBranding = {
        name: remote.name,
        short_name: remote.short_name,
      };
      lastBrandingFetch = now;
      return cachedBranding;
    }
  } catch (err) {
    console.warn('[vite.config.ts] Failed to fetch Admin branding from Supabase:', err);
  }

  cachedBranding = fallback;
  lastBrandingFetch = now;
  return fallback;
}

export default defineConfig(async () => {
  const branding = await getConfiguredBranding(true);

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-transform-branding',
        async transformIndexHtml(html: string) {
          const dynamicBranding = await getConfiguredBranding();
          return html
            .replace(/<title>.*?<\/title>/, `<title>${dynamicBranding.name}</title>`)
            .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${dynamicBranding.name}" />`)
            .replace(/<meta name="apple-mobile-web-app-title" content=".*?" \/>/, `<meta name="apple-mobile-web-app-title" content="${dynamicBranding.short_name}" />`)
            .replace(/<meta name="application-name" content=".*?" \/>/, `<meta name="application-name" content="${dynamicBranding.short_name}" />`)
            .replace(/"name":\s*"[^"]*काम मित्र[^"]*"/, `"name": "${dynamicBranding.name}"`);
        },
      },
      {
        name: 'pwa-dynamic-manifest-and-sync',
        configureServer(server: any) {
          server.middlewares.use(async (req: any, res: any, next: any) => {
            const url = req.url ? req.url.split('?')[0] : '';
            if (url === '/manifest.webmanifest' || url === '/manifest.json') {
              try {
                const currentBranding = await getConfiguredBranding();
                const version = Date.now();
                const manifest = buildManifest(currentBranding, version);
                res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.end(JSON.stringify(manifest, null, 2));
                return;
              } catch (e) {
                // pass to next if error
              }
            }

            if ((url === '/api/branding/sync-icons' || url === '/api/branding/sync') && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body || '{}');
                  cachedBranding = null;
                  lastBrandingFetch = 0;
                  const result = await generatePwaIcons(parsed.logo_url);
                  const fresh = await getConfiguredBranding(true);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, branding: fresh, result }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || 'Failed to sync icons' }));
                }
              });
              return;
            }

            if (url === '/api/push/vapid-public-key' && req.method === 'GET') {
              const publicKey =
                process.env.VAPID_PUBLIC_KEY ||
                process.env.VITE_VAPID_PUBLIC_KEY ||
                'BIj-hKqgD1VNvcGsg_3Z5zzyBE57jQoTfJ6EDMGZ6k9n99d1EUxKO9G6k_HxCyrUFi9kXXP_raZu9Qyv2y2M0o0';
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ publicKey }));
              return;
            }

            const devPushSubs = (globalThis as any).__devPushSubs || new Map();
            (globalThis as any).__devPushSubs = devPushSubs;

            if (url === '/api/push/subscribe' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body || '{}');
                  if (parsed.userId && parsed.subscription) {
                    const existing = devPushSubs.get(parsed.userId) || [];
                    const filtered = existing.filter((s: any) => s.endpoint !== parsed.subscription.endpoint);
                    filtered.push(parsed.subscription);
                    devPushSubs.set(parsed.userId, filtered);
                  }
                } catch {}
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
              return;
            }

            if (url === '/api/push/unsubscribe' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', () => {
                try {
                  const parsed = JSON.parse(body || '{}');
                  if (parsed.userId && parsed.endpoint) {
                    const existing = devPushSubs.get(parsed.userId) || [];
                    devPushSubs.set(parsed.userId, existing.filter((s: any) => s.endpoint !== parsed.endpoint));
                  }
                } catch {}
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
              return;
            }

            if (url === '/api/push/send' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { recipientId, title, body: msgBody, icon, badge, tag, data } = JSON.parse(body || '{}');
                  let subs = devPushSubs.get(recipientId) || [];
                  if (subs.length === 0) {
                    try {
                      const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hhvxanktvbncyeedzzdf.supabase.co';
                      const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';
                      const r = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${recipientId}&select=endpoint,p256dh,auth`, {
                        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
                      });
                      if (r.ok) {
                        const rows = await r.json();
                        if (Array.isArray(rows) && rows.length > 0) {
                          subs = rows.map((row: any) => ({
                            endpoint: row.endpoint,
                            keys: { p256dh: row.p256dh, auth: row.auth }
                          }));
                          devPushSubs.set(recipientId, subs);
                        }
                      }
                    } catch {}
                  }

                  const vapidPub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || 'BIj-hKqgD1VNvcGsg_3Z5zzyBE57jQoTfJ6EDMGZ6k9n99d1EUxKO9G6k_HxCyrUFi9kXXP_raZu9Qyv2y2M0o0';
                  const vapidPriv = process.env.VAPID_PRIVATE_KEY || 'Hgtds1t5TlEd9xkNBIDQVtY-jCgW64n5cRJv99zfsBc';
                  const vapidSub = process.env.VAPID_SUBJECT || 'mailto:niveshkumar1230@gmail.com';
                  webpush.setVapidDetails(vapidSub, vapidPub, vapidPriv);

                  const payload = JSON.stringify({
                    title,
                    body: msgBody || '',
                    icon: icon || '/pwa-192x192.png',
                    badge: badge || '/favicon.ico',
                    tag: tag || 'kaammitra_notification',
                    data: data || {},
                  });

                  let sent = 0;
                  for (const sub of subs) {
                    try {
                      await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'high' });
                      sent++;
                    } catch {}
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, delivered: sent }));
                } catch (e: any) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: e?.message }));
                }
              });
              return;
            }

            if (url === '/api/push/close' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { recipientId, callId } = JSON.parse(body || '{}');
                  const subs = devPushSubs.get(recipientId) || [];
                  const vapidPub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || 'BIj-hKqgD1VNvcGsg_3Z5zzyBE57jQoTfJ6EDMGZ6k9n99d1EUxKO9G6k_HxCyrUFi9kXXP_raZu9Qyv2y2M0o0';
                  const vapidPriv = process.env.VAPID_PRIVATE_KEY || 'Hgtds1t5TlEd9xkNBIDQVtY-jCgW64n5cRJv99zfsBc';
                  const vapidSub = process.env.VAPID_SUBJECT || 'mailto:niveshkumar1230@gmail.com';
                  webpush.setVapidDetails(vapidSub, vapidPub, vapidPriv);

                  const payload = JSON.stringify({ action: 'close_call', callId, tag: `call_${callId}` });
                  for (const sub of subs) {
                    try {
                      await webpush.sendNotification(sub, payload, { TTL: 60 });
                    } catch {}
                  }
                } catch {}
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
              return;
            }

            next();
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'logo.jpg'],
        manifest: {
          id: '/',
          name: branding.name,
          short_name: branding.short_name,
          description: 'ग्रामीण और कस्बाई क्षेत्रों के लिए काम और सेवा प्रदाताओं का विश्वसनीय मंच',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,jpg,jpeg,webp}'],
          importScripts: ['/sw-push.js'],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\/manifest\.(webmanifest|json)$/],
          runtimeCaching: [
            // 1. Worker Profiles & Search Results from Supabase REST API (NetworkFirst with 3s fallback)
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/worker_profiles.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'worker-profiles-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 2. Worker Categories from Supabase REST API
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/categories.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'categories-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 14 * 24 * 60 * 60, // 14 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 3. Profiles & Locations
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/profiles.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'profiles-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 4. Worker Media Records (Voice recordings & Work photos metadata)
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/worker_media.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'worker-media-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 5. Worker Photos and Audio Recordings from Supabase Storage
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'worker-storage-media-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 6. Map Tiles (Leaflet / OpenStreetMap) for offline map rendering
            {
              urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'osm-map-tiles-cache',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 14 * 24 * 60 * 60, // 14 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      allowedHosts: true as const,
    },
  };
});
