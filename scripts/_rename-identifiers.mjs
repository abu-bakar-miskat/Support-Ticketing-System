import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import ts from "typescript";

const files = execSync(
  "grep -rEli \"team\" src scripts --include='*.ts' --include='*.tsx'",
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.includes("src/generated"));

// Case-preserving rename applied ONLY to identifier tokens.
function rename(text) {
  return text
    .replace(/TEAM/g, "SUB_DEPARTMENT")
    .replace(/Team/g, "SubDepartment")
    .replace(/team/g, "subDepartment");
}

let filesChanged = 0;
let edits = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);

  const replacements = []; // { start, end, text }
  const visit = (node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const t = node.text;
      if (/team/i.test(t)) {
        const nt = rename(t);
        if (nt !== t) {
          replacements.push({ start: node.getStart(sf), end: node.getEnd(), text: nt });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (replacements.length === 0) continue;
  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }
  writeFileSync(file, out);
  filesChanged++;
  edits += replacements.length;
}
console.log(`renamed ${edits} identifier tokens across ${filesChanged} files`);
