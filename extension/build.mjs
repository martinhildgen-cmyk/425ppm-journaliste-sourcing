import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const commonOptions = {
  bundle: true,
  sourcemap: true,
  target: "chrome120",
  format: "esm",
};

const entryPoints = [
  {
    entryPoints: ["src/content.ts"],
    outfile: "content.js",
    // Content scripts cannot use ES modules — use IIFE
    format: "iife",
  },
  {
    entryPoints: ["src/background.ts"],
    outfile: "background.js",
    format: "esm",
  },
  {
    entryPoints: ["src/sidepanel.ts"],
    outfile: "sidepanel.js",
    // Side panel loaded via <script> tag — use IIFE
    format: "iife",
  },
];

for (const entry of entryPoints) {
  const options = {
    ...commonOptions,
    ...entry,
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log(`Watching ${entry.entryPoints[0]}...`);
  } else {
    await esbuild.build(options);
    console.log(`Built ${entry.outfile}`);
  }
}

if (!watch) {
  console.log("Extension build complete.");
}
