#engine v8

#feature-id    CommonCrop : JPS > CommonCrop
#feature-info  Crops a set of integrated masters (L, R, G, B, SII, Ha, OIII and two auxiliary \
   channels) to the one rectangle covered by every sub-frame of every channel, from the \
   masters alone. Reports a field-loss score per filter and checks the noise at the \
   crop edges. Creates new images, never modifies the masters. Interface in English or French.

/*
 * CommonCrop.js  v1.1.2
 * Copyright (c) 2026 Jacques Pouyaud.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Free software under the GNU General Public License, version 3 or (at your
 * option) any later version, WITHOUT ANY WARRANTY; see LICENSE.
 * Code written by Claude (Anthropic), under the direction of Jacques Pouyaud.
 * https://github.com/jps-34/CommonCrop
 *
 * Principle
 *   Masters integrated in 'full' composition (Astro Pixel Processor and
 *   others) are 0 where no sub-frame covers. The bounding box of the non-zero
 *   pixels is the union of the sub-frames; its excess over the size of one
 *   sub-frame is the spread (dithering, pointing offsets between nights,
 *   rotation). The area covered by every sub-frame is that box shrunk by the
 *   excess on each side: exact for translations and for a rotation about the
 *   centre, approximate otherwise.
 *   The common crop is the intersection of these areas over all channels,
 *   minus a safety margin. An output check measures the noise in a 16 px band
 *   at the crop edge, divided by the noise 300 px further in, per side and per
 *   channel (median over 20 segments): an edge still inside the partial
 *   coverage ramp comes out above 1.10.
 *   The field loss per filter (share of one frame's field not covered by every
 *   sub-frame of that filter) serves as an acquisition quality indicator,
 *   ranked worst first.
 *
 * v1.1.2: menu entry moved to Script > JPS (was Script > Utilities).
 * v1.1.0: optional in-place crop of the loaded masters (no new images), undoable
 *   from the PixInsight history; refused on masters that look already cropped.
 * v1.0.2: code comments and maintenance notes in English. No functional change.
 * v1.0.1: the reports follow the selected language (they stayed in the
 *   language of the computation after a language switch).
 * v1.0.0: first published version. PixInsight 1.9.4 and later (V8 engine).
 */

var TITLE = "CommonCrop";
var VERSION = "1.1.2";
var LANG_KEY = "CommonCrop/language";
var SETTINGS_KEY = "CommonCrop/settings10";
var LANG = "en";
var TIPS = {};

// Slots with fixed names. Outputs <name>_crop; inputs renamed <name>_master.
var SLOT_NAMES = [ "L", "R", "G", "B", "SII", "Ha", "OIII", "AUX1", "AUX2" ];
var OUT_SUFFIX = "_crop";
var IN_SUFFIX = "_master";
var PREVIEW_ID = "CommonCrop";

var DEFAULT_MARGIN = 10;      // px, suggested; the output check tells whether it is enough
var MARGIN_MIN = 2;
var MARGIN_MAX = 200;
var DEFAULT_THRESHOLD = 1.10; // edge / interior noise ratio tolerated
var BAND_WIDTH = 16;          // check band at the crop edge
var REF_DEPTH = 300;          // distance of the reference band
var REF_WIDTH = 100;          // width of the reference band
var N_SEGMENTS = 20;          // segments per side
var TARGET_WINDOW_W = 1200;   // approximate width of the created windows (screen px)

// Native resolution of a few cameras (bin 1), from the INSTRUME keyword.
var CAMERA_SIZES = [
   { match: /QHY\s*600/i,  w: 9576, h: 6388 },
   { match: /ASI\s*6200/i, w: 9576, h: 6388 },
   { match: /ASI\s*2600/i, w: 6248, h: 4176 },
   { match: /QHY\s*268/i,  w: 6252, h: 4176 } ];

// ============================================================================
// Language
// ============================================================================

function detectLanguage()
{
   try
   {
      var saved = Settings.read( LANG_KEY, DataType.String );
      if ( saved == "fr" || saved == "en" )
         return saved;
   }
   catch ( e ) {}
   var names = [ "LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG" ];
   for ( var i = 0; i < names.length; ++i )
   {
      try
      {
         var v = "";
         if ( typeof System !== "undefined" && System.getEnvironmentVariable )
            v = System.getEnvironmentVariable( names[i] );
         else if ( typeof getEnvironmentVariable === "function" )
            v = getEnvironmentVariable( names[i] );
         if ( v && v.length > 0 && v != "C" && v != "POSIX" )
            return v.toLowerCase().indexOf( "fr" ) == 0 ? "fr" : "en";
      }
      catch ( e ) {}
   }
   try
   {
      var loc = Intl.DateTimeFormat().resolvedOptions().locale;
      if ( loc && loc.toLowerCase().indexOf( "fr" ) == 0 )
         return "fr";
   }
   catch ( e ) {}
   return "en";
}

function saveLanguage( lang )
{
   try { Settings.write( LANG_KEY, DataType.String, lang ); } catch ( e ) {}
}

function L( fr, en )
{
   return LANG == "fr" ? fr : en;
}

// ============================================================================
// Saved settings (not the margin: the suggested value comes back at each launch)
// ============================================================================

var TP = { frameW: 0, frameH: 0, threshold: DEFAULT_THRESHOLD, preview: true, rename: true, inPlace: false };

function saveSettings()
{
   try { Settings.write( SETTINGS_KEY, DataType.String, JSON.stringify( TP ) ); } catch ( e ) {}
}

function loadSettings()
{
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType.String );
      if ( s && s.length > 0 )
      {
         var o = JSON.parse( s );
         for ( var k in TP )
            if ( o[k] !== undefined && typeof o[k] == typeof TP[k] )
               TP[k] = o[k];
      }
   }
   catch ( e ) {}
}

// State kept when the dialog reopens (language switch).
// Reports are kept as data and regenerated in the current language.
var STATE = { slotIds: {}, margin: DEFAULT_MARGIN, res: null, checks: null, extra: null, applied: null };

// ============================================================================
// Tools
// ============================================================================

function log( s )
{
   console.writeln( s );
}

function errText( e )
{
   if ( e == null )
      return "?";
   if ( typeof e == "string" )
      return e;
   var s = ( e.message !== undefined && e.message !== null && String( e.message ).length > 0 ) ? String( e.message ) : String( e );
   if ( e.stack )
      s += "\n" + e.stack;
   return s;
}

function findView( id )
{
   var w = ImageWindow.windowById( id );
   return ( w == null || w.isNull ) ? null : w.mainView;
}

function validId( base )
{
   var id = base.replace( /[^A-Za-z0-9_]/g, "_" );
   if ( /^[0-9]/.test( id ) )
      id = "_" + id;
   if ( findView( id ) == null )
      return id;
   for ( var n = 1; ; ++n )
      if ( findView( id + "_" + n ) == null )
         return id + "_" + n;
}

function clamp( x, a, b )
{
   return Math.min( Math.max( x, a ), b );
}

function mtf( m, x )
{
   if ( x <= 0 ) return 0;
   if ( x >= 1 ) return 1;
   return ( m - 1 ) * x / ( ( 2 * m - 1 ) * x - m );
}

// k-th smallest element of a[0..n-1] (quickselect, modifies a)
function selectKth( a, n, k )
{
   var lo = 0, hi = n - 1;
   while ( hi > lo )
   {
      var pivot = a[( lo + hi ) >> 1];
      var i = lo, j = hi;
      while ( i <= j )
      {
         while ( a[i] < pivot ) ++i;
         while ( a[j] > pivot ) --j;
         if ( i <= j )
         {
            var t = a[i]; a[i] = a[j]; a[j] = t;
            ++i; --j;
         }
      }
      if ( k <= j ) hi = j;
      else if ( k >= i ) lo = i;
      else break;
   }
   return a[k];
}

// median of a[0..n-1] (a is copied)
function medianOf( a, n )
{
   if ( n <= 0 )
      return NaN;
   var b = new Float64Array( n );
   for ( var i = 0; i < n; ++i )
      b[i] = a[i];
   if ( n & 1 )
      return selectKth( b, n, ( n - 1 ) >> 1 );
   var m1 = selectKth( b, n, ( n >> 1 ) - 1 );
   var m2 = Infinity;
   for ( var j = n >> 1; j < n; ++j )
      if ( b[j] < m2 )
         m2 = b[j];
   return 0.5 * ( m1 + m2 );
}

// 1.4826 * MAD: robust standard deviation
function madNoise( d, n )
{
   if ( n < 50 )
      return NaN;
   var m = medianOf( d, n );
   var e = new Float64Array( n );
   for ( var i = 0; i < n; ++i )
      e[i] = Math.abs( d[i] - m );
   return 1.4826 * medianOf( e, n );
}

function medianArray( arr )
{
   var v = arr.filter( function( x ) { return isFinite( x ); } );
   if ( v.length == 0 )
      return NaN;
   v.sort( function( a, b ) { return a - b; } );
   var n = v.length;
   return ( n & 1 ) ? v[( n - 1 ) >> 1] : 0.5 * ( v[( n >> 1 ) - 1] + v[n >> 1] );
}

function maxArray( arr )
{
   var m = -Infinity;
   for ( var i = 0; i < arr.length; ++i )
      if ( isFinite( arr[i] ) && arr[i] > m )
         m = arr[i];
   return m;
}

function pad( s, n )
{
   s = String( s );
   while ( s.length < n )
      s += " ";
   return s;
}

// ============================================================================
// FITS keywords
// ============================================================================

function keywordValue( window, name )
{
   try
   {
      var kws = window.keywords;
      for ( var i = 0; i < kws.length; ++i )
         if ( kws[i].name.toUpperCase() == name.toUpperCase() )
         {
            var v = String( kws[i].value ).trim();
            if ( v.length >= 2 && v[0] == "'" && v[v.length - 1] == "'" )
               v = v.substring( 1, v.length - 1 );
            return v.trim();
         }
   }
   catch ( e ) {}
   return "";
}

// Slot name deduced from a text (FILTER, file name, identifier), or ""
function slotFromText( text )
{
   if ( !text )
      return "";
   var t = text.toLowerCase();
   var compact = t.replace( /[^a-z0-9]/g, "" );
   if ( /hydrogenalpha|halpha/.test( compact ) ) return "Ha";
   if ( /oxygeniii|oxygen3|oxygen/.test( compact ) ) return "OIII";
   if ( /sulphurii|sulfurii|sulphur2|sulfur2|sulphur|sulfur/.test( compact ) ) return "SII";
   if ( /luminance/.test( compact ) ) return "L";
   var tokens = t.split( /[^a-z0-9]+/ ).filter( function( s ) { return s.length > 0; } );
   var map = { l: "L", lum: "L", r: "R", red: "R", g: "G", green: "G", b: "B", blue: "B",
               ha: "Ha", h: "Ha", oiii: "OIII", o3: "OIII", o: "OIII", sii: "SII", s2: "SII", s: "SII" };
   for ( var i = 0; i < tokens.length; ++i )
      if ( map[tokens[i]] !== undefined )
         return map[tokens[i]];
   return "";
}

function slotForWindow( window )
{
   var s = slotFromText( keywordValue( window, "FILTER" ) );
   if ( s == "" && window.filePath )
      s = slotFromText( File.extractName( window.filePath ) );
   if ( s == "" )
      s = slotFromText( window.mainView.id );
   return s;
}

// Frame size deduced from the header (INSTRUME, XBINNING), or null
function frameSizeFromHeader( window )
{
   var instr = keywordValue( window, "INSTRUME" );
   if ( instr == "" )
      return null;
   var bin = parseInt( keywordValue( window, "XBINNING" ) );
   if ( !( bin >= 1 ) )
      bin = 1;
   for ( var i = 0; i < CAMERA_SIZES.length; ++i )
      if ( CAMERA_SIZES[i].match.test( instr ) )
         return { w: Math.floor( CAMERA_SIZES[i].w / bin ), h: Math.floor( CAMERA_SIZES[i].h / bin ),
                  source: instr + ( bin > 1 ? " bin " + bin : "" ) };
   return null;
}

// ============================================================================
// Pixel access (ImageIterator: one row = one typed array)
// ============================================================================

function rowsOf( img, channel )
{
   var I = new ImageIterator( img, channel );
   var rows = new Array( img.height );
   for ( var y = 0; y < img.height; ++y )
      rows[y] = I[y];
   return rows;
}

// Bounding box of the non-zero pixels (channel 0), as margins from each edge
function nonNullBBox( img )
{
   var W = img.width, H = img.height;
   var rows = rowsOf( img, 0 );
   var rowHasData = function( y )
   {
      var r = rows[y];
      for ( var x = 0; x < W; ++x )
         if ( r[x] > 0 )
            return true;
      return false;
   };
   var colHasData = function( x )
   {
      for ( var y = 0; y < H; ++y )
         if ( rows[y][x] > 0 )
            return true;
      return false;
   };
   var top = 0;
   while ( top < H && !rowHasData( top ) )
      ++top;
   if ( top >= H )
      throw new Error( L( "image entièrement nulle", "image is entirely zero" ) );
   var bottom = H - 1;
   while ( bottom > top && !rowHasData( bottom ) )
      --bottom;
   var left = 0;
   while ( left < W && !colHasData( left ) )
      ++left;
   var right = W - 1;
   while ( right > left && !colHasData( right ) )
      --right;
   return { left: left, top: top, right: W - 1 - right, bottom: H - 1 - bottom,
            width: right - left + 1, height: bottom - top + 1 };
}

// Largest axis-aligned rectangle inscribed in the non-zero area: fallback
// estimate of the frame size (approximate, about 30 px)
function inscribedRect( img )
{
   var W = img.width, H = img.height;
   var rows = rowsOf( img, 0 );
   var Lx = new Int32Array( H ), Rx = new Int32Array( H );
   for ( var y = 0; y < H; ++y )
   {
      var r = rows[y];
      var l = 0;
      while ( l < W && !( r[l] > 0 ) )
         ++l;
      var rr = W - 1;
      while ( rr > l && !( r[rr] > 0 ) )
         --rr;
      Lx[y] = ( l < W ) ? l : W;
      Rx[y] = ( l < W ) ? rr : -1;
   }
   var best = { area: 0, width: 0, height: 0 };
   for ( var t = 0; t < H; ++t )
   {
      if ( Rx[t] < Lx[t] )
         continue;
      var l2 = Lx[t], r2 = Rx[t];
      for ( var b = t; b < H; ++b )
      {
         if ( Rx[b] < Lx[b] )
            break;
         if ( Lx[b] > l2 ) l2 = Lx[b];
         if ( Rx[b] < r2 ) r2 = Rx[b];
         var w = r2 - l2 + 1;
         if ( w <= 0 )
            break;
         var a = w * ( b - t + 1 );
         if ( a > best.area )
            best = { area: a, width: w, height: b - t + 1 };
      }
   }
   return best;
}

// Noise per segment over a band of channel 0. alongX: horizontal band,
// segments and differences along x; otherwise vertical band, along y.
function bandNoise( rows, rect, alongX )
{
   var w = rect.width, h = rect.height;
   var a = new Float32Array( w * h );
   for ( var y = 0; y < h; ++y )
   {
      var r = rows[rect.y0 + y];
      var o = y * w;
      for ( var x = 0; x < w; ++x )
         a[o + x] = r[rect.x0 + x];
   }
   var out = [];
   var d = new Float64Array( w * h );
   for ( var s = 0; s < N_SEGMENTS; ++s )
   {
      var n = 0;
      if ( alongX )
      {
         var x0 = Math.floor( s * w / N_SEGMENTS ), x1 = Math.floor( ( s + 1 ) * w / N_SEGMENTS );
         for ( var yy = 0; yy < h; ++yy )
         {
            var oo = yy * w;
            for ( var xx = x0 + 1; xx < x1; ++xx )
               d[n++] = a[oo + xx] - a[oo + xx - 1];
         }
      }
      else
      {
         var y0 = Math.floor( s * h / N_SEGMENTS ), y1 = Math.floor( ( s + 1 ) * h / N_SEGMENTS );
         for ( var xx2 = 0; xx2 < w; ++xx2 )
            for ( var yy2 = y0 + 1; yy2 < y1; ++yy2 )
               d[n++] = a[yy2 * w + xx2] - a[( yy2 - 1 ) * w + xx2];
      }
      out.push( madNoise( d, n ) );
   }
   return out;
}

// Output check: noise ratio edge band / reference band, per side
function edgeCheck( img, crop )
{
   var rows = rowsOf( img, 0 );
   var x0 = crop.x0, y0 = crop.y0, x1 = crop.x1, y1 = crop.y1;
   var w = x1 - x0, h = y1 - y0;
   var depth = Math.min( REF_DEPTH, Math.floor( 0.1 * Math.min( w, h ) ) );
   var rw = Math.min( REF_WIDTH, Math.max( 16, Math.floor( depth / 3 ) ) );
   var b = BAND_WIDTH;
   var bands = {
      left:   [ new Rect( x0, y0, x0 + b, y1 ),  new Rect( x0 + depth, y0, x0 + depth + rw, y1 ), false ],
      right:  [ new Rect( x1 - b, y0, x1, y1 ),  new Rect( x1 - depth - rw, y0, x1 - depth, y1 ), false ],
      top:    [ new Rect( x0, y0, x1, y0 + b ),  new Rect( x0, y0 + depth, x1, y0 + depth + rw ), true ],
      bottom: [ new Rect( x0, y1 - b, x1, y1 ),  new Rect( x0, y1 - depth - rw, x1, y1 - depth ), true ] };
   var res = {};
   for ( var side in bands )
   {
      var e = bandNoise( rows, bands[side][0], bands[side][2] );
      var r = bandNoise( rows, bands[side][1], bands[side][2] );
      var ratios = [];
      for ( var i = 0; i < e.length; ++i )
         ratios.push( e[i] / r[i] );
      res[side] = { median: medianArray( ratios ), max: maxArray( ratios ) };
   }
   return res;
}

// ============================================================================
// Common crop and indicators
// ============================================================================

var SIDES = [ "left", "right", "top", "bottom" ];

function sideName( s )
{
   return { left: L( "gauche", "left" ), right: L( "droite", "right" ), top: L( "haut", "top" ), bottom: L( "bas", "bottom" ) }[s];
}

// slots: array of { name, view }
function computeCrop( slots, margin, frameW, frameH )
{
   if ( slots.length == 0 )
      throw new Error( L( "Aucun master chargé.", "No master loaded." ) );
   var W = slots[0].view.image.width, H = slots[0].view.image.height;
   for ( var i = 1; i < slots.length; ++i )
   {
      var im = slots[i].view.image;
      if ( im.width != W || im.height != H )
         throw new Error( format( L( "Dimensions différentes : %s = %dx%d, %s = %dx%d. Les masters doivent être intégrés sur la même référence, en composition « full ».",
                                     "Different dimensions: %s = %dx%d, %s = %dx%d. The masters must be integrated on the same reference frame, in 'full' composition." ),
                                  slots[0].name, W, H, slots[i].name, im.width, im.height ) );
   }

   var frameSource = { kind: "entered", src: "" };
   if ( frameW <= 0 || frameH <= 0 )
   {
      var fs = frameSizeFromHeader( slots[0].view.window );
      if ( fs != null )
      {
         frameW = fs.w;
         frameH = fs.h;
         frameSource = { kind: "header", src: fs.source };
      }
      else
         frameSource = { kind: "estimate", src: "" };
   }
   var estimate = ( frameW <= 0 || frameH <= 0 );

   var perChannel = [];
   var comb = { left: 0, right: 0, top: 0, bottom: 0 };
   var limiting = { left: "", right: "", top: "", bottom: "" };
   var warnings = [];
   for ( var c = 0; c < slots.length; ++c )
   {
      var img = slots[c].view.image;
      var bb = nonNullBBox( img );
      var fw = frameW, fh = frameH;
      if ( estimate )
      {
         var est = inscribedRect( img );
         fw = est.width;
         fh = est.height;
      }
      var sx = bb.width - fw, sy = bb.height - fh;
      if ( sx < 0 || sy < 0 )
      {
         warnings.push( { name: slots[c].name, bw: bb.width, bh: bb.height, fw: fw, fh: fh } );
         sx = Math.max( sx, 0 );
         sy = Math.max( sy, 0 );
      }
      var m = { left: bb.left + sx, right: bb.right + sx, top: bb.top + sy, bottom: bb.bottom + sy };
      // field loss relative to one frame: share of a frame's field not covered by every sub-frame
      var loss = 1 - ( fw - sx ) * ( fh - sy ) / ( fw * fh );
      perChannel.push( { name: slots[c].name, view: slots[c].view, bbox: bb, spreadX: sx, spreadY: sy,
                         frameW: fw, frameH: fh, margins: m, loss: loss } );
      for ( var k = 0; k < SIDES.length; ++k )
      {
         var s = SIDES[k];
         if ( m[s] > comb[s] || limiting[s] == "" )
         {
            comb[s] = m[s];
            limiting[s] = slots[c].name;
         }
      }
   }

   var crop = { x0: comb.left + margin, y0: comb.top + margin, x1: W - comb.right - margin, y1: H - comb.bottom - margin };
   crop.width = crop.x1 - crop.x0;
   crop.height = crop.y1 - crop.y0;
   if ( crop.width < 64 || crop.height < 64 )
      throw new Error( format( L( "Recadrage dégénéré (%dx%d) : vérifier la taille des brutes.", "Degenerate crop (%dx%d): check the frame size." ), crop.width, crop.height ) );

   var ranking = perChannel.slice().sort( function( a, b ) { return b.loss - a.loss; } );
   var meanLoss = 0;
   for ( var p = 0; p < perChannel.length; ++p )
      meanLoss += perChannel[p].loss;
   meanLoss /= perChannel.length;
   var frameArea = frameW * frameH;
   if ( estimate )
   {
      frameArea = 0;
      for ( var q = 0; q < perChannel.length; ++q )
         frameArea += perChannel[q].frameW * perChannel[q].frameH;
      frameArea /= perChannel.length;
   }
   return { W: W, H: H, perChannel: perChannel, ranking: ranking, combined: comb, limiting: limiting,
            margin: margin, crop: crop, warnings: warnings, frameSource: frameSource, estimate: estimate,
            meanLoss: meanLoss, finalLossFrame: 1 - crop.width * crop.height / frameArea,
            finalLossCanvas: 1 - crop.width * crop.height / ( W * H ) };
}

// ============================================================================
// Creation of the cropped images
// ============================================================================

function applyAutoSTF( view )
{
   var img = view.image;
   var n = img.isColor ? 3 : 1;
   var c0 = 0, m = 0;
   for ( var c = 0; c < n; ++c )
   {
      img.selectedChannel = c;
      var med = img.median();
      var mad = 1.4826 * img.MAD();
      if ( 1 + mad != 1 )
         c0 += med - 2.8 * mad;
      m += med;
   }
   img.resetSelections();
   c0 = clamp( c0 / n, 0, 1 );
   m = mtf( 0.25, m / n - c0 );
   var stf = new ScreenTransferFunction;
   stf.STF = [ // c0, c1, m, r0, r1
      [ c0, 1, m, 0, 1 ],
      [ c0, 1, m, 0, 1 ],
      [ c0, 1, m, 0, 1 ],
      [ 0, 1, 0.5, 0, 1 ] ];
   stf.executeOn( view );
}

function createCroppedWindow( srcView, crop, id )
{
   var src = srcView.image;
   var n = src.numberOfChannels;
   var vid = validId( id );
   var win = new ImageWindow( crop.width, crop.height, n, src.bitsPerSample, src.isReal, src.isColor, vid );
   var v = win.mainView;
   v.beginProcess( UndoFlag.NoSwapFile );
   var dst = v.image;
   for ( var c = 0; c < n; ++c )
   {
      var Is = new ImageIterator( src, c ), Id = new ImageIterator( dst, c );
      for ( var y = 0; y < crop.height; ++y )
      {
         var sr = Is[crop.y0 + y], dr = Id[y];
         if ( typeof dr.set == "function" && typeof sr.subarray == "function" )
            dr.set( sr.subarray( crop.x0, crop.x1 ) );
         else
            for ( var x = 0; x < crop.width; ++x )
               dr[x] = sr[crop.x0 + x];
      }
   }
   v.endProcess();

   try
   {
      var kw = srcView.window.keywords;
      kw.push( new FITSKeyword( "HISTORY", "", format( "%s %s: crop x0=%d y0=%d w=%d h=%d from %s",
                                                     TITLE, VERSION, crop.x0, crop.y0, crop.width, crop.height, srcView.id ) ) );
      win.keywords = kw;
   }
   catch ( e )
   {
      console.warningln( L( "Mots-clés non copiés : ", "Keywords not copied: " ) + errText( e ) );
   }
   win.show();
   try
   {
      win.zoomFactor = -Math.max( 1, Math.ceil( crop.width / TARGET_WINDOW_W ) );
      win.fitWindow();
   }
   catch ( e )
   {
      try { win.zoomToFit(); } catch ( e2 ) {}
   }
   try { applyAutoSTF( v ); } catch ( e3 ) { console.warningln( L( "STF non appliquée : ", "STF not applied: " ) + errText( e3 ) ); }
   return win;
}

// Crops a master in place with the Crop process (one undoable history step).
// The CommonCrop preview is removed first: its rectangle would no longer fit.
function cropInPlace( view, crop )
{
   var W = view.image.width, H = view.image.height;
   removeCropPreview( view.window );
   var P = new Crop;
   P.leftMargin   = -crop.x0;
   P.topMargin    = -crop.y0;
   P.rightMargin  = -( W - crop.x1 );
   P.bottomMargin = -( H - crop.y1 );
   var absPx = 1;   // CropMode::AbsolutePixels
   try { if ( Crop.AbsolutePixels !== undefined ) absPx = Crop.AbsolutePixels; } catch ( e ) {}
   P.mode = absPx;
   P.noGUIMessages = true;
   if ( !P.executeOn( view ) )
      throw new Error( format( L( "le process Crop a échoué sur %s", "the Crop process failed on %s" ), view.id ) );
   if ( view.image.width != crop.width || view.image.height != crop.height )
      throw new Error( format( L( "%s : taille obtenue %dx%d au lieu de %dx%d", "%s: got %dx%d instead of %dx%d" ),
                               view.id, view.image.width, view.image.height, crop.width, crop.height ) );
   try
   {
      var kw = view.window.keywords;
      kw.push( new FITSKeyword( "HISTORY", "", format( "%s %s: in-place crop x0=%d y0=%d w=%d h=%d",
                                                     TITLE, VERSION, crop.x0, crop.y0, crop.width, crop.height ) ) );
      view.window.keywords = kw;
   }
   catch ( e2 )
   {
      console.warningln( L( "Mot-clé HISTORY non ajouté : ", "HISTORY keyword not added: " ) + errText( e2 ) );
   }
}

// ============================================================================
// Check previews
// ============================================================================

function setCropPreview( window, crop )
{
   var rect = new Rect( crop.x0, crop.y0, crop.x1, crop.y1 );
   var p = null;
   try { p = window.previewById( PREVIEW_ID ); } catch ( e ) { p = null; }
   if ( p != null && !p.isNull )
   {
      try
      {
         window.modifyPreview( p, rect, PREVIEW_ID );
         return;
      }
      catch ( e2 )
      {
         try { window.deletePreview( p ); } catch ( e3 ) {}
      }
   }
   window.createPreview( rect, PREVIEW_ID );
}

function removeCropPreview( window )
{
   try
   {
      var p = window.previewById( PREVIEW_ID );
      if ( p != null && !p.isNull )
         window.deletePreview( p );
   }
   catch ( e ) {}
}

// ============================================================================
// Reports (HTML for the dialog, text for the console)
// ============================================================================

function pct( x )
{
   return format( "%.1f %%", 100 * x );
}

function geometryReport( res )
{
   var star = res.estimate ? "*" : "";
   var h = "<table cellspacing='4'><tr><th align='left'>" + L( "Filtre", "Filter" ) + "</th><th>" + L( "Brute", "Frame" ) +
           "</th><th>" + L( "Étalement x/y", "Spread x/y" ) + "</th><th>" + L( "Gauche", "Left" ) + "</th><th>" + L( "Droite", "Right" ) +
           "</th><th>" + L( "Haut", "Top" ) + "</th><th>" + L( "Bas", "Bottom" ) + "</th><th>" + L( "Perte de champ", "Field loss" ) + "</th></tr>";
   var t = pad( L( "filtre", "filter" ), 7 ) + pad( L( "brute", "frame" ), 11 ) + pad( L( "étal.x/y", "spread" ), 10 ) +
           pad( L( "gauche", "left" ), 8 ) + pad( L( "droite", "right" ), 8 ) + pad( L( "haut", "top" ), 8 ) + pad( L( "bas", "bottom" ), 8 ) + L( "perte", "loss" ) + "\n";
   for ( var i = 0; i < res.ranking.length; ++i )
   {
      var c = res.ranking[i];
      var cells = [ c.name, c.frameW + "x" + c.frameH + star, c.spreadX + "/" + c.spreadY,
                    c.margins.left, c.margins.right, c.margins.top, c.margins.bottom, pct( c.loss ) + star ];
      h += "<tr><td>" + ( i == 0 ? "<b>" + c.name + "</b>" : c.name ) + "</td>";
      for ( var k = 1; k < cells.length; ++k )
         h += "<td align='right'>" + cells[k] + "</td>";
      h += "</tr>";
      t += pad( cells[0], 7 ) + pad( cells[1], 11 ) + pad( cells[2], 10 ) + pad( cells[3], 8 ) + pad( cells[4], 8 ) + pad( cells[5], 8 ) + pad( cells[6], 8 ) + cells[7] + "\n";
   }
   h += "</table>";
   var lines = [];
   var fsText = ( res.frameSource.kind == "header" ) ? L( "en-tête ", "header " ) + res.frameSource.src
              : ( res.frameSource.kind == "estimate" ) ? L( "estimation (rectangle inscrit), approximative", "estimate (inscribed rectangle), approximate" )
              : L( "saisie", "entered" );
   lines.push( format( L( "Canevas %dx%d px. Taille de brute : %s.", "Canvas %dx%d px. Frame size: %s." ), res.W, res.H, fsText ) );
   lines.push( L( "Marges = pixels à retirer de chaque bord pour ne garder que la zone couverte par toutes les brutes du filtre. " +
                  "Perte de champ = part du champ d'une brute non couverte par toutes les brutes du filtre (classement du pire au meilleur).",
                  "Margins = pixels to remove from each edge to keep only the area covered by every sub-frame of the filter. " +
                  "Field loss = share of one frame's field not covered by every sub-frame of the filter (ranked worst first)." ) );
   if ( res.estimate )
      lines.push( L( "* taille de brute estimée : valeurs approximatives, saisir la résolution de la caméra.",
                     "* estimated frame size: approximate values, enter the camera resolution." ) );
   lines.push( format( L( "Intersection : gauche %d (%s), droite %d (%s), haut %d (%s), bas %d (%s) ; marge de sécurité %d px.",
                          "Intersection: left %d (%s), right %d (%s), top %d (%s), bottom %d (%s); safety margin %d px." ),
                       res.combined.left, res.limiting.left, res.combined.right, res.limiting.right,
                       res.combined.top, res.limiting.top, res.combined.bottom, res.limiting.bottom, res.margin ) );
   lines.push( "<b>" + format( L( "Recadrage : x0=%d y0=%d, %dx%d px.", "Crop: x0=%d y0=%d, %dx%d px." ), res.crop.x0, res.crop.y0, res.crop.width, res.crop.height ) + "</b> " +
               format( L( "Perte de champ moyenne par filtre %s ; recadrage final : %s d'une brute, %s du canevas.",
                          "Mean field loss per filter %s; final crop: %s of one frame, %s of the canvas." ),
                       pct( res.meanLoss ), pct( res.finalLossFrame ), pct( res.finalLossCanvas ) ) );
   for ( var w = 0; w < res.warnings.length; ++w )
   {
      var wn = res.warnings[w];
      lines.push( "<b>" + L( "Attention : ", "Warning: " ) + "</b>" +
                  format( L( "%s : zone non nulle (%dx%d) plus petite que la brute (%dx%d), étalement forcé à 0.",
                             "%s: non-zero area (%dx%d) smaller than a frame (%dx%d), spread forced to 0." ),
                          wn.name, wn.bw, wn.bh, wn.fw, wn.fh ) );
   }
   var summaryHtml = "<p>" + lines.join( "</p><p>" ) + "</p>";
   var text = lines.join( "\n" ).replace( /<[^>]+>/g, "" ) + "\n" + t;
   return { html: h, summaryHtml: summaryHtml, text: text };
}

function checkReport( checks, threshold )
{
   var h = "<table cellspacing='4'><tr><th align='left'>" + L( "Filtre", "Filter" ) + "</th>";
   var t = pad( L( "filtre", "filter" ), 7 );
   for ( var k = 0; k < SIDES.length; ++k )
   {
      h += "<th>" + sideName( SIDES[k] ) + "</th>";
      t += pad( sideName( SIDES[k] ), 14 );
   }
   h += "</tr>";
   t += "\n";
   var nBad = 0;
   for ( var i = 0; i < checks.length; ++i )
   {
      h += "<tr><td>" + checks[i].name + "</td>";
      t += pad( checks[i].name, 7 );
      for ( var s = 0; s < SIDES.length; ++s )
      {
         var c = checks[i].result[SIDES[s]];
         var bad = c.median > threshold;
         if ( bad )
            ++nBad;
         var cell = format( "%.2f", c.median ) + format( " (%.2f)", c.max );
         h += "<td align='right'>" + ( bad ? "<b>" + cell + " !</b>" : cell ) + "</td>";
         t += pad( cell + ( bad ? " !" : "" ), 14 );
      }
      h += "</tr>";
      t += "\n";
   }
   h += "</table>";
   var verdict = ( nBad == 0 ) ? L( "Tous les bords sont dans la zone de bruit stable.", "All edges are in the stable-noise area." )
                               : format( L( "%d bord(s) au-dessus du seuil : augmenter la marge.", "%d edge(s) above the threshold: increase the margin." ), nBad );
   var intro = format( L( "Contrôle de sortie : bruit sur %d px au bord du recadrage, rapporté au bruit %d px plus loin (médiane sur %d tronçons, seuil %.2f ; entre parenthèses le pire tronçon, sensible aux étoiles et aux nébulosités).",
                          "Output check: noise over %d px at the crop edge, divided by the noise %d px further in (median over %d segments, threshold %.2f; in brackets the worst segment, sensitive to stars and nebulosity)." ),
                       BAND_WIDTH, REF_DEPTH, N_SEGMENTS, threshold );
   return { html: "<p>" + intro + "</p>" + h + "<p><b>" + verdict + "</b></p>", text: intro + "\n" + t + verdict };
}

// ============================================================================
// Tooltips
// ============================================================================

function buildTips()
{
   if ( LANG == "fr" )
      return {
   lang: "<p>Langue de l'interface. Le dialogue se rouvre aussitôt dans la langue choisie, en gardant les images et les réglages. Le choix est mémorisé.</p>",
   open: "<p><b>Ouvre un ou plusieurs masters</b> et les range dans les emplacements d'après le mot-clé FITS <b>FILTER</b> (Red, Green, Blue, Luminance, Hydrogen-alpha, Oxygen III, Sulphur II, ou leurs abréviations), sinon d'après le nom du fichier. Un filtre inconnu ou en double va dans AUX1 puis AUX2.</p>",
   views: "<p><b>Range les images déjà ouvertes</b> dans PixInsight, d'après leur mot-clé FILTER, sinon le nom du fichier ou l'identifiant de la vue.</p>",
   clearAll: "<p>Vide les neuf emplacements. Les images restent ouvertes.</p>",
   slot: "<p>Master intégré du filtre <b>%s</b>, tel que sorti de l'intégration (composition « full » : les zones non couvertes sont à 0). Tous les masters doivent avoir les mêmes dimensions.</p>",
   aux: "<p>Emplacement libre pour tout autre master de même géométrie (un filtre non reconnu, un deuxième Ha, une couche couleur...).</p>",
   browse: "<p>Ouvre un fichier image dans cet emplacement.</p>",
   clear: "<p>Vide cet emplacement.</p>",
   margin: "<p><b>Marge de sécurité</b>, retirée en plus de chaque côté après le calcul géométrique. Proposée : " + DEFAULT_MARGIN + " px. Le contrôle de sortie dit si elle suffit : un bord au-dessus du seuil demande une marge plus grande. Entre " + MARGIN_MIN + " et " + MARGIN_MAX + " px.</p>",
   frame: "<p><b>Taille d'une brute registrée</b> en pixels (résolution de la caméra au binning utilisé). C'est ce qui permet de déduire l'étalement des brutes à partir des seuls masters.</p><p>0 = lue dans l'en-tête (mot-clé INSTRUME) si la caméra est connue du script, sinon estimée par le plus grand rectangle inscrit dans la zone non nulle, à 30 px près environ.</p>",
   threshold: "<p><b>Seuil du contrôle de sortie</b> : ratio entre le bruit au bord du recadrage et le bruit plus à l'intérieur au-delà duquel un côté est signalé. 1,10 correspond à environ 83 % du poids d'intégration (1/1,10²).</p>",
   preview: "<p>Après Calculer, crée (ou met à jour) sur chaque master un preview nommé <b>" + PREVIEW_ID + "</b> au cadre exact du recadrage, pour un contrôle visuel.</p>",
   rename: "<p>À Appliquer, renomme chaque master d'entrée <b>&lt;filtre&gt;" + IN_SUFFIX + "</b> (L_master, R_master...). Ses pixels ne sont pas modifiés.</p>",
   removePreviews: "<p>Supprime les previews " + PREVIEW_ID + " des masters chargés.</p>",
   compute: "<p>Calcule le recadrage commun, les pertes de champ et le contrôle de bruit. Ne modifie rien.</p>",
   apply: "<p>Crée les images recadrées <b>&lt;filtre&gt;" + OUT_SUFFIX + "</b> (L_crop, R_crop...) avec une STF automatique et un zoom réduit. Les masters ne sont pas modifiés.</p><p>Avec <i>Recadrer sur place</i> : recadre directement les masters chargés, sans créer d'image.</p>",
   inPlace: "<p><b>Recadre directement les masters chargés</b>, sans créer d'images &lt;filtre&gt;" + OUT_SUFFIX + ". Chaque recadrage est une étape de l'historique PixInsight : Ctrl+Z (Annuler) sur la vue revient en arrière. Les fichiers sur disque ne changent que si vous les enregistrez.</p><p>Décoché (par défaut) : les masters restent intacts et le résultat est une nouvelle image par filtre, pratique pour comparer avec les previews.</p>",
   close: "<p>Ferme le dialogue.</p>",
   geometry: "<p>Pour chaque filtre : taille de brute, étalement des brutes (excédent de la zone non nulle sur une brute), marges de la zone couverte par toutes les brutes, et perte de champ. Classement du pire au meilleur.</p>",
   check: "<p>Ratio de bruit au bord du recadrage, par côté. Autour de 1,0 : le bord est dans la zone pleinement intégrée. Lire la médiane ; le maximum entre parenthèses réagit aux étoiles et aux nébulosités.</p>" };
   return {
   lang: "<p>Interface language. The dialog reopens right away in the chosen language, keeping the images and the settings. The choice is remembered.</p>",
   open: "<p><b>Opens one or more masters</b> and sorts them into the slots from the FITS <b>FILTER</b> keyword (Red, Green, Blue, Luminance, Hydrogen-alpha, Oxygen III, Sulphur II, or their abbreviations), else from the file name. An unknown or duplicate filter goes to AUX1, then AUX2.</p>",
   views: "<p><b>Sorts the images already open</b> in PixInsight, from their FILTER keyword, else the file name or the view identifier.</p>",
   clearAll: "<p>Empties the nine slots. The images stay open.</p>",
   slot: "<p>Integrated master of filter <b>%s</b>, as produced by the integration ('full' composition: uncovered areas are 0). All masters must have the same dimensions.</p>",
   aux: "<p>Free slot for any other master with the same geometry (an unrecognised filter, a second Ha, a colour layer...).</p>",
   browse: "<p>Opens an image file into this slot.</p>",
   clear: "<p>Empties this slot.</p>",
   margin: "<p><b>Safety margin</b>, removed on every side on top of the geometric result. Suggested: " + DEFAULT_MARGIN + " px. The output check tells whether it is enough: an edge above the threshold calls for a larger margin. Between " + MARGIN_MIN + " and " + MARGIN_MAX + " px.</p>",
   frame: "<p><b>Size of one registered sub-frame</b> in pixels (camera resolution at the binning used). This is what lets the script derive the spread of the sub-frames from the masters alone.</p><p>0 = read from the header (INSTRUME keyword) when the camera is known to the script, else estimated by the largest rectangle inscribed in the non-zero area, within about 30 px.</p>",
   threshold: "<p><b>Output check threshold</b>: ratio between the noise at the crop edge and the noise further in, above which a side is flagged. 1.10 corresponds to about 83 % of the integration weight (1/1.10²).</p>",
   preview: "<p>After Compute, creates (or updates) on each master a preview named <b>" + PREVIEW_ID + "</b> on the exact crop rectangle, for a visual check.</p>",
   rename: "<p>On Apply, renames each input master <b>&lt;filter&gt;" + IN_SUFFIX + "</b> (L_master, R_master...). Its pixels are not modified.</p>",
   removePreviews: "<p>Removes the " + PREVIEW_ID + " previews from the loaded masters.</p>",
   compute: "<p>Computes the common crop, the field losses and the noise check. Modifies nothing.</p>",
   apply: "<p>Creates the cropped images <b>&lt;filter&gt;" + OUT_SUFFIX + "</b> (L_crop, R_crop...) with an automatic STF and a reduced zoom. The masters are not modified.</p><p>With <i>Crop in place</i>: crops the loaded masters directly, without creating images.</p>",
   inPlace: "<p><b>Crops the loaded masters directly</b>, without creating &lt;filter&gt;" + OUT_SUFFIX + " images. Each crop is one step of the PixInsight history: Ctrl+Z (Undo) on the view reverts it. Files on disk only change if you save them.</p><p>Unchecked (default): the masters stay untouched and the result is one new image per filter, handy to compare with the previews.</p>",
   close: "<p>Closes the dialog.</p>",
   geometry: "<p>Per filter: frame size, spread of the sub-frames (excess of the non-zero area over one frame), margins of the area covered by every sub-frame, and field loss. Ranked worst first.</p>",
   check: "<p>Noise ratio at the crop edge, per side. Around 1.0: the edge is inside the fully integrated area. Read the median; the maximum in brackets reacts to stars and nebulosity.</p>" };
}

// ============================================================================
// Dialog
// ============================================================================

var CropDialog = class extends Dialog {
constructor()
{
   super();
   var self = this;
   this.windowTitle = TITLE + " " + VERSION;
   this.relaunch = false;
   this.slots = [];

   // --- help and language ---------------------------------------------------
   this.helpLabel = new Label( this );
   this.helpLabel.useRichText = true;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.text = L( "<p><b>Recadrage commun des masters</b> sur la zone couverte par toutes les brutes de tous les canaux, à partir des seuls masters intégrés en composition « full ». " +
                            "<i>1. Charger les masters (le tri par filtre est automatique), 2. Calculer, 3. vérifier le contrôle et les previews, 4. Appliquer. Survoler un réglage pour une explication.</i></p>",
                            "<p><b>Common crop of the masters</b> on the area covered by every sub-frame of every channel, from the integrated masters alone ('full' composition). " +
                            "<i>1. Load the masters (sorting by filter is automatic), 2. Compute, 3. check the report and the previews, 4. Apply. Hover over any setting for an explanation.</i></p>" );

   this.langLabel = new Label( this );
   this.langLabel.text = "Langue / Language :";
   this.langLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.langLabel.toolTip = TIPS.lang;
   this.langCombo = new ComboBox( this );
   this.langCombo.addItem( "English" );
   this.langCombo.addItem( "Français" );
   this.langCombo.currentItem = LANG == "fr" ? 1 : 0;
   this.langCombo.toolTip = TIPS.lang;
   this.langCombo.onItemSelected = function( idx )
   {
      var nl = idx == 1 ? "fr" : "en";
      if ( nl == LANG )
         return;
      saveLanguage( nl );
      LANG = nl;
      self.storeState();
      self.relaunch = true;
      self.ok();
   };
   var topRow = new HorizontalSizer;
   topRow.spacing = 8;
   topRow.add( this.helpLabel, 100 );
   topRow.add( this.langLabel );
   topRow.add( this.langCombo );

   // --- loading -------------------------------------------------------------
   this.openButton = new PushButton( this );
   this.openButton.text = L( "Ouvrir des fichiers...", "Open files..." );
   this.openButton.toolTip = TIPS.open;
   this.openButton.onClick = function() { self.openFiles(); };
   this.viewsButton = new PushButton( this );
   this.viewsButton.text = L( "Ranger les vues ouvertes", "Sort open views" );
   this.viewsButton.toolTip = TIPS.views;
   this.viewsButton.onClick = function() { self.autoAssignOpenViews(); };
   this.clearAllButton = new PushButton( this );
   this.clearAllButton.text = L( "Tout vider", "Clear all" );
   this.clearAllButton.toolTip = TIPS.clearAll;
   this.clearAllButton.onClick = function() { for ( var i = 0; i < self.slots.length; ++i ) self.setSlotView( self.slots[i], null ); };
   var loadRow = new HorizontalSizer;
   loadRow.spacing = 6;
   loadRow.add( this.openButton );
   loadRow.add( this.viewsButton );
   loadRow.add( this.clearAllButton );
   loadRow.addStretch();

   this.slotsGroup = new GroupBox( this );
   this.slotsGroup.title = L( "Masters", "Masters" );
   this.slotsGroup.sizer = new VerticalSizer;
   this.slotsGroup.sizer.margin = 6;
   this.slotsGroup.sizer.spacing = 4;
   this.slotsGroup.sizer.add( loadRow );
   var labelWidth = this.font.width( "AUX2 " ) + 8;
   for ( var i = 0; i < SLOT_NAMES.length; ++i )
      this.slotsGroup.sizer.add( this.makeSlotRow( SLOT_NAMES[i], labelWidth ) );

   // --- settings ------------------------------------------------------------
   this.paramsGroup = new GroupBox( this );
   this.paramsGroup.title = L( "Réglages", "Settings" );
   this.paramsGroup.sizer = new VerticalSizer;
   this.paramsGroup.sizer.margin = 6;
   this.paramsGroup.sizer.spacing = 6;

   this.marginLabel = new Label( this );
   this.marginLabel.text = L( "Marge de sécurité (px) :", "Safety margin (px):" );
   this.marginLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.marginLabel.toolTip = TIPS.margin;
   this.marginSpin = new SpinBox( this );
   this.marginSpin.minValue = MARGIN_MIN;
   this.marginSpin.maxValue = MARGIN_MAX;
   this.marginSpin.value = clamp( STATE.margin, MARGIN_MIN, MARGIN_MAX );
   this.marginSpin.toolTip = TIPS.margin;

   this.frameLabel = new Label( this );
   this.frameLabel.text = L( "Taille des brutes (px) :", "Frame size (px):" );
   this.frameLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.frameLabel.toolTip = TIPS.frame;
   this.frameWSpin = new SpinBox( this );
   this.frameWSpin.minValue = 0;
   this.frameWSpin.maxValue = 65535;
   this.frameWSpin.value = TP.frameW;
   this.frameWSpin.toolTip = TIPS.frame;
   this.frameWSpin.onValueUpdated = function( v ) { TP.frameW = v; };
   this.frameXLabel = new Label( this );
   this.frameXLabel.text = "x";
   this.frameHSpin = new SpinBox( this );
   this.frameHSpin.minValue = 0;
   this.frameHSpin.maxValue = 65535;
   this.frameHSpin.value = TP.frameH;
   this.frameHSpin.toolTip = TIPS.frame;
   this.frameHSpin.onValueUpdated = function( v ) { TP.frameH = v; };

   this.thresholdLabel = new Label( this );
   this.thresholdLabel.text = L( "Seuil de contrôle :", "Check threshold:" );
   this.thresholdLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.thresholdLabel.toolTip = TIPS.threshold;
   this.thresholdEdit = new NumericEdit( this );
   this.thresholdEdit.label.visible = false;
   this.thresholdEdit.setRange( 1.00, 2.00 );
   this.thresholdEdit.setPrecision( 2 );
   this.thresholdEdit.setValue( TP.threshold );
   this.thresholdEdit.toolTip = TIPS.threshold;
   this.thresholdEdit.onValueUpdated = function( v ) { TP.threshold = v; };

   var row1 = new HorizontalSizer;
   row1.spacing = 6;
   row1.add( this.marginLabel );
   row1.add( this.marginSpin );
   row1.addSpacing( 12 );
   row1.add( this.frameLabel );
   row1.add( this.frameWSpin );
   row1.add( this.frameXLabel );
   row1.add( this.frameHSpin );
   row1.addSpacing( 12 );
   row1.add( this.thresholdLabel );
   row1.add( this.thresholdEdit );
   row1.addStretch();

   this.previewCheck = new CheckBox( this );
   this.previewCheck.text = L( "Preview du cadre sur chaque master", "Preview of the crop on each master" );
   this.previewCheck.checked = TP.preview;
   this.previewCheck.toolTip = TIPS.preview;
   this.previewCheck.onCheck = function( c ) { TP.preview = c; };
   this.renameCheck = new CheckBox( this );
   this.renameCheck.text = L( "Renommer les entrées en <filtre>" + IN_SUFFIX, "Rename inputs to <filter>" + IN_SUFFIX );
   this.renameCheck.checked = TP.rename;
   this.renameCheck.toolTip = TIPS.rename;
   this.renameCheck.onCheck = function( c ) { TP.rename = c; };
   this.inPlaceCheck = new CheckBox( this );
   this.inPlaceCheck.text = L( "Recadrer sur place (sans nouvelles images)", "Crop in place (no new images)" );
   this.inPlaceCheck.checked = TP.inPlace;
   this.inPlaceCheck.toolTip = TIPS.inPlace;
   this.inPlaceCheck.onCheck = function( c ) { TP.inPlace = c; self.renameCheck.enabled = !c; };
   this.renameCheck.enabled = !TP.inPlace;
   this.removePreviewsButton = new PushButton( this );
   this.removePreviewsButton.text = L( "Supprimer les previews", "Remove previews" );
   this.removePreviewsButton.toolTip = TIPS.removePreviews;
   this.removePreviewsButton.onClick = function()
   {
      var f = self.filledSlots();
      for ( var i = 0; i < f.length; ++i )
         removeCropPreview( f[i].view.window );
   };
   var row2 = new HorizontalSizer;
   row2.spacing = 12;
   row2.add( this.previewCheck );
   row2.add( this.renameCheck );
   row2.add( this.inPlaceCheck );
   row2.add( this.removePreviewsButton );
   row2.addStretch();
   this.paramsGroup.sizer.add( row1 );
   this.paramsGroup.sizer.add( row2 );

   // --- reports -------------------------------------------------------------
   this.geomGroup = new GroupBox( this );
   this.geomGroup.title = L( "Géométrie et perte de champ par filtre", "Geometry and field loss per filter" );
   this.geomGroup.toolTip = TIPS.geometry;
   this.geomGroup.sizer = new VerticalSizer;
   this.geomGroup.sizer.margin = 6;
   this.geomLabel = new Label( this );
   this.geomLabel.useRichText = true;
   this.geomLabel.wordWrapping = true;
   this.geomLabel.toolTip = TIPS.geometry;
   this.summaryLabel = new Label( this );
   this.summaryLabel.useRichText = true;
   this.summaryLabel.wordWrapping = true;
   this.geomGroup.sizer.add( this.geomLabel );
   this.geomGroup.sizer.add( this.summaryLabel );

   this.checkGroup = new GroupBox( this );
   this.checkGroup.title = L( "Contrôle de sortie", "Output check" );
   this.checkGroup.toolTip = TIPS.check;
   this.checkGroup.sizer = new VerticalSizer;
   this.checkGroup.sizer.margin = 6;
   this.checkLabel = new Label( this );
   this.checkLabel.useRichText = true;
   this.checkLabel.wordWrapping = true;
   this.checkLabel.toolTip = TIPS.check;
   this.checkGroup.sizer.add( this.checkLabel );

   // --- buttons -------------------------------------------------------------
   this.computeButton = new PushButton( this );
   this.computeButton.text = L( "Calculer", "Compute" );
   this.computeButton.toolTip = TIPS.compute;
   this.computeButton.onClick = function() { self.doCompute(); };
   this.applyButton = new PushButton( this );
   this.applyButton.text = L( "Appliquer", "Apply" );
   this.applyButton.toolTip = TIPS.apply;
   this.applyButton.icon = this.scaledResource( ":/icons/ok.png" );
   this.applyButton.onClick = function() { self.doApply(); };
   this.closeButton = new PushButton( this );
   this.closeButton.text = L( "Fermer", "Close" );
   this.closeButton.toolTip = TIPS.close;
   this.closeButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.closeButton.onClick = function() { saveSettings(); self.storeState(); self.ok(); };
   var buttons = new HorizontalSizer;
   buttons.spacing = 6;
   buttons.addStretch();
   buttons.add( this.computeButton );
   buttons.add( this.applyButton );
   buttons.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( topRow );
   this.sizer.add( this.slotsGroup );
   this.sizer.add( this.paramsGroup );
   this.sizer.add( this.geomGroup );
   this.sizer.add( this.checkGroup );
   this.sizer.add( buttons );

   this.restoreState();
   this.renderReports();
   this.adjustToContents();
   this.setMinWidth( this.logicalPixelsToPhysical( 900 ) );
}

makeSlotRow( name, labelWidth )
{
   var self = this;
   var slot = { name: name, view: null };
   var label = new Label( this );
   label.text = name;
   label.setFixedWidth( labelWidth );
   label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   var tip = ( name.indexOf( "AUX" ) == 0 ) ? TIPS.aux : TIPS.slot.replace( "%s", name );
   label.toolTip = tip;
   var list = new ViewList( this );
   list.getMainViews();
   list.toolTip = tip;
   list.onViewSelected = function( view ) { self.setSlotView( slot, ( view != null && !view.isNull ) ? view : null ); };
   var dims = new Label( this );
   dims.text = "";
   dims.setFixedWidth( this.font.width( "99999x99999 " ) + 8 );
   dims.textAlignment = TextAlignment.Left | TextAlignment.VertCenter;
   var browse = new ToolButton( this );
   browse.icon = this.scaledResource( ":/icons/select-file.png" );
   browse.toolTip = TIPS.browse;
   browse.onClick = function()
   {
      var ofd = new OpenFileDialog;
      ofd.caption = TITLE + " : " + name;
      ofd.multipleSelections = false;
      ofd.loadImageFilters();
      if ( ofd.execute() )
         self.openFileIntoSlot( slot, ofd.fileName );
   };
   var clear = new ToolButton( this );
   clear.icon = this.scaledResource( ":/icons/clear.png" );
   clear.toolTip = TIPS.clear;
   clear.onClick = function() { self.setSlotView( slot, null ); };
   slot.list = list;
   slot.dims = dims;
   var row = new HorizontalSizer;
   row.spacing = 4;
   row.add( label );
   row.add( list, 100 );
   row.add( dims );
   row.add( browse );
   row.add( clear );
   this.slots.push( slot );
   return row;
}

setSlotView( slot, view )
{
   if ( view == null || view.isNull )
   {
      slot.view = null;
      slot.dims.text = "";
      try { slot.list.currentView = null; } catch ( e ) {}
      return;
   }
   if ( !view.isMainView )
      view = view.window.mainView;
   slot.view = view;
   slot.dims.text = view.image.width + "x" + view.image.height;
   try { slot.list.currentView = view; } catch ( e ) {}
}

slotByName( name )
{
   for ( var i = 0; i < this.slots.length; ++i )
      if ( this.slots[i].name == name )
         return this.slots[i];
   return null;
}

refreshLists()
{
   for ( var i = 0; i < this.slots.length; ++i )
   {
      var s = this.slots[i];
      s.list.getMainViews();
      if ( s.view != null )
         try { s.list.currentView = s.view; } catch ( e ) {}
   }
}

filledSlots()
{
   var f = [];
   for ( var i = 0; i < this.slots.length; ++i )
      if ( this.slots[i].view != null && !this.slots[i].view.isNull )
         f.push( { name: this.slots[i].name, view: this.slots[i].view } );
   return f;
}

// Redisplays the reports from the data, in the current language
renderReports()
{
   if ( STATE.res == null )
   {
      this.geomLabel.text = "<p>" + L( "Charger les masters puis cliquer sur Calculer.", "Load the masters, then click Compute." ) + "</p>";
      this.summaryLabel.text = "";
      this.checkLabel.text = "";
      return;
   }
   var g = geometryReport( STATE.res );
   var tail = "";
   if ( STATE.extra != null )
   {
      var x = STATE.extra;
      if ( x.nPrev >= 0 )
         tail += format( L( "Preview « %s » créé ou mis à jour sur %d master(s). ", "Preview '%s' created or updated on %d master(s). " ), PREVIEW_ID, x.nPrev );
      tail += format( L( "Géométrie %.1f s, contrôle %.1f s.", "Geometry %.1f s, check %.1f s." ), x.tGeom, x.tCheck );
   }
   if ( STATE.applied != null )
      tail += ( tail.length ? " " : "" ) + "<b>" +
              ( STATE.applied.inPlace
                 ? format( L( "Recadrés sur place : %s (%.1f s). Ctrl+Z sur une vue pour annuler.", "Cropped in place: %s (%.1f s). Ctrl+Z on a view to undo." ),
                           STATE.applied.ids.join( ", " ), STATE.applied.t )
                 : format( L( "Images créées : %s (%.1f s).", "Images created: %s (%.1f s)." ),
                           STATE.applied.ids.join( ", " ), STATE.applied.t ) ) + "</b>";
   this.geomLabel.text = g.html;
   this.summaryLabel.text = g.summaryHtml + ( tail.length ? "<p>" + tail + "</p>" : "" );
   this.checkLabel.text = ( STATE.checks != null ) ? checkReport( STATE.checks, TP.threshold ).html : "";
}

storeState()
{
   STATE.slotIds = {};
   for ( var i = 0; i < this.slots.length; ++i )
      if ( this.slots[i].view != null && !this.slots[i].view.isNull )
         STATE.slotIds[this.slots[i].name] = this.slots[i].view.id;
   STATE.margin = this.marginSpin.value;
}

restoreState()
{
   for ( var i = 0; i < this.slots.length; ++i )
   {
      var id = STATE.slotIds[this.slots[i].name];
      if ( id )
      {
         var v = findView( id );
         if ( v != null )
            this.setSlotView( this.slots[i], v );
      }
   }
}

// Puts a window in the slot deduced from its filter; AUX1/AUX2 otherwise
assignWindow( window, logLines )
{
   var name = slotForWindow( window );
   var slot = ( name != "" ) ? this.slotByName( name ) : null;
   if ( slot == null || slot.view != null )
   {
      slot = null;
      var auxNames = [ "AUX1", "AUX2" ];
      for ( var i = 0; i < auxNames.length; ++i )
      {
         var s = this.slotByName( auxNames[i] );
         if ( s.view == null )
         {
            slot = s;
            break;
         }
      }
   }
   var label = window.filePath ? File.extractNameAndExtension( window.filePath ) : window.mainView.id;
   if ( slot == null )
   {
      logLines.push( format( L( "  %s : aucun emplacement libre (filtre « %s »)", "  %s: no free slot (filter '%s')" ), label, keywordValue( window, "FILTER" ) ) );
      return;
   }
   this.setSlotView( slot, window.mainView );
   logLines.push( format( L( "  %s -> %s (filtre « %s »)", "  %s -> %s (filter '%s')" ), label, slot.name, keywordValue( window, "FILTER" ) ) );
}

openAndAssign( paths )
{
   var lines = [];
   for ( var i = 0; i < paths.length; ++i )
   {
      var wins = [];
      try { wins = ImageWindow.open( paths[i] ); } catch ( e ) { lines.push( "  " + paths[i] + " : " + errText( e ) ); continue; }
      if ( wins.length == 0 )
      {
         lines.push( "  " + paths[i] + L( " : ouverture impossible", ": cannot open" ) );
         continue;
      }
      for ( var k = 1; k < wins.length; ++k )
         wins[k].forceClose();
      wins[0].show();
      this.assignWindow( wins[0], lines );
   }
   this.refreshLists();
   this.summaryLabel.text = "<p>" + lines.join( "<br>" ) + "</p>";
   log( TITLE + L( " : chargement", ": loading" ) + "\n" + lines.join( "\n" ) );
}

openFiles()
{
   var ofd = new OpenFileDialog;
   ofd.caption = TITLE + L( " : masters à ranger", ": masters to sort" );
   ofd.multipleSelections = true;
   ofd.loadImageFilters();
   if ( ofd.execute() )
      this.openAndAssign( ofd.fileNames );
}

autoAssignOpenViews()
{
   var lines = [];
   var wins = ImageWindow.windows;
   for ( var i = 0; i < wins.length; ++i )
   {
      var w = wins[i];
      if ( w == null || w.isNull )
         continue;
      var already = false;
      for ( var k = 0; k < this.slots.length; ++k )
         if ( this.slots[k].view != null && this.slots[k].view.id == w.mainView.id )
            already = true;
      if ( !already )
         this.assignWindow( w, lines );
   }
   this.refreshLists();
   this.summaryLabel.text = "<p>" + ( lines.length > 0 ? lines.join( "<br>" ) : L( "Aucune vue à ranger.", "No view to sort." ) ) + "</p>";
}

openFileIntoSlot( slot, path )
{
   var wins = ImageWindow.open( path );
   if ( wins.length == 0 )
   {
      ( new MessageBox( L( "Impossible d'ouvrir ", "Cannot open " ) + path, TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
      return;
   }
   for ( var k = 1; k < wins.length; ++k )
      wins[k].forceClose();
   wins[0].show();
   this.setSlotView( slot, wins[0].mainView );
   this.refreshLists();
}

doCompute()
{
   var self = this;
   var slots = this.filledSlots();
   try
   {
      console.show();
      log( "<end><cbr><b>" + TITLE + " " + VERSION + L( " : calcul", ": compute" ) + "</b>" );
      var t0 = Date.now();
      var res = computeCrop( slots, this.marginSpin.value, TP.frameW, TP.frameH );
      var t1 = Date.now();
      var checks = [];
      for ( var i = 0; i < slots.length; ++i )
         checks.push( { name: slots[i].name, result: edgeCheck( slots[i].view.image, res.crop ) } );
      var t2 = Date.now();
      var nPrev = -1;
      if ( TP.preview )
      {
         nPrev = 0;
         for ( var p = 0; p < slots.length; ++p )
         {
            try
            {
               setCropPreview( slots[p].view.window, res.crop );
               ++nPrev;
            }
            catch ( e )
            {
               console.warningln( L( "Preview impossible sur ", "Cannot create the preview on " ) + slots[p].view.id + " : " + errText( e ) );
            }
         }
      }
      STATE.res = res;
      STATE.checks = checks;
      STATE.extra = { nPrev: nPrev, tGeom: ( t1 - t0 ) / 1000, tCheck: ( t2 - t1 ) / 1000 };
      STATE.applied = null;
      this.renderReports();
      var g = geometryReport( res );
      var c = checkReport( checks, TP.threshold );
      log( g.text + "\n" + c.text );
      saveSettings();
      this.adjustToContents();
   }
   catch ( e )
   {
      this.summaryLabel.text = "<p><b>" + L( "Erreur : ", "Error: " ) + "</b>" + errText( e ).replace( /\n/g, "<br>" ) + "</p>";
      console.criticalln( TITLE + " : " + errText( e ) );
   }
}

doApply()
{
   var slots = this.filledSlots();
   try
   {
      console.show();
      log( "<end><cbr><b>" + TITLE + " " + VERSION + L( " : application", ": apply" ) + "</b>" );
      var res = computeCrop( slots, this.marginSpin.value, TP.frameW, TP.frameH );
      log( format( L( "  recadrage x0=%d y0=%d %dx%d", "  crop x0=%d y0=%d %dx%d" ), res.crop.x0, res.crop.y0, res.crop.width, res.crop.height ) );
      var t0 = Date.now();
      var created = [];
      if ( TP.inPlace )
      {
         // A master with no zero border at all has most likely been cropped already:
         // cropping it again would only eat into the image by the margin.
         var already = res.perChannel.filter( function( c )
            { return c.bbox.left == 0 && c.bbox.top == 0 && c.bbox.right == 0 && c.bbox.bottom == 0; } );
         if ( already.length > 0 )
            throw new Error( format( L( "%s : aucun bord nul, master déjà recadré ? Recadrage sur place annulé (Ctrl+Z pour revenir à l'original).",
                                        "%s: no zero border, master already cropped? In-place crop cancelled (Ctrl+Z to go back to the original)." ),
                                     already.map( function( c ) { return c.name; } ).join( ", " ) ) );
         for ( var k = 0; k < slots.length; ++k )
         {
            cropInPlace( slots[k].view, res.crop );
            created.push( slots[k].view.id );
            log( format( "  %s : %dx%d (%s)", slots[k].view.id, res.crop.width, res.crop.height, L( "sur place", "in place" ) ) );
         }
      }
      for ( var i = 0; i < slots.length && !TP.inPlace; ++i )
      {
         var s = slots[i];
         if ( TP.rename && s.view.id != s.name + IN_SUFFIX )
         {
            try
            {
               var oldId = s.view.id;
               s.view.id = validId( s.name + IN_SUFFIX );
               log( "  " + oldId + L( " renommé ", " renamed " ) + s.view.id );
               var slot = this.slotByName( s.name );
               if ( slot != null )
                  this.setSlotView( slot, s.view );
            }
            catch ( e )
            {
               console.warningln( L( "  renommage impossible : ", "  cannot rename: " ) + errText( e ) );
            }
         }
         var w = createCroppedWindow( s.view, res.crop, s.name + OUT_SUFFIX );
         created.push( w.mainView.id );
         log( format( "  %s -> %s (%dx%d)", s.view.id, w.mainView.id, w.mainView.image.width, w.mainView.image.height ) );
      }
      this.refreshLists();
      var g = geometryReport( res );
      var tApply = ( Date.now() - t0 ) / 1000;
      var done = TP.inPlace ? format( L( "Recadrés sur place : %s (%.1f s).", "Cropped in place: %s (%.1f s)." ), created.join( ", " ), tApply )
                            : format( L( "Images créées : %s (%.1f s).", "Images created: %s (%.1f s)." ), created.join( ", " ), tApply );
      STATE.res = res;
      STATE.extra = null;
      STATE.applied = { ids: created, t: tApply, inPlace: TP.inPlace };
      this.renderReports();
      log( g.text + "\n" + done );
      saveSettings();
      this.adjustToContents();
   }
   catch ( e )
   {
      this.summaryLabel.text = "<p><b>" + L( "Erreur : ", "Error: " ) + "</b>" + errText( e ).replace( /\n/g, "<br>" ) + "</p>";
      console.criticalln( TITLE + " : " + errText( e ) );
   }
}
};

// ============================================================================
// Entry point
// ============================================================================

function main()
{
   LANG = detectLanguage();
   loadSettings();
   console.hide();
   for ( ;; )
   {
      TIPS = buildTips();
      var dialog = new CropDialog;
      dialog.execute();
      if ( !dialog.relaunch )
         break;
   }
}

main();
