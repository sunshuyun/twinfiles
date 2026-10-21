# TwinFiles

An offline, read-only duplicate file finder with terminal, JSON, and HTML reports. No third-party dependencies, uploads, or API keys.

[中文说明](README.md) · [Example report](examples/report.html) · [Contributing](CONTRIBUTING.md)

## Quick start

Requires Node.js 22 or later. No installation step is needed after downloading or cloning the project.

```sh
node bin/twinfiles.mjs ./examples/files
node bin/twinfiles.mjs ./examples/files --format html --out report.html
node bin/twinfiles.mjs ./examples/files --format json --out report.json
```

On Windows, double-click `Start-Windows.cmd` for a Chinese interactive prompt. Press Enter with no folder to scan the included fixtures. Interactive mode creates HTML and JSON reports in `.twinfiles-reports/` and opens the HTML report.

The CLI prints to stdout by default. `--out` creates a new file and refuses to overwrite any existing path. Its parent directory must exist.

## Options

| Option | Behavior |
| --- | --- |
| `--format text\|html\|json` | Output format, defaults to text |
| `--out <file>` | Save a new report |
| `--exclude <entry-name>` | Skip an exact file/directory name at all levels; repeatable |
| `--min-bytes <N>` | Minimum size in bytes, defaults to 1; 0 includes empty files |
| `--wizard` | Chinese interactive mode |
| `--help` / `--version` | Help / version |
| `--` | End option parsing |

Name exclusions are case insensitive on Windows and case sensitive elsewhere. They are not paths or glob patterns. `.git`, `node_modules`, and `.twinfiles-reports` are always excluded.

Exit codes: 0 complete, 1 input/output error, 2 incomplete scan with recorded errors, 130 cancelled. Finding duplicates is not an error.

## How it works

Files are grouped by size; only files with matching-size candidates are hashed. SHA-256 is computed using streams. Files with equal sizes and hashes form duplicate groups, sorted by redundant content size. No second byte-by-byte comparison is performed.

Symbolic links and directory junctions are skipped. Additional hardlink paths are skipped rather than counted as independent copies. File identity, size, modification time, and metadata change time are checked around reads to detect changes. Read failures are recorded and do not discard other results.

This is not a filesystem snapshot or a security sandbox. Scan stable local folders; concurrent hostile directory replacement is out of scope. Files may change after scanning. File metadata is held in memory; scan cost depends on file count and candidate content size. Reading may update OS access timestamps. Cloud sync clients may download placeholder files when read; TwinFiles itself makes no network requests.

Redundant content bytes are not a promise of recoverable disk space: sparse files, compression, deduplicated storage, and other filesystem behavior affect actual usage. No file is marked as the preferred copy. Verify files and keep backups before manual cleanup.

Reports include the selected absolute root, relative filenames, and hashes. Review them before sharing. HTML reports are static, escape filenames, and include a restrictive Content Security Policy.

## Demo and tests

```sh
node scripts/demo.mjs
node --test
```

Five fictional fixtures produce two duplicate groups and two extra copies. The deterministic example report uses a relative root to avoid publishing machine-specific paths.

Tests cover content comparisons, Chinese and space-containing paths, empty files, multi-chunk binary reads, exclusions, link handling, cancellation, changes during scans, escaped reports, and overwrite refusal. Link tests may be skipped when the operating system denies link creation. Included GitHub Actions configuration tests Node.js 22 and 24 on Windows and Ubuntu when pushed; check Actions for actual remote results.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [LICENSE](LICENSE). MIT licensed. The initial implementation was developed with Codex assistance; maintainers are responsible for review and ongoing maintenance.
