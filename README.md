# R Completion Companion

*[Türkçe](README.tr.md)*

A small VS Code extension that fixes the order of the completion list in R, R Markdown and
Quarto documents when you work with [vscode-R](https://github.com/REditorSupport/vscode-R) and
an attached R session. It does not modify vscode-R, languageserver or Quarto; it only adds two
completion providers.

## What it does

**1. Arguments of session functions come first.** For a function that exists only in the R
session (for example one loaded with `source()` from outside the workspace), the arguments are
offered at the top of the list. Without the extension they are not offered at all.

```r
source("~/toolkit/functions.R")   # defines init_variable_info(data, from, max_levels, ...)
init_variable_info(|)
```

| | Completion list at `\|` |
|---|---|
| Before | `%\|\|%`, `a`, `b`, `df`, `init_variable_info`, … |
| After | `data`, `from`, `max_levels`, `decimal`, `locale`, then session objects |

If languageserver already knows the function (package, current document or a workspace file),
nothing is added, so arguments never appear twice.

**2. Folders and files come first inside strings.** Inside quotes, folders are listed first,
then files, then the session objects.

```r
readRDS("|")
```

| | Completion list at `\|` |
|---|---|
| Before | `%\|\|%`, `R/`, `data/`, `df`, `README.md`, `init_variable_info`, … |
| After | `data/`, `R/`, `report/`, `README.md`, then `df`, `init_variable_info`, … |

Relative paths resolve against the workspace root. Accepting a folder types `/` and the list
continues with that folder's content. Hidden entries show up after typing `.`.

Both features work in `.R` files and inside R chunks of `.Rmd` and `.qmd` documents.

## Why it is needed

vscode-R adds the objects of the attached session (detail `[session]`) to the completion list
without a `sortText`. VS Code then uses the label as the sort key, while other providers use
their own keys: languageserver uses `0-001…` for arguments, path extensions use keys such as
`d`/`f`. The result is an order like `%||%` < `0-…` < `d` < `df` < `f`, so session objects end
up above function arguments and between folders and files.

In addition, languageserver does not follow `source()` to files outside the workspace, and
vscode-R knows the signature of session functions (it shows it as signature help) but does not
offer their arguments as completions.

The extension sorts its own items with a `!` prefix. An R name cannot start with `!`, so these
items always stay above the session objects.

## Requirements

- [vscode-R](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r) with the
  session watcher enabled and an attached R session (needed for the argument feature).
- The R package `languageserver`.
- Optional: the [Quarto](https://marketplace.visualstudio.com/items?itemName=quarto.quarto)
  extension for `.qmd`/`.Rmd` documents.

## Installation

The extension is not on the Marketplace. Download the `.vsix` from the
[releases page](https://github.com/dncR/r-completion-companion/releases) or build it yourself:

```sh
git clone https://github.com/dncR/r-completion-companion.git
cd r-completion-companion
npx @vscode/vsce package
code --install-extension r-completion-companion-1.0.0.vsix
```

Reload the VS Code window afterwards.

## Settings

**Path Autocomplete.** If you use
[Path Autocomplete](https://marketplace.visualstudio.com/items?itemName=ionutvmi.path-autocomplete)
(or a similar path extension), turn it off for these three languages; otherwise every path is
listed twice. In `settings.json`:

```jsonc
"[r]":      { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" },
"[rmd]":    { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" },
"[quarto]": { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" }
```

The `.vdoc.*` parts cover the virtual documents Quarto uses for R cells; a plain `**` does not
match them because their names start with a dot. Other languages are not affected.

**Opening the list with Tab (optional).** The list opens with the usual trigger
(`Ctrl+Space`) or while typing. To open it with `Tab`, add this to `keybindings.json`:

```json
{
  "key": "tab",
  "command": "editor.action.triggerSuggest",
  "when": "editorTextFocus && editorLangId =~ /^(r|rmd|quarto)$/ && !editorHasSelection && !suggestWidgetVisible && !inlineSuggestionVisible && !inSnippetMode && !editorReadonly && !editorTabMovesFocus"
}
```

## How it works in Quarto and R Markdown

For R cells, Quarto forwards completion requests to the R providers through a temporary virtual
R document (`.vdoc.<id>.r`). The extension therefore splits its work:

- Arguments are provided on the virtual document, where vscode-R's session signature help is
  available.
- Paths are provided on the real document (`.qmd`/`.Rmd`) and skipped on virtual documents, so
  they resolve against the workspace and not against Quarto's temporary folder.

Outside code chunks (YAML header, prose), path completion inside quotes comes from this
extension as well, since the path extension is turned off for these languages.

## Limitations

- The extension cannot reorder items of other providers. If the global environment contains an
  object whose name starts with `%` (for example a user-defined `%||%`), it still sorts above
  the arguments of functions languageserver knows (such as `lm()`). Avoid defining such
  operators in the global environment; `%||%` is part of base R since 4.4.
- The order applies when the list is opened without a typed prefix. While typing, VS Code ranks
  by match score first and uses the sort key only for ties.
- The path provider is intentionally simple. It has no path mappings or aliases.
- The argument feature depends on two implementation details: the documentation string of
  vscode-R's session signature (`Function in this R session`) and the `.vdoc.` prefix of
  Quarto's virtual documents. If a future release changes them, the feature stops working
  until the extension is updated.

## Tested with

VS Code 1.146, vscode-R 3.4.0, languageserver 0.3.20, Quarto extension 1.139.0, Path
Autocomplete 1.26.0, R 4.6.1 on macOS. Behaviour was checked in an isolated VS Code instance
with a live R session, in `.R` files and in R chunks of `.qmd` and `.Rmd` documents (opened both
as Quarto and as R Markdown).

## Uninstall

```sh
code --uninstall-extension local.r-completion-companion
```

Then remove the `path-autocomplete.ignoredFilesPattern` lines from `settings.json`.

## License

[MIT](LICENSE)
