// Every game in the collection. A game with a definition module gets a guide,
// and a score pad or tracker if its definition has one; the rest are listed
// until someone writes theirs. See README.md, "Adding a game".

import iaww from "./iaww/def.js";
import wingspan from "./wingspan.js";
import ticketToRide from "./ticket-to-ride.js";
import codenames from "./codenames.js";

const DEFS = [iaww, wingspan, ticketToRide, codenames];

// The owned collection, from BoardGameGeek. slug: name (year).
const COLLECTION = [
  ["5ive-straight", "5ive Straight", 1958],
  ["7th-continent", "The 7th Continent", 2017],
  ["arkham-horror", "Arkham Horror", 2005],
  ["arkham-horror-lcg", "Arkham Horror: The Card Game", 2016],
  ["azul", "Azul", 2017],
  ["betrayal", "Betrayal at House on the Hill", 2004],
  ["betrayal-legacy", "Betrayal Legacy", 2018],
  ["betrayal-deck-of-lost-souls", "Betrayal: Deck of Lost Souls", 2024],
  ["between-two-castles", "Between Two Castles of Mad King Ludwig", 2018],
  ["captain-sonar", "Captain Sonar", 2016],
  ["carcassonne-big-box-6", "Carcassonne Big Box 6", 2017],
  ["cartographers", "Cartographers", 2019],
  ["castles-of-mad-king-ludwig", "Castles of Mad King Ludwig", 2014],
  ["cat-in-the-box", "Cat in the Box: Deluxe Edition", 2022],
  ["catan", "Catan", 1995],
  ["catan-traders-barbarians", "Catan: Traders & Barbarians", 2007],
  ["chronology", "Chronology", 1996],
  ["codenames", "Codenames", 2015],
  ["compile-main-1", "Compile: Main 1", 2024],
  ["cutthroat-caverns", "Cutthroat Caverns", 2007],
  ["dead-of-winter-long-night", "Dead of Winter: The Long Night", 2016],
  ["dominion", "Dominion", 2008],
  ["doomlings", "Doomlings", 2022],
  ["farkle", "Farkle", 1930],
  ["fluxx", "Fluxx", 1997],
  ["goat-lords-2", "Goat Lords 2", 2021],
  ["herd-mentality", "Herd Mentality", 2020],
  ["hive", "Hive", 2001],
  ["horseless-carriage", "Horseless Carriage", 2023],
  ["hunt-a-killer-dead-below-deck", "Hunt A Killer: Dead Below Deck", 2022],
  ["iota", "IOTA", 2012],
  ["iaww", "It's a Wonderful World", 2019],
  ["kabuto-sumo", "Kabuto Sumo", 2021],
  ["mysterium", "Mysterium", 2015],
  ["oregon-trail-card-game", "The Oregon Trail Card Game", 2016],
  ["organattack", "OrganATTACK!", 2016],
  ["pairs", "Pairs", 2014],
  ["pandemic-legacy-s1", "Pandemic Legacy: Season 1", 2015],
  ["pictionary-air", "Pictionary Air", 2019],
  ["raptor", "Raptor", 2015],
  ["the-resistance", "The Resistance", 2009],
  ["sequence", "Sequence", 1982],
  ["telestrations-after-dark", "Telestrations: After Dark", 2015],
  ["ticket-to-ride", "Ticket to Ride", 2004],
  ["tyrants-of-the-underdark", "Tyrants of the Underdark", 2016],
  ["the-village", "The Village", 2022],
  ["villagers", "Villagers", 2019],
  ["welcome-to", "Welcome To...", 2018],
  ["what-do-you-meme", "What Do You Meme?", 2016],
  ["wingspan", "Wingspan", 2019],
  ["wits-and-wagers", "Wits & Wagers", 2005],
];

const bySlug = new Map(DEFS.map((d) => [d.slug, d]));

/** What a game supports: "tracker", "score" (guide + score pad), "guide" or "none". */
export const tier = (def) => (!def ? "none" : def.tracker ? "tracker" : def.score ? "score" : def.guide ? "guide" : "none");
export const TIER_LABEL = { tracker: "tracker", score: "score pad", guide: "guide", none: "not yet" };

export const CATALOG = COLLECTION.map(([slug, name, year]) => ({ slug, name, year, def: bySlug.get(slug) || null })).sort((a, b) =>
  a.name.replace(/^The /, "").localeCompare(b.name.replace(/^The /, "")),
);
export const getDef = (slug) => bySlug.get(slug) || null;
export const getEntry = (slug) => CATALOG.find((g) => g.slug === slug) || null;
export const scoreable = (def) => !!(def && def.score);
