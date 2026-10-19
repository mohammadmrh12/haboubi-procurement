# Windows desktop build

This package uses the canonical Haboubi procurement web assets without redesigning them. `npm run sync-assets` copies the same `index.html`, CSS, JavaScript, official forms, catalogue, aliases, and XLSX library into the desktop resource bundle.

## Local-first behaviour

- Electron starts the existing Node API on a loopback-only ephemeral port.
- Account records, operation history, session-signing key, sync revisions, and catalogue overrides live under Electron's per-user application-data directory, not in the installation folder and not inside the installer.
- The existing user access codes remain unchanged. Local authentication and data entry do not require Internet access.
- On login and periodically while online, the desktop API attempts to sync that user's data and operation history with `https://medstock.cinematicplus.online`. If the network is unavailable, the local API remains available and a later retry is scheduled.
- The official catalogue and alias bundles are checked at app launch and can be cached locally for offline use.
- Printing uses the existing `forms-addon.js` markup and `@media print` CSS. The Electron Chromium print dialog on Windows supports installed printers and Microsoft Print to PDF.

## Build on Windows

```powershell
cd desktop
npm ci
npm run dist:win
```

The NSIS installer is emitted to `desktop/dist/`. The GitHub Actions workflow `.github/workflows/windows-desktop.yml` builds the x64 installer and stores it as a 30-day workflow artifact.

## Data safety

Never copy production `data/private` into the installer. The installed app creates its own private per-user data directory. Before distributing an update, run all tests including `tests/windows-desktop.test.js` and verify the printed official forms on a Windows machine with the target paper settings.
