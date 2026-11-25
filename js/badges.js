/* Tidesong — badges and the scrapbook.
   Nearly everything a player does can earn a badge, from the first fish to a full Moon Palace. Badges come
   in five grades that say how far into the game they sit: Bronze for the first day, Silver for the first
   week, Gold for a few weeks in, Pearl for a season of fishing and Moon for mastery. Counting badges climb
   in ladders (10, 25, 50 … fish), paced from the economy simulation so a few arrive in the first minutes
   and the later ones mean something.

   Most badges are read straight from the save (catches, species, gear, tanks, levels). save.ach keeps the
   rest: `c` counters and `k` flags for moments the save does not otherwise remember (fish lost, meals
   served, treasures opened, friendships formed …), `got` (badge id → when it was earned, or 1 for badges
   credited from play before the scrapbook existed) and `fresh` (earned but not yet looked at).
   game.js, shop.js and tank.js report those moments through Badges.note(). */
'use strict';

const Badges = (() => {
  const TAU = Math.PI * 2;
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = n => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1000 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  /* ================= Grades and pages ================= */
  const GRADES = [null,
    { id: 'bronze', name: 'Bronze', color: '#dc9c63' },
    { id: 'silver', name: 'Silver', color: '#d3dbe4' },
    { id: 'gold', name: 'Gold', color: '#f0c75e' },
    { id: 'pearl', name: 'Pearl', color: '#efe0ff' },
    { id: 'moon', name: 'Moon', color: '#a9c4f0' },
  ];
  const PAGES = [
    { id: 'first', name: 'First Casts', sub: 'Your very first days by the water.', color: '#5fae7f' },
    { id: 'line', name: 'On the Line', sub: 'Catches, fights and feats of the reel.', color: '#4f9bd0' },
    { id: 'journal', name: 'Field Journal', sub: 'Rarities, species and the five waters.', color: '#8a6ad6' },
    { id: 'market', name: 'Driftwood Market', sub: 'Selling, earning and letting go.', color: '#cf9a36' },
    { id: 'tackle', name: 'Tackle Box', sub: 'Gear, bait and the collections.', color: '#cf6f42' },
    { id: 'aquarium', name: 'The Aquarium', sub: 'Tanks, meals, pearls and hidden treasure.', color: '#3fa7a1' },
    { id: 'friends', name: 'Friends & Mates', sub: 'Bonds that grow behind the glass.', color: '#d9668a' },
    { id: 'seasons', name: 'Seasons', sub: 'Levels earned and days spent by the water.', color: '#6d79cf' },
    { id: 'secrets', name: 'Secrets', sub: 'Small wonders, found by looking closely.', color: '#7c5cb8' },
  ];
  const PAGE = Object.fromEntries(PAGES.map(p => [p.id, p]));

  /* ================= Glyphs =================
     Line icons on a 24-unit grid, engraved into each badge's enamel. */
  const P = d => `<path d="${d}"/>`;
  const GLYPH = {
    hook: P('M14.5 3.5v9.2a4.8 4.8 0 0 1-9.6 0V10') + P('M4.9 10l-1.7 2.4') + '<circle cx="14.5" cy="2.6" r="1.1"/>',
    escape: P('M3.5 18.5c2.6-1.4 5.2-1.4 7.8 0s5.2 1.4 7.8 0') + P('M13.5 15.5c-2.2-2.3-2.4-5.6-.4-8.6l1.7 2.6 2.9-1.4c-.2 3.3-1.6 5.9-4.2 7.4z') + P('M6.5 9.5l1 1.6M9 6.5l.4 1.8M19.5 13.5l-1.6.8'),
    fish: P('M3 12c3-4.5 8-6 12.5-4 1.6.7 2.9 1.8 3.8 2.8l2.2-2.3v7l-2.2-2.3c-.9 1-2.2 2.1-3.8 2.8C11 18 6 16.5 3 12z') + '<circle cx="7.6" cy="11" r=".9"/>',
    gem: P('M7 4.5h10l3.5 5L12 19.5 3.5 9.5z') + P('M3.5 9.5h17M9.5 4.5L8 9.5l4 10 4-10-1.5-5'),
    bowl: P('M5.5 7.5h13c1.6 1.9 2.5 4.2 2.5 6.5a9 9 0 0 1-18 0c0-2.3.9-4.6 2.5-6.5z') + P('M4.5 9.5h15') + P('M8 14.5c1.6-1.5 3.8-1.5 5.4 0-1.6 1.5-3.8 1.5-5.4 0z') + P('M13.4 14.5l1.8-1.2v2.4z'),
    bag: P('M9 4h6l-1.4 3h-3.2z') + P('M10.4 7C6 9 4.5 12.6 4.5 15.2c0 3 2.6 4.8 7.5 4.8s7.5-1.8 7.5-4.8c0-2.6-1.5-6.2-5.9-8.2') + '<circle cx="12" cy="14.5" r="2.3"/>',
    release: P('M12 15s-5-3.1-5-6.4A2.6 2.6 0 0 1 12 7.4a2.6 2.6 0 0 1 5 1.2C17 11.9 12 15 12 15z') + P('M3.5 19c2-1.3 4-1.3 6 0s4 1.3 6 0 3.5-1.3 5 0'),
    worm: P('M3.5 15.5c1.4-2.8 3.6-2.8 5 0s3.6 2.8 5 0 3.6-2.8 5 0') + P('M18.5 15.5c.5-1.7 1.4-2.6 2.3-2.7') + '<circle cx="19.9" cy="11.4" r=".5"/>',
    jar: P('M7 7.5h10v11.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19z') + P('M6.5 4.5h11v3h-11z') + P('M9.5 13.5c1-1.4 2-1.4 2.5 0s1.5 1.4 2.5 0'),
    rod: P('M4 20L17.5 5.5') + P('M17.5 5.5c1.6 3.6 1.8 7.4.6 10.6') + '<circle cx="7.6" cy="16.2" r="2"/><circle cx="18" cy="18" r="1.6"/>',
    food: P('M8.5 9.5h7l1 10.5h-9z') + P('M9 9.5V6.5h6v3') + P('M10 4.5h4') + '<circle cx="10.6" cy="14" r=".5"/><circle cx="13.4" cy="15.6" r=".5"/><circle cx="11.6" cy="17.2" r=".5"/>',
    pearl: '<circle cx="11" cy="13" r="6.5"/>' + P('M8 11a3.4 3.4 0 0 1 3-2') + P('M18.5 3.5v3.6M16.7 5.3h3.6'),
    pearls: '<circle cx="8" cy="15" r="3.8"/><circle cx="16" cy="15" r="3.8"/><circle cx="12" cy="8.5" r="3.8"/>' + P('M6.5 13.5a1.6 1.6 0 0 1 1.4-.9M14.5 13.5a1.6 1.6 0 0 1 1.4-.9M10.5 7a1.6 1.6 0 0 1 1.4-.9'),
    map: P('M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z') + P('M9 4.5v13M15 6.5v13'),
    mapx: P('M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z') + P('M14.5 9.5l3 3M17.5 9.5l-3 3') + P('M6 16c1.6-.6 2.8-1.8 3.6-3.4M10.8 11.2c.8-.6 1.6-.9 2.4-1'),
    star: P('M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z'),
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.1"/>',
    hourglass: P('M6.5 4h11M6.5 20h11') + P('M8 4c0 4 4 5 4 8s-4 4-4 8M16 4c0 4-4 5-4 8s4 4 4 8') + P('M10 17.5h4'),
    trophy: P('M8 4.5h8v5a4 4 0 0 1-8 0z') + P('M8 6.5H5.5a2.6 2.6 0 0 0 2.9 3.4M16 6.5h2.5a2.6 2.6 0 0 1-2.9 3.4') + P('M12 13.5v3M9.5 16.5h5v3h-5z'),
    flame: P('M12 20.5c-3.6 0-6-2.4-6-5.6 0-3.6 3-5.3 3.4-9.4 2.4 1.6 3.4 3.6 3.2 5.6 1-.6 1.6-1.8 1.8-3 1.8 1.6 3.6 4 3.6 6.8 0 3.2-2.4 5.6-6 5.6z') + P('M12 20.5c-1.5 0-2.5-1-2.5-2.3 0-1.6 1.4-2.5 2.5-4.2 1.1 1.7 2.5 2.6 2.5 4.2 0 1.3-1 2.3-2.5 2.3z'),
    book: P('M5 4.5h10.5A3.5 3.5 0 0 1 19 8v12H8.5A3.5 3.5 0 0 1 5 16.5z') + P('M5 16.5A3.5 3.5 0 0 1 8.5 13H19') + P('M9 8.5c1.6-1.6 3.6-1.6 5 0-1.4 1.6-3.4 1.6-5 0z'),
    compass: '<circle cx="12" cy="12" r="8.5"/>' + P('M15.5 8.5l-2 5-5 2 2-5z') + P('M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5'),
    waves: P('M3.5 8.5c2-1.4 4-1.4 6 0s4 1.4 6 0 3.5-1.4 5 0') + P('M3.5 13c2-1.4 4-1.4 6 0s4 1.4 6 0 3.5-1.4 5 0') + P('M3.5 17.5c2-1.4 4-1.4 6 0s4 1.4 6 0 3.5-1.4 5 0'),
    tag: P('M3.5 12.5V4.5h8l9 9-8 8z') + '<circle cx="8" cy="9" r="1.6"/>',
    basket: P('M3.5 10h17l-2 9.5h-13z') + P('M8 10l3-5.5M16 10l-3-5.5') + P('M8.5 13.5v3M12 13.5v3M15.5 13.5v3'),
    palette: P('M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.8 1.9-1.7 0-1.3-1.1-1.6-1.1-2.7 0-1 .8-1.6 1.8-1.6h2.4a3.5 3.5 0 0 0 3.5-3.5c0-4.2-3.8-7.5-8.5-7.5z') + '<circle cx="7.8" cy="11.5" r="1.1"/><circle cx="10" cy="7.6" r="1.1"/><circle cx="14.6" cy="7.8" r="1.1"/>',
    chevrons: P('M6 11l6-5 6 5M6 15.5l6-5 6 5M6 20l6-5 6 5'),
    crown: P('M4 17.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z') + P('M4 20.5h16'),
    tank: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/>' + P('M3.5 9h17M7.5 18v2.5M16.5 18v2.5') + P('M8 13.5c1.5-1.4 3.6-1.4 5 0-1.4 1.4-3.5 1.4-5 0z') + P('M13 13.5l1.7-1.1v2.2z'),
    castle: P('M4 20V9h3v2h2V9h2v2h2V9h2v2h2V9h3v11z') + P('M10 20v-4a2 2 0 0 1 4 0v4') + P('M5.5 9V5.5l2 .8-2 .8'),
    chest: P('M4 10.5h16V19H4z') + P('M4 10.5C4 7.5 7.6 5 12 5s8 2.5 8 5.5') + P('M4 13.5h16') + '<rect x="10.5" y="12" width="3" height="3.2" rx=".6"/>',
    hearts: P('M9.5 18s-6-3.7-6-7.7A3.2 3.2 0 0 1 9.5 8.4a3.2 3.2 0 0 1 6 1.9c0 4-6 7.7-6 7.7z') + P('M15.5 6.8a3 3 0 0 1 5 2.3c0 2.2-1.6 4.2-3.3 5.6'),
    fishes: `<g transform="translate(2.2 11)">${P('M0 0c1.8-2.7 4.8-3.6 7.5-2.4.96.42 1.74 1.08 2.28 1.68l1.32-1.38v4.2l-1.32-1.38c-.54.6-1.32 1.26-2.28 1.68C4.8 3.6 1.8 2.7 0 0z')}<circle cx="2.4" cy="-.4" r=".45"/></g><g transform="translate(9.4 17)">${P('M0 0c1.8-2.7 4.8-3.6 7.5-2.4.96.42 1.74 1.08 2.28 1.68l1.32-1.38v4.2l-1.32-1.38c-.54.6-1.32 1.26-2.28 1.68C4.8 3.6 1.8 2.7 0 0z')}<circle cx="2.4" cy="-.4" r=".45"/></g>` + P('M16.6 9.2s-2.8-1.7-2.8-3.6a1.4 1.4 0 0 1 2.8-.6 1.4 1.4 0 0 1 2.8.6c0 1.9-2.8 3.6-2.8 3.6z'),
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/>' + P('M4 10h16M8.5 3.5v4M15.5 3.5v4') + P('M8 13.5h2M12 13.5h2M8 16.5h2'),
    moon: P('M15 4a8 8 0 1 0 5 12.8A6.4 6.4 0 0 1 15 4z') + P('M7.5 4.5v2M6.5 5.5h2'),
    sunrise: P('M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0') + P('M12 6.5V9M5.4 9.4L7 11M18.6 9.4L17 11M7 20.5h10'),
    tap: P('M10 11.5V5.8a1.6 1.6 0 0 1 3.2 0v5.2l4.3.9a2 2 0 0 1 1.6 2.3l-.8 4.3a2.2 2.2 0 0 1-2.2 1.8h-4.4a2 2 0 0 1-1.6-.8l-3.3-4.3a1.4 1.4 0 0 1 2.1-1.8z') + P('M7.4 4.5a5.2 5.2 0 0 1 8.6 0'),
    shy: P('M3.5 11c2.4 3.4 5.2 5 8.5 5s6.1-1.6 8.5-5') + P('M6.5 14.5L5 16.8M12 16v2.7M17.5 14.5l1.5 2.3'),
    sweep: P('M3.5 17c4-6.5 10-9.7 17-9.7') + '<circle cx="8" cy="16.8" r="1.5"/><circle cx="12.8" cy="12.8" r="1.5"/><circle cx="18" cy="11" r="1.5"/>',
    bonk: '<circle cx="12" cy="14.5" r="4.5"/>' + P('M7.5 14.5h9M12 10V6') + P('M5 6.5l1.8 1.3M19 6.5l-1.8 1.3M8.5 3.5l.6 1.6M15.5 3.5l-.6 1.6'),
    reunite: P('M12 18s-4.8-3-4.8-6.3a2.4 2.4 0 0 1 4.8-1 2.4 2.4 0 0 1 4.8 1C16.8 15 12 18 12 18z') + P('M2.5 8.5h4M6.5 8.5L5 7M6.5 8.5L5 10M21.5 8.5h-4M17.5 8.5L19 7M17.5 8.5L19 10'),
    clam: P('M3.5 13C4 8.7 7.6 5.8 12 5.8s8 2.9 8.5 7.2z') + P('M3.5 13c1 3.2 4.4 5 8.5 5s7.5-1.8 8.5-5') + P('M8 7.5l1.5 5.5M16 7.5l-1.5 5.5M12 5.8V13') + '<circle cx="12" cy="15.4" r="1.5"/>',
    ship: P('M3.5 15.5h17l-2.8 4.5H6.3z') + P('M12 15.5V3.5') + P('M12 5l6 8.5h-6M12 6.5l-5.5 7H12'),
    gate: '<circle cx="12" cy="11.5" r="8"/><circle cx="12" cy="11.5" r="4.8"/>' + P('M2.5 20.5h19') + P('M12.6 9.2a2.5 2.5 0 1 0 1.9 3.9 2 2 0 0 1-1.9-3.9z'),
    'th-classic': '<circle cx="12" cy="5" r="1.8"/>' + P('M12 6.8V20.5M8 10h8M4.5 13.5a7.5 7 0 0 0 15 0'),
    'th-cosmic': '<circle cx="12" cy="12" r="5"/>' + P('M5.6 15.2c-1.8 1.4-2.6 2.6-2.1 3.3.9 1.2 5.6-.6 10.5-4s8.1-7.3 7.2-8.5c-.5-.7-2-.5-4 .3') + P('M5 4.5v2M4 5.5h2'),
    'th-blossom': '<circle cx="12" cy="12" r="2"/>' + P('M12 10c-1.8-2.6-1.4-5.4 0-6.5 1.4 1.1 1.8 3.9 0 6.5zM14 12c2.6-1.8 5.4-1.4 6.5 0-1.1 1.4-3.9 1.8-6.5 0zM12 14c1.8 2.6 1.4 5.4 0 6.5-1.4-1.1-1.8-3.9 0-6.5zM10 12c-2.6 1.8-5.4 1.4-6.5 0 1.1-1.4 3.9-1.8 6.5 0z'),
    'th-critters': P('M12 12.5c-3 0-5.5 2.6-5.5 4.9 0 1.6 1.3 2.6 2.8 2.6 1 0 1.7-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-1 2.8-2.6 0-2.3-2.5-4.9-5.5-4.9z') + '<ellipse cx="6" cy="10" rx="1.6" ry="2"/><ellipse cx="9.6" cy="6.4" rx="1.6" ry="2.1"/><ellipse cx="14.4" cy="6.4" rx="1.6" ry="2.1"/><ellipse cx="18" cy="10" rx="1.6" ry="2"/>',
    'th-beach': P('M12 4.5c-5 0-8.5 4-8.5 8.6L6.5 18h11l3-4.9c0-4.6-3.5-8.6-8.5-8.6z') + P('M12 4.5V18M8.2 5.6L9.5 18M15.8 5.6L14.5 18M8.5 20.5h7'),
    'th-mountain': P('M2.5 19.5l7-11.5 4 6 2.5-3.6 5.5 9.1z') + P('M7.4 11.5l2.1 1.6 2.1-2'),
    'th-bakery': P('M6 12.5h12l-1.6 7.5H7.6z') + P('M5.5 12.5a6.5 5 0 0 1 13 0') + P('M10 12.5l.6 7.5M14 12.5l-.6 7.5') + '<circle cx="12" cy="5.2" r="1.3"/>',
  };

  /* ================= The catalogue ================= */
  const LIST = [];
  const BY = {};
  /* page, section, grade, glyph, id, name, description, what it measures (a key of measure() or a function
     of it), the goal, and extras: ser (a ladder of related badges), n (the number on its banner), face (a
     rarity whose colour fills the enamel), note (a line of advice), secret + hint. */
  function add(p, sec, g, icon, id, name, desc, of, goal = 1, x = {}) {
    const b = Object.assign({ p, sec, g, icon, id, name, desc, of, goal }, x);
    LIST.push(b); BY[id] = b;
    return b;
  }
  function ladder(p, sec, ser, icon, of, steps, desc, x = {}) {
    for (const [goal, g, name] of steps) add(p, sec, g, icon, `${ser}-${goal}`, name, desc(goal), of, goal, Object.assign({ ser, n: goal > 1 ? goal : 0 }, x));
  }

  // where each species lives, and the gear in the market
  const LOC_SPECIES = {};
  for (const L of LOCATIONS) { const ids = new Set(); for (const r in L.fish) for (const id in L.fish[r]) ids.add(id); LOC_SPECIES[L.id] = [...ids]; }
  const HOMES = {};
  for (const L of LOCATIONS) for (const id of LOC_SPECIES[L.id]) (HOMES[id] = HOMES[id] || []).push(L.id);
  const KINDS = ['rods', 'bobbers', 'lines'];
  const STARTER = { rods: 'willow', bobbers: 'classic', lines: 'mono' };
  const GEAR = {};
  for (const k of KINDS) GEAR[k] = Object.fromEntries(Gear.CATALOG[k].map(g => [g.id, g]));
  const GEAR_TOTAL = KINDS.reduce((a, k) => a + Gear.CATALOG[k].filter(g => g.id !== STARTER[k]).length, 0);
  const THEME = {};
  for (const t of Gear.THEMES) THEME[t.id] = { name: t.name, n: 0, cost: 0 };
  for (const k of KINDS) for (const g of Gear.CATALOG[k]) if (THEME[g.theme]) { THEME[g.theme].n++; THEME[g.theme].cost += g.price || 0; }
  const NSPECIES = SPECIES_ORDER.length, NTANKS = TANKS.length;
  const MEAL_NOTE = 'Fed fish stay full for 15 minutes, so a tank counts one meal at a time. Every tank you feed counts.';

  // ---- First Casts: the first day ----
  add('first', '', 1, 'hook', 'first-catch', 'First Catch', 'Land your very first fish.', 'catches', 1, { ser: 'catch' });
  add('first', '', 1, 'escape', 'first-escape', 'The One That Got Away', 'Lose a fish off the hook. It happens to every angler.', 'escaped');
  add('first', '', 1, 'gem', 'first-rare', 'Something Blue', 'Catch your first Rare fish.', 'rare', 1, { face: 'rare', ser: 'rare' });
  add('first', '', 1, 'bowl', 'first-keep', 'A Home in Glass', 'Keep a fish in your aquarium.', 'kept');
  add('first', '', 1, 'bag', 'first-sale', 'Open for Business', 'Sell a fish at the Driftwood Market.', 'sold', 1, { ser: 'sold' });
  add('first', '', 1, 'release', 'first-release', 'Catch and Release', 'Let a fish go back to the water.', 'released', 1, { ser: 'release' });
  add('first', '', 1, 'worm', 'first-bait', 'Something Tasty', 'Buy a pack of bait at the market.', 'baitBought');
  add('first', '', 1, 'rod', 'first-gear', 'Fresh Tackle', 'Buy your first piece of new gear.', 'gear', 1, { ser: 'gear' });
  add('first', '', 1, 'food', 'first-meal', 'Dinner Bell', 'Feed the fish in your aquarium.', 'meals', 1, { ser: 'meals' });
  add('first', '', 1, 'pearl', 'first-pearl', 'Pearl on the Sand', 'Gather a Moonpearl your fish left on the sand.', 'found', 1, { ser: 'found' });
  add('first', '', 1, 'map', 'first-water', 'New Horizons', 'Catch a fish in a second water.', 'waters', 2, { ser: 'waters' });
  add('first', '', 1, 'star', 'level-5', 'Finding Your Feet', 'Reach level 5.', 'level', 5, { ser: 'level', n: 5 });

  // ---- On the Line ----
  ladder('line', 'Fish landed', 'catch', 'fish', 'catches', [
    [10, 1, 'Nibbles'], [25, 1, 'Getting the Hang of It'], [50, 1, 'Steady Hands'], [100, 2, 'Century'], [250, 2, 'Old Hand'],
    [500, 3, 'Seasoned Angler'], [1000, 3, 'A Thousand Tides'], [2500, 4, 'Master Angler'], [5000, 5, 'Tidesong Legend'],
  ], n => `Catch ${fmt(n)} fish.`);
  add('line', 'Feats', 2, 'target', 'flawless', 'Flawless', 'Land a fish without it ever slipping out of your band.', 'flawless');
  add('line', 'Feats', 2, 'hourglass', 'whisker', 'By a Whisker', 'Land a fish when the reel was a hair from letting it go.', 'whisker');
  add('line', 'Feats', 2, 'trophy', 'trophy-1', 'Trophy Catch', 'Land a fish at the very top of its size range.', 'trophies', 1, { ser: 'trophy' });
  add('line', 'Feats', 3, 'trophy', 'trophy-25', 'Trophy Wall', 'Land 25 trophy-sized fish.', 'trophies', 25, { ser: 'trophy', n: 25 });
  ladder('line', 'Feats', 'streak', 'flame', 'best', [[10, 2, 'On a Roll'], [50, 3, 'Steady as a Rock'], [200, 4, 'Unbreakable']],
    n => `Land ${n} fish in a row without one getting away.`);
  add('line', 'Feats', 4, 'target', 'flawless-legend', 'Untouchable', 'Land a Legendary or Extreme fish without it ever slipping out of your band.', 'flawlessLegend', 1, { face: 'legendary' });

  // ---- Field Journal ----
  add('journal', 'Rarities', 2, 'gem', 'first-epic', 'Purple Patch', 'Catch your first Epic fish.', 'epic', 1, { face: 'epic', ser: 'epic' });
  add('journal', 'Rarities', 3, 'gem', 'first-legendary', 'Stuff of Legend', 'Catch your first Legendary fish.', 'legendary', 1, { face: 'legendary', ser: 'legendary' });
  add('journal', 'Rarities', 4, 'gem', 'first-extreme', 'Here Be Dragons', 'Catch an Extreme fish.', 'extreme', 1, { face: 'extreme', ser: 'extreme' });
  add('journal', 'Rarities', 2, 'gem', 'rare-100', 'Blue Ribbon', 'Catch 100 Rare fish.', 'rare', 100, { face: 'rare', ser: 'rare', n: 100 });
  add('journal', 'Rarities', 3, 'gem', 'epic-50', 'Epic Haul', 'Catch 50 Epic fish.', 'epic', 50, { face: 'epic', ser: 'epic', n: 50 });
  add('journal', 'Rarities', 4, 'gem', 'legendary-10', 'Living Legend', 'Catch 10 Legendary fish.', 'legendary', 10, { face: 'legendary', ser: 'legendary', n: 10 });
  add('journal', 'Rarities', 5, 'gem', 'extreme-5', 'Dragon Tamer', 'Catch 5 Extreme fish.', 'extreme', 5, { face: 'extreme', ser: 'extreme', n: 5 });
  ladder('journal', 'Species', 'species', 'book', 'species', [[10, 1, 'Field Notes'], [25, 2, 'Naturalist'], [40, 3, 'Ichthyologist'], [NSPECIES, 5, 'Every Fish in the Sea']],
    n => (n === NSPECIES ? `Discover all ${n} species.` : `Discover ${n} species.`));
  add('journal', 'The five waters', 2, 'compass', 'five-waters', 'Five Waters', 'Catch a fish in all five waters.', 'waters', LOCATIONS.length, { ser: 'waters' });
  const JG = { mistwillow: 2, lanternfen: 3, coralspire: 3, frostveil: 3, dragonmere: 4 };
  for (const L of LOCATIONS) {
    add('journal', 'The five waters', JG[L.id] || 3, 'waves', `journal-${L.id}`, `${L.name.split(' ')[0]} Journal`,
      `Discover every species that lives in ${L.name}.`, M => M[`jw.${L.id}`] || 0, LOC_SPECIES[L.id].length);
  }

  // ---- Driftwood Market ----
  ladder('market', 'Fish sold', 'sold', 'bag', 'sold', [
    [10, 1, 'Fresh off the Boat'], [25, 1, 'Market Regular'], [50, 2, 'Fishmonger'], [100, 2, 'Dockside Merchant'],
    [250, 3, 'Harbour Trader'], [500, 3, 'Tycoon of the Tides'], [1000, 4, 'Merchant Prince'], [2500, 5, 'Fish Baron'],
  ], n => `Sell ${fmt(n)} fish.`);
  ladder('market', 'Moonpearls earned', 'earned', 'pearls', 'earned', [
    [1000, 1, 'Pocket Money'], [10000, 2, 'Full Purse'], [50000, 3, 'Pearl Hoard'], [250000, 4, 'Treasury'], [1000000, 5, 'Moonpearl Millionaire'],
  ], n => `Earn ${fmt(n)} Moonpearls selling fish.`);
  add('market', 'Deals', 2, 'basket', 'bulk-10', 'Clearance Sale', 'Sell 10 fish at once from your aquarium.', 'bulk', 10);
  add('market', 'Deals', 3, 'tag', 'sale-1000', 'Big Ticket', 'Sell a single fish for 1,000 Moonpearls or more.', 'bigSale', 1000, { ser: 'sale' });
  add('market', 'Deals', 4, 'tag', 'sale-5000', 'Crown Jewel', 'Sell a single fish for 5,000 Moonpearls or more.', 'bigSale', 5000, { ser: 'sale' });
  add('market', 'Letting go', 1, 'release', 'release-10', 'Kind Heart', 'Release 10 fish.', 'released', 10, { ser: 'release', n: 10 });
  add('market', 'Letting go', 2, 'release', 'release-100', 'Gentle Soul', 'Release 100 fish.', 'released', 100, { ser: 'release', n: 100 });

  // ---- Tackle Box ----
  ladder('tackle', 'Gear', 'gear', 'rod', 'gear', [[5, 2, 'Tinkerer'], [15, 3, 'Well Equipped'], [40, 4, 'Tackle Collector'], [GEAR_TOTAL, 5, 'Every Last Lure']],
    n => (n === GEAR_TOTAL ? 'Own every rod, bobber and line in the market.' : `Own ${n} pieces of new gear.`));
  add('tackle', 'Gear', 2, 'palette', 'matching', 'Dressed to Match', 'Fish with a rod, bobber and line all from one collection, beyond the starter kit.', 'matching');
  add('tackle', 'Gear', 3, 'chevrons', 'tier-5', 'Top of the Line', 'Own a Tier V (or finer) rod, bobber and line.', 'tier5', 3, { unit: 'slots' });
  add('tackle', 'Gear', 3, 'crown', 'heirloom', 'Family Heirloom', 'Own an Heirloom.', 'heir', 1, { ser: 'heir' });
  add('tackle', 'Gear', 5, 'crown', 'heirloom-set', 'Treasured Set', 'Own an Heirloom III rod, bobber and line.', 'heir3', 3, { ser: 'heir', unit: 'slots' });
  add('tackle', 'Bait', 2, 'jar', 'bait-all', 'Bait Sampler', 'Buy all three kinds of bait.', 'baitKinds', 3);
  ladder('tackle', 'Bait', 'baited', 'worm', 'baited', [[25, 2, 'Baited Breath'], [250, 3, 'Bait Whisperer']], n => `Catch ${n} fish on bait.`);
  const TG = { classic: 3, cosmic: 5 };
  for (const t of Object.entries(THEME).sort((a, b) => a[1].cost - b[1].cost)) {
    const [id, T] = t;
    add('tackle', 'Collections', TG[id] || 4, `th-${id}`, `theme-${id}`, `${T.name} Collection`, `Own every rod, bobber and line in the ${T.name} collection.`, `theme.${id}`, T.n, { unit: 'pieces' });
  }

  // ---- The Aquarium ----
  add('aquarium', 'Tanks', 1, 'bowl', 'tank-full', 'Full Bowl', 'Fill an aquarium to the brim.', 'fullTank');
  ladder('aquarium', 'Tanks', 'tanks', 'tank', 'tankCount', [[2, 1, 'Moving Up'], [4, 2, 'Aquarist'], [NTANKS, 3, 'Grand Aquarist']],
    n => (n === 2 ? 'Buy your second aquarium.' : n === NTANKS ? `Own all ${n} aquariums.` : `Own ${n} aquariums.`));
  add('aquarium', 'Tanks', 4, 'tank', 'full-house', 'Full House', `Fill all ${NTANKS} aquariums at once.`, 'fullHouse');
  add('aquarium', 'Decor', 1, 'castle', 'decor-1', 'Home Comforts', 'Set a decoration in one of your aquariums.', 'decoPlaced', 1, { ser: 'decor' });
  add('aquarium', 'Decor', 2, 'castle', 'decor-10', 'Interior Designer', 'Have 10 decorations standing in your aquariums.', 'decoPlaced', 10, { ser: 'decor', n: 10 });
  add('aquarium', 'Decor', 3, 'castle', 'decor-all', 'Curator', `Own one of every decoration in the market (${Deco.LIST.length}).`, 'decoKinds', Deco.LIST.length);
  add('aquarium', 'Decor', 4, 'castle', 'decor-palace', 'Palace Gardens', `Fill the ${TANKS[NTANKS - 1].name} with decorations.`, 'decoPalace', Deco.CAP[TANKS[NTANKS - 1].id]);
  ladder('aquarium', 'Meals', 'meals', 'food', 'meals', [[10, 2, 'Feeding Time'], [25, 2, 'Flake Flinger'], [50, 3, 'Head Chef'], [100, 3, 'Banquet Host'], [250, 4, 'Never a Hungry Fin']],
    n => `Feed your fish ${n} times.`, { note: MEAL_NOTE });
  BY['first-meal'].note = MEAL_NOTE;
  ladder('aquarium', 'Pearls from the sand', 'found', 'pearl', 'found', [
    [100, 1, 'Pearl Gatherer'], [250, 1, 'Pocketful of Pearls'], [500, 2, 'String of Pearls'], [1000, 2, 'Pearl Diver'],
    [2500, 2, 'Oyster Keeper'], [10000, 3, 'Moonlit Sands'], [50000, 4, 'Pearl Tide'], [250000, 5, 'Sea of Pearls'],
  ], n => `Gather ${fmt(n)} Moonpearls from your aquariums.`);
  const TREASURE_NOTE = 'Some of the finer aquariums hide treasure that comes back every few hours. Look closely, and touch things.';
  ladder('aquarium', 'Treasure', 'treasure', 'chest', 'treasures', [[1, 2, 'Treasure Hunter'], [10, 3, 'Finders Keepers'], [50, 4, 'Treasure Trove']],
    n => (n === 1 ? 'Open a treasure in one of your aquariums.' : `Open ${n} aquarium treasures.`), { note: TREASURE_NOTE });
  add('aquarium', 'Treasure', 3, 'mapx', 'treasure-all', 'Treasure Map', 'Find all four kinds of aquarium treasure.', 'treasureKinds', 4, { ser: 'treasure', note: TREASURE_NOTE });

  // ---- Friends & Mates ----
  ladder('friends', 'Friends', 'besties', 'fishes', 'besties', [[1, 2, 'Best Fishes'], [10, 3, 'Circle of Friends']],
    n => (n === 1 ? 'Two of your fish become best friends.' : `${n} pairs of fish become best friends.`),
    { note: 'Fish grow close by spending time in the same tank, swimming, eating and playing together.' });
  const MATE_NOTE = 'Two fish of the same kind who share a tank and grow closest of all become mates.';
  ladder('friends', 'Mates', 'couples', 'hearts', 'couples', [[1, 2, 'Love in the Water'], [3, 2, 'Paired Up'], [10, 3, 'Matchmaker'], [25, 4, 'Grand Matchmaker']],
    n => (n === 1 ? 'Two fish of a kind become mates.' : `${n} couples of fish become mates.`), { note: MATE_NOTE });
  add('friends', 'Mates', 3, 'hearts', 'love-epic', 'Rare Romance', 'Two Epic (or rarer) fish become mates.', 'loveEpic', 1, { face: 'epic', ser: 'love', note: MATE_NOTE });
  add('friends', 'Mates', 4, 'hearts', 'love-legendary', 'Legendary Love', 'Two Legendary (or rarer) fish become mates.', 'loveLegendary', 1, { face: 'legendary', ser: 'love', note: MATE_NOTE });
  add('friends', 'Mates', 5, 'hearts', 'love-extreme', 'Dragons’ Dance', 'Two Extreme fish become mates.', 'loveExtreme', 1, { face: 'extreme', ser: 'love', note: MATE_NOTE });

  // ---- Seasons ----
  ladder('seasons', 'Levels', 'level', 'star', 'level', [[10, 2, 'Apprentice'], [20, 2, 'Journeyman'], [30, 3, 'Expert Angler'], [40, 3, 'Veteran of the Waters'], [50, 4, 'Master of the Waters'], [MAX_LEVEL, 5, 'Tidesinger']],
    n => (n === MAX_LEVEL ? `Reach level ${n}, the highest there is.` : `Reach level ${n}.`));
  ladder('seasons', 'Days by the water', 'days', 'calendar', 'days', [[3, 2, 'Coming Back for More'], [7, 2, 'A Week of Tides'], [14, 3, 'Fortnight Fisher'], [30, 4, 'Moon Cycle'], [100, 5, 'A Hundred Tides']],
    n => `Catch fish on ${n} different days.`);

  // ---- Secrets: hidden until found ----
  const secret = (g, icon, id, name, hint, desc, of, goal = 1) => add('secrets', '', g, icon, id, name, desc, of, goal, { secret: true, hint });
  secret(1, 'tap', 'tap-fish', 'Hello There', 'Say hello to someone in your aquarium.', 'Tap a fish in your aquarium.', 'tap');
  secret(1, 'shy', 'shy', 'Give Me Some Space', 'Even fish need a little space.', 'Tap a fish so often that it hides from you.', 'shy');
  secret(1, 'castle', 'giant-wake', 'Rise and Shine', 'Some things are only sleeping.', 'Wake the sleeping stone giant.', 'dt.giant');
  secret(1, 'bonk', 'bonk', 'Bonk!', 'Aim for something floating.', 'Cast your bobber onto something floating on the water.', 'bonk');
  secret(2, 'sweep', 'sweep', 'Clean Sweep', 'Gather a great many at once.', 'Gather 10 pearls in a single sweep.', 'sweep', 10);
  secret(2, 'reunite', 'reunited', 'Reunited', 'Absence makes the heart grow fonder.', 'Bring a fish back to the tank where its mate lives.', 'reunited');
  secret(2, 'moon', 'night-owl', 'Night Owl', 'Some fish are only seen by the moon.', 'Catch a fish between midnight and 4 in the morning.', 'night');
  secret(2, 'sunrise', 'early-bird', 'Early Bird', 'Up with the sun.', 'Catch a fish between 5 and 7 in the morning.', 'early');
  secret(3, 'clam', 'clam', 'Pearl of the Reef', 'Something in the reef opens for those who wait.', 'Receive the giant clam’s pearls in the Coral Reef.', 'tr.clam');
  secret(3, 'chest', 'chest', 'Coral Chest', 'A chest that remembers treasure.', 'Open the chest in the Coral Reef.', 'tr.chest');
  secret(3, 'ship', 'wreck', 'Sunken Treasure', 'Every shipwreck keeps a secret.', 'Open the chest aboard the wreck in Shipwreck Cove.', 'tr.wreckchest');
  secret(3, 'gate', 'moon-gate', 'Moon Blessing', 'The singing stones know a tune.', 'Play the singing stones of the Moon Palace in order, and receive its blessing.', 'tr.moon');

  /* ================= State ================= */
  let api = null;
  const blank = () => ({ v: 1, got: {}, fresh: [], c: {}, k: {} });
  /* Credit a save from before the scrapbook with what it can tell us. Things it cannot (fish lost, past
     meals …) start counting from now. */
  function seed(s) {
    const A = blank(), c = A.c, k = A.k, T = s.tank || {};
    c.kept = (s.net || []).length;
    c.meals = Object.keys(T.fedAt || {}).length;
    for (const key of Object.keys(T.decor || {})) { c.treasures = (c.treasures || 0) + 1; k[`tr.${key}`] = 1; }
    const pairs = new Set();
    for (const a in T.mates || {}) { const b = T.mates[a]; pairs.add(`${Math.min(+a, b)}-${Math.max(+a, b)}`); }
    c.couples = pairs.size;
    for (const p of pairs) { const [a] = p.split('-').map(Number), rec = (s.net || []).find(f => f.uid === a); if (rec) loveFlags(k, rec.id); }
    c.besties = Object.values(T.bonds || {}).filter(v => v >= 80).length;
    for (const id of BAIT_ORDER) if ((s.bait[id] || 0) > (id === 'worm' ? 3 : 0)) k[`bait.${id}`] = 1;
    c.baitBought = BAIT_ORDER.filter(id => k[`bait.${id}`]).length;
    // where earlier fish were caught: species that live in only one water say where
    for (const id in s.caught) { const h = HOMES[id]; if (h && h.length === 1) c[`w.${h[0]}`] = Math.max(1, c[`w.${h[0]}`] || 0); }
    if (s.total > 0) { c[`w.${s.loc}`] = Math.max(1, c[`w.${s.loc}`] || 0); c.days = 1; c.lastDay = new Date().toDateString(); }
    return A;
  }
  function loveFlags(k, id) {
    const sp = SPECIES[id], t = sp ? RARITIES[sp.rarity].tier : 0;
    if (t >= 2) k.loveEpic = 1;
    if (t >= 3) k.loveLegendary = 1;
    if (t >= 4) k.loveExtreme = 1;
  }
  function state() {
    const s = api.save;
    let A = s.ach;
    if (!A || typeof A !== 'object') { A = s.ach = seed(s); A.seeded = true; }
    if (!A.got || typeof A.got !== 'object') A.got = {};
    if (!Array.isArray(A.fresh)) A.fresh = [];
    if (!A.c || typeof A.c !== 'object') A.c = {};
    if (!A.k || typeof A.k !== 'object') A.k = {};
    return A;
  }

  /* ================= Measuring ================= */
  function measure() {
    const s = api.save, A = state(), M = Object.assign({}, A.c, A.k), st = s.stats || {};
    M.catches = s.total || 0; M.sold = st.sold || 0; M.released = st.released || 0; M.earned = st.earned || 0; M.found = st.found || 0;
    M.level = api.level();
    for (const r of RARITY_ORDER) M[r] = 0;
    let species = 0;
    for (const id in s.caught) { const sp = SPECIES[id]; if (!sp) continue; species++; M[sp.rarity] += s.caught[id].n || 0; }
    M.species = species;
    M.waters = LOCATIONS.filter(L => (A.c[`w.${L.id}`] || 0) > 0).length;
    for (const L of LOCATIONS) M[`jw.${L.id}`] = LOC_SPECIES[L.id].filter(id => s.caught[id]).length;
    // gear
    let gear = 0;
    const top = {}, has8 = {};
    const themeN = {};
    for (const k of KINDS) {
      top[k] = -1; has8[k] = false;
      for (const id of s.owned[k] || []) {
        const g = GEAR[k][id];
        if (!g) continue;
        if (id !== STARTER[k]) gear++;
        top[k] = Math.max(top[k], g.tier);
        if (g.tier >= 8) has8[k] = true;
        themeN[g.theme] = (themeN[g.theme] || 0) + 1;
      }
    }
    M.gear = gear;
    M.tier5 = KINDS.filter(k => top[k] >= 5).length;
    M.heir = KINDS.some(k => top[k] >= 6) ? 1 : 0;
    M.heir3 = KINDS.filter(k => has8[k]).length;
    for (const id in THEME) M[`theme.${id}`] = themeN[id] || 0;
    // a matching outfit, once worn, stays earned
    const eq = [Gear.ROD[s.equip.rod], Gear.BOB[s.equip.bobber], Gear.LINE[s.equip.line]];
    if (eq.every(g => g && g.tier >= 1 && g.theme === eq[0].theme)) A.k.matching = 1;
    M.matching = A.k.matching || 0;
    M.baitKinds = BAIT_ORDER.filter(id => A.k[`bait.${id}`]).length;
    M.treasureKinds = ['clam', 'chest', 'wreckchest', 'moon'].filter(id => A.k[`tr.${id}`]).length;
    // tanks
    M.tanks = s.netTier | 0;
    M.tankCount = M.tanks + 1;
    const inTank = new Array(NTANKS).fill(0);
    for (const f of s.net || []) inTank[Math.max(0, Math.min(M.tanks, f.t | 0))]++;
    let full = 0;
    for (let t = 0; t <= M.tanks; t++) if (inTank[t] >= TANKS[t].cap) full++;
    if (full) A.k.fullTank = 1;
    if (M.tanks === NTANKS - 1 && full === NTANKS) A.k.fullHouse = 1;
    M.fullTank = A.k.fullTank || 0; M.fullHouse = A.k.fullHouse || 0;
    // decorations
    const decos = (s.tank && s.tank.decos) || [];
    M.decoPlaced = decos.filter(d => d.t >= 0).length;
    M.decoKinds = new Set(decos.map(d => d.id)).size;
    M.decoPalace = decos.filter(d => d.t === NTANKS - 1).length;
    return M;
  }
  const valueOf = (b, M) => (typeof b.of === 'function' ? b.of(M) : M[b.of] || 0);
  const earned = b => !!state().got[b.id];

  /* ================= Earning ================= */
  let checkT = 0, noted = false;
  function poke() { if (!checkT) checkT = setTimeout(() => { checkT = 0; check(); }, 60); }
  function check(quiet = false) {
    if (!api) return [];
    const A = state(), M = measure(), now = Date.now(), won = [];
    for (const b of LIST) {
      if (A.got[b.id]) continue;
      if (valueOf(b, M) >= b.goal) { A.got[b.id] = quiet ? 1 : now; A.fresh.push(b.id); won.push(b); }
    }
    if (won.length || noted) { noted = false; api.persist(); }
    if (won.length) {
      if (!quiet) { queue.push(...won.sort((a, b) => a.g - b.g)); pump(); }
      dot();
      if (isOpen()) render();
    }
    return won;
  }

  /* Moments the save does not otherwise remember. */
  function note(kind, v = {}) {
    if (!api) return;
    const A = state(), c = A.c, k = A.k;
    const inc = (key, n = 1) => { c[key] = (c[key] || 0) + n; };
    switch (kind) {
      case 'land': {
        inc(`w.${v.loc}`);
        c.streak = (c.streak || 0) + 1; c.best = Math.max(c.best || 0, c.streak);
        if (v.bait) inc('baited');
        const tier = RARITIES[v.rarity] ? RARITIES[v.rarity].tier : 0;
        if (!v.slip) { inc('flawless'); if (tier >= 3) inc('flawlessLegend'); }
        if (v.whisker) k.whisker = 1;
        if (v.size >= 0.97) inc('trophies');
        const now = new Date(), day = now.toDateString(), h = now.getHours();
        if (c.lastDay !== day) { c.lastDay = day; inc('days'); }
        if (h < 4) k.night = 1;
        if (h >= 5 && h < 7) k.early = 1;
        break;
      }
      case 'escape': inc('escaped'); c.streak = 0; break;
      case 'keep': inc('kept'); break;
      case 'bait': inc('baitBought'); if (v.id) k[`bait.${v.id}`] = 1; break;
      case 'meal': inc('meals'); break;
      case 'sweep': if (!((v.n || 0) > (c.sweep || 0))) return; c.sweep = v.n; break;
      case 'sale': c.bigSale = Math.max(c.bigSale || 0, v.top || 0); c.bulk = Math.max(c.bulk || 0, v.n || 0); break;
      case 'bestie': inc('besties'); break;
      case 'couple': inc('couples'); loveFlags(k, v.id); break;
      case 'treasure': inc('treasures'); k[`tr.${v.key}`] = 1; break;
      case 'reunited': case 'tap': case 'shy': case 'bonk': if (k[kind]) return; k[kind] = 1; break;
      case 'decotap': if (!v.id || k[`dt.${v.id}`]) return; k[`dt.${v.id}`] = 1; break;
      case 'decor': case 'decorBuy': break;
      default: return;
    }
    noted = true;
    poke();
  }

  /* ================= Badge art =================
     Each badge is an SVG medal: a metal rim whose shape and finish rise with the grade (a plain bronze
     coin, a beaded silver one, a scalloped gold rosette with ribbons, a pearl-studded rosette, and a moon
     medal on a star of light), a ring of enamel in the page's colour (or the rarity's), an engraved
     glyph, and a banner for the number a counting badge stands for. Locked badges are a pencil sketch. */
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mixC = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
  // rarity enamel: the rarity's deep colour (legendary's is darkened so it stands out from a gold rim)
  const FACES = Object.assign({}, ...PAGES.map(p => ({ [p.id]: p.color })), ...RARITY_ORDER.map(r => ({ [r]: r === 'legendary' ? '#a5620c' : RARITIES[r].deep })));
  const pt = (r, a) => `${(Math.cos(a - Math.PI / 2) * r).toFixed(2)} ${(Math.sin(a - Math.PI / 2) * r).toFixed(2)}`;
  function scallop(n, r, R) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, a2 = ((i + 1) / n) * TAU;
      d += (i ? '' : `M${pt(r, a0)}`) + `Q${pt(R, a1)} ${pt(r, a2)}`;
    }
    return `${d}Z`;
  }
  function starPath(n, R, r) {
    let d = '';
    for (let i = 0; i < n * 2; i++) d += `${i ? 'L' : 'M'}${pt(i % 2 ? r : R, (i / (n * 2)) * TAU)}`;
    return `${d}Z`;
  }
  const RIM = {
    3: scallop(18, 40.5, 47.5),
    4: scallop(14, 40.5, 48),
    rays: starPath(16, 50, 37),
  };
  function defs() {
    if ($('#bm-defs')) return;
    const metal = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    let g = '';
    g += metal('bm-m1', [[0, '#f8cfa2'], [0.32, '#d38e52'], [0.62, '#9c5a2a'], [0.84, '#e4a86e'], [1, '#6e3b17']]);
    g += metal('bm-m2', [[0, '#ffffff'], [0.32, '#dbe2ea'], [0.6, '#98a5b3'], [0.82, '#eef2f6'], [1, '#66727f']]);
    g += metal('bm-m3', [[0, '#fff6c8'], [0.3, '#f3cb62'], [0.6, '#c48f2a'], [0.82, '#fbe08a'], [1, '#8a5f15']]);
    g += metal('bm-m4', [[0, '#ffffff'], [0.2, '#fbe3f4'], [0.42, '#dde5ff'], [0.62, '#f3d9ff'], [0.82, '#d4f0f2'], [1, '#9f90d2']], 1, 1);
    g += metal('bm-m5', [[0, '#eef5ff'], [0.32, '#b4cdf5'], [0.62, '#5d79bd'], [0.84, '#cfe0ff'], [1, '#2f427a']]);
    g += metal('bm-ban', [[0, '#fffaf0'], [1, '#ead4a4']]);
    g += '<radialGradient id="bm-ray" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#eef4ff"/><stop offset="0.84" stop-color="#b3c9f4" stop-opacity="0.95"/><stop offset="1" stop-color="#7f9be0" stop-opacity="0.6"/></radialGradient>';
    g += '<radialGradient id="bm-bead" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#f4eaff"/><stop offset="1" stop-color="#a99bd4"/></radialGradient>';
    for (const [k, c] of Object.entries(FACES)) {
      g += `<radialGradient id="bm-e-${k}" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="${mixC(c, '#ffffff', 0.42)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${mixC(c, '#000000', 0.42)}"/></radialGradient>`;
    }
    const el = document.createElement('div');
    el.innerHTML = `<svg id="bm-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${g}</defs></svg>`;
    document.body.appendChild(el.firstChild);
  }
  function medal(b, locked) {
    const g = b.g, face = b.face || b.p, col = FACES[face];
    const glyph = GLYPH[b.icon] || GLYPH.star;
    const banner = b.n ? short(b.n) : '';
    const gy = banner ? -20.5 : -16, gs = banner ? 1.12 : 1.3, gx = -12 * gs;
    const gT = `translate(${gx.toFixed(2)} ${gy}) scale(${gs})`;
    if (locked) {
      const pencil = mixC(GRADES[g].color, '#7a6a52', 0.62);
      let s = `<circle r="38" fill="rgba(122,98,60,0.06)" stroke="${pencil}" stroke-width="1.4" stroke-dasharray="3.4 3" />`;
      if (b.secret) return `<svg viewBox="-50 -50 100 100" aria-hidden="true">${s}<text y="13" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="38" font-weight="600" fill="${pencil}" opacity="0.7">?</text></svg>`;
      s += `<g transform="${gT}" fill="none" stroke="${pencil}" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" opacity="0.62">${glyph}</g>`;
      if (banner) s += `<path d="M-25 9h50l-3.6 6.5 3.6 6.5h-50l3.6-6.5z" fill="none" stroke="${pencil}" stroke-width="1" stroke-dasharray="2.4 2"/><text y="19.4" text-anchor="middle" font-family="Nunito, sans-serif" font-size="10.5" font-weight="800" fill="${pencil}">${banner}</text>`;
      return `<svg viewBox="-50 -50 100 100" aria-hidden="true">${s}</svg>`;
    }
    let s = '';
    if (g === 5) s += `<path d="${RIM.rays}" fill="url(#bm-ray)" stroke="rgba(70,98,168,0.45)" stroke-width="0.6" stroke-linejoin="round"/>`;
    if (g >= 3) {
      const dark = mixC(col, '#000000', 0.25), lite = mixC(col, '#ffffff', 0.25);
      s += `<path d="M-17 20L-27 48l8.5-4.5L-12 50l-4-26z" fill="${dark}"/><path d="M17 20l10 28-8.5-4.5L12 50l4-26z" fill="${dark}"/>`;
      s += `<path d="M-20.5 28l-4.2 11.8 3.4-1.8M20.5 28l4.2 11.8-3.4-1.8" fill="none" stroke="${lite}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    if (g === 1) s += '<circle r="40" fill="url(#bm-m1)"/><circle r="37.4" fill="none" stroke="rgba(70,35,10,0.35)" stroke-width="1"/>';
    else if (g === 2) {
      s += '<circle r="41.5" fill="url(#bm-m2)"/>';
      for (let i = 0; i < 30; i++) s += `<circle cx="${(Math.cos((i / 30) * TAU) * 38.2).toFixed(2)}" cy="${(Math.sin((i / 30) * TAU) * 38.2).toFixed(2)}" r="1.35" fill="rgba(255,255,255,0.75)" stroke="rgba(60,70,82,0.4)" stroke-width="0.4"/>`;
    } else if (g === 3) s += `<path d="${RIM[3]}" fill="url(#bm-m3)" stroke="rgba(110,70,10,0.45)" stroke-width="0.6"/><circle r="37.6" fill="none" stroke="rgba(255,246,200,0.7)" stroke-width="1"/>`;
    else if (g === 4) {
      s += `<path d="${RIM[4]}" fill="url(#bm-m4)" stroke="rgba(120,100,170,0.4)" stroke-width="0.6"/>`;
      for (let i = 0; i < 12; i++) s += `<circle cx="${(Math.cos((i / 12) * TAU + 0.26) * 38.6).toFixed(2)}" cy="${(Math.sin((i / 12) * TAU + 0.26) * 38.6).toFixed(2)}" r="3.1" fill="url(#bm-bead)" stroke="rgba(110,90,160,0.35)" stroke-width="0.4"/>`;
    } else {
      s += '<circle r="42.5" fill="url(#bm-m5)" stroke="rgba(30,45,90,0.5)" stroke-width="0.6"/><circle r="39.6" fill="none" stroke="rgba(235,244,255,0.8)" stroke-width="1"/>';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16, x = Math.cos(a) * 41, y = Math.sin(a) * 41; s += `<path d="M${(x - 2.2).toFixed(1)} ${y.toFixed(1)}h4.4M${x.toFixed(1)} ${(y - 2.2).toFixed(1)}v4.4" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/>`; }
    }
    s += `<circle r="33.2" fill="rgba(20,12,4,0.32)"/><circle r="31.6" fill="url(#bm-e-${face})"/>`;
    s += '<path d="M-27 -9A28.5 28.5 0 0 1 27 -9A36 20 0 0 0 -27 -9Z" fill="rgba(255,255,255,0.2)"/>';
    if (g === 5) s += '<path d="M3.5 -27.5a6.5 6.5 0 1 0 6 9.5 5 5 0 0 1-6-9.5z" fill="rgba(255,255,255,0.55)"/>';
    const stroke = `fill="none" stroke-width="${(1.7 / gs * 1.3).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"`;
    s += `<g transform="translate(0 0.9) ${gT}" ${stroke} stroke="rgba(25,12,0,0.38)">${glyph}</g>`;
    s += `<g transform="${gT}" ${stroke} stroke="#fff8e8">${glyph}</g>`;
    if (banner) {
      s += '<path d="M-26 9h52l-3.8 6.5 3.8 6.5h-52l3.8-6.5z" fill="url(#bm-ban)" stroke="rgba(90,58,20,0.45)" stroke-width="0.6"/>';
      s += `<text y="19.6" text-anchor="middle" font-family="Nunito, sans-serif" font-size="${banner.length > 4 ? 9.6 : 10.8}" font-weight="800" fill="#4a3313">${banner}</text>`;
    }
    return `<svg viewBox="-50 -50 100 100" aria-hidden="true">${s}</svg>`;
  }

  /* ================= The unlock moment =================
     Each new badge drops in at the top of the screen with its medal spinning into place and a chime
     that grows with its grade; tap it to open the scrapbook there. Several at once come one after
     another, and a crowd is gathered into one note. Nothing interrupts a fight. */
  const queue = [];
  let popping = false, waitT = 0;
  function pump() {
    if (popping || !queue.length) return;
    if (api.busy && api.busy()) { clearTimeout(waitT); waitT = setTimeout(pump, 700); return; }
    popping = true;
    let item = queue.shift();
    if (queue.length >= 3) {
      const all = [item, ...queue.splice(0)];
      item = { many: all.length, g: Math.max(...all.map(b => b.g)), first: all.sort((a, b) => b.g - a.g)[0] };
    }
    showPop(item);
  }
  function showPop(item) {
    const el = document.createElement('button');
    el.type = 'button';
    const b = item.many ? item.first : item.summary ? item.first : item;
    const G = GRADES[item.g || b.g];
    el.className = `badge-pop g${item.g || b.g}`;
    el.style.setProperty('--gc', G.color);
    const title = item.summary ? 'Your scrapbook is ready' : item.many ? `${item.many} new badges` : `${G.name} badge earned`;
    const name = item.summary ? `${fmt(item.summary)} badges from your adventures so far` : item.many ? 'Open your scrapbook to admire them' : b.name;
    const line = item.summary || item.many ? '' : b.secret ? 'A secret, found!' : b.desc;
    el.innerHTML = `<span class="bp-medal">${medal(b)}</span><span class="bp-text"><small>${esc(title)}</small><b>${esc(name)}</b>${line ? `<em>${esc(line)}</em>` : ''}</span>`;
    el.setAttribute('aria-label', `${title}: ${name}. Open the scrapbook`);
    for (let i = 0; i < 10; i++) {
      const sp = document.createElement('i');
      sp.className = 'bp-spark';
      const a = (i / 10) * TAU + Math.random() * 0.4, d = 34 + Math.random() * 26;
      sp.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
      sp.style.setProperty('--dy', `${(Math.sin(a) * d * 0.8).toFixed(1)}px`);
      sp.style.animationDelay = `${(0.25 + Math.random() * 0.2).toFixed(2)}s`;
      el.appendChild(sp);
    }
    el.addEventListener('click', () => { close(); if (!api.canUse || api.canUse()) open(item.many || item.summary ? null : b.id); });
    ($('#app') || document.body).appendChild(el);
    api.play('badge', item.g || b.g);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    const ms = item.summary ? 6000 : 3400 + Math.max(0, (item.g || b.g) - 2) * 700;
    let done = false;
    const t = setTimeout(close, ms);
    function close() {
      if (done) return;
      done = true; clearTimeout(t);
      el.classList.remove('show'); el.classList.add('hide');
      setTimeout(() => { el.remove(); popping = false; pump(); }, 420);
    }
  }

  /* ================= The scrapbook ================= */
  let page = 'first', detail = null, seenOnPage = new Set();
  const isOpen = () => { const m = $('#m-book'); return !!m && !m.hidden && !m.classList.contains('closing'); };
  const pageOf = id => (BY[id] ? BY[id].p : 'first');
  const counts = p => { const list = LIST.filter(b => b.p === p); return { got: list.filter(earned).length, n: list.length }; };
  const whenText = v => (v === 1 ? 'From your adventures before the scrapbook' : `Earned ${new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`);
  const whenShort = v => (v === 1 ? 'Earlier' : new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  function dot() {
    const d = $('#book-dot');
    if (!d || !api) return;
    const n = state().fresh.length;
    d.hidden = !n;
    const b = $('#btn-book');
    if (b) b.setAttribute('aria-label', n ? `Scrapbook: ${n} new ${n === 1 ? 'badge' : 'badges'}` : 'Scrapbook');
  }
  /* Badges shown on a page count as admired once you leave it (or open one of them). */
  function settleSeen() {
    if (!seenOnPage.size) return;
    const A = state();
    A.fresh = A.fresh.filter(id => !seenOnPage.has(id));
    seenOnPage.clear();
    api.persist();
    dot();
  }

  function open(id) {
    if (!api) return;
    state();
    if (id && BY[id]) { page = BY[id].p; detail = id; }
    else {
      detail = null;
      const A = state();
      const firstNew = A.fresh.find(x => BY[x]);
      if (firstNew) page = BY[firstNew].p;
    }
    render();
    api.openModal('#m-book');
    api.play('open');
  }
  function onClosed() { settleSeen(); detail = null; }

  function render() {
    const A = state(), total = LIST.length, got = LIST.filter(earned).length;
    $('#book-sub').textContent = `${got} of ${total} badges earned${A.fresh.length ? ` · ${A.fresh.length} new` : ''}`;
    let tally = `<div class="book-bar" role="img" aria-label="${got} of ${total} badges"><i style="width:${((got / total) * 100).toFixed(1)}%"></i></div>`;
    for (let g = 1; g <= 5; g++) {
      const list = LIST.filter(b => b.g === g);
      tally += `<span class="gm" style="--gc:${GRADES[g].color}" title="${GRADES[g].name} badges"><i></i>${GRADES[g].name} ${list.filter(earned).length}/${list.length}</span>`;
    }
    $('#book-tally').innerHTML = tally;
    $('#book-tabs').innerHTML = PAGES.map(p => {
      const c = counts(p.id), fresh = A.fresh.some(id => BY[id] && BY[id].p === p.id);
      return `<button type="button" class="tab${p.id === page ? ' on' : ''}" role="tab" aria-selected="${p.id === page}" data-page="${p.id}" style="--pc:${p.color}">${esc(p.name)}<small>${c.got}/${c.n}</small>${fresh ? '<i class="tdot" aria-label="new badges"></i>' : ''}</button>`;
    }).join('');
    const body = $('#book-body');
    body.innerHTML = detail ? detailHTML(BY[detail]) : pageHTML(page);
    body.style.setProperty('--pc', PAGE[page].color);
    if (detail) wireDetail();
    else for (const id of A.fresh) if (BY[id] && BY[id].p === page) seenOnPage.add(id);
    const on = $('#book-tabs .tab.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function cellHTML(b, M) {
    const A = state(), got = A.got[b.id], fresh = A.fresh.includes(b.id);
    const rot = got ? ((hash(b.id) % 9) - 4) * 0.8 : 0;
    const secretShut = b.secret && !got;
    const name = secretShut ? '???' : b.name;
    let meta = '';
    if (got) meta = `<span class="bk-meta">${esc(whenShort(got))}</span>`;
    else if (secretShut) meta = '<span class="bk-meta">A secret</span>';
    else if (b.goal > 1) {
      const v = Math.min(valueOf(b, M), b.goal);
      meta = `<span class="bk-prog" aria-hidden="true"><i style="width:${((v / b.goal) * 100).toFixed(1)}%"></i></span><span class="bk-meta">${short(Math.floor(v))} / ${short(b.goal)}</span>`;
    } else meta = '<span class="bk-meta">Not yet</span>';
    const label = `${name}, ${GRADES[b.g].name} badge, ${got ? whenText(got) : secretShut ? 'secret, not yet found' : 'not yet earned'}`;
    return `<button type="button" class="bk-cell g${b.g}${got ? ' got' : ' lock'}${fresh ? ' new' : ''}" data-id="${b.id}" aria-label="${esc(label)}">
      <span class="bk-medal" style="--rot:${rot.toFixed(1)}deg">${medal(b, !got)}</span>
      <span class="bk-name">${esc(name)}</span>${meta}${fresh ? '<span class="bk-new">New</span>' : ''}</button>`;
  }
  function pageHTML(pid) {
    const P = PAGE[pid], M = measure(), list = LIST.filter(b => b.p === pid), c = counts(pid);
    let h = `<div class="bk-paper"><header class="bk-head"><h3>${esc(P.name)}</h3><span class="bk-count">${c.got} / ${c.n}</span><p>${esc(P.sub)}</p></header>`;
    let sec = null;
    for (const b of list) {
      if (b.sec !== sec) {
        if (sec !== null) h += '</div>';
        sec = b.sec;
        h += `${sec ? `<h4 class="bk-sec">${esc(sec)}</h4>` : ''}<div class="bk-grid">`;
      }
      h += cellHTML(b, M);
    }
    return `${h}</div></div>`;
  }
  function detailHTML(b) {
    const A = state(), got = A.got[b.id], M = measure(), G = GRADES[b.g], secretShut = b.secret && !got;
    let h = `<div class="bk-paper bk-detail"><button type="button" class="secondary-btn bk-back" data-back><svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>${esc(PAGE[b.p].name)}</button>`;
    h += `<div class="bk-stage" id="bk-stage"><div class="bk-big${got ? ' idle' : ''}" id="bk-big" role="img" aria-label="${esc(secretShut ? 'A secret badge' : `${b.name} badge`)}">${medal(b, !got)}${got ? '<i class="bk-shine"></i>' : ''}</div></div>`;
    h += `<span class="bk-grade" style="--gc:${G.color}">${G.name} badge</span>`;
    h += `<h3 class="bk-title">${esc(secretShut ? 'A secret' : b.name)}</h3>`;
    h += `<p class="bk-desc">${esc(secretShut ? b.hint : b.desc)}</p>`;
    if (b.note && !secretShut) h += `<p class="bk-note">${esc(b.note)}</p>`;
    if (got) h += `<p class="bk-when">${esc(whenText(got))}</p>`;
    else if (!secretShut && b.goal > 1) {
      const v = Math.min(valueOf(b, M), b.goal), left = b.goal - Math.floor(v);
      h += `<div class="bk-dprog"><span class="bk-prog"><i style="width:${((v / b.goal) * 100).toFixed(1)}%"></i></span><span>${fmt(Math.floor(v))} of ${fmt(b.goal)}${b.unit ? ` ${b.unit}` : ''} · ${fmt(left)} to go</span></div>`;
    } else if (!secretShut) h += '<p class="bk-when">Not yet earned</p>';
    else h += '<p class="bk-when">Not yet found</p>';
    if (b.ser) {
      const sib = LIST.filter(x => x.ser === b.ser);
      if (sib.length > 1) {
        h += `<div class="bk-series" role="list">${sib.map(x => {
          const xg = A.got[x.id];
          return `<button type="button" role="listitem" class="${x.id === b.id ? 'on' : ''}" data-id="${x.id}" aria-label="${esc(`${x.name}${xg ? ', earned' : ''}`)}"><span class="bk-medal">${medal(x, !xg)}</span><span>${esc(x.n ? short(x.n) : x.goal > 1 ? short(x.goal) : 'First')}</span></button>`;
        }).join('')}</div>`;
      }
    }
    return `${h}</div>`;
  }
  /* Admiring a badge: it sways gently, tilts toward your finger or pointer with light sliding across it,
     and spins when tapped. */
  function wireDetail() {
    const stage = $('#bk-stage'), big = $('#bk-big');
    if (!stage || !big || !big.classList.contains('idle')) return;
    const b = BY[detail];
    const tilt = e => {
      const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      big.classList.remove('idle');
      stage.classList.add('live');
      big.style.setProperty('--ry', `${(x * 36).toFixed(1)}deg`);
      big.style.setProperty('--rx', `${(-y * 30).toFixed(1)}deg`);
      big.style.setProperty('--sx', `${(50 - x * 120).toFixed(0)}%`);
    };
    const rest = () => { stage.classList.remove('live'); big.style.setProperty('--rx', '0deg'); big.style.setProperty('--ry', '0deg'); big.style.setProperty('--sx', '50%'); setTimeout(() => { if (!stage.classList.contains('live')) big.classList.add('idle'); }, 500); };
    stage.addEventListener('pointermove', tilt);
    stage.addEventListener('pointerleave', rest);
    stage.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') rest(); });
    big.addEventListener('click', () => {
      if (UIFX.reduced()) return;
      big.classList.remove('spin'); void big.offsetWidth; big.classList.add('spin');
      api.play('badge', b.g);
    });
    big.addEventListener('animationend', e => { if (e.animationName === 'bkSpin') big.classList.remove('spin'); });
  }

  function onClick(e) {
    const tab = e.target.closest('[data-page]');
    const card = $('#m-book .card'), body = $('#book-body');
    if (tab) {
      const to = tab.dataset.page;
      if (to === page && !detail) return;
      const dir = Math.sign(PAGES.findIndex(p => p.id === to) - PAGES.findIndex(p => p.id === page)) || 1;
      settleSeen();
      page = to; detail = null;
      api.play('page');
      UIFX.swap(card, body, render, dir);
      return;
    }
    if (e.target.closest('[data-back]')) {
      detail = null;
      api.play('click');
      UIFX.swap(card, body, render, -1);
      return;
    }
    const cell = e.target.closest('[data-id]');
    if (cell && BY[cell.dataset.id]) {
      const id = cell.dataset.id;
      if (id === detail) return;
      const A = state();
      if (A.fresh.includes(id)) { A.fresh = A.fresh.filter(x => x !== id); seenOnPage.delete(id); api.persist(); dot(); }
      const fromGrid = !detail;
      if (fromGrid) settleSeen();
      detail = id; page = BY[id].p;
      api.play('select');
      UIFX.swap(card, body, () => { render(); const top = $('#m-book .card'); if (top && fromGrid) top.scrollTop = 0; }, 1);
    }
  }

  /* ================= Start ================= */
  function init(a) {
    api = a;
    defs();
    const A = state();
    $('#m-book').addEventListener('click', onClick);
    $('#btn-book').addEventListener('click', () => { if (!api.canUse || api.canUse()) open(); });
    if (A.seeded) {
      // a save from before the scrapbook: credit everything it already shows, quietly, with one note
      delete A.seeded;
      const won = check(true);
      api.persist();
      if (won.length) {
        const first = won.slice().sort((x, y) => y.g - x.g)[0];
        setTimeout(() => { queue.push({ summary: won.length, g: first.g, first }); pump(); }, 2600);
      }
    } else check();
    dot();
  }

  /* for testing (the console's Tidesong.badges): earn the given badges, or every one */
  function grant(ids) {
    const A = state(), now = Date.now();
    for (const b of LIST) if ((!ids || ids.includes(b.id)) && !A.got[b.id]) { A.got[b.id] = now; A.fresh.push(b.id); }
    api.persist(); dot();
    if (isOpen()) render();
  }

  return { init, note, check, poke, open, onClosed, isOpen, medal, grant, get list() { return LIST; }, GRADES, PAGES, _measure: () => measure() };
})();
