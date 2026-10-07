import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

async function getConfiguredBranding(): Promise<{ name: string; short_name: string }> {
  const fallback = {
    name: 'Talent',
    short_name: 'Talent',
  };

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || 'https://hhvxanktvbncyeedzzdf.supabase.co';
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

  if (!supabaseUrl || !supabaseKey) {
    return fallback;
  }

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/admin_settings?id=eq.app_branding&select=*`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) {
        const row = rows[0];
        let nameEn = row.home_welcome_en;
        let nameHi = row.home_welcome_hi;

        if (row.about_kaammitra_en) {
          try {
            const parsed = JSON.parse(row.about_kaammitra_en);
            if (parsed.name_en) nameEn = parsed.name_en;
            if (parsed.name_hi) nameHi = parsed.name_hi;
          } catch {}
        }

        const en = (nameEn || '').trim();
        const hi = (nameHi || '').trim();

        if (en || hi) {
          const exactName = en || hi;
          return {
            name: exactName,
            short_name: exactName,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[vite.config.ts] Failed to fetch Admin branding from Supabase:', err);
  }

  return fallback;
}

export default defineConfig(async () => {
  const branding = await getConfiguredBranding();

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-transform-branding',
        transformIndexHtml(html: string) {
          return html
            .replace(/<title>.*?<\/title>/, `<title>${branding.name}</title>`)
            .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${branding.name}" />`)
            .replace(/<meta name="apple-mobile-web-app-title" content=".*?" \/>/, `<meta name="apple-mobile-web-app-title" content="${branding.short_name}" />`);
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
                const manifest = {
                  id: '/',
                  name: currentBranding.name,
                  short_name: currentBranding.short_name,
                  description: 'ग्रामीण और कस्बाई क्षेत्रों के लिए काम और सेवा प्रदाताओं का विश्वसनीय मंच',
                  theme_color: '#0f766e',
                  background_color: '#f8fafc',
                  display: 'standalone',
                  start_url: '/',
                  scope: '/',
                  icons: [
                    {
                      src: `/pwa-192x192.png?v=${version}`,
                      sizes: '192x192',
                      type: 'image/png',
                      purpose: 'any',
                    },
                    {
                      src: `/pwa-512x512.png?v=${version}`,
                      sizes: '512x512',
                      type: 'image/png',
                      purpose: 'any',
                    },
                    {
                      src: `/pwa-maskable-512x512.png?v=${version}`,
                      sizes: '512x512',
                      type: 'image/png',
                      purpose: 'maskable',
                    },
                  ],
                };
                res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.end(JSON.stringify(manifest, null, 2));
                return;
              } catch (e) {
                // pass to next if error
              }
            }

            if (url === '/api/branding/sync-icons' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body || '{}');
                  // @ts-ignore
                  const { generatePwaIcons } = await import('./scripts/generate-icons.js');
                  const result = await generatePwaIcons(parsed.logo_url);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, result }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || 'Failed to sync icons' }));
                }
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
          description: 'ग्रामीण और कस्बाई क्षेत्रों के लिए काम और कारीगरों का विश्वसनीय मंच',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/logo.jpg',
              sizes: '1024x1024',
              type: 'image/jpeg',
              purpose: 'any',
            },
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
          navigateFallbackDenylist: [/^\/api\//],
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
      allowedHosts: true as const,
    },
  };
});
