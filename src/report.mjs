export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// Quote names to keep control characters in unusual filenames out of terminals.
const quote = value => JSON.stringify(value);

export function renderText(report) {
  const lines = [
    'TwinFiles — duplicate file report', `Folder: ${quote(report.root)}`,
    `Files: ${report.stats.discoveredFiles} | Hashed: ${report.stats.hashedFiles}`,
    `Groups: ${report.summary.duplicateGroups} | Extra copies: ${report.summary.extraCopies}`,
    `Redundant content: ${formatBytes(report.summary.redundantBytes)} (not guaranteed disk savings)`,
    '',
  ];
  for (const [index, group] of report.groups.entries()) {
    lines.push(`[${index + 1}] ${formatBytes(group.bytes)} each; SHA-256 ${group.sha256}`);
    lines.push(...group.files.map(file => `  ${quote(file)}`), '');
  }
  if (!report.groups.length) lines.push('No duplicate file groups found.');
  if (report.errors.length) {
    lines.push('Incomplete scan — skipped entries:');
    lines.push(...report.errors.map(error => `  ${quote(error.path)}: ${error.code}`));
  }
  lines.push('Files were read only. Verify files and keep backups before manual cleanup.');
  return lines.join('\n') + '\n';
}

export function renderHtml(report) {
  const esc = escapeHtml;
  const cards = report.groups.map((group, index) => `
    <section class="group"><div class="group-head"><h2><span class="index">${String(index + 1).padStart(2, '0')}</span> ${group.files.length} 个相同文件</h2><span class="pill">多余副本 ${formatBytes(group.redundantBytes)}</span></div>
    <p class="meta">每个 ${formatBytes(group.bytes)} · SHA-256 <code>${esc(group.sha256)}</code></p>
    <ul>${group.files.map(file => `<li><span aria-hidden="true">↳</span><code>${esc(file)}</code></li>`).join('')}</ul></section>`).join('');
  const warnings = report.errors.length ? `<section class="notice warning"><h2>部分文件未能检查 · ${report.errors.length} 项</h2><p>下面这些项目未计入完整比较，报告可能遗漏重复文件。</p><ul>${report.errors.map(error => `<li><code>${esc(error.path)}</code> · ${esc(error.code)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="light"><title>TwinFiles · 重复文件报告</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f5ef;color:#1d3834;font:16px/1.65 system-ui,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1060px;margin:auto;padding:48px 32px 36px}.brand{display:flex;align-items:center;gap:11px;font-weight:750;letter-spacing:-.6px;font-size:24px}.logo{display:inline-grid;place-items:center;background:#254e45;color:#fff;width:40px;height:40px;border-radius:12px;font-size:20px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px}.tag{font-size:12px;letter-spacing:1.4px;color:#667c70}header{padding:48px 0 28px}header p{color:#5c7068;margin:0}h1{font-size:clamp(30px,5vw,49px);line-height:1.25;letter-spacing:-1.5px;margin:12px 0 16px}.eyebrow{font-size:12px;letter-spacing:2px;color:#678072;font-weight:700}.path{font-size:13px;overflow-wrap:anywhere;margin-top:20px;color:#697b74}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:8px 0 30px}.stat{background:#fff;border:1px solid #e2e5da;border-radius:18px;padding:22px 24px}.stat.highlight{background:#254e45;border-color:#254e45;color:#fff}.stat small{font-size:13px;opacity:.75}.number{font-size:36px;line-height:1.4;font-weight:700;letter-spacing:-1px}.section-label{font-size:13px;font-weight:700;margin-bottom:14px}.group{background:#fff;border:1px solid #e2e5da;border-radius:18px;padding:24px;margin-bottom:16px}.group-head{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:17px;font-weight:650;margin:0}.index{display:inline-block;color:#7b9084;font-size:13px;margin-right:8px}.pill{font-size:12px;background:#f1f1e5;border-radius:20px;padding:5px 12px;white-space:nowrap}.meta{font-size:11px;color:#748277;margin:12px 0 18px;overflow-wrap:anywhere}.meta code{font-size:10px}code{font-family:ui-monospace,Consolas,"Microsoft YaHei",monospace}ul{list-style:none;padding:0;margin:0}.group li{display:flex;gap:14px;padding:10px 12px;background:#f7f8f3;margin-top:6px;border-radius:8px;font-size:13px;overflow-wrap:anywhere;word-break:break-word}.group li span{color:#a1ad9f}.group li code{min-width:0;white-space:pre-wrap}.notice{padding:22px 24px;border-radius:15px;background:#eeeee0;color:#62705c;font-size:13px;margin-top:24px}.notice p{margin:8px 0 0}.warning{background:#fff1dc;color:#7c572e}.warning ul{margin-top:12px;overflow-wrap:anywhere}.empty{padding:52px 20px;text-align:center;background:#fff;border:1px solid #e2e5da;border-radius:18px}.empty h2{font-size:22px}.empty p{color:#6e8074;font-size:14px}footer{display:flex;justify-content:space-between;gap:20px;margin-top:28px;font-size:11px;color:#899487;overflow-wrap:anywhere}@media(max-width:640px){main{padding:28px 18px}.tag{display:none}header{padding-top:32px}.stats{gap:8px}.stat{padding:14px 12px;border-radius:12px}.number{font-size:25px}.stat small{font-size:11px}.group{padding:18px}.group-head{align-items:flex-start;flex-direction:column}.meta{font-size:10px}footer{flex-direction:column;gap:5px}}
</style></head><body><main>
<div class="top"><div class="brand"><span class="logo" aria-hidden="true">≋</span> TwinFiles</div><div class="tag">OFFLINE · READ ONLY · OPEN SOURCE</div></div>
<header><div class="eyebrow">DUPLICATE FILE REPORT / 重复文件报告</div><h1>${report.summary.duplicateGroups ? '相同的文件，清楚地放在一起。' : '检查完成，文件一目了然。'}</h1><p>按内容比较，帮你了解文件夹里的重复副本。</p><div class="path">扫描目录：${esc(report.root)}</div></header>
<div class="stats"><div class="stat"><small>发现文件 / FILES</small><div class="number">${report.stats.discoveredFiles}</div></div><div class="stat"><small>重复组 / GROUPS</small><div class="number">${report.summary.duplicateGroups}</div></div><div class="stat highlight"><small>多余副本内容 / REDUNDANT</small><div class="number">${formatBytes(report.summary.redundantBytes)}</div></div></div>
<div class="section-label">${report.summary.extraCopies} 个多余副本 · ${report.stats.hashedFiles} 个文件完成内容校验</div>
${cards || '<section class="empty"><h2>没有发现重复文件</h2><p>仅检查当前扫描范围内、达到最小大小的普通文件。</p></section>'}
${warnings}
<section class="notice"><h2>文件内容保持原样</h2><p>TwinFiles 只读取和比较文件。上面的数字是多余副本的内容大小，不代表一定能释放的磁盘空间。硬链接额外路径、符号链接和默认小于 ${report.minBytes} 字节的文件会跳过。手动清理前，请确认用途并保留备份；扫描后文件仍可能变化。</p><p>报告包含本地文件名和目录路径，分享前请检查。</p></section>
<footer><span>TwinFiles 0.1.0 · SHA-256 · 无网络请求</span><span>${esc(report.generatedAt)}</span></footer>
</main></body></html>`;
}
