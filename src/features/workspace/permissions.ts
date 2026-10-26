import { can } from '../../domain/catalog';
import type { ContentItem, ContentStatus, Transition } from '../../domain/content';
import { TRANSITIONS } from '../../domain/content';
import type { Permission, User } from '../../domain/users';

export const hasPermission = (user: User, permission: Permission) => can(user.role, permission);

/** Ownership decides who may work on an item; Marketing roles may work on all of them. */
export function canEditContent(user: User, item: ContentItem): boolean {
  if (item.provenance === 'live') return false;
  if (hasPermission(user, 'content.edit_any')) return true;
  if (item.ownerId === user.id || item.assigneeId === user.id) return hasPermission(user, 'content.edit_own') || item.assigneeId === user.id;
  return hasPermission(user, 'content.edit_department') && item.departmentId === user.departmentId;
}

/** Why a move is not offered, or null when the user may make it. */
export function transitionBlock(user: User, item: ContentItem, to: ContentStatus): string | null {
  if (item.provenance === 'live') return 'live';
  const move = TRANSITIONS[item.status].find((entry) => entry.to === to);
  if (!move) return 'invalid';
  if (move.permission) return hasPermission(user, move.permission) ? null : 'permission';
  return canEditContent(user, item) ? null : 'ownership';
}

export function allowedTransitions(user: User, item: ContentItem): Transition[] {
  return TRANSITIONS[item.status].filter((move) => transitionBlock(user, item, move.to) === null);
}

/** Which content a person sees by default. Freelancers and production roles see their own work only. */
export function canSeeContent(user: User, item: ContentItem, taskContentIds: Set<string>): boolean {
  if (hasPermission(user, 'content.edit_any') || hasPermission(user, 'plans.view_all') || user.role === 'admin') return true;
  if (item.ownerId === user.id || item.assigneeId === user.id || taskContentIds.has(item.id)) return true;
  if (user.role === 'freelancer' || user.role === 'designer' || user.role === 'media_editor') return false;
  return item.departmentId === user.departmentId;
}
