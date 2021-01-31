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

var csv = dsvFormat(",");
var csvParse = csv.parse;

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
var csv$1 = dsvParse(csvParse);

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
defaultLocale({
  thousands: ",",
  grouping: [3],
  currency: ["$", ""]
});
function defaultLocale(definition) {
  locale = formatLocale(definition);
  format = locale.format;
  locale.formatPrefix;
  return locale;
}

var epsilon = 1e-6;
var epsilon2 = 1e-12;
var pi = Math.PI;
var halfPi = pi / 2;
var quarterPi = pi / 4;
var tau = pi * 2;
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
      delta = 6 * radians,
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

/* src/components/Title.svelte generated by Svelte v3.31.2 */

function add_css() {
  var style = element("style");
  style.id = "svelte-f7alzo-style";
  style.textContent = ".map-title.svelte-f7alzo{display:flex;flex-direction:column;align-items:center;width:100%;padding:0.3em 0.5em}.title-h2.svelte-f7alzo{margin:0.2em 0;font-size:1.2em;font-weight:bold;color:#333333;text-align:center}";
  append(document.head, style);
}

function create_fragment(ctx) {
  let div;
  let h2;
  let t;
  return {
    c() {
      div = element("div");
      h2 = element("h2");
      t = text("Active beds in hospital wards per 100,000");
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
      t = claim_text(h2_nodes, "Active beds in hospital wards per 100,000");
      h2_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h2, "class", "title-h2 svelte-f7alzo");
      attr(div, "class", "map-title svelte-f7alzo");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, h2);
      append(h2, t);
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
    if (!document.getElementById("svelte-f7alzo-style")) add_css();
    init(this, options, null, create_fragment, safe_not_equal, {});
  }

}

/* src/components/Legend.svelte generated by Svelte v3.31.2 */

function add_css$1() {
  var style = element("style");
  style.id = "svelte-yxj9a6-style";
  style.textContent = ".legend.svelte-yxj9a6{width:67%;margin:0.8em auto 0 auto;color:#333333}.colors.svelte-yxj9a6{display:flex;width:100%;height:1em}.color-tick.svelte-yxj9a6{height:100%;border-right:0.1em solid #333333}.color-tick.svelte-yxj9a6:first-child{border-left:0.1em solid #333333}.color-tick.gray-border.svelte-yxj9a6:not(:last-of-type){border-right-color:#DDD}.color-tick.gray-border.svelte-yxj9a6:last-of-type{border:none}.color.svelte-yxj9a6{height:67%}.labels.svelte-yxj9a6{display:flex;width:100%;height:1em}.legend-label.svelte-yxj9a6{display:inline-block;font-size:0.8em;transform:translate(-50%, 0)}";
  append(document.head, style);
}

function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[5] = list[i].endDomain;
  child_ctx[7] = i;
  return child_ctx;
}

function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[8] = list[i].color;
  child_ctx[9] = list[i].startDomain;
  child_ctx[7] = i;
  return child_ctx;
} // (15:4) {#each colorArray.data as { color, startDomain }


function create_each_block_1(key_1, ctx) {
  let div1;
  let div0;
  let t;
  let div1_style_value;
  return {
    key: key_1,
    first: null,

    c() {
      div1 = element("div");
      div0 = element("div");
      t = space();
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
      t = claim_space(div1_nodes);
      div1_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div0, "class", "color svelte-yxj9a6");
      set_style(div0, "background-color",
      /*color*/
      ctx[8]);
      attr(div1, "class", "color-tick svelte-yxj9a6");
      attr(div1, "style", div1_style_value = `width: ${
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3]}px;`);
      toggle_class(div1, "gray-border",
      /*everySecondLabelOnly*/
      ctx[1] &&
      /*i*/
      ctx[7] % 2 === 0);
      this.first = div1;
    },

    m(target, anchor) {
      insert(target, div1, anchor);
      append(div1, div0);
      append(div1, t);
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;

      if (dirty &
      /*colorArray*/
      1) {
        set_style(div0, "background-color",
        /*color*/
        ctx[8]);
      }

      if (dirty &
      /*width, numColors*/
      12 && div1_style_value !== (div1_style_value = `width: ${
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3]}px;`)) {
        attr(div1, "style", div1_style_value);
      }

      if (dirty &
      /*everySecondLabelOnly, colorArray*/
      3) {
        toggle_class(div1, "gray-border",
        /*everySecondLabelOnly*/
        ctx[1] &&
        /*i*/
        ctx[7] % 2 === 0);
      }
    },

    d(detaching) {
      if (detaching) detach(div1);
    }

  };
} // (44:6) {#if (!everySecondLabelOnly || (i % 2 === 1))}


function create_if_block(ctx) {
  let span;
  let t_value =
  /*colorArray*/
  ctx[0].format(
  /*endDomain*/
  ctx[5]) + "";
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
      attr(span, "class", "legend-label svelte-yxj9a6");
    },

    m(target, anchor) {
      insert(target, span, anchor);
      append(span, t);
    },

    p(ctx, dirty) {
      if (dirty &
      /*colorArray*/
      1 && t_value !== (t_value =
      /*colorArray*/
      ctx[0].format(
      /*endDomain*/
      ctx[5]) + "")) set_data(t, t_value);
    },

    d(detaching) {
      if (detaching) detach(span);
    }

  };
} // (39:4) {#each colorArray.data as { endDomain }


function create_each_block(key_1, ctx) {
  let div;
  let t;
  let if_block = (!
  /*everySecondLabelOnly*/
  ctx[1] ||
  /*i*/
  ctx[7] % 2 === 1) && create_if_block(ctx);
  return {
    key: key_1,
    first: null,

    c() {
      div = element("div");
      if (if_block) if_block.c();
      t = space();
      this.h();
    },

    l(nodes) {
      div = claim_element(nodes, "DIV", {
        class: true,
        style: true
      });
      var div_nodes = children(div);
      if (if_block) if_block.l(div_nodes);
      t = claim_space(div_nodes);
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
      append(div, t);
    },

    p(new_ctx, dirty) {
      ctx = new_ctx;

      if (!
      /*everySecondLabelOnly*/
      ctx[1] ||
      /*i*/
      ctx[7] % 2 === 1) {
        if (if_block) {
          if_block.p(ctx, dirty);
        } else {
          if_block = create_if_block(ctx);
          if_block.c();
          if_block.m(div, t);
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
}

function create_fragment$1(ctx) {
  let div3;
  let div0;
  let each_blocks_1 = [];
  let each0_lookup = new Map();
  let div0_resize_listener;
  let t0;
  let div2;
  let div1;
  let span;
  let t1_value =
  /*colorArray*/
  ctx[0].format(
  /*colorArray*/
  ctx[0].data[0].startDomain) + "";
  let t1;
  let t2;
  let each_blocks = [];
  let each1_lookup = new Map();
  let each_value_1 =
  /*colorArray*/
  ctx[0].data;

  const get_key = ctx =>
  /*startDomain*/
  ctx[9];

  for (let i = 0; i < each_value_1.length; i += 1) {
    let child_ctx = get_each_context_1(ctx, each_value_1, i);
    let key = get_key(child_ctx);
    each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
  }

  let each_value =
  /*colorArray*/
  ctx[0].data;

  const get_key_1 = ctx =>
  /*endDomain*/
  ctx[5];

  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context(ctx, each_value, i);
    let key = get_key_1(child_ctx);
    each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
  }

  return {
    c() {
      div3 = element("div");
      div0 = element("div");

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].c();
      }

      t0 = space();
      div2 = element("div");
      div1 = element("div");
      span = element("span");
      t1 = text(t1_value);
      t2 = space();

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }

      this.h();
    },

    l(nodes) {
      div3 = claim_element(nodes, "DIV", {
        class: true
      });
      var div3_nodes = children(div3);
      div0 = claim_element(div3_nodes, "DIV", {
        class: true
      });
      var div0_nodes = children(div0);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].l(div0_nodes);
      }

      div0_nodes.forEach(detach);
      t0 = claim_space(div3_nodes);
      div2 = claim_element(div3_nodes, "DIV", {
        class: true
      });
      var div2_nodes = children(div2);
      div1 = claim_element(div2_nodes, "DIV", {
        class: true,
        style: true
      });
      var div1_nodes = children(div1);
      span = claim_element(div1_nodes, "SPAN", {
        class: true
      });
      var span_nodes = children(span);
      t1 = claim_text(span_nodes, t1_value);
      span_nodes.forEach(detach);
      div1_nodes.forEach(detach);
      t2 = claim_space(div2_nodes);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].l(div2_nodes);
      }

      div2_nodes.forEach(detach);
      div3_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(div0, "class", "colors svelte-yxj9a6");
      add_render_callback(() =>
      /*div0_elementresize_handler*/
      ctx[4].call(div0));
      attr(span, "class", "label");
      attr(div1, "class", "label-container");
      set_style(div1, "width",
      /*width*/
      ctx[2] /
      /*numColors*/
      ctx[3] + "px");
      attr(div2, "class", "labels svelte-yxj9a6");
      attr(div3, "class", "legend svelte-yxj9a6");
    },

    m(target, anchor) {
      insert(target, div3, anchor);
      append(div3, div0);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].m(div0, null);
      }

      div0_resize_listener = add_resize_listener(div0,
      /*div0_elementresize_handler*/
      ctx[4].bind(div0));
      append(div3, t0);
      append(div3, div2);
      append(div2, div1);
      append(div1, span);
      append(span, t1);
      append(div2, t2);

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].m(div2, null);
      }
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*width, numColors, everySecondLabelOnly, colorArray*/
      15) {
        each_value_1 =
        /*colorArray*/
        ctx[0].data;
        each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx, each_value_1, each0_lookup, div0, destroy_block, create_each_block_1, null, get_each_context_1);
      }

      if (dirty &
      /*colorArray*/
      1 && t1_value !== (t1_value =
      /*colorArray*/
      ctx[0].format(
      /*colorArray*/
      ctx[0].data[0].startDomain) + "")) set_data(t1, t1_value);

      if (dirty &
      /*width, numColors*/
      12) {
        set_style(div1, "width",
        /*width*/
        ctx[2] /
        /*numColors*/
        ctx[3] + "px");
      }

      if (dirty &
      /*width, numColors, colorArray, everySecondLabelOnly*/
      15) {
        each_value =
        /*colorArray*/
        ctx[0].data;
        each_blocks = update_keyed_each(each_blocks, dirty, get_key_1, 1, ctx, each_value, each1_lookup, div2, destroy_block, create_each_block, null, get_each_context);
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div3);

      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].d();
      }

      div0_resize_listener();

      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }
    }

  };
}

function instance($$self, $$props, $$invalidate) {
  let numColors;
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

  return [colorArray, everySecondLabelOnly, width, numColors, div0_elementresize_handler];
}

class Legend extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-yxj9a6-style")) add_css$1();
    init(this, options, instance, create_fragment$1, safe_not_equal, {
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
}; // export const createProvinces = (features, width, height) => {
//   const geoPath = createGeoPath(features, width, height);
//   const provinces = features
//     .map(geoPath)
//     .map((d, i) => ({
//       id: i,
//       name: cleanProvinceName(features[i].properties.name),
//       path: d
//     }));
//   return(provinces);
// };

const cleanProvinceName = name => {
  return name.replace('Azarbaijan', 'Azarbayjan').replace('Azerbaijan', 'Azarbayjan').replace('Ardebil', 'Ardabil').replace('Mahall', 'Mahaal').replace('Gilan', 'Gilan (Guilan)').replace('Gholestan', 'Golestan').replace('Hamadan', 'Hamedan').replace('Baluchestan', 'Baluchistan').replace('Kordestan', 'Kurdestan').replace('Buyer Ahmad', 'Boyer-Ahmad').replace('Esfahan', 'Isfahan').replace('Buhshehr', 'Bushehr').replace('Kohkiluyeh and Boyer Ahmad', 'Kohgiluyeh and Boyer-Ahmad').replace('Chaharmahal and Bakhtiari', 'Chahar Mahaal and Bakhtiari');
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


function create_if_block$1(ctx) {
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
    ctx[2]) return create_if_block$1;
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

function instance$2($$self, $$props, $$invalidate) {
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
    init(this, options, instance$2, create_fragment$3, safe_not_equal, {
      geo: 0,
      data: 1,
      isHovered: 2
    });
  }

}

/* src/components/ProvinceTooltip.svelte generated by Svelte v3.31.2 */

function add_css$3() {
  var style = element("style");
  style.id = "svelte-ve6unv-style";
  style.textContent = ".province-tooltip.svelte-ve6unv.svelte-ve6unv{position:absolute;z-index:100;width:42%;min-width:120px;background-color:#FFFFFF;box-shadow:0 1px 2px rgba(0,0,0,0.07), \n                0 2px 4px rgba(0,0,0,0.07), \n                0 4px 8px rgba(0,0,0,0.07)}.tooltip-content.svelte-ve6unv.svelte-ve6unv{width:100%;height:100%;padding:0.4em;color:#333333}.tooltip-title.svelte-ve6unv.svelte-ve6unv{display:flex;align-items:baseline;justify-content:space-between;border-bottom:0.15em solid #333333}.tooltip-h3.svelte-ve6unv.svelte-ve6unv{margin:0;font-size:1.3em;font-weight:normal}.beds.svelte-ve6unv.svelte-ve6unv{width:100%;margin:0.3em 0;font-size:1em}table.svelte-ve6unv.svelte-ve6unv{width:100%;border-collapse:collapse}tr.svelte-ve6unv td.svelte-ve6unv{padding:0.1em 0.2em 0.1em 0}tr.svelte-ve6unv td.svelte-ve6unv:nth-child(2){font-weight:bold;text-align:right;vertical-align:top}";
  append(document.head, style);
}

function create_fragment$4(ctx) {
  let div3;
  let div2;
  let div0;
  let h3;
  let t0_value =
  /*tooltip*/
  ctx[0].name + "";
  let t0;
  let t1;
  let div1;
  let table;
  let tbody;
  let tr;
  let td0;
  let t2;
  let t3;
  let td1;
  let t4_value =
  /*f*/
  ctx[6](
  /*tooltip*/
  ctx[0].data.beds) + "";
  let t4;
  let div3_resize_listener;
  return {
    c() {
      div3 = element("div");
      div2 = element("div");
      div0 = element("div");
      h3 = element("h3");
      t0 = text(t0_value);
      t1 = space();
      div1 = element("div");
      table = element("table");
      tbody = element("tbody");
      tr = element("tr");
      td0 = element("td");
      t2 = text("Beds per 100,000");
      t3 = space();
      td1 = element("td");
      t4 = text(t4_value);
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
      div0_nodes.forEach(detach);
      t1 = claim_space(div2_nodes);
      div1 = claim_element(div2_nodes, "DIV", {
        class: true
      });
      var div1_nodes = children(div1);
      table = claim_element(div1_nodes, "TABLE", {
        class: true
      });
      var table_nodes = children(table);
      tbody = claim_element(table_nodes, "TBODY", {});
      var tbody_nodes = children(tbody);
      tr = claim_element(tbody_nodes, "TR", {
        class: true
      });
      var tr_nodes = children(tr);
      td0 = claim_element(tr_nodes, "TD", {
        class: true
      });
      var td0_nodes = children(td0);
      t2 = claim_text(td0_nodes, "Beds per 100,000");
      td0_nodes.forEach(detach);
      t3 = claim_space(tr_nodes);
      td1 = claim_element(tr_nodes, "TD", {
        class: true
      });
      var td1_nodes = children(td1);
      t4 = claim_text(td1_nodes, t4_value);
      td1_nodes.forEach(detach);
      tr_nodes.forEach(detach);
      tbody_nodes.forEach(detach);
      table_nodes.forEach(detach);
      div1_nodes.forEach(detach);
      div2_nodes.forEach(detach);
      div3_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(h3, "class", "tooltip-h3 svelte-ve6unv");
      attr(div0, "class", "tooltip-title svelte-ve6unv");
      set_style(div0, "border-color",
      /*tooltip*/
      ctx[0].data.color);
      attr(td0, "class", "svelte-ve6unv");
      attr(td1, "class", "svelte-ve6unv");
      attr(tr, "class", "svelte-ve6unv");
      attr(table, "class", "svelte-ve6unv");
      attr(div1, "class", "beds svelte-ve6unv");
      attr(div2, "class", "tooltip-content svelte-ve6unv");
      attr(div3, "class", "province-tooltip svelte-ve6unv");
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
      ctx[7].left -
      /*margin*/
      ctx[7].right + "px");
      add_render_callback(() =>
      /*div3_elementresize_handler*/
      ctx[9].call(div3));
    },

    m(target, anchor) {
      insert(target, div3, anchor);
      append(div3, div2);
      append(div2, div0);
      append(div0, h3);
      append(h3, t0);
      append(div2, t1);
      append(div2, div1);
      append(div1, table);
      append(table, tbody);
      append(tbody, tr);
      append(tr, td0);
      append(td0, t2);
      append(tr, t3);
      append(tr, td1);
      append(td1, t4);
      div3_resize_listener = add_resize_listener(div3,
      /*div3_elementresize_handler*/
      ctx[9].bind(div3));
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*tooltip*/
      1 && t0_value !== (t0_value =
      /*tooltip*/
      ctx[0].name + "")) set_data(t0, t0_value);

      if (dirty &
      /*tooltip*/
      1) {
        set_style(div0, "border-color",
        /*tooltip*/
        ctx[0].data.color);
      }

      if (dirty &
      /*tooltip*/
      1 && t4_value !== (t4_value =
      /*f*/
      ctx[6](
      /*tooltip*/
      ctx[0].data.beds) + "")) set_data(t4, t4_value);

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
        ctx[7].left -
        /*margin*/
        ctx[7].right + "px");
      }
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div3);
      div3_resize_listener();
    }

  };
}

const yOffset = 15;

function instance$3($$self, $$props, $$invalidate) {
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

  function div3_elementresize_handler() {
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

  return [tooltip, parentWidth, width, height, leftPos, topPos, f, margin, parentHeight, div3_elementresize_handler];
}

class ProvinceTooltip extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-ve6unv-style")) add_css$3();
    init(this, options, instance$3, create_fragment$4, safe_not_equal, {
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

function add_css$4() {
  var style = element("style");
  style.id = "svelte-683pbc-style";
  style.textContent = ".map-wrapper.svelte-683pbc{position:relative;flex:1;display:flex;justify-content:center;width:100%;overflow:hidden}";
  append(document.head, style);
}

function get_each_context$1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[16] = list[i];
  return child_ctx;
} // (67:2) {#if (width > 0)}


function create_if_block_1(ctx) {
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
    let child_ctx = get_each_context$1(ctx, each_value, i);
    let key = get_key(child_ctx);
    each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
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
  ctx[6] && create_if_block_2(ctx);
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
        each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, svg, outro_and_destroy_block, create_each_block$1, each_1_anchor, get_each_context$1);
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
          if_block = create_if_block_2(ctx);
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
} // (72:6) {#each provincesGeo as provinceGeo (provinceGeo.id)}


function create_each_block$1(key_1, ctx) {
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
} // (82:6) {#if (provinceTooltip)}


function create_if_block_2(ctx) {
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
} // (90:2) {#if (provinceTooltip)}


function create_if_block$2(ctx) {
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
  ctx[2] > 0 && create_if_block_1(ctx);
  let if_block1 =
  /*provinceTooltip*/
  ctx[6] && create_if_block$2(ctx);
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
          if_block1 = create_if_block$2(ctx);
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

function instance$4($$self, $$props, $$invalidate) {
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
    init(this, options, instance$4, create_fragment$5, safe_not_equal, {
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
  style.id = "svelte-1jppe64-style";
  style.textContent = ".country-summary.svelte-1jppe64{display:flex;justify-content:center;width:100%;padding:0 0.4em;font-size:1.1em}p.svelte-1jppe64{color:#444444}";
  append(document.head, style);
}

function create_fragment$6(ctx) {
  let div;
  let p;
  let t0;
  let t1_value =
  /*f*/
  ctx[1](
  /*data*/
  ctx[0].beds) + "";
  let t1;
  let t2;
  return {
    c() {
      div = element("div");
      p = element("p");
      t0 = text("Whole country: ");
      t1 = text(t1_value);
      t2 = text(" beds per 100,000.");
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
      t0 = claim_text(p_nodes, "Whole country: ");
      t1 = claim_text(p_nodes, t1_value);
      t2 = claim_text(p_nodes, " beds per 100,000.");
      p_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(p, "class", "svelte-1jppe64");
      attr(div, "class", "country-summary svelte-1jppe64");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, t0);
      append(p, t1);
      append(p, t2);
    },

    p(ctx, [dirty]) {
      if (dirty &
      /*data*/
      1 && t1_value !== (t1_value =
      /*f*/
      ctx[1](
      /*data*/
      ctx[0].beds) + "")) set_data(t1, t1_value);
    },

    i: noop,
    o: noop,

    d(detaching) {
      if (detaching) detach(div);
    }

  };
}

function instance$5($$self, $$props, $$invalidate) {
  let {
    data
  } = $$props;
  const f = format(",");

  $$self.$$set = $$props => {
    if ("data" in $$props) $$invalidate(0, data = $$props.data);
  };

  return [data, f];
}

class CountrySummary extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1jppe64-style")) add_css$5();
    init(this, options, instance$5, create_fragment$6, safe_not_equal, {
      data: 0
    });
  }

}

/* src/components/Credits.svelte generated by Svelte v3.31.2 */

function add_css$6() {
  var style = element("style");
  style.id = "svelte-xuz95c-style";
  style.textContent = ".credit.svelte-xuz95c{display:flex;justify-content:center;width:100%;padding:0.3em 0.5em}p.svelte-xuz95c{color:gray;font-size:0.8em}a.svelte-xuz95c{color:gray}";
  append(document.head, style);
} // (8:2) {#if (showLink)}


function create_if_block$3(ctx) {
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
      attr(a, "class", "svelte-xuz95c");
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

function create_fragment$7(ctx) {
  let div;
  let p;
  let t0_value =
  /*credit*/
  ctx[0].content + "";
  let t0;
  let t1;
  let if_block =
  /*showLink*/
  ctx[1] && create_if_block$3(ctx);
  return {
    c() {
      div = element("div");
      p = element("p");
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
      p = claim_element(div_nodes, "P", {
        class: true
      });
      var p_nodes = children(p);
      t0 = claim_text(p_nodes, t0_value);
      t1 = claim_space(p_nodes);
      if (if_block) if_block.l(p_nodes);
      p_nodes.forEach(detach);
      div_nodes.forEach(detach);
      this.h();
    },

    h() {
      attr(p, "class", "svelte-xuz95c");
      attr(div, "class", "credit svelte-xuz95c");
    },

    m(target, anchor) {
      insert(target, div, anchor);
      append(div, p);
      append(p, t0);
      append(p, t1);
      if (if_block) if_block.m(p, null);
    },

    p(ctx, [dirty]) {
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
          if_block = create_if_block$3(ctx);
          if_block.c();
          if_block.m(p, null);
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

function instance$6($$self, $$props, $$invalidate) {
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
    if (!document.getElementById("svelte-xuz95c-style")) add_css$6();
    init(this, options, instance$6, create_fragment$7, safe_not_equal, {
      credit: 0,
      showLink: 1
    });
  }

}

const hcl2 = [{
  startDomain: 80,
  endDomain: 100,
  color: '#FDF6B5'
}, {
  startDomain: 100,
  endDomain: 120,
  color: '#FBE39E'
}, {
  startDomain: 120,
  endDomain: 140,
  color: '#FAD18B'
}, {
  startDomain: 140,
  endDomain: 160,
  color: '#F8BD7B'
}, {
  startDomain: 160,
  endDomain: 180,
  color: '#F6A972'
}, {
  startDomain: 180,
  endDomain: 200,
  color: '#F3946F'
}, {
  startDomain: 200,
  endDomain: 220,
  color: '#EF7E71'
}, {
  startDomain: 220,
  endDomain: 240,
  color: '#E96677'
}, {
  startDomain: 240,
  endDomain: 260,
  color: '#E24C80'
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
};

const blueArray = createColorArrayFromData(hcl2, '#d2d3f7', value => `${value}`);

/* src/Component.svelte generated by Svelte v3.31.2 */

function add_css$7() {
  var style = element("style");
  style.id = "svelte-1jbqfkv-style";
  style.textContent = "*{margin:0;padding:0;box-sizing:border-box}.component-wrapper.svelte-1jbqfkv{display:flex;flex-direction:column;width:100%;height:100%;font-family:'Open Sans', sans-serif;font-size:var(--fontSize);overflow:hidden}";
  append(document.head, style);
} // (51:2) {#if (country && provinces)}


function create_if_block$4(ctx) {
  let title;
  let t0;
  let legend;
  let t1;
  let t2;
  let countrysummary;
  let t3;
  let if_block1_anchor;
  let current;
  title = new Title({});
  legend = new Legend({
    props: {
      colorArray:
      /*colorArray*/
      ctx[0],
      everySecondLabelOnly: true
    }
  });
  let if_block0 =
  /*provinces*/
  ctx[3] &&
  /*provinces*/
  ctx[3].features && create_if_block_2$1(ctx);
  countrysummary = new CountrySummary({
    props: {
      data:
      /*coloredData*/
      ctx[5].find(func_1)
    }
  });
  let if_block1 =
  /*credits*/
  ctx[4] && create_if_block_1$1(ctx);
  return {
    c() {
      create_component(title.$$.fragment);
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
      claim_component(title.$$.fragment, nodes);
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
      mount_component(title, target, anchor);
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
      const legend_changes = {};
      if (dirty &
      /*colorArray*/
      1) legend_changes.colorArray =
      /*colorArray*/
      ctx[0];
      legend.$set(legend_changes);

      if (
      /*provinces*/
      ctx[3] &&
      /*provinces*/
      ctx[3].features) {
        if (if_block0) {
          if_block0.p(ctx, dirty);

          if (dirty &
          /*provinces*/
          8) {
            transition_in(if_block0, 1);
          }
        } else {
          if_block0 = create_if_block_2$1(ctx);
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
      /*coloredData*/
      32) countrysummary_changes.data =
      /*coloredData*/
      ctx[5].find(func_1);
      countrysummary.$set(countrysummary_changes);

      if (
      /*credits*/
      ctx[4]) {
        if (if_block1) {
          if_block1.p(ctx, dirty);

          if (dirty &
          /*credits*/
          16) {
            transition_in(if_block1, 1);
          }
        } else {
          if_block1 = create_if_block_1$1(ctx);
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
      transition_in(title.$$.fragment, local);
      transition_in(legend.$$.fragment, local);
      transition_in(if_block0);
      transition_in(countrysummary.$$.fragment, local);
      transition_in(if_block1);
      current = true;
    },

    o(local) {
      transition_out(title.$$.fragment, local);
      transition_out(legend.$$.fragment, local);
      transition_out(if_block0);
      transition_out(countrysummary.$$.fragment, local);
      transition_out(if_block1);
      current = false;
    },

    d(detaching) {
      destroy_component(title, detaching);
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
} // (57:4) {#if (provinces && provinces.features)}


function create_if_block_2$1(ctx) {
  let map;
  let current;
  map = new Map$1({
    props: {
      featuresCountry:
      /*country*/
      ctx[2].features,
      featuresProvinces:
      /*provinces*/
      ctx[3].features,
      data:
      /*coloredData*/
      ctx[5].filter(func)
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
      4) map_changes.featuresCountry =
      /*country*/
      ctx[2].features;
      if (dirty &
      /*provinces*/
      8) map_changes.featuresProvinces =
      /*provinces*/
      ctx[3].features;
      if (dirty &
      /*coloredData*/
      32) map_changes.data =
      /*coloredData*/
      ctx[5].filter(func);
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
} // (67:4) {#if (credits)}


function create_if_block_1$1(ctx) {
  let credits_1;
  let current;
  credits_1 = new Credits({
    props: {
      credit:
      /*credits*/
      ctx[4],
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
      16) credits_1_changes.credit =
      /*credits*/
      ctx[4];
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
  /*country*/
  ctx[2] &&
  /*provinces*/
  ctx[3] && create_if_block$4(ctx);
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
      ctx[1] / 30)) + "px");
      add_render_callback(() =>
      /*div_elementresize_handler*/
      ctx[11].call(div));
    },

    m(target, anchor) {
      insert(target, div, anchor);
      if (if_block) if_block.m(div, null);
      div_resize_listener = add_resize_listener(div,
      /*div_elementresize_handler*/
      ctx[11].bind(div));
      current = true;
    },

    p(ctx, [dirty]) {
      if (
      /*country*/
      ctx[2] &&
      /*provinces*/
      ctx[3]) {
        if (if_block) {
          if_block.p(ctx, dirty);

          if (dirty &
          /*country, provinces*/
          12) {
            transition_in(if_block, 1);
          }
        } else {
          if_block = create_if_block$4(ctx);
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
      2) {
        set_style(div, "--fontSize", Math.min(16, Math.max(8,
        /*width*/
        ctx[1] / 30)) + "px");
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

const func = d => d.province !== "Whole country";

const func_1 = d => d.province === "Whole country";

function instance$7($$self, $$props, $$invalidate) {
  let colorArray;
  let coloredData;
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
  let width = 0;
  let data = [];
  let country, provinces, credits;

  function div_elementresize_handler() {
    width = this.offsetWidth;
    $$invalidate(1, width);
  }

  $$self.$$set = $$props => {
    if ("dataPath" in $$props) $$invalidate(6, dataPath = $$props.dataPath);
    if ("countryPath" in $$props) $$invalidate(7, countryPath = $$props.countryPath);
    if ("provincesPath" in $$props) $$invalidate(8, provincesPath = $$props.provincesPath);
    if ("creditsPath" in $$props) $$invalidate(9, creditsPath = $$props.creditsPath);
  };

  $$self.$$.update = () => {
    if ($$self.$$.dirty &
    /*dataPath*/
    64) {
       csv$1(dataPath, d => {
        return {
          province: d.Province.trim(),
          beds: +d["Hospital beds per 100,000"]
        };
      }).then(r => $$invalidate(10, data = r));
    }

    if ($$self.$$.dirty &
    /*countryPath*/
    128) {
       fetch(countryPath).then(r => r.json()).then(r => $$invalidate(2, country = r));
    }

    if ($$self.$$.dirty &
    /*provincesPath*/
    256) {
       fetch(provincesPath).then(r => r.json()).then(r => $$invalidate(3, provinces = r));
    }

    if ($$self.$$.dirty &
    /*creditsPath*/
    512) {
       fetch(creditsPath).then(r => r.json()).then(r => $$invalidate(4, credits = r));
    }

    if ($$self.$$.dirty &
    /*data, colorArray*/
    1025) {
       $$invalidate(5, coloredData = data.map(d => ({ ...d,
        province: cleanProvinceName(d.province),
        color: colorArray.color(d.beds)
      })));
    }
  };

   $$invalidate(0, colorArray = blueArray);

  return [colorArray, width, country, provinces, credits, coloredData, dataPath, countryPath, provincesPath, creditsPath, data, div_elementresize_handler];
}

class Component extends SvelteComponent {
  constructor(options) {
    super();
    if (!document.getElementById("svelte-1jbqfkv-style")) add_css$7();
    init(this, options, instance$7, create_fragment$8, safe_not_equal, {
      dataPath: 6,
      countryPath: 7,
      provincesPath: 8,
      creditsPath: 9
    });
  }

}

export default Component;
