# Contributing to Logixlysia

Thank you for your interest in contributing! Logixlysia is an open-source project, and contributions are welcome! Whether you want to improve the documentation, add new features, or contribute code, here's how you can get involved.

## Source Code

Logixlysia's source code is hosted on GitHub at [PunGrumpy/logixlysia](https://github.com/PunGrumpy/logixlysia). The repository contains all source code, build scripts, and documentation.

## Monorepo Structure

Logixlysia is a monorepo managed with bun workspaces and Turbo:

- `packages/logixlysia` - The main Logixlysia package
  - `src/` - Core logger implementation for Elysia
  - `__tests__/` - Unit and integration tests
- `packages/bench` - Benchmarks (vitest)
- `packages/video` - Video assets
- `packages/typescript-config` - Shared TypeScript configs
- `apps/docs` - Documentation website built with Blume
- `apps/elysia` - Playground demo (Bun + TypeScript + Swagger)

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/<your-username>/logixlysia.git`
3. Install dependencies: `bun install`
4. Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run the checks in [Verify your work](#verify-your-work)
7. Add a changeset if you changed `packages/logixlysia/` (see [Changesets](#changesets))
8. Commit your changes with a Conventional Commit message, for example `fix(output): handle empty log paths`
9. Push to your fork
10. Submit a Pull Request

### Testing Your Changes Locally

To test your local version of Logixlysia on a sample project:

1. Build the package: `cd packages/logixlysia && bun run build`
2. Link it locally: `bun link --global` (from `packages/logixlysia`)
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

This will start the Blume app on [http://localhost:3000](http://localhost:3000). Documentation content is in `apps/docs/content/`.

## Verify your work

Run these from the repository root before you open a pull request:

| What | Command | Expect |
| --- | --- | --- |
| Lint + format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | all pass (coverage is on by default) |
| Build | `bun run build` | `dist/` for every entry |

`bun run test` runs the tests through Turborepo and builds first. Use `cd packages/logixlysia && bun test` for the package on its own, because it enforces the coverage gate. Tests live in `packages/logixlysia/__tests__/<area>/*.test.ts`.

Public API changes must update the API snapshot: `cd packages/logixlysia && bun test --update-snapshots __tests__/api`.

Also check that your change works with different log levels and configurations, and think about backward compatibility for existing users. For manual QA, run `cd apps/elysia && bun run dev` (Swagger at `/swagger`).

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. Any change under `packages/logixlysia/` needs a changeset: a file named `.changeset/<slug>.md` with `'logixlysia': patch` or `'logixlysia': minor` in its front matter.

1. Run `bun changeset` in the root directory, or write the file by hand
2. Select `logixlysia` and choose the version bump
3. Write a clear description of your changes (this will appear in the changelog)
4. Commit the generated file in `.changeset/` with your changes

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), for example `fix(output): handle empty log paths`.

## Pull Request Guidelines

- Ensure your PR addresses a specific issue or adds value to the project
- Include a clear description of the changes and rationale
  - Example: "Add support for custom log formatters"
  - Example: "Fix issue with request ID logging in production"
- Keep changes focused and atomic
- Follow existing code style and conventions
- Include tests if applicable
- **Add a changeset if you changed anything under `packages/logixlysia/`**
- Update documentation as needed
- Ensure the checks in [Verify your work](#verify-your-work) pass
- Use Conventional Commit messages
- Keep consistency with the project's coding style

## Working in the Monorepo

### Running Commands

From the root directory:

- `bun run test` - Run all tests through Turborepo (builds first)
- `bun run build` - Build all packages
- `bun run lint` - Run linter on the codebase
- `bun run format` - Auto-fix linting and formatting issues
- `bun dev` - Start all development servers
- `bun run typecheck` - Run TypeScript type checking

From a specific package (e.g., `packages/logixlysia`):

- `bun test` - Run tests for that package only (coverage gate on)
- `bun run build` - Build that package only
- `bun dev` - Start development server for that package

### Package Dependencies

- Use `bun add <package>` to add dependencies to the root
- Use `bun add <package> --filter logixlysia` to add to the main package
- Use `bun add <package> --filter docs` to add to the docs site

## Code Style

- Run `bun run format` before committing to auto-format your code
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
