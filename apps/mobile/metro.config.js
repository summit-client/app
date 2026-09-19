// Learn more https://docs.expo.dev/guides/monorepo
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Resolve `@supabase/supabase-js` to its CommonJS build.
 *
 * Its ESM build reaches for OpenTelemetry through `import(OTEL_PKG)` - a
 * dynamic import whose specifier is a variable. Metro cannot resolve that
 * statically, so it passes the expression through untouched and Hermes then
 * refuses to compile it ("Invalid expression encountered"), failing
 * `expo export` outright. The CommonJS build does the same thing with
 * `require(s)`, which Hermes accepts. Turning package exports off for this one
 * package falls resolution back to its "main" field, which is that build.
 *
 * The monorepo itself needs no configuration here: Metro already resolves
 * through pnpm's symlinks and the workspace root on its own, so no
 * watchFolders or nodeModulesPaths are set.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@supabase/supabase-js") {
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
