#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const command = process.argv[2] ?? 'start';
if (command === 'init') {
  const destination = resolve('.env');
  if (existsSync(destination)) {
    console.log('.env already exists; leaving it unchanged.');
  } else {
    copyFileSync(new URL('../../../.env.example', import.meta.url), destination);
    console.log('Created .env. Set AEGISFLOW_API_KEY if you want the proxy to inject an upstream key.');
  }
} else if (command === 'doctor') {
  const endpoint = process.env.AEGISFLOW_URL ?? 'http://127.0.0.1:4318';
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/health`);
    console.log(response.ok ? `AegisFlow is healthy at ${endpoint}` : `Health check returned HTTP ${response.status}`);
    if (!response.ok) process.exitCode = 1;
  } catch {
    console.error(`Cannot reach ${endpoint}. Start the proxy with: npx aegisflow`);
    process.exitCode = 1;
  }
} else {
  console.log('Starting AegisFlow proxy…');
  const { spawn } = await import('node:child_process');
  const child = spawn('npm', ['run', 'start', '-w', '@aegisflow/proxy'], { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
