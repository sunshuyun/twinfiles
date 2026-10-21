import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { scanDirectory } from '../src/scan.mjs';
import { renderHtml, renderText } from '../src/report.mjs';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const report = await scanDirectory(path.join(project, 'examples', 'files'));
// Public example reports contain only fixture paths, never machine-specific paths.
report.root = 'examples/files (演示文件夹 / demo folder)';
report.generatedAt = '2026-10-21T00:00:00.000Z (deterministic demo)';
await writeFile(path.join(project, 'examples', 'report.html'), renderHtml(report));
await writeFile(path.join(project, 'examples', 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(renderText(report));
console.log('Open examples/report.html to preview.');
