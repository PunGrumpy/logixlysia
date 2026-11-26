// A shell that exports these changes what chalk and the color checks decide,
// in this process and in every child a test spawns.
delete process.env.FORCE_COLOR
delete process.env.NO_COLOR
