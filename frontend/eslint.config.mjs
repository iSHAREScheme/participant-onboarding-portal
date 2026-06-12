// ESLint flat config for Next.js 16+.
// Replaces the removed `next lint` command (run via `eslint .` / `yarn lint`).
// Uses eslint-config-next's core-web-vitals ruleset, matching the previous
// `next lint` behaviour. Add `eslint-config-next/typescript` here if you want
// the stricter typescript-eslint rules as well.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  // Default ignores previously provided implicitly by `next lint`.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
