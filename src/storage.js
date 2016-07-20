var storage = exports;

const jsonStore = require('electron-json-storage');

storage.init = function(opts) {
  return new Storage(opts);
};

function Storage(opts) {
  opts = opts || {};
  this._key = opts.key;
  this._values = {};
  this._changed = true;

  if (!this.key) {
    throw new Error('key required');
  }
}

Storage.prototype._save = function() {
  return new Promise((resolve, reject) => {
    return jsonStore.set(this._key, this._values, function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

Storage.prototype._retrieve = function() {
  return new Promise((resolve, reject) => {
    var self = this;
    if (!this._changed) return resolve(this._values);
    return jsonStore.get(this.key, function(err, value) {
      if (err) return reject(err);
      self._values = value;
      self._changed = false;
      return resolve(value);
    });
  });
};

Storage.prototype.set = function(path, value) {
  return new Promise((resolve, reject) => {
    var self = this;
    this._retrieve().then(function() {
      settings = _.set(self._values, path, value);
      return self._save();
    }).then(resolve).catch(reject);
  });
};

Storage.prototype.get = function(path, value) {
  return new Promise((resolve, reject) => {
    this._retrieve().then(function() {
      return _.get(self._values, path);
    }).then(resolve).catch(reject);
  });
};
