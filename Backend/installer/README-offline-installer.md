# Offline Installer Build

This folder contains the Windows offline installer build pipeline for the combined GSP application:

- Backend server
- Frontend React build
- Electron desktop app
- Portable Node.js runtime
- Portable PostgreSQL runtime
- Inno Setup installer

## What This Build Produces

The combined build script creates a Windows installer that can install:

- Backend only
- Frontend only
- Full backend + frontend package

The installer configures `%ProgramData%\GSPApp`, unpacks the bundled runtimes, initializes PostgreSQL, prepares the environment file, and starts the backend setup flow during installation.

## Prerequisites

Build this only on Windows.

Required on the build machine:

- PowerShell 5.1 or newer
- Node.js and npm available in `PATH`
- Inno Setup 6 installed
- Local copies of the required ZIP archives

Default Inno Setup path expected by the script:

```powershell
C:\Program Files (x86)\Inno Setup 6\ISCC.exe
```

If Inno Setup is installed elsewhere, pass `-IsccPath`.

## Required ZIP Files

Place these files in [`Backend/installer`](/D:/Documents/react/ProjectGSP/Backend/installer) or pass explicit paths:

- `node-v22.18.0-win-x64.zip`
- `postgresql-17.5-3-windows-x64-binaries.zip`

The build script validates both files and fails fast if either path is wrong.

## Standard Build Command

From the repo root:

```powershell
cd .\Backend\installer\
.\build-combined.ps1 -NodeZip ".\node-v22.18.0-win-x64.zip" -PgZip ".\postgresql-17.5-3-windows-x64-binaries.zip" -Clean
```

If PowerShell blocks the script in the current session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## Shortcut Command

From the repo root, use the wrapper command:

```powershell
.\pc_build.cmd
```

This runs the same combined installer build with these defaults:

- `-NodeZip ".\node-v22.18.0-win-x64.zip"`
- `-PgZip ".\postgresql-17.5-3-windows-x64-binaries.zip"`
- `-Clean`

Extra arguments are forwarded to [`build-combined.ps1`](/D:/Documents/react/ProjectGSP/Backend/installer/build-combined.ps1), for example:

```powershell
.\pc_build.cmd -SkipFrontend
.\pc_build.cmd -SkipBackend
.\pc_build.cmd -OutputDir release
.\pc_build.cmd -IsccPath "D:\Tools\Inno Setup 6\ISCC.exe"
```

## What `build-combined.ps1` Does

The script performs these stages:

1. Installs backend dependencies with `npm ci`
2. Generates Prisma client
3. Prunes backend dev dependencies
4. Copies backend app files into `Backend\build\app`
5. Copies installer helper scripts into `Backend\build\scripts`
6. Extracts portable Node.js into `Backend\build\node`
7. Extracts portable PostgreSQL into `Backend\build\pg`
8. Installs frontend dependencies with `npm ci`
9. Builds the React frontend
10. Packs the Electron app
11. Copies the frontend package into `Backend\build\frontend`
12. Generates `Backend\build\env.template`
13. Compiles the final installer with Inno Setup

## Main Script Options

Common options:

- `-Clean`
  Removes the previous `Backend\build` directory before rebuilding.
- `-SkipFrontend`
  Reuses the existing frontend build artifacts and skips frontend build/pack steps.
- `-SkipBackend`
  Reuses the existing backend staging artifacts and skips backend dependency/build steps.
- `-OutputDir <name>`
  Changes the installer output subfolder under `Backend\build`.
- `-IsccPath <path>`
  Uses a custom `ISCC.exe` location.
- `-FrontendDir <path>`
  Uses a non-default frontend directory instead of `..\..\frontedn_v2`.

## Build Output

Primary working directory:

```text
Backend\build\
```

Expected staged content:

- `Backend\build\app`
- `Backend\build\scripts`
- `Backend\build\node`
- `Backend\build\pg`
- `Backend\build\frontend`
- `Backend\build\env.template`

Default installer output:

```text
Backend\build\dist\GSPAppInstaller*.exe
```

## Install-Time Behavior

The generated installer is defined by [`combined.iss`](/D:/Documents/react/ProjectGSP/Backend/installer/combined.iss). During installation it:

- copies backend, frontend, runtime, and script files
- creates `%ProgramData%\GSPApp`
- writes the first `.env` file into `%ProgramData%\GSPApp\.env`
- runs `setup_env.ps1`
- runs `init_db.ps1`
- runs `start_services.ps1` to prepare PostgreSQL and the database
- optionally launches the frontend app after install

## Troubleshooting

### `ISCC.exe not found`

Install Inno Setup 6 or pass the correct path:

```powershell
.\pc_build.cmd -IsccPath "D:\Tools\Inno Setup 6\ISCC.exe"
```

### `NodeZip not found` or `PgZip not found`

Make sure the ZIP files exist in [`Backend/installer`](/D:/Documents/react/ProjectGSP/Backend/installer) or pass explicit paths directly to `build-combined.ps1`.

### `psql.exe not found after extraction`

The PostgreSQL ZIP is wrong or has an unexpected structure. Use the binaries ZIP:

- `postgresql-17.5-3-windows-x64-binaries.zip`

### Build directory cannot be removed

The script already tries to stop locking processes when `-Clean` is used. If cleanup still fails, close any running Electron app, Node process, or file explorer window using the previous `Backend\build` output and run the build again.

### Frontend build or Electron pack failed

Check:

- `frontedn_v2\package.json`
- local `npm ci` success in the frontend directory
- Electron output under `frontedn_v2\dist`

### Prisma generate failed

Check:

- backend `npm ci` completed successfully
- Prisma CLI exists under `Backend\node_modules`
- schema file exists at `Backend\prisma\schema.prisma`

## Rebuild Guidance

Use a clean build when:

- ZIP versions changed
- frontend packaging output looks stale
- the previous `Backend\build` directory was partially deleted
- you changed installer assets or Inno Setup configuration

Recommended rebuild:

```powershell
.\pc_build.cmd
```

## Version Updates

The wrapper command uses fixed default ZIP filenames. If Node.js or PostgreSQL archive versions change, update both:

- [`pc_build.cmd`](/D:/Documents/react/ProjectGSP/pc_build.cmd)
- [`README-offline-installer.md`](/D:/Documents/react/ProjectGSP/Backend/installer/README-offline-installer.md)

Keep those values aligned so the shortcut command and documentation stay accurate.
