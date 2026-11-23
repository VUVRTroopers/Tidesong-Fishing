/* Tidesong — interface motion. Cards glide to their new size when their contents change, and new
   content slides in from the direction it came from, so menus never jump. Respects reduced motion. */
'use strict';

const UIFX = (() => {
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const GLIDE = 'height 0.38s cubic-bezier(.2, .8, .2, 1), transform 0.45s cubic-bezier(.2, .9, .3, 1.15)';

  /* Run `mutate`, then let `card` glide from its old height to its new one.
     o.swap: an element whose new contents should slide in; o.dir: -1 from the left, 1 from the right, 0 from below. */
  function morph(card, mutate, o = {}) {
    if (!card || card.closest('[hidden]') || reduced()) { mutate(); return; }
    clearTimeout(card._glideT);
    // heights are measured on the layout box (transforms ignored) and applied to the content box
    const cs = getComputedStyle(card);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const from = card.offsetHeight;
    card.style.transition = 'none';
    card.style.height = '';
    mutate();
    if (o.swap) {
      const el = o.swap;
      el.classList.remove('swap-in', 'swap-in-l', 'swap-in-r');
      void el.offsetWidth;
      el.classList.add(o.dir > 0 ? 'swap-in-r' : o.dir < 0 ? 'swap-in-l' : 'swap-in');
    }
    const to = card.offsetHeight;
    if (Math.abs(to - from) < 1) { card.style.transition = ''; return; }
    card.style.height = `${from - pad}px`;
    void card.offsetHeight;
    card.style.transition = GLIDE;
    card.style.height = `${to - pad}px`;
    card._glideT = setTimeout(() => { card.style.height = ''; card.style.transition = ''; }, 420);
  }

  /* Fade a region's current contents out briefly, then swap in new ones with a glide. */
  function swap(card, region, mutate, dir = 0) {
    if (!card || card.closest('[hidden]') || reduced()) { mutate(); return; }
    clearTimeout(region._swapT);
    region.classList.add('swap-out');
    region._swapT = setTimeout(() => {
      region.classList.remove('swap-out');
      morph(card, mutate, { swap: region, dir });
    }, 110);
  }

  return { morph, swap, reduced };
})();
