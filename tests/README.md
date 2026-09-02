# Test organization

Browser Amp uses test location to show which module interface a test exercises:

- `src/**/*.test.ts` contains fast Vitest tests colocated with one in-process module.
- `tests/browser/**/*.spec.ts` contains Playwright tests of user-visible workspace behavior.
- `tests/audio/**/*.spec.ts` contains Playwright tests that require real browser audio primitives or cross several audio modules.
- `tests/production/**/*.spec.ts` contains checks that run only against the built application.
- `tests/support/**` contains shared test adapters and harnesses; it does not contain tests.

Keep a test beside its source when one module fully owns the behavior. Put it under `tests/` when the behavior crosses modules or requires the browser runtime.
