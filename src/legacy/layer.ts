/**
 * Legacy overlays (drawers, modals, hover cards) portal out of the calendar's
 * DOM. They render into this body-level `.lg` element so the scoped legacy
 * styles still apply to them.
 */
export function legacyLayer(): HTMLElement {
  let layer = document.getElementById('lg-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'lg-layer';
    layer.className = 'lg lg-layer';
    // The legacy calendar is Arabic-only.
    layer.dir = 'rtl';
    layer.lang = 'ar';
    document.body.appendChild(layer);
  }
  return layer;
}
