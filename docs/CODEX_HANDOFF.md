# BLUFIN+ project handoff for Codex

This file carries the project context when the `blufin-still` folder is opened or copied into Codex. Keep it aligned with the code and the current approved product direction.

## Product

BLUFIN+ is a Russian/English mobile-first AI chart-analysis product. Visitors see a concise landing page and can create an account. Signed-in users analyze chart screenshots in FAST, DEEP, and MAXIMUM modes, review past analyses, and manage access levels from their profile.

## Current approved interface direction

- The compact interface recovered from Cloudflare deployment version 31 is the visual and navigation baseline. Preserve the current compact flow; do not bring back the older wide dashboard, sidebar, separate settings area, or scattered profile sections.
- Keep history and levels inside the profile. Keep analysis, navigation, and access activation easy to use on narrow screens.
- The signal direction is a distinct glowing component with a moving directional line. Use vivid green for upward and vivid red for downward signals while keeping labels and data readable.
- Levels have distinct saturated colors. PRO is violet. Keep premium contrast and readable copy.
- Level details use a consistent text grid, even spacing, and readable line height. The landing CTA is “Создайте аккаунт и проверьте доступные режимы” (English equivalent: “Create an account and check the available modes”).
- The access activation flow stays concise. Do not show deposit-summing explanations or equations there. If accumulation needs explaining, put a short note in the profile after access is granted. An attempt to activate access before it is active must look like a clear red error state.
- The landing background uses the project’s custom silk-like filament animation. Respect reduced-motion settings. Do not add React Bits Pro package code unless the user specifically asks and provides the required access.
- Maintain the BLUFIN+ premium visual language, bilingual copy, responsive behavior, and the user's approved references. Avoid generic SaaS redesigns.

## Visual and reference material

The approved visual/source references needed to continue independently are copied into `docs/references/`:

- `new-version.png`: screenshot reference for the newer compact interface.
- `version31-index.html`: recovered version 31 landing-page baseline for comparison.
- `logo.png`: user-provided logo reference.
- `signal.png`: user-provided signal-line reference.
- `CLOUDFLARE-SKILLS-LICENSE`: Apache-2.0 license for the vendored Cloudflare skill files.

The parent ChatGPT project may also contain `../references/recovered-compact/`, `../references/recovered-worker31.multipart`, `../references/recovered-index.html`, and `../references/recovered-ui-readable.js`. They are recovery artifacts, not deployment inputs. The parent `../sources/` directory is synced project material and must remain read-only; it may be replaced by the ChatGPT project system.

Prefer the current tracked files in this repository over recovered copies. Use the image references to judge visual direction, not as replacements for source code. Do not execute helper scripts from the parent `references/` folder as part of normal development or deployment.

## Repository map

- `src/`: React and TypeScript UI source, including the public landing and component styles.
- `app.js`, `styles.css`, `mobile.css`, `still.css`, `signal.css`, `premium.css`, and `i18n.js`: app shell, visual layers, signal styling, and localization integration used by the site bundle.
- `locales/`: Russian and English interface strings.
- `worker/`: Cloudflare Worker request handling and API routes.
- `account/` and `owner/`: account-facing and owner-facing pages.
- `migrations/`: Cloudflare D1 schema migrations.
- `tests/`: Node test suite.
- `scripts/build-site.mjs`, `scripts/copy-ui.mjs`: build and copy the UI into the site output.
- `wrangler.jsonc`: Worker entry point, custom domain `bluefinplus.site`, static asset directory, and D1 binding.
- `dist-ui/` and `dist-site/`: generated output. Rebuild them; do not edit generated files as the primary source.

The project uses React 19, TypeScript, Vite 8, Tailwind CSS 4, Cloudflare Workers, and D1. Check `package.json` and `wrangler.jsonc` for the exact current configuration before changing dependencies or bindings.

## Local development and checks

Run commands from this directory:

```sh
npm install
npm test
npm run build:site
```

`npm test` exercises API behavior, authentication, analysis modes, history/profile navigation, bilingual UI, and the localized processing flow. The last verified run on 2026-10-01 passed all 33 tests. `npm run build:site` completed successfully on that date.

## Deployment and authentication

The production site is served through the Cloudflare Worker configured in `wrangler.jsonc`. Use the project's Wrangler configuration and current Cloudflare instructions; do not deploy through localhost or substitute another hosting provider. A successful dashboard login alone does not prove that Wrangler or an MCP connection is authenticated.

Cloudflare's official Codex setup instructions are at:

- https://developers.cloudflare.com/agent-setup/prompt.md
- https://developers.cloudflare.com/agent-setup/
- https://developers.cloudflare.com/workers/wrangler/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/
- https://github.com/cloudflare/skills

The official Codex setup uses the Cloudflare Skills package and MCP servers (`cloudflare`, `cloudflare-docs`, `cloudflare-bindings`, `cloudflare-builds`, and `cloudflare-observability`), followed by OAuth for the authenticated `cloudflare` server. Restart Codex after configuring MCP so it loads the new tools. Do not store Cloudflare tokens or OAuth refresh tokens in this repository, handoff files, shell history, or chat messages.

For reference, the Cloudflare prompt currently gives these Codex commands:

```sh
npx -y skills add cloudflare/skills --skill '*' --yes --global
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp add cloudflare-docs --url https://docs.mcp.cloudflare.com/mcp
codex mcp add cloudflare-bindings --url https://bindings.mcp.cloudflare.com/mcp
codex mcp add cloudflare-builds --url https://builds.mcp.cloudflare.com/mcp
codex mcp add cloudflare-observability --url https://observability.mcp.cloudflare.com/mcp
codex mcp login cloudflare
```

Restart Codex after setup. The Cloudflare CLI `cf` is optional; the project already has `wrangler.jsonc`, so Wrangler is the relevant deployment tool. Do not install the optional global CLI without the user's preference.

Before publishing, check Git status, run tests and a production build, authenticate the current Codex/Wrangler session, deploy, then open `https://bluefinplus.site` and verify the live behavior. Report deployment as blocked if the Cloudflare connector or token is unavailable; do not ask the user to repeat a dashboard login that does not refresh this session's credentials.

## Skills to use in Codex

Use the smallest relevant set for each task:

- `cloudflare` for Cloudflare product and architecture guidance.
- `wrangler` for Wrangler development, configuration, and deployment.
- `workers-best-practices` when changing Worker code or bindings.
- `web-perf` when diagnosing performance or Core Web Vitals.
- `frontend-design` and `ui-ux-pro-max` for interface design and implementation.

All six selected skill folders are included in `.agents/skills/` so they travel with the project. The four Cloudflare skills were copied from Cloudflare's official `cloudflare/skills` repository; the license is kept in `docs/references/CLOUDFLARE-SKILLS-LICENSE`. The complete user-provided UI skills were copied from their installed local directories.
- `product-design:audit` for reviewing user flows and `product-design:image-to-code` when implementing an approved screenshot reference, if those skills are available in the target Codex environment.

Cloudflare's full skill bundle can be installed using the command in its official agent setup prompt. Keep MCP configuration in Codex's supported locations; do not copy OAuth state into this project. The official `npx skills` clone failed in this environment because its GitHub transport had no credentials; the four relevant Cloudflare skills were instead downloaded from the official public archive and included locally.

## Current Git and delivery state recorded during handoff

At handoff preparation on 2026-10-01, local `main` was at `dd4c5d0` and five commits ahead of `origin/main`. The five local commits include the compact version 31 restoration and neon directional signal/favicons. They had not been pushed or published. Git also reported `fonts/OFL.txt` as modified; inspect it before staging or committing. Do not discard these local commits or this worktree state during migration.
