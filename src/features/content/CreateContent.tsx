import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useRouter } from '../../app/router/router';
import type { ContentType } from '../../domain/content';
import type { DepartmentId } from '../../domain/users';

export interface CreatePrefill {
  templateId?: string;
  courseId?: string;
  departmentId?: DepartmentId;
  title?: string;
  type?: ContentType;
  caption?: string;
  dueDate?: string;
}

export const CREATE_PREFILL_KEY = 'engosoft-create-prefill';
interface CreateApi { open: (prefill?: CreatePrefill) => void }
const CreateContext = createContext<CreateApi | null>(null);

/** Every Create Content entry opens the creative workspace. Source context is carried into the prompt. */
export function CreateContentProvider({ children }: { children: ReactNode }) {
  const { navigate } = useRouter();
  const open = useCallback((prefill: CreatePrefill = {}) => {
    sessionStorage.setItem(CREATE_PREFILL_KEY, JSON.stringify(prefill));
    navigate(`/?create=${Date.now()}`);
  }, [navigate]);
  const api = useMemo(() => ({ open }), [open]);
  return <CreateContext.Provider value={api}>{children}</CreateContext.Provider>;
}

export function useCreateContent(): CreateApi {
  const value = useContext(CreateContext);
  if (!value) throw new Error('useCreateContent must be used inside CreateContentProvider.');
  return value;
}
