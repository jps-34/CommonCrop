# CommonCrop

**PixInsight script: crops all your integrated masters to the one rectangle covered by every
sub-frame of every channel.**

*Version française : [README.fr.md](README.fr.md)*

Masters integrated in *full* composition (Astro Pixel Processor, for example) have a border where
only part of the sub-frames contribute: dithering, pointing drift between nights, a rotated
session. That border is noisier and differs from one filter to the next. CommonCrop finds it from
the masters alone and gives you `L_crop`, `R_crop`, ... all the same size and fully integrated.

## How it works

* **Per channel**: the non-zero area of the master is the union of the sub-frames. Its excess over
  the size of one sub-frame is the spread; removing it on each side leaves the area covered by
  every sub-frame.
* **All channels**: intersection of those areas, plus a safety margin (10 px by default).
* **Output check**: noise at each crop edge compared with the noise further in. Around 1.00 the
  edge is clean; above 1.10, increase the margin.
* **Visual check**: after Compute, a `CommonCrop` preview shows the exact crop frame on every
  master. Zoom into the corners to see for yourself that the frame sits inside the fully
  integrated area, before anything is cropped.
* **Field loss per filter**: share of the field lost to the spread, ranked worst first. A quick
  score of your acquisition, filter by filter.
* **Apply**: creates `<filter>_crop` with an automatic STF; inputs are renamed `<filter>_master`.
  Masters are never modified. Option **Crop in place**: crops the masters themselves instead
  (one undoable history step per master).

## Requirements

* PixInsight 1.9.4 or later.
* Masters of the same target, all integrated on the same reference frame in *full* composition
  (same dimensions, zero where nothing was covered).
* The size of one sub-frame: read from the FITS header for QHY600, ASI6200, ASI2600 and QHY268,
  otherwise enter it once in the settings.

## Installation

1. *Resources > Updates > Manage Repositories*, add `https://jps-34.github.io/CommonCrop/`
2. *Check for Updates*, restart PixInsight (enable *Allow unsigned update repositories* until the
   repository is signed).
3. *Script > JPS > CommonCrop* (*Script > Utilities* up to 1.1.1).

Or download `scripts/CommonCrop.js` and run it with *Script > Execute Script File*.

## Usage

1. **Open files...** or **Sort open views**: masters are placed in their slot from the `FILTER`
   keyword (or the file name). Unknown filters go to AUX1/AUX2.
2. **Compute**: report and output check.
3. **Check the `CommonCrop` previews** on the masters, corners especially. Adjust the margin and
   compute again if needed.
4. **Apply**.

Interface in English or French (*Langue / Language* menu). Hover over any setting for help.

## License

Copyright (c) 2026 Jacques Pouyaud. Released under the
[GNU General Public License, version 3 or later](LICENSE) (GPL-3.0-or-later): you may use, study,
share and modify it; any distributed work that includes this code must be released under the same
licence, with its source code. Versions up to 1.1.0 were released under the MIT License, which
still applies to copies of those versions.

**Credit request.** If you reuse the method or the code of CommonCrop, in a script, an application
or a tutorial, please credit it by name with a link to this repository. This is a request, not a
licence condition; when the code itself is reused, the GPL already requires keeping the copyright
notice.

Bug reports and suggestions welcome as GitHub issues.

*Code written by Claude (Anthropic), under the direction of Jacques Pouyaud.*
