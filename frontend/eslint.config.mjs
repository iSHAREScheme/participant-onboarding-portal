// ESLint flat config for Next.js 16+.
// Replaces the removed `next lint` command (run via `eslint .` / `yarn lint`).
// Uses eslint-config-next's core-web-vitals ruleset, matching the previous
// `next lint` behaviour. Add `eslint-config-next/typescript` here if you want
// the stricter typescript-eslint rules as well.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import reactHooks from 'eslint-plugin-react-hooks'

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // Advisory react-hooks rule (eslint-plugin-react-hooks v5). It flags
    // legitimate, widely-used patterns here — mount flags, load-on-mount data
    // fetches, and state resets before re-deriving — none of which are bugs.
    // Treat it as a warning, consistent with how react-hooks/exhaustive-deps
    // is handled, so CI isn't blocked on a style nit. (Flat config requires the
    // plugin be declared in the same object as the rule it configures.)
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Default ignores previously provided implicitly by `next lint`.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
