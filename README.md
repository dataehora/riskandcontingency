# Risk and Contingency

Web-based project risk and contingency management.

Live at [riskandcontingency.com](https://riskandcontingency.com).

Static site: plain HTML, CSS and vanilla JavaScript — no build step, no
dependencies, no accounts required. Currently a placeholder while the
actual tool is designed and built.

## Repository layout

```
index.html            Landing page
styles.css             Landing-page styles
CNAME, robots.txt, sitemap.xml   Hosting + crawl metadata
scripts/auto-deploy.sh Automated commit -> PR -> merge -> publish flow
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

Served via GitHub Pages on the `riskandcontingency.com` domain (`CNAME`).
Pushing to `main` publishes automatically — no build step.

## License

MIT License — feel free to use and modify.

## Contributing

Contributions are welcome. Please open a Pull Request.
