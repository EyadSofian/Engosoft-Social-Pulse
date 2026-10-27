import { useCallback, useReducer } from 'react';

/**
 * Undo history for the Studio document.
 * - `apply` records one step.
 * - `live` changes the document without a step (dragging, typing, sliders); the first live change
 *   remembers where it started, and `commit` turns everything since then into one step.
 */
interface State<T> { past: T[]; present: T | null; future: T[]; pending: T | null }
type Action<T> = { type: 'reset'; value: T | null } | { type: 'apply'; value: T } | { type: 'live'; value: T } | { type: 'commit' } | { type: 'undo' } | { type: 'redo' };

const LIMIT = 80;
function settle<T>(s: State<T>): State<T> {
  if (!s.pending || s.pending === s.present) return { ...s, pending: null };
  return { ...s, past: [...s.past.slice(-LIMIT), s.pending], future: [], pending: null };
}

function reducer<T>(s: State<T>, a: Action<T>): State<T> {
  switch (a.type) {
    case 'reset': return { past: [], present: a.value, future: [], pending: null };
    case 'apply': {
      if (a.value === s.present) return s;
      const base = s.pending ?? s.present;
      return { past: base ? [...s.past.slice(-LIMIT), base] : s.past, present: a.value, future: [], pending: null };
    }
    case 'live': return { ...s, pending: s.pending ?? s.present, present: a.value };
    case 'commit': return settle(s);
    case 'undo': {
      const t = settle(s);
      if (!t.past.length || !t.present) return t;
      return { past: t.past.slice(0, -1), present: t.past[t.past.length - 1], future: [t.present, ...t.future], pending: null };
    }
    case 'redo': {
      const t = settle(s);
      if (!t.future.length || !t.present) return t;
      return { past: [...t.past, t.present], present: t.future[0], future: t.future.slice(1), pending: null };
    }
  }
}

export function useHistory<T>() {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: null, future: [], pending: null });
  return {
    present: state.present,
    canUndo: state.past.length > 0 || (state.pending !== null && state.pending !== state.present),
    canRedo: state.future.length > 0,
    reset: useCallback((value: T | null) => dispatch({ type: 'reset', value }), []),
    apply: useCallback((value: T) => dispatch({ type: 'apply', value }), []),
    live: useCallback((value: T) => dispatch({ type: 'live', value }), []),
    commit: useCallback(() => dispatch({ type: 'commit' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  };
}
