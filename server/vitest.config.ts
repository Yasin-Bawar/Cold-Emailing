import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: { ENCRYPTION_KEY: 'test-encryption-key-not-secret', ADMIN_PASSWORD: 'test-password', PUBLIC_URL: 'https://outreach.test', STORAGE_DIR: '.storage-test' },
  },
});
