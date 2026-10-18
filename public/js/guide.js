// Getting started and play order. The text lives here as data so it is easy to
// correct against the rulebook; the step-through remembers its place per device.

import { local } from "./store.js";

const START = [
  {
    h: "Before the first round",
    items: [
      "Each player takes an Empire card and places it in front of them. Everyone uses the same side unless you agree to play the asymmetric side.",
      "Put the resource cubes, Krystallium, Financiers and Generals where everyone can reach them.",
      "Shuffle the development cards into one deck.",
    ],
  },
  {
    h: "In this app",
    items: [
      "Setup: add each player and turn on the expansions you are using. The game is saved to the server as you go.",
      "Tracker: tap a player, then Set empire to enter what their Empire produces and any VP it scores.",
      "During production, the Tracker shows who has supremacy in each resource. Tap Give to award the token.",
      "At the end, open Score, tap Fill from tracker, check each tile, then save the result in Setup.",
    ],
  },
  {
    h: "How you win",
    items: [
      "The game lasts 4 rounds. The most VP wins.",
      "Ties break on the most cards built, then the most Financiers and Generals.",
    ],
  },
];

const passDir = (round) => (round % 2 ? "left" : "right");
const RES = [
  ["Material", "--res-material"],
  ["Energy", "--res-energy"],
  ["Science", "--res-science"],
  ["Gold", "--res-gold"],
  ["Exploration", "--res-explore"],
];

function steps(round) {
  return [
    {
      h: "Draft",
      p: [
        `Deal 7 cards to each player. Keep 1 card and pass the rest to the ${passDir(round)}.`,
        `Repeat until everyone has drafted 7 cards. Round ${round} passes ${passDir(round)}; the direction switches each round.`,
      ],
    },
    {
      h: "Plan",
      p: [
        "For each drafted card, choose one: put it in your construction area, or recycle it.",
        "Recycling discards the card for its recycling bonus: 1 cube you place right away, on a card under construction or on your Krystallium area.",
      ],
    },
    ...RES.map(([name, c]) => ({
      h: `Produce ${name.toLowerCase()}`,
      short: name,
      c,
      p: [
        `Everyone produces ${name.toLowerCase()} at once: your Empire plus every card you have built.`,
        "Place each cube on a card under construction. A card whose cost is complete is built now and produces from the next resource on.",
        "Cubes you cannot or do not want to place go on your Krystallium area. Every 5 there become 1 Krystallium, which stands in for any one resource cube.",
        `Supremacy: the player who produces the most ${name.toLowerCase()}, with no tie, takes the token shown for it. Award it in the Tracker.`,
      ],
    })),
    {
      h: round < 4 ? "End of round" : "End of game",
      p:
        round < 4
          ? [`Cards left under construction stay there with their cubes. Move the Tracker to round ${round + 1}.`]
          : ["Score each player on the Score page, then save the result in Setup."],
    },
  ];
}

const chip = (c) => (c ? `<i class="chip" style="--c:var(${c})"></i>` : "");

export function renderGuide(sub, game) {
  const tabs = `<nav class="subnav" aria-label="Guide">
    <a href="/guide"${sub !== "order" ? ' aria-current="page"' : ""}>Getting started</a>
    <a href="/guide/order"${sub === "order" ? ' aria-current="page"' : ""}>Play order</a></nav>`;
  if (sub !== "order") {
    return `<div class="guide">${tabs}${START.map(
      (s, i) => `<section><h2 class="h3"><span class="bw-secnum">${String(i + 1).padStart(2, "0")}</span>${s.h}</h2>
        <ul class="glist">${s.items.map((t) => `<li>${t}</li>`).join("")}</ul></section>`,
    ).join("")}</div>`;
  }
  const pos = local.get("iaww:guide") || { round: game ? game.round : 1, step: 0 };
  const list = steps(pos.round);
  pos.step = Math.min(pos.step, list.length - 1);
  const s = list[pos.step];
  const rounds = [1, 2, 3, 4]
    .map((n) => `<button type="button" class="bw-btn bw-btn--secondary bw-btn--sm" data-act="guideRound" data-n="${n}" aria-pressed="${pos.round === n}" aria-label="Round ${n}">${n}</button>`)
    .join("");
  const ol = list
    .map(
      (x, i) => `<li><button type="button" data-act="guideStep" data-n="${i}" aria-current="${i === pos.step ? "step" : "false"}">
      <span class="bw-mono n">${String(i + 1).padStart(2, "0")}</span>${chip(x.c)}<span>${x.short || x.h}</span></button></li>`,
    )
    .join("");
  return `<div class="guide order">${tabs}
    <div class="line"><span class="lbl">Round</span><div class="seg">${rounds}</div><span class="bw-comment small">passes ${passDir(pos.round)}</span></div>
    <ol class="steps">${ol}</ol>
    <section class="bw-panel step" aria-live="polite"><h3>${chip(s.c)}${s.h}</h3>${s.p.map((t) => `<p>${t}</p>`).join("")}</section>
    <div class="acts">
      <button type="button" class="bw-btn bw-btn--secondary" data-act="guidePrev"${pos.step === 0 && pos.round === 1 ? " disabled" : ""}>Previous</button>
      <button type="button" class="bw-btn bw-btn--primary" data-act="guideNext"${pos.step === list.length - 1 && pos.round === 4 ? " disabled" : ""}>Next</button>
    </div></div>`;
}

export function guideAct(el, rerender) {
  const pos = local.get("iaww:guide") || { round: 1, step: 0 };
  const last = steps(pos.round).length - 1;
  const a = el.dataset.act;
  if (a === "guideRound") Object.assign(pos, { round: +el.dataset.n, step: 0 });
  else if (a === "guideStep") pos.step = +el.dataset.n;
  else if (a === "guideNext") {
    if (pos.step < last) pos.step++;
    else if (pos.round < 4) Object.assign(pos, { round: pos.round + 1, step: 0 });
  } else if (a === "guidePrev") {
    if (pos.step > 0) pos.step--;
    else if (pos.round > 1) Object.assign(pos, { round: pos.round - 1, step: last });
  } else return;
  local.set("iaww:guide", pos);
  rerender();
}
