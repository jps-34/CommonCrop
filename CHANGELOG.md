# Changelog

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
