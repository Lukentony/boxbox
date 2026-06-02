import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(DIR, ".env");
const PW_BROWSERS = resolve(process.env.HOME || "/tmp", ".cache/ms-playwright");

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#\s=]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["\x27]|["\x27]$/g, "");
  }
  return env;
}
function saveEnv(env) {
  const lines = [];
  for (const [k, v] of Object.entries(env)) lines.push(`${k}=${v}`);
  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const env = loadEnv();
  const email = env.EMAIL || process.env.BOXBOX_EMAIL;
  const password = env.PASSWORD || process.env.BOXBOX_PASSWORD;
  const cdpUrl = process.env.CDP_URL || "http://localhost:9222";

  if (!email || !password) {
    console.error("EMAIL e PASSWORD richiesti in .env");
    process.exit(1);
  }

  console.log("Connessione a Chrome via CDP...");
  const browser = await chromium.connectOverCDP(cdpUrl);
  const defaultCtx = browser.contexts()[0];
  const page = defaultCtx.pages()[0] || await defaultCtx.newPage();

  console.log("Navigo su fantasy.motogp.com...");
  await page.goto("https://fantasy.motogp.com", { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  const currentUrl = page.url();
  if (currentUrl.includes("login") || currentUrl.includes("auth")) {
    console.log("Login SSO richiesto, autenticazione...");
    const emailInput = page.locator("input[type=email], input[name=email], input[name=username]").first();
    await emailInput.fill(email);
    const passInput = page.locator("input[type=password], input[name*=pass]").first();
    await passInput.fill(password);
    const submitBtn = page.locator("button[type=submit], input[type=submit]").first();
    await submitBtn.click();
    await page.waitForURL("**/fantasy/**", { timeout: 20000 });
    await sleep(3000);
  } else {
    console.log("Già autenticato.");
  }

  console.log("Estraggo cookie...");
  const cookies = await defaultCtx.cookies("https://fantasy.motogp.com");
  const cookiestr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  console.log(`  ${cookies.length} cookie estratti`);

  await browser.close();
  env.COOKIE_FULL = cookiestr;
  saveEnv(env);
  console.log("DONE — .env aggiornato con COOKIE_FULL");
}

main().catch((e) => {
  console.error(`ERR: ${e.message}`);
  process.exit(1);
});
