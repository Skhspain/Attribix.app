import {readFileSync, readdirSync, statSync} from "node:fs";
import {join, extname} from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT,"app");
const okExt = new Set([".js",".jsx",".ts",".tsx"]);

function* walk(d){for (const n of readdirSync(d)){const p=join(d,n);const s=statSync(p);
  if (s.isDirectory()) yield* walk(p); else if (okExt.has(extname(p))) yield p;}}

const reDefaultName = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\b/;
const reFuncDecl    = (name) => new RegExp(`\\bfunction\\s+${name}\\b`);
const reClassDecl   = (name) => new RegExp(`\\bclass\\s+${name}\\b`);
const reArrowDecl   = (name) => new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\(?[A-Za-z0-9_,\\s]*\\)?\\s*=>`);
const reObjDecl     = (name) => new RegExp(`\\b(const|let|var)\\s+${name}\\s*=\\s*\\{`);
const reArrDecl     = (name) => new RegExp(`\\b(const|let|var)\\s+${name}\\s*=\\s*\\[`);

const issues=[];
for (const f of walk(APP)) {
  const t = readFileSync(f,"utf8");
  const m = t.match(reDefaultName);
  if (!m) continue;
  const name = m[1];
  const isComponent = reFuncDecl(name).test(t) || reClassDecl(name).test(t) || reArrowDecl(name).test(t);
  if (!isComponent) {
    let kind="UNKNOWN_DEFAULT";
    if (reObjDecl(name).test(t)) kind="DEFAULT_IS_OBJECT_VAR";
    if (reArrDecl(name).test(t)) kind="DEFAULT_IS_ARRAY_VAR";
    issues.push({file:f, kind, name});
  }
}

if (issues.length===0) console.log("✅ All named default exports look like components.");
else {
  console.log("🔎 Non-component default exports:");
  for (const i of issues) console.log("-", i.kind.padEnd(24), i.file, "→", i.name);
}
