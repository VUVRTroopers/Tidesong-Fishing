/* Tidesong — game data: rarities, species, fishing waters and progression. */
'use strict';

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'extreme'];

const RARITIES = {
  common:    { id: 'common',    name: 'Common',    color: '#bfe0c9', deep: '#5c9a78', xp: 10,   tier: 0 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#86c9f7', deep: '#2f78b8', xp: 28,   tier: 1 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#c8a2ff', deep: '#7a45d6', xp: 75,   tier: 2 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffd46e', deep: '#c98a12', xp: 320,  tier: 3 },
  extreme:   { id: 'extreme',   name: 'Extreme',   color: '#ff6f86', deep: '#c0123a', xp: 1200, tier: 4 },
};

/* Reel fight tuning per rarity.
   fill/drain: meter change per second inside/outside the band.
   band: width of the green control band (fraction of the slider).
   interval: seconds between the fish choosing a new destination.
   stiff: spring stiffness range (how violently the fish moves to its destination).
   zeta: damping ratio (lower = more overshoot and twitchiness).
   hold/dart/thrash: probabilities of pausing, dashing to the far side, or thrashing in place.
   wiggle: amplitude of constant small jitter.
   Legendary and extreme fish are tuned against the gear ladder in js/gear.js: with the starter kit they
   are a long shot, every tier of rod, bobber and line lifts the odds, and only a full Heirloom kit makes
   the Dragon Fish a likely catch. */
const REEL = {
  common:    { fill: 0.16,  drain: 0.07,  band: 0.30, interval: [1.2, 2.5],  stiff: [3, 6],    zeta: 0.9,  hold: 0.32, dart: 0.04, thrash: 0,    wiggle: 0.006 },
  rare:      { fill: 0.14,  drain: 0.08,  band: 0.27, interval: [0.9, 1.9],  stiff: [5, 10],   zeta: 0.78, hold: 0.26, dart: 0.1,  thrash: 0.03, wiggle: 0.01 },
  epic:      { fill: 0.125, drain: 0.085, band: 0.25,  interval: [0.7, 1.45],  stiff: [7, 13],   zeta: 0.68, hold: 0.2,  dart: 0.17, thrash: 0.06, wiggle: 0.015 },
  legendary: { fill: 0.106, drain: 0.088, band: 0.226, interval: [0.55, 1.2],  stiff: [9, 17],   zeta: 0.58, hold: 0.17, dart: 0.22, thrash: 0.09, wiggle: 0.02 },
  extreme:   { fill: 0.092, drain: 0.084, band: 0.212, interval: [0.5, 1.1],   stiff: [10, 19],  zeta: 0.52, hold: 0.15, dart: 0.24, thrash: 0.11, wiggle: 0.024 },
};

/* The player's band: holding accelerates it right, releasing lets it sink left; drag keeps it responsive. */
const BAND_PHYS = { up: 5.6, down: 4.6, drag: 3.2, bounce: 0.25 };

const REEL_START = 0.3;      // meter starts here
const REEL_ESCAPE = 0.1;     // dropping below this frees the fish
const REEL_GRACE = 1.0;      // seconds at the start before the meter can fall

/* kg / cm: size ranges. measure: what the cm figure describes. worth: sale-price multiplier. */
const SPECIES = {
  trout:      { name: 'Trout',       rarity: 'common', kg: [0.4, 3.5], cm: [25, 75],  worth: 1.0,
                blurb: 'Speckled like river pebbles and quick to strike in the early light.' },
  salmon:     { name: 'Salmon',      rarity: 'common', kg: [2, 14],    cm: [50, 110], worth: 1.15,
                blurb: 'A silver traveller that remembers every river it has ever swum.' },
  pomfret:    { name: 'Pomfret',     rarity: 'common', kg: [0.3, 2],   cm: [15, 40],  worth: 1.05,
                blurb: 'A coin-bright disc that flashes like a mirror as it turns.' },
  catfish:    { name: 'Catfish',     rarity: 'common', kg: [1, 20],    cm: [40, 140], worth: 1.0,
                blurb: 'Whiskered and wise. It hums to itself on the muddy bottom.' },
  crucian:    { name: 'Crucian',     rarity: 'common', kg: [0.2, 1.6], cm: [12, 35],  worth: 0.85,
                blurb: 'A round little bronze fish, content in any still water.' },
  tilapia:    { name: 'Tilapia',     rarity: 'common', kg: [0.3, 2.8], cm: [18, 50],  worth: 0.9,
                blurb: 'Banded and bold. It guards its nest with surprising courage.' },
  carp:       { name: 'Carp',        rarity: 'common', kg: [1.5, 16],  cm: [35, 100], worth: 1.0,
                blurb: 'Patient and golden-scaled. Some say a carp can live a hundred years.' },
  puffer:     { name: 'Pufferfish',  rarity: 'rare',   kg: [0.4, 3],   cm: [15, 45],  worth: 1.1,
                blurb: 'Swells into a spiky lantern when startled. Handle with care.' },
  grouper:    { name: 'Grouper',     rarity: 'rare',   kg: [4, 45],    cm: [45, 150], worth: 1.0,
                blurb: 'A heavyweight with a cavernous mouth and a permanently grumpy face.' },
  pike:       { name: 'Pike',        rarity: 'rare',   kg: [2, 18],    cm: [50, 130], worth: 0.95,
                blurb: 'An ambush hunter that waits among the reeds like a green arrow.' },
  barracuda:  { name: 'Barracuda',   rarity: 'rare',   kg: [2.5, 24],  cm: [60, 170], worth: 1.05,
                blurb: 'Sleek, toothy and as fast as a thrown knife.' },
  bluegill:   { name: 'Bluegill',    rarity: 'common', kg: [0.1, 1.2], cm: [12, 30],  worth: 0.9,
                blurb: 'A pond sunfish with a dark ear-flap and a sunset belly. Small, scrappy and always hungry.' },
  perch:      { name: 'Perch',       rarity: 'common', kg: [0.2, 2.2], cm: [15, 45],  worth: 0.95,
                blurb: 'Barred in olive and gold with flame-orange fins. It hunts in little schools along the reeds.' },
  mudskipper: { name: 'Mudskipper',  rarity: 'common', kg: [0.03, 0.25], cm: [8, 25], worth: 0.9,
                blurb: 'Half fish, half frog. It hops across the mud on its fins and blinks with eyes on top of its head.' },
  lanternfish:{ name: 'Lanternfish', rarity: 'common', kg: [0.02, 0.15], cm: [6, 16], worth: 1.0,
                blurb: 'Rows of tiny lights glimmer along its sides, like a string of lanterns across the fen at dusk.' },
  clownfish:  { name: 'Clownfish',   rarity: 'common', kg: [0.05, 0.3], cm: [8, 16],  worth: 1.05,
                blurb: 'Orange and white with a jester\'s grin. It never strays far from its home anemone.' },
  snapper:    { name: 'Red Snapper', rarity: 'common', kg: [1, 18],    cm: [35, 100], worth: 1.05,
                blurb: 'A rosy reef fish with a sharp eye and a sharper bite.' },
  cod:        { name: 'Cod',         rarity: 'common', kg: [2, 40],    cm: [40, 150], worth: 1.0,
                blurb: 'A speckled traveller of cold water with a single chin whisker. It has fed whole villages.' },
  char:       { name: 'Arctic Char', rarity: 'common', kg: [0.5, 12],  cm: [30, 90],  worth: 1.1,
                blurb: 'Its belly blushes red in the cold and every fin is edged in white, as if dipped in snow.' },
  goldfish:   { name: 'Goldfish',    sub: 'Temple Ryukin', rarity: 'common', kg: [0.2, 2], cm: [12, 35], worth: 1.0,
                blurb: 'A temple goldfish with a flowing double tail. The keepers of Dragonmere feed them rice at dawn.' },
  bass:       { name: 'Bass',        sub: 'Largemouth', rarity: 'rare', kg: [0.8, 10], cm: [30, 75], worth: 1.0,
                blurb: 'A bucket-mouthed ambusher that bursts out from under the lily pads.' },
  eel:        { name: 'Eel',         sub: 'Glowfen', rarity: 'rare', kg: [0.5, 6],  cm: [50, 150], worth: 1.05,
                blurb: 'It slips through the marsh like a ribbon of shadow, its fins faintly glowing.' },
  lionfish:   { name: 'Lionfish',    rarity: 'rare',   kg: [0.4, 1.4], cm: [20, 45],  worth: 1.15,
                blurb: 'Striped in candy red and wrapped in fan-like fins full of venomous spines. Beautiful, and it knows it.' },
  sturgeon:   { name: 'Sturgeon',    rarity: 'rare',   kg: [10, 120],  cm: [100, 300], worth: 0.95,
                blurb: 'An armoured giant older than the ice. Rows of bony plates run along its back.' },
  snakehead:  { name: 'Snakehead',   rarity: 'rare',   kg: [1, 9],     cm: [40, 100], worth: 1.0,
                blurb: 'A dark, patterned hunter that can breathe air. It glares at you as if it owns the lake.' },
  koi:        { name: 'Koi',         rarity: 'epic',   kg: [1.2, 10],  cm: [35, 90],  worth: 1.1,
                blurb: 'Painted in crimson and snow, with fins like silk. A koi is said to bring good fortune.' },
  flyingfish: { name: 'Flying Fish', sub: 'Sting Ray', rarity: 'epic', kg: [5, 32], cm: [60, 180], measure: 'Wingspan', worth: 1.0,
                blurb: 'It glides through the deep on luminous wings, trailing a whip of a tail.' },
  angelfish:  { name: 'Angelfish',   rarity: 'epic',   kg: [0.1, 0.6], cm: [15, 35],  measure: 'Height', worth: 1.1,
                blurb: 'Tall as a sail and striped like moonlight through reeds, it drifts with impossible grace.' },
  betta:      { name: 'Betta',       sub: 'Fighting Fish', rarity: 'epic', kg: [0.02, 0.12], cm: [6, 16], worth: 1.1,
                blurb: 'A little warrior in a gown of sapphire and crimson silk. Its fins ripple like a dancer\'s veils.' },
  seahorse:   { name: 'Seahorse',    sub: 'Golden', rarity: 'epic', kg: [0.02, 0.15], cm: [12, 35], measure: 'Height', worth: 1.15,
                blurb: 'It curls its tail around the coral and rises like a chess knight cast in gold.' },
  oarfish:    { name: 'Oarfish',     rarity: 'epic',   kg: [20, 200],  cm: [300, 800], worth: 1.0,
                blurb: 'A silver ribbon of the deep with a crimson crown. Sailors once swore it was a sea serpent.' },
  swordfish:  { name: 'Swordfish',   rarity: 'epic',   kg: [50, 450],  cm: [150, 450], worth: 1.0,
                blurb: 'A blade-billed sprinter. It cuts through Dragonmere\'s red moonlight like a drawn sword.' },
  penguin:    { name: 'Penguin',     sub: 'Emperor',   rarity: 'legendary', kg: [22, 42], cm: [100, 130], measure: 'Height', worth: 1.0,
                blurb: 'Royalty of the frozen deep. Nobody knows how it ended up on your hook, and it is not telling.' },
  dolphin:    { name: 'Dolphin',     sub: 'Bottlenose', rarity: 'legendary', kg: [150, 300], cm: [200, 400], worth: 1.05,
                blurb: 'Clever, playful and endlessly curious. It came to see what you were doing, and stayed long enough to be remembered.' },
  dragonfish: { name: 'Dragon Fish', sub: 'Arowana',   rarity: 'extreme', kg: [3.5, 8], cm: [60, 110], worth: 1.0,
                blurb: 'Scales of molten gold and ember, whiskers like a dragon. Its catch is spoken of for generations.' },
};

const SPECIES_ORDER = [
  'trout', 'salmon', 'pomfret', 'catfish', 'crucian', 'tilapia', 'carp',
  'bluegill', 'perch', 'mudskipper', 'lanternfish', 'clownfish', 'snapper', 'cod', 'char', 'goldfish',
  'puffer', 'grouper', 'pike', 'barracuda', 'bass', 'eel', 'lionfish', 'sturgeon', 'snakehead',
  'koi', 'flyingfish', 'angelfish', 'betta', 'seahorse', 'oarfish', 'swordfish',
  'penguin', 'dolphin', 'dragonfish'];

/* Each water has its own signature fish, and every species bites most often at its home water.
   rarity: relative weights for which rarity bites.
   fish: per rarity, relative weights for which species of that rarity bites.
   bite: multiplier on how quickly bites come. */
const LOCATIONS = [
  {
    id: 'mistwillow', name: 'Mistwillow Pond', level: 1, time: 'Early morning',
    blurb: 'A sleepy pond beneath weeping willows, where the morning mist never quite lifts.',
    rarity: { common: 87, rare: 11, epic: 2 },
    fish: {
      common: { crucian: 20, carp: 18, bluegill: 18, perch: 14, tilapia: 12, trout: 10, catfish: 8 },
      rare: { pike: 44, bass: 42, puffer: 14 },
      epic: { koi: 55, angelfish: 45 },
    },
    bite: 1.1,
  },
  {
    id: 'lanternfen', name: 'Lanternfen Marsh', level: 3, time: 'Dusk',
    blurb: 'Fireflies drift above black water. The catfish here grow whiskers like old sages.',
    rarity: { common: 78, rare: 18, epic: 4 },
    fish: {
      common: { catfish: 20, lanternfish: 18, mudskipper: 16, tilapia: 13, carp: 11, bluegill: 8, crucian: 7, trout: 5, perch: 2 },
      rare: { eel: 40, pike: 24, puffer: 18, grouper: 10, bass: 8 },
      epic: { betta: 55, koi: 30, flyingfish: 15 },
    },
    bite: 1.0,
  },
  {
    id: 'coralspire', name: 'Coralspire Lagoon', level: 6, time: 'Golden afternoon',
    blurb: 'Turquoise shallows ringed by towering spires of pink coral. Dolphins have been seen past the reef.',
    rarity: { common: 64, rare: 26, epic: 8.7, legendary: 1.3 },
    fish: {
      common: { clownfish: 26, pomfret: 22, snapper: 20, salmon: 12, tilapia: 12, catfish: 8 },
      rare: { lionfish: 32, barracuda: 26, puffer: 22, grouper: 20 },
      epic: { seahorse: 46, flyingfish: 40, koi: 14 },
      legendary: { dolphin: 1 },
    },
    bite: 1.0,
  },
  {
    id: 'frostveil', name: 'Frostveil Fjord', level: 10, time: 'Aurora night',
    blurb: 'Ice cliffs hum beneath the aurora. Something regal is said to waddle in these waters.',
    rarity: { common: 60, rare: 27, epic: 11, legendary: 2 },
    fish: {
      common: { cod: 24, char: 22, salmon: 22, trout: 16, perch: 10, pomfret: 6 },
      rare: { sturgeon: 36, pike: 24, barracuda: 22, grouper: 18 },
      epic: { oarfish: 50, flyingfish: 25, koi: 25 },
      legendary: { penguin: 1 },
    },
    bite: 0.95,
  },
  {
    id: 'dragonmere', name: 'Dragonmere Sanctum', level: 15, time: 'Crimson moon',
    blurb: 'A crimson lake beneath floating lanterns. Legends tell of a golden dragon in its depths.',
    rarity: { common: 52, rare: 30, epic: 14.6, legendary: 2.8, extreme: 0.6 },
    fish: {
      common: { goldfish: 24, carp: 14, salmon: 12, pomfret: 10, trout: 10, crucian: 10, catfish: 10, tilapia: 10 },
      rare: { snakehead: 40, puffer: 15, grouper: 15, pike: 15, barracuda: 15 },
      epic: { swordfish: 55, koi: 25, flyingfish: 20 },
      legendary: { penguin: 55, dolphin: 45 },
      extreme: { dragonfish: 1 },
    },
    bite: 0.9,
  },
];

const MAX_LEVEL = 60;

/* XP needed to go from level L to L+1. */
function xpForLevel(L) {
  return Math.round(30 * Math.pow(L, 1.2));
}

function levelFromXp(xp) {
  let level = 1, floor = 0, need = xpForLevel(1);
  while (xp >= floor + need && level < MAX_LEVEL) {
    floor += need;
    level += 1;
    need = xpForLevel(level);
  }
  return { level, into: xp - floor, need };
}

function weightedPick(weights, rnd = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

/* Which waters a species can be found in (for the journal). */
function whereFound(speciesId) {
  return LOCATIONS.filter(loc => {
    const table = loc.fish[SPECIES[speciesId].rarity];
    return table && table[speciesId] > 0 && loc.rarity[SPECIES[speciesId].rarity] > 0;
  });
}

/* ================= Market ================= */

/* Base sale price in Moonpearls for an average fish of each rarity. */
const VALUE = { common: 12, rare: 45, epic: 160, legendary: 1200, extreme: 5000 };

const clamp01 = v => Math.max(0, Math.min(1, v));

/* Sale price from rarity, weight and length (bigger fish within a species are worth more). */
function fishValue(id, kg, cm) {
  const sp = SPECIES[id];
  const kgU = clamp01((kg - sp.kg[0]) / (sp.kg[1] - sp.kg[0]));
  const cmU = clamp01((cm - sp.cm[0]) / (sp.cm[1] - sp.cm[0]));
  return Math.max(1, Math.round(VALUE[sp.rarity] * (sp.worth || 1) * (0.7 + 0.4 * kgU + 0.3 * cmU)));
}

/* Roll the size of a freshly caught fish. Most are modest; trophies are rare. */
function rollFish(id) {
  const sp = SPECIES[id];
  const size = Math.pow(Math.random(), 1.6);
  const jitter = () => (Math.random() - 0.5) * 0.14;
  const cmU = clamp01(size + jitter());
  const kgU = clamp01(Math.pow(size, 1.1) + jitter());
  const cm = Math.round((sp.cm[0] + (sp.cm[1] - sp.cm[0]) * cmU) * 10) / 10;
  const kg = Math.round((sp.kg[0] + (sp.kg[1] - sp.kg[0]) * kgU) * 100) / 100;
  return { id, kg, cm, size, value: fishValue(id, kg, cm) };
}

/* Premium bait: used up whenever a fish bites. boost multiplies each rarity's bite weight;
   bite speeds up how soon fish bite. */
const BAITS = {
  worm:   { name: 'Glow Worms',  pack: 5, price: 75,  color: '#b8f27a', bite: 1.15,
            boost: { rare: 1.3, epic: 1.35, legendary: 1.3, extreme: 1.3 },
            blurb: 'Plump worms with a soft green glow. Rare fish find them hard to ignore.' },
  shrimp: { name: 'Moon Shrimp', pack: 5, price: 300, color: '#cfe6ff', bite: 1.25,
            boost: { rare: 1.35, epic: 1.75, legendary: 1.7, extreme: 1.7 },
            blurb: 'Silvery shrimp netted under a full moon. Prized by epic and legendary fish.' },
  roe:    { name: 'Ember Roe',   pack: 3, price: 750, color: '#ff9a5a', bite: 1.35,
            boost: { rare: 1.4, epic: 2.2, legendary: 2.3, extreme: 2.5 },
            blurb: 'Warm, glittering roe that smoulders in the water. The rarest fish rise to it.' },
};
const BAIT_ORDER = ['worm', 'shrimp', 'roe'];

function baitedWeights(loc, baitId) {
  const b = BAITS[baitId];
  const out = {};
  for (const r in loc.rarity) out[r] = loc.rarity[r] * (b && b.boost[r] ? b.boost[r] : 1);
  return out;
}

/* Percentage chance of each rarity per bite at a water, with optional bait. */
function rarityOdds(loc, baitId) {
  const w = baitedWeights(loc, baitId);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const out = {};
  for (const r in w) out[r] = (w[r] / total) * 100;
  return out;
}

/* Keepnet sizes, bought in order. */
const NET_TIERS = [
  { name: 'Reed Basket',     cap: 8,  price: 0 },
  { name: 'Wicker Creel',    cap: 12, price: 200 },
  { name: 'Linen Keepnet',   cap: 16, price: 500 },
  { name: 'Silk Keepnet',    cap: 24, price: 1200 },
  { name: "Mariner's Hold",  cap: 32, price: 3000 },
  { name: 'Moonwoven Net',   cap: 48, price: 7500 },
];
