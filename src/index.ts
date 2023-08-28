#! /usr/bin/env node

import chalk from "chalk";
import { readFile } from "fs/promises";
import { glob } from "glob";
import { Graph } from "graph-data-structure";
import { join, relative, resolve } from "path";
import { parse } from "yaml";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const args = await yargs(hideBin(process.argv))
  .usage("Usage: yapi <path>")
  .help().argv;

const testsFolder = resolve(args._[0].toString());

export type TestVar = string | { [key: string]: TestVar };
export type TestVars = { [key: string]: TestVar };
export type TestCheck = string;

export interface TestStep extends TestSettings {
  post: string;
  log: string;
  get: string;
  delete: string;
  body: Record<string, TestVar>;
  json: string;
  status: number;
  check: TestCheck[];
}

export interface TestSettings {
  root: string;
  vars: TestVars;
  depends_on: string[];
  headers: TestVars;
}

export interface TestFile extends TestSettings {
  beforeAll: TestStep[];
  afterAll: TestStep[];
  cleanup: TestStep[];
  steps: TestStep[];
}

let context: Record<string, any> = {};
globalThis.context = context;

context.$makeAlphaId = (length) => {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

let headers: Record<string, any> = {};

let root: string = "";

function convertVars<K extends TestVar | TestVars>(v: K): K {
  for (const key in v as TestVars) {
    if (typeof v[key] === "object") {
      convertVars(v[key]);
    }
    if (typeof v[key] === "string") {
      v[key] = taggedEvalInContext(v[key] as string);
    }
  }
  return v;
}
function setVars(v: TestVars) {
  context = globalThis.context = { ...context, ...v };
}
function taggedEvalInContext(str: string) {
  let result = eval.call(this, "with(this.context){`" + str + "`}");
  if (result === str) {
    try {
      result = eval.call(this, "with(this.context){eval('" + str + "')}");
    } catch {}
  }
  return result;
}
function logEvalInContext(str: string) {
  let result = eval.call(
    this,
    "with(this.context){JSON.stringify(" + str + ")}"
  );
  return result;
}
function getUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return taggedEvalInContext(url);
  } else {
    return taggedEvalInContext(root + url);
  }
}

async function runStep(s: TestStep) {
  let response: Response = null;
  let json = {};
  if (s.post) {
    const path = getUrl(s.post);
    console.log(chalk.bgBlue("  ", `- POST ${path}`));
    const body = convertVars(s.body);
    response = await fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: headers,
    });
    try {
      json = await response.json();
      globalThis.context.json = json;
    } catch {
      globalThis.context.json = {};
    }
  }
  if (s.get) {
    const path = getUrl(s.get);
    console.log(chalk.bgBlue("  ", `- GET ${path}`));
    response = await fetch(path, {
      method: "GET",
      headers: headers,
    });
    try {
      json = await response.json();
      globalThis.context.json = json;
    } catch {
      globalThis.context.json = {};
    }
  }
  if (s.delete) {
    const path = getUrl(s.delete);
    console.log(chalk.bgBlue("  ", `- DELETE ${path}`));
    response = await fetch(path, {
      method: "DELETE",
      headers: headers,
    });
    try {
      json = await response.json();
      globalThis.context.json = json;
    } catch {
      globalThis.context.json = {};
    }
  }

  await loadSettings(s);

  if (s.json) {
    globalThis.context[s.json] = json;
  }

  if (s.log) {
    console.log(chalk.blue(logEvalInContext(s.log)));
  }

  if (s.status) {
    if (response.status != s.status) {
      console.log(chalk.red(JSON.stringify(json)));
      throw `Status code mismatch. Want ${s.status} recive ${response.status}`;
    }
  }
  if (s.check) {
    for (const c of s.check) {
      if (taggedEvalInContext(c) !== true) {
        throw `Check failed: ${c}. Recive ${taggedEvalInContext(c)}`;
      }
    }
  }
}

async function runSteps(s: TestStep[]) {
  for (const step of s) {
    await runStep(step);
  }
}

async function loadSettings(test: TestSettings) {
  if (test.vars) {
    setVars(convertVars(test.vars));
  }
  if (test.headers) {
    headers = { ...headers, ...convertVars(test.headers) };
  }
  if (test.root) {
    root = test.root;
  }
}
async function runTestFile(f: TestFile) {
  if (f.beforeAll) {
    console.log(chalk.bgGreen("  ", "- BEFORE ALL"));
    await runSteps(f.beforeAll);
  }
  if (f.steps) {
    console.log(chalk.bgGreen("  ", "- STEPS"));
    await runSteps(f.steps);
  }
  if (f.afterAll) {
    console.log(chalk.bgGreen("  ", "- AFTER ALL"));
    await runSteps(f.afterAll);
  }
}
async function runCleanup(f: TestFile) {
  await runSteps(f.cleanup).catch((e) => {
    console.error(chalk.bgRedBright(` - FAIL: ${e}`));
  });
}

const jsfiles = await glob(testsFolder + "/**/*.yaml", {
  ignore: "node_modules/**",
});
var graph = Graph();
for (const path of jsfiles) {
  const rel = relative(testsFolder, path);
  graph.addNode(rel);
}
for (const path of jsfiles) {
  const file = await readFile(path, "utf-8");
  const test = parse(file) as TestFile;

  for (const dep of test.depends_on || []) {
    const depFile = resolve(join(testsFolder, dep + ".yaml"));
    const rel = relative(testsFolder, path);
    const depRel = relative(testsFolder, depFile);
    console.log(depRel, rel);
    graph.addEdge(depRel, rel);
  }
}

console.log(graph.topologicalSort());

for (const path of graph.topologicalSort()) {
  const file = await readFile(join(testsFolder, path), "utf-8");
  const testFile = parse(file) as TestFile;

  await loadSettings(testFile);
  console.log(chalk.bgGreen(` - RUN FILE ${path}`));
  await runTestFile(testFile).catch((e) => {
    console.error(chalk.bgRedBright(` - FAIL: ${e}`));
  });
}

for (const path of graph.topologicalSort().reverse()) {
  const file = await readFile(join(testsFolder, path), "utf-8");
  const testFile = parse(file) as TestFile;

  if (testFile.cleanup) {
    console.log(chalk.bgGreen(` - CLEANUP ${path}`));
    await runCleanup(testFile).catch((e) => {
      console.error(chalk.bgRedBright(` - FAIL: ${e}`));
    });
  }
}
