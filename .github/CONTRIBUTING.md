# Contributing to Logixlysia

Thank you for your interest in contributing! Logixlysia is an open-source project, and contributions are welcome! Whether you want to improve the documentation, add new features, or contribute code, here's how you can get involved.

## Source Code

Logixlysia's source code is hosted on GitHub at [PunGrumpy/logixlysia](https://github.com/PunGrumpy/logixlysia). The repository contains all source code, build scripts, and documentation.

## Monorepo Structure

Logixlysia is a monorepo managed with bun workspaces and Turbo:

- `packages/cli` - The main Logixlysia package
  - `src/` - Core logger implementation for Elysia
  - `__tests__/` - Test files
- `apps/docs` - Documentation website built with [Fumadocs](https://fumadocs.dev/) and Next.js
- `apps/elysia` - Example Elysia application
- `apps/elysia-node` - Example Elysia application with Node.js

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/<your-username>/logixlysia.git`
3. Install dependencies: `bun install`
4. Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run tests: `bun test`
7. Build packages: `bun run build`
8. Commit your changes with clear, descriptive commit messages
9. Push to your fork
10. Submit a Pull Request

### Testing Your Changes Locally

To test your local version of Logixlysia on a sample project:

1. Build the package: `cd packages/cli && bun run build`
2. Link it locally: `bun link --global` (from `packages/cli`)
3. In your test project: `bun link --global logixlysia`
4. Import and use Logixlysia in your Elysia app to test your changes
5. Alternatively, use `npm pack` to create a tarball and install it in your test project

### Editing Documentation

To work on the documentation site:

```bash
cd apps/docs
bun install
bun dev
```

This will start the Fumadocs app on [http://localhost:3000](http://localhost:3000). Documentation content is in `apps/docs/content/`.

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. When you make changes that should be released, you need to create a changeset:

1. Run `bun changeset` in the root directory
2. Select the packages you've changed (use space to select, enter to confirm)
3. Choose the appropriate version bump:
   - `patch` - Bug fixes and minor changes
   - `minor` - New features that don't break existing functionality
   - `major` - Breaking changes
4. Write a clear description of your changes (this will appear in the changelog)
5. Commit the generated changeset file in `.changeset/` with your changes

**When to create a changeset:**
- Bug fixes
- New features
- Breaking changes
- Performance improvements
- Documentation updates that affect usage

**When NOT to create a changeset:**
- Internal refactoring with no user-facing changes
- Test updates
- Build configuration changes
- README or contributing guide updates

## Testing Your Changes

When making changes to the logger:

1. Test on various Elysia applications to ensure compatibility
2. Run the test suite: `bun test`
3. Test with different log levels and configurations
4. Consider backward compatibility - will this break existing users' workflows?
5. Run `bun lint` and `bun format` to ensure code quality
6. Test with the example apps in `apps/elysia` and `apps/elysia-node`

## Pull Request Guidelines

- Ensure your PR addresses a specific issue or adds value to the project
- Include a clear description of the changes and rationale
  - Example: "Add support for custom log formatters"
  - Example: "Fix issue with request ID logging in production"
- Keep changes focused and atomic
- Follow existing code style and conventions
- Include tests if applicable
- **Add a changeset if your changes affect the published package**
- Update documentation as needed
- Ensure all tests pass: `bun test`
- Write clear commit messages
- Keep consistency with the project's coding style

## Working in the Monorepo

### Running Commands

From the root directory:
- `bun test` - Run all tests across all packages
- `bun run build` - Build all packages
- `bun lint` - Run linter on the codebase
- `bun format` - Auto-fix linting and formatting issues
- `bun dev` - Start all development servers
- `bun typecheck` - Run TypeScript type checking

From a specific package (e.g., `packages/cli`):
- `bun test` - Run tests for that package only
- `bun run build` - Build that package only
- `bun dev` - Start development server for that package

### Package Dependencies

- Use `bun add <package>` to add dependencies to the root
- Use `bun add <package> --filter logixlysia` to add to the main package
- Use `bun add <package> --filter docs` to add to the docs site

## Code Style

- Run `bun format` before committing to auto-format your code
- Write clear, self-documenting code
- Add comments only when necessary to explain complex logic
- Use meaningful variable and function names
- Follow TypeScript best practices (the linter will guide you)

## Reporting Issues and Discussions

### Bugs and Issues

Use the GitHub [issue tracker](https://github.com/PunGrumpy/logixlysia/issues) to report bugs:

- Check if the issue already exists before creating a new one
- Provide a clear description with examples
- Include steps to reproduce if applicable
- Add relevant labels

### Feature Requests and Discussions

For potential changes, feature requests, or general discussions (e.g., "Logixlysia should support...", or "It would be great if..."), please open a [discussion](https://github.com/PunGrumpy/logixlysia/discussions).

### Questions or Need Help?

Feel free to open an issue for questions or join our discussions. We're here to help!

## Code of Conduct

Please note that this project follows a Code of Conduct. By participating, you are expected to uphold this code.

Thank you for contributing!