import express from 'express';
import webpush from 'web-push';
import path from 'path';
import fs from 'fs';
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

// In-memory subscription store per user (backed by local disk persistence)
interface StoredSubscription {
  userId: string;
  subscription: webpush.PushSubscription;
  userAgent?: string;
  createdAt: number;
}

const PUSH_STORE_PATH = path.join(__dirname, '.data', 'push_subscriptions.json');

function loadPersistedSubs(): Map<string, StoredSubscription[]> {
  const map = new Map<string, StoredSubscription[]>();
  try {
    if (fs.existsSync(PUSH_STORE_PATH)) {
      const raw = fs.readFileSync(PUSH_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) {
            map.set(
              k,
              v.map((item: any) => ({
                userId: k,
                subscription: item.subscription || item,
                userAgent: item.userAgent,
                createdAt: item.createdAt || Date.now(),
              }))
            );
          }
        }
      }
    }
  } catch (e) {
    console.warn('[PushStore] Error reading subscriptions file:', e);
  }
  return map;
}

function savePersistedSubs(map: Map<string, StoredSubscription[]>) {
  try {
    const dir = path.dirname(PUSH_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, any[]> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v.map((item) => ({
        endpoint: item.subscription.endpoint,
        keys: item.subscription.keys,
        userAgent: item.userAgent,
        createdAt: item.createdAt,
      }));
    }
    fs.writeFileSync(PUSH_STORE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[PushStore] Error writing subscriptions file:', e);
  }
}

const userSubscriptionsMap = loadPersistedSubs();

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
  savePersistedSubs(userSubscriptionsMap);

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
  savePersistedSubs(userSubscriptionsMap);

  res.json({ success: true });
});

// 4. Send server-side Web Push notification to a recipient
app.post('/api/push/send', async (req, res) => {
  const { recipientId, title, body, icon, badge, tag, data } = req.body;

  if (!recipientId || !title) {
    res.status(400).json({ error: 'Missing recipientId or title' });
    return;
  }

  let subs = userSubscriptionsMap.get(recipientId) || [];

  // Fallback to push_subscriptions table in Supabase if in-memory store has no active subscription
  if (subs.length === 0) {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hhvxanktvbncyeedzzdf.supabase.co';
      const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';
      const resp = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${recipientId}&select=endpoint,p256dh,auth`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          subs = rows.map((r: any) => ({
            userId: recipientId,
            subscription: {
              endpoint: r.endpoint,
              keys: {
                p256dh: r.p256dh,
                auth: r.auth,
              },
            } as any,
            createdAt: Date.now(),
          }));
          userSubscriptionsMap.set(recipientId, subs);
        }
      }
    } catch (e) {
      console.warn('[WebPush] DB subscription fetch notice:', e);
    }
  }

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
  const isIncomingCall = data?.type === 'incoming_call' || tag?.startsWith('call_');
  const pushTtl = isIncomingCall ? 120 : 60 * 60 * 24; // 120s for calls to prevent stale ring, 24h for messages

  const promises = subs.map(async (item: any) => {
    const targetSub = item.subscription || item;
    if (!targetSub?.endpoint) return;
    try {
      await webpush.sendNotification(targetSub, payloadString, {
        TTL: pushTtl,
        urgency: 'high',
      });
      deliveredCount++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadEndpoints.push(targetSub.endpoint);
      } else {
        console.warn('[WebPush] Delivery warning:', err.message || err);
      }
    }
  });

  await Promise.all(promises);

  // Clean up expired subscriptions
  if (deadEndpoints.length > 0) {
    const updated = subs.filter((s: any) => {
      const ep = s.subscription?.endpoint || s.endpoint;
      return ep && !deadEndpoints.includes(ep);
    });
    userSubscriptionsMap.set(recipientId, updated);
    savePersistedSubs(userSubscriptionsMap);
  }

  res.json({ success: true, delivered: deliveredCount });
});

// 5. Dismiss/close active call notification across recipient's devices
app.post('/api/push/close', async (req, res) => {
  const { recipientId, callId } = req.body;

  if (!recipientId || !callId) {
    res.status(400).json({ error: 'Missing recipientId or callId' });
    return;
  }

  const subs = userSubscriptionsMap.get(recipientId) || [];
  if (subs.length === 0) {
    res.json({ success: true, delivered: 0 });
    return;
  }

  const payloadString = JSON.stringify({
    action: 'close_call',
    callId,
    tag: `call_${callId}`,
  });

  const promises = subs.map(async (item) => {
    try {
      await webpush.sendNotification(item.subscription, payloadString, {
        TTL: 60,
      });
    } catch {}
  });

  await Promise.all(promises);
  res.json({ success: true });
});

// ----------------------------------------------------------------------------
// PWA BRANDING & MANIFEST ROUTES (Admin Logo Controls Actual PWA Icon)
// ----------------------------------------------------------------------------

// 1. Sync PWA icons whenever Admin changes/uploads a logo or updates branding
app.post(['/api/branding/sync-icons', '/api/branding/sync'], async (req, res) => {
  const { logo_url } = req.body || {};
  try {
    const result = await generatePwaIcons(logo_url);
    const branding = await fetchRemoteBranding();
    res.json({ success: true, branding, result });
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
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
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
