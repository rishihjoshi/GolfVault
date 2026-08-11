module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Agent worktrees under .claude/ contain full repo copies, including their
  // own tests/ dir — without this, jest runs stale duplicates of every suite.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
};
