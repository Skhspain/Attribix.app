import {readFileSync, readdirSync, statSync} from "node:fs";
import {join, extname} from "node:path";

const ROOT = process.cwd();
const exts = new Set([".js",".jsx",".ts",".tsx"]);
function* walk(d){ for (const n of readdirSync(d)) {
  const p = join(d,n); const s = statSync(p);
  if (s.isDirectory()) yield* walk(p); else if (exts.has(extname(p))) yield p;
}}
const reObj = /\bexport\s+default\s+\{/m;
const reArr = /\bexport\s+default\s+\[/m;
const reCJS = /module\.exports\s*=\s*\{/m;

const hits=[];
for (const f of walk(join(ROOT,"app"))) {
  const t = readFileSync(f,"utf8");
  if (reObj.test(t)) hits.push({type:"DEFAULT_IS_OBJECT",file:f});
  if (reArr.test(t)) hits.push({type:"DEFAULT_IS_ARRAY",file:f});
  if (reCJS.test(t)) hits.push({type:"CJS_MODULE_EXPORTS_OBJECT",file:f});
}
if (hits.length===0) console.log("✅ No object/array/CJS default exports found.");
else { console.log("🔎 Suspicious defaults:");
  for (const h of hits) console.log("-",h.type.padEnd(28),h.file);
}
