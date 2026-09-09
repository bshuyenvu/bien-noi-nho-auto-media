# Phase 7 — RSS Source Resilience

## Problem
Some reputable foreign publishers protect RSS endpoints with WAF/CDN challenges. On the Wyse production server, BMJ and NIH return HTTP 403 challenge HTML; NHS England can return an empty 202 response. These endpoints are unsuitable for unattended server-side RSS polling even when they work in a normal browser.

## Production policy
VietNewsFlow AI does not bypass WAF or anti-bot controls. Managed sources that are not reliably machine-readable are retired and replaced by official/reputable feeds that are reachable from the production server.

### Replacements
- Nature Medicine — `https://www.nature.com/nm.rss`
- ECDC News/Press Releases — `https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed`
- EMA News & Press Releases — `https://www.ema.europa.eu/en/news.xml`

## Scanner hardening
- Explicit RSS/Atom/XML Accept headers.
- WAF/challenge classification for 401/403 HTML challenges.
- 429 rate-limit classification.
- Empty/HTML/non-feed responses are rejected even when HTTP status is 2xx.
- Namespaced XML tags such as `content:encoded` and `media:thumbnail` are parsed by tag name rather than CSS pseudo selectors.
- A feed with zero `item`/`entry` nodes is treated as invalid.

## Migration
At startup, managed BMJ/NIH/NHS legacy URLs and old Google News intermediary feeds are removed for affected tenants and the trusted catalog is replenished to the 15-source target.

## Verification
`npm run smoke:rss-resilience` validates catalog migration, WAF classification, empty-response rejection, and namespaced RSS parsing without external network dependency. A Wyse live smoke additionally verifies Nature Medicine, ECDC and EMA end-to-end.
