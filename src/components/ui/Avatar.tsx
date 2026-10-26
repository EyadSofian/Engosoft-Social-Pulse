import type { User } from '../../domain/users';
import { EXTERNAL_OWNER } from '../../services/adapters/live';

/** Stable, quiet tint per person: hue from the name, low chroma. */
function hue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function initials(name: string) {
  const parts = name.replace(/^(Dr|Eng)\.\s*/, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ name, size = 28, title }: { name: string; size?: number; title?: string }) {
  const h = hue(name);
  return (
    <span
      className="ui-avatar"
      title={title ?? name}
      aria-hidden={!title}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)), ['--h' as string]: h }}
    >
      {initials(name)}
    </span>
  );
}

/** Resolves a user id, or a calendar owner name, to a display name. */
export function displayName(users: User[], id: string | null | undefined): string {
  if (!id) return '';
  if (id.startsWith(EXTERNAL_OWNER)) return id.slice(EXTERNAL_OWNER.length);
  return users.find((user) => user.id === id)?.name ?? '';
}

export function Person({ users, id, size = 22, empty }: { users: User[]; id: string | null | undefined; size?: number; empty?: string }) {
  const name = displayName(users, id);
  if (!name) return <span className="u-muted">{empty ?? '—'}</span>;
  return (
    <span className="ui-person">
      <Avatar name={name} size={size} />
      <span className="u-truncate">{name}</span>
    </span>
  );
}
