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

  /* Change what an element shows and let it glide to its new height, keeping its scroll position.
     `get` finds the element (again, after `mutate`, for contents that are written afresh). */
  const EASE = 'cubic-bezier(.2, .8, .2, 1)';
  function glide(get, mutate) {
    const a = get();
    if (!a || reduced() || a.closest('[hidden]')) { mutate(); return; }
    const from = a.getBoundingClientRect().height, scroll = a.scrollTop;
    mutate();
    const b = get();
    if (!b) return;
    if (scroll) b.scrollTop = scroll;
    clearTimeout(b._glideT);
    b.style.transition = 'none'; b.style.height = ''; b.style.overflow = '';
    const to = b.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1) { b.style.transition = ''; return; }
    b.style.boxSizing = 'border-box'; b.style.overflow = 'hidden'; b.style.height = `${from}px`;
    void b.offsetHeight;
    b.style.transition = `height 0.34s ${EASE}`;
    b.style.height = `${to}px`;
    b._glideT = setTimeout(() => { b.style.height = ''; b.style.transition = ''; b.style.overflow = ''; b.style.boxSizing = ''; }, 360);
  }

  /* Show or hide something that floats over a card (a panel, the fish card): it comes in with its
     own CSS entrance, and on the way out it plays `.ov-out` before hiding (then `done`). */
  function overlay(el, show, done) {
    if (!el) return;
    clearTimeout(el._ovT);
    if (show) { el.classList.remove('ov-out'); el.hidden = false; return; }
    if (el.hidden) { if (done) done(); return; }
    if (reduced()) { el.hidden = true; if (done) done(); return; }
    el.classList.add('ov-out');
    el._ovT = setTimeout(() => { el.hidden = true; el.classList.remove('ov-out'); if (done) done(); }, 210);
  }
  const leaving = el => !!el && el.classList.contains('ov-out');

  /* Walk over to another place (another tank): the one you are leaving drifts back and aside, and the
     next comes forward from the other side into focus, the card gliding to its new height. `also`
     (the heading) slides in with it. */
  function visit(card, region, mutate, dir = 1, also) {
    if (!card || card.closest('[hidden]') || reduced()) { mutate(); return; }
    clearTimeout(region._visitT);
    region.style.setProperty('--vd', dir < 0 ? -1 : 1);
    region.classList.remove('visit-in');
    region.classList.add('visit-out');
    region._visitT = setTimeout(() => {
      region.classList.remove('visit-out');
      morph(card, mutate);
      void region.offsetWidth;
      region.classList.add('visit-in');
      for (const el of also || []) { el.classList.remove('swap-in', 'swap-in-l', 'swap-in-r'); void el.offsetWidth; el.classList.add(dir < 0 ? 'swap-in-l' : 'swap-in-r'); }
      region._visitT = setTimeout(() => region.classList.remove('visit-in'), 700);
    }, 210);
  }

  return { morph, swap, glide, overlay, leaving, visit, reduced };
})();
