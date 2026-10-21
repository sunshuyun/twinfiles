#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { scanDirectory } from '../src/scan.mjs';
import { renderHtml, renderText } from '../src/report.mjs';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const help = `TwinFiles 0.1.0 — offline, read-only duplicate file finder

Usage: node bin/twinfiles.mjs <folder> [options]
       node bin/twinfiles.mjs --wizard

  --format text|html|json   Report format (default: text)
  --out <file>             Write a NEW report; never overwrite an existing file
  --exclude <entry-name>   Skip this file/directory name at every level; repeatable
  --min-bytes <number>     Minimum file size in bytes (default: 1; 0 includes empty)
  --wizard                Interactive mode (Chinese), writes HTML and JSON reports
  --version               Show version
  --help                  Show this help
  --                      End options, e.g. -- -folder

Default exclusions: .git, node_modules, .twinfiles-reports
No deletion, no uploads, no third-party packages. Node.js 22+ required.
Exit codes: 0 complete, 1 invalid input/report error, 2 incomplete scan, 130 cancelled.
`;

function parse(args) {
  const options = { exclude: [], minBytes: 1, format: 'text' };
  let positional = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!positional && arg === '--') { positional = true; continue; }
    if (!positional && arg.startsWith('--')) {
      if (!['--format', '--out', '--exclude', '--min-bytes'].includes(arg)) {
        throw new Error(`Unknown option: ${arg}`);
      }
      const value = args[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value: ${arg}`);
      if (arg === '--exclude') options.exclude.push(value);
      if (arg === '--out') options.out = value;
      if (arg === '--format') options.format = value;
      if (arg === '--min-bytes') {
        if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
          throw new Error('--min-bytes must be a non-negative safe integer');
        }
        options.minBytes = Number(value);
      }
    } else if (!options.folder) options.folder = arg;
    else throw new Error('Provide exactly one folder; put paths containing spaces in quotes');
  }
  if (!options.folder) throw new Error('Provide a folder to scan. Use --help or --wizard');
  if (!['text', 'html', 'json'].includes(options.format)) throw new Error('Format must be text, html, or json');
  return options;
}

async function wizard(signal) {
  const terminal = createInterface({ input: stdin, output: stdout });
  let input;
  try {
    stdout.write('\nTwinFiles · 离线重复文件检查\n扫描文件内容，生成报告。\n\n');
    input = (await terminal.question('粘贴文件夹路径（直接回车先体验示例）：', { signal })).trim();
  } finally { terminal.close(); }
  if (input.startsWith('"') && input.endsWith('"')) input = input.slice(1, -1);
  const folder = input || path.join(project, 'examples', 'files');
  stdout.write('\n正在检查，请稍候。Ctrl+C 可取消。\n');
  const report = await scanDirectory(folder, { signal });
  const reportDirectory = path.join(project, '.twinfiles-reports');
  await mkdir(reportDirectory, { recursive: true });
  const base = path.join(reportDirectory, `report-${Date.now()}-${randomUUID().slice(0, 8)}`);
  await writeFile(`${base}.html`, renderHtml(report), { flag: 'wx' });
  await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  stdout.write(`\n${renderText(report)}\nHTML 报告：${base}.html\nJSON 报告：${base}.json\n`);
  if (process.platform === 'win32') {
    const viewer = spawn('explorer.exe', [`${base}.html`], { detached: true, stdio: 'ignore', windowsHide: true });
    viewer.on('error', () => stdout.write('请双击上面的 HTML 报告查看。\n'));
    viewer.unref();
  }
  return report.errors.length ? 2 : 0;
}

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
try {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) stdout.write(help);
  else if (args.length === 1 && args[0] === '--version') stdout.write('0.1.0\n');
  else if (args.length === 1 && args[0] === '--wizard') process.exitCode = await wizard(controller.signal);
  else {
    const options = parse(args);
    const report = await scanDirectory(options.folder, { ...options, signal: controller.signal });
    const content = options.format === 'html' ? renderHtml(report)
      : options.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : renderText(report);
    if (options.out) {
      await writeFile(path.resolve(options.out), content, { flag: 'wx' });
      process.stderr.write(`Report saved: ${path.resolve(options.out)}\n`);
    } else stdout.write(content);
    process.exitCode = report.errors.length ? 2 : 0;
  }
} catch (error) {
  if (controller.signal.aborted) {
    process.stderr.write('Scan cancelled.\n'); process.exitCode = 130;
  } else {
    process.stderr.write(`TwinFiles: ${error.message}\n`); process.exitCode = 1;
  }
}
