/**
 * Pushes every value in .env.local up to Vercel so secrets are typed once.
 * Usage: pnpm setup:env [--env production|preview|development]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP = new Set(['VERCEL_TOKEN', 'WORKER_URL_LOCAL']);

const envArg = process.argv.indexOf('--env');
const target = envArg > -1 ? process.argv[envArg + 1] : 'production';

let raw: string;
try {
  raw = readFileSync('.env.local', 'utf8');
} catch {
  console.error('No .env.local found. Copy .env.example to .env.local and fill it in first.');
  process.exit(1);
}

const vars = raw
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const eq = line.indexOf('=');
    return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')];
  })
  .filter(([key, value]) => key && value && !SKIP.has(key));

console.log(`Pushing ${vars.length} variables to Vercel (${target})…\n`);

for (const [key, value] of vars) {
  try {
    execFileSync('vercel', ['env', 'rm', key!, target!, '--yes'], { stdio: 'ignore' });
  } catch {
    // not present yet, which is the normal case on first run
  }
  try {
    execFileSync('vercel', ['env', 'add', key!, target!], { input: `${value}\n`, stdio: ['pipe', 'ignore', 'pipe'] });
    console.log(`  ✓ ${key}`);
  } catch (error) {
    console.error(`  ✗ ${key} — ${error instanceof Error ? error.message : 'failed'}`);
  }
}

console.log('\nDone. Run `vercel --prod` to deploy with the new values.');
