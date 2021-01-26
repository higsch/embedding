(function (factory) {
    typeof define === 'function' && define.amd ? define(factory) :
    factory();
}((function () { 'use strict';

    function noop() {}

    function run(fn) {
      return fn();
    }

    function run_all(fns) {
      fns.forEach(run);
    }

    function is_function(thing) {
      return typeof thing === 'function';
    }

    function safe_not_equal(a, b) {
      return a != a ? b == b : a !== b || a && typeof a === 'object' || typeof a === 'function';
    }

    function subscribe(store, ...callbacks) {
      if (store == null) {
        return noop;
      }

      const unsub = store.subscribe(...callbacks);
      return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }

    function ascending (a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector (f) {
      let delta = f;
      let compare = f;

      if (f.length === 1) {
        delta = (d, x) => f(d) - x;

        compare = ascendingComparator(f);
      }

      function left(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;

        while (lo < hi) {
          const mid = lo + hi >>> 1;
          if (compare(a[mid], x) < 0) lo = mid + 1;else hi = mid;
        }

        return lo;
      }

      function right(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;

        while (lo < hi) {
          const mid = lo + hi >>> 1;
          if (compare(a[mid], x) > 0) hi = mid;else lo = mid + 1;
        }

        return lo;
      }

      function center(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        const i = left(a, x, lo, hi - 1);
        return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
      }

      return {
        left,
        center,
        right
      };
    }

    function ascendingComparator(f) {
      return (d, x) => ascending(f(d), x);
    }

    function number (x) {
      return x === null ? NaN : +x;
    }

    const ascendingBisect = bisector(ascending);
    const bisectRight = ascendingBisect.right;
    bisector(number).center;

    var e10 = Math.sqrt(50),
        e5 = Math.sqrt(10),
        e2 = Math.sqrt(2);
    function ticks (start, stop, count) {
      var reverse,
          i = -1,
          n,
          ticks,
          step;
      stop = +stop, start = +start, count = +count;
      if (start === stop && count > 0) return [start];
      if (reverse = stop < start) n = start, start = stop, stop = n;
      if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

      if (step > 0) {
        start = Math.ceil(start / step);
        stop = Math.floor(stop / step);
        ticks = new Array(n = Math.ceil(stop - start + 1));

        while (++i < n) ticks[i] = (start + i) * step;
      } else {
        step = -step;
        start = Math.ceil(start * step);
        stop = Math.floor(stop * step);
        ticks = new Array(n = Math.ceil(stop - start + 1));

        while (++i < n) ticks[i] = (start + i) / step;
      }

      if (reverse) ticks.reverse();
      return ticks;
    }
    function tickIncrement(start, stop, count) {
      var step = (stop - start) / Math.max(0, count),
          power = Math.floor(Math.log(step) / Math.LN10),
          error = step / Math.pow(10, power);
      return power >= 0 ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power) : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
    }
    function tickStep(start, stop, count) {
      var step0 = Math.abs(stop - start) / Math.max(0, count),
          step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
          error = step0 / step1;
      if (error >= e10) step1 *= 10;else if (error >= e5) step1 *= 5;else if (error >= e2) step1 *= 2;
      return stop < start ? -step1 : step1;
    }

    function range (start, stop, step) {
      start = +start, stop = +stop, step = (n = arguments.length) < 2 ? (stop = start, start = 0, 1) : n < 3 ? 1 : +step;
      var i = -1,
          n = Math.max(0, Math.ceil((stop - start) / step)) | 0,
          range = new Array(n);

      while (++i < n) {
        range[i] = start + i * step;
      }

      return range;
    }

    var noop$1 = {
      value: () => {}
    };

    function dispatch() {
      for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
        if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t)) throw new Error("illegal type: " + t);
        _[t] = [];
      }

      return new Dispatch(_);
    }

    function Dispatch(_) {
      this._ = _;
    }

    function parseTypenames(typenames, types) {
      return typenames.trim().split(/^|\s+/).map(function (t) {
        var name = "",
            i = t.indexOf(".");
        if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
        if (t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
        return {
          type: t,
          name: name
        };
      });
    }

    Dispatch.prototype = dispatch.prototype = {
      constructor: Dispatch,
      on: function (typename, callback) {
        var _ = this._,
            T = parseTypenames(typename + "", _),
            t,
            i = -1,
            n = T.length; // If no callback was specified, return the callback of the given type and name.

        if (arguments.length < 2) {
          while (++i < n) if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name))) return t;

          return;
        } // If a type was specified, set the callback for the given type and name.
        // Otherwise, if a null callback was specified, remove callbacks of the given name.


        if (callback != null && typeof callback !== "function") throw new Error("invalid callback: " + callback);

        while (++i < n) {
          if (t = (typename = T[i]).type) _[t] = set(_[t], typename.name, callback);else if (callback == null) for (t in _) _[t] = set(_[t], typename.name, null);
        }

        return this;
      },
      copy: function () {
        var copy = {},
            _ = this._;

        for (var t in _) copy[t] = _[t].slice();

        return new Dispatch(copy);
      },
      call: function (type, that) {
        if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
        if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);

        for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
      },
      apply: function (type, that, args) {
        if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);

        for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
      }
    };

    function get(type, name) {
      for (var i = 0, n = type.length, c; i < n; ++i) {
        if ((c = type[i]).name === name) {
          return c.value;
        }
      }
    }

    function set(type, name, callback) {
      for (var i = 0, n = type.length; i < n; ++i) {
        if (type[i].name === name) {
          type[i] = noop$1, type = type.slice(0, i).concat(type.slice(i + 1));
          break;
        }
      }

      if (callback != null) type.push({
        name: name,
        value: callback
      });
      return type;
    }

    function define (constructor, factory, prototype) {
      constructor.prototype = factory.prototype = prototype;
      prototype.constructor = constructor;
    }
    function extend(parent, definition) {
      var prototype = Object.create(parent.prototype);

      for (var key in definition) prototype[key] = definition[key];

      return prototype;
    }

    function Color() {}
    var darker = 0.7;
    var brighter = 1 / darker;
    var reI = "\\s*([+-]?\\d+)\\s*",
        reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
        reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
        reHex = /^#([0-9a-f]{3,8})$/,
        reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
        reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
        reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
        reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
        reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
        reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");
    var named = {
      aliceblue: 0xf0f8ff,
      antiquewhite: 0xfaebd7,
      aqua: 0x00ffff,
      aquamarine: 0x7fffd4,
      azure: 0xf0ffff,
      beige: 0xf5f5dc,
      bisque: 0xffe4c4,
      black: 0x000000,
      blanchedalmond: 0xffebcd,
      blue: 0x0000ff,
      blueviolet: 0x8a2be2,
      brown: 0xa52a2a,
      burlywood: 0xdeb887,
      cadetblue: 0x5f9ea0,
      chartreuse: 0x7fff00,
      chocolate: 0xd2691e,
      coral: 0xff7f50,
      cornflowerblue: 0x6495ed,
      cornsilk: 0xfff8dc,
      crimson: 0xdc143c,
      cyan: 0x00ffff,
      darkblue: 0x00008b,
      darkcyan: 0x008b8b,
      darkgoldenrod: 0xb8860b,
      darkgray: 0xa9a9a9,
      darkgreen: 0x006400,
      darkgrey: 0xa9a9a9,
      darkkhaki: 0xbdb76b,
      darkmagenta: 0x8b008b,
      darkolivegreen: 0x556b2f,
      darkorange: 0xff8c00,
      darkorchid: 0x9932cc,
      darkred: 0x8b0000,
      darksalmon: 0xe9967a,
      darkseagreen: 0x8fbc8f,
      darkslateblue: 0x483d8b,
      darkslategray: 0x2f4f4f,
      darkslategrey: 0x2f4f4f,
      darkturquoise: 0x00ced1,
      darkviolet: 0x9400d3,
      deeppink: 0xff1493,
      deepskyblue: 0x00bfff,
      dimgray: 0x696969,
      dimgrey: 0x696969,
      dodgerblue: 0x1e90ff,
      firebrick: 0xb22222,
      floralwhite: 0xfffaf0,
      forestgreen: 0x228b22,
      fuchsia: 0xff00ff,
      gainsboro: 0xdcdcdc,
      ghostwhite: 0xf8f8ff,
      gold: 0xffd700,
      goldenrod: 0xdaa520,
      gray: 0x808080,
      green: 0x008000,
      greenyellow: 0xadff2f,
      grey: 0x808080,
      honeydew: 0xf0fff0,
      hotpink: 0xff69b4,
      indianred: 0xcd5c5c,
      indigo: 0x4b0082,
      ivory: 0xfffff0,
      khaki: 0xf0e68c,
      lavender: 0xe6e6fa,
      lavenderblush: 0xfff0f5,
      lawngreen: 0x7cfc00,
      lemonchiffon: 0xfffacd,
      lightblue: 0xadd8e6,
      lightcoral: 0xf08080,
      lightcyan: 0xe0ffff,
      lightgoldenrodyellow: 0xfafad2,
      lightgray: 0xd3d3d3,
      lightgreen: 0x90ee90,
      lightgrey: 0xd3d3d3,
      lightpink: 0xffb6c1,
      lightsalmon: 0xffa07a,
      lightseagreen: 0x20b2aa,
      lightskyblue: 0x87cefa,
      lightslategray: 0x778899,
      lightslategrey: 0x778899,
      lightsteelblue: 0xb0c4de,
      lightyellow: 0xffffe0,
      lime: 0x00ff00,
      limegreen: 0x32cd32,
      linen: 0xfaf0e6,
      magenta: 0xff00ff,
      maroon: 0x800000,
      mediumaquamarine: 0x66cdaa,
      mediumblue: 0x0000cd,
      mediumorchid: 0xba55d3,
      mediumpurple: 0x9370db,
      mediumseagreen: 0x3cb371,
      mediumslateblue: 0x7b68ee,
      mediumspringgreen: 0x00fa9a,
      mediumturquoise: 0x48d1cc,
      mediumvioletred: 0xc71585,
      midnightblue: 0x191970,
      mintcream: 0xf5fffa,
      mistyrose: 0xffe4e1,
      moccasin: 0xffe4b5,
      navajowhite: 0xffdead,
      navy: 0x000080,
      oldlace: 0xfdf5e6,
      olive: 0x808000,
      olivedrab: 0x6b8e23,
      orange: 0xffa500,
      orangered: 0xff4500,
      orchid: 0xda70d6,
      palegoldenrod: 0xeee8aa,
      palegreen: 0x98fb98,
      paleturquoise: 0xafeeee,
      palevioletred: 0xdb7093,
      papayawhip: 0xffefd5,
      peachpuff: 0xffdab9,
      peru: 0xcd853f,
      pink: 0xffc0cb,
      plum: 0xdda0dd,
      powderblue: 0xb0e0e6,
      purple: 0x800080,
      rebeccapurple: 0x663399,
      red: 0xff0000,
      rosybrown: 0xbc8f8f,
      royalblue: 0x4169e1,
      saddlebrown: 0x8b4513,
      salmon: 0xfa8072,
      sandybrown: 0xf4a460,
      seagreen: 0x2e8b57,
      seashell: 0xfff5ee,
      sienna: 0xa0522d,
      silver: 0xc0c0c0,
      skyblue: 0x87ceeb,
      slateblue: 0x6a5acd,
      slategray: 0x708090,
      slategrey: 0x708090,
      snow: 0xfffafa,
      springgreen: 0x00ff7f,
      steelblue: 0x4682b4,
      tan: 0xd2b48c,
      teal: 0x008080,
      thistle: 0xd8bfd8,
      tomato: 0xff6347,
      turquoise: 0x40e0d0,
      violet: 0xee82ee,
      wheat: 0xf5deb3,
      white: 0xffffff,
      whitesmoke: 0xf5f5f5,
      yellow: 0xffff00,
      yellowgreen: 0x9acd32
    };
    define(Color, color, {
      copy: function (channels) {
        return Object.assign(new this.constructor(), this, channels);
      },
      displayable: function () {
        return this.rgb().displayable();
      },
      hex: color_formatHex,
      // Deprecated! Use color.formatHex.
      formatHex: color_formatHex,
      formatHsl: color_formatHsl,
      formatRgb: color_formatRgb,
      toString: color_formatRgb
    });

    function color_formatHex() {
      return this.rgb().formatHex();
    }

    function color_formatHsl() {
      return hslConvert(this).formatHsl();
    }

    function color_formatRgb() {
      return this.rgb().formatRgb();
    }

    function color(format) {
      var m, l;
      format = (format + "").trim().toLowerCase();
      return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
      : l === 3 ? new Rgb(m >> 8 & 0xf | m >> 4 & 0xf0, m >> 4 & 0xf | m & 0xf0, (m & 0xf) << 4 | m & 0xf, 1) // #f00
      : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
      : l === 4 ? rgba(m >> 12 & 0xf | m >> 8 & 0xf0, m >> 8 & 0xf | m >> 4 & 0xf0, m >> 4 & 0xf | m & 0xf0, ((m & 0xf) << 4 | m & 0xf) / 0xff) // #f000
      : null // invalid hex
      ) : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
      : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
      : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
      : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
      : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
      : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
      : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
      : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
    }

    function rgbn(n) {
      return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
    }

    function rgba(r, g, b, a) {
      if (a <= 0) r = g = b = NaN;
      return new Rgb(r, g, b, a);
    }

    function rgbConvert(o) {
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Rgb();
      o = o.rgb();
      return new Rgb(o.r, o.g, o.b, o.opacity);
    }
    function rgb(r, g, b, opacity) {
      return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
    }
    function Rgb(r, g, b, opacity) {
      this.r = +r;
      this.g = +g;
      this.b = +b;
      this.opacity = +opacity;
    }
    define(Rgb, rgb, extend(Color, {
      brighter: function (k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      darker: function (k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
      },
      rgb: function () {
        return this;
      },
      displayable: function () {
        return -0.5 <= this.r && this.r < 255.5 && -0.5 <= this.g && this.g < 255.5 && -0.5 <= this.b && this.b < 255.5 && 0 <= this.opacity && this.opacity <= 1;
      },
      hex: rgb_formatHex,
      // Deprecated! Use color.formatHex.
      formatHex: rgb_formatHex,
      formatRgb: rgb_formatRgb,
      toString: rgb_formatRgb
    }));

    function rgb_formatHex() {
      return "#" + hex(this.r) + hex(this.g) + hex(this.b);
    }

    function rgb_formatRgb() {
      var a = this.opacity;
      a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
      return (a === 1 ? "rgb(" : "rgba(") + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.b) || 0)) + (a === 1 ? ")" : ", " + a + ")");
    }

    function hex(value) {
      value = Math.max(0, Math.min(255, Math.round(value) || 0));
      return (value < 16 ? "0" : "") + value.toString(16);
    }

    function hsla(h, s, l, a) {
      if (a <= 0) h = s = l = NaN;else if (l <= 0 || l >= 1) h = s = NaN;else if (s <= 0) h = NaN;
      return new Hsl(h, s, l, a);
    }

    function hslConvert(o) {
      if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
      if (!(o instanceof Color)) o = color(o);
      if (!o) return new Hsl();
      if (o instanceof Hsl) return o;
      o = o.rgb();
      var r = o.r / 255,
          g = o.g / 255,
          b = o.b / 255,
          min = Math.min(r, g, b),
          max = Math.max(r, g, b),
          h = NaN,
          s = max - min,
          l = (max + min) / 2;

      if (s) {
        if (r === max) h = (g - b) / s + (g < b) * 6;else if (g === max) h = (b - r) / s + 2;else h = (r - g) / s + 4;
        s /= l < 0.5 ? max + min : 2 - max - min;
        h *= 60;
      } else {
        s = l > 0 && l < 1 ? 0 : h;
      }

      return new Hsl(h, s, l, o.opacity);
    }
    function hsl(h, s, l, opacity) {
      return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
    }

    function Hsl(h, s, l, opacity) {
      this.h = +h;
      this.s = +s;
      this.l = +l;
      this.opacity = +opacity;
    }

    define(Hsl, hsl, extend(Color, {
      brighter: function (k) {
        k = k == null ? brighter : Math.pow(brighter, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      darker: function (k) {
        k = k == null ? darker : Math.pow(darker, k);
        return new Hsl(this.h, this.s, this.l * k, this.opacity);
      },
      rgb: function () {
        var h = this.h % 360 + (this.h < 0) * 360,
            s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
            l = this.l,
            m2 = l + (l < 0.5 ? l : 1 - l) * s,
            m1 = 2 * l - m2;
        return new Rgb(hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2), hsl2rgb(h, m1, m2), hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2), this.opacity);
      },
      displayable: function () {
        return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && 0 <= this.l && this.l <= 1 && 0 <= this.opacity && this.opacity <= 1;
      },
      formatHsl: function () {
        var a = this.opacity;
        a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
        return (a === 1 ? "hsl(" : "hsla(") + (this.h || 0) + ", " + (this.s || 0) * 100 + "%, " + (this.l || 0) * 100 + "%" + (a === 1 ? ")" : ", " + a + ")");
      }
    }));
    /* From FvD 13.37, CSS Color Module Level 3 */

    function hsl2rgb(h, m1, m2) {
      return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
    }

    const radians = Math.PI / 180;
    const degrees = 180 / Math.PI;

    const K = 18,
          Xn = 0.96422,
          Yn = 1,
          Zn = 0.82521,
          t0 = 4 / 29,
          t1 = 6 / 29,
          t2 = 3 * t1 * t1,
          t3 = t1 * t1 * t1;

    function labConvert(o) {
      if (o instanceof Lab) return new Lab(o.l, o.a, o.b, o.opacity);
      if (o instanceof Hcl) return hcl2lab(o);
      if (!(o instanceof Rgb)) o = rgbConvert(o);
      var r = rgb2lrgb(o.r),
          g = rgb2lrgb(o.g),
          b = rgb2lrgb(o.b),
          y = xyz2lab((0.2225045 * r + 0.7168786 * g + 0.0606169 * b) / Yn),
          x,
          z;
      if (r === g && g === b) x = z = y;else {
        x = xyz2lab((0.4360747 * r + 0.3850649 * g + 0.1430804 * b) / Xn);
        z = xyz2lab((0.0139322 * r + 0.0971045 * g + 0.7141733 * b) / Zn);
      }
      return new Lab(116 * y - 16, 500 * (x - y), 200 * (y - z), o.opacity);
    }
    function lab(l, a, b, opacity) {
      return arguments.length === 1 ? labConvert(l) : new Lab(l, a, b, opacity == null ? 1 : opacity);
    }
    function Lab(l, a, b, opacity) {
      this.l = +l;
      this.a = +a;
      this.b = +b;
      this.opacity = +opacity;
    }
    define(Lab, lab, extend(Color, {
      brighter: function (k) {
        return new Lab(this.l + K * (k == null ? 1 : k), this.a, this.b, this.opacity);
      },
      darker: function (k) {
        return new Lab(this.l - K * (k == null ? 1 : k), this.a, this.b, this.opacity);
      },
      rgb: function () {
        var y = (this.l + 16) / 116,
            x = isNaN(this.a) ? y : y + this.a / 500,
            z = isNaN(this.b) ? y : y - this.b / 200;
        x = Xn * lab2xyz(x);
        y = Yn * lab2xyz(y);
        z = Zn * lab2xyz(z);
        return new Rgb(lrgb2rgb(3.1338561 * x - 1.6168667 * y - 0.4906146 * z), lrgb2rgb(-0.9787684 * x + 1.9161415 * y + 0.0334540 * z), lrgb2rgb(0.0719453 * x - 0.2289914 * y + 1.4052427 * z), this.opacity);
      }
    }));

    function xyz2lab(t) {
      return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
    }

    function lab2xyz(t) {
      return t > t1 ? t * t * t : t2 * (t - t0);
    }

    function lrgb2rgb(x) {
      return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }

    function rgb2lrgb(x) {
      return (x /= 255) <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }

    function hclConvert(o) {
      if (o instanceof Hcl) return new Hcl(o.h, o.c, o.l, o.opacity);
      if (!(o instanceof Lab)) o = labConvert(o);
      if (o.a === 0 && o.b === 0) return new Hcl(NaN, 0 < o.l && o.l < 100 ? 0 : NaN, o.l, o.opacity);
      var h = Math.atan2(o.b, o.a) * degrees;
      return new Hcl(h < 0 ? h + 360 : h, Math.sqrt(o.a * o.a + o.b * o.b), o.l, o.opacity);
    }
    function hcl(h, c, l, opacity) {
      return arguments.length === 1 ? hclConvert(h) : new Hcl(h, c, l, opacity == null ? 1 : opacity);
    }
    function Hcl(h, c, l, opacity) {
      this.h = +h;
      this.c = +c;
      this.l = +l;
      this.opacity = +opacity;
    }

    function hcl2lab(o) {
      if (isNaN(o.h)) return new Lab(o.l, 0, 0, o.opacity);
      var h = o.h * radians;
      return new Lab(o.l, Math.cos(h) * o.c, Math.sin(h) * o.c, o.opacity);
    }

    define(Hcl, hcl, extend(Color, {
      brighter: function (k) {
        return new Hcl(this.h, this.c, this.l + K * (k == null ? 1 : k), this.opacity);
      },
      darker: function (k) {
        return new Hcl(this.h, this.c, this.l - K * (k == null ? 1 : k), this.opacity);
      },
      rgb: function () {
        return hcl2lab(this).rgb();
      }
    }));

    var constant = (x => () => x);

    function linear(a, d) {
      return function (t) {
        return a + t * d;
      };
    }

    function exponential(a, b, y) {
      return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function (t) {
        return Math.pow(a + t * b, y);
      };
    }

    function hue(a, b) {
      var d = b - a;
      return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant(isNaN(a) ? b : a);
    }
    function gamma(y) {
      return (y = +y) === 1 ? nogamma : function (a, b) {
        return b - a ? exponential(a, b, y) : constant(isNaN(a) ? b : a);
      };
    }
    function nogamma(a, b) {
      var d = b - a;
      return d ? linear(a, d) : constant(isNaN(a) ? b : a);
    }

    var interpolateRgb = (function rgbGamma(y) {
      var color = gamma(y);

      function rgb$1(start, end) {
        var r = color((start = rgb(start)).r, (end = rgb(end)).r),
            g = color(start.g, end.g),
            b = color(start.b, end.b),
            opacity = nogamma(start.opacity, end.opacity);
        return function (t) {
          start.r = r(t);
          start.g = g(t);
          start.b = b(t);
          start.opacity = opacity(t);
          return start + "";
        };
      }

      rgb$1.gamma = rgbGamma;
      return rgb$1;
    })(1);

    function numberArray (a, b) {
      if (!b) b = [];
      var n = a ? Math.min(b.length, a.length) : 0,
          c = b.slice(),
          i;
      return function (t) {
        for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;

        return c;
      };
    }
    function isNumberArray(x) {
      return ArrayBuffer.isView(x) && !(x instanceof DataView);
    }

    function genericArray(a, b) {
      var nb = b ? b.length : 0,
          na = a ? Math.min(nb, a.length) : 0,
          x = new Array(na),
          c = new Array(nb),
          i;

      for (i = 0; i < na; ++i) x[i] = interpolate(a[i], b[i]);

      for (; i < nb; ++i) c[i] = b[i];

      return function (t) {
        for (i = 0; i < na; ++i) c[i] = x[i](t);

        return c;
      };
    }

    function date (a, b) {
      var d = new Date();
      return a = +a, b = +b, function (t) {
        return d.setTime(a * (1 - t) + b * t), d;
      };
    }

    function interpolateNumber (a, b) {
      return a = +a, b = +b, function (t) {
        return a * (1 - t) + b * t;
      };
    }

    function object (a, b) {
      var i = {},
          c = {},
          k;
      if (a === null || typeof a !== "object") a = {};
      if (b === null || typeof b !== "object") b = {};

      for (k in b) {
        if (k in a) {
          i[k] = interpolate(a[k], b[k]);
        } else {
          c[k] = b[k];
        }
      }

      return function (t) {
        for (k in i) c[k] = i[k](t);

        return c;
      };
    }

    var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
        reB = new RegExp(reA.source, "g");

    function zero(b) {
      return function () {
        return b;
      };
    }

    function one(b) {
      return function (t) {
        return b(t) + "";
      };
    }

    function interpolateString (a, b) {
      var bi = reA.lastIndex = reB.lastIndex = 0,
          // scan index for next number in b
      am,
          // current match in a
      bm,
          // current match in b
      bs,
          // string preceding current number in b, if any
      i = -1,
          // index in s
      s = [],
          // string constants and placeholders
      q = []; // number interpolators
      // Coerce inputs to strings.

      a = a + "", b = b + ""; // Interpolate pairs of numbers in a & b.

      while ((am = reA.exec(a)) && (bm = reB.exec(b))) {
        if ((bs = bm.index) > bi) {
          // a string precedes the next number in b
          bs = b.slice(bi, bs);
          if (s[i]) s[i] += bs; // coalesce with previous string
          else s[++i] = bs;
        }

        if ((am = am[0]) === (bm = bm[0])) {
          // numbers in a & b match
          if (s[i]) s[i] += bm; // coalesce with previous string
          else s[++i] = bm;
        } else {
          // interpolate non-matching numbers
          s[++i] = null;
          q.push({
            i: i,
            x: interpolateNumber(am, bm)
          });
        }

        bi = reB.lastIndex;
      } // Add remains of b.


      if (bi < b.length) {
        bs = b.slice(bi);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      } // Special optimization for only a single match.
      // Otherwise, interpolate each of the numbers and rejoin the string.


      return s.length < 2 ? q[0] ? one(q[0].x) : zero(b) : (b = q.length, function (t) {
        for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);

        return s.join("");
      });
    }

    function interpolate (a, b) {
      var t = typeof b,
          c;
      return b == null || t === "boolean" ? constant(b) : (t === "number" ? interpolateNumber : t === "string" ? (c = color(b)) ? (b = c, interpolateRgb) : interpolateString : b instanceof color ? interpolateRgb : b instanceof Date ? date : isNumberArray(b) ? numberArray : Array.isArray(b) ? genericArray : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object : interpolateNumber)(a, b);
    }

    function interpolateRound (a, b) {
      return a = +a, b = +b, function (t) {
        return Math.round(a * (1 - t) + b * t);
      };
    }

    function hcl$1(hue) {
      return function (start, end) {
        var h = hue((start = hcl(start)).h, (end = hcl(end)).h),
            c = nogamma(start.c, end.c),
            l = nogamma(start.l, end.l),
            opacity = nogamma(start.opacity, end.opacity);
        return function (t) {
          start.h = h(t);
          start.c = c(t);
          start.l = l(t);
          start.opacity = opacity(t);
          return start + "";
        };
      };
    }

    var interpolateHcl = hcl$1(hue);

    dispatch("start", "end", "cancel", "interrupt");

    function formatDecimal (x) {
      return Math.abs(x = Math.round(x)) >= 1e21 ? x.toLocaleString("en").replace(/,/g, "") : x.toString(10);
    } // Computes the decimal coefficient and exponent of the specified number x with
    // significant digits p, where x is positive and p is in [1, 21] or undefined.
    // For example, formatDecimalParts(1.23) returns ["123", 0].

    function formatDecimalParts(x, p) {
      if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity

      var i,
          coefficient = x.slice(0, i); // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
      // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).

      return [coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient, +x.slice(i + 1)];
    }

    function exponent (x) {
      return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
    }

    function formatGroup (grouping, thousands) {
      return function (value, width) {
        var i = value.length,
            t = [],
            j = 0,
            g = grouping[0],
            length = 0;

        while (i > 0 && g > 0) {
          if (length + g + 1 > width) g = Math.max(1, width - length);
          t.push(value.substring(i -= g, i + g));
          if ((length += g + 1) > width) break;
          g = grouping[j = (j + 1) % grouping.length];
        }

        return t.reverse().join(thousands);
      };
    }

    function formatNumerals (numerals) {
      return function (value) {
        return value.replace(/[0-9]/g, function (i) {
          return numerals[+i];
        });
      };
    }

    // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
    var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;
    function formatSpecifier(specifier) {
      if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
      var match;
      return new FormatSpecifier({
        fill: match[1],
        align: match[2],
        sign: match[3],
        symbol: match[4],
        zero: match[5],
        width: match[6],
        comma: match[7],
        precision: match[8] && match[8].slice(1),
        trim: match[9],
        type: match[10]
      });
    }
    formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

    function FormatSpecifier(specifier) {
      this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
      this.align = specifier.align === undefined ? ">" : specifier.align + "";
      this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
      this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
      this.zero = !!specifier.zero;
      this.width = specifier.width === undefined ? undefined : +specifier.width;
      this.comma = !!specifier.comma;
      this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
      this.trim = !!specifier.trim;
      this.type = specifier.type === undefined ? "" : specifier.type + "";
    }

    FormatSpecifier.prototype.toString = function () {
      return this.fill + this.align + this.sign + this.symbol + (this.zero ? "0" : "") + (this.width === undefined ? "" : Math.max(1, this.width | 0)) + (this.comma ? "," : "") + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0)) + (this.trim ? "~" : "") + this.type;
    };

    // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
    function formatTrim (s) {
      out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
        switch (s[i]) {
          case ".":
            i0 = i1 = i;
            break;

          case "0":
            if (i0 === 0) i0 = i;
            i1 = i;
            break;

          default:
            if (!+s[i]) break out;
            if (i0 > 0) i0 = 0;
            break;
        }
      }

      return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    var prefixExponent;
    function formatPrefixAuto (x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1],
          i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
          n = coefficient.length;
      return i === n ? coefficient : i > n ? coefficient + new Array(i - n + 1).join("0") : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i) : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
    }

    function formatRounded (x, p) {
      var d = formatDecimalParts(x, p);
      if (!d) return x + "";
      var coefficient = d[0],
          exponent = d[1];
      return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1) : coefficient + new Array(exponent - coefficient.length + 2).join("0");
    }

    var formatTypes = {
      "%": (x, p) => (x * 100).toFixed(p),
      "b": x => Math.round(x).toString(2),
      "c": x => x + "",
      "d": formatDecimal,
      "e": (x, p) => x.toExponential(p),
      "f": (x, p) => x.toFixed(p),
      "g": (x, p) => x.toPrecision(p),
      "o": x => Math.round(x).toString(8),
      "p": (x, p) => formatRounded(x * 100, p),
      "r": formatRounded,
      "s": formatPrefixAuto,
      "X": x => Math.round(x).toString(16).toUpperCase(),
      "x": x => Math.round(x).toString(16)
    };

    function identity (x) {
      return x;
    }

    var map = Array.prototype.map,
        prefixes = ["y", "z", "a", "f", "p", "n", "µ", "m", "", "k", "M", "G", "T", "P", "E", "Z", "Y"];
    function formatLocale (locale) {
      var group = locale.grouping === undefined || locale.thousands === undefined ? identity : formatGroup(map.call(locale.grouping, Number), locale.thousands + ""),
          currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
          currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
          decimal = locale.decimal === undefined ? "." : locale.decimal + "",
          numerals = locale.numerals === undefined ? identity : formatNumerals(map.call(locale.numerals, String)),
          percent = locale.percent === undefined ? "%" : locale.percent + "",
          minus = locale.minus === undefined ? "−" : locale.minus + "",
          nan = locale.nan === undefined ? "NaN" : locale.nan + "";

      function newFormat(specifier) {
        specifier = formatSpecifier(specifier);
        var fill = specifier.fill,
            align = specifier.align,
            sign = specifier.sign,
            symbol = specifier.symbol,
            zero = specifier.zero,
            width = specifier.width,
            comma = specifier.comma,
            precision = specifier.precision,
            trim = specifier.trim,
            type = specifier.type; // The "n" type is an alias for ",g".

        if (type === "n") comma = true, type = "g"; // The "" type, and any invalid type, is an alias for ".12~g".
        else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g"; // If zero fill is specified, padding goes after sign and before digits.

        if (zero || fill === "0" && align === "=") zero = true, fill = "0", align = "="; // Compute the prefix and suffix.
        // For SI-prefix, the suffix is lazily computed.

        var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
            suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : ""; // What format function should we use?
        // Is this an integer type?
        // Can this type generate exponential notation?

        var formatType = formatTypes[type],
            maybeSuffix = /[defgprs%]/.test(type); // Set the default precision if not specified,
        // or clamp the specified precision to the supported range.
        // For significant precision, it must be in [1, 21].
        // For fixed precision, it must be in [0, 20].

        precision = precision === undefined ? 6 : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision)) : Math.max(0, Math.min(20, precision));

        function format(value) {
          var valuePrefix = prefix,
              valueSuffix = suffix,
              i,
              n,
              c;

          if (type === "c") {
            valueSuffix = formatType(value) + valueSuffix;
            value = "";
          } else {
            value = +value; // Determine the sign. -0 is not less than 0, but 1 / -0 is!

            var valueNegative = value < 0 || 1 / value < 0; // Perform the initial formatting.

            value = isNaN(value) ? nan : formatType(Math.abs(value), precision); // Trim insignificant zeros.

            if (trim) value = formatTrim(value); // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.

            if (valueNegative && +value === 0 && sign !== "+") valueNegative = false; // Compute the prefix and suffix.

            valuePrefix = (valueNegative ? sign === "(" ? sign : minus : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
            valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : ""); // Break the formatted value into the integer “value” part that can be
            // grouped, and fractional or exponential “suffix” part that is not.

            if (maybeSuffix) {
              i = -1, n = value.length;

              while (++i < n) {
                if (c = value.charCodeAt(i), 48 > c || c > 57) {
                  valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                  value = value.slice(0, i);
                  break;
                }
              }
            }
          } // If the fill character is not "0", grouping is applied before padding.


          if (comma && !zero) value = group(value, Infinity); // Compute the padding.

          var length = valuePrefix.length + value.length + valueSuffix.length,
              padding = length < width ? new Array(width - length + 1).join(fill) : ""; // If the fill character is "0", grouping is applied after padding.

          if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = ""; // Reconstruct the final output based on the desired alignment.

          switch (align) {
            case "<":
              value = valuePrefix + value + valueSuffix + padding;
              break;

            case "=":
              value = valuePrefix + padding + value + valueSuffix;
              break;

            case "^":
              value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length);
              break;

            default:
              value = padding + valuePrefix + value + valueSuffix;
              break;
          }

          return numerals(value);
        }

        format.toString = function () {
          return specifier + "";
        };

        return format;
      }

      function formatPrefix(specifier, value) {
        var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
            e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
            k = Math.pow(10, -e),
            prefix = prefixes[8 + e / 3];
        return function (value) {
          return f(k * value) + prefix;
        };
      }

      return {
        format: newFormat,
        formatPrefix: formatPrefix
      };
    }

    var locale;
    var format;
    var formatPrefix;
    defaultLocale({
      thousands: ",",
      grouping: [3],
      currency: ["$", ""]
    });
    function defaultLocale(definition) {
      locale = formatLocale(definition);
      format = locale.format;
      formatPrefix = locale.formatPrefix;
      return locale;
    }

    function precisionFixed (step) {
      return Math.max(0, -exponent(Math.abs(step)));
    }

    function precisionPrefix (step, value) {
      return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
    }

    function precisionRound (step, max) {
      step = Math.abs(step), max = Math.abs(max) - step;
      return Math.max(0, exponent(max) - exponent(step)) + 1;
    }

    function initRange(domain, range) {
      switch (arguments.length) {
        case 0:
          break;

        case 1:
          this.range(domain);
          break;

        default:
          this.range(range).domain(domain);
          break;
      }

      return this;
    }

    function constants(x) {
      return function () {
        return x;
      };
    }

    function number$1(x) {
      return +x;
    }

    var unit = [0, 1];
    function identity$1(x) {
      return x;
    }

    function normalize(a, b) {
      return (b -= a = +a) ? function (x) {
        return (x - a) / b;
      } : constants(isNaN(b) ? NaN : 0.5);
    }

    function clamper(a, b) {
      var t;
      if (a > b) t = a, a = b, b = t;
      return function (x) {
        return Math.max(a, Math.min(b, x));
      };
    } // normalize(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
    // interpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding range value x in [a,b].


    function bimap(domain, range, interpolate) {
      var d0 = domain[0],
          d1 = domain[1],
          r0 = range[0],
          r1 = range[1];
      if (d1 < d0) d0 = normalize(d1, d0), r0 = interpolate(r1, r0);else d0 = normalize(d0, d1), r0 = interpolate(r0, r1);
      return function (x) {
        return r0(d0(x));
      };
    }

    function polymap(domain, range, interpolate) {
      var j = Math.min(domain.length, range.length) - 1,
          d = new Array(j),
          r = new Array(j),
          i = -1; // Reverse descending domains.

      if (domain[j] < domain[0]) {
        domain = domain.slice().reverse();
        range = range.slice().reverse();
      }

      while (++i < j) {
        d[i] = normalize(domain[i], domain[i + 1]);
        r[i] = interpolate(range[i], range[i + 1]);
      }

      return function (x) {
        var i = bisectRight(domain, x, 1, j) - 1;
        return r[i](d[i](x));
      };
    }

    function copy(source, target) {
      return target.domain(source.domain()).range(source.range()).interpolate(source.interpolate()).clamp(source.clamp()).unknown(source.unknown());
    }
    function transformer() {
      var domain = unit,
          range = unit,
          interpolate$1 = interpolate,
          transform,
          untransform,
          unknown,
          clamp = identity$1,
          piecewise,
          output,
          input;

      function rescale() {
        var n = Math.min(domain.length, range.length);
        if (clamp !== identity$1) clamp = clamper(domain[0], domain[n - 1]);
        piecewise = n > 2 ? polymap : bimap;
        output = input = null;
        return scale;
      }

      function scale(x) {
        return isNaN(x = +x) ? unknown : (output || (output = piecewise(domain.map(transform), range, interpolate$1)))(transform(clamp(x)));
      }

      scale.invert = function (y) {
        return clamp(untransform((input || (input = piecewise(range, domain.map(transform), interpolateNumber)))(y)));
      };

      scale.domain = function (_) {
        return arguments.length ? (domain = Array.from(_, number$1), rescale()) : domain.slice();
      };

      scale.range = function (_) {
        return arguments.length ? (range = Array.from(_), rescale()) : range.slice();
      };

      scale.rangeRound = function (_) {
        return range = Array.from(_), interpolate$1 = interpolateRound, rescale();
      };

      scale.clamp = function (_) {
        return arguments.length ? (clamp = _ ? true : identity$1, rescale()) : clamp !== identity$1;
      };

      scale.interpolate = function (_) {
        return arguments.length ? (interpolate$1 = _, rescale()) : interpolate$1;
      };

      scale.unknown = function (_) {
        return arguments.length ? (unknown = _, scale) : unknown;
      };

      return function (t, u) {
        transform = t, untransform = u;
        return rescale();
      };
    }
    function continuous() {
      return transformer()(identity$1, identity$1);
    }

    function tickFormat(start, stop, count, specifier) {
      var step = tickStep(start, stop, count),
          precision;
      specifier = formatSpecifier(specifier == null ? ",f" : specifier);

      switch (specifier.type) {
        case "s":
          {
            var value = Math.max(Math.abs(start), Math.abs(stop));
            if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
            return formatPrefix(specifier, value);
          }

        case "":
        case "e":
        case "g":
        case "p":
        case "r":
          {
            if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
            break;
          }

        case "f":
        case "%":
          {
            if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
            break;
          }
      }

      return format(specifier);
    }

    function linearish(scale) {
      var domain = scale.domain;

      scale.ticks = function (count) {
        var d = domain();
        return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
      };

      scale.tickFormat = function (count, specifier) {
        var d = domain();
        return tickFormat(d[0], d[d.length - 1], count == null ? 10 : count, specifier);
      };

      scale.nice = function (count) {
        if (count == null) count = 10;
        var d = domain();
        var i0 = 0;
        var i1 = d.length - 1;
        var start = d[i0];
        var stop = d[i1];
        var prestep;
        var step;
        var maxIter = 10;

        if (stop < start) {
          step = start, start = stop, stop = step;
          step = i0, i0 = i1, i1 = step;
        }

        while (maxIter-- > 0) {
          step = tickIncrement(start, stop, count);

          if (step === prestep) {
            d[i0] = start;
            d[i1] = stop;
            return domain(d);
          } else if (step > 0) {
            start = Math.floor(start / step) * step;
            stop = Math.ceil(stop / step) * step;
          } else if (step < 0) {
            start = Math.ceil(start * step) / step;
            stop = Math.floor(stop * step) / step;
          } else {
            break;
          }

          prestep = step;
        }

        return scale;
      };

      return scale;
    }
    function linear$1() {
      var scale = continuous();

      scale.copy = function () {
        return copy(scale, linear$1());
      };

      initRange.apply(scale, arguments);
      return linearish(scale);
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */

    function readable(value, start) {
      return {
        subscribe: writable(value, start).subscribe
      };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */


    function writable(value, start = noop) {
      let stop;
      const subscribers = [];

      function set(new_value) {
        if (safe_not_equal(value, new_value)) {
          value = new_value;

          if (stop) {
            // store is ready
            const run_queue = !subscriber_queue.length;

            for (let i = 0; i < subscribers.length; i += 1) {
              const s = subscribers[i];
              s[1]();
              subscriber_queue.push(s, value);
            }

            if (run_queue) {
              for (let i = 0; i < subscriber_queue.length; i += 2) {
                subscriber_queue[i][0](subscriber_queue[i + 1]);
              }

              subscriber_queue.length = 0;
            }
          }
        }
      }

      function update(fn) {
        set(fn(value));
      }

      function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);

        if (subscribers.length === 1) {
          stop = start(set) || noop;
        }

        run(value);
        return () => {
          const index = subscribers.indexOf(subscriber);

          if (index !== -1) {
            subscribers.splice(index, 1);
          }

          if (subscribers.length === 0) {
            stop();
            stop = null;
          }
        };
      }

      return {
        set,
        update,
        subscribe
      };
    }

    function derived(stores, fn, initial_value) {
      const single = !Array.isArray(stores);
      const stores_array = single ? [stores] : stores;
      const auto = fn.length < 2;
      return readable(initial_value, set => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;

        const sync = () => {
          if (pending) {
            return;
          }

          cleanup();
          const result = fn(single ? values[0] : values, set);

          if (auto) {
            set(result);
          } else {
            cleanup = is_function(result) ? result : noop;
          }
        };

        const unsubscribers = stores_array.map((store, i) => subscribe(store, value => {
          values[i] = value;
          pending &= ~(1 << i);

          if (inited) {
            sync();
          }
        }, () => {
          pending |= 1 << i;
        }));
        inited = true;
        sync();
        return function stop() {
          run_all(unsubscribers);
          cleanup();
        };
      });
    }

    const initialLocale = 'en';
    const dict = writable();
    const locale$1 = writable(initialLocale); // https://stackoverflow.com/questions/38627024/convert-english-numbers-to-persian/47971760

    const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

    const toFarsiNumber = n => {
      let tmp = n.toString().replace(/\d/g, x => farsiDigits[x]).replace(/,/g, '').replace(/\./g, '');

      if (/%/g.test(tmp)) {
        tmp = `٪${tmp.replace(/%/g, '')}`;
      }

      if (/\+/g.test(tmp)) {
        tmp = `+${tmp.replace(/\+/g, '')}`;
      }

      if (/-/g.test(tmp)) {
        tmp = `-${tmp.replace(/-/g, '')}`;
      }

      return tmp;
    };

    const getMessageFromLocalizedDict = (id, localizedDict) => {
      const splitId = id.split('.');
      let message = { ...localizedDict
      };
      splitId.forEach(partialId => {
        message = message[partialId];
      });
      return message;
    };

    const createMessageFormatter = localizedDict => id => getMessageFromLocalizedDict(id, localizedDict);

    const localizedDict = derived([dict, locale$1], ([$dict, $locale]) => {
      if (!$dict || !$locale) return;
      return $dict[$locale];
    });
    derived(localizedDict, $localizedDict => {
      return createMessageFormatter($localizedDict);
    });
    derived(locale$1, $locale => {
      return n => {
        if ($locale === 'fa') {
          return toFarsiNumber(n);
        }

        return n;
      };
    });
    derived(localizedDict, $localizedDict => {
      if (!$localizedDict) return '';
      return $localizedDict.$dir;
    });

    const colorScale = (startColor, endColor, steps) => linear$1().range([startColor, endColor]).interpolate(interpolateHcl).domain([0, steps]);

    const createColorArray = (startColor, endColor, defaultColor, steps, format) => {
      const c = colorScale(startColor, endColor, steps.length);
      const arr = range(steps.length).map(c);
      return {
        data: arr.map((d, i) => ({
          startDomain: steps[i][0],
          endDomain: steps[i][1],
          color: d
        })),
        defaultColor,

        color(value) {
          let resultColor = this.defaultColor;
          this.data.forEach(d => {
            if (value >= d.startDomain && value < d.endDomain) resultColor = d.color;
          });
          return resultColor;
        },

        format
      };
    };
    createColorArray('#f2f2f2', '#323bdb', '#d2d3f7', [[-Infinity, 5], [5, 20], [20, 35], [35, 50], [50, 65], [65, Infinity]], value => `${value}%`);

})));
