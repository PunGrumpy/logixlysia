// A shell that exports these changes what chalk and the color checks decide.
// Bun starts a child with the environment the process began with, so a test
// that spawns one passes `env: process.env` to hand it this cleaned copy.
delete process.env.FORCE_COLOR
delete process.env.NO_COLOR
