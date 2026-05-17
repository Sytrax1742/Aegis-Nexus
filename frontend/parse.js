const fs = require('fs');
const ts = require('typescript');

const fileContent = fs.readFileSync('src/app/page.tsx', 'utf8');
const sourceFile = ts.createSourceFile('page.tsx', fileContent, ts.ScriptTarget.Latest, true);

function visit(node) {
    // console.log(ts.SyntaxKind[node.kind], node.pos, node.end);
    ts.forEachChild(node, visit);
}

visit(sourceFile);
console.log("Parsed without throwing.");
