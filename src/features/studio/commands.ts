/** Every editor command on the current selection, shared by the panel, the quick bar, the context menu and the keyboard. */
import type { StudioDoc } from '../../domain/studio';
import { alignLayers, arrangeLayers, distributeLayers, duplicateLayers, groupLayers, removeLayers, ungroupLayers, updateLayers, type AlignEdge, type Arrange, type Heights } from './edit';

export type StudioCommand =
  | 'duplicate' | 'delete' | 'lock' | 'hide' | 'group' | 'ungroup' | 'flip-x' | 'flip-y' | 'select-all'
  | Arrange | `align-${AlignEdge}` | 'distribute-x' | 'distribute-y';

export interface CommandResult { doc: StudioDoc; selection: string[] }

export function runCommand(doc: StudioDoc, selection: string[], command: StudioCommand, heights: Heights): CommandResult {
  const picked = doc.layers.filter((l) => selection.includes(l.id));
  switch (command) {
    case 'select-all': return { doc, selection: doc.layers.filter((l) => !l.hidden && !l.locked).map((l) => l.id) };
    case 'duplicate': { const r = duplicateLayers(doc, selection); return { doc: r.doc, selection: r.ids }; }
    case 'delete': {
      const next = removeLayers(doc, selection);
      return { doc: next, selection: selection.filter((id) => next.layers.some((l) => l.id === id)) };
    }
    case 'lock': { const locked = !picked.every((l) => l.locked); return { doc: updateLayers(doc, selection, { locked: locked || undefined }), selection }; }
    case 'hide': { const hidden = !picked.every((l) => l.hidden); return { doc: updateLayers(doc, selection, { hidden: hidden || undefined }), selection }; }
    case 'group': return { doc: groupLayers(doc, selection), selection };
    case 'ungroup': return { doc: ungroupLayers(doc, selection), selection };
    case 'flip-x': return { doc: updateLayers(doc, selection, (l) => (l.kind === 'image' ? { flipX: !l.flipX } : {})), selection };
    case 'flip-y': return { doc: updateLayers(doc, selection, (l) => (l.kind === 'image' ? { flipY: !l.flipY } : {})), selection };
    case 'forward': case 'backward': case 'front': case 'back': return { doc: arrangeLayers(doc, selection, command), selection };
    case 'distribute-x': return { doc: distributeLayers(doc, selection, 'x', heights), selection };
    case 'distribute-y': return { doc: distributeLayers(doc, selection, 'y', heights), selection };
    default: return { doc: alignLayers(doc, selection, command.slice('align-'.length) as AlignEdge, heights), selection };
  }
}

/** Whether the selection can be grouped (several layers not already one group) or ungrouped. */
export function groupState(doc: StudioDoc, selection: string[]): { canGroup: boolean; canUngroup: boolean } {
  const picked = doc.layers.filter((l) => selection.includes(l.id));
  const groups = new Set(picked.map((l) => l.group ?? `solo:${l.id}`));
  return { canGroup: picked.length > 1 && groups.size > 1, canUngroup: picked.some((l) => l.group) };
}
