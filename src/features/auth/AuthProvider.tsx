import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { Text } from '../../domain/shared';
import type { DepartmentId, Permission, RoleId } from '../../domain/users';
import { api, ApiError, SESSION_ENDED } from '../../lib/api';
import { LoginPage } from './LoginPage';

export interface SessionUser { id: string; name: string; email: string; role: RoleId; departmentId: DepartmentId | null; title: string; status: 'active' | 'suspended'; lastActiveAt: string | null; permissionOverrides?: Partial<Record<Permission, boolean>> }
interface MeResponse { user: SessionUser; permissions: Permission[]; roles: { id: RoleId; name: Text; description?: Text; permissions?: Permission[] }[]; departments: { id: DepartmentId; name: Text }[] }
export interface AuthApi extends MeResponse { can: (permission: Permission) => boolean; logout: () => Promise<void> }

const AuthContext = createContext<AuthApi | null>(null);

/** Nothing renders until the server confirms a session; without one the login screen shows. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'signed-in'>('loading');

  const refresh = useCallback(async () => {
    try { setMe(await api<MeResponse>('/api/auth/me')); setState('signed-in'); }
    catch (error) { if (error instanceof ApiError && error.status === 401) { setMe(null); setState('signed-out'); } else setState(current => current === 'signed-in' ? current : 'signed-out'); }
  }, []);
  useEffect(() => { void refresh(); const onFocus = () => { void refresh(); }; window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, [refresh]);
  useEffect(() => {
    const ended = () => { setMe(null); setState('signed-out'); };
    window.addEventListener(SESSION_ENDED, ended);
    return () => window.removeEventListener(SESSION_ENDED, ended);
  }, []);

  const logout = useCallback(async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); setState('signed-out'); }, []);

  return <AnimatePresence mode="wait">
    {state === 'loading' && <motion.div key="loading" className="auth-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Loader2 className="auth-spin" size={28} /></motion.div>}
    {state === 'signed-out' && <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }}><LoginPage onSignedIn={refresh} /></motion.div>}
    {state === 'signed-in' && me && <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <AuthContext.Provider value={{ ...me, can: (permission) => me.permissions.includes(permission), logout }}>{children}</AuthContext.Provider>
    </motion.div>}
  </AnimatePresence>;
}

export function useAuth(): AuthApi {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
