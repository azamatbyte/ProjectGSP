# Project GSBP Desktop Distribution

This project is a Create React App (CRA) frontend that can also be packaged as a standalone Windows desktop application (an `.exe`) using Electron + electron-builder. The packaged app embeds a lightweight Express static server, auto-opens the UI in your default browser, and runs in the system tray (notification area) with an icon that exposes an Open and Quit menu.

## Quick Start (Development Web Mode)

Install dependencies:

```
npm install
```

Run React + Less watch tasks:

```
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Application-level build-time vars still follow CRA conventions (must be prefixed with `REACT_APP_` to be inlined). The desktop runtime also reads a root `.env` file at launch for server + Electron-only settings.

Create your local `.env` by copying the template:

```
copy .env.example .env   # Windows PowerShell / CMD
```

Edit `.env` values:

```
PORT=3000
AUTO_OPEN_BROWSER=true
```

`PORT` controls the internal static server & the URL opened.
`AUTO_OPEN_BROWSER` (true/false) controls whether the default browser is auto-launched in addition to the Electron hidden window.

## Desktop (Electron) Mode

Build the React production bundle then launch Electron pointing at it:

```
npm run electron
```

This will:
- Run `npm run build` (produces `build/`)
- Start Electron (`electron/main.js`)
- Start an embedded Express server serving `build/`
- Create a tray icon (uses `electron/icon.ico` – provide your icon file there)
- Auto-open the default browser (unless `AUTO_OPEN_BROWSER=false`)

Tray Menu:
- Open: focuses / (re)creates the Electron window (and browser already shows the app)
- Quit: shuts down the server & exits the app

The app keeps running in the tray after closing the window; use Quit to fully exit.

## Building a Windows Installer / Portable .exe

Prerequisites (only on the build machine; target users do NOT need Node.js):
- Node.js (LTS)
- `npm install`

Then run:

```
npm run dist
```

Outputs:
- `dist/Project GSBP Setup x.y.z.exe` (NSIS installer)
- Optional unpacked directory if using `--dir` (`npm run pack`)

Distribute the generated installer to end users. They can install & run without separately installing Node.js.

### Customizing Icons
Replace `electron/icon.ico` with your own multi-size Windows icon. For best results include 16, 32, 48, 64, 128, 256 px sizes.

### Updating Version
Increment the `version` field in `package.json` before building a new release. Electron-builder uses it for installer naming + metadata.

### Common Build Issues
- Antivirus False Positives: Sign the binary or add an exclusion.
- Port Already In Use: Change `PORT` in `.env`.
- Blank Screen: Ensure `build/` exists (run `npm run build`) and the URL `http://localhost:PORT` resolves.

## Offline / Firewall Considerations
The packaged app serves static assets locally and does not require internet except for any runtime API calls your React code makes. If you rely on remote APIs, ensure those hosts are accessible. To embed additional config, extend `.env` and reference via `process.env` in the Electron layer or prefix with `REACT_APP_` for React code.

## Development vs Production Differences
- In dev (`npm start`), CRA dev server handles hot reloading and proxying.
- In packaged mode, there is no web socket hot reload; you must rebuild (`npm run build`) before re-running Electron.

## Security Notes
- Node integration is disabled in the BrowserWindow (safer). Add a preload script if you need controlled APIs.
- Do not place secrets in `REACT_APP_` vars—they are bundled client-side.

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `dev` | CRA dev server + Gulp Less watch |
| `build` | Production React build into `build/` |
| `electron` | Build then launch Electron (unpacked) |
| `pack` | Build then create unpacked Electron app directory |
| `dist` | Build then produce installer (`dist/*.exe`) |

## Original CRA Documentation

Below is the original Create React App README content for reference.

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `yarn test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `yarn build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
