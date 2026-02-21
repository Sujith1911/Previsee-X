# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | ✅ Yes             |
| 1.0.x   | ❌ No (upgrade to v2.0) |

## Privacy & Security Architecture

PRIVISEE-X is designed with privacy-first principles:

- **Zero external communication** — No API calls, no telemetry, no crash reporting
- **100% local processing** — All ML inference and analysis runs client-side
- **Sandboxed storage** — Data stored in Chrome's sandboxed IndexedDB (7 stores, v7 schema)
- **Minimal permissions** — `storage`, `cookies`, `webRequest`, `webNavigation`, `scripting`, `tabs`, `alarms`, `clipboardRead`, `clipboardWrite`, `declarativeNetRequest`
- **No eval()** — No dynamic code execution
- **CSP enforced** — All extension pages (popup, dashboard, settings) include strict CSP meta tags
- **Trust persistence** — Domain trust stored in `chrome.storage.local`, not in memory (survives SW restarts)
- **Behavioral DNA** — 14-API signal hash is local-only, never transmitted

## Reporting a Vulnerability

If you discover a security vulnerability in PRIVISEE-X, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Open a [GitHub Security Advisory](https://github.com/Sujith1911/Previsee-X/security/advisories/new) (private disclosure)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within **72 hours** and release a patch within **7 days** for critical issues.

## Threat Model

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full threat model and security analysis.

## Scope

The following are **in scope** for security reports:
- Data leakage to external parties
- Privilege escalation within the extension
- Cross-site scripting (XSS) in extension pages
- Bypass of privacy protections

The following are **out of scope**:
- Vulnerabilities in Chrome itself
- Social engineering attacks
- Physical access attacks
