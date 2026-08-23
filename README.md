# Acute — public status dashboard

Source for the public status page:

**https://testplay-byte.github.io/DASHBOARD/**

The Acute product itself is developed in a private repository. This repo
contains only the dashboard site and its curated, public-safe `data.json` —
no product source code, no secrets, no internal details.

## Design

- Light, high-contrast theme (off-white background, near-black ink) with an
  orange accent `#FF6B2C` — rebuilt from owner feedback on the first, darker
  iteration.
- Sections: product hero + last-updated stamp, key numbers, three pillars,
  the plan (NOW + upcoming), quality metrics, milestone timeline,
  principles, tech stack.
- Responsive (mobile-first), semantic HTML, keyboard-accessible, and it
  respects `prefers-reduced-motion`. The page renders fully without
  JavaScript; the script only adds motion (count-up numbers, animated
  progress bars, reveal transitions, nav scrollspy).

## Repository layout

| path | purpose |
| --- | --- |
| `data.json` | **all page content** — the single source of truth |
| `src/template.html` | page template with `{{PLACEHOLDER}}` slots |
| `src/style.css` | full light-theme stylesheet (edit here, not in `assets/`) |
| `src/app.js` | progressive-enhancement script |
| `build.mjs` | zero-dependency build: data + template → `index.html` + `assets/` |
| `index.html` | generated output — served by GitHub Pages |
| `assets/` | generated copies of the CSS/JS with cache-busted URLs |
| `.github/workflows/deploy.yml` | rebuilds the output on every push to `main` |

## Update flow

1. Edit `data.json` (keep it public-safe — see policy below).
2. Rebuild and commit:

   ```bash
   node build.mjs
   git add -A
   git commit -m "status update"
   git push
   ```

   GitHub Pages serves the `main` branch root, so the pushed `index.html`
   goes live within a minute. A GitHub Actions workflow also rebuilds the
   output on every push to `main`, so editing `data.json` in the GitHub UI
   (or forgetting to run the build locally) still results in a fresh page.

## Local preview

```bash
node build.mjs
python3 -m http.server 8080   # then open http://localhost:8080
```

(Opening `index.html` directly also works — asset URLs are relative.)

## Content policy (binding)

This repo and its build output are **public**. Allowed content: product
name/tagline/version, pillar states and progress, milestone one-liners,
aggregate quality facts (test counts, license verdict), and generic tech
chips. Never add: source code, internal file paths, credentials or
token-like strings, private model identifiers, internal record ids, ports,
notification topics, or links to the private product repo.

`build.mjs` enforces this mechanically: every generated file is scanned
against a fail-closed denylist (token patterns, credential patterns,
internal-path patterns, token-in-URL, …) and the build aborts with a
non-zero exit code before anything is written if a match is found.
