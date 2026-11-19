import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z, ZodError } from 'zod';
import { requirePermission, userCan, type AuthUser } from '../auth.js';
import { requireAiBudget } from '../usage.js';
import type { CommentSettings } from '../../src/domain/social-comments.js';
import { metaCommentApp } from './credentials.js';
import { commentToken, subscribeCommentPage, grantFor, isFacebookPostParent, metaId, readMetaComment } from './comment-meta.js';
import { commentAccount, commentAiReady, commentPost, commentProviderLimited, commentWebhookConfigured, CommentError, deliverReply, publishPostComment, enqueueMetaComment, getPolicy, defaultCommentPolicy, policyInput, readCommentPage, requireCommentRef, setPolicy, suggestReply, type MetaCommentEvent } from './comments.js';
import { ProviderError } from './http.js';
import type { SocialAccount } from './types.js';

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WebhookChange {
  field?: string;
  value?: {
    item?: string; verb?: string; post_id?: string; parent_id?: string; comment_id?: string; id?: string;
    media?: { id?: string; ad_id?: string; original_media_id?: string; media_product_type?: string };
  };
}
export function parseMetaCommentEvents(payload: unknown): MetaCommentEvent[] {
  const envelopes = Array.isArray(payload) ? payload : [payload];
  const events: MetaCommentEvent[] = [];
  for (const envelope of envelopes) {
    const platform = envelope?.object === 'page' ? 'facebook' : envelope?.object === 'instagram' ? 'instagram' : null;
    if (!platform || !Array.isArray(envelope.entry)) continue;
    for (const entry of envelope.entry) {
      if (!metaId(entry?.id) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes as WebhookChange[]) {
        const data = change?.value;
        if (!data) continue;
        if (platform === 'facebook' && change.field === 'feed' && data.item === 'comment' && data.verb === 'add'
          && metaId(data.post_id) && metaId(data.comment_id) && (!data.parent_id || isFacebookPostParent(data.parent_id, data.post_id))) {
          events.push({ platform, account: entry.id, post: data.post_id, comment: data.comment_id });
        }
        const igComment = data.comment_id ?? data.id;
        if (platform === 'instagram' && change.field === 'comments' && !data.parent_id && metaId(data.media?.id) && metaId(igComment)
          && !data.media.ad_id && !data.media.original_media_id && (!data.media.media_product_type || ['FEED', 'REELS'].includes(data.media.media_product_type))) {
          events.push({ platform, account: entry.id, post: data.media.id, comment: igComment });
        }
      }
    }
  }
  return events;
}

/** Mounted before the JSON parser. Only signature-verified event IDs reach the queue. */
export function registerMetaCommentWebhook(app: express.Express) {
  const path = '/api/webhooks/meta/comments';
  app.get(path, (req, res) => {
    const token = process.env.META_COMMENTS_VERIFY_TOKEN;
    const supplied = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (!commentWebhookConfigured() || !token || typeof supplied !== 'string' || !equal(supplied, token)
      || req.query['hub.mode'] !== 'subscribe' || typeof challenge !== 'string' || !/^\d{1,64}$/.test(challenge)) return res.sendStatus(403);
    res.type('text/plain').send(challenge);
  });
  app.post(path, express.raw({ type: 'application/json', limit: '256kb', inflate: false }), async (req, res) => {
    const secret = metaCommentApp().secret;
    if (!commentWebhookConfigured() || !secret || !Buffer.isBuffer(req.body)) return res.sendStatus(403);
    const signature = 'sha256=' + createHmac('sha256', secret).update(req.body).digest('hex');
    if (!equal(signature, req.header('X-Hub-Signature-256') ?? '')) return res.sendStatus(403);
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    for (const event of parseMetaCommentEvents(payload)) await enqueueMetaComment(event);
    res.sendStatus(200);
  });
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'تحقق من البيانات المدخلة.', code: 'invalid_comment_request' });
  if (error instanceof CommentError) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error instanceof ProviderError) {
    if (commentProviderLimited(error)) return res.status(429).json({ error: 'المنصة طلبت الانتظار. حاول مرة أخرى لاحقًا.', code: 'comment_rate_limited' });
    if ([401, 403].includes(error.status) || ['190', '200', '283', 'comment_reconnect'].includes(error.code)) {
      return res.status(403).json({ error: 'راجع تفويض التعليقات وصلاحيات الحساب لدى Meta.', code: 'comment_reconnect' });
    }
    return res.status(502).json({ error: 'تعذّر تنفيذ الطلب على Meta. قد يكون التعليق محذوفًا أو غير متاح.', code: 'comment_provider_error' });
  }
  return res.status(502).json({ error: 'تعذّر تنفيذ طلب التعليقات. حاول مرة أخرى لاحقًا.', code: 'comment_error' });
}

const reference = z.string().min(1).max(100);
const cursor = z.string().min(1).max(2000).optional();
const canManageComments = (user: AuthUser) => userCan(user, 'connections.manage') && userCan(user, 'content.publish');
const manageComments: express.RequestHandler = (req, res, next) => {
  if (!req.user || !canManageComments(req.user)) return res.status(403).json({ error: 'إعداد الردود التلقائية يتطلب صلاحيات إدارة الحساب والنشر.' });
  next();
};

async function settings(a: SocialAccount, user: AuthUser, postId?: string): Promise<CommentSettings> {
  const [policy, accountPolicy, grant] = await Promise.all([postId ? getPolicy(a, postId) : getPolicy(a), postId ? getPolicy(a) : undefined, grantFor(a)]);
  const manage = canManageComments(user);
  return {
    policy: policy ? { ...policy.policy, faqs: manage ? policy.policy.faqs : [] } : null,
    accountPolicy: accountPolicy ? { ...accountPolicy.policy, faqs: manage ? accountPolicy.policy.faqs : [] } : defaultCommentPolicy,
    canManage: manage, canReply: userCan(user, 'content.publish'),
    authorized: Boolean(grant && a.verifiedAt && !['disconnected', 'authorization_required'].includes(a.status)),
    aiReady: commentAiReady(), webhookConfigured: commentWebhookConfigured(),
  };
}

export function registerCommentRoutes(app: express.Express) {
  const accountPath = '/api/social/comments/:platform/:accountId';
  const postPath = accountPath + '/posts/:postId';
  const target = (req: express.Request) => commentPost(String(req.params.platform), String(req.params.accountId), String(req.params.postId));
  const account = (req: express.Request) => commentAccount(String(req.params.platform), String(req.params.accountId));
  const wrap = (handler: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try { await handler(req, res, next); } catch (error) { fail(res, error); }
  };

  app.get(accountPath + '/settings', manageComments, wrap(async (req, res) => {
    res.json(await settings(await account(req), req.user!));
  }));
  app.post(accountPath + '/subscription', manageComments, wrap(async (req, res) => {
    if (!commentWebhookConfigured()) throw new CommentError(409, 'automatic_setup_required', 'يلزم إعداد إشعارات Meta على السيرفر أولًا.');
    await subscribeCommentPage(await account(req));
    res.sendStatus(204);
  }));
  app.patch(accountPath + '/settings', manageComments, wrap(async (req, res) => {
    const a = await account(req);
    await setPolicy(a, '', policyInput.parse(req.body), req.user!.id);
    res.json(await settings(a, req.user!));
  }));
  app.get(postPath + '/settings', requirePermission('analytics.view'), wrap(async (req, res) => {
    const post = await target(req);
    res.json(await settings(post.account, req.user!, post.postId));
  }));
  app.patch(postPath + '/settings', requirePermission('analytics.view'), manageComments, wrap(async (req, res) => {
    const post = await target(req);
    await setPolicy(post.account, post.postId, z.object({ policy: policyInput.nullable() }).parse(req.body).policy, req.user!.id);
    res.json(await settings(post.account, req.user!, post.postId));
  }));

  app.get(postPath, requirePermission('analytics.view'), wrap(async (req, res) => {
    res.json(await readCommentPage(await target(req), cursor.parse(req.query.cursor)));
  }));
  app.post(postPath, requirePermission('analytics.view'), requirePermission('content.publish'), wrap(async (req, res) => {
    const post = await target(req);
    const input = z.object({ requestId: z.uuid(), message: z.string().trim().min(1).max(600) }).parse(req.body);
    res.status(201).json({ id: await publishPostComment(post, input.requestId, input.message, req.user!.id) });
  }));
  app.get(postPath + '/:commentId/replies', requirePermission('analytics.view'), wrap(async (req, res) => {
    const post = await target(req);
    const id = String(req.params.commentId);
    requireCommentRef(post, id, reference.parse(req.query.reference));
    res.json(await readCommentPage(post, cursor.parse(req.query.cursor), id));
  }));
  app.post(postPath + '/:commentId/replies', requirePermission('analytics.view'), requirePermission('content.publish'), wrap(async (req, res) => {
    const post = await target(req);
    const id = String(req.params.commentId);
    const input = z.object({ reference, message: z.string().trim().min(1).max(600) }).parse(req.body);
    requireCommentRef(post, id, input.reference);
    const token = await commentToken(post.account);
    const comment = await readMetaComment(post.account, token, id);
    if (comment.own || !comment.canReply) throw new CommentError(409, 'comment_not_replyable', 'التعليق غير متاح للرد.');
    res.status(201).json({ id: await deliverReply(post, token, id, input.message, req.user!.id, false) });
  }));
  app.post(postPath + '/:commentId/draft', requirePermission('analytics.view'), requirePermission('content.publish'), requireAiBudget, wrap(async (req, res) => {
    const post = await target(req);
    const id = String(req.params.commentId);
    requireCommentRef(post, id, reference.parse(req.body?.reference));
    const override = await getPolicy(post.account, post.postId);
    const policy = override?.policy ?? (await getPolicy(post.account))?.policy ?? defaultCommentPolicy;
    if (policy.mode === 'manual') throw new CommentError(409, 'comment_ai_disabled', 'وضع المنشور الحالي هو الرد اليدوي.');
    const token = await commentToken(post.account);
    const comment = await readMetaComment(post.account, token, id);
    if (comment.own || !comment.canReply) throw new CommentError(409, 'comment_not_replyable', 'التعليق غير متاح للرد.');
    res.json({ draft: await suggestReply(post.caption, comment.text, policy, req.user!.id) });
  }));
}
