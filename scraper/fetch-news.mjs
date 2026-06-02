import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const RSS_URL = 'https://it.motorsport.com/rss/motogp/news/';
const MAX_ITEMS = 15;

async function fetchRSS() {
  const res = await fetch(RSS_URL, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'BoxBox/2.0 (MotoGP Dashboard)',
      'Accept-Encoding': 'gzip, deflate',
    },
  });

  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return res.text();
}

function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = match[1];

    const title = extract(block, 'title');
    const link = extract(block, 'link');
    const description = extract(block, 'description');
    const pubDate = extract(block, 'pubDate');
    const category = extractAll(block, 'category');

    const imgMatch = block.match(/<enclosure[^>]+url="([^"]+)"/);
    const image = imgMatch ? imgMatch[1] : null;

    const cleanDesc = description
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
      .slice(0, 280);

    items.push({
      title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
      link: link.trim(),
      description: cleanDesc,
      image,
      pubDate,
      categories: category,
    });
  }

  return items;
}

function extract(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
}

function extractAll(block, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(block)) !== null) results.push(m[1].trim());
  return results;
}

async function main() {
  console.log('Fetch news MotoGP...');
  const xml = await fetchRSS();
  const items = parseItems(xml);
  console.log(`${items.length} articoli`);

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'motorsport.com IT',
    items,
  };

  writeFileSync(resolve(DIR, 'news.json'), JSON.stringify(output, null, 2));
  console.log('DONE — news.json salvato');
}

main().catch(e => {
  console.error(`Errore: ${e.message}`);
  process.exit(1);
});
