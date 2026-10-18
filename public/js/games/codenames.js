// Codenames: guide only tier.
export default {
  slug: "codenames",
  name: "Codenames",
  year: 2015,
  players: [2, 8],
  guide: {
    start: [
      {
        h: "Set up",
        items: [
          "Split into two teams, red and blue. Each team picks a spymaster; the spymasters sit together on one side of the table.",
          "Lay out 25 code name cards in a 5 by 5 grid.",
          "A spymaster draws a key card and puts it in the stand where only spymasters can see it.",
          "The lights on the key card's edge show which team starts. That team has 9 agents to find; the other has 8.",
        ],
      },
      {
        h: "How you win",
        items: [
          "The first team to contact all of its agents wins.",
          "A team that touches the assassin loses at once.",
        ],
      },
    ],
    order: {
      rounds: null,
      steps: () => [
        {
          h: "Give a clue",
          p: [
            "The spymaster says one word and one number, such as tree, 2. The word links to their team's code names; the number says how many.",
            "No gestures, and the word cannot be one of the code names on the table.",
          ],
        },
        {
          h: "Guess",
          p: ["The team discusses and touches one card. The spymaster covers it with the matching agent, bystander or assassin card."],
        },
        {
          h: "Keep going or stop",
          short: "Keep going",
          p: [
            "Your own agent: you may guess again, up to the clue number plus one.",
            "A bystander or the other team's agent ends your turn. The assassin ends the game: your team loses.",
          ],
        },
        { h: "Next team", p: ["The other team's spymaster gives a clue. Play continues until one team has found all its agents."] },
      ],
    },
  },
};
