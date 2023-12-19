#! /usr/bin/env node

import { readFile, stat } from "fs/promises";
import { glob } from "glob";
import { Graph } from "graph-data-structure";
import { dirname, join, relative, resolve } from "path";
import pc from "picocolors";
import { parse } from "yaml";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  TestFile,
  TestSettings,
  loadSettings,
  runCleanup,
  runTestFile,
} from "./test.js";

const yargv = await yargs(hideBin(process.argv))
  .usage("Usage: yapi <options> <path>")
  .option("pause-cleanup", {
    alias: "p",
    type: "boolean",
    description: "Pause before cleanup run",
  })
  .option("help", {
    alias: "h",
    type: "boolean",
    description: "Show help",
  })
  .parserConfiguration({ "unknown-options-as-args": true });

const args = await yargv.parse();

const folder = args._[args._.length - 1];
const testsFolder = resolve(folder.toString());

try {
  if (!(await stat(testsFolder)).isDirectory()) {
    yargv.showHelp();
  }
} catch {}

const jsfiles = await glob(testsFolder + "/**/*.yaml", {
  ignore: "node_modules/**",
});
var graph = Graph();
for (const path of jsfiles) {
  const rel = relative(testsFolder, path);
  graph.addNode(rel);
}
const roots: Record<string, TestFile> = {};
for (const path of jsfiles) {
  const file = await readFile(path, "utf-8");
  const test = parse(file) as TestFile;

  const rootFileName = join(dirname(path), "root.yaml");

  if (!roots[rootFileName]) {
    const exist = await stat(rootFileName).catch(() => null);

    if (exist) {
      const root = await readFile(rootFileName, "utf-8");
      const rootTestFile = parse(root) as TestFile;
      roots[rootFileName] = rootTestFile;
    }
  }

  for (const dep of test.depends_on || []) {
    const depFile = resolve(join(testsFolder, dep + ".yaml"));
    const rel = relative(testsFolder, path);
    const depRel = relative(testsFolder, depFile);
    graph.addEdge(depRel, rel);
  }
}

const optionsMap: Record<string, TestSettings> = {};

console.log(pc.bgCyan(` - RUN IN TOPOLOGICAL SORT`));
console.log(pc.cyan(graph.topologicalSort().join(" -> ")));
let throwed = false;
for (const path of graph.topologicalSort()) {
  const filePath = join(testsFolder, path);
  const file = await readFile(filePath, "utf-8");
  const testFile = parse(file) as TestFile;

  const rootFileName = join(dirname(filePath), "root.yaml");
  if (roots[rootFileName]) {
    await loadSettings(roots[rootFileName]);
  }

  await loadSettings(optionsMap[path]);
  await loadSettings(testFile);

  console.log(pc.bgGreen(` - RUN FILE ${path}`));
  for (const child of graph.depthFirstSearch([path])) {
    optionsMap[child] = {
      vars: { ...optionsMap[child]?.vars, ...testFile.vars },
      headers: { ...optionsMap[child]?.headers, ...testFile.headers },
    };
  }
  await runTestFile(testFile).catch((e) => {
    console.error(pc.bgRed(` - FAIL: ${e}`));
    throwed = true;
  });
  if (throwed) {
    break;
  }
}
if (args.pauseCleanup) {
  console.log(
    pc.bgMagenta(`PAUSED BEFORE CLEANUP > Press any key to continue`)
  );
  process.stdin.setRawMode(true);
  await new Promise((resolve) =>
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      resolve(null);
    })
  );
}

for (const path of graph.topologicalSort().reverse()) {
  const filePath = join(testsFolder, path);
  const file = await readFile(filePath, "utf-8");
  const testFile = parse(file) as TestFile;

  const rootFileName = join(dirname(filePath), "root.yaml");
  if (roots[rootFileName]) {
    await loadSettings(roots[rootFileName]);
  }

  await loadSettings(optionsMap[path]);
  await loadSettings(testFile);

  if (testFile.cleanup) {
    console.log(pc.bgGreen(` - CLEANUP ${path}`));
    await runCleanup(testFile).catch((e) => {
      console.error(pc.bgRed(` - FAIL: ${e}`));
    });
  }
}

if (throwed) {
  process.exit(1);
}
