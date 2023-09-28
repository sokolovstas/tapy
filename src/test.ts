import pc from "picocolors";

export type TestVar = string | { [key: string]: TestVar };
export type TestVars = { [key: string]: TestVar };
export type TestCheck = string;

export interface TestStep extends TestSettings {
  post?: string;
  get?: string;
  put?: string;
  patch?: string;
  delete?: string;

  log?: string;

  body?: Record<string, TestVar>;
  json?: string;
  status?: number;
  check?: TestCheck[];
  eval?: string[];
}

export interface TestSettings {
  root?: string;
  _root?: string;
  vars?: TestVars;
  depends_on?: string[];
  headers?: TestVars;
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

function convertVars<K extends TestVar | TestVars | string>(v: K): K {
  if (typeof v === "string") {
    return taggedEvalInContext(v);
  }
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
      result = evalInContext(str);
    } catch (e) {
      //   console.error(e);
    }
  }
  return result;
}
function evalInContext(str: string) {
  return eval.call(this, "with(this.context){eval('" + str + "')}");
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
    console.log(pc.bgBlue(` - POST ${path}`));
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
  if (s.put) {
    const path = getUrl(s.put);
    console.log(pc.bgBlue(` - PUT ${path}`));
    const body = convertVars(s.body);
    response = await fetch(path, {
      method: "PUT",
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
    console.log(pc.bgBlue(` - GET ${path}`));
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
    console.log(pc.bgBlue(` - DELETE ${path}`));
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

  if (s.eval) {
    for (const e of s.eval) {
      evalInContext(e);
    }
  }

  if (s.json) {
    globalThis.context[s.json] = json;
  }

  if (s.log) {
    console.log(pc.blue(logEvalInContext(s.log)));
  }

  if (s.status) {
    if (response.status != s.status) {
      console.log(pc.red(JSON.stringify(json)));
      throw `Status code mismatch. Want ${s.status} recive ${response.status}`;
    }
  }

  await loadSettings(s);

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

export async function loadSettings(test: TestSettings) {
  if (test) {
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
}

export async function runTestFile(f: TestFile) {
  if (f.beforeAll) {
    console.log(pc.bgGreen(" - BEFORE ALL"));
    await runSteps(f.beforeAll);
  }
  if (f.steps) {
    console.log(pc.bgGreen(" - STEPS"));
    await runSteps(f.steps);
  }
  if (f.afterAll) {
    console.log(pc.bgGreen(" - AFTER ALL"));
    await runSteps(f.afterAll);
  }
}
export async function runCleanup(f: TestFile) {
  await runSteps(f.cleanup).catch((e) => {
    console.error(pc.bgRed(` - FAIL: ${e}`));
  });
}
