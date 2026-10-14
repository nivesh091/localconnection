import express from 'express';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
// @ts-ignore
import { generatePwaIcons, fetchRemoteBranding, buildManifest } from './scripts/generate-icons.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';

// Stable, production-ready VAPID Keys (Private key NEVER leaves the server)
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.VITE_VAPID_PUBLIC_KEY ||
  'BIj-hKqgD1VNvcGsg_3Z5zzyBE57jQoTfJ6EDMGZ6k9n99d1EUxKO9G6k_HxCyrUFi9kXXP_raZu9Qyv2y2M0o0';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'Hgtds1t5TlEd9xkNBIDQVtY-jCgW64n5cRJv99zfsBc';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:niveshkumar1230@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();
app.use(express.json());

// In-memory subscription store per user (ensures multi-device push works even before DB migration)
interface StoredSubscription {
  userId: string;
  subscription: webpush.PushSubscription;
  userAgent?: string;
  createdAt: number;
}
const userSubscriptionsMap = new Map<string, StoredSubscription[]>();

// ----------------------------------------------------------------------------
// PUSH API ROUTES
// ----------------------------------------------------------------------------

// 1. Get VAPID public key
app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// 2. Register push subscription for a user
app.post('/api/push/subscribe', (req, res) => {
  const { userId, subscription, userAgent } = req.body;

  if (!userId || !subscription || !subscription.endpoint) {
    res.status(400).json({ error: 'Missing userId or subscription' });
    return;
  }

  const existing = userSubscriptionsMap.get(userId) || [];
  // Deduplicate by endpoint
  const filtered = existing.filter((s) => s.subscription.endpoint !== subscription.endpoint);
  filtered.push({
    userId,
    subscription,
    userAgent,
    createdAt: Date.now(),
  });
  userSubscriptionsMap.set(userId, filtered);

  res.json({ success: true });
});

// 3. Unsubscribe push subscription
app.post('/api/push/unsubscribe', (req, res) => {
  const { userId, endpoint } = req.body;

  if (!userId || !endpoint) {
    res.status(400).json({ error: 'Missing userId or endpoint' });
    return;
  }

  const existing = userSubscriptionsMap.get(userId) || [];
  const updated = existing.filter((s) => s.subscription.endpoint !== endpoint);
  userSubscriptionsMap.set(userId, updated);

  res.json({ success: true });
});

// 4. Send server-side Web Push notification to a recipient
app.post('/api/push/send', async (req, res) => {
  const { recipientId, title, body, icon, badge, tag, data } = req.body;

  if (!recipientId || !title) {
    res.status(400).json({ error: 'Missing recipientId or title' });
    return;
  }

  const subs = userSubscriptionsMap.get(recipientId) || [];
  if (subs.length === 0) {
    res.json({ success: true, delivered: 0, notice: 'No active push subscriptions for recipient' });
    return;
  }

  const payloadString = JSON.stringify({
    title,
    body: body || '',
    icon: icon || '/pwa-192x192.png',
    badge: badge || '/favicon.ico',
    tag: tag || 'kaammitra_notification',
    data: data || {},
  });

  let deliveredCount = 0;
  const deadEndpoints: string[] = [];

  const promises = subs.map(async (item) => {
    try {
      await webpush.sendNotification(item.subscription, payloadString, {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: 'high',
      });
      deliveredCount++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadEndpoints.push(item.subscription.endpoint);
      } else {
        console.warn('[WebPush] Delivery warning:', err.message || err);
      }
    }
  });

  await Promise.all(promises);

  // Clean up expired subscriptions
  if (deadEndpoints.length > 0) {
    const updated = subs.filter((s) => !deadEndpoints.includes(s.subscription.endpoint));
    userSubscriptionsMap.set(recipientId, updated);
  }

  res.json({ success: true, delivered: deliveredCount });
});

// ----------------------------------------------------------------------------
// PWA BRANDING & MANIFEST ROUTES (Admin Logo Controls Actual PWA Icon)
// ----------------------------------------------------------------------------

// 1. Sync PWA icons whenever Admin changes/uploads a logo
app.post('/api/branding/sync-icons', async (req, res) => {
  const { logo_url } = req.body || {};
  try {
    const result = await generatePwaIcons(logo_url);
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('[PWA] Failed to generate icons:', err);
    res.status(500).json({ error: err.message || 'Failed to sync PWA icons' });
  }
});

// 2. Dynamic PWA Web App Manifest: always serves active branding and matching icons
const serveDynamicManifest = async (_req: express.Request, res: express.Response) => {
  try {
    const branding = await fetchRemoteBranding();
    const manifest = buildManifest(branding, Date.now());
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(manifest);
  } catch (err: any) {
    console.warn('[PWA] Failed to build dynamic manifest:', err);
    res.status(500).json({ error: 'Failed to generate manifest' });
  }
};

app.get('/manifest.webmanifest', serveDynamicManifest);
app.get('/manifest.json', serveDynamicManifest);
app.get('/api/branding/manifest', serveDynamicManifest);

// ----------------------------------------------------------------------------
// VITE DEV SERVER / STATIC SERVING
// ----------------------------------------------------------------------------

async function startServer() {
  // Sync PWA icons from current admin logo or default /logo.jpg on boot
  generatePwaIcons().catch((err: any) => {
    console.warn('[PWA] Initial startup icon sync note:', err.message || err);
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[KaamMitra] App running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[KaamMitra] Server startup error:', err);
  process.exit(1);
});
