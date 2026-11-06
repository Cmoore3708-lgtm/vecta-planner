import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const cooldown = 30 * 60 * 1000;

// The manager launches relay.mjs directly. Read the Windows user's encrypted
// credential on demand so neither Edge nor other workers inherit a password.
export async function windowsLogin() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return null;
  const folder = path.join(process.env.LOCALAPPDATA, 'VectaHaynes');
  const file = path.join(folder, 'supplier-login.xml');
  const marker = path.join(folder, 'last-sign-in.json');
  const { mtimeMs } = await stat(file);
  let previous;
  try { previous = JSON.parse(await readFile(marker, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous?.version === mtimeMs && Date.now() - previous.at < cooldown) return null;

  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    "$c = Import-Clixml -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaHaynes\\supplier-login.xml')",
    '@{username=$c.UserName; password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress'
  ].join('; ');
  const { stdout } = await run(executable, ['-NoProfile', '-NonInteractive', '-Command', command],
    { timeout: 4000, windowsHide: true, maxBuffer: 16384 });
  const credentials = JSON.parse(stdout);
  if (!credentials.username || !credentials.password) return null;
  // Survives supervisor restarts. The marker contains only timestamps.
  await writeFile(marker, JSON.stringify({ version: mtimeMs, at: Date.now() }));
  return { credentials, confirmed: () => rm(marker, { force: true }) };
}
