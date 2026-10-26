import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Permission, User } from '../../domain/users';
import { createSeed } from '../../services/demo/seed';
import * as ops from './actions';
import { hasPermission } from './permissions';
import type { WorkspaceState } from './state';

const USER_KEY = 'social-pulse-demo-user';
const DEFAULT_USER = 'u-mariam';

function readUserId(): string {
  try {
    return localStorage.getItem(USER_KEY) || DEFAULT_USER;
  } catch {
    return DEFAULT_USER;
  }
}

export interface WorkspaceApi {
  state: WorkspaceState;
  /** The person the app is showing. Until sign-in exists this is a "view as" choice, not an identity. */
  me: User;
  setMe: (id: string) => void;
  can: (permission: Permission) => boolean;
  transition: (id: string, input: ops.TransitionInput) => ops.Result;
  createContent: (input: ops.NewContentInput) => ops.Result;
  assignContent: (id: string, assigneeId: string | null) => ops.Result;
  addComment: (entity: { kind: 'content' | 'task'; id: string }, body: string) => ops.Result;
  createTask: (input: ops.NewTaskInput) => ops.Result;
  setTaskStatus: (id: string, status: Parameters<typeof ops.setTaskStatus>[3]) => ops.Result;
  setAchievementStep: (id: string, step: Parameters<typeof ops.setAchievementStep>[3], value: boolean) => ops.Result;
  editContent: (id: string, patch: ops.ContentPatch) => ops.Result;
  addAsset: (input: ops.NewAssetInput) => ops.Result;
  linkAsset: (assetId: string, contentId: string) => ops.Result;
  updateUser: (id: string, patch: ops.UserPatch) => ops.Result;
  addAchievement: (input: ops.NewAchievementInput) => ops.Result;
  setHallOfFame: (id: string, value: boolean) => ops.Result;
  markRead: (groupKey?: string) => void;
  reset: () => void;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

/**
 * Holds the demo workspace in memory. Changes last until the page reloads;
 * screens say so wherever they write. The seed is rebuilt relative to "now".
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => createSeed());
  const [meId, setMeId] = useState(readUserId);
  const stateRef = useRef(state);
  stateRef.current = state;

  const me = state.users.find((user) => user.id === meId) ?? state.users.find((user) => user.id === DEFAULT_USER)!;
  const meRef = useRef(me);
  meRef.current = me;

  const setMe = useCallback((id: string) => {
    setMeId(id);
    try {
      localStorage.setItem(USER_KEY, id);
    } catch {
      /* Not remembered across visits. */
    }
  }, []);

  /** Runs an operation against the latest state and commits it when it succeeds. */
  const run = useCallback((operation: (current: WorkspaceState, actor: User, now: string) => ops.Result) => {
    const result = operation(stateRef.current, meRef.current, new Date().toISOString());
    if (result.ok) {
      stateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);

  const api = useMemo<WorkspaceApi>(
    () => ({
      state,
      me,
      setMe,
      can: (permission) => hasPermission(me, permission),
      transition: (id, input) => run((current, actor, now) => ops.transitionContent(current, actor, id, input, now)),
      createContent: (input) => run((current, actor, now) => ops.createContent(current, actor, input, now)),
      assignContent: (id, assigneeId) => run((current, actor, now) => ops.assignContent(current, actor, id, assigneeId, now)),
      addComment: (entity, body) => run((current, actor, now) => ops.addComment(current, actor, entity, body, now)),
      createTask: (input) => run((current, actor, now) => ops.createTask(current, actor, input, now)),
      setTaskStatus: (id, status) => run((current, actor, now) => ops.setTaskStatus(current, actor, id, status, now)),
      setAchievementStep: (id, step, value) => run((current, actor) => ops.setAchievementStep(current, actor, id, step, value)),
      editContent: (id, patch) => run((current, actor, now) => ops.editContent(current, actor, id, patch, now)),
      addAsset: (input) => run((current, actor, now) => ops.addAsset(current, actor, input, now)),
      linkAsset: (assetId, contentId) => run((current, actor, now) => ops.linkAsset(current, actor, assetId, contentId, now)),
      updateUser: (id, patch) => run((current, actor, now) => ops.updateUser(current, actor, id, patch, now)),
      addAchievement: (input) => run((current, actor) => ops.addAchievement(current, actor, input)),
      setHallOfFame: (id, value) => run((current, actor) => ops.setHallOfFame(current, actor, id, value)),
      markRead: (groupKey) => {
        const next = ops.markNotificationsRead(stateRef.current, meRef.current.id, groupKey);
        stateRef.current = next;
        setState(next);
      },
      reset: () => {
        const next = createSeed();
        stateRef.current = next;
        setState(next);
      },
    }),
    [state, me, setMe, run],
  );

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return value;
}
