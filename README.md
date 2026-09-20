# Risk and Contingency

Web-based project risk and contingency management: create and assess
risk records under a project's Risk Breakdown Structure, calculate EMV
pre- and post-mitigation, run Monte Carlo simulation across pooled
risks, and compare available budget to the modelled cost distribution —
reading and writing directly to an Excel risk register in a folder on
your own machine. No accounts, no cloud storage, no server.

Live at [riskandcontingency.com](https://riskandcontingency.com).

Static site: plain HTML, CSS and vanilla JavaScript — no build step, no
Node dependencies. Data persistence uses the browser's File System
Access API against a folder the user picks (Chrome/Edge/Opera). The
app is under active development — see [CLAUDE.md](CLAUDE.md) for the
current build status and architecture.

## Repository layout

```
index.html                        Home / dashboard
risk-register.html                Risk record creation & management
modelling.html                    Monte Carlo simulation of Total Cost (Regular Pooled Records)
reporting.html                    Risk Reporting: list & top-N exposure ranking (not built yet)
contingency.html                  Available budget vs. Monte Carlo results
configuration.html                RBS / impact area / owner / QHSE level setup
css/                               Design system (tokens, base, components, shell)
js/shell.js                       Shared nav + connection-status wiring
js/theme.js                       Dark/light toggle
js/setup-sequence.js              4-step setup stepper + per-page gating
js/storage/                       File System Access folder connection, .xlsx read/write, register state, Monte Carlo engine
js/charts/s-curve.js              Shared S-curve chart (used by Modelling + Contingency)
js/pages/                         Per-page UI logic (configuration, risk-register, modelling, contingency)
js/vendor/                        Vendored SheetJS (xlsx.full.min.js), no CDN dependency
CNAME, robots.txt, sitemap.xml    Crawl metadata (CNAME is a leftover
                                   from an earlier GitHub Pages setup;
                                   hosting is now Cloudflare Pages, whose
                                   domain binding lives in the dashboard,
                                   not this file)
scripts/auto-deploy.sh            Automated commit -> PR -> merge -> publish flow
```

## Development

Everything is static — serve the repo root with any static file server:

```bash
git clone https://github.com/dataehora/riskandcontingency.git
cd riskandcontingency
python3 -m http.server 8000
# then open http://localhost:8000/
```

Or, in Claude Code, use the `static-site` launch config
(`.claude/launch.json`) for a no-cache local preview on port 5850.

## Deployment

Served via Cloudflare Pages on the `riskandcontingency.com` domain.
Pushing to `main` publishes automatically — no build step.

## License

MIT License — feel free to use and modify.

## Contributing

Contributions are welcome. Please open a Pull Request.
