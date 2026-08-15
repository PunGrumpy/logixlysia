# Contributing

Thank you for your interest in contributing! This project is open-source and welcomes contributions of all kinds — bug reports, feature requests, documentation improvements, and code changes.

## Source Code

The source code is hosted on GitHub. The repository contains all source code, build scripts, tests, and documentation.

## Project Structure

This is a single-package project. The main layout is:

- `packages/createElogs` - The main Elogs package
  - `src/` - Core logger implementation for Elysia
  - `__tests__/` - Unit and integration tests
- `apps/docs` - Documentation website built with [Fumadocs](https://fumadocs.dev/) and Next.js
- `apps/elysia` - Playground demo (Bun + TypeScript + Swagger)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/<your-username>/<repo>.git`
3. Install dependencies: `bun install` (or `npm install` / `pnpm install` — match the lockfile)
4. Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run the local checks:
   - Type check: `bun run type-check`
   - Tests: `bun test`
   - Build: `bun run build`
7. Commit your changes with clear, descriptive messages
8. Push to your fork
9. Open a Pull Request

### Testing Your Changes Locally

To test a local build of this package on a sample project:

1. Build the package: `bun run build`
2. Pack it: `npm pack` (produces a `.tgz` file in the project root)
3. In your test project, install the tarball: `npm install /path/to/<package>-<version>.tgz`
4. Use the package in your test project to verify behavior

This matches the verification flow used by the `publish.yml` CI workflow.

## Pull Request Guidelines

- Ensure your PR addresses a specific issue or adds clear value
- Include a description of the changes and rationale
- Keep changes focused and atomic — one concern per PR
- Follow existing code style and conventions
- Include tests for bug fixes and new features
- Update documentation as needed
- Make sure all checks pass: type-check, test, build
- Write clear commit messages

## Code Style

- Match the existing style of the surrounding code
- Write clear, self-documenting code; add comments only for non-obvious logic
- Use meaningful variable and function names
- Avoid unrelated refactors in feature/bugfix PRs

## Reporting Issues

Use the GitHub issue tracker to report bugs:

- Check if the issue already exists before creating a new one
- Provide a clear description with a minimal reproduction
- Include relevant environment details (OS, runtime version, etc.)
- Apply the `bug` or `enhancement` label

For questions, ideas, or general discussion, open a GitHub Discussion.

## Code of Conduct

This project follows a Code of Conduct. By participating, you are expected to uphold it.

Thank you for contributing!
