import type express from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { requirePermission } from './auth.js';
import { setSetting } from './settings.js';
import { storageInventory, storageLimits } from './storage.js';
import { retentionPolicy, retentionPreview, restoreMediaAsset, runStorageMaintenance } from './storage-retention.js';

export function registerStorageRoutes(app: express.Express) {
  app.use('/api/storage', requirePermission('admin.access'), (req, res, next) => {
    if (req.method !== 'GET' && req.header('origin')) {
      let allowed = false;
      try { const origin = new URL(req.header('origin')!); allowed = origin.origin === new URL(process.env.APP_URL || 'http://127.0.0.1:4100').origin || origin.host === req.header('host'); } catch { /* Reject malformed origins. */ }
      if (!allowed) return res.status(403).json({ error: 'مصدر الطلب غير مسموح.' });
    }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.get('/api/storage', async (_req, res) => {
    try {
      const [inventory, policy] = await Promise.all([storageInventory(true), retentionPolicy()]);
      const limits = storageLimits();
      res.json({ inventory, limits, policy, warning: inventory.bytes >= limits.maxBytes * 0.8 || inventory.freeBytes < limits.reserveBytes * 2, preview: await retentionPreview(policy) });
    } catch { res.status(503).json({ error: 'تعذّر قراءة حالة التخزين. حاول لاحقًا.' }); }
  });
  app.post('/api/storage/policy', async (req, res) => {
    const parsed = z.object({ enabled: z.boolean(), publishedDays: z.number().int().min(7).max(365), trashDays: z.number().int().min(7).max(90), confirmPermanentDeletion: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success || parsed.data.enabled && !parsed.data.confirmPermanentDeletion) return res.status(400).json({ error: 'حدد مدة الاحتفاظ وأكد الحذف النهائي بعد فترة الاسترجاع.' });
    const { confirmPermanentDeletion: _confirmation, ...policy } = parsed.data;
    await setSetting('storage.retention', policy); res.json({ policy });
  });
  app.post('/api/storage/assets/:id/keep', async (req, res) => {
    const asset = await db.get<{ storage_state: string }>('SELECT storage_state FROM social_media WHERE id=?', [String(req.params.id)]);
    if (!asset || asset.storage_state === 'purged') return res.status(404).json({ error: 'الملف غير متاح.' });
    if (asset.storage_state === 'quarantined') return res.json(await restoreMediaAsset(String(req.params.id)));
    await db.run('UPDATE social_media SET pinned=1 WHERE id=?', [String(req.params.id)]); res.json({ pinned: true });
  });
  app.post('/api/storage/assets/:id/restore', async (req, res) => {
    try { res.json(await restoreMediaAsset(String(req.params.id))); } catch { res.status(409).json({ error: 'تعذّر استرجاع الملف؛ ربما انتهت فترة الاسترجاع.' }); }
  });
  app.post('/api/storage/maintenance', async (_req, res) => {
    try { res.json(await runStorageMaintenance()); } catch { res.status(503).json({ error: 'تعذّر إكمال صيانة التخزين. أُبقيت الملفات المحمية.' }); }
  });
}
