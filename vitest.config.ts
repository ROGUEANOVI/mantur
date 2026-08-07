import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', 'e2e', '.next'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        // Route-level Server Components: golden paths are covered by
        // Playwright e2e (see TESTING.md), not Vitest/jsdom.
        'src/app/**/page.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/opengraph-image.tsx',
        'src/app/**/apple-icon.tsx',
        'src/app/manifest.ts',
        'src/middleware.ts',
        // shadcn/ui-generated primitives: no custom business logic.
        'src/components/ui/**',
        // Thin Supabase SDK factory wrappers: no independent logic,
        // already exercised indirectly via mocks in every action test.
        'src/lib/supabase/**',
        // Static copy/data objects: nothing to unit test.
        'src/lib/copy/**',
      ],
    },
  },
})
