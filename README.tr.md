# R Completion Companion

*[English](README.md)*

[vscode-R](https://github.com/REditorSupport/vscode-R) ve bağlı bir R oturumuyla çalışırken R,
R Markdown ve Quarto belgelerinde tamamlama listesinin sırasını düzelten küçük bir VS Code
eklentisi. vscode-R, languageserver ve Quarto eklentilerine dokunmaz; yalnızca üç tamamlama
sağlayıcısı ekler.

## Ne yapar

**1. Oturum fonksiyonlarının argümanları en üstte gelir.** Yalnızca R oturumunda tanımlı bir
fonksiyonun (örneğin çalışma alanı dışından `source()` ile yüklenen) argümanları listenin başında
önerilir. Eklenti olmadan bu argümanlar hiç önerilmez.

```r
source("~/toolkit/functions.R")   # init_variable_info(data, from, max_levels, ...) tanımlar
init_variable_info(|)
```

| | `\|` konumundaki tamamlama listesi |
|---|---|
| Önce | `%\|\|%`, `a`, `b`, `df`, `init_variable_info`, … |
| Sonra | `data`, `from`, `max_levels`, `decimal`, `locale`, ardından oturum nesneleri |

languageserver fonksiyonu zaten tanıyorsa (paket, açık belge ya da çalışma alanı dosyası) hiçbir
şey eklenmez; argümanlar iki kez listelenmez.

**2. Tırnak içinde önce klasörler ve dosyalar gelir.** Tırnak içinde önce klasörler, sonra
dosyalar, en sonda oturum nesneleri listelenir.

```r
readRDS("|")
```

| | `\|` konumundaki tamamlama listesi |
|---|---|
| Önce | `%\|\|%`, `R/`, `data/`, `df`, `README.md`, `init_variable_info`, … |
| Sonra | `data/`, `R/`, `report/`, `README.md`, ardından `df`, `init_variable_info`, … |

Göreli yollar çalışma alanı köküne göre çözülür. Klasör seçilince `/` yazılır ve liste o klasörün
içeriğiyle sürer. Gizli öğeler `.` yazınca görünür.

**3. `$` sonrasındaki üyeler liste her açıldığında önerilir.** vscode-R bir veri çerçevesinin
sütunlarını (liste öğelerini, `@` sonrasında S4 slotlarını) yalnızca `$` yazıldığı anda listeler.
Liste sonradan elle ya da yazmaya devam edilerek açıldığında global ortamı gösterir. Eklenti bu
durumlarda da üyeleri vscode-R'dan ister ve özgün sıralarıyla en üste koyar.

```r
df$|        # liste Esc ile kapatıldı, sonra yeniden açıldı
```

| | `\|` konumundaki tamamlama listesi |
|---|---|
| Önce | `df`, `init_variable_info`, … (global ortam) |
| Sonra | `id`, `yas`, `grup`, … (`df` sütunları), ardından global ortam |

`$` yazıldığı anda hiçbir şey eklenmez; o liste yine vscode-R'dan gelir ve üyeler iki kez
listelenmez.

Üç özellik de `.R` dosyalarında ve `.Rmd` ile `.qmd` belgelerindeki R hücrelerinde çalışır.

## Neden gerekli

vscode-R, bağlı oturumdaki nesneleri (ayrıntı `[session]`) tamamlama listesine `sortText` vermeden
ekler. VS Code bu durumda etiketi sıralama anahtarı sayar; diğer sağlayıcılar ise kendi
anahtarlarını kullanır: languageserver argümanlara `0-001…`, yol eklentileri `d`/`f` gibi
anahtarlar verir. Sonuçta sıra `%||%` < `0-…` < `d` < `df` < `f` olur; oturum nesneleri fonksiyon
argümanlarının üstüne çıkar, klasörlerle dosyaların arasına girer.

Ayrıca languageserver, çalışma alanı dışındaki dosyalara giden `source()` çağrılarını izlemez.
vscode-R oturumdaki fonksiyonların imzasını bilir (imza yardımı olarak gösterir), ama
argümanlarını tamamlama olarak önermez.

Eklenti kendi öğelerini `!` önekiyle sıralar. R'da bir ad `!` ile başlayamadığından bu öğeler her
zaman oturum nesnelerinin üstünde kalır.

## Gereksinimler

- Oturum izleyicisi açık [vscode-R](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r)
  ve bağlı bir R oturumu (argüman özelliği için).
- `languageserver` R paketi.
- İsteğe bağlı: `.qmd`/`.Rmd` belgeleri için
  [Quarto](https://marketplace.visualstudio.com/items?itemName=quarto.quarto) eklentisi.

## Kurulum

Eklenti Marketplace'te yoktur. `.vsix` dosyasını
[sürümler sayfasından](https://github.com/dncR/r-completion-companion/releases) indirin ya da
kendiniz derleyin:

```sh
git clone https://github.com/dncR/r-completion-companion.git
cd r-completion-companion
npx @vscode/vsce package
code --install-extension r-completion-companion-1.1.0.vsix
```

Ardından VS Code penceresini yeniden yükleyin.

## Ayarlar

**Path Autocomplete.**
[Path Autocomplete](https://marketplace.visualstudio.com/items?itemName=ionutvmi.path-autocomplete)
(ya da benzer bir yol eklentisi) kullanıyorsanız bu üç dilde kapatın; yoksa her yol iki kez
listelenir. `settings.json` içinde:

```jsonc
"[r]":      { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" },
"[rmd]":    { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" },
"[quarto]": { "path-autocomplete.ignoredFilesPattern": "{**,**/.vdoc.*,**/.quarto/vdoc/.vdoc.*}" }
```

Desendeki `.vdoc.*` kısımları, Quarto'nun R hücreleri için kullandığı sanal belgeleri kapsar; düz
`**` bunları yakalamaz, çünkü adları nokta ile başlar. Diğer diller etkilenmez.

**Listeyi Tab ile açmak (isteğe bağlı).** Liste olağan kısayolla (`Ctrl+Space`) ya da yazarken
açılır. `Tab` ile açmak için `keybindings.json` dosyasına şunu ekleyin:

```json
{
  "key": "tab",
  "command": "editor.action.triggerSuggest",
  "when": "editorTextFocus && editorLangId =~ /^(r|rmd|quarto)$/ && !editorHasSelection && !suggestWidgetVisible && !inlineSuggestionVisible && !inSnippetMode && !editorReadonly && !editorTabMovesFocus"
}
```

## Quarto ve R Markdown'da nasıl çalışır

Quarto, R hücrelerinde tamamlama isteklerini geçici bir sanal R belgesi (`.vdoc.<id>.r`) üzerinden
R sağlayıcılarına iletir. Eklenti işini buna göre böler:

- Argümanlar sanal belge üzerinden verilir; vscode-R'ın oturum imza yardımı orada kullanılabilir.
- Yollar asıl belge (`.qmd`/`.Rmd`) üzerinden verilir, sanal belgelerde atlanır. Böylece yollar
  Quarto'nun geçici klasörüne göre değil çalışma alanına göre çözülür.

Kod hücrelerinin dışında (YAML başlığı, düz metin) tırnak içindeki yol önerileri de bu eklentiden
gelir, çünkü yol eklentisi bu dillerde kapatılmıştır.

## Sınırlar

- Eklenti başka sağlayıcıların öğelerini yeniden sıralayamaz. Global ortamda adı `%` ile başlayan
  bir nesne varsa (örneğin kullanıcının tanımladığı `%||%`), languageserver'ın tanıdığı
  fonksiyonlarda (`lm()` gibi) argümanların üstünde kalır. Böyle operatörleri global ortamda
  tanımlamayın; `%||%` R 4.4'ten beri base R'ın parçasıdır.
- Sıra, liste yazılmış bir önek olmadan açıldığında geçerlidir. Yazarken VS Code önce eşleşme
  puanına bakar; sıralama anahtarını yalnızca eşitliklerde kullanır.
- Yol sağlayıcısı bilerek yalın tutulmuştur; yol eşleme ya da takma ad desteği yoktur.
- Üye özelliği, vscode-R'ın `$` / `@` için verdiği yanıtı yineler ve öğelerini ayrıntı metninden
  (`[session]`) tanır. Bağlı bir oturum gerekir; `$` öncesindeki ifade vscode-R'ın
  değerlendirmediği türdense (örneğin `x[[1]]$`) bir şey eklenmez. Üye adının bir bölümü
  yazılmışsa languageserver yazılan sözcüğün kendisini üyelerin üstünde listeleyebilir.
- Argüman özelliği iki uygulama ayrıntısına dayanır: vscode-R'ın oturum imzasındaki açıklama
  metni (`Function in this R session`) ve Quarto sanal belgelerinin `.vdoc.` öneki. İleriki bir
  sürüm bunları değiştirirse eklenti güncellenene kadar özellik çalışmaz.

## Denendiği sürümler

macOS üzerinde VS Code 1.146, vscode-R 3.4.0, languageserver 0.3.20, Quarto eklentisi 1.139.0,
Path Autocomplete 1.26.0, R 4.6.1. Davranış, gerçek bir R oturumu bağlı yalıtılmış bir VS Code
örneğinde, `.R` dosyalarında ve `.qmd` ile `.Rmd` belgelerinin R hücrelerinde (hem Quarto hem
R Markdown diliyle açılmış olarak) denetlendi.

## Kaldırma

```sh
code --uninstall-extension local.r-completion-companion
```

Ardından `settings.json` içindeki `path-autocomplete.ignoredFilesPattern` satırlarını silin.

## Lisans

[MIT](LICENSE)
