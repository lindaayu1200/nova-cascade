// Packaging entry point for Nova Cascade.
// It prepares an output folder containing the browser game and any available
// preview images, then generates dossier.json via the bundled helper in vendor/.
// The game is a self-contained arcade shooter: auto-fire at incoming rocks,
// dodge the falling fragments, collect crystals to buy perks, and beat the
// wave-15 boss. Run `node serve.ts` to try it at http://localhost:8080.
// Output lands in /output unless MAKEFUN_OUTPUT_DIR overrides it, e.g.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Resolve locations relative to this script rather than the caller's cwd.
const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Game assets are mandatory; the preview folder is only staged if it exists.
mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });

const shotDir = join(outDir, 'screenshots');
mkdirSync(shotDir, { recursive: true });
const sourceShots = join(here, 'screenshots');
if (existsSync(sourceShots)) cpSync(sourceShots, shotDir, { recursive: true });

// These thresholds come from reference/gate.json. text_max_bytes caps the
// generated description; the remaining fields gate acceptance: at most four
// captures of 256 KiB each, plus 993 game files under 48 MiB whose relative
// paths stay within 1000 bytes. Screenshots and the dossier count against the
// same 1000-entry budget as game/.
const constraints = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossier = buildDossier(outDir, constraints);
writeFileSync(join(outDir, 'dossier.json'), dossier);
