// Wingspan: guide + score pad tier.
export default {
  slug: "wingspan",
  name: "Wingspan",
  year: 2019,
  players: [1, 5],
  rounds: 4,
  options: [{ id: "oceania", name: "Oceania Expansion", note: "Adds nectar scoring" }],
  optionsLabel: "Expansions",
  score: {
    cats: [
      { k: "birds", label: "Birds", note: "Printed points on your birds", kind: "flat" },
      { k: "bonus", label: "Bonus cards", note: "Points from bonus cards", kind: "flat" },
      { k: "goals", label: "Round goals", note: "Points on the goal board", kind: "flat" },
      { k: "eggs", label: "Eggs", note: "1 point per egg on your birds", kind: "count", each: 1 },
      { k: "food", label: "Cached food", note: "1 point per food on your birds", kind: "count", each: 1 },
      { k: "tucked", label: "Tucked cards", note: "1 point per tucked card", kind: "count", each: 1 },
      { g: "oceania", k: "nectar", label: "Nectar", note: "Most nectar per habitat: 5, second: 2", kind: "flat" },
    ],
    tiebreakNote: "Ties break on the most unused food tokens.",
  },
  guide: {
    start: [
      {
        h: "Set up",
        items: [
          "Each player takes a player mat and 8 action cubes in their color.",
          "Deal each player 5 bird cards, 2 bonus cards and 5 food tokens, one of each type.",
          "Keep up to 5 birds. For each bird you keep, discard 1 food token. Keep 1 of your 2 bonus cards.",
          "Place 1 random goal tile on each round space of the goal board. Put 3 birds face up in the bird tray and roll the dice into the birdfeeder.",
        ],
      },
      {
        h: "How you win",
        items: ["The game lasts 4 rounds. The most points wins.", "Ties break on the most unused food tokens."],
      },
    ],
    order: {
      rounds: 4,
      roundNote: (round) => `${9 - round} turns each`,
      steps: (round) => [
        {
          h: "Take turns",
          p: [
            `Starting with the first player and going clockwise, each turn you place 1 action cube and take 1 action. In round ${round} everyone has ${9 - round} turns.`,
            "Your choices are on the next 4 steps: play a bird, or use one of the 3 habitat rows.",
          ],
        },
        {
          h: "Play a bird",
          p: [
            "Pay the bird's food cost and place it in the leftmost empty space of a habitat it can live in.",
            "Pay the egg cost shown above that column. When played, white powers trigger once.",
          ],
        },
        {
          h: "Gain food",
          short: "Forest: food",
          p: [
            "Place your cube in the forest row, in the leftmost open space, and take that many dice from the birdfeeder.",
            "Then activate the brown powers of your forest birds, from right to left.",
          ],
        },
        {
          h: "Lay eggs",
          short: "Grassland: eggs",
          p: [
            "Place your cube in the grassland row and lay that many eggs on your birds, up to each bird's egg limit.",
            "Then activate the brown powers of your grassland birds, from right to left.",
          ],
        },
        {
          h: "Draw cards",
          short: "Wetland: cards",
          p: [
            "Place your cube in the wetland row and draw that many birds, from the tray or the deck.",
            "Then activate the brown powers of your wetland birds, from right to left. Refill the tray at the end of the turn.",
          ],
        },
        {
          h: round < 4 ? "End of round" : "End of game",
          p: round < 4
            ? [
                "Score the round goal: each player puts 1 action cube on the goal board, so you have 1 fewer cube next round.",
                "Clear the bird tray and refill it, and pass the first player token clockwise.",
              ]
            : ["Score the last round goal, then score each player on the Score page and save the result in Setup."],
        },
      ],
    },
  },
};
