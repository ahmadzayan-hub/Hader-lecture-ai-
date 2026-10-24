# Bounded schema validation security update

Pins Zod to 4.6.7 for GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404). The advisory marks releases below 4.6.6 affected. The maintainer says v3 releases are no longer published; their disagreement about severity is not used as an audit suppression.

- Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- v3 status: https://github.com/colinhacks/zod/issues/6653
- Migration reference: https://zod.dev/v4/changelog

This is a same-major dependency patch. Existing 40-alias, 10,000-segment, 24-context-segment, 8-citation and 30-library-document bounds are retained. Answer key points and each generated brief collection now reject more than 100 entries. These are new conservative ceilings, not an existing product contract: answer/brief generation requests only 600/1,800 tokens and local brief extraction produces small study lists. Oversized model output follows the existing invalid-output handling, not silent truncation. Test fixtures confirm defaults, a valid boundary and no element traversal on oversized arrays.

## Scope and residual risk

The patch does not cap general JSON reception/parsing, string accumulation, request rates, template normalization, arbitrary records, or non-Zod loops. Only explicitly bounded arrays gain the fixed early termination. A clean dependency audit is not a comprehensive denial-of-service guarantee. No auth, permissions, database schema, paid-provider settings, deployment or broad dependency changes are included.

All security fixtures are synthetic. No resource-exhaustion attack, live database action, real account, provider call or external credentials are used. Local focused tests with reused dependencies do not replace a clean frozen-lockfile install and exact-head CI.

## Separate source-map dependency fix

The same narrow security release updates only the locked source-map-js resolution from 1.2.1 to 1.2.2 across its existing PostCSS/Tailwind consumers. GHSA-68fv-2mgg-jv7q (CVE-2026-93749) reports uncontrolled processing of indexed source-map section offsets; 1.2.2 is the patched release. No dependency range or PostCSS/Tailwind version changes.

- https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2
