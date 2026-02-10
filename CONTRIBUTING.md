# Contributing to caldav-mcp

Thank you for contributing to caldav-mcp! This guide will help you get started.

## Development Setup

1. **Prerequisites**: Node.js >= 18.0.0, npm >= 9.0.0
2. **Clone and install**:
   ```bash
   git clone https://github.com/dominik1001/caldav-mcp.git
   cd caldav-mcp
   npm install
   ```
3. **Configure environment**: Copy `.env.example` to `.env` and add credentials
4. **Build**: `npm run build`
5. **Verify**: `node dist/index.js` should connect without errors

## Development Workflow

### Making Changes
1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes in `src/`
3. Write/update tests in `src/tools/*.test.ts`
4. Validate your changes: `npm run validate`
5. Commit with conventional format (see below)

### Running Tests
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode for TDD
- `npm run test:coverage` - Check coverage (aim for >70%)

### Code Quality
- Pre-commit hooks automatically run ESLint and Prettier
- Use `npm run lint:fix` to auto-fix issues
- Use `npm run format` to format code
- Run `npm run validate` before pushing

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `docs:` - Documentation only
- `test:` - Test additions/changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `BREAKING CHANGE:` - Breaking changes (major version bump)

**Examples:**
```
feat: add support for recurring events
fix: handle HTTP 204 in delete-event
docs: update CLAUDE.md with new scripts
test: add tests for create-event tool
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`
3. **Make changes** following guidelines above
4. **Run validation**: `npm run validate` (must pass)
5. **Push** to your fork
6. **Create PR** with clear description
7. **Wait for CI** - All checks must pass (lint, format, tests)
8. **Address feedback** if requested

## Testing Guidelines

- **Write tests for new features**: Add tests alongside new code
- **Mock external dependencies**: Use Vitest mocks for CalDAVClient
- **Test error cases**: Include happy path and error scenarios
- **Follow existing patterns**: See `list-events.test.ts` and `delete-event.test.ts`

**Example test structure:**
```typescript
import { describe, test, expect, vi } from "vitest";
import { CalDAVClient } from "ts-caldav";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("registerYourTool", () => {
  test("successfully handles valid input", async () => {
    const mockClient = {
      yourMethod: vi.fn().mockResolvedValue({ ... }),
    };
    // ... test implementation
  });

  test("handles errors gracefully", async () => {
    const mockClient = {
      yourMethod: vi.fn().mockRejectedValue(new Error("Test error")),
    };
    // ... test error handling
  });
});
```

## Code Style

- **TypeScript strict mode** - Required
- **ESLint + Prettier** - Enforced via pre-commit hooks
- **No `any` types** - Use proper typing
- **Error handling** - Always wrap async operations in try-catch
- **Descriptive names** - Clear function and variable names

## Release Process

Releases are fully automated via semantic-release:

1. **Merge to main** triggers CI/CD
2. **semantic-release** analyzes commit messages
3. **Version bumped** based on conventional commits
4. **CHANGELOG.md** automatically updated
5. **NPM package** published
6. **GitHub release** created with notes

**You don't need to manually version or release!**

## Questions or Issues?

- **Bug reports**: [GitHub Issues](https://github.com/dominik1001/caldav-mcp/issues)
- **Questions**: [GitHub Discussions](https://github.com/dominik1001/caldav-mcp/discussions)
- **Security issues**: See SECURITY.md

Thank you for contributing! 🎉
