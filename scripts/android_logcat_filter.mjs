#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const APP_ERROR_PATTERN = /FATAL EXCEPTION|AndroidRuntime|UnsatisfiedLinkError|ClassNotFoundException|NoClassDefFoundError|NullPointerException|SecurityException|\bANR\b|Mixed Content|Capacitor\/Console|TypeError|ReferenceError|\bERR_/;

function linePid(line) {
  const match = String(line).match(/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+\d+\s+[VDIWEFAS]\s+/);
  return match?.[1] || null;
}

export function filterAppLogcat(rawLogcat, { packageName, pids = [] }) {
  if (!packageName) throw new Error('packageName is required');
  const pidSet = new Set(
    (Array.isArray(pids) ? pids : String(pids).split(/[\s,]+/))
      .map(value => String(value).trim())
      .filter(Boolean)
  );

  const lines = String(rawLogcat || '').split(/\r?\n/);
  const filtered = lines.filter(line => {
    const pid = linePid(line);
    return (pid && pidSet.has(pid)) || line.includes(packageName);
  });
  return filtered.length > 0 ? `${filtered.join('\n')}\n` : '';
}

export function findAppLogcatErrors(filteredLogcat) {
  return String(filteredLogcat || '')
    .split(/\r?\n/)
    .filter(line => APP_ERROR_PATTERN.test(line))
    .filter(line => !/HCI_ERR_PAGE_TIMEOUT|ERR_PAGE_TIMEOUT/.test(line));
}

function parseCliArgs(argv) {
  const options = { packageName: '', pids: [], input: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--package') options.packageName = argv[++index] || '';
    else if (arg === '--pids') options.pids.push(...String(argv[++index] || '').split(/[\s,]+/));
    else if (arg === '--pid') options.pids.push(argv[++index] || '');
    else if (arg === '--input') options.input = argv[++index] || null;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const raw = options.input ? fs.readFileSync(options.input, 'utf8') : fs.readFileSync(0, 'utf8');
  process.stdout.write(filterAppLogcat(raw, options));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli();
}
