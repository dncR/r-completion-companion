# Changelog

## 1.1.0 - 2026-11-17

- Members after `$` and `@` (data frame columns, list elements, S4 slots) are offered when the
  list is opened by hand or while typing the member name. vscode-R offers them only at the moment
  `$` / `@` is typed; opening the list again showed the global environment instead.
- Fixed: accepting a folder continued with its content only at the first level. From the second
  level on `/` was not typed and the list did not reopen ("Actual command not found" in the
  extension host log).

## 1.0.0 - 2026-11-16

- Arguments of functions that exist only in the R session are offered at the top of the
  completion list. Nothing is added when languageserver already provides the arguments.
- Folders and files are listed first inside string literals, before session objects. Accepting a
  folder types `/` and continues with the folder's content.
- Works in `.R` files and in R chunks of R Markdown and Quarto documents.
