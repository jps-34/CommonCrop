# CommonCrop

**A PixInsight script that crops all your integrated masters to the one rectangle covered by every
sub-frame of every channel, from the masters alone.**
Load L, R, G, B, SII, Ha, OIII (and up to two extra channels), click Compute, check, Apply: you get
`L_crop`, `R_crop`, ... all the same size, with no partially integrated border left in any of them.
It also tells you, filter by filter, how much field your acquisition lost to dithering, pointing
drift and rotation between nights.

*Version française : [README.fr.md](README.fr.md)*

## Why

When a stack of sub-frames is integrated in *full* composition (Astro Pixel Processor, for
instance), the canvas is the union of all the frames. Along the edges, and especially in the corners,
lies a band of pixels that only some of the sub-frames cover: dithering, pointing differences from
one night to the next, a session shot with a slightly rotated camera. Those pixels are noisier, and
the band is different for every filter. The masters are then cropped by hand, one at a time, and
one is never quite sure the frame is both tight and clean, nor that the seven channels line up.

Testing for zero pixels is not enough: it only finds the outer edge of the union, while the pixels
just inside are covered by one, two, three sessions out of five. The fully covered zone starts at
the innermost step of the "staircase" you see in a corner at high zoom, and that step is invisible
to a zero test.

## What it does

1. **Geometry, per channel.** The bounding box of the non-zero pixels is the union of the
   sub-frames. Its excess over the size of one sub-frame is the spread of the frames. The area
   covered by every sub-frame is the box shrunk by that excess on each side: exact for pure
   translations and for a rotation about the centre, close otherwise. On the author's test set the
   result matched the measured noise boundary within 1 to 15 px on RGB, 10 to 47 px on the
   narrowband channels (one session rotated by 0.8°).
2. **Common crop.** The intersection of those areas over all channels, minus a safety margin
   (10 px suggested, 2 to 200). The report says which channel limits each side.
3. **Output check.** On every channel and every side, the noise (robust standard deviation of the
   differences between neighbouring pixels) in a 16 px band at the crop edge is divided by the noise
   300 px further in, as the median over 20 segments. A side still inside the partially integrated
   band shows up above the threshold (1.10 by default, about 83 % of the integration weight). If a
   side is flagged, increase the margin and compute again.
4. **Field loss per filter.** The share of one sub-frame's field that is not covered by every
   sub-frame of that filter, ranked worst first, with the mean over the filters and the loss of the
   final crop. A quality score for the acquisition: on the author's Wizard field, 0.7 % on the RGB
   channels (four nights) and about 3.1 % on SII, Ha and OIII (five to eight nights, one rotated).
5. **Previews.** After Compute, a preview named `CommonCrop` is created on each master on the exact
   crop rectangle, for a visual check.
6. **Apply.** Creates `<filter>_crop` for each loaded master, in the master's own sample format,
   with an automatic STF and a reduced zoom. The inputs are renamed `<filter>_master` (optional) and
   their pixels are never modified. The FITS keywords are copied, plus a HISTORY line with the crop.

The whole run on six 63-megapixel masters takes about one second for the geometry and the check,
and about fifteen seconds to create the six cropped images.

## Requirements

| File | PixInsight |
|---|---|
| `scripts/CommonCrop.js` (1.0.0) | 1.9.4 and later (V8 JavaScript engine) |

Inputs: integrated masters of the same target, **all integrated on the same reference frame in
*full* composition**, so that they have the same dimensions and the uncovered areas are zero. This
is the default output of Astro Pixel Processor. Masters integrated in *reference* composition have
no zero border: the script then finds no spread and only applies the safety margin.

The script needs the **size of one registered sub-frame** (the camera resolution at the binning
used). It reads it from the `INSTRUME` and `XBINNING` keywords for a few cameras (QHY600, ASI6200,
ASI2600, QHY268), otherwise enter it once in the settings: it is remembered. With neither, the size
is estimated from the largest rectangle inscribed in the non-zero area, within about 30 px, and the
report says so.

## Loading the masters

PixInsight scripts run in a modal dialog, so images cannot be dragged from the workspace into the
script. Three ways instead:

* **Open files...**: pick one or more files; each is opened and sorted into its slot from the FITS
  `FILTER` keyword (Red, Green, Blue, Luminance, Hydrogen-alpha, Oxygen III, Sulphur II or their
  abbreviations), else from the file name. Unknown or duplicate filters go to AUX1, then AUX2.
* **Sort open views**: the same sorting applied to the images already open in PixInsight.
* The list next to each slot, to pick or correct by hand.

## Language

The interface is available in **English and French**. On first run it uses the language of the
system, and English otherwise. The **Langue / Language** menu switches at any time: the dialog
reopens at once, keeping the images and the settings, and the choice is remembered.

## Installation

### From the PixInsight update repository (recommended)

1. *Resources > Updates > Manage Repositories*, add
   `https://jps-34.github.io/CommonCrop/`
2. *Resources > Updates > Check for Updates*, then restart PixInsight.
3. The script appears under *Script > Utilities > CommonCrop*.

Until the repository is code-signed, PixInsight only accepts it with the
*Allow unsigned update repositories* security preference enabled.

### Manual

Download `scripts/CommonCrop.js`, then either run it with *Script > Execute Script File*, or add
its folder with *Script > Feature Scripts > Add* so it shows up in the *Script > Utilities* menu.

## Settings

| Setting | Meaning |
|---|---|
| **Safety margin** | Pixels removed on every side on top of the geometric result. 10 px suggested; the output check tells whether it is enough. 2 to 200. Back to the suggested value at every launch. |
| **Frame size** | Width and height of one registered sub-frame. 0 = from the header when the camera is known, else estimated. Remembered. |
| **Check threshold** | Noise ratio above which a side is flagged. 1.10 by default. |
| **Preview of the crop** | Creates or updates the `CommonCrop` preview on each master after Compute. |
| **Rename inputs** | Renames the masters `<filter>_master` on Apply. |

## Reading the report

* **Spread x/y**: excess of the non-zero area over one sub-frame, in pixels. Dithering alone gives
  a few tens of pixels; a rotated session adds the height of the frame times the sine of the angle
  (about 134 px for 0.8° on a 6388 px high frame).
* **Margins**: pixels to remove from each edge of the canvas to keep only the area covered by every
  sub-frame of that filter.
* **Field loss**: `1 - (W - spread_x)(H - spread_y) / (W H)` with W and H the frame size. Worst
  filter first. The mean over the filters and the loss of the final crop (which adds the margin) are
  given underneath.
* **Output check**: around 1.00, the edge is in the fully integrated area. Read the median; the
  maximum in brackets reacts to bright stars and nebulosity and is only there as a hint.

## License

Copyright (c) 2026 Jacques Pouyaud. Released under the [MIT License](LICENSE).

If you build on it, a mention and a link back to this repository are appreciated.
Bug reports and suggestions are welcome as GitHub issues.

*Code written by Claude (Anthropic), under the direction of Jacques
Pouyaud, who defined the need, tested it on his own data and validated the results. The method was
first checked in Python on the author's masters (six channels, 13 nights) before being written as a
PixInsight script.*
