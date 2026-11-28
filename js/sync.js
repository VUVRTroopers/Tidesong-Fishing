/* Tidesong — your progress on every device.
   Sign in with Google (Facebook and Apple are ready, switched on in PROVIDERS once set up) and the save
   is kept in the cloud (Firebase: Authentication, and one Firestore document per player, saves/{uid}).
   Nothing loads for players who never sign in: Firebase is fetched only once a sign-in button is in
   view, or for a player who signed in before.

   How the two copies stay together: the cloud document carries the save and the time it was written
   (`at`). This device remembers the `at` it last saw (`base`) and whether it has changed the save since
   (`dirty`). On opening, on coming back to the game, and a few seconds after any change:
   - the cloud has what this device last saw: send this device's changes, if any;
   - the cloud has moved on and this device has not: take the cloud's (the page reloads with it);
   - both have moved on (or a device with its own progress signs in for the first time): the player
     picks which to keep, from two cards (level, pearls, fish, when).
   Writes go through a transaction that only replaces the version this device last saw, so one device
   never overwrites another's newer progress without asking.

   Signing in gives a bonus of Moonpearls, once. It belongs to the account's progress, whichever device
   that comes from: every save the cloud keeps has had it (its gifts list says so), so a save sent up
   without it (a first sign-in, or the other device's progress chosen over the one that had it) gets it
   then, and a save that has had it never gets it again, from any account. */
const Sync = (() => {
  const CONFIG = {
    apiKey: 'AIzaSyDQ95-aRzG046LX-Ons0sd-40-szi_RLH8',
    authDomain: 'tidesong-fishing.firebaseapp.com',
    projectId: 'tidesong-fishing',
    storageBucket: 'tidesong-fishing.firebasestorage.app',
    messagingSenderId: '37419310334',
    appId: '1:37419310334:web:a561faf9e21287206dd9af',
  };
  // which sign-ins are offered (each must also be switched on in the Firebase console)
  const PROVIDERS = { google: true, facebook: false, apple: false };
  const BONUS = 1500, BONUS_ID = 'sync1500';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const META_KEY = 'tidesong.sync.v1', NOTE_KEY = 'tidesong.sync.note';

  let api = null, be = null, beP = null, listening = false, user = null;
  let pushT = 0, busy = false, lastPull = 0, failed = false, popOpen = false;
  const sub = new Set();

  /* ---------- what this device remembers ---------- */
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
  let meta = readMeta();
  const writeMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ } };
  if (!meta.dev) { meta.dev = Math.random().toString(36).slice(2, 10); writeMeta(); }

  /* ---------- the backend ---------- */
  function backend() {
    if (window.TidesongSyncBackend) return Promise.resolve(window.TidesongSyncBackend); // tests
    if (!beP) beP = (async () => {
      const [App, A, F] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(SDK + f)));
      const app = App.initializeApp(CONFIG), auth = A.getAuth(app), db = F.getFirestore(app);
      const make = { google: () => new A.GoogleAuthProvider(), facebook: () => new A.FacebookAuthProvider(), apple: () => new A.OAuthProvider('apple.com') };
      const ref = uid => F.doc(db, 'saves', uid);
      return {
        onUser: cb => A.onAuthStateChanged(auth, u => cb(u && { uid: u.uid, name: u.displayName || u.email || '', provider: ((u.providerData || [])[0] || {}).providerId || '' })),
        signIn: async p => {
          try { await A.signInWithPopup(auth, make[p]()); }
          catch (e) {
            // a browser that blocks the popup goes the long way round, through a redirect
            if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
              meta.pending = true; writeMeta();
              await A.signInWithRedirect(auth, make[p]());
            }
            else throw e;
          }
        },
        signOut: () => A.signOut(auth),
        get: async uid => { const s = await F.getDoc(ref(uid)); return s.exists() ? s.data() : null; },
        tx: (uid, fn) => F.runTransaction(db, async t => {
          const s = await t.get(ref(uid)), next = fn(s.exists() ? s.data() : null);
          if (next) t.set(ref(uid), next);
          return !!next;
        }),
      };
    })();
    return beP;
  }
  // load the backend (once) and follow who is signed in
  function ready() {
    return backend().then(b => {
      be = b;
      if (!listening) { listening = true; b.onUser(onUser); }
      return b;
    });
  }
  const warm = () => { if (enabled()) ready().catch(() => { failed = true; render(); }); };
  const enabled = () => Object.values(PROVIDERS).some(Boolean);

  /* ---------- signing in and out ---------- */
  function signIn(p) {
    if (!PROVIDERS[p]) return;
    failed = false;
    api.play('click');
    const go = b => b.signIn(p).catch(e => {
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
      failed = true; render();
      api.toast('Signing in didn’t work this time. Please try again.', '#ff9a8a', 4000);
    });
    // straight from the tap when Firebase is already here, so the sign-in window is allowed to open
    if (be) go(be); else ready().then(go, () => { failed = true; render(); });
  }
  function signOut() {
    if (!be) return;
    api.play('click');
    be.signOut().catch(() => {});
    meta = { dev: meta.dev }; writeMeta();
    user = null; render();
    api.toast('Signed out. Your progress stays on this device.', '#9fe3b0', 3600);
  }
  function onUser(u) {
    if (!u) {
      // signed out (here or elsewhere): this device keeps its save, and stops syncing
      if (meta.uid || meta.pending) { meta = { dev: meta.dev }; writeMeta(); }
      user = null; render(); return;
    }
    user = u;
    delete meta.pending;
    if (meta.uid !== u.uid) { meta = { dev: meta.dev, uid: u.uid, base: null, dirty: true }; }
    meta.name = u.name; meta.provider = u.provider; writeMeta();
    render();
    pull(true);
  }

  /* ---------- keeping the two copies together ---------- */
  const hasBonus = s => (s.gifts || []).includes(BONUS_ID);
  const summary = s => ({ level: api.levelOf(s.xp || 0), pearls: s.pearls || 0, fish: (s.net || []).length, kinds: Object.keys(s.caught || {}).length, total: s.total || 0 });
  // a device that has hardly been played yet simply takes the cloud's save
  const slight = s => (s.total || 0) <= 3 && !(s.netTier > 0);

  async function pull(force) {
    if (!user || !be || busy) return;
    if (!force && Date.now() - lastPull < 15000) return;
    busy = true; lastPull = Date.now();
    try {
      const doc = await be.get(user.uid), local = api.getSave();
      if (!doc) { await push(); return; }
      // up to date: send any changes, and a save that has never had the thank-you gets it now
      if (meta.base && doc.at === meta.base) { if (meta.dirty || !hasBonus(local)) await push(); return; }
      // the cloud has moved on since this device last looked
      if (doc.save === JSON.stringify(local)) { meta.base = doc.at; meta.dirty = false; writeMeta(); render(); return; }
      if (meta.base ? !meta.dirty : slight(local)) { adopt(doc); return; }
      choose(doc);
    } catch (e) { failed = true; render(); }
    finally { busy = false; }
  }
  // send this device's save, replacing only the version it last saw (unless the player chose this one)
  async function push(overwrite) {
    if (!user || !be) return;
    clearTimeout(pushT);
    const s = api.getSave(), uid = user.uid;
    let grant = false, sent = null;
    const ok = await be.tx(uid, cur => {
      if (cur && !overwrite && cur.at !== meta.base) return null;
      // every save the cloud keeps has had the thank-you: this one gets it now if it never has
      grant = !hasBonus(s);
      const copy = JSON.parse(JSON.stringify(s));
      if (grant) { copy.pearls = (copy.pearls || 0) + BONUS; copy.gifts = (copy.gifts || []).concat(BONUS_ID); }
      sent = { v: 1, save: JSON.stringify(copy), at: Math.max(Date.now(), (cur && cur.at || 0) + 1), dev: meta.dev, bonus: true, sum: summary(copy) };
      return sent;
    });
    if (!ok) { busy = false; lastPull = 0; return pull(true); } // someone else wrote first: look again
    meta.base = sent.at; meta.dirty = false; meta.syncedAt = Date.now(); failed = false; writeMeta();
    if (grant) api.grant(BONUS, BONUS_ID);
    render();
  }
  // take the cloud's save: write it where the game keeps its save and start again with it
  function adopt(doc) {
    Sync.frozen = true;
    try {
      localStorage.setItem(api.saveKey, doc.save);
      meta.base = doc.at; meta.dirty = false; meta.syncedAt = Date.now(); writeMeta();
      sessionStorage.setItem(NOTE_KEY, 'loaded');
    } catch (e) { Sync.frozen = false; return; }
    location.reload();
  }
  // the game saved: mark it, and send it a few seconds later (sooner if the game is put away)
  function changed() {
    if (Sync.frozen || !meta.uid) return;
    if (!meta.dirty) { meta.dirty = true; writeMeta(); }
    clearTimeout(pushT);
    pushT = setTimeout(() => { if (!busy) push().catch(() => { failed = true; render(); }); }, 4000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!user) return;
    if (document.hidden) { if (meta.dirty && !busy) push().catch(() => {}); }
    else pull();
  });

  /* ---------- choosing between two saves ---------- */
  const ago = ms => {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 2 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
  };
  function choose(doc) {
    // never in the middle of a catch: ask once things are calm
    if (api.busy()) { setTimeout(() => choose(doc), 4000); return; }
    const card = (which, s, when) => `
      <button type="button" class="sync-save" data-keep="${which}">
        <span class="ss-where">${which === 'here' ? DEVICE : CLOUD}<b>${which === 'here' ? 'This device' : 'Your other device'}</b></span>
        <span class="ss-stats">
          <span><small>Level</small><b>${s.level}</b></span>
          <span><small>Moonpearls</small><b><i class="pearl" aria-hidden="true"></i>${api.fmt(s.pearls)}</b></span>
          <span><small>Fish kept</small><b>${s.fish}</b></span>
          <span><small>Kinds found</small><b>${s.kinds}</b></span>
        </span>
        <span class="ss-when">${when}</span>
        <span class="ss-keep">Keep this one</span>
      </button>`;
    const el = document.getElementById('sync-choose');
    el.querySelector('.sync-saves').innerHTML = card('here', summary(api.getSave()), 'Playing now') + card('cloud', doc.sum || summary(JSON.parse(doc.save)), `Played ${ago(doc.at)}`);
    el._doc = doc;
    api.openModal('#sync-choose');
  }
  function onChoose(e) {
    const b = e.target.closest('[data-keep]'), el = document.getElementById('sync-choose');
    if (!b || !el._doc) return;
    const doc = el._doc; el._doc = null;
    api.closeModal('#sync-choose');
    if (b.dataset.keep === 'cloud') adopt(doc);
    else push(true).catch(() => { failed = true; render(); });
  }

  /* ---------- moving a save by hand ----------
     For when signing in can't happen here (an app's own browser, such as Snapchat's or Instagram's,
     where Google refuses to sign in): the whole save as one dense code (compressed, then base64), to
     copy here and paste into the game in a proper browser, where it can then be signed in and synced.
     Codes start "TS1." (compressed) or "TS0." (plain, for browsers without compression). */
  const UA = navigator.userAgent || '';
  const inApp = /Snapchat|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Line\/|TikTok|musical_ly|Bytedance|Twitter|LinkedInApp|Pinterest|GSA\//i.test(UA) || (/Android/.test(UA) && /; wv\)/.test(UA));
  const isIOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  // a way out of an app's browser into the phone's own (iOS 17 and later, and Android)
  const outHref = () => isIOS ? `x-safari-${location.href.split('#')[0]}` : `intent://${location.host}${location.pathname}#Intent;scheme=https;end`;
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
  async function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) {
      const z = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
      return 'TS1.' + b64u(z);
    }
    return 'TS0.' + b64u(bytes);
  }
  async function decode(text) {
    const str = String(text || '').replace(/\s+/g, '');
    if (str.startsWith('{')) return JSON.parse(str);
    const m = /^TS([01])\.([A-Za-z0-9_-]+)$/.exec(str);
    if (!m) throw new Error('not a save code');
    let bytes = unb64u(m[2]);
    if (m[1] === '1') {
      if (!window.DecompressionStream) throw new Error('this browser cannot read that code');
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const looksLikeSave = o => o && typeof o === 'object' && Array.isArray(o.net) && typeof o.pearls === 'number' && o.caught && typeof o.caught === 'object';
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
    try {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch (e) { return false; }
  }
  let ioMode = null, ioSave = null;
  function openIO(mode) {
    popOpen = false; render();
    ioMode = mode; ioSave = null;
    const el = document.getElementById('save-io');
    el.querySelector('.sio-body').innerHTML = mode === 'out'
      ? `<h2>${COPY_ICO}Your save</h2>
         <p class="sio-note">Copy this code, open the game in your phone's browser, and paste it there with <b>Paste a save</b>.</p>
         <textarea class="sio-code" readonly rows="4" aria-label="Your save code">Making your code…</textarea>
         <div class="sio-acts"><button type="button" class="primary-btn" data-io="copy">${COPY_ICO}Copy</button>${inApp ? `<a class="secondary-btn" href="${esc(outHref())}" data-io="out">${OUT_ICO}Open in browser</a>` : ''}<span class="sio-status" aria-live="polite"></span></div>`
      : `<h2>${PASTE_ICO}Paste a save</h2>
         <p class="sio-note">Paste a code copied from the game on another browser or device. It replaces the progress here.</p>
         <textarea class="sio-code" rows="4" placeholder="TS1.…" aria-label="Save code"></textarea>
         <div class="sio-found" hidden></div>
         <div class="sio-acts"><button type="button" class="primary-btn" data-io="check">Check code</button><span class="sio-status" aria-live="polite"></span></div>`;
    api.openModal('#save-io');
    if (mode === 'out') encode(api.getSave()).then(code => {
      const ta = el.querySelector('.sio-code'); if (!ta) return;
      ta.value = code; ta.dataset.ready = '1';
      el.querySelector('.sio-status').textContent = `${Math.ceil(code.length / 1024)} KB`;
    }).catch(() => { el.querySelector('.sio-status').textContent = 'Couldn’t make a code here.'; });
  }
  async function onIO(e) {
    const b = e.target.closest('[data-io]'), el = document.getElementById('save-io');
    if (!b) { if (e.target.classList && e.target.classList.contains('sio-code') && ioMode === 'out') e.target.select(); return; }
    const status = el.querySelector('.sio-status'), ta = el.querySelector('.sio-code');
    if (b.dataset.io === 'copy') {
      if (!ta.dataset.ready) return;
      const ok = await copyText(ta.value);
      if (!ok) { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); }
      status.textContent = ok ? 'Copied ✓' : 'Selected: copy it from the menu';
      status.classList.toggle('ok', ok);
      api.play('click');
    } else if (b.dataset.io === 'check') {
      try {
        const o = await decode(ta.value);
        if (!looksLikeSave(o)) throw new Error('not a save');
        ioSave = o;
        const a = summary(api.getSave()), n = summary(o);
        const box = el.querySelector('.sio-found');
        box.hidden = false;
        box.innerHTML = `<div class="sio-cmp"><span><small>Here now</small><b>Lv ${a.level}</b><i><i class="pearl" aria-hidden="true"></i>${api.fmt(a.pearls)}</i><i>${a.fish} fish</i></span><span class="sio-arrow" aria-hidden="true">→</span><span class="new"><small>This code</small><b>Lv ${n.level}</b><i><i class="pearl" aria-hidden="true"></i>${api.fmt(n.pearls)}</i><i>${n.fish} fish</i></span></div>`;
        b.dataset.io = 'load'; b.textContent = 'Load this save';
        status.textContent = ''; status.classList.remove('ok');
        api.play('select');
      } catch (err) {
        status.textContent = /cannot read/.test(err.message) ? 'This browser can’t read that code: try another browser.' : 'That doesn’t look like a whole save code. Copy it again, all of it.';
        status.classList.remove('ok');
      }
    } else if (b.dataset.io === 'load' && ioSave) {
      Sync.frozen = true;
      try {
        localStorage.setItem(api.saveKey, JSON.stringify(ioSave));
        // signed in here: the loaded save goes up to the account next
        if (meta.uid) { meta.dirty = true; writeMeta(); }
        sessionStorage.setItem(NOTE_KEY, 'imported');
      } catch (err) { Sync.frozen = false; status.textContent = 'Couldn’t save it here.'; return; }
      location.reload();
    }
  }
  // typing a new code forgets the one checked
  function onIOInput(e) {
    if (!e.target.classList.contains('sio-code') || ioMode !== 'in') return;
    const b = document.querySelector('#save-io [data-io="load"]');
    if (b) { b.dataset.io = 'check'; b.textContent = 'Check code'; document.querySelector('#save-io .sio-found').hidden = true; ioSave = null; }
  }

  /* ---------- the little bits of interface ---------- */
  const G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const F_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.1 12.6l.4-2.7h-2.6V8.2c0-.7.4-1.5 1.5-1.5h1.2V4.4s-1.1-.2-2.1-.2c-2.2 0-3.6 1.3-3.6 3.7v2h-2.4v2.7h2.4V19h3V12.6z"/></svg>';
  const A_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.3.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.8-4.2zM13.9 5.2c.7-.8 1.2-2 1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.2-.6 2.9-1.4z"/></svg>';
  const CLOUD_PATH = 'M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.5 9.2 4.7 4.7 0 0 0 7 18.5z';
  const CLOUD = `<svg class="sync-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${CLOUD_PATH}"/></svg>`;
  const CLOUD_OK = `<svg class="sync-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${CLOUD_PATH}"/><path class="tick" d="M9.4 13.6l1.9 1.9 3.6-3.8"/></svg>`;
  const COPY_ICO = '<svg class="ln-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>';
  const PASTE_ICO = '<svg class="ln-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6v2.5H9z"/><path d="M15 5.5h1.8a1.7 1.7 0 0 1 1.7 1.7v11.6a1.7 1.7 0 0 1-1.7 1.7H7.2a1.7 1.7 0 0 1-1.7-1.7V7.2a1.7 1.7 0 0 1 1.7-1.7H9"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/></svg>';
  const OUT_ICO = '<svg class="ln-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 5.5h5v5M18.5 5.5l-7.5 7.5"/><path d="M16.5 13.5v4.3a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V9.2a1.7 1.7 0 0 1 1.7-1.7h4.3"/></svg>';
  const DEVICE = '<svg class="sync-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 18.5h3"/></svg>';
  const BONUS_CHIP = `<span class="sync-bonus" data-tip="A thank-you for signing in: once per player"><i class="pearl" aria-hidden="true"></i>+${(1500).toLocaleString('en-US')}</span>`;
  const buttons = () => [
    PROVIDERS.google && `<button type="button" class="sync-prov google" data-sync="google">${G_LOGO}<span>Google</span></button>`,
    PROVIDERS.facebook && `<button type="button" class="sync-prov facebook" data-sync="facebook">${F_LOGO}<span>Facebook</span></button>`,
    PROVIDERS.apple && `<button type="button" class="sync-prov apple" data-sync="apple">${A_LOGO}<span>Apple</span></button>`,
  ].filter(Boolean).join('');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const bonusOpen = () => !hasBonus(api.getSave());

  const SAVE_ROW = `<div class="sp-save"><button type="button" class="text-btn" data-sync="copy">${'<svg class="ln-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>'}Copy save</button><button type="button" class="text-btn" data-sync="paste">${'<svg class="ln-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5h6v2.5H9z"/><path d="M15 5.5h1.8a1.7 1.7 0 0 1 1.7 1.7v11.6a1.7 1.7 0 0 1-1.7 1.7H7.2a1.7 1.7 0 0 1-1.7-1.7V7.2a1.7 1.7 0 0 1 1.7-1.7H9"/><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/></svg>'}Paste a save</button></div>`;
  // inside an app's own browser, Google won't sign in: say so, and show the way out
  const IN_APP = `<p class="sp-inapp">Sign-in doesn't work inside this app's browser. Copy your save, open the game in your phone's browser, and paste it there.</p>`;
  function render() {
    if (!api) return;
    const signedIn = !!(user || meta.uid);
    // the welcome card: a quiet row under "Start fishing"
    const intro = document.getElementById('intro-sync');
    if (intro) {
      intro.hidden = !enabled() || signedIn;
      if (!intro.hidden && !intro.dataset.on) {
        intro.dataset.on = '1';
        intro.innerHTML = inApp
          ? `<span class="sync-lead">${CLOUD}To save your progress to an account, open the game in your phone's browser</span><a class="secondary-btn sync-out" href="${esc(outHref())}">${OUT_ICO}Open in browser</a>`
          : `<span class="sync-lead">${CLOUD}Play on all your devices</span><span class="sync-provs">${buttons()}</span>${bonusOpen() ? BONUS_CHIP : ''}`;
      }
    }
    // the scrapbook's cloud button, and its little panel
    const btn = document.getElementById('book-sync');
    if (btn) {
      btn.hidden = !enabled();
      btn.classList.toggle('on', signedIn);
      btn.classList.toggle('err', signedIn && failed);
      btn.innerHTML = (signedIn ? CLOUD_OK : CLOUD) + (!signedIn && bonusOpen() ? '<i class="sync-dot pearl" aria-hidden="true"></i>' : '');
      btn.setAttribute('aria-label', signedIn ? 'Synced to your account' : 'Play on all your devices');
      btn.setAttribute('aria-expanded', String(popOpen));
    }
    const pop = document.getElementById('sync-pop');
    if (pop) {
      pop.hidden = !popOpen;
      if (popOpen) pop.innerHTML = signedIn
        ? `<p class="sp-who">${CLOUD_OK}<span><b>${esc(meta.name || 'Signed in')}</b><small>${failed ? 'Can’t reach the cloud right now: your progress is safe here and will sync later' : meta.syncedAt ? `Synced ${ago(meta.syncedAt)}` : 'Syncing…'}</small></span></p>
           ${hasBonus(api.getSave()) ? `<p class="sp-got"><i class="pearl" aria-hidden="true"></i>+${(BONUS).toLocaleString('en-US')} thank-you pearls received</p>` : ''}
           <button type="button" class="secondary-btn sp-out" data-sync="out">Sign out</button>${SAVE_ROW}`
        : `<p class="sp-lead">${CLOUD}<b>Play on all your devices</b></p>${inApp ? IN_APP : `<span class="sync-provs">${buttons()}</span>${bonusOpen() ? BONUS_CHIP : ''}`}${SAVE_ROW}`;
    }
    for (const f of sub) f();
  }
  function togglePop(open) {
    popOpen = open === undefined ? !popOpen : open;
    if (popOpen) warm();
    render();
  }
  function onClick(e) {
    const b = e.target.closest('[data-sync]');
    if (!b) return;
    if (b.dataset.sync === 'out') signOut();
    else if (b.dataset.sync === 'copy') { api.play('click'); openIO('out'); }
    else if (b.dataset.sync === 'paste') { api.play('click'); openIO('in'); }
    else signIn(b.dataset.sync);
  }

  /* ---------- start ---------- */
  function init(a) {
    api = a;
    document.getElementById('intro-sync')?.addEventListener('click', onClick);
    document.getElementById('sync-pop')?.addEventListener('click', onClick);
    document.getElementById('sync-choose')?.addEventListener('click', onChoose);
    document.getElementById('save-io')?.addEventListener('click', onIO);
    document.getElementById('save-io')?.addEventListener('input', onIOInput);
    document.getElementById('book-sync')?.addEventListener('click', e => { e.stopPropagation(); togglePop(); });
    document.addEventListener('click', e => { if (popOpen && !e.target.closest('#sync-pop, #book-sync')) togglePop(false); });
    document.addEventListener('keydown', e => { if (popOpen && e.key === 'Escape') { e.stopImmediatePropagation(); togglePop(false); } }, true);
    render();
    // a player who signed in before: follow their account from the start
    if ((meta.uid || meta.pending) && enabled()) ready().catch(() => { failed = true; render(); });
    let note = null;
    try { note = sessionStorage.getItem(NOTE_KEY); sessionStorage.removeItem(NOTE_KEY); } catch (e) { /* storage unavailable */ }
    if (note === 'loaded') setTimeout(() => api.toast('Your progress from your other device is here.', '#9fe3b0', 4200), 900);
    if (note === 'imported') setTimeout(() => api.toast(meta.uid ? 'Your save is loaded, and is going up to your account.' : 'Your save is loaded. Sign in from the scrapbook’s cloud to keep it safe.', '#9fe3b0', 5200), 900);
  }

  return {
    init, changed, warm, render, togglePop, encode, decode, inApp,
    frozen: false,
    onChange: f => sub.add(f),
    get signedIn() { return !!(user || meta.uid); },
  };
})();
