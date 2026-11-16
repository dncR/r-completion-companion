# Changelog

## 1.0.0 - 2026-11-16

- Arguments of functions that exist only in the R session are offered at the top of the
  completion list. Nothing is added when languageserver already provides the arguments.
- Folders and files are listed first inside string literals, before session objects. Accepting a
  folder types `/` and continues with the folder's content.
- Works in `.R` files and in R chunks of R Markdown and Quarto documents.
