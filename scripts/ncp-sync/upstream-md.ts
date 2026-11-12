/** Parse / render vendor/ncp/UPSTREAM.md (the record of which upstream commit is vendored). */

export interface UpstreamInfo {
  sha: string
  /** committer date of the upstream commit (YYYY-MM-DD) */
  commitDate: string
  /** ISO timestamp of the sync that vendored it */
  syncedAt: string
  /** file path relative to vendor/ncp (e.g. script_res/pokedex.js) -> sha256 of the UPSTREAM bytes */
  hashes: Record<string, string>
  /** names of patches (vendor/ncp-patches/*.patch) applied on top when vendoring */
  patches: string[]
}

export function parseUpstreamMd(text: string): UpstreamInfo {
  const sha = /Commit SHA:\s*([0-9a-f]{40})/.exec(text)?.[1]
  if (!sha) throw new Error('UPSTREAM.md: no "Commit SHA:" line')
  const commitDate =
    /Commit SHA:\s*[0-9a-f]{40}\s*\(committer date ([0-9-]+)\)/.exec(text)?.[1] ?? ''
  const syncedAt = /^- Synced at:\s*(\S+)/m.exec(text)?.[1] ?? ''
  const hashes: Record<string, string> = {}
  const block = /## sha256 of vendored files[^\n]*\n+```\n([\s\S]*?)```/.exec(text)?.[1] ?? ''
  for (const line of block.split('\n')) {
    const m = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim())
    if (m) hashes[m[2]!] = m[1]!
  }
  const patchBlock = /## Patches applied[^\n]*\n+```\n([\s\S]*?)```/.exec(text)?.[1] ?? ''
  const patches = patchBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return { sha, commitDate, syncedAt, hashes, patches }
}

export function renderUpstreamMd(info: UpstreamInfo): string {
  const lines = Object.entries(info.hashes)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([f, h]) => `${h}  ${f}`)
  const patches = info.patches.length
    ? `
## Patches applied on top (vendor/ncp-patches, in this order)

\`\`\`
${info.patches.join('\n')}
\`\`\`

The hashes above are those of the UPSTREAM files. Files touched by a patch differ from them.
`
    : ''
  return `# Upstream: NCP VGC Damage Calculator

- Repository: https://github.com/nerd-of-now/NCP-VGC-Damage-Calculator
- Branch: main
- Commit SHA: ${info.sha} (committer date ${info.commitDate})
- Synced at: ${info.syncedAt}
- License: MIT (see \`LICENSE\`, copied unmodified from upstream)

Files under \`script_res/\` are copied byte-for-byte from the upstream clone, except where a patch in
\`vendor/ncp-patches/\` is listed below. Only the data/engine scripts needed for damage computation
are vendored (list: \`scripts/ncp-sync/config.ts\`). Not vendored: CSS, images, setdex files,
select2, jQuery, UI-only scripts (\`switch_mode.js\`, \`sidebars.js\`, \`statuscalc.js\`,
\`afd_res/*\`), \`legacy_scripts/\`.

To refresh: \`npm run ncp:sync\` (see docs/MAINTENANCE.md). It re-vendors the files listed below,
rewrites this file, rebuilds the bridge maps and re-captures the golden tests.

## sha256 of vendored files

\`\`\`
${lines.join('\n')}
\`\`\`
${patches}`
}
