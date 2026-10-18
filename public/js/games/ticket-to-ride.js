// Ticket to Ride (the original USA map): guide + score pad tier.
export default {
  slug: "ticket-to-ride",
  name: "Ticket to Ride",
  year: 2004,
  players: [2, 5],
  score: {
    cats: [
      { k: "r1", label: "1-train routes", note: "1 point each", kind: "count", each: 1 },
      { k: "r2", label: "2-train routes", note: "2 points each", kind: "count", each: 2 },
      { k: "r3", label: "3-train routes", note: "4 points each", kind: "count", each: 4 },
      { k: "r4", label: "4-train routes", note: "7 points each", kind: "count", each: 7 },
      { k: "r5", label: "5-train routes", note: "10 points each", kind: "count", each: 10 },
      { k: "r6", label: "6-train routes", note: "15 points each", kind: "count", each: 15 },
      { k: "done", label: "Tickets done", note: "Points on completed tickets", kind: "flat" },
      { k: "failed", label: "Tickets failed", note: "Points on tickets not completed", kind: "minus" },
      { k: "longest", label: "Longest route", note: "10 points for the longest continuous route", kind: "count", each: 10 },
    ],
    tiebreakNote: "Ties break on the most completed tickets, then the longest route bonus.",
  },
  guide: {
    start: [
      {
        h: "Set up",
        items: [
          "Each player takes 45 trains in one color and the matching scoring marker.",
          "Deal each player 4 train cards. Turn 5 train cards face up next to the deck.",
          "Deal each player 3 destination tickets. Keep at least 2; return the rest to the bottom of the ticket deck.",
        ],
      },
      {
        h: "How you win",
        items: [
          "Most points wins. You score routes as you claim them, then add tickets and the longest route bonus at the end.",
          "Ties break on the most completed tickets, then the longest route bonus.",
        ],
      },
    ],
    order: {
      rounds: null,
      steps: () => [
        { h: "Your turn", p: ["Take exactly one of the three actions that follow, then play passes to the left."] },
        {
          h: "Draw train cards",
          short: "Draw cards",
          p: [
            "Take 2 cards, from the face-up row or the deck. Refill the row after each pick.",
            "A face-up locomotive counts as both of your picks. If 3 locomotives show face up, discard the row and deal 5 new cards.",
          ],
        },
        {
          h: "Claim a route",
          short: "Claim route",
          p: [
            "Play cards of one color equal to the route's length and place your trains on it. Gray routes take any one color; locomotives are wild.",
            "Score the route on the track straight away. In 2 and 3 player games only one track of a double route can be used.",
          ],
        },
        {
          h: "Draw tickets",
          p: ["Draw 3 destination tickets and keep at least 1."],
        },
        {
          h: "End of game",
          p: [
            "When a player ends a turn with 2 or fewer trains, everyone, including that player, gets one final turn.",
            "Then add completed tickets, subtract unfinished ones, and give 10 points for the longest continuous route. Use the Score page.",
          ],
        },
      ],
    },
  },
};
