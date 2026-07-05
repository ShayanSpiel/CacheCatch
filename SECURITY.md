# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 0.4.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please follow these steps:

1. **Do not open a public issue**. Instead, email the maintainer directly at `shayan@spielos.com`.
2. Include a detailed description of the vulnerability, steps to reproduce, and any potential impact.
3. Allow 48 hours for an initial response. We aim to resolve critical issues within 7 days.
4. Coordinate disclosure with the maintainer before publicly sharing details.

## Security Measures

### Code and Dependency Security
- **No install scripts**: The package does not use `preinstall`, `install`, or `postinstall` scripts that execute arbitrary code.
- **Provenance**: Published with npm provenance to ensure builds originate from this repository.
- **Dependency audits**: Regularly updated dependencies with GitHub Dependabot alerts enabled.
- **CI validation**: All changes undergo `typecheck`, `lint`, and `test` in GitHub Actions before merging.

### Data Privacy
- **Local execution**: All operations run locally; no data is sent to external servers unless explicitly configured (e.g., provider API keys).
- **No telemetry**: The CLI does not collect or send telemetry data.
- **API keys**: Keys are read from environment variables or `.env` (gitignored) and never logged or stored in reports.

### GitHub Security
- **Dependabot**: Automated dependency updates and security alerts.
- **CodeQL**: Static code analysis for vulnerabilities.
- **Secret scanning**: Prevents accidental commits of secrets.
- **Trusted publishing**: npm packages are published via GitHub Actions with OIDC provenance.

## Uninstallation

To fully remove Cachecatch and its artifacts:

```bash
# Remove local files
rm -rf ./reports ./.env ./cachecatch-x-share*.png

# Remove HOME artifacts
rm -rf ~/.cachecatch

# Clear npx cache
npx clear-npx-cache
```