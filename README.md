# Video Recorder

A simple cross-platform desktop app for recording **screen** (and optional **webcam** PiP) with a **microphone**, built with [Electron](https://www.electronjs.org/) and [electron-vite](https://electron-vite.org/).

## Requirements

- Node.js 18+
- Ubuntu/Linux: working camera and microphone (PipeWire or PulseAudio) when using the webcam layout

## Development

```bash
npm install
npm run dev
```

If you see **`Error: Electron uninstall`**, the Electron binary did not install correctly. This often happens when the project folder path **contains spaces** (for example `video recorder`). The `postinstall` script tries to fix that with `unzip`; you can also run:

```bash
node scripts/ensure-electron.cjs
```

If spawn fails with a path ending in `electron\n`, run the command above (it strips stray newlines from `path.txt`).

Or clone/move the project to a path without spaces (for example `~/Desktop/coding/video-recorder`).

### Linux sandbox error

If Electron exits with **`chrome-sandbox` / `setuid_sandbox_host`**, the sandbox must be disabled **before** Electron starts (not from `main.js`). Use the provided scripts (`npm run dev` passes `--noSandbox`) or run:

```bash
NO_SANDBOX=1 npm run dev
```

For a stricter setup (optional), from the Electron `dist` folder:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Then remove the `no-sandbox` switch in `src/main/index.js` if you want sandboxing enabled.

On first launch, allow **camera** and **microphone** access when prompted. Device names appear in the dropdowns after permissions are granted.

## Usage

1. Choose a **layout**:
   - **Screen share** — full screen/window capture
   - **Screen + webcam** — screen with a circular camera overlay at the bottom-left
2. Select a **display or window**, then **Share & preview**.
3. Pick **microphone** (and **camera** for the webcam layout).
4. Click **Record**, then **Stop** when finished.
5. Choose where to save the `.webm` file.

Recordings use WebM (VP9/VP8 + Opus when supported).

## Linux notes (Ubuntu)

- **Privacy**: Settings → Privacy → Camera / Microphone — ensure apps are allowed.
- **Screen capture**: On **Wayland**, screen sharing depends on your desktop portal and Electron/Chromium; **X11** sessions usually work well with window/screen lists.
- **Audio**: Select the correct input in the microphone dropdown; system default is used if labels are unavailable before permission.

## Build & package

```bash
npm run build    # compile to out/
npm run preview  # run production build locally
npm run dist     # .deb via electron-builder (see package.json "build")
```

Packaged output is written to `release/`.

### Install on Linux (.deb)

After `npm run dist`:

```bash
sudo dpkg -i release/video-recorder_*.deb
```

If `dpkg` reports missing dependencies:

```bash
sudo apt-get install -f
```

Launch **Video Recorder** from your application menu, or run `video-recorder` if it is on your `PATH`.

For architecture, IPC, screen capture, and packaging options (AppImage, `.deb`, desktop entry), see **[DEVELOPER.md](./DEVELOPER.md)**.

## For developers

**[DEVELOPER.md](./DEVELOPER.md)** — how Electron main / preload / renderer fit together, recording pipeline, and step-by-step Linux distribution.

## Project layout

- `src/main/` — Electron main process (IPC, save dialog, display capture handler)
- `src/preload/` — Safe bridge to the renderer
- `src/renderer/` — UI, device selection, compositor, `MediaRecorder`
