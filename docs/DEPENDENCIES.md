# Dependency Security Audit

Last audited: 2026-02-03

## Verification Status

All critical dependencies have been verified as legitimate packages from their official maintainers.

### Core Collaboration Stack

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `tldraw` | steveruizok, ds300 (tldraw team) | github.com/tldraw/tldraw | Verified |
| `@tldraw/sync` | tldraw team | github.com/tldraw/tldraw | Verified |
| `yjs` | dmonad (Kevin Jahns) | github.com/yjs/yjs | Verified |
| `@hocuspocus/server` | ueberdosis/tiptap team | github.com/ueberdosis/hocuspocus | Verified |
| `@hocuspocus/provider` | ueberdosis/tiptap team | github.com/ueberdosis/hocuspocus | Verified |

### Terminal Stack

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `@xterm/xterm` | tyriar (Daniel Imms) | github.com/xtermjs/xterm.js | Verified |
| `@xterm/addon-fit` | tyriar | github.com/xtermjs/xterm.js | Verified |
| `@xterm/addon-search` | tyriar | github.com/xtermjs/xterm.js | Verified |
| `@xterm/addon-web-links` | tyriar | github.com/xtermjs/xterm.js | Verified |

### Authentication Stack

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `arctic` | pilcrowonpaper | github.com/pilcrowonpaper/arctic | Verified |
| `oslo` | pilcrowonpaper | github.com/pilcrowOnPaper/oslo | Verified |

### Server Framework

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `hono` | yusukebe | github.com/honojs/hono | Verified |
| `@hono/node-server` | yusukebe | github.com/honojs/hono | Verified |

### Database

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `drizzle-orm` | drizzle-team | github.com/drizzle-team/drizzle-orm | Verified |
| `better-sqlite3` | JoshuaWise | github.com/WiseLibs/better-sqlite3 | Verified |

### Utilities

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `zod` | colinhacks | github.com/colinhacks/zod | Verified |
| `nanoid` | ai (Andrey Sitnik) | github.com/ai/nanoid | Verified |
| `zustand` | pmndrs | github.com/pmndrs/zustand | Verified |
| `clsx` | lukeed | github.com/lukeed/clsx | Verified |

### Frontend

| Package | Publisher | Repository | Status |
|---------|-----------|------------|--------|
| `react` | facebook | github.com/facebook/react | Verified |
| `react-dom` | facebook | github.com/facebook/react | Verified |
| `react-router-dom` | remix-run | github.com/remix-run/react-router | Verified |

## Pinned Versions

Critical runtime dependencies are pinned to exact versions (no `^` prefix) to prevent:
- Unexpected breaking changes from minor/patch updates
- Supply chain attacks via compromised patch releases
- Non-deterministic builds

Dev dependencies retain `^` ranges as they don't affect production.

## Known Vulnerabilities

### Transitive Dependencies

1. **esbuild <= 0.24.2** (via drizzle-kit, vite)
   - Severity: Moderate
   - Issue: Dev server allows cross-origin requests
   - Impact: Development only, not production
   - Advisory: GHSA-67mh-4wv8-2f99
   - Mitigation: Update when drizzle-kit/vite release compatible versions

2. **nanoid >= 4.0.0 < 5.0.9** (transitive via tldraw)
   - Severity: Moderate
   - Issue: Predictable results with non-integer values
   - Impact: Low for our use case (string IDs)
   - Advisory: GHSA-mwcw-c2x4-8c55
   - Mitigation: Direct dependency pinned to 5.1.6; transitive will resolve on tldraw update

## Version Policy

### Major Version Updates Available

The following packages have major version updates available but are intentionally kept on current major versions for stability:

| Package | Current | Latest | Reason |
|---------|---------|--------|--------|
| `tldraw` | 2.4.6 | 4.3.1 | Major API changes; requires migration |
| `@tldraw/sync` | 2.4.6 | 4.3.1 | Must match tldraw version |
| `zustand` | 4.5.7 | 5.0.11 | Breaking changes in store API |
| `zod` | 3.25.76 | 4.3.6 | Breaking changes in schema API |
| `@xterm/xterm` | 5.5.0 | 6.0.0 | Breaking changes in rendering |

### Update Schedule

- **Security patches**: Apply immediately
- **Minor versions**: Review monthly
- **Major versions**: Evaluate quarterly, requires testing

## Audit Commands

```bash
# Run security audit
bun audit

# Check for outdated packages
bun outdated

# Update within semver ranges
bun update

# Update to latest (including major versions)
bun update --latest
```

## Supply Chain Considerations

1. **No typosquatting detected** - All package names match official org namespaces
2. **All packages have established GitHub repos** with active maintenance
3. **Maintainers verified** via npm profiles and GitHub commit history
4. **Download counts** are appropriate for package popularity

## Lockfile

The `bun.lockb` file should be committed and reviewed for unexpected changes. Run `bun install` to regenerate after any package.json changes.
