# Project GSBP – AI Coding Agent Guide

This repo is a CRA React app that can also ship as a Windows desktop app via Electron. Dev runs in the browser with hot reload + LESS theming via Gulp; production desktop bundles React, serves it with an embedded Express server, and exposes a tray icon.

Core structure
- State: Redux Toolkit store in `src/store` with slices (auth, theme, uploadData). Dynamic slice injection via `injectReducer()`.
- Navigation vs Routes: `src/configs/NavigationConfig.js` drives the side menu; `src/configs/RoutesConfig.js` lazy-loads views. Keep their `path` and `role` in sync.
- Routing/RBAC: React Router v6. `routes/ProtectedRoute.js` checks `auth.token` and loads user via `getByToken`. Redirect appends `?redirect=` to the login URL defined in `configs/AppConfig.js`.
- Views: Protected under `src/views/app-views/**`; public under `src/views/auth-views/**`.

HTTP and data flow
- Preferred client: Use `utils/request.js` (Axios instance from `utils/baseUrl.js`). It sets `baseURL: host + "/api/v1/"`, attaches token in `x-access-token`, serializes Dayjs/Date to ISO-8601 UTC, and auto-refreshes tokens via `refresh_token` when 401.
- Legacy client: `auth/FetchInterceptor.js` attaches token to `authorization` and dispatches `signOutSuccess()` on 401/403. Only a few endpoints (e.g., `AuthService.register`) use it. Prefer Request/baseUrl for new code.
- Services: One file per domain in `src/services/**` returning Promises that call `Request.getRequest/postRequest/...`. Example:
  `Request.getRequest("services/list?pageNumber=1&pageSize=10&query=")`.

RBAC patterns
- Roles: `admin`, `superAdmin`, `user` (from `authSlice`). Menu items and routes declare `role: [..]` and are filtered accordingly.
- UI gating: Use `src/providerComponent/index.jsx` as `<ProviderComponent rolePermission={["admin","superAdmin"]}>...</ProviderComponent>`.

Theming and i18n
- Theme: `ThemeSwitcherProvider` selects `public/css/dark-theme.css` or `light-theme.css`; current theme in `themeSlice` via `utils/themeUtils.getInitialTheme()`.
- LESS pipeline: Gulp watches `src/assets/less/**/*.less` and outputs to `public/css`. Run `npm run dev` to start CRA + Gulp watch.
- i18n: `src/lang/index.js` with locales `ru`/`uz`. Ant Design locale is bound via `resources` and `THEME_CONFIG.locale`.

Electron specifics
- Entry: `electron/main.js` reads `.env` at runtime (`PORT`, `AUTO_OPEN_BROWSER`). Serves `build/` via Express, opens system tray.
- Key commands (PowerShell):
  - `npm run dev`  # CRA + Gulp watch
  - `npm run electron`  # build React then launch Electron
  - `npm run electron:dev`  # CRA (BROWSER=none) + Electron after ready
  - `npm run dist`  # build installer via electron-builder

When adding a feature (checklist)
1) Create view under `src/views/**` and lazy-register route in `RoutesConfig.js` with correct `role`.
2) Add matching nav item in `NavigationConfig.js` (same `path` and `role`).
3) Add service methods under `src/services/**` using `Request.*` (avoid raw Axios or `FetchInterceptor` unless endpoint requires it).
4) Gate UI with `ProviderComponent` as needed; add i18n keys in `src/lang/locales/*`.
5) If theme-specific styles are needed, update LESS and let Gulp emit CSS.

Gotchas and conventions
- Two Axios layers exist; prefer `utils/baseUrl.js` (`x-access-token` + refresh). Mixing headers (`authorization` vs `x-access-token`) breaks auth.
- Dates are auto-serialized to UTC; don’t pre-stringify dates.
- Auth redirect uses `?redirect=`; constants live in `configs/AppConfig.js`.
- Keep `NavigationConfig` and `RoutesConfig` aligned to avoid broken breadcrumbs/permissions.
- For Electron, `.env` is read at runtime (not CRA’s `REACT_APP_*`). For browser code, only `REACT_APP_*` are available (e.g., `REACT_APP_SITE_PATH`).
