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

function subscribe(store, ...callbacks) {
  if (store == null) {
    return noop;
  }

  const unsub = store.subscribe(...callbacks);
  return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}

function component_subscribe(component, store, callback) {
  component.$$.on_destroy.push(subscribe(store, callback));
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

function toggle_class(element, name, toggle) {
  element.classList[toggle ? 'add' : 'remove'](name);
}

function custom_event(type, detail) {
  const e = document.createEvent('CustomEvent');
  e.initCustomEvent(type, false, false, detail);
  return e;
}

let current_component;

function set_current_component(component) {
  current_component = component;
}

function get_current_component() {
  if (!current_component) throw new Error('Function called outside component initialization');
  return current_component;
}

function onMount(fn) {
  get_current_component().$$.on_mount.push(fn);
}

function createEventDispatcher() {
  const component = get_current_component();
  return (type, detail) => {
    const callbacks = component.$$.callbacks[type];

    if (callbacks) {
      // TODO are there situations where events could be dispatched
      // in a server (non-DOM) environment?
      const event = custom_event(type, detail);
      callbacks.slice().forEach(fn => {
        fn.call(component, event);
      });
    }
  };
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

var epsilon = 1e-6;
var epsilon2 = 1e-12;
var pi = Math.PI;
var halfPi = pi / 2;
var quarterPi = pi / 4;
var tau = pi * 2;
var degrees$1 = 180 / pi;
var radians$1 = pi / 180;
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
  return [abs(lambda) > pi ? lambda + Math.round(-lambda / tau) * tau : lambda, phi];
}

rotationIdentity.invert = rotationIdentity;
function rotateRadians(deltaLambda, deltaPhi, deltaGamma) {
  return (deltaLambda %= tau) ? deltaPhi || deltaGamma ? compose(rotationLambda(deltaLambda), rotationPhiGamma(deltaPhi, deltaGamma)) : rotationLambda(deltaLambda) : deltaPhi || deltaGamma ? rotationPhiGamma(deltaPhi, deltaGamma) : rotationIdentity;
}

function forwardRotationLambda(deltaLambda) {
  return function (lambda, phi) {
    return lambda += deltaLambda, [lambda > pi ? lambda - tau : lambda < -pi ? lambda + tau : lambda, phi];
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
  rotate = rotateRadians(rotate[0] * radians$1, rotate[1] * radians$1, rotate.length > 2 ? rotate[2] * radians$1 : 0);

  function forward(coordinates) {
    coordinates = rotate(coordinates[0] * radians$1, coordinates[1] * radians$1);
    return coordinates[0] *= degrees$1, coordinates[1] *= degrees$1, coordinates;
  }

  forward.invert = function (coordinates) {
    coordinates = rotate.invert(coordinates[0] * radians$1, coordinates[1] * radians$1);
    return coordinates[0] *= degrees$1, coordinates[1] *= degrees$1, coordinates;
  };

  return forward;
}

function circleStream(stream, radius, delta, direction, t0, t1) {
  if (!delta) return;
  var cosRadius = cos(radius),
      sinRadius = sin(radius),
      step = direction * delta;

  if (t0 == null) {
    t0 = radius + direction * tau;
    t1 = radius - step / 2;
  } else {
    t0 = circleRadius(cosRadius, t0);
    t1 = circleRadius(cosRadius, t1);
    if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * tau;
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
  return ((-point[2] < 0 ? -radius : radius) + tau - epsilon) % tau;
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
  return abs(a[0] - b[0]) < epsilon && abs(a[1] - b[1]) < epsilon;
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


      p1[0] += 2 * epsilon;
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
  if (abs(point[0]) <= pi) return point[0];else return sign(point[0]) * ((abs(point[0]) + pi) % tau - pi);
}

function polygonContains (polygon, point) {
  var lambda = longitude(point),
      phi = point[1],
      sinPhi = sin(phi),
      normal = [sin(lambda), -cos(lambda), 0],
      angle = 0,
      winding = 0;
  var sum = new Adder();
  if (sinPhi === 1) phi = halfPi + epsilon;else if (sinPhi === -1) phi = -halfPi - epsilon;

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
      angle += antimeridian ? delta + sign * tau : delta; // Are the longitudes either side of the point’s meridian (lambda),
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


  return (angle < -epsilon || angle < epsilon && sum < -epsilon2) ^ winding & 1;
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
  return ((a = a.x)[0] < 0 ? a[1] - halfPi - epsilon : halfPi - a[1]) - ((b = b.x)[0] < 0 ? b[1] - halfPi - epsilon : halfPi - b[1]);
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

      if (abs(delta - pi) < epsilon) {
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
        if (abs(lambda0 - sign0) < epsilon) lambda0 -= sign0 * epsilon; // handle degeneracies

        if (abs(lambda1 - sign1) < epsilon) lambda1 -= sign1 * epsilon;
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
  return abs(sinLambda0Lambda1) > epsilon ? atan((sin(phi0) * (cosPhi1 = cos(phi1)) * sin(lambda1) - sin(phi1) * (cosPhi0 = cos(phi0)) * sin(lambda0)) / (cosPhi0 * cosPhi1 * sinLambda0Lambda1)) : (phi0 + phi1) / 2;
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
  } else if (abs(from[0] - to[0]) > epsilon) {
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
      delta = 6 * radians$1,
      smallRadius = cr > 0,
      notHemisphere = abs(cr) > epsilon; // TODO optimise for this common case

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
        polar = abs(delta - pi) < epsilon,
        meridian = polar || delta < epsilon;
    if (!polar && phi1 < phi0) z = phi0, phi0 = phi1, phi1 = z; // Check that the first point is between a and b.

    if (meridian ? polar ? phi0 + phi1 > 0 ^ q[1] < (abs(q[0] - lambda0) < epsilon ? phi0 : phi1) : phi0 <= q[1] && q[1] <= phi1 : delta > pi ^ (lambda0 <= q[0] && q[0] <= lambda1)) {
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
    return abs(p[0] - x0) < epsilon ? direction > 0 ? 0 : 3 : abs(p[0] - x1) < epsilon ? direction > 0 ? 2 : 1 : abs(p[1] - y0) < epsilon ? direction > 0 ? 1 : 0 : direction > 0 ? 3 : 2; // abs(p[1] - y1) < epsilon
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

          this._context.arc(x, y, this._radius, 0, tau);

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
cosMinDistance = cos(30 * radians$1); // cos(minimum angular distance)

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
          lambda2 = abs(abs(c) - 1) < epsilon || abs(lambda0 - lambda1) < epsilon ? (lambda0 + lambda1) / 2 : atan2(b, a),
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
    this.stream.point(x * radians$1, y * radians$1);
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
    return projectRotateTransform(point[0] * radians$1, point[1] * radians$1);
  }

  function invert(point) {
    point = projectRotateTransform.invert(point[0], point[1]);
    return point && [point[0] * degrees$1, point[1] * degrees$1];
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
    return arguments.length ? (preclip = +_ ? clipCircle(theta = _ * radians$1) : (theta = null, clipAntimeridian), reset()) : theta * degrees$1;
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
    return arguments.length ? (lambda = _[0] % 360 * radians$1, phi = _[1] % 360 * radians$1, recenter()) : [lambda * degrees$1, phi * degrees$1];
  };

  projection.rotate = function (_) {
    return arguments.length ? (deltaLambda = _[0] % 360 * radians$1, deltaPhi = _[1] % 360 * radians$1, deltaGamma = _.length > 2 ? _[2] % 360 * radians$1 : 0, recenter()) : [deltaLambda * degrees$1, deltaPhi * degrees$1, deltaGamma * degrees$1];
  };

  projection.angle = function (_) {
    return arguments.length ? (alpha = _ % 360 * radians$1, recenter()) : alpha * degrees$1;
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
  return mercatorProjection(mercatorRaw).scale(961 / tau);
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
function continuous() {
  return transformer$1()(identity$2, identity$2);
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
const t = derived(localizedDict, $localizedDict => {
  return createMessageFormatter($localizedDict);
});
const n = derived(locale$1, $locale => {
  return n => {
    if ($locale === 'fa') {
      return toFarsiNumber(n);
    }

    return n;
  };
});
const dir = derived(localizedDict, $localizedDict => {
  if (!$localizedDict) return '';
  return $localizedDict.$dir;
});

/* src/components/SeasonSelector.svelte generated by Svelte v3.31.2 */

function add_css() {
  var style = element("style");
  style.id = "svelte-dirtos-style";
  style.textContent = ".season-selector.svelte-dirtos.svelte-dirtos{display:flex;flex-direction:column;align-items:center;width:100%;padding:0.3em 0.5em}h2.svelte-dirtos.svelte-dirtos{margin:0.2em 0;font-size:1.2em;font-weight:normal;color:#333333;white-space:nowrap}ul.svelte-dirtos.svelte-dirtos{display:flex;align-items:baseline;margin:0.2em 0;color:#333333;list-style-type:none}h2.svelte-dirtos.svelte-dirtos,li.svelte-dirtos.svelte-dirtos{margin:0 0.5em}li.svelte-dirtos.svelte-dirtos{color:#666666;cursor:pointer;user-select:none;overflow:hidden}li.svelte-dirtos.svelte-dirtos:hover{border-bottom:0.15em solid #666666}li.selected.svelte-dirtos.svelte-dirtos{color:#333333;font-weight:bold;border-bottom:0.15em solid #333333}p.svelte-dirtos.svelte-dirtos{font-size:1.4em;font-weight:bold;color:#333333}.year.svelte-dirtos.svelte-dirtos{display:inline-block;margin:0 0.1em;font-size:0.6em;color:#666666}.selected.svelte-dirtos .year.svelte-dirtos,p.single-season.svelte-dirtos .year.svelte-dirtos{color:#333333}";
  append(document.head, style);
}

function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[7] = list[i].id;
  child_ctx[8] = list[i].name;
  child_ctx[9] = list[i].year;
  return child_ctx;
} // (33:29) 


function create_if_block_1(ctx) {
  let p;
  let t0_value =
  /*$t*/
  ctx[3](`seasonselector.${
  /*selectedSeason*/
  ctx[1].toLowerCase()}`) + "";
  let t0;
  let t1;
  let span;
  let t2;
  let t3_value =
  /*$t*/
  ctx[3]("seasonselector." +
  /*seasons*/
  ctx[0].find(
  /*func*/
  ctx[5]).year) + "";
  let t3;
  let t4;
  return {
    c() {
      p = element("p");
      t0 = text(t0_value);
      t1 = space();
      span = element("span");
      t2 = text("(");
      t3 = text(t3_value);
      t4 = text(")");
      this.h();
    },

    l(nodes) {
      p = claim_element(nodes, "P", {
        class: true
      });
      var p_nodes = children(p);
      t0 = claim_text(p_nodes, t0_value);
      t1 = claim_space(p_nodes);
      span = claim_element(p_nodes, "SPAN", {
        class: true
      });
      var span_nodes = children(span);
      t2 = claim_text(span_nodes, "(");
      t3 = claim_text(span_nodes, t3_value);
      t4 = claim_text(span_nodes, ")");
      span_nodes.forEach(detach);
      p_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(span, "class", "year svelte-dirtos");
      attr(p, "class", "single-season svelte-dirtos");
    },

    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
      append(p, span);
      append(span, t2);
      append(span, t3);
      append(span, t4);
    },

    p(ctx, dirty) {
      if (dirty &
      /*$t, selectedSeason*/
      10 && t0_value !== (t0_value =
      /*$t*/
      ctx[3](`seasonselector.${
      /*selectedSeason*/
      ctx[1].toLowerCase()}`) + "")) set_data(t0, t0_value);
      if (dirty &
      /*$t, seasons, selectedSeason*/
      11 && t3_value !== (t3_value =
      /*$t*/
      ctx[3]("seasonselector." +
      /*seasons*/
      ctx[0].find(
      /*func*/
      ctx[5]).year) + "")) set_data(t3, t3_value);
    },

    d(detaching) {
      if (detaching) detach(p);
    }

  };
} // (19:2) {#if (selectable)}


function create_if_block(ctx) {
  let ul;
  let each_blocks = [];
  let each_1_lookup = new Map();
  let each_value =
  /*seasons*/
  ctx[0];

  const get_key = ctx =>
  /*id*/
  ctx[7];

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context(ctx, each_value, i);
    let key = get_key(child_ctx);
    each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
  }

  return {
    c() {
      ul = element("ul");

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      this.h();
    },

    l(nodes) {
      ul = claim_element(nodes, "UL", {
        class: true
      });
      var ul_nodes = children(ul);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(ul_nodes);
      }

      ul_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(ul, "class", "seasons svelte-dirtos");
    },

    m(target, anchor) {
      insert(target, ul, anchor);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(ul, null);
      }
    },

    p(ctx, dirty) {
      if (dirty &
      /*selectedSeason, seasons, handleClick, $t*/
      27) {
        each_value =
        /*seasons*/
        ctx[0];
        each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, destroy_block, create_each_block, null, get_each_context);
      }
    },

    d(detaching) {
      if (detaching) detach(ul);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }
    }

  };
} // (21:6) {#each seasons as { id, name, year }


function create_each_block(key_1, ctx) {
  let li;
  let t0_value =
  /*$t*/
  ctx[3](`seasonselector.${
  /*name*/
  ctx[8].toLowerCase()}`) + "";
  let t0;
  let t1;
  let span;
  let t2;
  let t3_value =
  /*$t*/
  ctx[3]("seasonselector." +
  /*year*/
  ctx[9]) + "";
  let t3;
  let t4;
  let t5;
  let mounted;
  let dispose;
  return {
    key: key_1,
    first: null,

    c() {
      li = element("li");
      t0 = text(t0_value);
      t1 = space();
      span = element("span");
      t2 = text("(");
      t3 = text(t3_value);
      t4 = text(")");
      t5 = space();
      this.h();
    },

    l(nodes) {
      li = claim_element(nodes, "LI", {
        class: true
      });
      var li_nodes = children(li);
      t0 = claim_text(li_nodes, t0_value);
      t1 = claim_space(li_nodes);
      span = claim_element(li_nodes, "SPAN", {
        class: true
      });
      var span_nodes = children(span);
      t2 = claim_text(span_nodes, "(");
      t3 = claim_text(span_nodes, t3_value);
      t4 = claim_text(span_nodes, ")");
      span_nodes.forEach(detach);
      t5 = claim_space(li_nodes);
      li_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(span, "class", "year svelte-dirtos");
      attr(li, "class", "svelte-dirtos");
      toggle_class(li, "selected",
      /*selectedSeason*/
      ctx[1] ===
      /*name*/
      ctx[8]);
      this.first = li;
    },

    m(target, anchor) {
      insert(target, li, anchor);
      append(li, t0);
      append(li, t1);
      append(li, span);
      append(span, t2);
      append(span, t3);
      append(span, t4);
      append(li, t5);

      if (!mounted) {
        dispose = listen(li, "click", function () {
          if (is_function(
          /*handleClick*/
          ctx[4](
          /*name*/
          ctx[8])))
            /*handleClick*/
            ctx[4](
            /*name*/
            ctx[8]).apply(this, arguments);
        });
        mounted = true;
      }
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (dirty &
      /*$t, seasons*/
      9 && t0_value !== (t0_value =
      /*$t*/
      ctx[3](`seasonselector.${
      /*name*/
      ctx[8].toLowerCase()}`) + "")) set_data(t0, t0_value);
      if (dirty &
      /*$t, seasons*/
      9 && t3_value !== (t3_value =
      /*$t*/
      ctx[3]("seasonselector." +
      /*year*/
      ctx[9]) + "")) set_data(t3, t3_value);

      if (dirty &
      /*selectedSeason, seasons*/
      3) {
        toggle_class(li, "selected",
        /*selectedSeason*/
        ctx[1] ===
        /*name*/
        ctx[8]);
      }
    },

    d(detaching) {
      if (detaching) detach(li);
      mounted = false;
      dispose();
    }

  };
}

function create_fragment(ctx) {
  let div;
  let h2;
  let t0_value =
  /*$t*/
  ctx[3]("seasonselector.title") + "";
  let t0;
  let t1;

  function select_block_type(ctx, dirty) {
    if (
    /*selectable*/
    ctx[2]) return create_if_block;
    if (
    /*selectedSeason*/
    ctx[1]) return create_if_block_1;
  }

  let current_block_type = select_block_type(ctx);
  let if_block = current_block_type && current_block_type(ctx);
  return {
    c() {
      div = element("div");
      h2 = element("h2");
      t0 = text(t0_value);
      t1 = space();
      if (if_block) if_block.c();
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
      t0 = claim_text(h2_nodes, t0_value);
      h2_nodes.forEach(detach);
      t1 = claim_space(div_nodes);
      if (if_block) if_block.l(div_nodes);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h2, "class", "svelte-dirtos");
      attr(div, "class", "season-selector svelte-dirtos");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, h2);
      append(h2, t0);
      append(div, t1);
      if (if_block) if_block.m(div, null);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*$t*/
      8 && t0_value !== (t0_value =
      /*$t*/
      ctx[3]("seasonselector.title") + "")) set_data(t0, t0_value);

      if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
        if_block.p(ctx, dirty);
      } else {
        if (if_block) if_block.d(1);
        if_block = current_block_type && current_block_type(ctx);

        if (if_block) {
          if_block.c();
          if_block.m(div, null);
        }
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);

      if (if_block) {
        if_block.d();
      }
    }

  };
}

function instance($$self, $$props, $$invalidate) {
  let $t;
  component_subscribe($$self, t, $$value => $$invalidate(3, $t = $$value));
  let {
    seasons = []
  } = $$props;
  let {
    selectedSeason
  } = $$props;
  let {
    selectable = true
  } = $$props;
  const dispatch = createEventDispatcher();

  function handleClick(name) {
    dispatch("seasonselected", name);
  }

  const func = d => d.name === selectedSeason;

  $$self.$$set = $$props => {
    if ("seasons" in $$props) $$invalidate(0, seasons = $$props.seasons);
    if ("selectedSeason" in $$props) $$invalidate(1, selectedSeason = $$props.selectedSeason);
    if ("selectable" in $$props) $$invalidate(2, selectable = $$props.selectable);
  };

  return [seasons, selectedSeason, selectable, $t, handleClick, func];
}

class SeasonSelector extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-dirtos-style")) add_css();
    init(this, options, instance, create_fragment, safe_not_equal, {
      seasons: 0,
      selectedSeason: 1,
      selectable: 2
    });
  }

}

/* src/components/Legend.svelte generated by Svelte v3.31.2 */

function add_css$1() {
  var style = element("style");
  style.id = "svelte-9ue0qh-style";
  style.textContent = ".legend.svelte-9ue0qh{width:67%;margin:0.8em auto 0 auto;color:#333333}.colors.svelte-9ue0qh{display:flex;width:100%;height:1em}.color-tick.svelte-9ue0qh{height:100%}.color-tick.svelte-9ue0qh{border-right:0.1em solid #333333}.color-tick.gray-border.svelte-9ue0qh{border-color:#DDD}.color.svelte-9ue0qh{height:67%}.labels.svelte-9ue0qh{display:flex;width:100%;height:1em}.legend-label.svelte-9ue0qh{display:inline-block;font-size:0.9em;transform:translate(-50%, 0)}";
  append(document.head, style);
}

function get_each_context$1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[7] = list[i].endDomain;
  child_ctx[9] = i;
  return child_ctx;
}

function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[10] = list[i].color;
  child_ctx[9] = i;
  return child_ctx;
} // (17:4) {#each colorArray.data as { color }


function create_each_block_1(key_1, ctx) {
  let div1;
  let div0;
  let div1_style_value;
  return {
    key: key_1,
    first: null,

    c() {
      div1 = element("div");
      div0 = element("div");
      this.h();
    },

    l(nodes) {
      div1 = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div1_nodes = children(div1);
      div0 = claim_element(div1_nodes, "DIV", {
        class: true,
        style: true
      });
      children(div0).forEach(detach);
      div1_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div0, "class", "color svelte-9ue0qh");
      set_style(div0, "background-color",
      /*color*/
      ctx[10]);
      attr(div1, "class", "color-tick svelte-9ue0qh");
      attr(div1, "style", div1_style_value = `width: ${
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3]}px; ${
      /*i*/
      ctx[9] === 0 &&
      /*$dir*/
      ctx[4] === "rtl" ? "border: none;" : ""}`);
      toggle_class(div1, "gray-border", !
      /*everySecondLabelOnly*/
      ctx[1] ||
      /*i*/
      ctx[9] % 2 === (
      /*$dir*/
      ctx[4] === "ltr" ? 1 : 0));
      this.first = div1;
    },

    m(target, anchor) {
      insert(target, div1, anchor);
      append(div1, div0);
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;

      if (dirty &
      /*colorArray*/
      1) {
        set_style(div0, "background-color",
        /*color*/
        ctx[10]);
      }

      if (dirty &
      /*width, numColors, colorArray, $dir*/
      29 && div1_style_value !== (div1_style_value = `width: ${
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3]}px; ${
      /*i*/
      ctx[9] === 0 &&
      /*$dir*/
      ctx[4] === "rtl" ? "border: none;" : ""}`)) {
        attr(div1, "style", div1_style_value);
      }

      if (dirty &
      /*everySecondLabelOnly, colorArray, $dir*/
      19) {
        toggle_class(div1, "gray-border", !
        /*everySecondLabelOnly*/
        ctx[1] ||
        /*i*/
        ctx[9] % 2 === (
        /*$dir*/
        ctx[4] === "ltr" ? 1 : 0));
      }
    },

    d(detaching) {
      if (detaching) detach(div1);
    }

  };
} // (29:4) {#if ($dir === 'rtl')}


function create_if_block_3(ctx) {
  let div;
  return {
    c() {
      div = element("div");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div_nodes = children(div);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "color-tick svelte-9ue0qh");
      set_style(div, "width",
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3] + "px");
    },

    m(target, anchor) {
      insert(target, div, anchor);
    },

    p(ctx, dirty) {
      if (dirty &
      /*width, numColors*/
      12) {
        set_style(div, "width",
        /*width*/
        ctx[2] /
        /*numColors*/
        ctx[3] + "px");
      }
    },

    d(detaching) {
      if (detaching) detach(div);
    }

  };
} // (40:4) {#if ($dir === 'ltr')}


function create_if_block_2(ctx) {
  let div;
  return {
    c() {
      div = element("div");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div_nodes = children(div);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "label-container");
      set_style(div, "width",
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3] + "px");
    },

    m(target, anchor) {
      insert(target, div, anchor);
    },

    p(ctx, dirty) {
      if (dirty &
      /*width, numColors*/
      12) {
        set_style(div, "width",
        /*width*/
        ctx[2] /
        /*numColors*/
        ctx[3] + "px");
      }
    },

    d(detaching) {
      if (detaching) detach(div);
    }

  };
} // (52:8) {#if (!everySecondLabelOnly || (i % 2 === 0))}


function create_if_block_1$1(ctx) {
  let span;
  let t_value =
  /*$n*/
  ctx[5](
  /*colorArray*/
  ctx[0].format(
  /*endDomain*/
  ctx[7])) + "";
  let t;
  return {
    c() {
      span = element("span");
      t = text(t_value);
      this.h();
    },

    l(nodes) {
      span = claim_element(nodes, "SPAN", {
        class: true
      });
      var span_nodes = children(span);
      t = claim_text(span_nodes, t_value);
      span_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(span, "class", "legend-label svelte-9ue0qh");
    },

    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t);
    },

    p(ctx, dirty) {
      if (dirty &
      /*$n, colorArray*/
      33 && t_value !== (t_value =
      /*$n*/
      ctx[5](
      /*colorArray*/
      ctx[0].format(
      /*endDomain*/
      ctx[7])) + "")) set_data(t, t_value);
    },

    d(detaching) {
      if (detaching) detach(span);
    }

  };
} // (47:4) {#each colorArray.data as { endDomain }


function create_each_block$1(key_1, ctx) {
  let div;
  let if_block = (!
  /*everySecondLabelOnly*/
  ctx[1] ||
  /*i*/
  ctx[9] % 2 === 0) && create_if_block_1$1(ctx);
  return {
    key: key_1,
    first: null,

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
      attr(div, "class", "label-container");
      set_style(div, "width",
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3] + "px");
      this.first = div;
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block) if_block.m(div, null);
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;

      if (!
      /*everySecondLabelOnly*/
      ctx[1] ||
      /*i*/
      ctx[9] % 2 === 0) {
        if (if_block) {
          if_block.p(ctx, dirty);
        } else {
          if_block = create_if_block_1$1(ctx);
          if_block.c();
          if_block.m(div, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }

      if (dirty &
      /*width, numColors*/
      12) {
        set_style(div, "width",
        /*width*/
        ctx[2] /
        /*numColors*/
        ctx[3] + "px");
      }
    },

    d(detaching) {
      if (detaching) detach(div);
      if (if_block) if_block.d();
    }

  };
} // (59:4) {#if ($dir === 'rtl')}


function create_if_block$1(ctx) {
  let div;
  return {
    c() {
      div = element("div");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div_nodes = children(div);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div, "class", "label-container");
      set_style(div, "width",
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3] + "px");
    },

    m(target, anchor) {
      insert(target, div, anchor);
    },

    p(ctx, dirty) {
      if (dirty &
      /*width, numColors*/
      12) {
        set_style(div, "width",
        /*width*/
        ctx[2] /
        /*numColors*/
        ctx[3] + "px");
      }
    },

    d(detaching) {
      if (detaching) detach(div);
    }

  };
}

function create_fragment$1(ctx) {
  let div2;
  let div0;
  let each_blocks_1 = [];
  let each0_lookup = new Map();
  let t0;
  let div0_resize_listener;
  let t1;
  let div1;
  let t2;
  let each_blocks = [];
  let each1_lookup = new Map();
  let t3;
  let each_value_1 =
  /*colorArray*/
  ctx[0].data;

  const get_key = ctx =>
  /*color*/
  ctx[10];

  for (let i = 0; i < each_value_1.length; i += 1) {
    let child_ctx = get_each_context_1(ctx, each_value_1, i);
    let key = get_key(child_ctx);
    each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
  }

  let if_block0 =
  /*$dir*/
  ctx[4] === "rtl" && create_if_block_3(ctx);
  let if_block1 =
  /*$dir*/
  ctx[4] === "ltr" && create_if_block_2(ctx);
  let each_value =
  /*colorArray*/
  ctx[0].data;

  const get_key_1 = ctx =>
  /*endDomain*/
  ctx[7];

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context$1(ctx, each_value, i);
    let key = get_key_1(child_ctx);
    each1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
  }

  let if_block2 =
  /*$dir*/
  ctx[4] === "rtl" && create_if_block$1(ctx);
  return {
    c() {
      div2 = element("div");
      div0 = element("div");

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].c();
      }

      t0 = space();
      if (if_block0) if_block0.c();
      t1 = space();
      div1 = element("div");
      if (if_block1) if_block1.c();
      t2 = space();

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      t3 = space();
      if (if_block2) if_block2.c();
      this.h();
    },

    l(nodes) {
      div2 = claim_element(nodes, "DIV", {
        class: true
      });
      var div2_nodes = children(div2);
      div0 = claim_element(div2_nodes, "DIV", {
        class: true
      });
      var div0_nodes = children(div0);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].l(div0_nodes);
      }

      t0 = claim_space(div0_nodes);
      if (if_block0) if_block0.l(div0_nodes);
      div0_nodes.forEach(detach);
      t1 = claim_space(div2_nodes);
      div1 = claim_element(div2_nodes, "DIV", {
        class: true
      });
      var div1_nodes = children(div1);
      if (if_block1) if_block1.l(div1_nodes);
      t2 = claim_space(div1_nodes);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(div1_nodes);
      }

      t3 = claim_space(div1_nodes);
      if (if_block2) if_block2.l(div1_nodes);
      div1_nodes.forEach(detach);
      div2_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div0, "class", "colors svelte-9ue0qh");
      add_render_callback(() =>
      /*div0_elementresize_handler*/
      ctx[6].call(div0));
      attr(div1, "class", "labels svelte-9ue0qh");
      attr(div2, "class", "legend svelte-9ue0qh");
    },

    m(target, anchor) {
      insert(target, div2, anchor);
      append(div2, div0);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].m(div0, null);
      }

      append(div0, t0);
      if (if_block0) if_block0.m(div0, null);
      div0_resize_listener = add_resize_listener(div0,
      /*div0_elementresize_handler*/
      ctx[6].bind(div0));
      append(div2, t1);
      append(div2, div1);
      if (if_block1) if_block1.m(div1, null);
      append(div1, t2);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(div1, null);
      }

      append(div1, t3);
      if (if_block2) if_block2.m(div1, null);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*width, numColors, colorArray, $dir, everySecondLabelOnly*/
      31) {
        each_value_1 =
        /*colorArray*/
        ctx[0].data;
        each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx, each_value_1, each0_lookup, div0, destroy_block, create_each_block_1, t0, get_each_context_1);
      }

      if (
      /*$dir*/
      ctx[4] === "rtl") {
        if (if_block0) {
          if_block0.p(ctx, dirty);
        } else {
          if_block0 = create_if_block_3(ctx);
          if_block0.c();
          if_block0.m(div0, null);
        }
      } else if (if_block0) {
        if_block0.d(1);
        if_block0 = null;
      }

      if (
      /*$dir*/
      ctx[4] === "ltr") {
        if (if_block1) {
          if_block1.p(ctx, dirty);
        } else {
          if_block1 = create_if_block_2(ctx);
          if_block1.c();
          if_block1.m(div1, t2);
        }
      } else if (if_block1) {
        if_block1.d(1);
        if_block1 = null;
      }

      if (dirty &
      /*width, numColors, $n, colorArray, everySecondLabelOnly*/
      47) {
        each_value =
        /*colorArray*/
        ctx[0].data;
        each_blocks = update_keyed_each(each_blocks, dirty, get_key_1, 1, ctx, each_value, each1_lookup, div1, destroy_block, create_each_block$1, t3, get_each_context$1);
      }

      if (
      /*$dir*/
      ctx[4] === "rtl") {
        if (if_block2) {
          if_block2.p(ctx, dirty);
        } else {
          if_block2 = create_if_block$1(ctx);
          if_block2.c();
          if_block2.m(div1, null);
        }
      } else if (if_block2) {
        if_block2.d(1);
        if_block2 = null;
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div2);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].d();
      }

      if (if_block0) if_block0.d();
      div0_resize_listener();
      if (if_block1) if_block1.d();

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }

      if (if_block2) if_block2.d();
    }

  };
}

function instance$1($$self, $$props, $$invalidate) {
  let numColors;
  let $dir;
  let $n;
  component_subscribe($$self, dir, $$value => $$invalidate(4, $dir = $$value));
  component_subscribe($$self, n, $$value => $$invalidate(5, $n = $$value));
  let {
    colorArray = []
  } = $$props;
  let {
    everySecondLabelOnly = false
  } = $$props;
  let width = 0;

  function div0_elementresize_handler() {
    width = this.clientWidth;
    $$invalidate(2, width);
  }

  $$self.$$set = $$props => {
    if ("colorArray" in $$props) $$invalidate(0, colorArray = $$props.colorArray);
    if ("everySecondLabelOnly" in $$props) $$invalidate(1, everySecondLabelOnly = $$props.everySecondLabelOnly);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*colorArray*/
    1) {
       $$invalidate(3, numColors = colorArray.data.length + 1);
    }
  };

  return [colorArray, everySecondLabelOnly, width, numColors, $dir, $n, div0_elementresize_handler];
}

class Legend extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-9ue0qh-style")) add_css$1();
    init(this, options, instance$1, create_fragment$1, safe_not_equal, {
      colorArray: 0,
      everySecondLabelOnly: 1
    });
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
  return name.replace('Azarbaijan', 'Azerbaijan').replace('Azarbayjan', 'Azerbaijan').replace('Ardebil', 'Ardabil').replace('Mahall', 'Mahaal').replace('Gilan (Guilan)', 'Gilan').replace('Hamadan', 'Hamedan').replace('Baluchestan', 'Baluchistan').replace('Kordestan', 'Kurdestan').replace('Buyer Ahmad', 'Boyer-Ahmad').replace('Esfahan', 'Isfahan').replace('Chahar Mahaal and Bakhtiari', 'Chaharmahal and Bakhtiari');
};
const cleanProvinceKey = name => {
  return name.replace(/\s/g, '_').replace(/\(/g, '').replace(/\)/g, '').replace(/-/g, '_').toLowerCase();
};

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

function instance$2($$self, $$props, $$invalidate) {
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
    init(this, options, instance$2, create_fragment$2, safe_not_equal, {
      geo: 0
    });
  }

}

/* src/components/Province.svelte generated by Svelte v3.31.2 */

function add_css$2() {
  var style = element("style");
  style.id = "svelte-egbf40-style";
  style.textContent = "path.svelte-egbf40{cursor:pointer}";
  append(document.head, style);
} // (33:2) {:else}


function create_else_block(ctx) {
  let path;
  let path_d_value;
  let path_fill_value;
  let mounted;
  let dispose;
  return {
    c() {
      path = svg_element("path");
      this.h();
    },

    l(nodes) {
      path = claim_element(nodes, "path", {
        d: true,
        fill: true,
        stroke: true,
        "stroke-width": true,
        class: true
      }, 1);
      children(path).forEach(detach);
      this.h();
    },

    h() {
      attr(path, "d", path_d_value =
      /*geo*/
      ctx[0].path);
      attr(path, "fill", path_fill_value =
      /*data*/
      ctx[1] &&
      /*data*/
      ctx[1].color ?
      /*data*/
      ctx[1].color : "#f2f2f2");
      attr(path, "stroke", "#FFFFFF");
      attr(path, "stroke-width", "1");
      attr(path, "class", "svelte-egbf40");
    },

    m(target, anchor) {
      insert(target, path, anchor);

      if (!mounted) {
        dispose = [listen(path, "mousemove",
        /*mousemove_handler*/
        ctx[5]), listen(path, "mouseleave",
        /*handleMouseLeave*/
        ctx[4])];
        mounted = true;
      }
    },

    p(ctx, dirty) {
      if (dirty &
      /*geo*/
      1 && path_d_value !== (path_d_value =
      /*geo*/
      ctx[0].path)) {
        attr(path, "d", path_d_value);
      }

      if (dirty &
      /*data*/
      2 && path_fill_value !== (path_fill_value =
      /*data*/
      ctx[1] &&
      /*data*/
      ctx[1].color ?
      /*data*/
      ctx[1].color : "#f2f2f2")) {
        attr(path, "fill", path_fill_value);
      }
    },

    d(detaching) {
      if (detaching) detach(path);
      mounted = false;
      run_all(dispose);
    }

  };
} // (26:2) {#if (isHovered)}


function create_if_block$2(ctx) {
  let path;
  let path_d_value;
  return {
    c() {
      path = svg_element("path");
      this.h();
    },

    l(nodes) {
      path = claim_element(nodes, "path", {
        d: true,
        fill: true,
        stroke: true,
        "stroke-width": true,
        class: true
      }, 1);
      children(path).forEach(detach);
      this.h();
    },

    h() {
      attr(path, "d", path_d_value =
      /*geo*/
      ctx[0].path);
      attr(path, "fill", "none");
      attr(path, "stroke", "#333333");
      attr(path, "stroke-width", "1.5");
      attr(path, "class", "svelte-egbf40");
    },

    m(target, anchor) {
      insert(target, path, anchor);
    },

    p(ctx, dirty) {
      if (dirty &
      /*geo*/
      1 && path_d_value !== (path_d_value =
      /*geo*/
      ctx[0].path)) {
        attr(path, "d", path_d_value);
      }
    },

    d(detaching) {
      if (detaching) detach(path);
    }

  };
}

function create_fragment$3(ctx) {
  let g;

  function select_block_type(ctx, dirty) {
    if (
    /*isHovered*/
    ctx[2]) return create_if_block$2;
    return create_else_block;
  }

  let current_block_type = select_block_type(ctx);
  let if_block = current_block_type(ctx);
  return {
    c() {
      g = svg_element("g");
      if_block.c();
      this.h();
    },

    l(nodes) {
      g = claim_element(nodes, "g", {
        class: true
      }, 1);
      var g_nodes = children(g);
      if_block.l(g_nodes);
      g_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(g, "class", "province");
    },

    m(target, anchor) {
      insert(target, g, anchor);
      if_block.m(g, null);
    },

    p(ctx, [dirty]) {
      if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
        if_block.p(ctx, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx);

        if (if_block) {
          if_block.c();
          if_block.m(g, null);
        }
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(g);
      if_block.d();
    }

  };
}

function instance$3($$self, $$props, $$invalidate) {
  let {
    geo
  } = $$props;
  let {
    data = null
  } = $$props;
  let {
    isHovered = false
  } = $$props;
  const dispatch = createEventDispatcher();

  function handleMouseMove(e, name) {
    const {
      layerX: x,
      layerY: y
    } = e;
    dispatch("provincehovered", {
      pos: [x, y],
      name
    });
  }

  function handleMouseLeave() {
    dispatch("provincehovered", null);
  }

  const mousemove_handler = e => handleMouseMove(e, geo.nameEn);

  $$self.$$set = $$props => {
    if ("geo" in $$props) $$invalidate(0, geo = $$props.geo);
    if ("data" in $$props) $$invalidate(1, data = $$props.data);
    if ("isHovered" in $$props) $$invalidate(2, isHovered = $$props.isHovered);
  };

  return [geo, data, isHovered, handleMouseMove, handleMouseLeave, mousemove_handler];
}

class Province extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-egbf40-style")) add_css$2();
    init(this, options, instance$3, create_fragment$3, safe_not_equal, {
      geo: 0,
      data: 1,
      isHovered: 2
    });
  }

}

/* src/components/ProvinceTooltip.svelte generated by Svelte v3.31.2 */

function add_css$3() {
  var style = element("style");
  style.id = "svelte-1ps4wd3-style";
  style.textContent = ".province-tooltip.svelte-1ps4wd3.svelte-1ps4wd3{position:absolute;z-index:100;width:42%;min-width:120px;background-color:#FFFFFF;box-shadow:0 1px 2px rgba(0,0,0,0.07), \n                0 2px 4px rgba(0,0,0,0.07), \n                0 4px 8px rgba(0,0,0,0.07)}.tooltip-content.svelte-1ps4wd3.svelte-1ps4wd3{width:100%;height:100%;padding:0.4em;color:#333333}.tooltip-title.svelte-1ps4wd3.svelte-1ps4wd3{display:flex;align-items:baseline;justify-content:space-between;border-bottom:0.15em solid #333333}.tooltip-h3.svelte-1ps4wd3.svelte-1ps4wd3{margin:0;font-size:1.3em;font-weight:normal}.tooltip-h3.margin-r.svelte-1ps4wd3.svelte-1ps4wd3{margin-right:0.3em}.tooltip-h3.margin-l.svelte-1ps4wd3.svelte-1ps4wd3{margin-left:0.3em}.tooltip-h4.svelte-1ps4wd3.svelte-1ps4wd3{font-size:1em;font-weight:bold}.excess-deaths.svelte-1ps4wd3.svelte-1ps4wd3{padding:0 0.2em;border:none;border-radius:2px}.deaths.svelte-1ps4wd3.svelte-1ps4wd3{width:100%;margin:0.3em 0;font-size:1em}table.svelte-1ps4wd3.svelte-1ps4wd3{width:100%;border-collapse:collapse}tr.svelte-1ps4wd3 td.svelte-1ps4wd3{padding:0.1em 0.2em 0.1em 0}tr.svelte-1ps4wd3 td.svelte-1ps4wd3:nth-child(2){font-weight:bold;text-align:right;vertical-align:top}.hidden.svelte-1ps4wd3.svelte-1ps4wd3{visibility:hidden}";
  append(document.head, style);
} // (70:54) {#if ($dir === 'ltr' && /\./.test(f(tooltip.data.estimatedDeaths)))}


function create_if_block$3(ctx) {
  let span;
  let t_1;
  return {
    c() {
      span = element("span");
      t_1 = text(".0");
      this.h();
    },

    l(nodes) {
      span = claim_element(nodes, "SPAN", {
        class: true
      });
      var span_nodes = children(span);
      t_1 = claim_text(span_nodes, ".0");
      span_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(span, "class", "hidden svelte-1ps4wd3");
    },

    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t_1);
    },

    d(detaching) {
      if (detaching) detach(span);
    }

  };
}

function create_fragment$4(ctx) {
  let div3;
  let div2;
  let div0;
  let h3;
  let t0_value =
  /*$t*/
  ctx[8](`province.${cleanProvinceKey(
  /*tooltip*/
  ctx[0].name)}`) + "";
  let t0;
  let t1;
  let span;
  let t2_value =
  /*$n*/
  ctx[9](
  /*excessSign*/
  ctx[6] + Math.round(Math.abs(
  /*tooltip*/
  ctx[0].data.percentageExcessDeaths)) + "%") + "";
  let t2;
  let t3;
  let div1;
  let h4;
  let t4_value =
  /*$t*/
  ctx[8]("provincetooltip.deaths") + "";
  let t4;
  let t5;
  let table;
  let tbody;
  let tr0;
  let td0;
  let t6_value =
  /*$t*/
  ctx[8]("provincetooltip.estimated") + "";
  let t6;
  let t7;
  let td1;
  let t8_value =
  /*$n*/
  ctx[9](
  /*f*/
  ctx[10](
  /*tooltip*/
  ctx[0].data.estimatedDeaths)) + "";
  let t8;
  let t9;
  let tr1;
  let td2;
  let t10_value =
  /*$t*/
  ctx[8]("provincetooltip.registered") + "";
  let t10;
  let t11;
  let td3;
  let t12_value =
  /*$n*/
  ctx[9](
  /*f*/
  ctx[10](
  /*tooltip*/
  ctx[0].data.registeredDeaths)) + "";
  let t12;
  let show_if =
  /*$dir*/
  ctx[7] === "ltr" && /\./.test(
  /*f*/
  ctx[10](
  /*tooltip*/
  ctx[0].data.estimatedDeaths));
  let t13;
  let tr2;
  let td4;
  let t14_value =
  /*$t*/
  ctx[8]("provincetooltip.excess") + "";
  let t14;
  let t15;
  let td5;
  let t16_value =
  /*$n*/
  ctx[9](
  /*f*/
  ctx[10](
  /*tooltip*/
  ctx[0].data.meanExcessDeaths)) + "";
  let t16;
  let div3_resize_listener;
  let if_block = show_if && create_if_block$3();
  return {
    c() {
      div3 = element("div");
      div2 = element("div");
      div0 = element("div");
      h3 = element("h3");
      t0 = text(t0_value);
      t1 = space();
      span = element("span");
      t2 = text(t2_value);
      t3 = space();
      div1 = element("div");
      h4 = element("h4");
      t4 = text(t4_value);
      t5 = space();
      table = element("table");
      tbody = element("tbody");
      tr0 = element("tr");
      td0 = element("td");
      t6 = text(t6_value);
      t7 = space();
      td1 = element("td");
      t8 = text(t8_value);
      t9 = space();
      tr1 = element("tr");
      td2 = element("td");
      t10 = text(t10_value);
      t11 = space();
      td3 = element("td");
      t12 = text(t12_value);
      if (if_block) if_block.c();
      t13 = space();
      tr2 = element("tr");
      td4 = element("td");
      t14 = text(t14_value);
      t15 = space();
      td5 = element("td");
      t16 = text(t16_value);
      this.h();
    },

    l(nodes) {
      div3 = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div3_nodes = children(div3);
      div2 = claim_element(div3_nodes, "DIV", {
        class: true
      });
      var div2_nodes = children(div2);
      div0 = claim_element(div2_nodes, "DIV", {
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
      t1 = claim_space(div0_nodes);
      span = claim_element(div0_nodes, "SPAN", {
        class: true,
        style: true
      });
      var span_nodes = children(span);
      t2 = claim_text(span_nodes, t2_value);
      span_nodes.forEach(detach);
      div0_nodes.forEach(detach);
      t3 = claim_space(div2_nodes);
      div1 = claim_element(div2_nodes, "DIV", {
        class: true
      });
      var div1_nodes = children(div1);
      h4 = claim_element(div1_nodes, "H4", {
        class: true
      });
      var h4_nodes = children(h4);
      t4 = claim_text(h4_nodes, t4_value);
      h4_nodes.forEach(detach);
      t5 = claim_space(div1_nodes);
      table = claim_element(div1_nodes, "TABLE", {
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
      t6 = claim_text(td0_nodes, t6_value);
      td0_nodes.forEach(detach);
      t7 = claim_space(tr0_nodes);
      td1 = claim_element(tr0_nodes, "TD", {
        class: true
      });
      var td1_nodes = children(td1);
      t8 = claim_text(td1_nodes, t8_value);
      td1_nodes.forEach(detach);
      tr0_nodes.forEach(detach);
      t9 = claim_space(tbody_nodes);
      tr1 = claim_element(tbody_nodes, "TR", {
        class: true
      });
      var tr1_nodes = children(tr1);
      td2 = claim_element(tr1_nodes, "TD", {
        class: true
      });
      var td2_nodes = children(td2);
      t10 = claim_text(td2_nodes, t10_value);
      td2_nodes.forEach(detach);
      t11 = claim_space(tr1_nodes);
      td3 = claim_element(tr1_nodes, "TD", {
        class: true
      });
      var td3_nodes = children(td3);
      t12 = claim_text(td3_nodes, t12_value);
      if (if_block) if_block.l(td3_nodes);
      td3_nodes.forEach(detach);
      tr1_nodes.forEach(detach);
      t13 = claim_space(tbody_nodes);
      tr2 = claim_element(tbody_nodes, "TR", {
        class: true
      });
      var tr2_nodes = children(tr2);
      td4 = claim_element(tr2_nodes, "TD", {
        class: true
      });
      var td4_nodes = children(td4);
      t14 = claim_text(td4_nodes, t14_value);
      td4_nodes.forEach(detach);
      t15 = claim_space(tr2_nodes);
      td5 = claim_element(tr2_nodes, "TD", {
        class: true
      });
      var td5_nodes = children(td5);
      t16 = claim_text(td5_nodes, t16_value);
      td5_nodes.forEach(detach);
      tr2_nodes.forEach(detach);
      tbody_nodes.forEach(detach);
      table_nodes.forEach(detach);
      div1_nodes.forEach(detach);
      div2_nodes.forEach(detach);
      div3_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h3, "class", "tooltip-h3 svelte-1ps4wd3");
      toggle_class(h3, "margin-r",
      /*$dir*/
      ctx[7] === "ltr");
      toggle_class(h3, "margin-l",
      /*$dir*/
      ctx[7] === "rtl");
      attr(span, "class", "excess-deaths svelte-1ps4wd3");
      set_style(span, "color",
      /*tooltip*/
      ctx[0].data.percentageExcessDeaths > 60 ? "#FFFFFF" : " #333333");
      set_style(span, "background-color",
      /*tooltip*/
      ctx[0].data.color);
      attr(div0, "class", "tooltip-title svelte-1ps4wd3");
      set_style(div0, "border-color",
      /*tooltip*/
      ctx[0].data.color);
      attr(h4, "class", "tooltip-h4 svelte-1ps4wd3");
      attr(td0, "class", "svelte-1ps4wd3");
      attr(td1, "class", "svelte-1ps4wd3");
      attr(tr0, "class", "svelte-1ps4wd3");
      attr(td2, "class", "svelte-1ps4wd3");
      attr(td3, "class", "svelte-1ps4wd3");
      attr(tr1, "class", "svelte-1ps4wd3");
      attr(td4, "class", "svelte-1ps4wd3");
      attr(td5, "class", "svelte-1ps4wd3");
      attr(tr2, "class", "svelte-1ps4wd3");
      attr(table, "class", "svelte-1ps4wd3");
      attr(div1, "class", "deaths svelte-1ps4wd3");
      attr(div2, "class", "tooltip-content svelte-1ps4wd3");
      attr(div3, "class", "province-tooltip svelte-1ps4wd3");
      set_style(div3, "left",
      /*leftPos*/
      ctx[4] + "px");
      set_style(div3, "top",
      /*topPos*/
      ctx[5] + "px");
      set_style(div3, "max-width",
      /*parentWidth*/
      ctx[1] -
      /*margin*/
      ctx[11].left -
      /*margin*/
      ctx[11].right + "px");
      add_render_callback(() =>
      /*div3_elementresize_handler*/
      ctx[13].call(div3));
    },

    m(target, anchor) {
      insert(target, div3, anchor);
      append(div3, div2);
      append(div2, div0);
      append(div0, h3);
      append(h3, t0);
      append(div0, t1);
      append(div0, span);
      append(span, t2);
      append(div2, t3);
      append(div2, div1);
      append(div1, h4);
      append(h4, t4);
      append(div1, t5);
      append(div1, table);
      append(table, tbody);
      append(tbody, tr0);
      append(tr0, td0);
      append(td0, t6);
      append(tr0, t7);
      append(tr0, td1);
      append(td1, t8);
      append(tbody, t9);
      append(tbody, tr1);
      append(tr1, td2);
      append(td2, t10);
      append(tr1, t11);
      append(tr1, td3);
      append(td3, t12);
      if (if_block) if_block.m(td3, null);
      append(tbody, t13);
      append(tbody, tr2);
      append(tr2, td4);
      append(td4, t14);
      append(tr2, t15);
      append(tr2, td5);
      append(td5, t16);
      div3_resize_listener = add_resize_listener(div3,
      /*div3_elementresize_handler*/
      ctx[13].bind(div3));
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*$t, tooltip*/
      257 && t0_value !== (t0_value =
      /*$t*/
      ctx[8](`province.${cleanProvinceKey(
      /*tooltip*/
      ctx[0].name)}`) + "")) set_data(t0, t0_value);

      if (dirty &
      /*$dir*/
      128) {
        toggle_class(h3, "margin-r",
        /*$dir*/
        ctx[7] === "ltr");
      }

      if (dirty &
      /*$dir*/
      128) {
        toggle_class(h3, "margin-l",
        /*$dir*/
        ctx[7] === "rtl");
      }

      if (dirty &
      /*$n, excessSign, tooltip*/
      577 && t2_value !== (t2_value =
      /*$n*/
      ctx[9](
      /*excessSign*/
      ctx[6] + Math.round(Math.abs(
      /*tooltip*/
      ctx[0].data.percentageExcessDeaths)) + "%") + "")) set_data(t2, t2_value);

      if (dirty &
      /*tooltip*/
      1) {
        set_style(span, "color",
        /*tooltip*/
        ctx[0].data.percentageExcessDeaths > 60 ? "#FFFFFF" : " #333333");
      }

      if (dirty &
      /*tooltip*/
      1) {
        set_style(span, "background-color",
        /*tooltip*/
        ctx[0].data.color);
      }

      if (dirty &
      /*tooltip*/
      1) {
        set_style(div0, "border-color",
        /*tooltip*/
        ctx[0].data.color);
      }

      if (dirty &
      /*$t*/
      256 && t4_value !== (t4_value =
      /*$t*/
      ctx[8]("provincetooltip.deaths") + "")) set_data(t4, t4_value);
      if (dirty &
      /*$t*/
      256 && t6_value !== (t6_value =
      /*$t*/
      ctx[8]("provincetooltip.estimated") + "")) set_data(t6, t6_value);
      if (dirty &
      /*$n, tooltip*/
      513 && t8_value !== (t8_value =
      /*$n*/
      ctx[9](
      /*f*/
      ctx[10](
      /*tooltip*/
      ctx[0].data.estimatedDeaths)) + "")) set_data(t8, t8_value);
      if (dirty &
      /*$t*/
      256 && t10_value !== (t10_value =
      /*$t*/
      ctx[8]("provincetooltip.registered") + "")) set_data(t10, t10_value);
      if (dirty &
      /*$n, tooltip*/
      513 && t12_value !== (t12_value =
      /*$n*/
      ctx[9](
      /*f*/
      ctx[10](
      /*tooltip*/
      ctx[0].data.registeredDeaths)) + "")) set_data(t12, t12_value);
      if (dirty &
      /*$dir, tooltip*/
      129) show_if =
      /*$dir*/
      ctx[7] === "ltr" && /\./.test(
      /*f*/
      ctx[10](
      /*tooltip*/
      ctx[0].data.estimatedDeaths));

      if (show_if) {
        if (if_block) ; else {
          if_block = create_if_block$3();
          if_block.c();
          if_block.m(td3, null);
        }
      } else if (if_block) {
        if_block.d(1);
        if_block = null;
      }

      if (dirty &
      /*$t*/
      256 && t14_value !== (t14_value =
      /*$t*/
      ctx[8]("provincetooltip.excess") + "")) set_data(t14, t14_value);
      if (dirty &
      /*$n, tooltip*/
      513 && t16_value !== (t16_value =
      /*$n*/
      ctx[9](
      /*f*/
      ctx[10](
      /*tooltip*/
      ctx[0].data.meanExcessDeaths)) + "")) set_data(t16, t16_value);

      if (dirty &
      /*leftPos*/
      16) {
        set_style(div3, "left",
        /*leftPos*/
        ctx[4] + "px");
      }

      if (dirty &
      /*topPos*/
      32) {
        set_style(div3, "top",
        /*topPos*/
        ctx[5] + "px");
      }

      if (dirty &
      /*parentWidth*/
      2) {
        set_style(div3, "max-width",
        /*parentWidth*/
        ctx[1] -
        /*margin*/
        ctx[11].left -
        /*margin*/
        ctx[11].right + "px");
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div3);
      if (if_block) if_block.d();
      div3_resize_listener();
    }

  };
}

const yOffset = 15;

function instance$4($$self, $$props, $$invalidate) {
  let leftPos;
  let topPos;
  let excessSign;
  let $dir;
  let $t;
  let $n;
  component_subscribe($$self, dir, $$value => $$invalidate(7, $dir = $$value));
  component_subscribe($$self, t, $$value => $$invalidate(8, $t = $$value));
  component_subscribe($$self, n, $$value => $$invalidate(9, $n = $$value));
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

  function div3_elementresize_handler() {
    width = this.clientWidth;
    height = this.clientHeight;
    $$invalidate(2, width);
    $$invalidate(3, height);
  }

  $$self.$$set = $$props => {
    if ("tooltip" in $$props) $$invalidate(0, tooltip = $$props.tooltip);
    if ("parentWidth" in $$props) $$invalidate(1, parentWidth = $$props.parentWidth);
    if ("parentHeight" in $$props) $$invalidate(12, parentHeight = $$props.parentHeight);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*parentWidth, width, tooltip*/
    7) {
       $$invalidate(4, leftPos = Math.min(parentWidth - width - margin.right, Math.max(margin.left, tooltip.pos[0] - width / 2)));
    }

    if ($$self.$$.dirty &
    /*tooltip, parentHeight, height*/
    4105) {
       $$invalidate(5, topPos = tooltip.pos[1] + (parentHeight / 2 < tooltip.pos[1] ? -height - yOffset / 2 : yOffset));
    }

    if ($$self.$$.dirty &
    /*tooltip*/
    1) {
       $$invalidate(6, excessSign = tooltip.data.percentageExcessDeaths >= 0 ? "+" : "-");
    }
  };

  return [tooltip, parentWidth, width, height, leftPos, topPos, excessSign, $dir, $t, $n, f, margin, parentHeight, div3_elementresize_handler];
}

class ProvinceTooltip extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1ps4wd3-style")) add_css$3();
    init(this, options, instance$4, create_fragment$4, safe_not_equal, {
      tooltip: 0,
      parentWidth: 1,
      parentHeight: 12
    });
  }

}

/* src/components/Map.svelte generated by Svelte v3.31.2 */
const {
  Map: Map_1
} = globals;

function add_css$4() {
  var style = element("style");
  style.id = "svelte-683pbc-style";
  style.textContent = ".map-wrapper.svelte-683pbc{position:relative;flex:1;display:flex;justify-content:center;width:100%;overflow:hidden}";
  append(document.head, style);
}

function get_each_context$2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[16] = list[i];
  return child_ctx;
} // (69:2) {#if (width > 0)}


function create_if_block_1$2(ctx) {
  let svg;
  let each_blocks = [];
  let each_1_lookup = new Map_1();
  let each_1_anchor;
  let country;
  let current;
  let each_value =
  /*provincesGeo*/
  ctx[5];

  const get_key = ctx =>
  /*provinceGeo*/
  ctx[16].id;

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context$2(ctx, each_value, i);
    let key = get_key(child_ctx);
    each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
  }

  country = new Country({
    props: {
      geo:
      /*countryGeo*/
      ctx[4]
    }
  });
  let if_block =
  /*provinceTooltip*/
  ctx[6] && create_if_block_2$1(ctx);
  return {
    c() {
      svg = svg_element("svg");

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      each_1_anchor = empty();
      create_component(country.$$.fragment);
      if (if_block) if_block.c();
      this.h();
    },

    l(nodes) {
      svg = claim_element(nodes, "svg", {
        width: true,
        height: true
      }, 1);
      var svg_nodes = children(svg);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(svg_nodes);
      }

      each_1_anchor = empty();
      claim_component(country.$$.fragment, svg_nodes);
      if (if_block) if_block.l(svg_nodes);
      svg_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(svg, "width",
      /*width*/
      ctx[2]);
      attr(svg, "height",
      /*height*/
      ctx[3]);
    },

    m(target, anchor) {
      insert(target, svg, anchor);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(svg, null);
      }

      append(svg, each_1_anchor);
      mount_component(country, svg, null);
      if (if_block) if_block.m(svg, null);
      current = true;
    },

    p(ctx, dirty) {
      if (dirty &
      /*provincesGeo, data, handleProvinceHovered*/
      161) {
        each_value =
        /*provincesGeo*/
        ctx[5];
        group_outros();
        each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, svg, outro_and_destroy_block, create_each_block$2, each_1_anchor, get_each_context$2);
        check_outros();
      }

      const country_changes = {};
      if (dirty &
      /*countryGeo*/
      16) country_changes.geo =
      /*countryGeo*/
      ctx[4];
      country.$set(country_changes);

      if (
      /*provinceTooltip*/
      ctx[6]) {
        if (if_block) {
          if_block.p(ctx, dirty);

          if (dirty &
          /*provinceTooltip*/
          64) {
            transition_in(if_block, 1);
          }
        } else {
          if_block = create_if_block_2$1(ctx);
          if_block.c();
          transition_in(if_block, 1);
          if_block.m(svg, null);
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
      4) {
        attr(svg, "width",
        /*width*/
        ctx[2]);
      }

      if (!current || dirty &
      /*height*/
      8) {
        attr(svg, "height",
        /*height*/
        ctx[3]);
      }
    },

    i(local) {
      if (current) return;

      for (let i = 0; i < each_value.length; i += 1) {
        transition_in(each_blocks[i]);
      }

      transition_in(country.$$.fragment, local);
      transition_in(if_block);
      current = true;
    },

    o(local) {
      for (let i = 0; i < each_blocks.length; i += 1) {
        transition_out(each_blocks[i]);
      }

      transition_out(country.$$.fragment, local);
      transition_out(if_block);
      current = false;
    },

    d(detaching) {
      if (detaching) detach(svg);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }

      destroy_component(country);
      if (if_block) if_block.d();
    }

  };
} // (74:6) {#each provincesGeo as provinceGeo (provinceGeo.id)}


function create_each_block$2(key_1, ctx) {
  let first;
  let province;
  let current;

  function func(...args) {
    return (
      /*func*/
      ctx[12](
      /*provinceGeo*/
      ctx[16], ...args)
    );
  }

  province = new Province({
    props: {
      geo:
      /*provinceGeo*/
      ctx[16],
      data:
      /*data*/
      ctx[0].find(func)
    }
  });
  province.$on("provincehovered",
  /*handleProvinceHovered*/
  ctx[7]);
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
      32) province_changes.geo =
      /*provinceGeo*/
      ctx[16];
      if (dirty &
      /*data, provincesGeo*/
      33) province_changes.data =
      /*data*/
      ctx[0].find(func);
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
} // (84:6) {#if (provinceTooltip)}


function create_if_block_2$1(ctx) {
  let province;
  let current;
  province = new Province({
    props: {
      geo:
      /*provincesGeo*/
      ctx[5].find(
      /*func_1*/
      ctx[13]),
      isHovered: true
    }
  });
  return {
    c() {
      create_component(province.$$.fragment);
    },

    l(nodes) {
      claim_component(province.$$.fragment, nodes);
    },

    m(target, anchor) {
      mount_component(province, target, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const province_changes = {};
      if (dirty &
      /*provincesGeo, provinceTooltip*/
      96) province_changes.geo =
      /*provincesGeo*/
      ctx[5].find(
      /*func_1*/
      ctx[13]);
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
      destroy_component(province, detaching);
    }

  };
} // (92:2) {#if (provinceTooltip)}


function create_if_block$4(ctx) {
  let provincetooltip;
  let current;
  provincetooltip = new ProvinceTooltip({
    props: {
      tooltip:
      /*provinceTooltip*/
      ctx[6],
      parentWidth:
      /*width*/
      ctx[2],
      parentHeight:
      /*height*/
      ctx[3]
    }
  });
  return {
    c() {
      create_component(provincetooltip.$$.fragment);
    },

    l(nodes) {
      claim_component(provincetooltip.$$.fragment, nodes);
    },

    m(target, anchor) {
      mount_component(provincetooltip, target, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const provincetooltip_changes = {};
      if (dirty &
      /*provinceTooltip*/
      64) provincetooltip_changes.tooltip =
      /*provinceTooltip*/
      ctx[6];
      if (dirty &
      /*width*/
      4) provincetooltip_changes.parentWidth =
      /*width*/
      ctx[2];
      if (dirty &
      /*height*/
      8) provincetooltip_changes.parentHeight =
      /*height*/
      ctx[3];
      provincetooltip.$set(provincetooltip_changes);
    },

    i(local) {
      if (current) return;
      transition_in(provincetooltip.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(provincetooltip.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      destroy_component(provincetooltip, detaching);
    }

  };
}

function create_fragment$5(ctx) {
  let div;
  let t;
  let div_resize_listener;
  let current;
  let if_block0 =
  /*width*/
  ctx[2] > 0 && create_if_block_1$2(ctx);
  let if_block1 =
  /*provinceTooltip*/
  ctx[6] && create_if_block$4(ctx);
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
      attr(div, "class", "map-wrapper svelte-683pbc");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[14].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block0) if_block0.m(div, null);
      append(div, t);
      if (if_block1) if_block1.m(div, null);
      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[14].bind(div));
      /*div_binding*/

      ctx[15](div);
      current = true;
    },

    p(ctx, [dirty]) {
      if (
      /*width*/
      ctx[2] > 0) {
        if (if_block0) {
          if_block0.p(ctx, dirty);

          if (dirty &
          /*width*/
          4) {
            transition_in(if_block0, 1);
          }
        } else {
          if_block0 = create_if_block_1$2(ctx);
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
      /*provinceTooltip*/
      ctx[6]) {
        if (if_block1) {
          if_block1.p(ctx, dirty);

          if (dirty &
          /*provinceTooltip*/
          64) {
            transition_in(if_block1, 1);
          }
        } else {
          if_block1 = create_if_block$4(ctx);
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

      ctx[15](null);
    }

  };
}

function instance$5($$self, $$props, $$invalidate) {
  let height;
  let {
    featuresCountry
  } = $$props;
  let {
    featuresProvinces
  } = $$props;
  let {
    data
  } = $$props;
  let {
    maxHeight = 600
  } = $$props;
  let wrapper;
  let width = 0;
  let geoPath, countryGeo, provincesGeo;
  let provinceTooltip = null;

  function handleProvinceHovered(e) {
    if (!e.detail) {
      $$invalidate(6, provinceTooltip = null);
      return;
    }

    const {
      pos,
      name
    } = e.detail;

    if (provinceTooltip && provinceTooltip.name === name) {
      $$invalidate(6, provinceTooltip = { ...provinceTooltip,
        pos
      });
    } else {
      $$invalidate(6, provinceTooltip = {
        data: data.find(d => d.province === name),
        name,
        pos
      });
    }
  }

  const func = (provinceGeo, d) => d.province === provinceGeo.nameEn;

  const func_1 = d => d.nameEn === provinceTooltip.name;

  function div_elementresize_handler() {
    width = this.clientWidth;
    $$invalidate(2, width);
  }

  function div_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      wrapper = $$value;
      $$invalidate(1, wrapper);
    });
  }

  $$self.$$set = $$props => {
    if ("featuresCountry" in $$props) $$invalidate(8, featuresCountry = $$props.featuresCountry);
    if ("featuresProvinces" in $$props) $$invalidate(9, featuresProvinces = $$props.featuresProvinces);
    if ("data" in $$props) $$invalidate(0, data = $$props.data);
    if ("maxHeight" in $$props) $$invalidate(10, maxHeight = $$props.maxHeight);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*maxHeight, width*/
    1028) {
       $$invalidate(3, height = Math.min(maxHeight, width));
    }

    if ($$self.$$.dirty &
    /*wrapper, featuresProvinces, width, height, featuresCountry, geoPath*/
    2830) {
       if (wrapper) {
        $$invalidate(11, geoPath = createGeoPath(featuresProvinces, width, height));
        $$invalidate(4, countryGeo = featuresCountry.map(d => ({
          path: geoPath(d)
        }))[0]);
        $$invalidate(5, provincesGeo = featuresProvinces.map((d, i) => ({
          id: i,
          nameEn: cleanProvinceName(d.properties.name),
          nameAr: d.properties.name_ar,
          path: geoPath(d),
          feature: d
        })));
      }
    }
  };

  return [data, wrapper, width, height, countryGeo, provincesGeo, provinceTooltip, handleProvinceHovered, featuresCountry, featuresProvinces, maxHeight, geoPath, func, func_1, div_elementresize_handler, div_binding];
}

class Map$1 extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-683pbc-style")) add_css$4();
    init(this, options, instance$5, create_fragment$5, safe_not_equal, {
      featuresCountry: 8,
      featuresProvinces: 9,
      data: 0,
      maxHeight: 10
    });
  }

}

/* src/components/CountrySummary.svelte generated by Svelte v3.31.2 */

function add_css$5() {
  var style = element("style");
  style.id = "svelte-qm4c43-style";
  style.textContent = ".country-summary.svelte-qm4c43{display:flex;justify-content:center;width:100%;padding:0 0.4em;font-size:1.2em}p.svelte-qm4c43{color:#444444}";
  append(document.head, style);
}

function create_fragment$6(ctx) {
  let div;
  let p;
  let t0_value =
  /*$t*/
  ctx[2]("countrysummary.description") + "";
  let t0;
  let t1;
  let t2_value =
  /*$n*/
  ctx[3](
  /*f*/
  ctx[4](
  /*totalExcessDeaths*/
  ctx[0])) + "";
  let t2;
  let t3;
  let t4_value =
  /*$n*/
  ctx[3](Math.round(
  /*totalPercentageExcessDeaths*/
  ctx[1])) + "";
  let t4;
  let t5_value =
  /*$t*/
  ctx[2]("signs.percent") + "";
  let t5;
  let t6;
  return {
    c() {
      div = element("div");
      p = element("p");
      t0 = text(t0_value);
      t1 = space();
      t2 = text(t2_value);
      t3 = text(" (+");
      t4 = text(t4_value);
      t5 = text(t5_value);
      t6 = text(")");
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true
      });
      var div_nodes = children(div);
      p = claim_element(div_nodes, "P", {
        class: true
      });
      var p_nodes = children(p);
      t0 = claim_text(p_nodes, t0_value);
      t1 = claim_space(p_nodes);
      t2 = claim_text(p_nodes, t2_value);
      t3 = claim_text(p_nodes, " (+");
      t4 = claim_text(p_nodes, t4_value);
      t5 = claim_text(p_nodes, t5_value);
      t6 = claim_text(p_nodes, ")");
      p_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(p, "class", "svelte-qm4c43");
      attr(div, "class", "country-summary svelte-qm4c43");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, t0);
      append(p, t1);
      append(p, t2);
      append(p, t3);
      append(p, t4);
      append(p, t5);
      append(p, t6);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*$t*/
      4 && t0_value !== (t0_value =
      /*$t*/
      ctx[2]("countrysummary.description") + "")) set_data(t0, t0_value);
      if (dirty &
      /*$n, totalExcessDeaths*/
      9 && t2_value !== (t2_value =
      /*$n*/
      ctx[3](
      /*f*/
      ctx[4](
      /*totalExcessDeaths*/
      ctx[0])) + "")) set_data(t2, t2_value);
      if (dirty &
      /*$n, totalPercentageExcessDeaths*/
      10 && t4_value !== (t4_value =
      /*$n*/
      ctx[3](Math.round(
      /*totalPercentageExcessDeaths*/
      ctx[1])) + "")) set_data(t4, t4_value);
      if (dirty &
      /*$t*/
      4 && t5_value !== (t5_value =
      /*$t*/
      ctx[2]("signs.percent") + "")) set_data(t5, t5_value);
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);
    }

  };
}

function instance$6($$self, $$props, $$invalidate) {
  let totalExcessDeaths;
  let totalEstimatedDeaths;
  let totalPercentageExcessDeaths;
  let $t;
  let $n;
  component_subscribe($$self, t, $$value => $$invalidate(2, $t = $$value));
  component_subscribe($$self, n, $$value => $$invalidate(3, $n = $$value));
  let {
    data = []
  } = $$props;
  const f = format(",");

  $$self.$$set = $$props => {
    if ("data" in $$props) $$invalidate(5, data = $$props.data);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*data*/
    32) {
       $$invalidate(0, totalExcessDeaths = data.reduce((acc, cur) => acc + cur.meanExcessDeaths, 0));
    }

    if ($$self.$$.dirty &
    /*data*/
    32) {
       $$invalidate(6, totalEstimatedDeaths = data.reduce((acc, cur) => acc + cur.estimatedDeaths, 0));
    }

    if ($$self.$$.dirty &
    /*totalExcessDeaths, totalEstimatedDeaths*/
    65) {
       $$invalidate(1, totalPercentageExcessDeaths = 100 * totalExcessDeaths / totalEstimatedDeaths);
    }
  };

  return [totalExcessDeaths, totalPercentageExcessDeaths, $t, $n, f, data, totalEstimatedDeaths];
}

class CountrySummary extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-qm4c43-style")) add_css$5();
    init(this, options, instance$6, create_fragment$6, safe_not_equal, {
      data: 5
    });
  }

}

/* src/components/Credits.svelte generated by Svelte v3.31.2 */

function add_css$6() {
  var style = element("style");
  style.id = "svelte-xuz95c-style";
  style.textContent = ".credit.svelte-xuz95c{display:flex;justify-content:center;width:100%;padding:0.3em 0.5em}p.svelte-xuz95c{color:gray;font-size:0.8em}a.svelte-xuz95c{color:gray}";
  append(document.head, style);
} // (9:2) {#if (credit)}


function create_if_block$5(ctx) {
  let p;
  let t0_value =
  /*credit*/
  ctx[0].content[
  /*$locale*/
  ctx[2]] + "";
  let t0;
  let t1;
  let if_block =
  /*showLink*/
  ctx[1] && create_if_block_1$3(ctx);
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
      attr(p, "class", "svelte-xuz95c");
    },

    m(target, anchor) {
      insert(target, p, anchor);
      append(p, t0);
      append(p, t1);
      if (if_block) if_block.m(p, null);
    },

    p(ctx, dirty) {
      if (dirty &
      /*credit, $locale*/
      5 && t0_value !== (t0_value =
      /*credit*/
      ctx[0].content[
      /*$locale*/
      ctx[2]] + "")) set_data(t0, t0_value);

      if (
      /*showLink*/
      ctx[1]) {
        if (if_block) {
          if_block.p(ctx, dirty);
        } else {
          if_block = create_if_block_1$3(ctx);
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
} // (11:4) {#if (showLink)}


function create_if_block_1$3(ctx) {
  let a;
  let t_1_value =
  /*$t*/
  ctx[3]("countrysummary.link") + "";
  let t_1;
  let a_href_value;
  return {
    c() {
      a = element("a");
      t_1 = text(t_1_value);
      this.h();
    },

    l(nodes) {
      a = claim_element(nodes, "A", {
        href: true,
        target: true,
        class: true
      });
      var a_nodes = children(a);
      t_1 = claim_text(a_nodes, t_1_value);
      a_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(a, "href", a_href_value =
      /*credit*/
      ctx[0].link);
      attr(a, "target", "_blank");
      attr(a, "class", "svelte-xuz95c");
    },

    m(target, anchor) {
      insert(target, a, anchor);
      append(a, t_1);
    },

    p(ctx, dirty) {
      if (dirty &
      /*$t*/
      8 && t_1_value !== (t_1_value =
      /*$t*/
      ctx[3]("countrysummary.link") + "")) set_data(t_1, t_1_value);

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

function create_fragment$7(ctx) {
  let div;
  let if_block =
  /*credit*/
  ctx[0] && create_if_block$5(ctx);
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
      attr(div, "class", "credit svelte-xuz95c");
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
          if_block = create_if_block$5(ctx);
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
  let $locale;
  let $t;
  component_subscribe($$self, locale$1, $$value => $$invalidate(2, $locale = $$value));
  component_subscribe($$self, t, $$value => $$invalidate(3, $t = $$value));
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

  return [credit, showLink, $locale, $t];
}

class Credits extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-xuz95c-style")) add_css$6();
    init(this, options, instance$7, create_fragment$7, safe_not_equal, {
      credit: 0,
      showLink: 1
    });
  }

}

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

const hcl1 = [{
  startDomain: -Infinity,
  endDomain: 5,
  color: '#f2f2f2'
}, {
  startDomain: 5,
  endDomain: 15,
  color: '#FFFFC8'
}, {
  startDomain: 15,
  endDomain: 25,
  color: '#FEEAB4'
}, {
  startDomain: 25,
  endDomain: 35,
  color: '#F6CC97'
}, {
  startDomain: 35,
  endDomain: 45,
  color: '#EBA97C'
}, {
  startDomain: 45,
  endDomain: 55,
  color: '#DD8068'
}, {
  startDomain: 55,
  endDomain: 65,
  color: '#CC505F'
}, {
  startDomain: 65,
  endDomain: 75,
  color: '#B00A60'
}, {
  startDomain: 75,
  endDomain: 85,
  color: '#850059'
}];

const createColorArrayFromData = (data, defaultColor, format) => {
  return {
    data,
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
}; // export const redArray = createColorArray(
//   '#F4E7AD',
//   hcl(12, 90, 30),
//   '#d2d3f7',
//   [
//     [-Infinity, 5],
//     [5, 20],
//     [20, 40],
//     [40, 60],
//     [60, Infinity]
//   ],
//   (value) => `${value}%`);


const redArray = createColorArrayFromData(hcl1, '#d2d3f7', value => `+${value}%`);
createColorArray('#f2f2f2', '#323bdb', '#d2d3f7', [[-Infinity, 5], [5, 20], [20, 35], [35, 50], [50, 65], [65, Infinity]], value => `${value}%`);
const createRadiusScale = (width, height, data, mapVariable) => {
  const minDim = Math.min(width, height);
  const scale = linear$1().domain([5, max(data, d => d[mapVariable])]).range([minDim / 40, minDim / 20]);
  return scale;
};

/* src/Component.svelte generated by Svelte v3.31.2 */
const {
  document: document_1
} = globals;

function add_css$7() {
  var style = element("style");
  style.id = "svelte-1jbqfkv-style";
  style.textContent = "*{margin:0;padding:0;box-sizing:border-box}.component-wrapper.svelte-1jbqfkv{display:flex;flex-direction:column;width:100%;height:100%;font-family:'Open Sans', sans-serif;font-size:var(--fontSize);overflow:hidden}";
  append(document_1.head, style);
} // (94:2) {#if (seasonData && seasonData.length && country && provinces && dictionary && credits)}


function create_if_block$6(ctx) {
  let seasonselector;
  let t0;
  let legend;
  let t1;
  let t2;
  let countrysummary;
  let t3;
  let if_block1_anchor;
  let current;
  seasonselector = new SeasonSelector({
    props: {
      seasons:
      /*seasons*/
      ctx[9],
      selectedSeason:
      /*selectedSeason*/
      ctx[3],
      selectable:
      /*showSeasonSelector*/
      ctx[0]
    }
  });
  seasonselector.$on("seasonselected",
  /*handleSeasonSelected*/
  ctx[10]);
  legend = new Legend({
    props: {
      colorArray:
      /*colorArray*/
      ctx[4],
      everySecondLabelOnly: true
    }
  });
  let if_block0 =
  /*provinces*/
  ctx[5] &&
  /*provinces*/
  ctx[5].features && create_if_block_2$2(ctx);
  countrysummary = new CountrySummary({
    props: {
      data:
      /*seasonData*/
      ctx[8]
    }
  });
  let if_block1 =
  /*credits*/
  ctx[7] && create_if_block_1$4(ctx);
  return {
    c() {
      create_component(seasonselector.$$.fragment);
      t0 = space();
      create_component(legend.$$.fragment);
      t1 = space();
      if (if_block0) if_block0.c();
      t2 = space();
      create_component(countrysummary.$$.fragment);
      t3 = space();
      if (if_block1) if_block1.c();
      if_block1_anchor = empty();
    },

    l(nodes) {
      claim_component(seasonselector.$$.fragment, nodes);
      t0 = claim_space(nodes);
      claim_component(legend.$$.fragment, nodes);
      t1 = claim_space(nodes);
      if (if_block0) if_block0.l(nodes);
      t2 = claim_space(nodes);
      claim_component(countrysummary.$$.fragment, nodes);
      t3 = claim_space(nodes);
      if (if_block1) if_block1.l(nodes);
      if_block1_anchor = empty();
    },

    m(target, anchor) {
      mount_component(seasonselector, target, anchor);
      insert(target, t0, anchor);
      mount_component(legend, target, anchor);
      insert(target, t1, anchor);
      if (if_block0) if_block0.m(target, anchor);
      insert(target, t2, anchor);
      mount_component(countrysummary, target, anchor);
      insert(target, t3, anchor);
      if (if_block1) if_block1.m(target, anchor);
      insert(target, if_block1_anchor, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const seasonselector_changes = {};
      if (dirty &
      /*seasons*/
      512) seasonselector_changes.seasons =
      /*seasons*/
      ctx[9];
      if (dirty &
      /*selectedSeason*/
      8) seasonselector_changes.selectedSeason =
      /*selectedSeason*/
      ctx[3];
      if (dirty &
      /*showSeasonSelector*/
      1) seasonselector_changes.selectable =
      /*showSeasonSelector*/
      ctx[0];
      seasonselector.$set(seasonselector_changes);
      const legend_changes = {};
      if (dirty &
      /*colorArray*/
      16) legend_changes.colorArray =
      /*colorArray*/
      ctx[4];
      legend.$set(legend_changes);

      if (
      /*provinces*/
      ctx[5] &&
      /*provinces*/
      ctx[5].features) {
        if (if_block0) {
          if_block0.p(ctx, dirty);

          if (dirty &
          /*provinces*/
          32) {
            transition_in(if_block0, 1);
          }
        } else {
          if_block0 = create_if_block_2$2(ctx);
          if_block0.c();
          transition_in(if_block0, 1);
          if_block0.m(t2.parentNode, t2);
        }
      } else if (if_block0) {
        group_outros();
        transition_out(if_block0, 1, 1, () => {
          if_block0 = null;
        });
        check_outros();
      }

      const countrysummary_changes = {};
      if (dirty &
      /*seasonData*/
      256) countrysummary_changes.data =
      /*seasonData*/
      ctx[8];
      countrysummary.$set(countrysummary_changes);

      if (
      /*credits*/
      ctx[7]) {
        if (if_block1) {
          if_block1.p(ctx, dirty);

          if (dirty &
          /*credits*/
          128) {
            transition_in(if_block1, 1);
          }
        } else {
          if_block1 = create_if_block_1$4(ctx);
          if_block1.c();
          transition_in(if_block1, 1);
          if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
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
      transition_in(seasonselector.$$.fragment, local);
      transition_in(legend.$$.fragment, local);
      transition_in(if_block0);
      transition_in(countrysummary.$$.fragment, local);
      transition_in(if_block1);
      current = true;
    },

    o(local) {
      transition_out(seasonselector.$$.fragment, local);
      transition_out(legend.$$.fragment, local);
      transition_out(if_block0);
      transition_out(countrysummary.$$.fragment, local);
      transition_out(if_block1);
      current = false;
    },

    d(detaching) {
      destroy_component(seasonselector, detaching);
      if (detaching) detach(t0);
      destroy_component(legend, detaching);
      if (detaching) detach(t1);
      if (if_block0) if_block0.d(detaching);
      if (detaching) detach(t2);
      destroy_component(countrysummary, detaching);
      if (detaching) detach(t3);
      if (if_block1) if_block1.d(detaching);
      if (detaching) detach(if_block1_anchor);
    }

  };
} // (105:4) {#if (provinces && provinces.features)}


function create_if_block_2$2(ctx) {
  let map;
  let current;
  map = new Map$1({
    props: {
      featuresCountry:
      /*country*/
      ctx[6].features,
      featuresProvinces:
      /*provinces*/
      ctx[5].features,
      data:
      /*seasonData*/
      ctx[8]
    }
  });
  return {
    c() {
      create_component(map.$$.fragment);
    },

    l(nodes) {
      claim_component(map.$$.fragment, nodes);
    },

    m(target, anchor) {
      mount_component(map, target, anchor);
      current = true;
    },

    p(ctx, dirty) {
      const map_changes = {};
      if (dirty &
      /*country*/
      64) map_changes.featuresCountry =
      /*country*/
      ctx[6].features;
      if (dirty &
      /*provinces*/
      32) map_changes.featuresProvinces =
      /*provinces*/
      ctx[5].features;
      if (dirty &
      /*seasonData*/
      256) map_changes.data =
      /*seasonData*/
      ctx[8];
      map.$set(map_changes);
    },

    i(local) {
      if (current) return;
      transition_in(map.$$.fragment, local);
      current = true;
    },

    o(local) {
      transition_out(map.$$.fragment, local);
      current = false;
    },

    d(detaching) {
      destroy_component(map, detaching);
    }

  };
} // (115:4) {#if (credits)}


function create_if_block_1$4(ctx) {
  let credits_1;
  let current;
  credits_1 = new Credits({
    props: {
      credit:
      /*credits*/
      ctx[7].find(
      /*func*/
      ctx[23]),
      showLink: true
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
      /*credits, selectedSeason*/
      136) credits_1_changes.credit =
      /*credits*/
      ctx[7].find(
      /*func*/
      ctx[23]);
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

function create_fragment$8(ctx) {
  let div;
  let div_resize_listener;
  let current;
  let if_block =
  /*seasonData*/
  ctx[8] &&
  /*seasonData*/
  ctx[8].length &&
  /*country*/
  ctx[6] &&
  /*provinces*/
  ctx[5] &&
  /*dictionary*/
  ctx[1] &&
  /*credits*/
  ctx[7] && create_if_block$6(ctx);
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
      ctx[2] / 30)) + "px");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[24].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block) if_block.m(div, null);
      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[24].bind(div));
      current = true;
    },

    p(ctx, [dirty]) {
      if (
      /*seasonData*/
      ctx[8] &&
      /*seasonData*/
      ctx[8].length &&
      /*country*/
      ctx[6] &&
      /*provinces*/
      ctx[5] &&
      /*dictionary*/
      ctx[1] &&
      /*credits*/
      ctx[7]) {
        if (if_block) {
          if_block.p(ctx, dirty);

          if (dirty &
          /*seasonData, country, provinces, dictionary, credits*/
          482) {
            transition_in(if_block, 1);
          }
        } else {
          if_block = create_if_block$6(ctx);
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
      4) {
        set_style(div, "--fontSize", Math.min(16, Math.max(8,
        /*width*/
        ctx[2] / 30)) + "px");
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

function instance$8($$self, $$props, $$invalidate) {
  let colorArray;
  let radiusScale;
  let seasonData;
  let seasons;
  let $dir;
  component_subscribe($$self, dir, $$value => $$invalidate(21, $dir = $$value));
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
    creditsPath
  } = $$props;
  let {
    season = "Summer"
  } = $$props;
  let {
    showSeasonSelector = true
  } = $$props;
  let {
    mapVariable = "percentageExcessDeaths"
  } = $$props;
  let {
    language = "en"
  } = $$props;
  let {
    dictionaryPath
  } = $$props;
  let {
    direction = null
  } = $$props;
  const years = {
    winter: "year20192020",
    spring: "year2020",
    summer: "year2020"
  };
  let data = [];
  let provinces, country, dictionary, credits;
  let width = 0;
  let selectedSeason;

  function handleSeasonSelected(e) {
    $$invalidate(3, selectedSeason = e.detail);
  }

  onMount(() => {
    $$invalidate(3, selectedSeason = season);
  });

  const func = d => d.seasons.includes(selectedSeason);

  function div_elementresize_handler() {
    width = this.offsetWidth;
    $$invalidate(2, width);
  }

  $$self.$$set = $$props => {
    if ("dataPath" in $$props) $$invalidate(11, dataPath = $$props.dataPath);
    if ("countryPath" in $$props) $$invalidate(12, countryPath = $$props.countryPath);
    if ("provincesPath" in $$props) $$invalidate(13, provincesPath = $$props.provincesPath);
    if ("creditsPath" in $$props) $$invalidate(14, creditsPath = $$props.creditsPath);
    if ("season" in $$props) $$invalidate(15, season = $$props.season);
    if ("showSeasonSelector" in $$props) $$invalidate(0, showSeasonSelector = $$props.showSeasonSelector);
    if ("mapVariable" in $$props) $$invalidate(16, mapVariable = $$props.mapVariable);
    if ("language" in $$props) $$invalidate(17, language = $$props.language);
    if ("dictionaryPath" in $$props) $$invalidate(18, dictionaryPath = $$props.dictionaryPath);
    if ("direction" in $$props) $$invalidate(19, direction = $$props.direction);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*dataPath*/
    2048) {
       tsv$1(dataPath, d => {
        const percentageExcessDeaths = +d["Percentage excess death"];
        return {
          year: +d.year,
          season: d.season,
          registeredDeaths: +d["Actual death (NOCR)"],
          estimatedDeaths: +d["Estimated death (regression)"],
          meanExcessDeaths: +d["Excess deaths (mean)"],
          percentageExcessDeaths,
          province: d.Province,
          significant: Math.abs(percentageExcessDeaths) >= 5
        };
      }).then(r => $$invalidate(20, data = r));
    }

    if ($$self.$$.dirty &
    /*countryPath*/
    4096) {
       fetch(countryPath).then(r => r.json()).then(r => $$invalidate(6, country = r));
    }

    if ($$self.$$.dirty &
    /*provincesPath*/
    8192) {
       fetch(provincesPath).then(r => r.json()).then(r => $$invalidate(5, provinces = r));
    }

    if ($$self.$$.dirty &
    /*dictionaryPath*/
    262144) {
       fetch(dictionaryPath).then(r => r.json()).then(r => $$invalidate(1, dictionary = r));
    }

    if ($$self.$$.dirty &
    /*creditsPath*/
    16384) {
       fetch(creditsPath).then(r => r.json()).then(r => $$invalidate(7, credits = r));
    }

    if ($$self.$$.dirty &
    /*dictionary*/
    2) {
       dict.set(dictionary);
    }

    if ($$self.$$.dirty &
    /*language*/
    131072) {
       locale$1.set(language);
    }

    if ($$self.$$.dirty &
    /*direction, $dir*/
    2621440) {
       if (!direction || direction === "") document.dir = $dir;
    }

    if ($$self.$$.dirty &
    /*width, data, mapVariable*/
    1114116) {
       $$invalidate(22, radiusScale = createRadiusScale(width, width, data, mapVariable));
    }

    if ($$self.$$.dirty &
    /*data, selectedSeason, colorArray, mapVariable, radiusScale*/
    5308440) {
       $$invalidate(8, seasonData = data.filter(d => d.season === selectedSeason).map(d => ({ ...d,
        province: cleanProvinceName(d.province),
        color: colorArray.color(d[mapVariable]),
        r: radiusScale(d[mapVariable])
      })));
    }

    if ($$self.$$.dirty &
    /*data*/
    1048576) {
       $$invalidate(9, seasons = [...new Set(data.map(d => d.season))].map((d, i) => ({
        id: i,
        name: d,
        year: years[d.toLowerCase()]
      })));
    }
  };

   $$invalidate(4, colorArray = redArray);

  return [showSeasonSelector, dictionary, width, selectedSeason, colorArray, provinces, country, credits, seasonData, seasons, handleSeasonSelected, dataPath, countryPath, provincesPath, creditsPath, season, mapVariable, language, dictionaryPath, direction, data, $dir, radiusScale, func, div_elementresize_handler];
}

class Component extends SvelteComponent {
  constructor(options) {
    super();
    if (!document_1.getElementById("svelte-1jbqfkv-style")) add_css$7();
    init(this, options, instance$8, create_fragment$8, safe_not_equal, {
      dataPath: 11,
      countryPath: 12,
      provincesPath: 13,
      creditsPath: 14,
      season: 15,
      showSeasonSelector: 0,
      mapVariable: 16,
      language: 17,
      dictionaryPath: 18,
      direction: 19
    });
  }

}

export default Component;
