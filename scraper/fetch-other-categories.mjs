import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const DELAY_MS = 1500;

const CATEGORIES = [
  { id: 'moto2', page: '2026_Moto2_World_Championship', section: 10, name: 'Moto2' },
  { id: 'moto3', page: '2026_Moto3_World_Championship', section: 9,  name: 'Moto3' },
  { id: 'wsbk', page: '2026_Superbike_World_Championship', section: 6,  name: 'WorldSBK' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWikiSection(page, section) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&format=json&prop=text&section=${section}&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BoxBox/2.0 (MotoGP Dashboard)' }
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return res.json();
}

function strip(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[\u2020\u2021*]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRidersTable(html) {
  /* Each section HTML from Wikipedia looks like:
     <div ...>
       <table><tbody><tr><td>
         <table class="wikitable"><tbody>
           <tr><th>Pos.</th><th>Rider</th>...</tr>
           <tr><th>1</th><td>Name</td><td>...</td></tr>
         </tbody></table>
       </td></tr></tbody></table>
     </div>
     The outer table contains one <td> with the inner wikitable.
     We need to find the inner wikitable that has Rider standings. */

  // Find all wikitable-class tables
  const tableMatches = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/gi)];

  for (const [fullTable] of tableMatches) {
    // Get rows from this table (handle both direct <tr> and <tbody><tr>)
    const rows = [...fullTable.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
    if (rows.length < 5) continue; // skip small tables (points legend etc.)

    // Check header has Pos and Rider
    const headerText = strip(rows[0][0]);
    if (!/\bpos\b/i.test(headerText)) continue;

    const riders = [];

    for (let r = 1; r < rows.length; r++) {
      const rowHtml = rows[r][0];
      // Extract all cells: <th> or <td>, multiline
      const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)];

      if (cells.length < 3) continue;

      const pos = strip(cells[0][1]);
      const rider = strip(cells[1][1]);
      const bike = cells[2] ? strip(cells[2][1]) : '';
      const team = cells[3] ? strip(cells[3][1]) : '';
      const totalPts = parseFloat(strip(cells[cells.length - 1][1])) || 0;
      const posNum = parseInt(pos);

      if (!rider || rider.length < 2 || isNaN(posNum)) continue;
      if (posNum < 1) continue; // skip non-numeric header rows

      riders.push({
        pos: posNum,
        rider: rider.replace(/\s*\(.*?\)\s*/g, '').trim(),
        bike,
        team,
        totalPoints: totalPts,
      });
    }

    if (riders.length > 3) return riders;
  }

  return [];
}

async function main() {
  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'Wikipedia',
    categories: {},
  };

  for (const cat of CATEGORIES) {
    console.log(`Fetch ${cat.name} (${cat.page} section ${cat.section})...`);
    try {
      const data = await fetchWikiSection(cat.page, cat.section);
      if (!data.parse?.text?.['*']) {
        console.log(`  SKIP — no section data`);
        output.categories[cat.id] = { error: 'no_section', riders: [] };
        continue;
      }
      const riders = parseRidersTable(data.parse.text['*']);
      console.log(`  ${riders.length} riders extracted`);
      /* Add top-3 highlight */
      riders.forEach(r => {
        r.medal = r.pos === 1 ? 'gold' : r.pos === 2 ? 'silver' : r.pos === 3 ? 'bronze' : null;
      });
      output.categories[cat.id] = { riders };
    } catch (e) {
      console.log(`  ERR — ${e.message}`);
      output.categories[cat.id] = { error: e.message, riders: [] };
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(
    resolve(DIR, 'other-categories.json'),
    JSON.stringify(output, null, 2)
  );
  console.log('DONE — other-categories.json saved');
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
