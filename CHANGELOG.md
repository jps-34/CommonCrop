# Changelog

## Unreleased
* Return no longer runs a button of the dialog: PixInsight 1.9.6 activates the first button of a dialog
  when Return is pressed in an edit box, which could start a run or reset the settings.

## 1.1.4 (2026-10-30)
* Deprecated `fileName` and `fileNames` replaced by `filePath` and `filePaths`, with the older names
  kept as a fallback. No change to the behaviour.

## 1.1.3 (2026-10-28)
* Warning for masters registered on a reference frame (WBPP, ImageIntegration): they have the
  size of one frame and no zero border, so their partial coverage cannot be seen and the crop does
  not remove it. The report says so and points to the WBPP *Autocrop* option. Before, such masters
  got a crop of the safety margin only, with no explanation. Crop results are unchanged.
* *Sort open views* ignores the `rejection_low` / `rejection_high` windows that open along with a
  WBPP master.
* READMEs: CommonCrop is meant for masters in *full* composition (APP...), not for WBPP masters.

## 1.1.2 (2026-10-27)
* Menu: the script moves from *Script > Utilities* to *Script > JPS*, the folder that groups
  the PixInsight scripts of Jacques Pouyaud. No change to the behaviour.

## 1.1.1 (2026-10-27)
* Licence changed from MIT to the GNU General Public License, version 3 or later
  (GPL-3.0-or-later). Versions up to 1.1.0 remain available under the MIT License. No change to
  the script's behaviour.
* README: credit request for reuse of the method or the code.

## 1.1.0 (2026-10-25)
* New option **Crop in place**: Apply crops the loaded masters directly instead of creating
  `<filter>_crop` images. Each crop is one PixInsight history step (Ctrl+Z reverts it); the
  `CommonCrop` preview is removed first; a HISTORY keyword records the crop. Refused when a master
  has no zero border at all (most likely already cropped). Off by default.
* Option suggested by Philippe Bernhard ([astro-photographie.fr](https://astro-photographie.fr/)).

## 1.0.2 (2026-10-12)
* Code comments and maintenance notes (`MAINTENANCE.md`) in English; the interface and the
  tooltips stay in English and French. No functional change.

## 1.0.1 (2026-10-12)
* The reports (geometry, field loss, output check) now follow the interface language. After a
  language switch they stayed in the language used for Compute.

## 1.0.0 (2026-10-12)
* First published version. PixInsight 1.9.4 and later (V8 engine).
* Common crop of up to nine masters (L, R, G, B, SII, Ha, OIII, AUX1, AUX2) on the area covered
  by every sub-frame of every channel, computed from the masters alone: bounding box of the
  non-zero pixels shrunk by its excess over the size of one sub-frame, intersection over the
  channels, safety margin (10 px suggested, 2 to 200).
* Frame size read from the `INSTRUME` / `XBINNING` keywords (QHY600, ASI6200, ASI2600, QHY268),
  entered by hand, or estimated from the inscribed rectangle.
* Output check: noise ratio at the crop edge per channel and side, median over 20 segments,
  threshold 1.10.
* Field loss per filter, ranked worst first, mean over the filters, loss of the final crop.
* `CommonCrop` preview on each master, `<filter>_crop` outputs with automatic STF and reduced
  zoom, inputs renamed `<filter>_master` (optional), FITS keywords copied with a HISTORY line.
* Automatic sorting of the loaded files or open views by `FILTER` keyword, file name or view
  identifier. English or French interface.
* Validated on the author's NGC 7380 field (six 9682x6534 masters, 13 nights, QHY600M): the
  per-channel margins match a reference analysis done in Python to the pixel.
