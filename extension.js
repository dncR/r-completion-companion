// R Completion Companion
//
// Adds three completion providers without touching vscode-R:
//  1. Arguments of functions that exist only in the R session (e.g. loaded with source()).
//     Source: vscode-R's session signature help (vscode.executeSignatureHelpProvider). When the
//     signature comes from languageserver, it already offers the arguments, so nothing is added.
//  2. Folders and files inside string literals (folders first).
//  3. Members after "$" / "@" (data frame columns, list elements, S4 slots) when completion is
//     invoked by hand or by typing a name. vscode-R offers them only at the moment "$" / "@" is
//     typed; once that list is gone (closed, or missed because the next letter came before R
//     answered) it falls back to the global environment.
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
const SESSION_DETAIL = '[session]'; // detail of vscode-R's session completion items
const CONTINUE_PATH = 'rCompletionCompanion.continuePath';
const TOP = '!';
const NAME = /^(\.\.\.|[\p{L}._][\p{L}\p{N}._]*)/u;
// "$" or "@" followed by the part of the member name typed so far, right before the cursor
const MEMBER = /([$@])((?:[\p{L}.][\p{L}\p{N}._]*)?)$/u;
const isMemberTrigger = (context) => context?.triggerCharacter === '$' || context?.triggerCharacter === '@';

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

async function provideSessionArguments(document, position, token, context) {
  if (isMemberTrigger(context)) return [];
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  if (stringPrefixInCode(linePrefix) !== null || MEMBER.test(linePrefix)) return [];
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

// vscode-R answers "$" / "@" only when the request carries that trigger character. For every
// other request the same question is asked on its behalf (at the position right after the
// operator) and its session items are offered again, on top and in their original order.
async function provideMembers(document, position, token, context) {
  if (isMemberTrigger(context)) return []; // vscode-R answers these itself; also ends the nested request below
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  if (stringPrefixInCode(linePrefix) !== null) return [];
  const match = MEMBER.exec(linePrefix);
  if (!match) return [];
  const afterOperator = position.translate(0, -match[2].length);
  let list;
  try {
    list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, afterOperator, match[1]);
  } catch { return []; }
  if (token?.isCancellationRequested) return [];
  const range = new vscode.Range(afterOperator, position);
  return (list?.items ?? [])
    .filter((source) => source.detail === SESSION_DETAIL)
    .map((source, i) => {
      const label = typeof source.label === 'string' ? source.label : source.label.label;
      const item = new vscode.CompletionItem(label, source.kind);
      item.detail = source.detail;
      item.documentation = source.documentation;
      item.insertText = typeof source.insertText === 'string' ? source.insertText : label;
      item.filterText = label;
      item.range = range;
      item.sortText = `${TOP}${source.sortText ?? String(i).padStart(5, '0')}`;
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
      if (isDir) item.command = { command: CONTINUE_PATH, title: '' };
      return item;
    });
}

exports.activate = function (context) {
  const code = [{ language: 'r' }, { language: 'rmd' }];
  const documents = [...code, { language: 'quarto' }];
  context.subscriptions.push(
    // Types "/" after a folder was accepted. Up to 1.0.0 the folder items carried
    // `default:type` with its argument directly. VS Code keeps a command that has arguments in
    // a cache that belongs to the completion list and releases the lists once the accepted
    // item's command has finished. The "/" typed by that command opened the next list while
    // the command was still running, so that list was released as well and its folders failed
    // with "Actual command not found": only the first folder level continued. This command
    // has no arguments (nothing to cache) and types "/" after it has returned.
    vscode.commands.registerCommand(CONTINUE_PATH, () => {
      setTimeout(() => vscode.commands.executeCommand('default:type', { text: '/' }), 0);
    }),
    vscode.languages.registerCompletionItemProvider(code, { provideCompletionItems: provideSessionArguments }),
    vscode.languages.registerCompletionItemProvider(code, { provideCompletionItems: provideMembers }),
    vscode.languages.registerCompletionItemProvider(documents, { provideCompletionItems: providePaths }, '/'),
  );
};
exports.deactivate = function () {};
