// R Completion Companion
//
// Adds two completion providers without touching vscode-R:
//  1. Arguments of functions that exist only in the R session (e.g. loaded with source()).
//     Source: vscode-R's session signature help (vscode.executeSignatureHelpProvider). When the
//     signature comes from languageserver, it already offers the arguments, so nothing is added.
//  2. Folders and files inside string literals (folders first).
//
// Why: vscode-R's session items (detail "[session]") carry no sortText, so VS Code falls back to
// the label as the sort key and they get mixed with items from other providers. Items created
// here sort with a "!" prefix; an R name cannot start with "!", so they always stay on top.
//
// Scope: R, R Markdown and Quarto documents. For R cells, Quarto forwards completion to the R
// providers through a temporary virtual R document (.vdoc.<id>.r). Arguments are provided on
// that virtual document, paths on the real document (.qmd/.Rmd). This avoids duplicates and
// resolves paths against the workspace instead of the virtual document's temporary folder.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SESSION_SIGNATURE = 'Function in this R session'; // documentation of vscode-R's session signature
const TOP = '!';
const NAME = /^(\.\.\.|[\p{L}._][\p{L}\p{N}._]*)/u;

const isVirtualDocument = (document) => path.basename(document.uri.fsPath).startsWith('.vdoc.');

// In R code: returns the text between the opening quote and the cursor when the cursor is
// inside a string literal, otherwise null. Honours escapes and comments.
function stringPrefixInCode(linePrefix) {
  let quote = null, start = -1;
  for (let i = 0; i < linePrefix.length; i++) {
    const ch = linePrefix[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '#') return null;
    else if (ch === '"' || ch === "'" || ch === '`') { quote = ch; start = i + 1; }
  }
  return quote === '"' || quote === "'" ? linePrefix.slice(start) : null;
}

// In prose and YAML, apostrophes ("don't") break quote counting. Double quotes are checked
// first, then single quotes: an odd count means the cursor is inside the last one.
function stringPrefixInText(linePrefix) {
  for (const quote of ['"', "'"]) {
    if ((linePrefix.split(quote).length - 1) % 2 === 1) return linePrefix.slice(linePrefix.lastIndexOf(quote) + 1);
  }
  return null;
}

// Is the line inside a code chunk of an R Markdown / Quarto document?
function insideCodeChunk(document, line) {
  for (let i = line - 1; i >= 0; i--) {
    const text = document.lineAt(i).text;
    if (/^\s*(```+|~~~+)\s*\{/.test(text)) return true;
    if (/^\s*(```+|~~~+)\s*$/.test(text)) return false;
  }
  return false;
}

function stringPrefix(document, position) {
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  const isCode = document.languageId === 'r' || insideCodeChunk(document, position.line);
  return isCode ? stringPrefixInCode(linePrefix) : stringPrefixInText(linePrefix);
}

async function provideSessionArguments(document, position) {
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  if (stringPrefixInCode(linePrefix) !== null) return [];
  let help;
  try {
    help = await vscode.commands.executeCommand('vscode.executeSignatureHelpProvider', document.uri, position);
  } catch { return []; }
  const signature = help?.signatures?.[help.activeSignature ?? 0];
  const doc = typeof signature?.documentation === 'string' ? signature.documentation : signature?.documentation?.value;
  if (!signature || doc !== SESSION_SIGNATURE) return [];
  // Arguments already passed by name (on the same line) are not offered again
  const call = linePrefix.slice(linePrefix.lastIndexOf(`${signature.label.split('(')[0]}(`) + 1);
  const used = new Set([...call.matchAll(/([\p{L}._][\p{L}\p{N}._]*)\s*=(?!=)/gu)].map((m) => m[1]));
  return signature.parameters
    .map((p) => (typeof p.label === 'string' ? p.label : signature.label.slice(p.label[0], p.label[1])))
    .map((text) => NAME.exec(text.trim())?.[1])
    .filter((name) => name && !used.has(name))
    .map((name, i) => {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
      item.detail = 'parameter [session]';
      item.sortText = `${TOP}0-${String(i + 1).padStart(3, '0')}`;
      item.insertText = name === '...' ? '...' : `${name} = `;
      return item;
    });
}

function providePaths(document, position) {
  if (isVirtualDocument(document)) return [];
  const typed = stringPrefix(document, position);
  if (typed === null || /^[a-z]+:\/\//i.test(typed)) return [];
  const slash = typed.lastIndexOf('/');
  const dirPart = slash >= 0 ? typed.slice(0, slash + 1) : '';
  const namePart = typed.slice(slash + 1);
  // Relative paths resolve against the workspace root (the R terminal's working directory)
  const root = (vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0])?.uri.fsPath
    ?? path.dirname(document.uri.fsPath);
  const dir = dirPart.startsWith('~') ? path.join(os.homedir(), dirPart.slice(1))
    : path.isAbsolute(dirPart) ? dirPart : path.join(root, dirPart);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const range = new vscode.Range(position.translate(0, -namePart.length), position);
  return entries
    .filter((e) => namePart.startsWith('.') || !e.name.startsWith('.')) // hidden entries only after typing "."
    .map((e) => {
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) { try { isDir = fs.statSync(path.join(dir, e.name)).isDirectory(); } catch { /* broken link */ } }
      const item = new vscode.CompletionItem(isDir ? `${e.name}/` : e.name,
        isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
      item.insertText = e.name;
      item.filterText = e.name;
      item.range = range;
      item.sortText = `${TOP}${isDir ? 'd' : 'f'}${e.name.toLowerCase()}`;
      // Accepting a folder types "/": only providers triggered by "/" (this one) respond, so the
      // list continues with the folder's content and nothing else gets mixed in.
      if (isDir) item.command = { command: 'default:type', title: '', arguments: [{ text: '/' }] };
      return item;
    });
}

exports.activate = function (context) {
  const code = [{ language: 'r' }, { language: 'rmd' }];
  const documents = [...code, { language: 'quarto' }];
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(code, { provideCompletionItems: provideSessionArguments }),
    vscode.languages.registerCompletionItemProvider(documents, { provideCompletionItems: providePaths }, '/'),
  );
};
exports.deactivate = function () {};
