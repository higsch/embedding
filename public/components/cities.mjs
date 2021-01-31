function noop() {}

function run(fn) {
  return fn();
}

function blank_object() {
  return Object.create(null);
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

function is_empty(obj) {
  return Object.keys(obj).length === 0;
}

function append(target, node) {
  target.appendChild(node);
}

function insert(target, node, anchor) {
  target.insertBefore(node, anchor || null);
}

function detach(node) {
  node.parentNode.removeChild(node);
}

function element(name) {
  return document.createElement(name);
}

function svg_element(name) {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function text(data) {
  return document.createTextNode(data);
}

function space() {
  return text(' ');
}

function empty() {
  return text('');
}

function listen(node, event, handler, options) {
  node.addEventListener(event, handler, options);
  return () => node.removeEventListener(event, handler, options);
}

function attr(node, attribute, value) {
  if (value == null) node.removeAttribute(attribute);else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
}

function children(element) {
  return Array.from(element.childNodes);
}

function claim_element(nodes, name, attributes, svg) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];

    if (node.nodeName === name) {
      let j = 0;
      const remove = [];

      while (j < node.attributes.length) {
        const attribute = node.attributes[j++];

        if (!attributes[attribute.name]) {
          remove.push(attribute.name);
        }
      }

      for (let k = 0; k < remove.length; k++) {
        node.removeAttribute(remove[k]);
      }

      return nodes.splice(i, 1)[0];
    }
  }

  return svg ? svg_element(name) : element(name);
}

function claim_text(nodes, data) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];

    if (node.nodeType === 3) {
      node.data = '' + data;
      return nodes.splice(i, 1)[0];
    }
  }

  return text(data);
}

function claim_space(nodes) {
  return claim_text(nodes, ' ');
}

function set_data(text, data) {
  data = '' + data;
  if (text.wholeText !== data) text.data = data;
}

function set_style(node, key, value, important) {
  node.style.setProperty(key, value, important ? 'important' : '');
}
// so we cache the result instead


let crossorigin;

function is_crossorigin() {
  if (crossorigin === undefined) {
    crossorigin = false;

    try {
      if (typeof window !== 'undefined' && window.parent) {
        void window.parent.document;
      }
    } catch (error) {
      crossorigin = true;
    }
  }

  return crossorigin;
}

function add_resize_listener(node, fn) {
  const computed_style = getComputedStyle(node);

  if (computed_style.position === 'static') {
    node.style.position = 'relative';
  }

  const iframe = element('iframe');
  iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' + 'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  const crossorigin = is_crossorigin();
  let unsubscribe;

  if (crossorigin) {
    iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
    unsubscribe = listen(window, 'message', event => {
      if (event.source === iframe.contentWindow) fn();
    });
  } else {
    iframe.src = 'about:blank';

    iframe.onload = () => {
      unsubscribe = listen(iframe.contentWindow, 'resize', fn);
    };
  }

  append(node, iframe);
  return () => {
    if (crossorigin) {
      unsubscribe();
    } else if (unsubscribe && iframe.contentWindow) {
      unsubscribe();
    }

    detach(iframe);
  };
}

let current_component;

function set_current_component(component) {
  current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;

function schedule_update() {
  if (!update_scheduled) {
    update_scheduled = true;
    resolved_promise.then(flush);
  }
}

function add_render_callback(fn) {
  render_callbacks.push(fn);
}

let flushing = false;
const seen_callbacks = new Set();

function flush() {
  if (flushing) return;
  flushing = true;

  do {
    // first, call beforeUpdate functions
    // and update components
    for (let i = 0; i < dirty_components.length; i += 1) {
      const component = dirty_components[i];
      set_current_component(component);
      update(component.$$);
    }

    set_current_component(null);
    dirty_components.length = 0;

    while (binding_callbacks.length) binding_callbacks.pop()(); // then, once components are updated, call
    // afterUpdate functions. This may cause
    // subsequent updates...


    for (let i = 0; i < render_callbacks.length; i += 1) {
      const callback = render_callbacks[i];

      if (!seen_callbacks.has(callback)) {
        // ...so guard against infinite loops
        seen_callbacks.add(callback);
        callback();
      }
    }

    render_callbacks.length = 0;
  } while (dirty_components.length);

  while (flush_callbacks.length) {
    flush_callbacks.pop()();
  }

  update_scheduled = false;
  flushing = false;
  seen_callbacks.clear();
}

function update($$) {
  if ($$.fragment !== null) {
    $$.update();
    run_all($$.before_update);
    const dirty = $$.dirty;
    $$.dirty = [-1];
    $$.fragment && $$.fragment.p($$.ctx, dirty);
    $$.after_update.forEach(add_render_callback);
  }
}

const outroing = new Set();
let outros;

function group_outros() {
  outros = {
    r: 0,
    c: [],
    p: outros // parent group

  };
}

function check_outros() {
  if (!outros.r) {
    run_all(outros.c);
  }

  outros = outros.p;
}

function transition_in(block, local) {
  if (block && block.i) {
    outroing.delete(block);
    block.i(local);
  }
}

function transition_out(block, local, detach, callback) {
  if (block && block.o) {
    if (outroing.has(block)) return;
    outroing.add(block);
    outros.c.push(() => {
      outroing.delete(block);

      if (callback) {
        if (detach) block.d(1);
        callback();
      }
    });
    block.o(local);
  }
}

const globals = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : global;

function destroy_block(block, lookup) {
  block.d(1);
  lookup.delete(block.key);
}

function outro_and_destroy_block(block, lookup) {
  transition_out(block, 1, 1, () => {
    lookup.delete(block.key);
  });
}

function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
  let o = old_blocks.length;
  let n = list.length;
  let i = o;
  const old_indexes = {};

  while (i--) old_indexes[old_blocks[i].key] = i;

  const new_blocks = [];
  const new_lookup = new Map();
  const deltas = new Map();
  i = n;

  while (i--) {
    const child_ctx = get_context(ctx, list, i);
    const key = get_key(child_ctx);
    let block = lookup.get(key);

    if (!block) {
      block = create_each_block(key, child_ctx);
      block.c();
    } else if (dynamic) {
      block.p(child_ctx, dirty);
    }

    new_lookup.set(key, new_blocks[i] = block);
    if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
  }

  const will_move = new Set();
  const did_move = new Set();

  function insert(block) {
    transition_in(block, 1);
    block.m(node, next);
    lookup.set(block.key, block);
    next = block.first;
    n--;
  }

  while (o && n) {
    const new_block = new_blocks[n - 1];
    const old_block = old_blocks[o - 1];
    const new_key = new_block.key;
    const old_key = old_block.key;

    if (new_block === old_block) {
      // do nothing
      next = new_block.first;
      o--;
      n--;
    } else if (!new_lookup.has(old_key)) {
      // remove old block
      destroy(old_block, lookup);
      o--;
    } else if (!lookup.has(new_key) || will_move.has(new_key)) {
      insert(new_block);
    } else if (did_move.has(old_key)) {
      o--;
    } else if (deltas.get(new_key) > deltas.get(old_key)) {
      did_move.add(new_key);
      insert(new_block);
    } else {
      will_move.add(old_key);
      o--;
    }
  }

  while (o--) {
    const old_block = old_blocks[o];
    if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
  }

  while (n) insert(new_blocks[n - 1]);

  return new_blocks;
}

function create_component(block) {
  block && block.c();
}

function claim_component(block, parent_nodes) {
  block && block.l(parent_nodes);
}

function mount_component(component, target, anchor) {
  const {
    fragment,
    on_mount,
    on_destroy,
    after_update
  } = component.$$;
  fragment && fragment.m(target, anchor); // onMount happens before the initial afterUpdate

  add_render_callback(() => {
    const new_on_destroy = on_mount.map(run).filter(is_function);

    if (on_destroy) {
      on_destroy.push(...new_on_destroy);
    } else {
      // Edge case - component was destroyed immediately,
      // most likely as a result of a binding initialising
      run_all(new_on_destroy);
    }

    component.$$.on_mount = [];
  });
  after_update.forEach(add_render_callback);
}

function destroy_component(component, detaching) {
  const $$ = component.$$;

  if ($$.fragment !== null) {
    run_all($$.on_destroy);
    $$.fragment && $$.fragment.d(detaching); // TODO null out other refs, including component.$$ (but need to
    // preserve final state?)

    $$.on_destroy = $$.fragment = null;
    $$.ctx = [];
  }
}

function make_dirty(component, i) {
  if (component.$$.dirty[0] === -1) {
    dirty_components.push(component);
    schedule_update();
    component.$$.dirty.fill(0);
  }

  component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
}

function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
  const parent_component = current_component;
  set_current_component(component);
  const prop_values = options.props || {};
  const $$ = component.$$ = {
    fragment: null,
    ctx: null,
    // state
    props,
    update: noop,
    not_equal,
    bound: blank_object(),
    // lifecycle
    on_mount: [],
    on_destroy: [],
    before_update: [],
    after_update: [],
    context: new Map(parent_component ? parent_component.$$.context : []),
    // everything else
    callbacks: blank_object(),
    dirty,
    skip_bound: false
  };
  let ready = false;
  $$.ctx = instance ? instance(component, prop_values, (i, ret, ...rest) => {
    const value = rest.length ? rest[0] : ret;

    if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
      if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
      if (ready) make_dirty(component, i);
    }

    return ret;
  }) : [];
  $$.update();
  ready = true;
  run_all($$.before_update); // `false` as a special case of no DOM component

  $$.fragment = create_fragment ? create_fragment($$.ctx) : false;

  if (options.target) {
    if (options.hydrate) {
      const nodes = children(options.target); // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

      $$.fragment && $$.fragment.l(nodes);
      nodes.forEach(detach);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      $$.fragment && $$.fragment.c();
    }

    if (options.intro) transition_in(component.$$.fragment);
    mount_component(component, options.target, options.anchor);
    flush();
  }

  set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */


class SvelteComponent {
  $destroy() {
    destroy_component(this, 1);
    this.$destroy = noop;
  }

  $on(type, callback) {
    const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
    callbacks.push(callback);
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) callbacks.splice(index, 1);
    };
  }

  $set($$props) {
    if (this.$$set && !is_empty($$props)) {
      this.$$.skip_bound = true;
      this.$$set($$props);
      this.$$.skip_bound = false;
    }
  }

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

// https://github.com/python/cpython/blob/a74eea238f5baba15797e2e8b570d153bc8690a7/Modules/mathmodule.c#L1423
class Adder {
  constructor() {
    this._partials = new Float64Array(32);
    this._n = 0;
  }

  add(x) {
    const p = this._partials;
    let i = 0;

    for (let j = 0; j < this._n && j < 32; j++) {
      const y = p[j],
            hi = x + y,
            lo = Math.abs(x) < Math.abs(y) ? x - (hi - y) : y - (hi - x);
      if (lo) p[i++] = lo;
      x = hi;
    }

    p[i] = x;
    this._n = i + 1;
    return this;
  }

  valueOf() {
    const p = this._partials;
    let n = this._n,
        x,
        y,
        lo,
        hi = 0;

    if (n > 0) {
      hi = p[--n];

      while (n > 0) {
        x = hi;
        y = p[--n];
        hi = x + y;
        lo = y - (hi - x);
        if (lo) break;
      }

      if (n > 0 && (lo < 0 && p[n - 1] < 0 || lo > 0 && p[n - 1] > 0)) {
        y = lo * 2;
        x = hi + y;
        if (y == x - hi) hi = x;
      }
    }

    return hi;
  }

}

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

function max(values, valueof) {
  let max;

  if (valueof === undefined) {
    for (const value of values) {
      if (value != null && (max < value || max === undefined && value >= value)) {
        max = value;
      }
    }
  } else {
    let index = -1;

    for (let value of values) {
      if ((value = valueof(value, ++index, values)) != null && (max < value || max === undefined && value >= value)) {
        max = value;
      }
    }
  }

  return max;
}

function min(values, valueof) {
  let min;

  if (valueof === undefined) {
    for (const value of values) {
      if (value != null && (min > value || min === undefined && value >= value)) {
        min = value;
      }
    }
  } else {
    let index = -1;

    for (let value of values) {
      if ((value = valueof(value, ++index, values)) != null && (min > value || min === undefined && value >= value)) {
        min = value;
      }
    }
  }

  return min;
}

function* flatten(arrays) {
  for (const array of arrays) {
    yield* array;
  }
}

function merge(arrays) {
  return Array.from(flatten(arrays));
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

dispatch("start", "end", "cancel", "interrupt");

const EPSILON = Math.pow(2, -52);
const EDGE_STACK = new Uint32Array(512);

class Delaunator {

    static from(points, getX = defaultGetX, getY = defaultGetY) {
        const n = points.length;
        const coords = new Float64Array(n * 2);

        for (let i = 0; i < n; i++) {
            const p = points[i];
            coords[2 * i] = getX(p);
            coords[2 * i + 1] = getY(p);
        }

        return new Delaunator(coords);
    }

    constructor(coords) {
        const n = coords.length >> 1;
        if (n > 0 && typeof coords[0] !== 'number') throw new Error('Expected coords to contain numbers.');

        this.coords = coords;

        // arrays that will store the triangulation graph
        const maxTriangles = Math.max(2 * n - 5, 0);
        this._triangles = new Uint32Array(maxTriangles * 3);
        this._halfedges = new Int32Array(maxTriangles * 3);

        // temporary arrays for tracking the edges of the advancing convex hull
        this._hashSize = Math.ceil(Math.sqrt(n));
        this._hullPrev = new Uint32Array(n); // edge to prev edge
        this._hullNext = new Uint32Array(n); // edge to next edge
        this._hullTri = new Uint32Array(n); // edge to adjacent triangle
        this._hullHash = new Int32Array(this._hashSize).fill(-1); // angular edge hash

        // temporary arrays for sorting points
        this._ids = new Uint32Array(n);
        this._dists = new Float64Array(n);

        this.update();
    }

    update() {
        const {coords, _hullPrev: hullPrev, _hullNext: hullNext, _hullTri: hullTri, _hullHash: hullHash} =  this;
        const n = coords.length >> 1;

        // populate an array of point indices; calculate input data bbox
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < n; i++) {
            const x = coords[2 * i];
            const y = coords[2 * i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            this._ids[i] = i;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        let minDist = Infinity;
        let i0, i1, i2;

        // pick a seed point close to the center
        for (let i = 0; i < n; i++) {
            const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
            if (d < minDist) {
                i0 = i;
                minDist = d;
            }
        }
        const i0x = coords[2 * i0];
        const i0y = coords[2 * i0 + 1];

        minDist = Infinity;

        // find the point closest to the seed
        for (let i = 0; i < n; i++) {
            if (i === i0) continue;
            const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
            if (d < minDist && d > 0) {
                i1 = i;
                minDist = d;
            }
        }
        let i1x = coords[2 * i1];
        let i1y = coords[2 * i1 + 1];

        let minRadius = Infinity;

        // find the third point which forms the smallest circumcircle with the first two
        for (let i = 0; i < n; i++) {
            if (i === i0 || i === i1) continue;
            const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
            if (r < minRadius) {
                i2 = i;
                minRadius = r;
            }
        }
        let i2x = coords[2 * i2];
        let i2y = coords[2 * i2 + 1];

        if (minRadius === Infinity) {
            // order collinear points by dx (or dy if all x are identical)
            // and return the list as a hull
            for (let i = 0; i < n; i++) {
                this._dists[i] = (coords[2 * i] - coords[0]) || (coords[2 * i + 1] - coords[1]);
            }
            quicksort(this._ids, this._dists, 0, n - 1);
            const hull = new Uint32Array(n);
            let j = 0;
            for (let i = 0, d0 = -Infinity; i < n; i++) {
                const id = this._ids[i];
                if (this._dists[id] > d0) {
                    hull[j++] = id;
                    d0 = this._dists[id];
                }
            }
            this.hull = hull.subarray(0, j);
            this.triangles = new Uint32Array(0);
            this.halfedges = new Uint32Array(0);
            return;
        }

        // swap the order of the seed points for counter-clockwise orientation
        if (orient(i0x, i0y, i1x, i1y, i2x, i2y)) {
            const i = i1;
            const x = i1x;
            const y = i1y;
            i1 = i2;
            i1x = i2x;
            i1y = i2y;
            i2 = i;
            i2x = x;
            i2y = y;
        }

        const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
        this._cx = center.x;
        this._cy = center.y;

        for (let i = 0; i < n; i++) {
            this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
        }

        // sort the points by distance from the seed triangle circumcenter
        quicksort(this._ids, this._dists, 0, n - 1);

        // set up the seed triangle as the starting hull
        this._hullStart = i0;
        let hullSize = 3;

        hullNext[i0] = hullPrev[i2] = i1;
        hullNext[i1] = hullPrev[i0] = i2;
        hullNext[i2] = hullPrev[i1] = i0;

        hullTri[i0] = 0;
        hullTri[i1] = 1;
        hullTri[i2] = 2;

        hullHash.fill(-1);
        hullHash[this._hashKey(i0x, i0y)] = i0;
        hullHash[this._hashKey(i1x, i1y)] = i1;
        hullHash[this._hashKey(i2x, i2y)] = i2;

        this.trianglesLen = 0;
        this._addTriangle(i0, i1, i2, -1, -1, -1);

        for (let k = 0, xp, yp; k < this._ids.length; k++) {
            const i = this._ids[k];
            const x = coords[2 * i];
            const y = coords[2 * i + 1];

            // skip near-duplicate points
            if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
            xp = x;
            yp = y;

            // skip seed triangle points
            if (i === i0 || i === i1 || i === i2) continue;

            // find a visible edge on the convex hull using edge hash
            let start = 0;
            for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
                start = hullHash[(key + j) % this._hashSize];
                if (start !== -1 && start !== hullNext[start]) break;
            }

            start = hullPrev[start];
            let e = start, q;
            while (q = hullNext[e], !orient(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1])) {
                e = q;
                if (e === start) {
                    e = -1;
                    break;
                }
            }
            if (e === -1) continue; // likely a near-duplicate point; skip it

            // add the first triangle from the point
            let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);

            // recursively flip triangles from the point until they satisfy the Delaunay condition
            hullTri[i] = this._legalize(t + 2);
            hullTri[e] = t; // keep track of boundary triangles on the hull
            hullSize++;

            // walk forward through the hull, adding more triangles and flipping recursively
            let n = hullNext[e];
            while (q = hullNext[n], orient(x, y, coords[2 * n], coords[2 * n + 1], coords[2 * q], coords[2 * q + 1])) {
                t = this._addTriangle(n, i, q, hullTri[i], -1, hullTri[n]);
                hullTri[i] = this._legalize(t + 2);
                hullNext[n] = n; // mark as removed
                hullSize--;
                n = q;
            }

            // walk backward from the other side, adding more triangles and flipping
            if (e === start) {
                while (q = hullPrev[e], orient(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1])) {
                    t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
                    this._legalize(t + 2);
                    hullTri[q] = t;
                    hullNext[e] = e; // mark as removed
                    hullSize--;
                    e = q;
                }
            }

            // update the hull indices
            this._hullStart = hullPrev[i] = e;
            hullNext[e] = hullPrev[n] = i;
            hullNext[i] = n;

            // save the two new edges in the hash table
            hullHash[this._hashKey(x, y)] = i;
            hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
        }

        this.hull = new Uint32Array(hullSize);
        for (let i = 0, e = this._hullStart; i < hullSize; i++) {
            this.hull[i] = e;
            e = hullNext[e];
        }

        // trim typed triangle mesh arrays
        this.triangles = this._triangles.subarray(0, this.trianglesLen);
        this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
    }

    _hashKey(x, y) {
        return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
    }

    _legalize(a) {
        const {_triangles: triangles, _halfedges: halfedges, coords} = this;

        let i = 0;
        let ar = 0;

        // recursion eliminated with a fixed-size stack
        while (true) {
            const b = halfedges[a];

            /* if the pair of triangles doesn't satisfy the Delaunay condition
             * (p1 is inside the circumcircle of [p0, pl, pr]), flip them,
             * then do the same check/flip recursively for the new pair of triangles
             *
             *           pl                    pl
             *          /||\                  /  \
             *       al/ || \bl            al/    \a
             *        /  ||  \              /      \
             *       /  a||b  \    flip    /___ar___\
             *     p0\   ||   /p1   =>   p0\---bl---/p1
             *        \  ||  /              \      /
             *       ar\ || /br             b\    /br
             *          \||/                  \  /
             *           pr                    pr
             */
            const a0 = a - a % 3;
            ar = a0 + (a + 2) % 3;

            if (b === -1) { // convex hull edge
                if (i === 0) break;
                a = EDGE_STACK[--i];
                continue;
            }

            const b0 = b - b % 3;
            const al = a0 + (a + 1) % 3;
            const bl = b0 + (b + 2) % 3;

            const p0 = triangles[ar];
            const pr = triangles[a];
            const pl = triangles[al];
            const p1 = triangles[bl];

            const illegal = inCircle(
                coords[2 * p0], coords[2 * p0 + 1],
                coords[2 * pr], coords[2 * pr + 1],
                coords[2 * pl], coords[2 * pl + 1],
                coords[2 * p1], coords[2 * p1 + 1]);

            if (illegal) {
                triangles[a] = p1;
                triangles[b] = p0;

                const hbl = halfedges[bl];

                // edge swapped on the other side of the hull (rare); fix the halfedge reference
                if (hbl === -1) {
                    let e = this._hullStart;
                    do {
                        if (this._hullTri[e] === bl) {
                            this._hullTri[e] = a;
                            break;
                        }
                        e = this._hullPrev[e];
                    } while (e !== this._hullStart);
                }
                this._link(a, hbl);
                this._link(b, halfedges[ar]);
                this._link(ar, bl);

                const br = b0 + (b + 1) % 3;

                // don't worry about hitting the cap: it can only happen on extremely degenerate input
                if (i < EDGE_STACK.length) {
                    EDGE_STACK[i++] = br;
                }
            } else {
                if (i === 0) break;
                a = EDGE_STACK[--i];
            }
        }

        return ar;
    }

    _link(a, b) {
        this._halfedges[a] = b;
        if (b !== -1) this._halfedges[b] = a;
    }

    // add a new triangle given vertex indices and adjacent half-edge ids
    _addTriangle(i0, i1, i2, a, b, c) {
        const t = this.trianglesLen;

        this._triangles[t] = i0;
        this._triangles[t + 1] = i1;
        this._triangles[t + 2] = i2;

        this._link(t, a);
        this._link(t + 1, b);
        this._link(t + 2, c);

        this.trianglesLen += 3;

        return t;
    }
}

// monotonically increases with real angle, but doesn't need expensive trigonometry
function pseudoAngle(dx, dy) {
    const p = dx / (Math.abs(dx) + Math.abs(dy));
    return (dy > 0 ? 3 - p : 1 + p) / 4; // [0..1]
}

function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

// return 2d orientation sign if we're confident in it through J. Shewchuk's error bound check
function orientIfSure(px, py, rx, ry, qx, qy) {
    const l = (ry - py) * (qx - px);
    const r = (rx - px) * (qy - py);
    return Math.abs(l - r) >= 3.3306690738754716e-16 * Math.abs(l + r) ? l - r : 0;
}

// a more robust orientation test that's stable in a given triangle (to fix robustness issues)
function orient(rx, ry, qx, qy, px, py) {
    const sign = orientIfSure(px, py, rx, ry, qx, qy) ||
    orientIfSure(rx, ry, qx, qy, px, py) ||
    orientIfSure(qx, qy, px, py, rx, ry);
    return sign < 0;
}

function inCircle(ax, ay, bx, by, cx, cy, px, py) {
    const dx = ax - px;
    const dy = ay - py;
    const ex = bx - px;
    const ey = by - py;
    const fx = cx - px;
    const fy = cy - py;

    const ap = dx * dx + dy * dy;
    const bp = ex * ex + ey * ey;
    const cp = fx * fx + fy * fy;

    return dx * (ey * cp - bp * fy) -
           dy * (ex * cp - bp * fx) +
           ap * (ex * fy - ey * fx) < 0;
}

function circumradius(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;

    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const d = 0.5 / (dx * ey - dy * ex);

    const x = (ey * bl - dy * cl) * d;
    const y = (dx * cl - ex * bl) * d;

    return x * x + y * y;
}

function circumcenter(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;

    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const d = 0.5 / (dx * ey - dy * ex);

    const x = ax + (ey * bl - dy * cl) * d;
    const y = ay + (dx * cl - ex * bl) * d;

    return {x, y};
}

function quicksort(ids, dists, left, right) {
    if (right - left <= 20) {
        for (let i = left + 1; i <= right; i++) {
            const temp = ids[i];
            const tempDist = dists[temp];
            let j = i - 1;
            while (j >= left && dists[ids[j]] > tempDist) ids[j + 1] = ids[j--];
            ids[j + 1] = temp;
        }
    } else {
        const median = (left + right) >> 1;
        let i = left + 1;
        let j = right;
        swap(ids, median, i);
        if (dists[ids[left]] > dists[ids[right]]) swap(ids, left, right);
        if (dists[ids[i]] > dists[ids[right]]) swap(ids, i, right);
        if (dists[ids[left]] > dists[ids[i]]) swap(ids, left, i);

        const temp = ids[i];
        const tempDist = dists[temp];
        while (true) {
            do i++; while (dists[ids[i]] < tempDist);
            do j--; while (dists[ids[j]] > tempDist);
            if (j < i) break;
            swap(ids, i, j);
        }
        ids[left + 1] = ids[j];
        ids[j] = temp;

        if (right - i + 1 >= j - left) {
            quicksort(ids, dists, i, right);
            quicksort(ids, dists, left, j - 1);
        } else {
            quicksort(ids, dists, left, j - 1);
            quicksort(ids, dists, i, right);
        }
    }
}

function swap(arr, i, j) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function defaultGetX(p) {
    return p[0];
}
function defaultGetY(p) {
    return p[1];
}

const epsilon = 1e-6;
class Path {
  constructor() {
    this._x0 = this._y0 = // start of current subpath
    this._x1 = this._y1 = null; // end of current subpath

    this._ = "";
  }

  moveTo(x, y) {
    this._ += `M${this._x0 = this._x1 = +x},${this._y0 = this._y1 = +y}`;
  }

  closePath() {
    if (this._x1 !== null) {
      this._x1 = this._x0, this._y1 = this._y0;
      this._ += "Z";
    }
  }

  lineTo(x, y) {
    this._ += `L${this._x1 = +x},${this._y1 = +y}`;
  }

  arc(x, y, r) {
    x = +x, y = +y, r = +r;
    const x0 = x + r;
    const y0 = y;
    if (r < 0) throw new Error("negative radius");
    if (this._x1 === null) this._ += `M${x0},${y0}`;else if (Math.abs(this._x1 - x0) > epsilon || Math.abs(this._y1 - y0) > epsilon) this._ += "L" + x0 + "," + y0;
    if (!r) return;
    this._ += `A${r},${r},0,1,1,${x - r},${y}A${r},${r},0,1,1,${this._x1 = x0},${this._y1 = y0}`;
  }

  rect(x, y, w, h) {
    this._ += `M${this._x0 = this._x1 = +x},${this._y0 = this._y1 = +y}h${+w}v${+h}h${-w}Z`;
  }

  value() {
    return this._ || null;
  }

}

class Polygon {
  constructor() {
    this._ = [];
  }

  moveTo(x, y) {
    this._.push([x, y]);
  }

  closePath() {
    this._.push(this._[0].slice());
  }

  lineTo(x, y) {
    this._.push([x, y]);
  }

  value() {
    return this._.length ? this._ : null;
  }

}

class Voronoi {
  constructor(delaunay, [xmin, ymin, xmax, ymax] = [0, 0, 960, 500]) {
    if (!((xmax = +xmax) >= (xmin = +xmin)) || !((ymax = +ymax) >= (ymin = +ymin))) throw new Error("invalid bounds");
    this.delaunay = delaunay;
    this._circumcenters = new Float64Array(delaunay.points.length * 2);
    this.vectors = new Float64Array(delaunay.points.length * 2);
    this.xmax = xmax, this.xmin = xmin;
    this.ymax = ymax, this.ymin = ymin;

    this._init();
  }

  update() {
    this.delaunay.update();

    this._init();

    return this;
  }

  _init() {
    const {
      delaunay: {
        points,
        hull,
        triangles
      },
      vectors
    } = this; // Compute circumcenters.

    const circumcenters = this.circumcenters = this._circumcenters.subarray(0, triangles.length / 3 * 2);

    for (let i = 0, j = 0, n = triangles.length, x, y; i < n; i += 3, j += 2) {
      const t1 = triangles[i] * 2;
      const t2 = triangles[i + 1] * 2;
      const t3 = triangles[i + 2] * 2;
      const x1 = points[t1];
      const y1 = points[t1 + 1];
      const x2 = points[t2];
      const y2 = points[t2 + 1];
      const x3 = points[t3];
      const y3 = points[t3 + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const ex = x3 - x1;
      const ey = y3 - y1;
      const bl = dx * dx + dy * dy;
      const cl = ex * ex + ey * ey;
      const ab = (dx * ey - dy * ex) * 2;

      if (!ab) {
        // degenerate case (collinear diagram)
        x = (x1 + x3) / 2 - 1e8 * ey;
        y = (y1 + y3) / 2 + 1e8 * ex;
      } else if (Math.abs(ab) < 1e-8) {
        // almost equal points (degenerate triangle)
        x = (x1 + x3) / 2;
        y = (y1 + y3) / 2;
      } else {
        const d = 1 / ab;
        x = x1 + (ey * bl - dy * cl) * d;
        y = y1 + (dx * cl - ex * bl) * d;
      }

      circumcenters[j] = x;
      circumcenters[j + 1] = y;
    } // Compute exterior cell rays.


    let h = hull[hull.length - 1];
    let p0,
        p1 = h * 4;
    let x0,
        x1 = points[2 * h];
    let y0,
        y1 = points[2 * h + 1];
    vectors.fill(0);

    for (let i = 0; i < hull.length; ++i) {
      h = hull[i];
      p0 = p1, x0 = x1, y0 = y1;
      p1 = h * 4, x1 = points[2 * h], y1 = points[2 * h + 1];
      vectors[p0 + 2] = vectors[p1] = y0 - y1;
      vectors[p0 + 3] = vectors[p1 + 1] = x1 - x0;
    }
  }

  render(context) {
    const buffer = context == null ? context = new Path() : undefined;
    const {
      delaunay: {
        halfedges,
        inedges,
        hull
      },
      circumcenters,
      vectors
    } = this;
    if (hull.length <= 1) return null;

    for (let i = 0, n = halfedges.length; i < n; ++i) {
      const j = halfedges[i];
      if (j < i) continue;
      const ti = Math.floor(i / 3) * 2;
      const tj = Math.floor(j / 3) * 2;
      const xi = circumcenters[ti];
      const yi = circumcenters[ti + 1];
      const xj = circumcenters[tj];
      const yj = circumcenters[tj + 1];

      this._renderSegment(xi, yi, xj, yj, context);
    }

    let h0,
        h1 = hull[hull.length - 1];

    for (let i = 0; i < hull.length; ++i) {
      h0 = h1, h1 = hull[i];
      const t = Math.floor(inedges[h1] / 3) * 2;
      const x = circumcenters[t];
      const y = circumcenters[t + 1];
      const v = h0 * 4;

      const p = this._project(x, y, vectors[v + 2], vectors[v + 3]);

      if (p) this._renderSegment(x, y, p[0], p[1], context);
    }

    return buffer && buffer.value();
  }

  renderBounds(context) {
    const buffer = context == null ? context = new Path() : undefined;
    context.rect(this.xmin, this.ymin, this.xmax - this.xmin, this.ymax - this.ymin);
    return buffer && buffer.value();
  }

  renderCell(i, context) {
    const buffer = context == null ? context = new Path() : undefined;

    const points = this._clip(i);

    if (points === null || !points.length) return;
    context.moveTo(points[0], points[1]);
    let n = points.length;

    while (points[0] === points[n - 2] && points[1] === points[n - 1] && n > 1) n -= 2;

    for (let i = 2; i < n; i += 2) {
      if (points[i] !== points[i - 2] || points[i + 1] !== points[i - 1]) context.lineTo(points[i], points[i + 1]);
    }

    context.closePath();
    return buffer && buffer.value();
  }

  *cellPolygons() {
    const {
      delaunay: {
        points
      }
    } = this;

    for (let i = 0, n = points.length / 2; i < n; ++i) {
      const cell = this.cellPolygon(i);
      if (cell) cell.index = i, yield cell;
    }
  }

  cellPolygon(i) {
    const polygon = new Polygon();
    this.renderCell(i, polygon);
    return polygon.value();
  }

  _renderSegment(x0, y0, x1, y1, context) {
    let S;

    const c0 = this._regioncode(x0, y0);

    const c1 = this._regioncode(x1, y1);

    if (c0 === 0 && c1 === 0) {
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
    } else if (S = this._clipSegment(x0, y0, x1, y1, c0, c1)) {
      context.moveTo(S[0], S[1]);
      context.lineTo(S[2], S[3]);
    }
  }

  contains(i, x, y) {
    if ((x = +x, x !== x) || (y = +y, y !== y)) return false;
    return this.delaunay._step(i, x, y) === i;
  }

  *neighbors(i) {
    const ci = this._clip(i);

    if (ci) for (const j of this.delaunay.neighbors(i)) {
      const cj = this._clip(j); // find the common edge


      if (cj) loop: for (let ai = 0, li = ci.length; ai < li; ai += 2) {
        for (let aj = 0, lj = cj.length; aj < lj; aj += 2) {
          if (ci[ai] == cj[aj] && ci[ai + 1] == cj[aj + 1] && ci[(ai + 2) % li] == cj[(aj + lj - 2) % lj] && ci[(ai + 3) % li] == cj[(aj + lj - 1) % lj]) {
            yield j;
            break loop;
          }
        }
      }
    }
  }

  _cell(i) {
    const {
      circumcenters,
      delaunay: {
        inedges,
        halfedges,
        triangles
      }
    } = this;
    const e0 = inedges[i];
    if (e0 === -1) return null; // coincident point

    const points = [];
    let e = e0;

    do {
      const t = Math.floor(e / 3);
      points.push(circumcenters[t * 2], circumcenters[t * 2 + 1]);
      e = e % 3 === 2 ? e - 2 : e + 1;
      if (triangles[e] !== i) break; // bad triangulation

      e = halfedges[e];
    } while (e !== e0 && e !== -1);

    return points;
  }

  _clip(i) {
    // degenerate case (1 valid point: return the box)
    if (i === 0 && this.delaunay.hull.length === 1) {
      return [this.xmax, this.ymin, this.xmax, this.ymax, this.xmin, this.ymax, this.xmin, this.ymin];
    }

    const points = this._cell(i);

    if (points === null) return null;
    const {
      vectors: V
    } = this;
    const v = i * 4;
    return V[v] || V[v + 1] ? this._clipInfinite(i, points, V[v], V[v + 1], V[v + 2], V[v + 3]) : this._clipFinite(i, points);
  }

  _clipFinite(i, points) {
    const n = points.length;
    let P = null;
    let x0,
        y0,
        x1 = points[n - 2],
        y1 = points[n - 1];

    let c0,
        c1 = this._regioncode(x1, y1);

    let e0, e1;

    for (let j = 0; j < n; j += 2) {
      x0 = x1, y0 = y1, x1 = points[j], y1 = points[j + 1];
      c0 = c1, c1 = this._regioncode(x1, y1);

      if (c0 === 0 && c1 === 0) {
        e0 = e1, e1 = 0;
        if (P) P.push(x1, y1);else P = [x1, y1];
      } else {
        let S, sx0, sy0, sx1, sy1;

        if (c0 === 0) {
          if ((S = this._clipSegment(x0, y0, x1, y1, c0, c1)) === null) continue;
          [sx0, sy0, sx1, sy1] = S;
        } else {
          if ((S = this._clipSegment(x1, y1, x0, y0, c1, c0)) === null) continue;
          [sx1, sy1, sx0, sy0] = S;
          e0 = e1, e1 = this._edgecode(sx0, sy0);
          if (e0 && e1) this._edge(i, e0, e1, P, P.length);
          if (P) P.push(sx0, sy0);else P = [sx0, sy0];
        }

        e0 = e1, e1 = this._edgecode(sx1, sy1);
        if (e0 && e1) this._edge(i, e0, e1, P, P.length);
        if (P) P.push(sx1, sy1);else P = [sx1, sy1];
      }
    }

    if (P) {
      e0 = e1, e1 = this._edgecode(P[0], P[1]);
      if (e0 && e1) this._edge(i, e0, e1, P, P.length);
    } else if (this.contains(i, (this.xmin + this.xmax) / 2, (this.ymin + this.ymax) / 2)) {
      return [this.xmax, this.ymin, this.xmax, this.ymax, this.xmin, this.ymax, this.xmin, this.ymin];
    }

    return P;
  }

  _clipSegment(x0, y0, x1, y1, c0, c1) {
    while (true) {
      if (c0 === 0 && c1 === 0) return [x0, y0, x1, y1];
      if (c0 & c1) return null;
      let x,
          y,
          c = c0 || c1;
      if (c & 0b1000) x = x0 + (x1 - x0) * (this.ymax - y0) / (y1 - y0), y = this.ymax;else if (c & 0b0100) x = x0 + (x1 - x0) * (this.ymin - y0) / (y1 - y0), y = this.ymin;else if (c & 0b0010) y = y0 + (y1 - y0) * (this.xmax - x0) / (x1 - x0), x = this.xmax;else y = y0 + (y1 - y0) * (this.xmin - x0) / (x1 - x0), x = this.xmin;
      if (c0) x0 = x, y0 = y, c0 = this._regioncode(x0, y0);else x1 = x, y1 = y, c1 = this._regioncode(x1, y1);
    }
  }

  _clipInfinite(i, points, vx0, vy0, vxn, vyn) {
    let P = Array.from(points),
        p;
    if (p = this._project(P[0], P[1], vx0, vy0)) P.unshift(p[0], p[1]);
    if (p = this._project(P[P.length - 2], P[P.length - 1], vxn, vyn)) P.push(p[0], p[1]);

    if (P = this._clipFinite(i, P)) {
      for (let j = 0, n = P.length, c0, c1 = this._edgecode(P[n - 2], P[n - 1]); j < n; j += 2) {
        c0 = c1, c1 = this._edgecode(P[j], P[j + 1]);
        if (c0 && c1) j = this._edge(i, c0, c1, P, j), n = P.length;
      }
    } else if (this.contains(i, (this.xmin + this.xmax) / 2, (this.ymin + this.ymax) / 2)) {
      P = [this.xmin, this.ymin, this.xmax, this.ymin, this.xmax, this.ymax, this.xmin, this.ymax];
    }

    return P;
  }

  _edge(i, e0, e1, P, j) {
    while (e0 !== e1) {
      let x, y;

      switch (e0) {
        case 0b0101:
          e0 = 0b0100;
          continue;
        // top-left

        case 0b0100:
          e0 = 0b0110, x = this.xmax, y = this.ymin;
          break;
        // top

        case 0b0110:
          e0 = 0b0010;
          continue;
        // top-right

        case 0b0010:
          e0 = 0b1010, x = this.xmax, y = this.ymax;
          break;
        // right

        case 0b1010:
          e0 = 0b1000;
          continue;
        // bottom-right

        case 0b1000:
          e0 = 0b1001, x = this.xmin, y = this.ymax;
          break;
        // bottom

        case 0b1001:
          e0 = 0b0001;
          continue;
        // bottom-left

        case 0b0001:
          e0 = 0b0101, x = this.xmin, y = this.ymin;
          break;
        // left
      }

      if ((P[j] !== x || P[j + 1] !== y) && this.contains(i, x, y)) {
        P.splice(j, 0, x, y), j += 2;
      }
    }

    if (P.length > 4) {
      for (let i = 0; i < P.length; i += 2) {
        const j = (i + 2) % P.length,
              k = (i + 4) % P.length;
        if (P[i] === P[j] && P[j] === P[k] || P[i + 1] === P[j + 1] && P[j + 1] === P[k + 1]) P.splice(j, 2), i -= 2;
      }
    }

    return j;
  }

  _project(x0, y0, vx, vy) {
    let t = Infinity,
        c,
        x,
        y;

    if (vy < 0) {
      // top
      if (y0 <= this.ymin) return null;
      if ((c = (this.ymin - y0) / vy) < t) y = this.ymin, x = x0 + (t = c) * vx;
    } else if (vy > 0) {
      // bottom
      if (y0 >= this.ymax) return null;
      if ((c = (this.ymax - y0) / vy) < t) y = this.ymax, x = x0 + (t = c) * vx;
    }

    if (vx > 0) {
      // right
      if (x0 >= this.xmax) return null;
      if ((c = (this.xmax - x0) / vx) < t) x = this.xmax, y = y0 + (t = c) * vy;
    } else if (vx < 0) {
      // left
      if (x0 <= this.xmin) return null;
      if ((c = (this.xmin - x0) / vx) < t) x = this.xmin, y = y0 + (t = c) * vy;
    }

    return [x, y];
  }

  _edgecode(x, y) {
    return (x === this.xmin ? 0b0001 : x === this.xmax ? 0b0010 : 0b0000) | (y === this.ymin ? 0b0100 : y === this.ymax ? 0b1000 : 0b0000);
  }

  _regioncode(x, y) {
    return (x < this.xmin ? 0b0001 : x > this.xmax ? 0b0010 : 0b0000) | (y < this.ymin ? 0b0100 : y > this.ymax ? 0b1000 : 0b0000);
  }

}

const tau = 2 * Math.PI,
      pow = Math.pow;

function pointX(p) {
  return p[0];
}

function pointY(p) {
  return p[1];
} // A triangulation is collinear if all its triangles have a non-null area


function collinear(d) {
  const {
    triangles,
    coords
  } = d;

  for (let i = 0; i < triangles.length; i += 3) {
    const a = 2 * triangles[i],
          b = 2 * triangles[i + 1],
          c = 2 * triangles[i + 2],
          cross = (coords[c] - coords[a]) * (coords[b + 1] - coords[a + 1]) - (coords[b] - coords[a]) * (coords[c + 1] - coords[a + 1]);
    if (cross > 1e-10) return false;
  }

  return true;
}

function jitter(x, y, r) {
  return [x + Math.sin(x + y) * r, y + Math.cos(x - y) * r];
}

class Delaunay {
  static from(points, fx = pointX, fy = pointY, that) {
    return new Delaunay("length" in points ? flatArray(points, fx, fy, that) : Float64Array.from(flatIterable(points, fx, fy, that)));
  }

  constructor(points) {
    this._delaunator = new Delaunator(points);
    this.inedges = new Int32Array(points.length / 2);
    this._hullIndex = new Int32Array(points.length / 2);
    this.points = this._delaunator.coords;

    this._init();
  }

  update() {
    this._delaunator.update();

    this._init();

    return this;
  }

  _init() {
    const d = this._delaunator,
          points = this.points; // check for collinear

    if (d.hull && d.hull.length > 2 && collinear(d)) {
      this.collinear = Int32Array.from({
        length: points.length / 2
      }, (_, i) => i).sort((i, j) => points[2 * i] - points[2 * j] || points[2 * i + 1] - points[2 * j + 1]); // for exact neighbors

      const e = this.collinear[0],
            f = this.collinear[this.collinear.length - 1],
            bounds = [points[2 * e], points[2 * e + 1], points[2 * f], points[2 * f + 1]],
            r = 1e-8 * Math.hypot(bounds[3] - bounds[1], bounds[2] - bounds[0]);

      for (let i = 0, n = points.length / 2; i < n; ++i) {
        const p = jitter(points[2 * i], points[2 * i + 1], r);
        points[2 * i] = p[0];
        points[2 * i + 1] = p[1];
      }

      this._delaunator = new Delaunator(points);
    } else {
      delete this.collinear;
    }

    const halfedges = this.halfedges = this._delaunator.halfedges;
    const hull = this.hull = this._delaunator.hull;
    const triangles = this.triangles = this._delaunator.triangles;
    const inedges = this.inedges.fill(-1);

    const hullIndex = this._hullIndex.fill(-1); // Compute an index from each point to an (arbitrary) incoming halfedge
    // Used to give the first neighbor of each point; for this reason,
    // on the hull we give priority to exterior halfedges


    for (let e = 0, n = halfedges.length; e < n; ++e) {
      const p = triangles[e % 3 === 2 ? e - 2 : e + 1];
      if (halfedges[e] === -1 || inedges[p] === -1) inedges[p] = e;
    }

    for (let i = 0, n = hull.length; i < n; ++i) {
      hullIndex[hull[i]] = i;
    } // degenerate case: 1 or 2 (distinct) points


    if (hull.length <= 2 && hull.length > 0) {
      this.triangles = new Int32Array(3).fill(-1);
      this.halfedges = new Int32Array(3).fill(-1);
      this.triangles[0] = hull[0];
      this.triangles[1] = hull[1];
      this.triangles[2] = hull[1];
      inedges[hull[0]] = 1;
      if (hull.length === 2) inedges[hull[1]] = 0;
    }
  }

  voronoi(bounds) {
    return new Voronoi(this, bounds);
  }

  *neighbors(i) {
    const {
      inedges,
      hull,
      _hullIndex,
      halfedges,
      triangles,
      collinear
    } = this; // degenerate case with several collinear points

    if (collinear) {
      const l = collinear.indexOf(i);
      if (l > 0) yield collinear[l - 1];
      if (l < collinear.length - 1) yield collinear[l + 1];
      return;
    }

    const e0 = inedges[i];
    if (e0 === -1) return; // coincident point

    let e = e0,
        p0 = -1;

    do {
      yield p0 = triangles[e];
      e = e % 3 === 2 ? e - 2 : e + 1;
      if (triangles[e] !== i) return; // bad triangulation

      e = halfedges[e];

      if (e === -1) {
        const p = hull[(_hullIndex[i] + 1) % hull.length];
        if (p !== p0) yield p;
        return;
      }
    } while (e !== e0);
  }

  find(x, y, i = 0) {
    if ((x = +x, x !== x) || (y = +y, y !== y)) return -1;
    const i0 = i;
    let c;

    while ((c = this._step(i, x, y)) >= 0 && c !== i && c !== i0) i = c;

    return c;
  }

  _step(i, x, y) {
    const {
      inedges,
      hull,
      _hullIndex,
      halfedges,
      triangles,
      points
    } = this;
    if (inedges[i] === -1 || !points.length) return (i + 1) % (points.length >> 1);
    let c = i;
    let dc = pow(x - points[i * 2], 2) + pow(y - points[i * 2 + 1], 2);
    const e0 = inedges[i];
    let e = e0;

    do {
      let t = triangles[e];
      const dt = pow(x - points[t * 2], 2) + pow(y - points[t * 2 + 1], 2);
      if (dt < dc) dc = dt, c = t;
      e = e % 3 === 2 ? e - 2 : e + 1;
      if (triangles[e] !== i) break; // bad triangulation

      e = halfedges[e];

      if (e === -1) {
        e = hull[(_hullIndex[i] + 1) % hull.length];

        if (e !== t) {
          if (pow(x - points[e * 2], 2) + pow(y - points[e * 2 + 1], 2) < dc) return e;
        }

        break;
      }
    } while (e !== e0);

    return c;
  }

  render(context) {
    const buffer = context == null ? context = new Path() : undefined;
    const {
      points,
      halfedges,
      triangles
    } = this;

    for (let i = 0, n = halfedges.length; i < n; ++i) {
      const j = halfedges[i];
      if (j < i) continue;
      const ti = triangles[i] * 2;
      const tj = triangles[j] * 2;
      context.moveTo(points[ti], points[ti + 1]);
      context.lineTo(points[tj], points[tj + 1]);
    }

    this.renderHull(context);
    return buffer && buffer.value();
  }

  renderPoints(context, r = 2) {
    const buffer = context == null ? context = new Path() : undefined;
    const {
      points
    } = this;

    for (let i = 0, n = points.length; i < n; i += 2) {
      const x = points[i],
            y = points[i + 1];
      context.moveTo(x + r, y);
      context.arc(x, y, r, 0, tau);
    }

    return buffer && buffer.value();
  }

  renderHull(context) {
    const buffer = context == null ? context = new Path() : undefined;
    const {
      hull,
      points
    } = this;
    const h = hull[0] * 2,
          n = hull.length;
    context.moveTo(points[h], points[h + 1]);

    for (let i = 1; i < n; ++i) {
      const h = 2 * hull[i];
      context.lineTo(points[h], points[h + 1]);
    }

    context.closePath();
    return buffer && buffer.value();
  }

  hullPolygon() {
    const polygon = new Polygon();
    this.renderHull(polygon);
    return polygon.value();
  }

  renderTriangle(i, context) {
    const buffer = context == null ? context = new Path() : undefined;
    const {
      points,
      triangles
    } = this;
    const t0 = triangles[i *= 3] * 2;
    const t1 = triangles[i + 1] * 2;
    const t2 = triangles[i + 2] * 2;
    context.moveTo(points[t0], points[t0 + 1]);
    context.lineTo(points[t1], points[t1 + 1]);
    context.lineTo(points[t2], points[t2 + 1]);
    context.closePath();
    return buffer && buffer.value();
  }

  *trianglePolygons() {
    const {
      triangles
    } = this;

    for (let i = 0, n = triangles.length / 3; i < n; ++i) {
      yield this.trianglePolygon(i);
    }
  }

  trianglePolygon(i) {
    const polygon = new Polygon();
    this.renderTriangle(i, polygon);
    return polygon.value();
  }

}

function flatArray(points, fx, fy, that) {
  const n = points.length;
  const array = new Float64Array(n * 2);

  for (let i = 0; i < n; ++i) {
    const p = points[i];
    array[i * 2] = fx.call(that, p, i, points);
    array[i * 2 + 1] = fy.call(that, p, i, points);
  }

  return array;
}

function* flatIterable(points, fx, fy, that) {
  let i = 0;

  for (const p of points) {
    yield fx.call(that, p, i, points);
    yield fy.call(that, p, i, points);
    ++i;
  }
}

var EOL = {},
    EOF = {},
    QUOTE = 34,
    NEWLINE = 10,
    RETURN = 13;

function objectConverter(columns) {
  return new Function("d", "return {" + columns.map(function (name, i) {
    return JSON.stringify(name) + ": d[" + i + "] || \"\"";
  }).join(",") + "}");
}

function customConverter(columns, f) {
  var object = objectConverter(columns);
  return function (row, i) {
    return f(object(row), i, columns);
  };
} // Compute unique columns in order of discovery.


function inferColumns(rows) {
  var columnSet = Object.create(null),
      columns = [];
  rows.forEach(function (row) {
    for (var column in row) {
      if (!(column in columnSet)) {
        columns.push(columnSet[column] = column);
      }
    }
  });
  return columns;
}

function pad(value, width) {
  var s = value + "",
      length = s.length;
  return length < width ? new Array(width - length + 1).join(0) + s : s;
}

function formatYear(year) {
  return year < 0 ? "-" + pad(-year, 6) : year > 9999 ? "+" + pad(year, 6) : pad(year, 4);
}

function formatDate(date) {
  var hours = date.getUTCHours(),
      minutes = date.getUTCMinutes(),
      seconds = date.getUTCSeconds(),
      milliseconds = date.getUTCMilliseconds();
  return isNaN(date) ? "Invalid Date" : formatYear(date.getUTCFullYear()) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2) + (milliseconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "." + pad(milliseconds, 3) + "Z" : seconds ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2) + "Z" : minutes || hours ? "T" + pad(hours, 2) + ":" + pad(minutes, 2) + "Z" : "");
}

function dsvFormat (delimiter) {
  var reFormat = new RegExp("[\"" + delimiter + "\n\r]"),
      DELIMITER = delimiter.charCodeAt(0);

  function parse(text, f) {
    var convert,
        columns,
        rows = parseRows(text, function (row, i) {
      if (convert) return convert(row, i - 1);
      columns = row, convert = f ? customConverter(row, f) : objectConverter(row);
    });
    rows.columns = columns || [];
    return rows;
  }

  function parseRows(text, f) {
    var rows = [],
        // output rows
    N = text.length,
        I = 0,
        // current character index
    n = 0,
        // current line number
    t,
        // current token
    eof = N <= 0,
        // current token followed by EOF?
    eol = false; // current token followed by EOL?
    // Strip the trailing newline.

    if (text.charCodeAt(N - 1) === NEWLINE) --N;
    if (text.charCodeAt(N - 1) === RETURN) --N;

    function token() {
      if (eof) return EOF;
      if (eol) return eol = false, EOL; // Unescape quotes.

      var i,
          j = I,
          c;

      if (text.charCodeAt(j) === QUOTE) {
        while (I++ < N && text.charCodeAt(I) !== QUOTE || text.charCodeAt(++I) === QUOTE);

        if ((i = I) >= N) eof = true;else if ((c = text.charCodeAt(I++)) === NEWLINE) eol = true;else if (c === RETURN) {
          eol = true;
          if (text.charCodeAt(I) === NEWLINE) ++I;
        }
        return text.slice(j + 1, i - 1).replace(/""/g, "\"");
      } // Find next delimiter or newline.


      while (I < N) {
        if ((c = text.charCodeAt(i = I++)) === NEWLINE) eol = true;else if (c === RETURN) {
          eol = true;
          if (text.charCodeAt(I) === NEWLINE) ++I;
        } else if (c !== DELIMITER) continue;
        return text.slice(j, i);
      } // Return last token before EOF.


      return eof = true, text.slice(j, N);
    }

    while ((t = token()) !== EOF) {
      var row = [];

      while (t !== EOL && t !== EOF) row.push(t), t = token();

      if (f && (row = f(row, n++)) == null) continue;
      rows.push(row);
    }

    return rows;
  }

  function preformatBody(rows, columns) {
    return rows.map(function (row) {
      return columns.map(function (column) {
        return formatValue(row[column]);
      }).join(delimiter);
    });
  }

  function format(rows, columns) {
    if (columns == null) columns = inferColumns(rows);
    return [columns.map(formatValue).join(delimiter)].concat(preformatBody(rows, columns)).join("\n");
  }

  function formatBody(rows, columns) {
    if (columns == null) columns = inferColumns(rows);
    return preformatBody(rows, columns).join("\n");
  }

  function formatRows(rows) {
    return rows.map(formatRow).join("\n");
  }

  function formatRow(row) {
    return row.map(formatValue).join(delimiter);
  }

  function formatValue(value) {
    return value == null ? "" : value instanceof Date ? formatDate(value) : reFormat.test(value += "") ? "\"" + value.replace(/"/g, "\"\"") + "\"" : value;
  }

  return {
    parse: parse,
    parseRows: parseRows,
    format: format,
    formatBody: formatBody,
    formatRows: formatRows,
    formatRow: formatRow,
    formatValue: formatValue
  };
}

var tsv = dsvFormat("\t");
var tsvParse = tsv.parse;

function responseText(response) {
  if (!response.ok) throw new Error(response.status + " " + response.statusText);
  return response.text();
}

function text$1 (input, init) {
  return fetch(input, init).then(responseText);
}

function dsvParse(parse) {
  return function (input, init, row) {
    if (arguments.length === 2 && typeof init === "function") row = init, init = undefined;
    return text$1(input, init).then(function (response) {
      return parse(response, row);
    });
  };
}
var tsv$1 = dsvParse(tsvParse);

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

var epsilon$1 = 1e-6;
var epsilon2 = 1e-12;
var pi = Math.PI;
var halfPi = pi / 2;
var quarterPi = pi / 4;
var tau$1 = pi * 2;
var degrees = 180 / pi;
var radians = pi / 180;
var abs = Math.abs;
var atan = Math.atan;
var atan2 = Math.atan2;
var cos = Math.cos;
var exp = Math.exp;
var log = Math.log;
var sin = Math.sin;
var sign = Math.sign || function (x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};
var sqrt = Math.sqrt;
var tan = Math.tan;
function acos(x) {
  return x > 1 ? 0 : x < -1 ? pi : Math.acos(x);
}
function asin(x) {
  return x > 1 ? halfPi : x < -1 ? -halfPi : Math.asin(x);
}

function noop$2() {}

function streamGeometry(geometry, stream) {
  if (geometry && streamGeometryType.hasOwnProperty(geometry.type)) {
    streamGeometryType[geometry.type](geometry, stream);
  }
}

var streamObjectType = {
  Feature: function (object, stream) {
    streamGeometry(object.geometry, stream);
  },
  FeatureCollection: function (object, stream) {
    var features = object.features,
        i = -1,
        n = features.length;

    while (++i < n) streamGeometry(features[i].geometry, stream);
  }
};
var streamGeometryType = {
  Sphere: function (object, stream) {
    stream.sphere();
  },
  Point: function (object, stream) {
    object = object.coordinates;
    stream.point(object[0], object[1], object[2]);
  },
  MultiPoint: function (object, stream) {
    var coordinates = object.coordinates,
        i = -1,
        n = coordinates.length;

    while (++i < n) object = coordinates[i], stream.point(object[0], object[1], object[2]);
  },
  LineString: function (object, stream) {
    streamLine(object.coordinates, stream, 0);
  },
  MultiLineString: function (object, stream) {
    var coordinates = object.coordinates,
        i = -1,
        n = coordinates.length;

    while (++i < n) streamLine(coordinates[i], stream, 0);
  },
  Polygon: function (object, stream) {
    streamPolygon(object.coordinates, stream);
  },
  MultiPolygon: function (object, stream) {
    var coordinates = object.coordinates,
        i = -1,
        n = coordinates.length;

    while (++i < n) streamPolygon(coordinates[i], stream);
  },
  GeometryCollection: function (object, stream) {
    var geometries = object.geometries,
        i = -1,
        n = geometries.length;

    while (++i < n) streamGeometry(geometries[i], stream);
  }
};

function streamLine(coordinates, stream, closed) {
  var i = -1,
      n = coordinates.length - closed,
      coordinate;
  stream.lineStart();

  while (++i < n) coordinate = coordinates[i], stream.point(coordinate[0], coordinate[1], coordinate[2]);

  stream.lineEnd();
}

function streamPolygon(coordinates, stream) {
  var i = -1,
      n = coordinates.length;
  stream.polygonStart();

  while (++i < n) streamLine(coordinates[i], stream, 1);

  stream.polygonEnd();
}

function geoStream (object, stream) {
  if (object && streamObjectType.hasOwnProperty(object.type)) {
    streamObjectType[object.type](object, stream);
  } else {
    streamGeometry(object, stream);
  }
}

function spherical(cartesian) {
  return [atan2(cartesian[1], cartesian[0]), asin(cartesian[2])];
}
function cartesian(spherical) {
  var lambda = spherical[0],
      phi = spherical[1],
      cosPhi = cos(phi);
  return [cosPhi * cos(lambda), cosPhi * sin(lambda), sin(phi)];
}
function cartesianDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cartesianCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
} // TODO return a

function cartesianAddInPlace(a, b) {
  a[0] += b[0], a[1] += b[1], a[2] += b[2];
}
function cartesianScale(vector, k) {
  return [vector[0] * k, vector[1] * k, vector[2] * k];
} // TODO return d

function cartesianNormalizeInPlace(d) {
  var l = sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  d[0] /= l, d[1] /= l, d[2] /= l;
}

function compose (a, b) {
  function compose(x, y) {
    return x = a(x, y), b(x[0], x[1]);
  }

  if (a.invert && b.invert) compose.invert = function (x, y) {
    return x = b.invert(x, y), x && a.invert(x[0], x[1]);
  };
  return compose;
}

function rotationIdentity(lambda, phi) {
  return [abs(lambda) > pi ? lambda + Math.round(-lambda / tau$1) * tau$1 : lambda, phi];
}

rotationIdentity.invert = rotationIdentity;
function rotateRadians(deltaLambda, deltaPhi, deltaGamma) {
  return (deltaLambda %= tau$1) ? deltaPhi || deltaGamma ? compose(rotationLambda(deltaLambda), rotationPhiGamma(deltaPhi, deltaGamma)) : rotationLambda(deltaLambda) : deltaPhi || deltaGamma ? rotationPhiGamma(deltaPhi, deltaGamma) : rotationIdentity;
}

function forwardRotationLambda(deltaLambda) {
  return function (lambda, phi) {
    return lambda += deltaLambda, [lambda > pi ? lambda - tau$1 : lambda < -pi ? lambda + tau$1 : lambda, phi];
  };
}

function rotationLambda(deltaLambda) {
  var rotation = forwardRotationLambda(deltaLambda);
  rotation.invert = forwardRotationLambda(-deltaLambda);
  return rotation;
}

function rotationPhiGamma(deltaPhi, deltaGamma) {
  var cosDeltaPhi = cos(deltaPhi),
      sinDeltaPhi = sin(deltaPhi),
      cosDeltaGamma = cos(deltaGamma),
      sinDeltaGamma = sin(deltaGamma);

  function rotation(lambda, phi) {
    var cosPhi = cos(phi),
        x = cos(lambda) * cosPhi,
        y = sin(lambda) * cosPhi,
        z = sin(phi),
        k = z * cosDeltaPhi + x * sinDeltaPhi;
    return [atan2(y * cosDeltaGamma - k * sinDeltaGamma, x * cosDeltaPhi - z * sinDeltaPhi), asin(k * cosDeltaGamma + y * sinDeltaGamma)];
  }

  rotation.invert = function (lambda, phi) {
    var cosPhi = cos(phi),
        x = cos(lambda) * cosPhi,
        y = sin(lambda) * cosPhi,
        z = sin(phi),
        k = z * cosDeltaGamma - y * sinDeltaGamma;
    return [atan2(y * cosDeltaGamma + z * sinDeltaGamma, x * cosDeltaPhi + k * sinDeltaPhi), asin(k * cosDeltaPhi - x * sinDeltaPhi)];
  };

  return rotation;
}

function rotation (rotate) {
  rotate = rotateRadians(rotate[0] * radians, rotate[1] * radians, rotate.length > 2 ? rotate[2] * radians : 0);

  function forward(coordinates) {
    coordinates = rotate(coordinates[0] * radians, coordinates[1] * radians);
    return coordinates[0] *= degrees, coordinates[1] *= degrees, coordinates;
  }

  forward.invert = function (coordinates) {
    coordinates = rotate.invert(coordinates[0] * radians, coordinates[1] * radians);
    return coordinates[0] *= degrees, coordinates[1] *= degrees, coordinates;
  };

  return forward;
}

function circleStream(stream, radius, delta, direction, t0, t1) {
  if (!delta) return;
  var cosRadius = cos(radius),
      sinRadius = sin(radius),
      step = direction * delta;

  if (t0 == null) {
    t0 = radius + direction * tau$1;
    t1 = radius - step / 2;
  } else {
    t0 = circleRadius(cosRadius, t0);
    t1 = circleRadius(cosRadius, t1);
    if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * tau$1;
  }

  for (var point, t = t0; direction > 0 ? t > t1 : t < t1; t -= step) {
    point = spherical([cosRadius, -sinRadius * cos(t), -sinRadius * sin(t)]);
    stream.point(point[0], point[1]);
  }
} // Returns the signed angle of a cartesian point relative to [cosRadius, 0, 0].

function circleRadius(cosRadius, point) {
  point = cartesian(point), point[0] -= cosRadius;
  cartesianNormalizeInPlace(point);
  var radius = acos(-point[1]);
  return ((-point[2] < 0 ? -radius : radius) + tau$1 - epsilon$1) % tau$1;
}

function clipBuffer () {
  var lines = [],
      line;
  return {
    point: function (x, y, m) {
      line.push([x, y, m]);
    },
    lineStart: function () {
      lines.push(line = []);
    },
    lineEnd: noop$2,
    rejoin: function () {
      if (lines.length > 1) lines.push(lines.pop().concat(lines.shift()));
    },
    result: function () {
      var result = lines;
      lines = [];
      line = null;
      return result;
    }
  };
}

function pointEqual (a, b) {
  return abs(a[0] - b[0]) < epsilon$1 && abs(a[1] - b[1]) < epsilon$1;
}

function Intersection(point, points, other, entry) {
  this.x = point;
  this.z = points;
  this.o = other; // another intersection

  this.e = entry; // is an entry?

  this.v = false; // visited

  this.n = this.p = null; // next & previous
} // A generalized polygon clipping algorithm: given a polygon that has been cut
// into its visible line segments, and rejoins the segments by interpolating
// along the clip edge.


function clipRejoin (segments, compareIntersection, startInside, interpolate, stream) {
  var subject = [],
      clip = [],
      i,
      n;
  segments.forEach(function (segment) {
    if ((n = segment.length - 1) <= 0) return;
    var n,
        p0 = segment[0],
        p1 = segment[n],
        x;

    if (pointEqual(p0, p1)) {
      if (!p0[2] && !p1[2]) {
        stream.lineStart();

        for (i = 0; i < n; ++i) stream.point((p0 = segment[i])[0], p0[1]);

        stream.lineEnd();
        return;
      } // handle degenerate cases by moving the point


      p1[0] += 2 * epsilon$1;
    }

    subject.push(x = new Intersection(p0, segment, null, true));
    clip.push(x.o = new Intersection(p0, null, x, false));
    subject.push(x = new Intersection(p1, segment, null, false));
    clip.push(x.o = new Intersection(p1, null, x, true));
  });
  if (!subject.length) return;
  clip.sort(compareIntersection);
  link(subject);
  link(clip);

  for (i = 0, n = clip.length; i < n; ++i) {
    clip[i].e = startInside = !startInside;
  }

  var start = subject[0],
      points,
      point;

  while (1) {
    // Find first unvisited intersection.
    var current = start,
        isSubject = true;

    while (current.v) if ((current = current.n) === start) return;

    points = current.z;
    stream.lineStart();

    do {
      current.v = current.o.v = true;

      if (current.e) {
        if (isSubject) {
          for (i = 0, n = points.length; i < n; ++i) stream.point((point = points[i])[0], point[1]);
        } else {
          interpolate(current.x, current.n.x, 1, stream);
        }

        current = current.n;
      } else {
        if (isSubject) {
          points = current.p.z;

          for (i = points.length - 1; i >= 0; --i) stream.point((point = points[i])[0], point[1]);
        } else {
          interpolate(current.x, current.p.x, -1, stream);
        }

        current = current.p;
      }

      current = current.o;
      points = current.z;
      isSubject = !isSubject;
    } while (!current.v);

    stream.lineEnd();
  }
}

function link(array) {
  if (!(n = array.length)) return;
  var n,
      i = 0,
      a = array[0],
      b;

  while (++i < n) {
    a.n = b = array[i];
    b.p = a;
    a = b;
  }

  a.n = b = array[0];
  b.p = a;
}

function longitude(point) {
  if (abs(point[0]) <= pi) return point[0];else return sign(point[0]) * ((abs(point[0]) + pi) % tau$1 - pi);
}

function polygonContains (polygon, point) {
  var lambda = longitude(point),
      phi = point[1],
      sinPhi = sin(phi),
      normal = [sin(lambda), -cos(lambda), 0],
      angle = 0,
      winding = 0;
  var sum = new Adder();
  if (sinPhi === 1) phi = halfPi + epsilon$1;else if (sinPhi === -1) phi = -halfPi - epsilon$1;

  for (var i = 0, n = polygon.length; i < n; ++i) {
    if (!(m = (ring = polygon[i]).length)) continue;
    var ring,
        m,
        point0 = ring[m - 1],
        lambda0 = longitude(point0),
        phi0 = point0[1] / 2 + quarterPi,
        sinPhi0 = sin(phi0),
        cosPhi0 = cos(phi0);

    for (var j = 0; j < m; ++j, lambda0 = lambda1, sinPhi0 = sinPhi1, cosPhi0 = cosPhi1, point0 = point1) {
      var point1 = ring[j],
          lambda1 = longitude(point1),
          phi1 = point1[1] / 2 + quarterPi,
          sinPhi1 = sin(phi1),
          cosPhi1 = cos(phi1),
          delta = lambda1 - lambda0,
          sign = delta >= 0 ? 1 : -1,
          absDelta = sign * delta,
          antimeridian = absDelta > pi,
          k = sinPhi0 * sinPhi1;
      sum.add(atan2(k * sign * sin(absDelta), cosPhi0 * cosPhi1 + k * cos(absDelta)));
      angle += antimeridian ? delta + sign * tau$1 : delta; // Are the longitudes either side of the point’s meridian (lambda),
      // and are the latitudes smaller than the parallel (phi)?

      if (antimeridian ^ lambda0 >= lambda ^ lambda1 >= lambda) {
        var arc = cartesianCross(cartesian(point0), cartesian(point1));
        cartesianNormalizeInPlace(arc);
        var intersection = cartesianCross(normal, arc);
        cartesianNormalizeInPlace(intersection);
        var phiArc = (antimeridian ^ delta >= 0 ? -1 : 1) * asin(intersection[2]);

        if (phi > phiArc || phi === phiArc && (arc[0] || arc[1])) {
          winding += antimeridian ^ delta >= 0 ? 1 : -1;
        }
      }
    }
  } // First, determine whether the South pole is inside or outside:
  //
  // It is inside if:
  // * the polygon winds around it in a clockwise direction.
  // * the polygon does not (cumulatively) wind around it, but has a negative
  //   (counter-clockwise) area.
  //
  // Second, count the (signed) number of times a segment crosses a lambda
  // from the point to the South pole.  If it is zero, then the point is the
  // same side as the South pole.


  return (angle < -epsilon$1 || angle < epsilon$1 && sum < -epsilon2) ^ winding & 1;
}

function clip (pointVisible, clipLine, interpolate, start) {
  return function (sink) {
    var line = clipLine(sink),
        ringBuffer = clipBuffer(),
        ringSink = clipLine(ringBuffer),
        polygonStarted = false,
        polygon,
        segments,
        ring;
    var clip = {
      point: point,
      lineStart: lineStart,
      lineEnd: lineEnd,
      polygonStart: function () {
        clip.point = pointRing;
        clip.lineStart = ringStart;
        clip.lineEnd = ringEnd;
        segments = [];
        polygon = [];
      },
      polygonEnd: function () {
        clip.point = point;
        clip.lineStart = lineStart;
        clip.lineEnd = lineEnd;
        segments = merge(segments);
        var startInside = polygonContains(polygon, start);

        if (segments.length) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          clipRejoin(segments, compareIntersection, startInside, interpolate, sink);
        } else if (startInside) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          sink.lineStart();
          interpolate(null, null, 1, sink);
          sink.lineEnd();
        }

        if (polygonStarted) sink.polygonEnd(), polygonStarted = false;
        segments = polygon = null;
      },
      sphere: function () {
        sink.polygonStart();
        sink.lineStart();
        interpolate(null, null, 1, sink);
        sink.lineEnd();
        sink.polygonEnd();
      }
    };

    function point(lambda, phi) {
      if (pointVisible(lambda, phi)) sink.point(lambda, phi);
    }

    function pointLine(lambda, phi) {
      line.point(lambda, phi);
    }

    function lineStart() {
      clip.point = pointLine;
      line.lineStart();
    }

    function lineEnd() {
      clip.point = point;
      line.lineEnd();
    }

    function pointRing(lambda, phi) {
      ring.push([lambda, phi]);
      ringSink.point(lambda, phi);
    }

    function ringStart() {
      ringSink.lineStart();
      ring = [];
    }

    function ringEnd() {
      pointRing(ring[0][0], ring[0][1]);
      ringSink.lineEnd();
      var clean = ringSink.clean(),
          ringSegments = ringBuffer.result(),
          i,
          n = ringSegments.length,
          m,
          segment,
          point;
      ring.pop();
      polygon.push(ring);
      ring = null;
      if (!n) return; // No intersections.

      if (clean & 1) {
        segment = ringSegments[0];

        if ((m = segment.length - 1) > 0) {
          if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
          sink.lineStart();

          for (i = 0; i < m; ++i) sink.point((point = segment[i])[0], point[1]);

          sink.lineEnd();
        }

        return;
      } // Rejoin connected segments.
      // TODO reuse ringBuffer.rejoin()?


      if (n > 1 && clean & 2) ringSegments.push(ringSegments.pop().concat(ringSegments.shift()));
      segments.push(ringSegments.filter(validSegment));
    }

    return clip;
  };
}

function validSegment(segment) {
  return segment.length > 1;
} // Intersections are sorted along the clip edge. For both antimeridian cutting
// and circle clipping, the same comparison is used.


function compareIntersection(a, b) {
  return ((a = a.x)[0] < 0 ? a[1] - halfPi - epsilon$1 : halfPi - a[1]) - ((b = b.x)[0] < 0 ? b[1] - halfPi - epsilon$1 : halfPi - b[1]);
}

var clipAntimeridian = clip(function () {
  return true;
}, clipAntimeridianLine, clipAntimeridianInterpolate, [-pi, -halfPi]); // Takes a line and cuts into visible segments. Return values: 0 - there were
// intersections or the line was empty; 1 - no intersections; 2 - there were
// intersections, and the first and last segments should be rejoined.

function clipAntimeridianLine(stream) {
  var lambda0 = NaN,
      phi0 = NaN,
      sign0 = NaN,
      clean; // no intersections

  return {
    lineStart: function () {
      stream.lineStart();
      clean = 1;
    },
    point: function (lambda1, phi1) {
      var sign1 = lambda1 > 0 ? pi : -pi,
          delta = abs(lambda1 - lambda0);

      if (abs(delta - pi) < epsilon$1) {
        // line crosses a pole
        stream.point(lambda0, phi0 = (phi0 + phi1) / 2 > 0 ? halfPi : -halfPi);
        stream.point(sign0, phi0);
        stream.lineEnd();
        stream.lineStart();
        stream.point(sign1, phi0);
        stream.point(lambda1, phi0);
        clean = 0;
      } else if (sign0 !== sign1 && delta >= pi) {
        // line crosses antimeridian
        if (abs(lambda0 - sign0) < epsilon$1) lambda0 -= sign0 * epsilon$1; // handle degeneracies

        if (abs(lambda1 - sign1) < epsilon$1) lambda1 -= sign1 * epsilon$1;
        phi0 = clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1);
        stream.point(sign0, phi0);
        stream.lineEnd();
        stream.lineStart();
        stream.point(sign1, phi0);
        clean = 0;
      }

      stream.point(lambda0 = lambda1, phi0 = phi1);
      sign0 = sign1;
    },
    lineEnd: function () {
      stream.lineEnd();
      lambda0 = phi0 = NaN;
    },
    clean: function () {
      return 2 - clean; // if intersections, rejoin first and last segments
    }
  };
}

function clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1) {
  var cosPhi0,
      cosPhi1,
      sinLambda0Lambda1 = sin(lambda0 - lambda1);
  return abs(sinLambda0Lambda1) > epsilon$1 ? atan((sin(phi0) * (cosPhi1 = cos(phi1)) * sin(lambda1) - sin(phi1) * (cosPhi0 = cos(phi0)) * sin(lambda0)) / (cosPhi0 * cosPhi1 * sinLambda0Lambda1)) : (phi0 + phi1) / 2;
}

function clipAntimeridianInterpolate(from, to, direction, stream) {
  var phi;

  if (from == null) {
    phi = direction * halfPi;
    stream.point(-pi, phi);
    stream.point(0, phi);
    stream.point(pi, phi);
    stream.point(pi, 0);
    stream.point(pi, -phi);
    stream.point(0, -phi);
    stream.point(-pi, -phi);
    stream.point(-pi, 0);
    stream.point(-pi, phi);
  } else if (abs(from[0] - to[0]) > epsilon$1) {
    var lambda = from[0] < to[0] ? pi : -pi;
    phi = direction * lambda / 2;
    stream.point(-lambda, phi);
    stream.point(0, phi);
    stream.point(lambda, phi);
  } else {
    stream.point(to[0], to[1]);
  }
}

function clipCircle (radius) {
  var cr = cos(radius),
      delta = 6 * radians,
      smallRadius = cr > 0,
      notHemisphere = abs(cr) > epsilon$1; // TODO optimise for this common case

  function interpolate(from, to, direction, stream) {
    circleStream(stream, radius, delta, direction, from, to);
  }

  function visible(lambda, phi) {
    return cos(lambda) * cos(phi) > cr;
  } // Takes a line and cuts into visible segments. Return values used for polygon
  // clipping: 0 - there were intersections or the line was empty; 1 - no
  // intersections 2 - there were intersections, and the first and last segments
  // should be rejoined.


  function clipLine(stream) {
    var point0, // previous point
    c0, // code for previous point
    v0, // visibility of previous point
    v00, // visibility of first point
    clean; // no intersections

    return {
      lineStart: function () {
        v00 = v0 = false;
        clean = 1;
      },
      point: function (lambda, phi) {
        var point1 = [lambda, phi],
            point2,
            v = visible(lambda, phi),
            c = smallRadius ? v ? 0 : code(lambda, phi) : v ? code(lambda + (lambda < 0 ? pi : -pi), phi) : 0;
        if (!point0 && (v00 = v0 = v)) stream.lineStart();

        if (v !== v0) {
          point2 = intersect(point0, point1);
          if (!point2 || pointEqual(point0, point2) || pointEqual(point1, point2)) point1[2] = 1;
        }

        if (v !== v0) {
          clean = 0;

          if (v) {
            // outside going in
            stream.lineStart();
            point2 = intersect(point1, point0);
            stream.point(point2[0], point2[1]);
          } else {
            // inside going out
            point2 = intersect(point0, point1);
            stream.point(point2[0], point2[1], 2);
            stream.lineEnd();
          }

          point0 = point2;
        } else if (notHemisphere && point0 && smallRadius ^ v) {
          var t; // If the codes for two points are different, or are both zero,
          // and there this segment intersects with the small circle.

          if (!(c & c0) && (t = intersect(point1, point0, true))) {
            clean = 0;

            if (smallRadius) {
              stream.lineStart();
              stream.point(t[0][0], t[0][1]);
              stream.point(t[1][0], t[1][1]);
              stream.lineEnd();
            } else {
              stream.point(t[1][0], t[1][1]);
              stream.lineEnd();
              stream.lineStart();
              stream.point(t[0][0], t[0][1], 3);
            }
          }
        }

        if (v && (!point0 || !pointEqual(point0, point1))) {
          stream.point(point1[0], point1[1]);
        }

        point0 = point1, v0 = v, c0 = c;
      },
      lineEnd: function () {
        if (v0) stream.lineEnd();
        point0 = null;
      },
      // Rejoin first and last segments if there were intersections and the first
      // and last points were visible.
      clean: function () {
        return clean | (v00 && v0) << 1;
      }
    };
  } // Intersects the great circle between a and b with the clip circle.


  function intersect(a, b, two) {
    var pa = cartesian(a),
        pb = cartesian(b); // We have two planes, n1.p = d1 and n2.p = d2.
    // Find intersection line p(t) = c1 n1 + c2 n2 + t (n1 ⨯ n2).

    var n1 = [1, 0, 0],
        // normal
    n2 = cartesianCross(pa, pb),
        n2n2 = cartesianDot(n2, n2),
        n1n2 = n2[0],
        // cartesianDot(n1, n2),
    determinant = n2n2 - n1n2 * n1n2; // Two polar points.

    if (!determinant) return !two && a;
    var c1 = cr * n2n2 / determinant,
        c2 = -cr * n1n2 / determinant,
        n1xn2 = cartesianCross(n1, n2),
        A = cartesianScale(n1, c1),
        B = cartesianScale(n2, c2);
    cartesianAddInPlace(A, B); // Solve |p(t)|^2 = 1.

    var u = n1xn2,
        w = cartesianDot(A, u),
        uu = cartesianDot(u, u),
        t2 = w * w - uu * (cartesianDot(A, A) - 1);
    if (t2 < 0) return;
    var t = sqrt(t2),
        q = cartesianScale(u, (-w - t) / uu);
    cartesianAddInPlace(q, A);
    q = spherical(q);
    if (!two) return q; // Two intersection points.

    var lambda0 = a[0],
        lambda1 = b[0],
        phi0 = a[1],
        phi1 = b[1],
        z;
    if (lambda1 < lambda0) z = lambda0, lambda0 = lambda1, lambda1 = z;
    var delta = lambda1 - lambda0,
        polar = abs(delta - pi) < epsilon$1,
        meridian = polar || delta < epsilon$1;
    if (!polar && phi1 < phi0) z = phi0, phi0 = phi1, phi1 = z; // Check that the first point is between a and b.

    if (meridian ? polar ? phi0 + phi1 > 0 ^ q[1] < (abs(q[0] - lambda0) < epsilon$1 ? phi0 : phi1) : phi0 <= q[1] && q[1] <= phi1 : delta > pi ^ (lambda0 <= q[0] && q[0] <= lambda1)) {
      var q1 = cartesianScale(u, (-w + t) / uu);
      cartesianAddInPlace(q1, A);
      return [q, spherical(q1)];
    }
  } // Generates a 4-bit vector representing the location of a point relative to
  // the small circle's bounding box.


  function code(lambda, phi) {
    var r = smallRadius ? radius : pi - radius,
        code = 0;
    if (lambda < -r) code |= 1; // left
    else if (lambda > r) code |= 2; // right

    if (phi < -r) code |= 4; // below
    else if (phi > r) code |= 8; // above

    return code;
  }

  return clip(visible, clipLine, interpolate, smallRadius ? [0, -radius] : [-pi, radius - pi]);
}

function clipLine (a, b, x0, y0, x1, y1) {
  var ax = a[0],
      ay = a[1],
      bx = b[0],
      by = b[1],
      t0 = 0,
      t1 = 1,
      dx = bx - ax,
      dy = by - ay,
      r;
  r = x0 - ax;
  if (!dx && r > 0) return;
  r /= dx;

  if (dx < 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  } else if (dx > 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  }

  r = x1 - ax;
  if (!dx && r < 0) return;
  r /= dx;

  if (dx < 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  } else if (dx > 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  }

  r = y0 - ay;
  if (!dy && r > 0) return;
  r /= dy;

  if (dy < 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  } else if (dy > 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  }

  r = y1 - ay;
  if (!dy && r < 0) return;
  r /= dy;

  if (dy < 0) {
    if (r > t1) return;
    if (r > t0) t0 = r;
  } else if (dy > 0) {
    if (r < t0) return;
    if (r < t1) t1 = r;
  }

  if (t0 > 0) a[0] = ax + t0 * dx, a[1] = ay + t0 * dy;
  if (t1 < 1) b[0] = ax + t1 * dx, b[1] = ay + t1 * dy;
  return true;
}

var clipMax = 1e9,
    clipMin = -clipMax; // TODO Use d3-polygon’s polygonContains here for the ring check?
// TODO Eliminate duplicate buffering in clipBuffer and polygon.push?

function clipRectangle(x0, y0, x1, y1) {
  function visible(x, y) {
    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
  }

  function interpolate(from, to, direction, stream) {
    var a = 0,
        a1 = 0;

    if (from == null || (a = corner(from, direction)) !== (a1 = corner(to, direction)) || comparePoint(from, to) < 0 ^ direction > 0) {
      do stream.point(a === 0 || a === 3 ? x0 : x1, a > 1 ? y1 : y0); while ((a = (a + direction + 4) % 4) !== a1);
    } else {
      stream.point(to[0], to[1]);
    }
  }

  function corner(p, direction) {
    return abs(p[0] - x0) < epsilon$1 ? direction > 0 ? 0 : 3 : abs(p[0] - x1) < epsilon$1 ? direction > 0 ? 2 : 1 : abs(p[1] - y0) < epsilon$1 ? direction > 0 ? 1 : 0 : direction > 0 ? 3 : 2; // abs(p[1] - y1) < epsilon
  }

  function compareIntersection(a, b) {
    return comparePoint(a.x, b.x);
  }

  function comparePoint(a, b) {
    var ca = corner(a, 1),
        cb = corner(b, 1);
    return ca !== cb ? ca - cb : ca === 0 ? b[1] - a[1] : ca === 1 ? a[0] - b[0] : ca === 2 ? a[1] - b[1] : b[0] - a[0];
  }

  return function (stream) {
    var activeStream = stream,
        bufferStream = clipBuffer(),
        segments,
        polygon,
        ring,
        x__,
        y__,
        v__,
        // first point
    x_,
        y_,
        v_,
        // previous point
    first,
        clean;
    var clipStream = {
      point: point,
      lineStart: lineStart,
      lineEnd: lineEnd,
      polygonStart: polygonStart,
      polygonEnd: polygonEnd
    };

    function point(x, y) {
      if (visible(x, y)) activeStream.point(x, y);
    }

    function polygonInside() {
      var winding = 0;

      for (var i = 0, n = polygon.length; i < n; ++i) {
        for (var ring = polygon[i], j = 1, m = ring.length, point = ring[0], a0, a1, b0 = point[0], b1 = point[1]; j < m; ++j) {
          a0 = b0, a1 = b1, point = ring[j], b0 = point[0], b1 = point[1];

          if (a1 <= y1) {
            if (b1 > y1 && (b0 - a0) * (y1 - a1) > (b1 - a1) * (x0 - a0)) ++winding;
          } else {
            if (b1 <= y1 && (b0 - a0) * (y1 - a1) < (b1 - a1) * (x0 - a0)) --winding;
          }
        }
      }

      return winding;
    } // Buffer geometry within a polygon and then clip it en masse.


    function polygonStart() {
      activeStream = bufferStream, segments = [], polygon = [], clean = true;
    }

    function polygonEnd() {
      var startInside = polygonInside(),
          cleanInside = clean && startInside,
          visible = (segments = merge(segments)).length;

      if (cleanInside || visible) {
        stream.polygonStart();

        if (cleanInside) {
          stream.lineStart();
          interpolate(null, null, 1, stream);
          stream.lineEnd();
        }

        if (visible) {
          clipRejoin(segments, compareIntersection, startInside, interpolate, stream);
        }

        stream.polygonEnd();
      }

      activeStream = stream, segments = polygon = ring = null;
    }

    function lineStart() {
      clipStream.point = linePoint;
      if (polygon) polygon.push(ring = []);
      first = true;
      v_ = false;
      x_ = y_ = NaN;
    } // TODO rather than special-case polygons, simply handle them separately.
    // Ideally, coincident intersection points should be jittered to avoid
    // clipping issues.


    function lineEnd() {
      if (segments) {
        linePoint(x__, y__);
        if (v__ && v_) bufferStream.rejoin();
        segments.push(bufferStream.result());
      }

      clipStream.point = point;
      if (v_) activeStream.lineEnd();
    }

    function linePoint(x, y) {
      var v = visible(x, y);
      if (polygon) ring.push([x, y]);

      if (first) {
        x__ = x, y__ = y, v__ = v;
        first = false;

        if (v) {
          activeStream.lineStart();
          activeStream.point(x, y);
        }
      } else {
        if (v && v_) activeStream.point(x, y);else {
          var a = [x_ = Math.max(clipMin, Math.min(clipMax, x_)), y_ = Math.max(clipMin, Math.min(clipMax, y_))],
              b = [x = Math.max(clipMin, Math.min(clipMax, x)), y = Math.max(clipMin, Math.min(clipMax, y))];

          if (clipLine(a, b, x0, y0, x1, y1)) {
            if (!v_) {
              activeStream.lineStart();
              activeStream.point(a[0], a[1]);
            }

            activeStream.point(b[0], b[1]);
            if (!v) activeStream.lineEnd();
            clean = false;
          } else if (v) {
            activeStream.lineStart();
            activeStream.point(x, y);
            clean = false;
          }
        }
      }

      x_ = x, y_ = y, v_ = v;
    }

    return clipStream;
  };
}

var identity$1 = (x => x);

var areaSum = new Adder(),
    areaRingSum = new Adder(),
    x00,
    y00,
    x0,
    y0;
var areaStream = {
  point: noop$2,
  lineStart: noop$2,
  lineEnd: noop$2,
  polygonStart: function () {
    areaStream.lineStart = areaRingStart;
    areaStream.lineEnd = areaRingEnd;
  },
  polygonEnd: function () {
    areaStream.lineStart = areaStream.lineEnd = areaStream.point = noop$2;
    areaSum.add(abs(areaRingSum));
    areaRingSum = new Adder();
  },
  result: function () {
    var area = areaSum / 2;
    areaSum = new Adder();
    return area;
  }
};

function areaRingStart() {
  areaStream.point = areaPointFirst;
}

function areaPointFirst(x, y) {
  areaStream.point = areaPoint;
  x00 = x0 = x, y00 = y0 = y;
}

function areaPoint(x, y) {
  areaRingSum.add(y0 * x - x0 * y);
  x0 = x, y0 = y;
}

function areaRingEnd() {
  areaPoint(x00, y00);
}

var x0$1 = Infinity,
    y0$1 = x0$1,
    x1 = -x0$1,
    y1 = x1;
var boundsStream = {
  point: boundsPoint,
  lineStart: noop$2,
  lineEnd: noop$2,
  polygonStart: noop$2,
  polygonEnd: noop$2,
  result: function () {
    var bounds = [[x0$1, y0$1], [x1, y1]];
    x1 = y1 = -(y0$1 = x0$1 = Infinity);
    return bounds;
  }
};

function boundsPoint(x, y) {
  if (x < x0$1) x0$1 = x;
  if (x > x1) x1 = x;
  if (y < y0$1) y0$1 = y;
  if (y > y1) y1 = y;
}

var X0 = 0,
    Y0 = 0,
    Z0 = 0,
    X1 = 0,
    Y1 = 0,
    Z1 = 0,
    X2 = 0,
    Y2 = 0,
    Z2 = 0,
    x00$1,
    y00$1,
    x0$2,
    y0$2;
var centroidStream = {
  point: centroidPoint,
  lineStart: centroidLineStart,
  lineEnd: centroidLineEnd,
  polygonStart: function () {
    centroidStream.lineStart = centroidRingStart;
    centroidStream.lineEnd = centroidRingEnd;
  },
  polygonEnd: function () {
    centroidStream.point = centroidPoint;
    centroidStream.lineStart = centroidLineStart;
    centroidStream.lineEnd = centroidLineEnd;
  },
  result: function () {
    var centroid = Z2 ? [X2 / Z2, Y2 / Z2] : Z1 ? [X1 / Z1, Y1 / Z1] : Z0 ? [X0 / Z0, Y0 / Z0] : [NaN, NaN];
    X0 = Y0 = Z0 = X1 = Y1 = Z1 = X2 = Y2 = Z2 = 0;
    return centroid;
  }
};

function centroidPoint(x, y) {
  X0 += x;
  Y0 += y;
  ++Z0;
}

function centroidLineStart() {
  centroidStream.point = centroidPointFirstLine;
}

function centroidPointFirstLine(x, y) {
  centroidStream.point = centroidPointLine;
  centroidPoint(x0$2 = x, y0$2 = y);
}

function centroidPointLine(x, y) {
  var dx = x - x0$2,
      dy = y - y0$2,
      z = sqrt(dx * dx + dy * dy);
  X1 += z * (x0$2 + x) / 2;
  Y1 += z * (y0$2 + y) / 2;
  Z1 += z;
  centroidPoint(x0$2 = x, y0$2 = y);
}

function centroidLineEnd() {
  centroidStream.point = centroidPoint;
}

function centroidRingStart() {
  centroidStream.point = centroidPointFirstRing;
}

function centroidRingEnd() {
  centroidPointRing(x00$1, y00$1);
}

function centroidPointFirstRing(x, y) {
  centroidStream.point = centroidPointRing;
  centroidPoint(x00$1 = x0$2 = x, y00$1 = y0$2 = y);
}

function centroidPointRing(x, y) {
  var dx = x - x0$2,
      dy = y - y0$2,
      z = sqrt(dx * dx + dy * dy);
  X1 += z * (x0$2 + x) / 2;
  Y1 += z * (y0$2 + y) / 2;
  Z1 += z;
  z = y0$2 * x - x0$2 * y;
  X2 += z * (x0$2 + x);
  Y2 += z * (y0$2 + y);
  Z2 += z * 3;
  centroidPoint(x0$2 = x, y0$2 = y);
}

function PathContext(context) {
  this._context = context;
}
PathContext.prototype = {
  _radius: 4.5,
  pointRadius: function (_) {
    return this._radius = _, this;
  },
  polygonStart: function () {
    this._line = 0;
  },
  polygonEnd: function () {
    this._line = NaN;
  },
  lineStart: function () {
    this._point = 0;
  },
  lineEnd: function () {
    if (this._line === 0) this._context.closePath();
    this._point = NaN;
  },
  point: function (x, y) {
    switch (this._point) {
      case 0:
        {
          this._context.moveTo(x, y);

          this._point = 1;
          break;
        }

      case 1:
        {
          this._context.lineTo(x, y);

          break;
        }

      default:
        {
          this._context.moveTo(x + this._radius, y);

          this._context.arc(x, y, this._radius, 0, tau$1);

          break;
        }
    }
  },
  result: noop$2
};

var lengthSum = new Adder(),
    lengthRing,
    x00$2,
    y00$2,
    x0$3,
    y0$3;
var lengthStream = {
  point: noop$2,
  lineStart: function () {
    lengthStream.point = lengthPointFirst;
  },
  lineEnd: function () {
    if (lengthRing) lengthPoint(x00$2, y00$2);
    lengthStream.point = noop$2;
  },
  polygonStart: function () {
    lengthRing = true;
  },
  polygonEnd: function () {
    lengthRing = null;
  },
  result: function () {
    var length = +lengthSum;
    lengthSum = new Adder();
    return length;
  }
};

function lengthPointFirst(x, y) {
  lengthStream.point = lengthPoint;
  x00$2 = x0$3 = x, y00$2 = y0$3 = y;
}

function lengthPoint(x, y) {
  x0$3 -= x, y0$3 -= y;
  lengthSum.add(sqrt(x0$3 * x0$3 + y0$3 * y0$3));
  x0$3 = x, y0$3 = y;
}

function PathString() {
  this._string = [];
}
PathString.prototype = {
  _radius: 4.5,
  _circle: circle(4.5),
  pointRadius: function (_) {
    if ((_ = +_) !== this._radius) this._radius = _, this._circle = null;
    return this;
  },
  polygonStart: function () {
    this._line = 0;
  },
  polygonEnd: function () {
    this._line = NaN;
  },
  lineStart: function () {
    this._point = 0;
  },
  lineEnd: function () {
    if (this._line === 0) this._string.push("Z");
    this._point = NaN;
  },
  point: function (x, y) {
    switch (this._point) {
      case 0:
        {
          this._string.push("M", x, ",", y);

          this._point = 1;
          break;
        }

      case 1:
        {
          this._string.push("L", x, ",", y);

          break;
        }

      default:
        {
          if (this._circle == null) this._circle = circle(this._radius);

          this._string.push("M", x, ",", y, this._circle);

          break;
        }
    }
  },
  result: function () {
    if (this._string.length) {
      var result = this._string.join("");

      this._string = [];
      return result;
    } else {
      return null;
    }
  }
};

function circle(radius) {
  return "m0," + radius + "a" + radius + "," + radius + " 0 1,1 0," + -2 * radius + "a" + radius + "," + radius + " 0 1,1 0," + 2 * radius + "z";
}

function geoPath (projection, context) {
  var pointRadius = 4.5,
      projectionStream,
      contextStream;

  function path(object) {
    if (object) {
      if (typeof pointRadius === "function") contextStream.pointRadius(+pointRadius.apply(this, arguments));
      geoStream(object, projectionStream(contextStream));
    }

    return contextStream.result();
  }

  path.area = function (object) {
    geoStream(object, projectionStream(areaStream));
    return areaStream.result();
  };

  path.measure = function (object) {
    geoStream(object, projectionStream(lengthStream));
    return lengthStream.result();
  };

  path.bounds = function (object) {
    geoStream(object, projectionStream(boundsStream));
    return boundsStream.result();
  };

  path.centroid = function (object) {
    geoStream(object, projectionStream(centroidStream));
    return centroidStream.result();
  };

  path.projection = function (_) {
    return arguments.length ? (projectionStream = _ == null ? (projection = null, identity$1) : (projection = _).stream, path) : projection;
  };

  path.context = function (_) {
    if (!arguments.length) return context;
    contextStream = _ == null ? (context = null, new PathString()) : new PathContext(context = _);
    if (typeof pointRadius !== "function") contextStream.pointRadius(pointRadius);
    return path;
  };

  path.pointRadius = function (_) {
    if (!arguments.length) return pointRadius;
    pointRadius = typeof _ === "function" ? _ : (contextStream.pointRadius(+_), +_);
    return path;
  };

  return path.projection(projection).context(context);
}

function transformer(methods) {
  return function (stream) {
    var s = new TransformStream();

    for (var key in methods) s[key] = methods[key];

    s.stream = stream;
    return s;
  };
}

function TransformStream() {}

TransformStream.prototype = {
  constructor: TransformStream,
  point: function (x, y) {
    this.stream.point(x, y);
  },
  sphere: function () {
    this.stream.sphere();
  },
  lineStart: function () {
    this.stream.lineStart();
  },
  lineEnd: function () {
    this.stream.lineEnd();
  },
  polygonStart: function () {
    this.stream.polygonStart();
  },
  polygonEnd: function () {
    this.stream.polygonEnd();
  }
};

function fit(projection, fitBounds, object) {
  var clip = projection.clipExtent && projection.clipExtent();
  projection.scale(150).translate([0, 0]);
  if (clip != null) projection.clipExtent(null);
  geoStream(object, projection.stream(boundsStream));
  fitBounds(boundsStream.result());
  if (clip != null) projection.clipExtent(clip);
  return projection;
}

function fitExtent(projection, extent, object) {
  return fit(projection, function (b) {
    var w = extent[1][0] - extent[0][0],
        h = extent[1][1] - extent[0][1],
        k = Math.min(w / (b[1][0] - b[0][0]), h / (b[1][1] - b[0][1])),
        x = +extent[0][0] + (w - k * (b[1][0] + b[0][0])) / 2,
        y = +extent[0][1] + (h - k * (b[1][1] + b[0][1])) / 2;
    projection.scale(150 * k).translate([x, y]);
  }, object);
}
function fitSize(projection, size, object) {
  return fitExtent(projection, [[0, 0], size], object);
}
function fitWidth(projection, width, object) {
  return fit(projection, function (b) {
    var w = +width,
        k = w / (b[1][0] - b[0][0]),
        x = (w - k * (b[1][0] + b[0][0])) / 2,
        y = -k * b[0][1];
    projection.scale(150 * k).translate([x, y]);
  }, object);
}
function fitHeight(projection, height, object) {
  return fit(projection, function (b) {
    var h = +height,
        k = h / (b[1][1] - b[0][1]),
        x = -k * b[0][0],
        y = (h - k * (b[1][1] + b[0][1])) / 2;
    projection.scale(150 * k).translate([x, y]);
  }, object);
}

var maxDepth = 16,
    // maximum depth of subdivision
cosMinDistance = cos(30 * radians); // cos(minimum angular distance)

function resample (project, delta2) {
  return +delta2 ? resample$1(project, delta2) : resampleNone(project);
}

function resampleNone(project) {
  return transformer({
    point: function (x, y) {
      x = project(x, y);
      this.stream.point(x[0], x[1]);
    }
  });
}

function resample$1(project, delta2) {
  function resampleLineTo(x0, y0, lambda0, a0, b0, c0, x1, y1, lambda1, a1, b1, c1, depth, stream) {
    var dx = x1 - x0,
        dy = y1 - y0,
        d2 = dx * dx + dy * dy;

    if (d2 > 4 * delta2 && depth--) {
      var a = a0 + a1,
          b = b0 + b1,
          c = c0 + c1,
          m = sqrt(a * a + b * b + c * c),
          phi2 = asin(c /= m),
          lambda2 = abs(abs(c) - 1) < epsilon$1 || abs(lambda0 - lambda1) < epsilon$1 ? (lambda0 + lambda1) / 2 : atan2(b, a),
          p = project(lambda2, phi2),
          x2 = p[0],
          y2 = p[1],
          dx2 = x2 - x0,
          dy2 = y2 - y0,
          dz = dy * dx2 - dx * dy2;

      if (dz * dz / d2 > delta2 // perpendicular projected distance
      || abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 // midpoint close to an end
      || a0 * a1 + b0 * b1 + c0 * c1 < cosMinDistance) {
        // angular distance
        resampleLineTo(x0, y0, lambda0, a0, b0, c0, x2, y2, lambda2, a /= m, b /= m, c, depth, stream);
        stream.point(x2, y2);
        resampleLineTo(x2, y2, lambda2, a, b, c, x1, y1, lambda1, a1, b1, c1, depth, stream);
      }
    }
  }

  return function (stream) {
    var lambda00, x00, y00, a00, b00, c00, // first point
    lambda0, x0, y0, a0, b0, c0; // previous point

    var resampleStream = {
      point: point,
      lineStart: lineStart,
      lineEnd: lineEnd,
      polygonStart: function () {
        stream.polygonStart();
        resampleStream.lineStart = ringStart;
      },
      polygonEnd: function () {
        stream.polygonEnd();
        resampleStream.lineStart = lineStart;
      }
    };

    function point(x, y) {
      x = project(x, y);
      stream.point(x[0], x[1]);
    }

    function lineStart() {
      x0 = NaN;
      resampleStream.point = linePoint;
      stream.lineStart();
    }

    function linePoint(lambda, phi) {
      var c = cartesian([lambda, phi]),
          p = project(lambda, phi);
      resampleLineTo(x0, y0, lambda0, a0, b0, c0, x0 = p[0], y0 = p[1], lambda0 = lambda, a0 = c[0], b0 = c[1], c0 = c[2], maxDepth, stream);
      stream.point(x0, y0);
    }

    function lineEnd() {
      resampleStream.point = point;
      stream.lineEnd();
    }

    function ringStart() {
      lineStart();
      resampleStream.point = ringPoint;
      resampleStream.lineEnd = ringEnd;
    }

    function ringPoint(lambda, phi) {
      linePoint(lambda00 = lambda, phi), x00 = x0, y00 = y0, a00 = a0, b00 = b0, c00 = c0;
      resampleStream.point = linePoint;
    }

    function ringEnd() {
      resampleLineTo(x0, y0, lambda0, a0, b0, c0, x00, y00, lambda00, a00, b00, c00, maxDepth, stream);
      resampleStream.lineEnd = lineEnd;
      lineEnd();
    }

    return resampleStream;
  };
}

var transformRadians = transformer({
  point: function (x, y) {
    this.stream.point(x * radians, y * radians);
  }
});

function transformRotate(rotate) {
  return transformer({
    point: function (x, y) {
      var r = rotate(x, y);
      return this.stream.point(r[0], r[1]);
    }
  });
}

function scaleTranslate(k, dx, dy, sx, sy) {
  function transform(x, y) {
    x *= sx;
    y *= sy;
    return [dx + k * x, dy - k * y];
  }

  transform.invert = function (x, y) {
    return [(x - dx) / k * sx, (dy - y) / k * sy];
  };

  return transform;
}

function scaleTranslateRotate(k, dx, dy, sx, sy, alpha) {
  if (!alpha) return scaleTranslate(k, dx, dy, sx, sy);
  var cosAlpha = cos(alpha),
      sinAlpha = sin(alpha),
      a = cosAlpha * k,
      b = sinAlpha * k,
      ai = cosAlpha / k,
      bi = sinAlpha / k,
      ci = (sinAlpha * dy - cosAlpha * dx) / k,
      fi = (sinAlpha * dx + cosAlpha * dy) / k;

  function transform(x, y) {
    x *= sx;
    y *= sy;
    return [a * x - b * y + dx, dy - b * x - a * y];
  }

  transform.invert = function (x, y) {
    return [sx * (ai * x - bi * y + ci), sy * (fi - bi * x - ai * y)];
  };

  return transform;
}

function projection(project) {
  return projectionMutator(function () {
    return project;
  })();
}
function projectionMutator(projectAt) {
  var project,
      k = 150,
      // scale
  x = 480,
      y = 250,
      // translate
  lambda = 0,
      phi = 0,
      // center
  deltaLambda = 0,
      deltaPhi = 0,
      deltaGamma = 0,
      rotate,
      // pre-rotate
  alpha = 0,
      // post-rotate angle
  sx = 1,
      // reflectX
  sy = 1,
      // reflectX
  theta = null,
      preclip = clipAntimeridian,
      // pre-clip angle
  x0 = null,
      y0,
      x1,
      y1,
      postclip = identity$1,
      // post-clip extent
  delta2 = 0.5,
      // precision
  projectResample,
      projectTransform,
      projectRotateTransform,
      cache,
      cacheStream;

  function projection(point) {
    return projectRotateTransform(point[0] * radians, point[1] * radians);
  }

  function invert(point) {
    point = projectRotateTransform.invert(point[0], point[1]);
    return point && [point[0] * degrees, point[1] * degrees];
  }

  projection.stream = function (stream) {
    return cache && cacheStream === stream ? cache : cache = transformRadians(transformRotate(rotate)(preclip(projectResample(postclip(cacheStream = stream)))));
  };

  projection.preclip = function (_) {
    return arguments.length ? (preclip = _, theta = undefined, reset()) : preclip;
  };

  projection.postclip = function (_) {
    return arguments.length ? (postclip = _, x0 = y0 = x1 = y1 = null, reset()) : postclip;
  };

  projection.clipAngle = function (_) {
    return arguments.length ? (preclip = +_ ? clipCircle(theta = _ * radians) : (theta = null, clipAntimeridian), reset()) : theta * degrees;
  };

  projection.clipExtent = function (_) {
    return arguments.length ? (postclip = _ == null ? (x0 = y0 = x1 = y1 = null, identity$1) : clipRectangle(x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1]), reset()) : x0 == null ? null : [[x0, y0], [x1, y1]];
  };

  projection.scale = function (_) {
    return arguments.length ? (k = +_, recenter()) : k;
  };

  projection.translate = function (_) {
    return arguments.length ? (x = +_[0], y = +_[1], recenter()) : [x, y];
  };

  projection.center = function (_) {
    return arguments.length ? (lambda = _[0] % 360 * radians, phi = _[1] % 360 * radians, recenter()) : [lambda * degrees, phi * degrees];
  };

  projection.rotate = function (_) {
    return arguments.length ? (deltaLambda = _[0] % 360 * radians, deltaPhi = _[1] % 360 * radians, deltaGamma = _.length > 2 ? _[2] % 360 * radians : 0, recenter()) : [deltaLambda * degrees, deltaPhi * degrees, deltaGamma * degrees];
  };

  projection.angle = function (_) {
    return arguments.length ? (alpha = _ % 360 * radians, recenter()) : alpha * degrees;
  };

  projection.reflectX = function (_) {
    return arguments.length ? (sx = _ ? -1 : 1, recenter()) : sx < 0;
  };

  projection.reflectY = function (_) {
    return arguments.length ? (sy = _ ? -1 : 1, recenter()) : sy < 0;
  };

  projection.precision = function (_) {
    return arguments.length ? (projectResample = resample(projectTransform, delta2 = _ * _), reset()) : sqrt(delta2);
  };

  projection.fitExtent = function (extent, object) {
    return fitExtent(projection, extent, object);
  };

  projection.fitSize = function (size, object) {
    return fitSize(projection, size, object);
  };

  projection.fitWidth = function (width, object) {
    return fitWidth(projection, width, object);
  };

  projection.fitHeight = function (height, object) {
    return fitHeight(projection, height, object);
  };

  function recenter() {
    var center = scaleTranslateRotate(k, 0, 0, sx, sy, alpha).apply(null, project(lambda, phi)),
        transform = scaleTranslateRotate(k, x - center[0], y - center[1], sx, sy, alpha);
    rotate = rotateRadians(deltaLambda, deltaPhi, deltaGamma);
    projectTransform = compose(project, transform);
    projectRotateTransform = compose(rotate, projectTransform);
    projectResample = resample(projectTransform, delta2);
    return reset();
  }

  function reset() {
    cache = cacheStream = null;
    return projection;
  }

  return function () {
    project = projectAt.apply(this, arguments);
    projection.invert = project.invert && invert;
    return recenter();
  };
}

function mercatorRaw(lambda, phi) {
  return [lambda, log(tan((halfPi + phi) / 2))];
}

mercatorRaw.invert = function (x, y) {
  return [x, 2 * atan(exp(y)) - halfPi];
};

function geoMercator () {
  return mercatorProjection(mercatorRaw).scale(961 / tau$1);
}
function mercatorProjection(project) {
  var m = projection(project),
      center = m.center,
      scale = m.scale,
      translate = m.translate,
      clipExtent = m.clipExtent,
      x0 = null,
      y0,
      x1,
      y1; // clip extent

  m.scale = function (_) {
    return arguments.length ? (scale(_), reclip()) : scale();
  };

  m.translate = function (_) {
    return arguments.length ? (translate(_), reclip()) : translate();
  };

  m.center = function (_) {
    return arguments.length ? (center(_), reclip()) : center();
  };

  m.clipExtent = function (_) {
    return arguments.length ? (_ == null ? x0 = y0 = x1 = y1 = null : (x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1]), reclip()) : x0 == null ? null : [[x0, y0], [x1, y1]];
  };

  function reclip() {
    var k = pi * scale(),
        t = m(rotation(m.rotate()).invert([0, 0]));
    return clipExtent(x0 == null ? [[t[0] - k, t[1] - k], [t[0] + k, t[1] + k]] : project === mercatorRaw ? [[Math.max(t[0] - k, x0), y0], [Math.min(t[0] + k, x1), y1]] : [[x0, Math.max(t[1] - k, y0)], [x1, Math.min(t[1] + k, y1)]]);
  }

  return reclip();
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
function identity$2(x) {
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
function transformer$1() {
  var domain = unit,
      range = unit,
      interpolate$1 = interpolate,
      transform,
      untransform,
      unknown,
      clamp = identity$2,
      piecewise,
      output,
      input;

  function rescale() {
    var n = Math.min(domain.length, range.length);
    if (clamp !== identity$2) clamp = clamper(domain[0], domain[n - 1]);
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
    return arguments.length ? (clamp = _ ? true : identity$2, rescale()) : clamp !== identity$2;
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

function transformPow(exponent) {
  return function (x) {
    return x < 0 ? -Math.pow(-x, exponent) : Math.pow(x, exponent);
  };
}

function transformSqrt(x) {
  return x < 0 ? -Math.sqrt(-x) : Math.sqrt(x);
}

function transformSquare(x) {
  return x < 0 ? -x * x : x * x;
}

function powish(transform) {
  var scale = transform(identity$2, identity$2),
      exponent = 1;

  function rescale() {
    return exponent === 1 ? transform(identity$2, identity$2) : exponent === 0.5 ? transform(transformSqrt, transformSquare) : transform(transformPow(exponent), transformPow(1 / exponent));
  }

  scale.exponent = function (_) {
    return arguments.length ? (exponent = +_, rescale()) : exponent;
  };

  return linearish(scale);
}
function pow$1() {
  var scale = powish(transformer$1());

  scale.copy = function () {
    return copy(scale, pow$1()).exponent(scale.exponent());
  };

  initRange.apply(scale, arguments);
  return scale;
}
function sqrt$1() {
  return pow$1.apply(null, arguments).exponent(0.5);
}

/* src/components/Title.svelte generated by Svelte v3.31.2 */

function add_css() {
  var style = element("style");
  style.id = "svelte-1b7jqew-style";
  style.textContent = ".title-wrapper.svelte-1b7jqew{display:flex;flex-direction:column;align-items:center;width:100%;padding:0.3em 0.5em;color:#333333}h2.svelte-1b7jqew,h3.svelte-1b7jqew{margin:0.2em 0;white-space:nowrap}h2.svelte-1b7jqew{font-size:1.4em;font-weight:bold}h3.svelte-1b7jqew{font-size:1.2em;font-weight:normal}";
  append(document.head, style);
}

function create_fragment(ctx) {
  let div;
  let h2;
  let t0;
  let t1;
  let h3;
  let t2;
  return {
    c() {
      div = element("div");
      h2 = element("h2");
      t0 = text("Seroprevalence of SARS-CoV-2");
      t1 = space();
      h3 = element("h3");
      t2 = text("In the general population.");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      h2 = claim_element(div_nodes, "H2", {
        class: true
      });
      var h2_nodes = children(h2);
      t0 = claim_text(h2_nodes, "Seroprevalence of SARS-CoV-2");
      h2_nodes.forEach(detach);
      t1 = claim_space(div_nodes);
      h3 = claim_element(div_nodes, "H3", {
        class: true
      });
      var h3_nodes = children(h3);
      t2 = claim_text(h3_nodes, "In the general population.");
      h3_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h2, "class", "svelte-1b7jqew");
      attr(h3, "class", "svelte-1b7jqew");
      attr(div, "class", "title-wrapper svelte-1b7jqew");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, h2);
      append(h2, t0);
      append(div, t1);
      append(div, h3);
      append(h3, t2);
    },

    p: noop,
    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);
    }

  };
}

class Title extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1b7jqew-style")) add_css();
    init(this, options, null, create_fragment, safe_not_equal, {});
  }

}

const offsetFactor = 1;

const pathFromProjection = projection => geoPath().projection(projection);

const createGeoPath = (features, width, height) => {
  const mercatorUnitProjection = geoMercator().scale(1).translate([0, 0]);
  const unitPath = pathFromProjection(mercatorUnitProjection);
  if (!features || !width || !height) return unitPath;
  const allBounds = features.map(unitPath.bounds);
  const bounds = [[min(allBounds, d => d[0][0]), min(allBounds, d => d[0][1])], [max(allBounds, d => d[1][0]), max(allBounds, d => d[1][1])]];
  const scale = .95 / Math.max((bounds[1][0] - bounds[0][0]) / width, (bounds[1][1] - bounds[0][1]) / height / offsetFactor);
  const offset = [(width - scale * (bounds[1][0] + bounds[0][0])) / 2, (height / offsetFactor - scale * (bounds[1][1] + bounds[0][1])) / 2];
  return geoPath().projection(mercatorUnitProjection.translate(offset).scale(scale));
};

const cleanProvinceName = name => {
  return name.replace('Azarbaijan', 'Azarbayjan').replace('Ardebil', 'Ardabil').replace('Mahall', 'Mahaal').replace('Gilan', 'Gilan (Guilan)').replace('Hamadan', 'Hamedan').replace('Baluchestan', 'Baluchistan').replace('Kordestan', 'Kurdestan').replace('Buyer Ahmad', 'Boyer-Ahmad').replace('Esfahan', 'Isfahan');
};

const extractPrevalence = s => +s.substr(0, s.indexOf('%'));

const extractCI = s => {
  const tmp = s.match(/\((.*?)\)/);

  if (tmp) {
    return tmp[1].split('-').map(d => +d);
  }
};

const tidyData = data => {
  const splitData = data.map(d => ({
    name: d.city,
    general: {
      prevalence: extractPrevalence(d.general),
      ci: extractCI(d.general)
    },
    highRisk: {
      prevalence: extractPrevalence(d.highRisk),
      ci: extractCI(d.highRisk)
    }
  }));
  return splitData;
};

// export const circleColor = '#7807f0';
// export const circleColor = '#f04107';
const circleColor = '#CC505F';

const createDelaunay = points => {
  return Delaunay.from(points, d => d.pixels[0], d => d.pixels[1]);
};
const getDistance = (x1, y1, x2, y2) => {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
};

/* src/components/Legend.svelte generated by Svelte v3.31.2 */

function add_css$1() {
  var style = element("style");
  style.id = "svelte-1g5cjjr-style";
  style.textContent = ".legend.svelte-1g5cjjr{position:absolute;bottom:10%;left:4%;z-index:100;width:30%;height:40%;color:#333333;overflow:hidden;pointer-events:none}";
  append(document.head, style);
}

function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[7] = list[i];
  return child_ctx;
} // (30:6) {#each intervals as tick (tick)}


function create_each_block(key_1, ctx) {
  let g;
  let line;
  let line_y__value;
  let line_x__value;
  let line_y__value_1;
  let text_1;
  let t0_value =
  /*tick*/
  ctx[7] + "";
  let t0;
  let t1;
  let text_1_x_value;
  let text_1_y_value;
  let circle;
  let circle_r_value;
  let circle_stroke_width_value;
  let g_transform_value;
  return {
    key: key_1,
    first: null,

    c() {
      g = svg_element("g");
      line = svg_element("line");
      text_1 = svg_element("text");
      t0 = text(t0_value);
      t1 = text("%\n          ");
      circle = svg_element("circle");
      this.h();
    },

    l(nodes) {
      g = claim_element(nodes, "g", {
        class: true,
        transform: true
      }, 1);
      var g_nodes = children(g);
      line = claim_element(g_nodes, "line", {
        x1: true,
        y1: true,
        x2: true,
        y2: true,
        stroke: true,
        "stroke-dasharray": true
      }, 1);
      children(line).forEach(detach);
      text_1 = claim_element(g_nodes, "text", {
        x: true,
        y: true,
        fill: true,
        "font-size": true
      }, 1);
      var text_1_nodes = children(text_1);
      t0 = claim_text(text_1_nodes, t0_value);
      t1 = claim_text(text_1_nodes, "%\n          ");
      text_1_nodes.forEach(detach);
      circle = claim_element(g_nodes, "circle", {
        cx: true,
        cy: true,
        r: true,
        fill: true,
        stroke: true,
        "stroke-width": true,
        "stroke-opacity": true
      }, 1);
      children(circle).forEach(detach);
      g_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(line, "x1", "0");
      attr(line, "y1", line_y__value = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]));
      attr(line, "x2", line_x__value =
      /*dim*/
      ctx[1] / 10);
      attr(line, "y2", line_y__value_1 = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]));
      attr(line, "stroke", "#878787");
      attr(line, "stroke-dasharray", "2 2");
      attr(text_1, "x", text_1_x_value =
      /*dim*/
      ctx[1] / 10);
      attr(text_1, "y", text_1_y_value = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]));
      attr(text_1, "fill", "#444444");
      attr(text_1, "font-size", "1em");
      attr(circle, "cx", "0");
      attr(circle, "cy", "0");
      attr(circle, "r", circle_r_value =
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]));
      attr(circle, "fill", "none");
      attr(circle, "stroke", circleColor);
      attr(circle, "stroke-width", circle_stroke_width_value = Math.min(2,
      /*dim*/
      ctx[1] / 100));
      attr(circle, "stroke-opacity", "0.7");
      attr(g, "class", "circle");
      attr(g, "transform", g_transform_value = "translate(0 " + -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]) + ")");
      this.first = g;
    },

    m(target, anchor) {
      insert(target, g, anchor);
      append(g, line);
      append(g, text_1);
      append(text_1, t0);
      append(text_1, t1);
      append(g, circle);
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;

      if (dirty &
      /*scale*/
      1 && line_y__value !== (line_y__value = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]))) {
        attr(line, "y1", line_y__value);
      }

      if (dirty &
      /*dim*/
      2 && line_x__value !== (line_x__value =
      /*dim*/
      ctx[1] / 10)) {
        attr(line, "x2", line_x__value);
      }

      if (dirty &
      /*scale*/
      1 && line_y__value_1 !== (line_y__value_1 = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]))) {
        attr(line, "y2", line_y__value_1);
      }

      if (dirty &
      /*dim*/
      2 && text_1_x_value !== (text_1_x_value =
      /*dim*/
      ctx[1] / 10)) {
        attr(text_1, "x", text_1_x_value);
      }

      if (dirty &
      /*scale*/
      1 && text_1_y_value !== (text_1_y_value = -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]))) {
        attr(text_1, "y", text_1_y_value);
      }

      if (dirty &
      /*scale*/
      1 && circle_r_value !== (circle_r_value =
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]))) {
        attr(circle, "r", circle_r_value);
      }

      if (dirty &
      /*dim*/
      2 && circle_stroke_width_value !== (circle_stroke_width_value = Math.min(2,
      /*dim*/
      ctx[1] / 100))) {
        attr(circle, "stroke-width", circle_stroke_width_value);
      }

      if (dirty &
      /*scale*/
      1 && g_transform_value !== (g_transform_value = "translate(0 " + -
      /*scale*/
      ctx[0](
      /*tick*/
      ctx[7]) + ")")) {
        attr(g, "transform", g_transform_value);
      }
    },

    d(detaching) {
      if (detaching) detach(g);
    }

  };
}

function create_fragment$1(ctx) {
  let div;
  let svg;
  let g;
  let each_blocks = [];
  let each_1_lookup = new Map();
  let g_transform_value;
  let div_resize_listener;
  let each_value =
  /*intervals*/
  ctx[4];

  const get_key = ctx =>
  /*tick*/
  ctx[7];

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context(ctx, each_value, i);
    let key = get_key(child_ctx);
    each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
  }

  return {
    c() {
      div = element("div");
      svg = svg_element("svg");
      g = svg_element("g");

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      svg = claim_element(div_nodes, "svg", {
        width: true,
        height: true
      }, 1);
      var svg_nodes = children(svg);
      g = claim_element(svg_nodes, "g", {
        class: true,
        transform: true
      }, 1);
      var g_nodes = children(g);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(g_nodes);
      }

      g_nodes.forEach(detach);
      svg_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(g, "class", "circles");
      attr(g, "transform", g_transform_value = "translate(" + (
      /*scale*/
      ctx[0](Math.max(...
      /*intervals*/
      ctx[4])) +
      /*margin*/
      ctx[5].right) + " " + (
      /*height*/
      ctx[3] -
      /*margin*/
      ctx[5].bottom) + ")");
      attr(svg, "width",
      /*width*/
      ctx[2]);
      attr(svg, "height",
      /*height*/
      ctx[3]);
      attr(div, "class", "legend svelte-1g5cjjr");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[6].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, svg);
      append(svg, g);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(g, null);
      }

      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[6].bind(div));
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*scale, intervals, circleColor, Math, dim*/
      19) {
        each_value =
        /*intervals*/
        ctx[4];
        each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, g, destroy_block, create_each_block, null, get_each_context);
      }

      if (dirty &
      /*scale, height*/
      9 && g_transform_value !== (g_transform_value = "translate(" + (
      /*scale*/
      ctx[0](Math.max(...
      /*intervals*/
      ctx[4])) +
      /*margin*/
      ctx[5].right) + " " + (
      /*height*/
      ctx[3] -
      /*margin*/
      ctx[5].bottom) + ")")) {
        attr(g, "transform", g_transform_value);
      }

      if (dirty &
      /*width*/
      4) {
        attr(svg, "width",
        /*width*/
        ctx[2]);
      }

      if (dirty &
      /*height*/
      8) {
        attr(svg, "height",
        /*height*/
        ctx[3]);
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }

      div_resize_listener();
    }

  };
}

function instance($$self, $$props, $$invalidate) {
  let {
    scale
  } = $$props;
  let {
    dim
  } = $$props;
  let width = 0;
  let height = 0;
  const intervals = [10, 40, 70];
  const margin = {
    bottom: 10,
    right: 10
  };

  function div_elementresize_handler() {
    width = this.clientWidth;
    height = this.clientHeight;
    $$invalidate(2, width);
    $$invalidate(3, height);
  }

  $$self.$$set = $$props => {
    if ("scale" in $$props) $$invalidate(0, scale = $$props.scale);
    if ("dim" in $$props) $$invalidate(1, dim = $$props.dim);
  };

  return [scale, dim, width, height, intervals, margin, div_elementresize_handler];
}

class Legend extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1g5cjjr-style")) add_css$1();
    init(this, options, instance, create_fragment$1, safe_not_equal, {
      scale: 0,
      dim: 1
    });
  }

}

/* src/components/Country.svelte generated by Svelte v3.31.2 */

function create_fragment$2(ctx) {
  let g;
  let path;
  let path_d_value;
  return {
    c() {
      g = svg_element("g");
      path = svg_element("path");
      this.h();
    },

    l(nodes) {
      g = claim_element(nodes, "g", {
        class: true
      }, 1);
      var g_nodes = children(g);
      path = claim_element(g_nodes, "path", {
        d: true,
        fill: true,
        stroke: true,
        "stroke-width": true
      }, 1);
      children(path).forEach(detach);
      g_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(path, "d", path_d_value =
      /*geo*/
      ctx[0].path);
      attr(path, "fill", "none");
      attr(path, "stroke", "#878787");
      attr(path, "stroke-width", "1");
      attr(g, "class", "country");
    },

    m(target, anchor) {
      insert(target, g, anchor);
      append(g, path);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*geo*/
      1 && path_d_value !== (path_d_value =
      /*geo*/
      ctx[0].path)) {
        attr(path, "d", path_d_value);
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(g);
    }

  };
}

function instance$1($$self, $$props, $$invalidate) {
  let {
    geo
  } = $$props;

  $$self.$$set = $$props => {
    if ("geo" in $$props) $$invalidate(0, geo = $$props.geo);
  };

  return [geo];
}

class Country extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance$1, create_fragment$2, safe_not_equal, {
      geo: 0
    });
  }

}

/* src/components/Province.svelte generated by Svelte v3.31.2 */

function create_fragment$3(ctx) {
  let g;
  let path;
  let path_d_value;
  return {
    c() {
      g = svg_element("g");
      path = svg_element("path");
      this.h();
    },

    l(nodes) {
      g = claim_element(nodes, "g", {
        class: true
      }, 1);
      var g_nodes = children(g);
      path = claim_element(g_nodes, "path", {
        d: true,
        fill: true,
        stroke: true,
        "stroke-width": true
      }, 1);
      children(path).forEach(detach);
      g_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(path, "d", path_d_value =
      /*geo*/
      ctx[0].path);
      attr(path, "fill", "none");
      attr(path, "stroke", "#F0F0F0");
      attr(path, "stroke-width", "1");
      attr(g, "class", "province");
    },

    m(target, anchor) {
      insert(target, g, anchor);
      append(g, path);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*geo*/
      1 && path_d_value !== (path_d_value =
      /*geo*/
      ctx[0].path)) {
        attr(path, "d", path_d_value);
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(g);
    }

  };
}

function instance$2($$self, $$props, $$invalidate) {
  let {
    geo
  } = $$props;

  $$self.$$set = $$props => {
    if ("geo" in $$props) $$invalidate(0, geo = $$props.geo);
  };

  return [geo];
}

class Province extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance$2, create_fragment$3, safe_not_equal, {
      geo: 0
    });
  }

}

/* src/components/City.svelte generated by Svelte v3.31.2 */

function create_fragment$4(ctx) {
  let g;
  let circle;
  let circle_r_value;
  let circle_fill_opacity_value;
  let circle_stroke_width_value;
  let g_transform_value;
  return {
    c() {
      g = svg_element("g");
      circle = svg_element("circle");
      this.h();
    },

    l(nodes) {
      g = claim_element(nodes, "g", {
        class: true,
        transform: true
      }, 1);
      var g_nodes = children(g);
      circle = claim_element(g_nodes, "circle", {
        cx: true,
        cy: true,
        r: true,
        fill: true,
        "fill-opacity": true,
        stroke: true,
        "stroke-width": true,
        "stroke-opacity": true
      }, 1);
      children(circle).forEach(detach);
      g_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(circle, "cx", "0");
      attr(circle, "cy", "0");
      attr(circle, "r", circle_r_value =
      /*data*/
      ctx[1].r || 5);
      attr(circle, "fill",
      /*circleColor*/
      ctx[3]);
      attr(circle, "fill-opacity", circle_fill_opacity_value =
      /*isHovered*/
      ctx[4] ? 0.8 : 0.2);
      attr(circle, "stroke",
      /*circleColor*/
      ctx[3]);
      attr(circle, "stroke-width", circle_stroke_width_value = Math.min(2,
      /*dim*/
      ctx[2] / 100));
      attr(circle, "stroke-opacity", "0.9");
      attr(g, "class", "city");
      attr(g, "transform", g_transform_value = "translate(" +
      /*geo*/
      ctx[0].pixels[0] + " " +
      /*geo*/
      ctx[0].pixels[1] + ")");
    },

    m(target, anchor) {
      insert(target, g, anchor);
      append(g, circle);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*data*/
      2 && circle_r_value !== (circle_r_value =
      /*data*/
      ctx[1].r || 5)) {
        attr(circle, "r", circle_r_value);
      }

      if (dirty &
      /*circleColor*/
      8) {
        attr(circle, "fill",
        /*circleColor*/
        ctx[3]);
      }

      if (dirty &
      /*isHovered*/
      16 && circle_fill_opacity_value !== (circle_fill_opacity_value =
      /*isHovered*/
      ctx[4] ? 0.8 : 0.2)) {
        attr(circle, "fill-opacity", circle_fill_opacity_value);
      }

      if (dirty &
      /*circleColor*/
      8) {
        attr(circle, "stroke",
        /*circleColor*/
        ctx[3]);
      }

      if (dirty &
      /*dim*/
      4 && circle_stroke_width_value !== (circle_stroke_width_value = Math.min(2,
      /*dim*/
      ctx[2] / 100))) {
        attr(circle, "stroke-width", circle_stroke_width_value);
      }

      if (dirty &
      /*geo*/
      1 && g_transform_value !== (g_transform_value = "translate(" +
      /*geo*/
      ctx[0].pixels[0] + " " +
      /*geo*/
      ctx[0].pixels[1] + ")")) {
        attr(g, "transform", g_transform_value);
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(g);
    }

  };
}

function instance$3($$self, $$props, $$invalidate) {
  let {
    geo
  } = $$props;
  let {
    data
  } = $$props;
  let {
    dim = 0
  } = $$props;
  let {
    circleColor = "#000000"
  } = $$props;
  let {
    isHovered = false
  } = $$props;

  $$self.$$set = $$props => {
    if ("geo" in $$props) $$invalidate(0, geo = $$props.geo);
    if ("data" in $$props) $$invalidate(1, data = $$props.data);
    if ("dim" in $$props) $$invalidate(2, dim = $$props.dim);
    if ("circleColor" in $$props) $$invalidate(3, circleColor = $$props.circleColor);
    if ("isHovered" in $$props) $$invalidate(4, isHovered = $$props.isHovered);
  };

  return [geo, data, dim, circleColor, isHovered];
}

class City extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, instance$3, create_fragment$4, safe_not_equal, {
      geo: 0,
      data: 1,
      dim: 2,
      circleColor: 3,
      isHovered: 4
    });
  }

}

/* src/components/CityTooltip.svelte generated by Svelte v3.31.2 */

function add_css$2() {
  var style = element("style");
  style.id = "svelte-xvin9g-style";
  style.textContent = ".province-tooltip.svelte-xvin9g.svelte-xvin9g{position:absolute;z-index:100;width:32%;min-width:250px;background-color:#FFFFFF;box-shadow:0 1px 2px rgba(0,0,0,0.07), \n                0 2px 4px rgba(0,0,0,0.07), \n                0 4px 8px rgba(0,0,0,0.07), \n                0 8px 16px rgba(0,0,0,0.07),\n                0 16px 32px rgba(0,0,0,0.07), \n                0 32px 64px rgba(0,0,0,0.07)}.tooltip-content.svelte-xvin9g.svelte-xvin9g{width:100%;height:100%;padding:0.4em;color:#333333}.tooltip-title.svelte-xvin9g.svelte-xvin9g{display:flex;align-items:baseline;justify-content:space-between;border-bottom:0.15em solid #333333}.tooltip-h3.svelte-xvin9g.svelte-xvin9g{margin:0;font-size:1.3em;font-weight:normal}.seroprevalence.svelte-xvin9g.svelte-xvin9g{width:100%;margin:0.3em 0;font-size:1em}.tooltip-h4.svelte-xvin9g.svelte-xvin9g{margin:0 0 0.3em 0;font-size:1em;font-weight:normal}table.svelte-xvin9g.svelte-xvin9g{width:100%;font-size:0.9em;border-collapse:collapse}tr.svelte-xvin9g td.svelte-xvin9g{padding:0.1em 0.2em 0.1em 0}tr.svelte-xvin9g td.svelte-xvin9g:nth-child(2){font-weight:bold;vertical-align:top}.ci.svelte-xvin9g.svelte-xvin9g{margin:0 0 0 0.5em;font-size:0.8em;font-weight:normal}.explainer.svelte-xvin9g.svelte-xvin9g{margin:0.3em 0 0 0;font-size:0.7em;color:#AAAAAA}";
  append(document.head, style);
}

function create_fragment$5(ctx) {
  let div4;
  let div3;
  let div0;
  let h3;
  let t0_value =
  /*tooltip*/
  ctx[0].name + "";
  let t0;
  let t1;
  let div2;
  let h4;
  let t2;
  let t3;
  let table;
  let tbody;
  let tr0;
  let td0;
  let t4;
  let t5;
  let td1;
  let t6_value =
  /*f*/
  ctx[6](
  /*tooltip*/
  ctx[0].data.general.prevalence) + "";
  let t6;
  let t7;
  let span0;
  let t8;
  let t9_value =
  /*tooltip*/
  ctx[0].data.general.ci.map(func).join(" - ") + "";
  let t9;
  let t10;
  let t11;
  let tr1;
  let td2;
  let t12;
  let t13;
  let td3;
  let t14_value =
  /*f*/
  ctx[6](
  /*tooltip*/
  ctx[0].data.highRisk.prevalence) + "";
  let t14;
  let t15;
  let span1;
  let t16;
  let t17_value =
  /*tooltip*/
  ctx[0].data.highRisk.ci.map(func_1).join(" - ") + "";
  let t17;
  let t18;
  let t19;
  let div1;
  let p;
  let t20;
  let div4_resize_listener;
  return {
    c() {
      div4 = element("div");
      div3 = element("div");
      div0 = element("div");
      h3 = element("h3");
      t0 = text(t0_value);
      t1 = space();
      div2 = element("div");
      h4 = element("h4");
      t2 = text("Seroprevalence in population");
      t3 = space();
      table = element("table");
      tbody = element("tbody");
      tr0 = element("tr");
      td0 = element("td");
      t4 = text("General:");
      t5 = space();
      td1 = element("td");
      t6 = text(t6_value);
      t7 = text("%");
      span0 = element("span");
      t8 = text("(");
      t9 = text(t9_value);
      t10 = text(")");
      t11 = space();
      tr1 = element("tr");
      td2 = element("td");
      t12 = text("High-risk:");
      t13 = space();
      td3 = element("td");
      t14 = text(t14_value);
      t15 = text("%");
      span1 = element("span");
      t16 = text("(");
      t17 = text(t17_value);
      t18 = text(")");
      t19 = space();
      div1 = element("div");
      p = element("p");
      t20 = text("Values in brackets denote the 95% confidence interval. Individuals of the high-risk population are likely to have contacts with SARS-CoV-2-infected individuals through their occupation.");
      this.h();
    },

    l(nodes) {
      div4 = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div4_nodes = children(div4);
      div3 = claim_element(div4_nodes, "DIV", {
        class: true
      });
      var div3_nodes = children(div3);
      div0 = claim_element(div3_nodes, "DIV", {
        class: true,
        style: true
      });
      var div0_nodes = children(div0);
      h3 = claim_element(div0_nodes, "H3", {
        class: true
      });
      var h3_nodes = children(h3);
      t0 = claim_text(h3_nodes, t0_value);
      h3_nodes.forEach(detach);
      div0_nodes.forEach(detach);
      t1 = claim_space(div3_nodes);
      div2 = claim_element(div3_nodes, "DIV", {
        class: true
      });
      var div2_nodes = children(div2);
      h4 = claim_element(div2_nodes, "H4", {
        class: true
      });
      var h4_nodes = children(h4);
      t2 = claim_text(h4_nodes, "Seroprevalence in population");
      h4_nodes.forEach(detach);
      t3 = claim_space(div2_nodes);
      table = claim_element(div2_nodes, "TABLE", {
        class: true
      });
      var table_nodes = children(table);
      tbody = claim_element(table_nodes, "TBODY", {});
      var tbody_nodes = children(tbody);
      tr0 = claim_element(tbody_nodes, "TR", {
        class: true
      });
      var tr0_nodes = children(tr0);
      td0 = claim_element(tr0_nodes, "TD", {
        class: true
      });
      var td0_nodes = children(td0);
      t4 = claim_text(td0_nodes, "General:");
      td0_nodes.forEach(detach);
      t5 = claim_space(tr0_nodes);
      td1 = claim_element(tr0_nodes, "TD", {
        class: true
      });
      var td1_nodes = children(td1);
      t6 = claim_text(td1_nodes, t6_value);
      t7 = claim_text(td1_nodes, "%");
      span0 = claim_element(td1_nodes, "SPAN", {
        class: true
      });
      var span0_nodes = children(span0);
      t8 = claim_text(span0_nodes, "(");
      t9 = claim_text(span0_nodes, t9_value);
      t10 = claim_text(span0_nodes, ")");
      span0_nodes.forEach(detach);
      td1_nodes.forEach(detach);
      tr0_nodes.forEach(detach);
      t11 = claim_space(tbody_nodes);
      tr1 = claim_element(tbody_nodes, "TR", {
        class: true
      });
      var tr1_nodes = children(tr1);
      td2 = claim_element(tr1_nodes, "TD", {
        class: true
      });
      var td2_nodes = children(td2);
      t12 = claim_text(td2_nodes, "High-risk:");
      td2_nodes.forEach(detach);
      t13 = claim_space(tr1_nodes);
      td3 = claim_element(tr1_nodes, "TD", {
        class: true
      });
      var td3_nodes = children(td3);
      t14 = claim_text(td3_nodes, t14_value);
      t15 = claim_text(td3_nodes, "%");
      span1 = claim_element(td3_nodes, "SPAN", {
        class: true
      });
      var span1_nodes = children(span1);
      t16 = claim_text(span1_nodes, "(");
      t17 = claim_text(span1_nodes, t17_value);
      t18 = claim_text(span1_nodes, ")");
      span1_nodes.forEach(detach);
      td3_nodes.forEach(detach);
      tr1_nodes.forEach(detach);
      tbody_nodes.forEach(detach);
      table_nodes.forEach(detach);
      t19 = claim_space(div2_nodes);
      div1 = claim_element(div2_nodes, "DIV", {
        class: true
      });
      var div1_nodes = children(div1);
      p = claim_element(div1_nodes, "P", {});
      var p_nodes = children(p);
      t20 = claim_text(p_nodes, "Values in brackets denote the 95% confidence interval. Individuals of the high-risk population are likely to have contacts with SARS-CoV-2-infected individuals through their occupation.");
      p_nodes.forEach(detach);
      div1_nodes.forEach(detach);
      div2_nodes.forEach(detach);
      div3_nodes.forEach(detach);
      div4_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h3, "class", "tooltip-h3 svelte-xvin9g");
      attr(div0, "class", "tooltip-title svelte-xvin9g");
      set_style(div0, "border-color", circleColor);
      attr(h4, "class", "tooltip-h4 svelte-xvin9g");
      attr(td0, "class", "svelte-xvin9g");
      attr(span0, "class", "ci svelte-xvin9g");
      attr(td1, "class", "svelte-xvin9g");
      attr(tr0, "class", "svelte-xvin9g");
      attr(td2, "class", "svelte-xvin9g");
      attr(span1, "class", "ci svelte-xvin9g");
      attr(td3, "class", "svelte-xvin9g");
      attr(tr1, "class", "svelte-xvin9g");
      attr(table, "class", "svelte-xvin9g");
      attr(div1, "class", "explainer svelte-xvin9g");
      attr(div2, "class", "seroprevalence svelte-xvin9g");
      attr(div3, "class", "tooltip-content svelte-xvin9g");
      attr(div4, "class", "province-tooltip svelte-xvin9g");
      set_style(div4, "left",
      /*leftPos*/
      ctx[4] + "px");
      set_style(div4, "top",
      /*topPos*/
      ctx[5] + "px");
      set_style(div4, "max-width",
      /*parentWidth*/
      ctx[1] -
      /*margin*/
      ctx[7].left -
      /*margin*/
      ctx[7].right + "px");
      add_render_callback(() =>
      /*div4_elementresize_handler*/
      ctx[9].call(div4));
    },

    m(target, anchor) {
      insert(target, div4, anchor);
      append(div4, div3);
      append(div3, div0);
      append(div0, h3);
      append(h3, t0);
      append(div3, t1);
      append(div3, div2);
      append(div2, h4);
      append(h4, t2);
      append(div2, t3);
      append(div2, table);
      append(table, tbody);
      append(tbody, tr0);
      append(tr0, td0);
      append(td0, t4);
      append(tr0, t5);
      append(tr0, td1);
      append(td1, t6);
      append(td1, t7);
      append(td1, span0);
      append(span0, t8);
      append(span0, t9);
      append(span0, t10);
      append(tbody, t11);
      append(tbody, tr1);
      append(tr1, td2);
      append(td2, t12);
      append(tr1, t13);
      append(tr1, td3);
      append(td3, t14);
      append(td3, t15);
      append(td3, span1);
      append(span1, t16);
      append(span1, t17);
      append(span1, t18);
      append(div2, t19);
      append(div2, div1);
      append(div1, p);
      append(p, t20);
      div4_resize_listener = add_resize_listener(div4,
      /*div4_elementresize_handler*/
      ctx[9].bind(div4));
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*tooltip*/
      1 && t0_value !== (t0_value =
      /*tooltip*/
      ctx[0].name + "")) set_data(t0, t0_value);
      if (dirty &
      /*tooltip*/
      1 && t6_value !== (t6_value =
      /*f*/
      ctx[6](
      /*tooltip*/
      ctx[0].data.general.prevalence) + "")) set_data(t6, t6_value);
      if (dirty &
      /*tooltip*/
      1 && t9_value !== (t9_value =
      /*tooltip*/
      ctx[0].data.general.ci.map(func).join(" - ") + "")) set_data(t9, t9_value);
      if (dirty &
      /*tooltip*/
      1 && t14_value !== (t14_value =
      /*f*/
      ctx[6](
      /*tooltip*/
      ctx[0].data.highRisk.prevalence) + "")) set_data(t14, t14_value);
      if (dirty &
      /*tooltip*/
      1 && t17_value !== (t17_value =
      /*tooltip*/
      ctx[0].data.highRisk.ci.map(func_1).join(" - ") + "")) set_data(t17, t17_value);

      if (dirty &
      /*leftPos*/
      16) {
        set_style(div4, "left",
        /*leftPos*/
        ctx[4] + "px");
      }

      if (dirty &
      /*topPos*/
      32) {
        set_style(div4, "top",
        /*topPos*/
        ctx[5] + "px");
      }

      if (dirty &
      /*parentWidth*/
      2) {
        set_style(div4, "max-width",
        /*parentWidth*/
        ctx[1] -
        /*margin*/
        ctx[7].left -
        /*margin*/
        ctx[7].right + "px");
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div4);
      div4_resize_listener();
    }

  };
}

const yOffset = 15;

const func = d => `${d}%`;

const func_1 = d => `${d}%`;

function instance$4($$self, $$props, $$invalidate) {
  let leftPos;
  let topPos;
  let {
    tooltip
  } = $$props;
  let {
    parentWidth = 0
  } = $$props;
  let {
    parentHeight = 0
  } = $$props;
  const f = format(",");
  let width = 0;
  let height = 0;
  const margin = {
    top: 2,
    right: 2,
    bottom: 2,
    left: 2
  };

  function div4_elementresize_handler() {
    width = this.clientWidth;
    height = this.clientHeight;
    $$invalidate(2, width);
    $$invalidate(3, height);
  }

  $$self.$$set = $$props => {
    if ("tooltip" in $$props) $$invalidate(0, tooltip = $$props.tooltip);
    if ("parentWidth" in $$props) $$invalidate(1, parentWidth = $$props.parentWidth);
    if ("parentHeight" in $$props) $$invalidate(8, parentHeight = $$props.parentHeight);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*parentWidth, width, tooltip*/
    7) {
       $$invalidate(4, leftPos = Math.min(parentWidth - width - margin.right, Math.max(margin.left, tooltip.pos[0] - width / 2)));
    }

    if ($$self.$$.dirty &
    /*tooltip, parentHeight, height*/
    265) {
       $$invalidate(5, topPos = tooltip.pos[1] + (parentHeight / 2 < tooltip.pos[1] ? -height - yOffset / 2 : yOffset));
    }
  };

  return [tooltip, parentWidth, width, height, leftPos, topPos, f, margin, parentHeight, div4_elementresize_handler];
}

class CityTooltip extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-xvin9g-style")) add_css$2();
    init(this, options, instance$4, create_fragment$5, safe_not_equal, {
      tooltip: 0,
      parentWidth: 1,
      parentHeight: 8
    });
  }

}

/* src/components/Map.svelte generated by Svelte v3.31.2 */
const {
  Map: Map_1
} = globals;

function add_css$3() {
  var style = element("style");
  style.id = "svelte-116ieo8-style";
  style.textContent = ".map-wrapper.svelte-116ieo8{position:relative;flex:1;display:flex;justify-content:center;width:100%;overflow:hidden;cursor:pointer}";
  append(document.head, style);
}

function get_each_context$1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[21] = list[i];
  return child_ctx;
}

function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[24] = list[i];
  return child_ctx;
} // (97:2) {#if (width > 0)}


function create_if_block_1(ctx) {
  let legend;
  let t;
  let svg;
  let each_blocks_1 = [];
  let each0_lookup = new Map_1();
  let each0_anchor;
  let country;
  let each_blocks = [];
  let each1_lookup = new Map_1();
  let current;
  let mounted;
  let dispose;
  legend = new Legend({
    props: {
      scale:
      /*radiusScale*/
      ctx[1],
      dim:
      /*dim*/
      ctx[9]
    }
  });
  let each_value_1 =
  /*provincesGeo*/
  ctx[7];

  const get_key = ctx =>
  /*provinceGeo*/
  ctx[24].id;

  for (let i = 0; i < each_value_1.length; i += 1) {
    let child_ctx = get_each_context_1(ctx, each_value_1, i);
    let key = get_key(child_ctx);
    each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
  }

  country = new Country({
    props: {
      geo:
      /*countryGeo*/
      ctx[6]
    }
  });
  let each_value =
  /*citiesCoords*/
  ctx[4];

  const get_key_1 = ctx =>
  /*cityCoords*/
  ctx[21].id;

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context$1(ctx, each_value, i);
    let key = get_key_1(child_ctx);
    each1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
  }

  return {
    c() {
      create_component(legend.$$.fragment);
      t = space();
      svg = svg_element("svg");

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].c();
      }

      each0_anchor = empty();
      create_component(country.$$.fragment);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      this.h();
    },

    l(nodes) {
      claim_component(legend.$$.fragment, nodes);
      t = claim_space(nodes);
      svg = claim_element(nodes, "svg", {
        width: true,
        height: true
      }, 1);
      var svg_nodes = children(svg);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].l(svg_nodes);
      }

      each0_anchor = empty();
      claim_component(country.$$.fragment, svg_nodes);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(svg_nodes);
      }

      svg_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(svg, "width",
      /*width*/
      ctx[3]);
      attr(svg, "height",
      /*height*/
      ctx[5]);
    },

    m(target, anchor) {
      mount_component(legend, target, anchor);
      insert(target, t, anchor);
      insert(target, svg, anchor);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].m(svg, null);
      }

      append(svg, each0_anchor);
      mount_component(country, svg, null);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(svg, null);
      }

      current = true;

      if (!mounted) {
        dispose = [listen(svg, "mousemove",
        /*handleMouseMove*/
        ctx[11]), listen(svg, "mouseleave",
        /*handleMouseLeave*/
        ctx[10])];
        mounted = true;
      }
    },

    p(ctx, dirty) {
      const legend_changes = {};
      if (dirty &
      /*radiusScale*/
      2) legend_changes.scale =
      /*radiusScale*/
      ctx[1];
      if (dirty &
      /*dim*/
      512) legend_changes.dim =
      /*dim*/
      ctx[9];
      legend.$set(legend_changes);

      if (dirty &
      /*provincesGeo*/
      128) {
        each_value_1 =
        /*provincesGeo*/
        ctx[7];
        group_outros();
        each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx, each_value_1, each0_lookup, svg, outro_and_destroy_block, create_each_block_1, each0_anchor, get_each_context_1);
        check_outros();
      }

      const country_changes = {};
      if (dirty &
      /*countryGeo*/
      64) country_changes.geo =
      /*countryGeo*/
      ctx[6];
      country.$set(country_changes);

      if (dirty &
      /*citiesCoords, data, dim, circleColor, cityTooltip*/
      785) {
        each_value =
        /*citiesCoords*/
        ctx[4];
        group_outros();
        each_blocks = update_keyed_each(each_blocks, dirty, get_key_1, 1, ctx, each_value, each1_lookup, svg, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
        check_outros();
      }

      if (!current || dirty &
      /*width*/
      8) {
        attr(svg, "width",
        /*width*/
        ctx[3]);
      }

      if (!current || dirty &
      /*height*/
      32) {
        attr(svg, "height",
        /*height*/
        ctx[5]);
      }
    },

    i(local) {
      if (current) return;
      transition_in(legend.$$.fragment, local);

      for (let i = 0; i < each_value_1.length; i += 1) {
        transition_in(each_blocks_1[i]);
      }

      transition_in(country.$$.fragment, local);

      for (let i = 0; i < each_value.length; i += 1) {
        transition_in(each_blocks[i]);
      }

      current = true;
    },

    o(local) {
      transition_out(legend.$$.fragment, local);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        transition_out(each_blocks_1[i]);
      }

      transition_out(country.$$.fragment, local);

      for (let i = 0; i < each_blocks.length; i += 1) {
        transition_out(each_blocks[i]);
      }

      current = false;
    },

    d(detaching) {
      destroy_component(legend, detaching);
      if (detaching) detach(t);
      if (detaching) detach(svg);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].d();
      }

      destroy_component(country);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }

      mounted = false;
      run_all(dispose);
    }

  };
} // (108:6) {#each provincesGeo as provinceGeo (provinceGeo.id)}


function create_each_block_1(key_1, ctx) {
  let first;
  let province;
  let current;
  province = new Province({
    props: {
      geo:
      /*provinceGeo*/
      ctx[24]
    }
  });
  return {
    key: key_1,
    first: null,

    c() {
      first = empty();
      create_component(province.$$.fragment);
      this.h();
    },

    l(nodes) {
      first = empty();
      claim_component(province.$$.fragment, nodes);
      this.h();
    },

    h() {
      this.first = first;
    },

    m(target, anchor) {
      insert(target, first, anchor);
      mount_component(province, target, anchor);
      current = true;
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;
      const province_changes = {};
      if (dirty &
      /*provincesGeo*/
      128) province_changes.geo =
      /*provinceGeo*/
      ctx[24];
      province.$set(province_changes);
    },

    i(local) {
      if (current) return;
      transition_in(province.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(province.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      if (detaching) detach(first);
      destroy_component(province, detaching);
    }

  };
} // (114:6) {#each citiesCoords as cityCoords (cityCoords.id)}


function create_each_block$1(key_1, ctx) {
  let first;
  let city;
  let current;

  function func(...args) {
    return (
      /*func*/
      ctx[17](
      /*cityCoords*/
      ctx[21], ...args)
    );
  }

  city = new City({
    props: {
      geo:
      /*cityCoords*/
      ctx[21],
      data:
      /*data*/
      ctx[0].find(func),
      dim:
      /*dim*/
      ctx[9],
      circleColor,
      isHovered:
      /*cityTooltip*/
      ctx[8] &&
      /*cityTooltip*/
      ctx[8].name ===
      /*cityCoords*/
      ctx[21].name
    }
  });
  return {
    key: key_1,
    first: null,

    c() {
      first = empty();
      create_component(city.$$.fragment);
      this.h();
    },

    l(nodes) {
      first = empty();
      claim_component(city.$$.fragment, nodes);
      this.h();
    },

    h() {
      this.first = first;
    },

    m(target, anchor) {
      insert(target, first, anchor);
      mount_component(city, target, anchor);
      current = true;
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;
      const city_changes = {};
      if (dirty &
      /*citiesCoords*/
      16) city_changes.geo =
      /*cityCoords*/
      ctx[21];
      if (dirty &
      /*data, citiesCoords*/
      17) city_changes.data =
      /*data*/
      ctx[0].find(func);
      if (dirty &
      /*dim*/
      512) city_changes.dim =
      /*dim*/
      ctx[9];
      if (dirty &
      /*cityTooltip, citiesCoords*/
      272) city_changes.isHovered =
      /*cityTooltip*/
      ctx[8] &&
      /*cityTooltip*/
      ctx[8].name ===
      /*cityCoords*/
      ctx[21].name;
      city.$set(city_changes);
    },

    i(local) {
      if (current) return;
      transition_in(city.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(city.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      if (detaching) detach(first);
      destroy_component(city, detaching);
    }

  };
} // (125:2) {#if (cityTooltip)}


function create_if_block(ctx) {
  let citytooltip;
  let current;
  citytooltip = new CityTooltip({
    props: {
      tooltip:
      /*cityTooltip*/
      ctx[8],
      parentWidth:
      /*width*/
      ctx[3],
      parentHeight:
      /*height*/
      ctx[5]
    }
  });
  return {
    c() {
      create_component(citytooltip.$$.fragment);
    },

    l(nodes) {
      claim_component(citytooltip.$$.fragment, nodes);
    },

    m(target, anchor) {
      mount_component(citytooltip, target, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const citytooltip_changes = {};
      if (dirty &
      /*cityTooltip*/
      256) citytooltip_changes.tooltip =
      /*cityTooltip*/
      ctx[8];
      if (dirty &
      /*width*/
      8) citytooltip_changes.parentWidth =
      /*width*/
      ctx[3];
      if (dirty &
      /*height*/
      32) citytooltip_changes.parentHeight =
      /*height*/
      ctx[5];
      citytooltip.$set(citytooltip_changes);
    },

    i(local) {
      if (current) return;
      transition_in(citytooltip.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(citytooltip.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      destroy_component(citytooltip, detaching);
    }

  };
}

function create_fragment$6(ctx) {
  let div;
  let t;
  let div_resize_listener;
  let current;
  let if_block0 =
  /*width*/
  ctx[3] > 0 && create_if_block_1(ctx);
  let if_block1 =
  /*cityTooltip*/
  ctx[8] && create_if_block(ctx);
  return {
    c() {
      div = element("div");
      if (if_block0) if_block0.c();
      t = space();
      if (if_block1) if_block1.c();
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      if (if_block0) if_block0.l(div_nodes);
      t = claim_space(div_nodes);
      if (if_block1) if_block1.l(div_nodes);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "map-wrapper svelte-116ieo8");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[18].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block0) if_block0.m(div, null);
      append(div, t);
      if (if_block1) if_block1.m(div, null);
      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[18].bind(div));
      /*div_binding*/

      ctx[19](div);
      current = true;
    },

    p(ctx, [dirty]) {
      if (
      /*width*/
      ctx[3] > 0) {
        if (if_block0) {
          if_block0.p(ctx, dirty);

          if (dirty &
          /*width*/
          8) {
            transition_in(if_block0, 1);
          }
        } else {
          if_block0 = create_if_block_1(ctx);
          if_block0.c();
          transition_in(if_block0, 1);
          if_block0.m(div, t);
        }
      } else if (if_block0) {
        group_outros();
        transition_out(if_block0, 1, 1, () => {
          if_block0 = null;
        });
        check_outros();
      }

      if (
      /*cityTooltip*/
      ctx[8]) {
        if (if_block1) {
          if_block1.p(ctx, dirty);

          if (dirty &
          /*cityTooltip*/
          256) {
            transition_in(if_block1, 1);
          }
        } else {
          if_block1 = create_if_block(ctx);
          if_block1.c();
          transition_in(if_block1, 1);
          if_block1.m(div, null);
        }
      } else if (if_block1) {
        group_outros();
        transition_out(if_block1, 1, 1, () => {
          if_block1 = null;
        });
        check_outros();
      }
    },

    i(local) {
      if (current) return;
      transition_in(if_block0);
      transition_in(if_block1);
      current = true;
    },

    o(local) {
      transition_out(if_block0);
      transition_out(if_block1);
      current = false;
    },

    d(detaching) {
      if (detaching) detach(div);
      if (if_block0) if_block0.d();
      if (if_block1) if_block1.d();
      div_resize_listener();
      /*div_binding*/

      ctx[19](null);
    }

  };
}

function instance$5($$self, $$props, $$invalidate) {
  let height;
  let dim;
  let {
    featuresCountry
  } = $$props;
  let {
    featuresProvinces
  } = $$props;
  let {
    cities
  } = $$props;
  let {
    data
  } = $$props;
  let {
    radiusScale
  } = $$props;
  let {
    maxHeight = 580
  } = $$props;
  let wrapper;
  let width = 0;
  let geoPath, countryGeo, provincesGeo, citiesCoords;
  let delaunay;
  let cityTooltip = null;

  function handleMouseLeave() {
    $$invalidate(8, cityTooltip = null);
  }

  function handleMouseMove(e) {
    if (!delaunay || !citiesCoords) return;
    const {
      layerX: x,
      layerY: y
    } = e;
    const id = delaunay.find(x, y);
    const hoveredCity = citiesCoords.find(d => d.id === id);
    const distance = getDistance(x, y, hoveredCity.pixels[0], hoveredCity.pixels[1]);

    if (distance > dim / 10) {
      $$invalidate(8, cityTooltip = null);
      return;
    }

    if (cityTooltip && cityTooltip.name === hoveredCity.name) {
      $$invalidate(8, cityTooltip = { ...cityTooltip,
        pos: [x, y]
      });
    } else {
      $$invalidate(8, cityTooltip = {
        data: data.find(d => d.name === hoveredCity.name),
        name: hoveredCity.name,
        pos: [x, y]
      });
    }
  }

  const func = (cityCoords, d) => d.name === cityCoords.name;

  function div_elementresize_handler() {
    width = this.clientWidth;
    $$invalidate(3, width);
  }

  function div_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      wrapper = $$value;
      $$invalidate(2, wrapper);
    });
  }

  $$self.$$set = $$props => {
    if ("featuresCountry" in $$props) $$invalidate(12, featuresCountry = $$props.featuresCountry);
    if ("featuresProvinces" in $$props) $$invalidate(13, featuresProvinces = $$props.featuresProvinces);
    if ("cities" in $$props) $$invalidate(14, cities = $$props.cities);
    if ("data" in $$props) $$invalidate(0, data = $$props.data);
    if ("radiusScale" in $$props) $$invalidate(1, radiusScale = $$props.radiusScale);
    if ("maxHeight" in $$props) $$invalidate(15, maxHeight = $$props.maxHeight);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*maxHeight, width*/
    32776) {
       $$invalidate(5, height = Math.min(maxHeight, width));
    }

    if ($$self.$$.dirty &
    /*width, height*/
    40) {
       $$invalidate(9, dim = Math.min(width, height));
    }

    if ($$self.$$.dirty &
    /*wrapper, featuresProvinces, width, height, featuresCountry, geoPath, cities, citiesCoords*/
    94268) {
       if (wrapper) {
        $$invalidate(16, geoPath = createGeoPath(featuresProvinces, width, height));
        $$invalidate(6, countryGeo = featuresCountry.map(d => ({
          path: geoPath(d)
        }))[0]);
        $$invalidate(7, provincesGeo = featuresProvinces.map((d, i) => ({
          id: i,
          nameEn: cleanProvinceName(d.properties.name),
          nameAr: d.properties.name_ar,
          path: geoPath(d),
          feature: d
        })));
        const projection = geoPath.projection();
        $$invalidate(4, citiesCoords = cities.map((d, i) => ({
          id: i,
          name: d.name,
          coords: d.coords,
          pixels: projection([d.coords[1], d.coords[0]])
        })));

        if (citiesCoords) {
          delaunay = createDelaunay(citiesCoords);
        }
      }
    }
  };

  return [data, radiusScale, wrapper, width, citiesCoords, height, countryGeo, provincesGeo, cityTooltip, dim, handleMouseLeave, handleMouseMove, featuresCountry, featuresProvinces, cities, maxHeight, geoPath, func, div_elementresize_handler, div_binding];
}

class Map$1 extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-116ieo8-style")) add_css$3();
    init(this, options, instance$5, create_fragment$6, safe_not_equal, {
      featuresCountry: 12,
      featuresProvinces: 13,
      cities: 14,
      data: 0,
      radiusScale: 1,
      maxHeight: 15
    });
  }

}

/* src/components/CountrySummary.svelte generated by Svelte v3.31.2 */

function add_css$4() {
  var style = element("style");
  style.id = "svelte-1f9le39-style";
  style.textContent = ".country-summary.svelte-1f9le39{display:flex;flex-direction:column;align-items:center;width:100%;padding:0 0.4em}h3.svelte-1f9le39{font-size:1.2em;font-weight:normal}p.svelte-1f9le39{font-size:1.2em;color:#444444}.explainer.svelte-1f9le39{font-size:0.9em}.ci.svelte-1f9le39{font-size:0.9em}";
  append(document.head, style);
}

function create_fragment$7(ctx) {
  let div;
  let h3;
  let t0;
  let t1;
  let p0;
  let t2;
  let strong0;
  let t3_value =
  /*data*/
  ctx[0].general.prevalence + "";
  let t3;
  let t4;
  let t5;
  let span0;
  let t6;
  let t7_value =
  /*data*/
  ctx[0].general.ci.map(func$1).join(" - ") + "";
  let t7;
  let t8;
  let t9;
  let strong1;
  let t10_value =
  /*data*/
  ctx[0].highRisk.prevalence + "";
  let t10;
  let t11;
  let t12;
  let span1;
  let t13;
  let t14_value =
  /*data*/
  ctx[0].highRisk.ci.map(func_1$1).join(" - ") + "";
  let t14;
  let t15;
  let t16;
  let p1;
  let t17;
  return {
    c() {
      div = element("div");
      h3 = element("h3");
      t0 = text("Total population of Iran");
      t1 = space();
      p0 = element("p");
      t2 = text("General: ");
      strong0 = element("strong");
      t3 = text(t3_value);
      t4 = text("%");
      t5 = space();
      span0 = element("span");
      t6 = text("(");
      t7 = text(t7_value);
      t8 = text(")");
      t9 = text(" | High-risk: ");
      strong1 = element("strong");
      t10 = text(t10_value);
      t11 = text("%");
      t12 = space();
      span1 = element("span");
      t13 = text("(");
      t14 = text(t14_value);
      t15 = text(")");
      t16 = space();
      p1 = element("p");
      t17 = text("Values in brackets denote the 95% confidence interval.");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      h3 = claim_element(div_nodes, "H3", {
        class: true
      });
      var h3_nodes = children(h3);
      t0 = claim_text(h3_nodes, "Total population of Iran");
      h3_nodes.forEach(detach);
      t1 = claim_space(div_nodes);
      p0 = claim_element(div_nodes, "P", {
        class: true
      });
      var p0_nodes = children(p0);
      t2 = claim_text(p0_nodes, "General: ");
      strong0 = claim_element(p0_nodes, "STRONG", {});
      var strong0_nodes = children(strong0);
      t3 = claim_text(strong0_nodes, t3_value);
      t4 = claim_text(strong0_nodes, "%");
      strong0_nodes.forEach(detach);
      t5 = claim_space(p0_nodes);
      span0 = claim_element(p0_nodes, "SPAN", {
        class: true
      });
      var span0_nodes = children(span0);
      t6 = claim_text(span0_nodes, "(");
      t7 = claim_text(span0_nodes, t7_value);
      t8 = claim_text(span0_nodes, ")");
      span0_nodes.forEach(detach);
      t9 = claim_text(p0_nodes, " | High-risk: ");
      strong1 = claim_element(p0_nodes, "STRONG", {});
      var strong1_nodes = children(strong1);
      t10 = claim_text(strong1_nodes, t10_value);
      t11 = claim_text(strong1_nodes, "%");
      strong1_nodes.forEach(detach);
      t12 = claim_space(p0_nodes);
      span1 = claim_element(p0_nodes, "SPAN", {
        class: true
      });
      var span1_nodes = children(span1);
      t13 = claim_text(span1_nodes, "(");
      t14 = claim_text(span1_nodes, t14_value);
      t15 = claim_text(span1_nodes, ")");
      span1_nodes.forEach(detach);
      p0_nodes.forEach(detach);
      t16 = claim_space(div_nodes);
      p1 = claim_element(div_nodes, "P", {
        class: true
      });
      var p1_nodes = children(p1);
      t17 = claim_text(p1_nodes, "Values in brackets denote the 95% confidence interval.");
      p1_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h3, "class", "svelte-1f9le39");
      attr(span0, "class", "ci svelte-1f9le39");
      attr(span1, "class", "ci svelte-1f9le39");
      attr(p0, "class", "svelte-1f9le39");
      attr(p1, "class", "explainer svelte-1f9le39");
      attr(div, "class", "country-summary svelte-1f9le39");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, h3);
      append(h3, t0);
      append(div, t1);
      append(div, p0);
      append(p0, t2);
      append(p0, strong0);
      append(strong0, t3);
      append(strong0, t4);
      append(p0, t5);
      append(p0, span0);
      append(span0, t6);
      append(span0, t7);
      append(span0, t8);
      append(p0, t9);
      append(p0, strong1);
      append(strong1, t10);
      append(strong1, t11);
      append(p0, t12);
      append(p0, span1);
      append(span1, t13);
      append(span1, t14);
      append(span1, t15);
      append(div, t16);
      append(div, p1);
      append(p1, t17);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*data*/
      1 && t3_value !== (t3_value =
      /*data*/
      ctx[0].general.prevalence + "")) set_data(t3, t3_value);
      if (dirty &
      /*data*/
      1 && t7_value !== (t7_value =
      /*data*/
      ctx[0].general.ci.map(func$1).join(" - ") + "")) set_data(t7, t7_value);
      if (dirty &
      /*data*/
      1 && t10_value !== (t10_value =
      /*data*/
      ctx[0].highRisk.prevalence + "")) set_data(t10, t10_value);
      if (dirty &
      /*data*/
      1 && t14_value !== (t14_value =
      /*data*/
      ctx[0].highRisk.ci.map(func_1$1).join(" - ") + "")) set_data(t14, t14_value);
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);
    }

  };
}

const func$1 = d => `${d}%`;

const func_1$1 = d => `${d}%`;

function instance$6($$self, $$props, $$invalidate) {
  let {
    data
  } = $$props;
  format(",");

  $$self.$$set = $$props => {
    if ("data" in $$props) $$invalidate(0, data = $$props.data);
  };

  return [data];
}

class CountrySummary extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1f9le39-style")) add_css$4();
    init(this, options, instance$6, create_fragment$7, safe_not_equal, {
      data: 0
    });
  }

}

/* src/components/Credits.svelte generated by Svelte v3.31.2 */

function add_css$5() {
  var style = element("style");
  style.id = "svelte-13226cf-style";
  style.textContent = ".credit.svelte-13226cf{display:flex;justify-content:center;width:100%;padding:0.3em 0.5em}p.svelte-13226cf{color:gray;font-size:0.9em}a.svelte-13226cf{color:gray}";
  append(document.head, style);
} // (7:2) {#if (credit)}


function create_if_block$1(ctx) {
  let p;
  let t0_value =
  /*credit*/
  ctx[0].content + "";
  let t0;
  let t1;
  let if_block =
  /*showLink*/
  ctx[1] && create_if_block_1$1(ctx);
  return {
    c() {
      p = element("p");
      t0 = text(t0_value);
      t1 = space();
      if (if_block) if_block.c();
      this.h();
    },

    l(nodes) {
      p = claim_element(nodes, "P", {
        class: true
      });
      var p_nodes = children(p);
      t0 = claim_text(p_nodes, t0_value);
      t1 = claim_space(p_nodes);
      if (if_block) if_block.l(p_nodes);
      p_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(p, "class", "svelte-13226cf");
    },

    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
      if (if_block) if_block.m(p, null);
    },

    p(ctx, dirty) {
      if (dirty &
      /*credit*/
      1 && t0_value !== (t0_value =
      /*credit*/
      ctx[0].content + "")) set_data(t0, t0_value);

      if (
      /*showLink*/
      ctx[1]) {
        if (if_block) {
          if_block.p(ctx, dirty);
        } else {
          if_block = create_if_block_1$1(ctx);
          if_block.c();
          if_block.m(p, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },

    d(detaching) {
      if (detaching) detach(p);
      if (if_block) if_block.d();
    }

  };
} // (9:4) {#if (showLink)}


function create_if_block_1$1(ctx) {
  let a;
  let t;
  let a_href_value;
  return {
    c() {
      a = element("a");
      t = text("Link");
      this.h();
    },

    l(nodes) {
      a = claim_element(nodes, "A", {
        href: true,
        target: true,
        class: true
      });
      var a_nodes = children(a);
      t = claim_text(a_nodes, "Link");
      a_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(a, "href", a_href_value =
      /*credit*/
      ctx[0].link);
      attr(a, "target", "_blank");
      attr(a, "class", "svelte-13226cf");
    },

    m(target, anchor) {
      insert(target, a, anchor);
      append(a, t);
    },

    p(ctx, dirty) {
      if (dirty &
      /*credit*/
      1 && a_href_value !== (a_href_value =
      /*credit*/
      ctx[0].link)) {
        attr(a, "href", a_href_value);
      }
    },

    d(detaching) {
      if (detaching) detach(a);
    }

  };
}

function create_fragment$8(ctx) {
  let div;
  let if_block =
  /*credit*/
  ctx[0] && create_if_block$1(ctx);
  return {
    c() {
      div = element("div");
      if (if_block) if_block.c();
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      if (if_block) if_block.l(div_nodes);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "credit svelte-13226cf");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block) if_block.m(div, null);
    },

    p(ctx, [dirty]) {
      if (
      /*credit*/
      ctx[0]) {
        if (if_block) {
          if_block.p(ctx, dirty);
        } else {
          if_block = create_if_block$1(ctx);
          if_block.c();
          if_block.m(div, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);
      if (if_block) if_block.d();
    }

  };
}

function instance$7($$self, $$props, $$invalidate) {
  let {
    credit
  } = $$props;
  let {
    showLink = true
  } = $$props;

  $$self.$$set = $$props => {
    if ("credit" in $$props) $$invalidate(0, credit = $$props.credit);
    if ("showLink" in $$props) $$invalidate(1, showLink = $$props.showLink);
  };

  return [credit, showLink];
}

class Credits extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-13226cf-style")) add_css$5();
    init(this, options, instance$7, create_fragment$8, safe_not_equal, {
      credit: 0,
      showLink: 1
    });
  }

}

const createRadiusScale = (width, maxHeight, data) => {
  const minDim = Math.min(width, maxHeight);
  const scale = sqrt$1().domain([0, 100]).range([0, minDim / 12]);
  return scale;
};

/* src/Component.svelte generated by Svelte v3.31.2 */

function add_css$6() {
  var style = element("style");
  style.id = "svelte-1jbqfkv-style";
  style.textContent = "*{margin:0;padding:0;box-sizing:border-box}.component-wrapper.svelte-1jbqfkv{display:flex;flex-direction:column;width:100%;height:100%;font-family:'Open Sans', sans-serif;font-size:var(--fontSize);overflow:hidden}";
  append(document.head, style);
} // (51:2) {#if (country && provinces && cities && credits)}


function create_if_block$2(ctx) {
  let title;
  let t0;
  let map;
  let t1;
  let countrysummary;
  let t2;
  let if_block_anchor;
  let current;
  title = new Title({});
  map = new Map$1({
    props: {
      featuresCountry:
      /*country*/
      ctx[3].features,
      featuresProvinces:
      /*provinces*/
      ctx[2].features,
      cities:
      /*cities*/
      ctx[4],
      data:
      /*splitData*/
      ctx[1].map(
      /*func*/
      ctx[13]),
      radiusScale:
      /*radiusScale*/
      ctx[6]
    }
  });
  countrysummary = new CountrySummary({
    props: {
      data:
      /*splitData*/
      ctx[1].find(func_1$2)
    }
  });
  let if_block =
  /*credits*/
  ctx[5] && create_if_block_1$2(ctx);
  return {
    c() {
      create_component(title.$$.fragment);
      t0 = space();
      create_component(map.$$.fragment);
      t1 = space();
      create_component(countrysummary.$$.fragment);
      t2 = space();
      if (if_block) if_block.c();
      if_block_anchor = empty();
    },

    l(nodes) {
      claim_component(title.$$.fragment, nodes);
      t0 = claim_space(nodes);
      claim_component(map.$$.fragment, nodes);
      t1 = claim_space(nodes);
      claim_component(countrysummary.$$.fragment, nodes);
      t2 = claim_space(nodes);
      if (if_block) if_block.l(nodes);
      if_block_anchor = empty();
    },

    m(target, anchor) {
      mount_component(title, target, anchor);
      insert(target, t0, anchor);
      mount_component(map, target, anchor);
      insert(target, t1, anchor);
      mount_component(countrysummary, target, anchor);
      insert(target, t2, anchor);
      if (if_block) if_block.m(target, anchor);
      insert(target, if_block_anchor, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const map_changes = {};
      if (dirty &
      /*country*/
      8) map_changes.featuresCountry =
      /*country*/
      ctx[3].features;
      if (dirty &
      /*provinces*/
      4) map_changes.featuresProvinces =
      /*provinces*/
      ctx[2].features;
      if (dirty &
      /*cities*/
      16) map_changes.cities =
      /*cities*/
      ctx[4];
      if (dirty &
      /*splitData, radiusScale*/
      66) map_changes.data =
      /*splitData*/
      ctx[1].map(
      /*func*/
      ctx[13]);
      if (dirty &
      /*radiusScale*/
      64) map_changes.radiusScale =
      /*radiusScale*/
      ctx[6];
      map.$set(map_changes);
      const countrysummary_changes = {};
      if (dirty &
      /*splitData*/
      2) countrysummary_changes.data =
      /*splitData*/
      ctx[1].find(func_1$2);
      countrysummary.$set(countrysummary_changes);

      if (
      /*credits*/
      ctx[5]) {
        if (if_block) {
          if_block.p(ctx, dirty);

          if (dirty &
          /*credits*/
          32) {
            transition_in(if_block, 1);
          }
        } else {
          if_block = create_if_block_1$2(ctx);
          if_block.c();
          transition_in(if_block, 1);
          if_block.m(if_block_anchor.parentNode, if_block_anchor);
        }
      } else if (if_block) {
        group_outros();
        transition_out(if_block, 1, 1, () => {
          if_block = null;
        });
        check_outros();
      }
    },

    i(local) {
      if (current) return;
      transition_in(title.$$.fragment, local);
      transition_in(map.$$.fragment, local);
      transition_in(countrysummary.$$.fragment, local);
      transition_in(if_block);
      current = true;
    },

    o(local) {
      transition_out(title.$$.fragment, local);
      transition_out(map.$$.fragment, local);
      transition_out(countrysummary.$$.fragment, local);
      transition_out(if_block);
      current = false;
    },

    d(detaching) {
      destroy_component(title, detaching);
      if (detaching) detach(t0);
      destroy_component(map, detaching);
      if (detaching) detach(t1);
      destroy_component(countrysummary, detaching);
      if (detaching) detach(t2);
      if (if_block) if_block.d(detaching);
      if (detaching) detach(if_block_anchor);
    }

  };
} // (63:4) {#if (credits)}


function create_if_block_1$2(ctx) {
  let credits_1;
  let current;
  credits_1 = new Credits({
    props: {
      credit:
      /*credits*/
      ctx[5],
      showLink: false
    }
  });
  return {
    c() {
      create_component(credits_1.$$.fragment);
    },

    l(nodes) {
      claim_component(credits_1.$$.fragment, nodes);
    },

    m(target, anchor) {
      mount_component(credits_1, target, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const credits_1_changes = {};
      if (dirty &
      /*credits*/
      32) credits_1_changes.credit =
      /*credits*/
      ctx[5];
      credits_1.$set(credits_1_changes);
    },

    i(local) {
      if (current) return;
      transition_in(credits_1.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(credits_1.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      destroy_component(credits_1, detaching);
    }

  };
}

function create_fragment$9(ctx) {
  let div;
  let div_resize_listener;
  let current;
  let if_block =
  /*country*/
  ctx[3] &&
  /*provinces*/
  ctx[2] &&
  /*cities*/
  ctx[4] &&
  /*credits*/
  ctx[5] && create_if_block$2(ctx);
  return {
    c() {
      div = element("div");
      if (if_block) if_block.c();
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div_nodes = children(div);
      if (if_block) if_block.l(div_nodes);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "component-wrapper svelte-1jbqfkv");
      set_style(div, "--fontSize", Math.min(16, Math.max(8,
      /*width*/
      ctx[0] / 30)) + "px");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[14].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block) if_block.m(div, null);
      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[14].bind(div));
      current = true;
    },

    p(ctx, [dirty]) {
      if (
      /*country*/
      ctx[3] &&
      /*provinces*/
      ctx[2] &&
      /*cities*/
      ctx[4] &&
      /*credits*/
      ctx[5]) {
        if (if_block) {
          if_block.p(ctx, dirty);

          if (dirty &
          /*country, provinces, cities, credits*/
          60) {
            transition_in(if_block, 1);
          }
        } else {
          if_block = create_if_block$2(ctx);
          if_block.c();
          transition_in(if_block, 1);
          if_block.m(div, null);
        }
      } else if (if_block) {
        group_outros();
        transition_out(if_block, 1, 1, () => {
          if_block = null;
        });
        check_outros();
      }

      if (!current || dirty &
      /*width*/
      1) {
        set_style(div, "--fontSize", Math.min(16, Math.max(8,
        /*width*/
        ctx[0] / 30)) + "px");
      }
    },

    i(local) {
      if (current) return;
      transition_in(if_block);
      current = true;
    },

    o(local) {
      transition_out(if_block);
      current = false;
    },

    d(detaching) {
      if (detaching) detach(div);
      if (if_block) if_block.d();
      div_resize_listener();
    }

  };
}

const maxHeight = 600;

const func_1$2 = d => d.name === "Overall";

function instance$8($$self, $$props, $$invalidate) {
  let splitData;
  let radiusScale;
  let {
    dataPath
  } = $$props;
  let {
    countryPath
  } = $$props;
  let {
    provincesPath
  } = $$props;
  let {
    citiesPath
  } = $$props;
  let {
    creditsPath
  } = $$props;
  let data = [];
  let provinces, country, cities, credits;
  let width = 0;

  const func = d => ({ ...d,
    r: radiusScale(d.general.prevalence)
  });

  function div_elementresize_handler() {
    width = this.offsetWidth;
    $$invalidate(0, width);
  }

  $$self.$$set = $$props => {
    if ("dataPath" in $$props) $$invalidate(7, dataPath = $$props.dataPath);
    if ("countryPath" in $$props) $$invalidate(8, countryPath = $$props.countryPath);
    if ("provincesPath" in $$props) $$invalidate(9, provincesPath = $$props.provincesPath);
    if ("citiesPath" in $$props) $$invalidate(10, citiesPath = $$props.citiesPath);
    if ("creditsPath" in $$props) $$invalidate(11, creditsPath = $$props.creditsPath);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*dataPath*/
    128) {
       tsv$1(dataPath, d => {
        return {
          city: d.City,
          general: d["Seroprevalence in general population"],
          highRisk: d["Seroprevalence in high-risk population"]
        };
      }).then(r => $$invalidate(12, data = r));
    }

    if ($$self.$$.dirty &
    /*countryPath*/
    256) {
       fetch(countryPath).then(r => r.json()).then(r => $$invalidate(3, country = r));
    }

    if ($$self.$$.dirty &
    /*provincesPath*/
    512) {
       fetch(provincesPath).then(r => r.json()).then(r => $$invalidate(2, provinces = r));
    }

    if ($$self.$$.dirty &
    /*citiesPath*/
    1024) {
       fetch(citiesPath).then(r => r.json()).then(r => $$invalidate(4, cities = r));
    }

    if ($$self.$$.dirty &
    /*creditsPath*/
    2048) {
       fetch(creditsPath).then(r => r.json()).then(r => $$invalidate(5, credits = r));
    }

    if ($$self.$$.dirty &
    /*data*/
    4096) {
       $$invalidate(1, splitData = tidyData(data));
    }

    if ($$self.$$.dirty &
    /*width, splitData*/
    3) {
       $$invalidate(6, radiusScale = createRadiusScale(width, maxHeight));
    }
  };

  return [width, splitData, provinces, country, cities, credits, radiusScale, dataPath, countryPath, provincesPath, citiesPath, creditsPath, data, func, div_elementresize_handler];
}

class Component extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1jbqfkv-style")) add_css$6();
    init(this, options, instance$8, create_fragment$9, safe_not_equal, {
      dataPath: 7,
      countryPath: 8,
      provincesPath: 9,
      citiesPath: 10,
      creditsPath: 11
    });
  }

}

export default Component;
