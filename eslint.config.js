import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', '.pnp.cjs'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'test/setup.ts',
            'test/fakes/fakeKVStore.ts',
            'test/handlers/flightbot.test.ts',
            'test/integration/commands.test.ts',
            'test/services/apiUsageTracker.test.ts',
            'test/services/fakeKVStore.test.ts',
            'test/services/flightMonitor.test.ts',
            'test/services/flightService.test.ts',
            'test/e2e/setup.ts',
            'test/e2e/coldStart.test.ts',
            'test/e2e/slashCommand.test.ts',
            'test/e2e/cronUpdate.test.ts',
            'test/e2e/restart.test.ts',
            'test/e2e/keepalive.test.ts',
            'test/e2e/helpers/boltTest.ts',
            'test/e2e/helpers/aeroapi.ts',
            'test/e2e/helpers/redis.ts',
            'test/e2e/fixtures/flights.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 25,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Test files use mocks that often involve `any` types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // expect(mock.method).toHaveBeenCalled() patterns require unbound methods
      '@typescript-eslint/unbound-method': 'off',
      // Non-null assertions are sometimes useful in tests for brevity
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Mock implementations often return promises in void contexts
      '@typescript-eslint/no-misused-promises': 'off',
    },
  }
);
