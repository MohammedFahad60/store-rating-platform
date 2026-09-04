const { DatabaseSync } = require('node:sqlite');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

function toSqliteValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  return v;
}
function convertNamedParams(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = toSqliteValue(obj[k]);
  }
  return out;
}

function mapErrorCode(e) {
  const msg = e.message || '';
  if (msg.includes('UNIQUE constraint failed')) return 'SQLITE_CONSTRAINT_UNIQUE';
  if (msg.includes('FOREIGN KEY constraint failed')) return 'SQLITE_CONSTRAINT_FOREIGNKEY';
  if (msg.includes('PRIMARY KEY')) return 'SQLITE_CONSTRAINT_PRIMARYKEY';
  if (msg.includes('constraint failed')) return 'SQLITE_CONSTRAINT';
  return e.code;
}

class Statement extends EventEmitter {
  constructor(db, sql) {
    super();
    this.db = db;
    this.sql = sql;
    try {
      this.stmt = db._db.prepare(sql);
    } catch (e) {
      this.error = e;
    }
    this.lastID = undefined;
    this.changes = undefined;
  }
  bind(...args) {
    let callback = args[args.length - 1];
    if (typeof callback === 'function') args.pop();
    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      this.boundParams = convertNamedParams(args[0]);
    } else if (args.length === 1 && Array.isArray(args[0])) {
      this.boundParams = args[0].map(toSqliteValue);
    } else {
      this.boundParams = args.map(toSqliteValue);
      // If single array, keep as array for spreading later
      if (args.length === 1 && Array.isArray(args[0])) this.boundParams = args[0].map(toSqliteValue);
    }
    if (callback) process.nextTick(() => callback.call(this, this.error || null));
    return this;
  }
  run(...args) {
    let callback = typeof args[args.length -1] === 'function' ? args.pop() : null;
    let params = args;
    if (this.boundParams) {
      if (params.length === 0) {
        params = Array.isArray(this.boundParams) ? this.boundParams : [this.boundParams];
        // If boundParams is object, wrap
        if (!Array.isArray(this.boundParams) && typeof this.boundParams === 'object') params = [this.boundParams];
      }
      this.boundParams = null;
    }
    const exec = () => {
      if (this.error) {
        if (callback) callback.call(this, this.error);
        return;
      }
      try {
        let result;
        if (params.length === 0) {
          result = this.stmt.run();
        } else if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          result = this.stmt.run(convertNamedParams(params[0]));
        } else if (params.length === 1 && Array.isArray(params[0])) {
          result = this.stmt.run(...params[0].map(toSqliteValue));
        } else {
          result = this.stmt.run(...params.map(toSqliteValue));
        }
        this.lastID = result.lastInsertRowid;
        this.changes = result.changes;
        if (callback) callback.call(this, null);
      } catch (e) {
        e.code = mapErrorCode(e);
        if (callback) callback.call(this, e);
      }
    };
    process.nextTick(exec);
    return this;
  }
  get(...args) {
    let callback = typeof args[args.length -1] === 'function' ? args.pop() : null;
    let params = args;
    if (this.boundParams) {
      if (params.length === 0) {
        params = Array.isArray(this.boundParams) ? this.boundParams : [this.boundParams];
        if (!Array.isArray(this.boundParams) && typeof this.boundParams === 'object') params = [this.boundParams];
      }
      this.boundParams = null;
    }
    const exec = () => {
      if (this.error) {
        if (callback) callback.call(this, this.error, null);
        return;
      }
      try {
        let row;
        if (params.length === 0) row = this.stmt.get();
        else if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) row = this.stmt.get(convertNamedParams(params[0]));
        else if (params.length === 1 && Array.isArray(params[0])) row = this.stmt.get(...params[0].map(toSqliteValue));
        else row = this.stmt.get(...params.map(toSqliteValue));
        if (callback) callback.call(this, null, row || undefined);
      } catch (e) {
        e.code = mapErrorCode(e);
        if (callback) callback.call(this, e);
      }
    };
    process.nextTick(exec);
    return this;
  }
  all(...args) {
    let callback = typeof args[args.length -1] === 'function' ? args.pop() : null;
    let params = args;
    if (this.boundParams) {
      if (params.length === 0) {
        params = Array.isArray(this.boundParams) ? this.boundParams : [this.boundParams];
        if (!Array.isArray(this.boundParams) && typeof this.boundParams === 'object') params = [this.boundParams];
      }
      this.boundParams = null;
    }
    const exec = () => {
      if (this.error) {
        if (callback) callback.call(this, this.error, null);
        return;
      }
      try {
        let rows;
        if (params.length === 0) rows = this.stmt.all();
        else if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) rows = this.stmt.all(convertNamedParams(params[0]));
        else if (params.length === 1 && Array.isArray(params[0])) rows = this.stmt.all(...params[0].map(toSqliteValue));
        else rows = this.stmt.all(...params.map(toSqliteValue));
        if (callback) callback.call(this, null, rows);
      } catch (e) {
        e.code = mapErrorCode(e);
        if (callback) callback.call(this, e);
      }
    };
    process.nextTick(exec);
    return this;
  }
  each(...args) {
    let callback = args[0];
    let complete = args[1];
    if (typeof callback !== 'function') callback = () => {};
    if (typeof complete !== 'function' && typeof args[1] === 'function') complete = args[1];
    this.all((err, rows) => {
      if (err) {
        if (complete) complete(err);
        return;
      }
      for (const row of rows) callback.call(this, null, row);
      if (complete) complete.call(this, null, rows.length);
    });
    return this;
  }
  finalize(callback) {
    if (callback) process.nextTick(() => callback.call(this, null));
    return this;
  }
  reset(callback) {
    if (callback) process.nextTick(() => callback.call(this, null));
    return this;
  }
}

class Database extends EventEmitter {
  constructor(filename, mode, callback) {
    super();
    if (typeof filename === 'function') {
      callback = filename;
      filename = ':memory:';
      mode = undefined;
    } else if (typeof mode === 'function') {
      callback = mode;
      mode = undefined;
    }
    this.filename = filename || ':memory:';
    this.mode = mode;
    this.open = false;
    if (this.filename !== ':memory:' && this.filename !== '' && mode !== undefined) {
      try {
        const dir = path.dirname(this.filename);
        if (dir && dir !== '.' && dir !== '/') fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
    }
    try {
      this._db = new DatabaseSync(this.filename);
      this.open = true;
      if (callback) process.nextTick(() => callback.call(this, null));
      process.nextTick(() => this.emit('open'));
    } catch (e) {
      e.code = mapErrorCode(e);
      if (callback) process.nextTick(() => callback.call(this, e));
      else throw e;
    }
  }
  close(callback) {
    try {
      if (this._db) this._db.close();
      this.open = false;
      if (callback) process.nextTick(() => callback.call(this, null));
      this.emit('close');
    } catch (e) {
      if (callback) process.nextTick(() => callback.call(this, e));
    }
  }
  configure(option, value) {}
  serialize(callback) { if (callback) callback(); }
  parallelize(callback) { if (callback) callback(); }
  exec(sql, callback) {
    if (typeof sql !== 'string') {
      if (callback) process.nextTick(() => callback.call(this, new Error('SQL must be string')));
      return this;
    }
    const exec = () => {
      try {
        this._db.exec(sql);
        if (callback) callback.call(this, null);
      } catch (e) {
        e.code = mapErrorCode(e);
        if (callback) callback.call(this, e);
        else throw e;
      }
    };
    process.nextTick(exec);
    return this;
  }
  prepare(sql, ...args) {
    let callback;
    if (args.length && typeof args[args.length-1] === 'function') callback = args.pop();
    let params = args;
    const stmt = new Statement(this, sql);
    if (params.length > 0) {
      if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) stmt.bind(convertNamedParams(params[0]), callback);
      else if (params.length === 1 && Array.isArray(params[0])) stmt.bind(...params[0].map(toSqliteValue), callback);
      else stmt.bind(...params.map(toSqliteValue), callback);
      return stmt;
    }
    if (callback) process.nextTick(() => callback.call(stmt, stmt.error || null));
    return stmt;
  }
  run(sql, ...args) {
    let callback = typeof args[args.length-1] === 'function' ? args.pop() : undefined;
    let params = args;
    const stmt = new Statement(this, sql);
    if (stmt.error) {
      if (callback) process.nextTick(() => callback.call(stmt, stmt.error));
      return this;
    }
    if (params.length === 0) stmt.run(callback);
    else if (params.length === 1 && (Array.isArray(params[0]) || (typeof params[0] === 'object' && params[0] !== null))) {
      const p = params[0];
      if (Array.isArray(p)) {
        if (/\$\d/.test(sql)) {
          const obj = {};
          p.forEach((v,i) => obj[`$${i+1}`] = toSqliteValue(v));
          stmt.run(obj, callback);
        } else stmt.run(...p.map(toSqliteValue), callback);
      } else stmt.run(convertNamedParams(p), callback);
    } else stmt.run(...params.map(toSqliteValue), callback);
    return this;
  }
  get(sql, ...args) {
    let callback = typeof args[args.length-1] === 'function' ? args.pop() : undefined;
    let params = args;
    const stmt = new Statement(this, sql);
    if (stmt.error) {
      if (callback) process.nextTick(() => callback.call(stmt, stmt.error));
      return this;
    }
    if (params.length === 0) stmt.get(callback);
    else if (params.length === 1 && (Array.isArray(params[0]) || typeof params[0] === 'object')) {
      const p = params[0];
      if (Array.isArray(p)) {
        if (/\$\d/.test(sql)) {
          const obj = {};
          p.forEach((v,i) => obj[`$${i+1}`] = toSqliteValue(v));
          stmt.get(obj, callback);
        } else stmt.get(...p.map(toSqliteValue), callback);
      } else stmt.get(convertNamedParams(p), callback);
    } else stmt.get(...params.map(toSqliteValue), callback);
    return this;
  }
  all(sql, ...args) {
    let callback = typeof args[args.length-1] === 'function' ? args.pop() : undefined;
    let params = args;
    const stmt = new Statement(this, sql);
    if (stmt.error) {
      if (callback) process.nextTick(() => callback.call(stmt, stmt.error));
      return this;
    }
    if (params.length === 0) stmt.all(callback);
    else if (params.length === 1 && (Array.isArray(params[0]) || (typeof params[0] === 'object' && params[0] !== null))) {
      const p = params[0];
      if (Array.isArray(p)) {
        if (/\$\d/.test(sql)) {
          const obj = {};
          p.forEach((v,i) => obj[`$${i+1}`] = toSqliteValue(v));
          stmt.all(obj, callback);
        } else stmt.all(...p.map(toSqliteValue), callback);
      } else stmt.all(convertNamedParams(p), callback);
    } else stmt.all(...params.map(toSqliteValue), callback);
    return this;
  }
  each(sql, ...args) {
    let callback = args[0];
    let complete = args[1];
    if (typeof callback !== 'function') callback = () => {};
    this.all(sql, ...args.slice(1), (err, rows) => {
      if (err) { if (complete) complete(err); return; }
      for (const row of rows) callback(null, row);
      if (complete) complete(null, rows.length);
    });
    return this;
  }
  map(sql, ...args) {
    let callback = args.pop();
    this.all(sql, ...args, (err, rows) => {
      if (err) return callback(err);
      const result = {};
      if (rows.length) {
        const keys = Object.keys(rows[0]);
        const key = keys[0];
        if (keys.length > 2) {
          for (const row of rows) result[row[key]] = row;
        } else {
          const value = keys[1];
          for (const row of rows) result[row[key]] = row[value];
        }
      }
      callback(err, result);
    });
    return this;
  }
}

class Backup extends EventEmitter {
  constructor(db, filename, dest, source, isDest, callback) {
    super();
    if (typeof callback === 'function') process.nextTick(() => callback(null));
  }
  step(n, callback) { if (callback) process.nextTick(() => callback(null)); return this; }
  finish(callback) { if (callback) process.nextTick(() => callback(null)); return this; }
  close(callback) { if (callback) process.nextTick(() => callback(null)); return this; }
}

const sqlite3 = {
  Database,
  Statement,
  Backup,
  OPEN_READONLY: 1,
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4,
  OPEN_URI: 0x40,
  OPEN_MEMORY: 0x80,
  OPEN_SHAREDCACHE: 0x00020000,
  OPEN_PRIVATECACHE: 0x00040000,
  OPEN_FULLMUTEX: 0x00010000,
  cached: {
    Database: function(file, a, b) {
      if (file === '' || file === ':memory:') return new Database(file,a,b);
      let db;
      file = path.resolve(file);
      if (!sqlite3.cached.objects[file]) {
        db = sqlite3.cached.objects[file] = new Database(file,a,b);
      } else {
        db = sqlite3.cached.objects[file];
        const callback = (typeof a === 'number') ? b : a;
        if (typeof callback === 'function') {
          function cb() { callback.call(db, null); }
          if (db.open) process.nextTick(cb);
          else db.once('open', cb);
        }
      }
      return db;
    },
    objects: {}
  },
  verbose: function() { return sqlite3; },
  LIMIT_LENGTH: 1,
  LIMIT_SQL_LENGTH: 2,
  LIMIT_COLUMN: 3,
  LIMIT_EXPR_DEPTH: 4,
  LIMIT_COMPOUND_SELECT: 5,
  LIMIT_VDBE_OP: 6,
  LIMIT_FUNCTION_ARG: 7,
  LIMIT_ATTACHED: 8,
  LIMIT_LIKE_PATTERN_LENGTH: 9,
  LIMIT_VARIABLE_NUMBER: 10,
  LIMIT_TRIGGER_DEPTH: 11,
  LIMIT_WORKER_THREADS: 12,
};

module.exports = sqlite3;
