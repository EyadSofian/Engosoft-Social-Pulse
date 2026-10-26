import { useEffect } from 'react';

/** Surfaces that light up under the pointer. */
const SPOTLIGHT = '.ui-card, .ui-stat, .glass, .board-card, .library-card, .template-card, .creative-home__hero, .creative-job__card, .creative-home__direction';

/**
 * The living backdrop behind every screen: slow drifting brand-color orbs over a faint grid, plus a
 * soft light that follows the pointer across cards. Pure CSS animation on transforms only, paused for
 * reduced motion and when the tab is hidden.
 */
export function Ambient() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches) return;
    const root = document.documentElement;
    let frame = 0;
    let lit: HTMLElement | null = null;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty('--px', `${event.clientX}px`);
        root.style.setProperty('--py', `${event.clientY}px`);
        const card = (event.target as Element | null)?.closest?.(SPOTLIGHT) as HTMLElement | null;
        if (lit && lit !== card) lit.removeAttribute('data-lit');
        lit = card;
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - box.left}px`);
        card.style.setProperty('--my', `${event.clientY - box.top}px`);
        card.setAttribute('data-lit', '');
      });
    };
    const onLeave = () => {
      lit?.removeAttribute('data-lit');
      lit = null;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden>
      <span className="ambient__orb ambient__orb--a" />
      <span className="ambient__orb ambient__orb--b" />
      <span className="ambient__orb ambient__orb--c" />
      <span className="ambient__orb ambient__orb--d" />
      <span className="ambient__aurora" />
      <span className="ambient__grid" />
      <span className="ambient__dots" />
      <span className="ambient__dots ambient__dots--far" />
      <span className="ambient__cursor" />
    </div>
  );
}
