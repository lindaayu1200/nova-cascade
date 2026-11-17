// The in-game field manual. This module is deliberately plain: no DOM lookups, no canvas and no
// game state. helpSections() returns the words, and helpToHtml() turns those words into markup, so
// the same copy can be layered over the canvas, printed to the page or tested without a browser.

/** The manual, in the order the sections should be read. */
export function helpSections() {
  return [
    {
      title: 'Flight School',
      lines: [
        'Press Enter to launch from the title screen and begin the first wave.',
        'Arrows or WASD nudge your ship around the playfield; diagonals are no faster than straight lines.',
        'Move the mouse to point. The ship turns to face your cursor and the guns follow that bearing.',
        'The trigger never needs a finger: while a wave is live the cannons cycle on their own.',
        'Hold your position near the bottom third of the field so incoming rocks have time to reveal their angles.',
        'The ship accelerates and drifts, so braking early is often better than overshooting a gap.',
        'Touching the left or right wall simply stops you; there is no wrapping through to the other side.',
        'The pointer takes over when you move it, and the keyboard takes back over as soon as you press a direction.',
        'There is no jump or dash, so think of the ship as hovering on a very slippery floor.',
        'Keeping the cursor ahead of a rock, rather than on it, leaves room to correct your path.',
      ],
    },
    {
      title: 'The Nova Button',
      lines: [
        'Every ship carries one nova charge, spent with Space or a right-click.',
        'The charge refills over about eight seconds; a thin meter around the ship shows how close it is.',
        'Firing the nova throws a bright ring outward, shredding rocks and drones it touches and staggering a boss.',
        'A nova is both a weapon and a shield. Spend it when the screen fills, not when a single rock looks annoying.',
        'Kills scored during a strong chain make the blast worth far more than its raw damage suggests.',
        'A nova detonates where you are, not where you are looking, so plant yourself before you spend it.',
        'The ring expands for about half a second. Fast rocks can slip through if you fire too early.',
        'If the meter is still dark, a right-click will do nothing; watch the ring rather than guessing.',
        'The blast reaches a good way across the field, but it does not follow a retreating target.',
        'Two well-spaced novas are usually stronger than one frantic one, since the second catches the fragments.',
      ],
    },
    {
      title: 'Between Waves: The Upgrade Bay',
      lines: [
        'Clear a wave and the action stops at a three-card counter. Spend crystals with 1, 2 or 3, or click a card.',
        'Cards show the current level, the next price and what that purchase adds. Press Enter when you are ready.',
        'SHIELD - 30 crystals, then 25 more per level, four levels. Adds 40 to the top of your absorb bar and tops it up.',
        'SPREAD - 40 crystals, then 30 more per level, four levels. Bolts one additional shot onto every volley.',
        'SLOW - 35 crystals, then 30 more per level, three levels. Trims enemy speed by twelve percent a level.',
        'A broad shield buys forgiveness, spread buys area control and slow buys thinking room. Match the purchase to the mistake you keep making.',
        'Prices rise with every level of that card, while the other two keep their own price lists.',
        'A maxed card cannot be bought again; the counter tells you when it is finished.',
        'You keep unspent crystals between waves, so saving for a later tier is a legitimate plan.',
      ],
    },
    {
      title: 'Chains, Crystals and Score',
      lines: [
        'Destroying something starts a chain. Each further kill within about two and a half seconds raises the multiplier.',
        'The counter climbs one step per kill and caps at nine; points from a kill are multiplied by the value showing when it dies.',
        'Let the timer lapse and the chain drops back to one, so keep firing at the smaller fragments rather than waiting.',
        'Kills scatter crystals. Drift close and they are drawn in; collect them before a dozen seconds pass or they fade.',
        'Crystals are currency, not score. Bank them on upgrades instead of hoarding them for a quieter wave.',
        'The timer above the chain is your cue: when it is nearly empty, find one more target instead of coasting.',
        'Collecting crystals does not extend a chain, but the kills that produced them already did.',
        'Bigger rocks and drones are worth more points than the small chips they leave behind.',
      ],
    },
    {
      title: 'Waves and the Cascade',
      lines: [
        'There are fifteen waves. Each one sends rocks a little faster and a little thicker than the last.',
        'Large rocks split into two smaller ones when broken, so one clean shot can become a whole chain.',
        'Hunter drones join from the third wave onward. They steer toward you and must be chased down early.',
        'Every fifth wave arrives with a named boss: VESPER WARDEN, OBSIDIAN MAW, then NOVA CASCADE.',
        'The boss has a deep health bar, a repeating spread of shots and far more score than the ordinary rubble.',
        'Beat the last boss on wave fifteen to win the run. The score and your best are shown on the victory screen.',
        'Boss waves bring only a handful of escort rocks, so save your nova for the larger target.',
        'Between encounters the field briefly clears; use the lull to line up your next approach.',
        'If you lose all lives the run ends immediately, even if the wave was nearly won.',
      ],
    },
    {
      title: 'Reading the HUD',
      lines: [
        'The top left keeps your running score; the figure beside it is the best score of this run.',
        'The top right shows remaining lives as small ship icons, and the wave number below them.',
        'A bar along the lower edge tracks shield. When it empties, the next hit costs a life.',
        'The thin arc around your ship is the nova charge: full means the button is ready.',
        'The multiplier badge and its draining strip sit near the score; that strip is the chain timer.',
        'During a boss wave a long health bar across the top tells you how much of the visitor is left.',
        'Messages in the lower middle of the screen announce wave clears, purchases and incoming bosses.',
      ],
    },
    {
      title: 'Field Notes',
      lines: [
        'A hit eats a chunk of shield before it costs a life; the shield refills a little at each new wave.',
        'After a life is lost the ship blinks and ignores damage for a moment. Use that window to reposition.',
        'Pause with P or Escape. Leaving the tab pauses the game too, so nothing sneaks up on you while away.',
        'Ride the edge of a rock cluster and let the nova finish it, then sweep up the crystals on the way out.',
        'Chasing one crystal across the field usually costs more than it pays. Keep the ship moving toward the next target.',
        'Remember that paused time is safe time: stop and read the field before diving into a dense cluster.',
        'The best runs are usually quiet ones. Small steady adjustments beat dramatic last-second dodges.',
      ],
    },
  ];
}

/** Escape the five characters that can break a text node or an attribute in this markup. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the manual as a small fragment of HTML: one section wrapper per entry, a heading and an
 * unordered list of lines. Callers own any surrounding panel, styling and scroll container.
 */
export function helpToHtml(sections) {
  const source = Array.isArray(sections) ? sections : [];
  const chunks = [];

  for (let i = 0; i < source.length; i += 1) {
    const section = source[i] || {};
    const title = escapeHtml(section.title ?? '');
    const lines = Array.isArray(section.lines) ? section.lines : [];
    const items = [];

    for (let j = 0; j < lines.length; j += 1) {
      items.push(`      <li>${escapeHtml(lines[j])}</li>`);
    }

    chunks.push([
      '    <section class="help-section">',
      `      <h3>${title}</h3>`,
      items.length > 0
        ? `      <ul>\n${items.join('\n')}\n      </ul>`
        : '      <ul></ul>',
      '    </section>',
    ].join('\n'));
  }

  if (chunks.length === 0) return '<div class="help"></div>';

  return [
    '<div class="help">',
    chunks.join('\n'),
    '</div>',
  ].join('\n');
}
