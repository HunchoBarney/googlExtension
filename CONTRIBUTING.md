# Contributing

PMEx Market Matcher is an early read-only project. Keep changes small, testable, and inside that product boundary.

## Local setup

1. Install a current Node.js LTS release.
2. Run `npm ci`.
3. Run `npm test`.
4. Run `npm run test:layout` for popup changes.
5. Run `npm run package:release` before proposing a release change.

Live checks use public venue APIs and are intentionally separate from deterministic tests. Run `npm run test:live` and `npm run test:browser` before a release, not as a substitute for unit coverage.

Do not add synthetic market facts to production UI, remote executable code, telemetry, wallet credentials, order execution, or new host permissions without an explicit reviewed product and security decision.
