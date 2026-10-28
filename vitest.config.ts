import { defineConfig } from 'vitest/config';

// Pure simulation/rules tests: no IWSDK dev plugin, no browser.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
