const storage = require('electron-json-storage');
const electron = require('electron');
const remote = electron.remote;
const shell = electron.shell;
const Menu = remote.Menu;
const MenuItem = remote.MenuItem;

function Window() {
  this.appName = 'Waffle Desktop';
  this.ready = false;
  this.initialLocation = false;
  this.webview = null;
  this.settings = new Settings();
}

Window.prototype.init = function() {
  let self = this;
  this.settings.get().then(function(settings) {
    self.webview = document.getElementById('webview');
    self.setApplicationMenu();
    self.listen();
  }).catch(function(err) {
    throw err;
  });
};

Window.prototype.listen = function() {
  let self = this;

  if (!this.webview) return;

  this.webview.addEventListener('dom-ready', function() {
    var currentUrl = self.webview.getURL();

    // Only open devtools in development
    if (process.env.NODE_ENV === 'development') {
      webview.openDevTools();
    }

    // Load last viewed page
    self.settings.get('lastViewed').then(function(value) {
      var url = value && value.url;
      if (!self.initialLocation && url && url !== currentUrl) {
        self.initialLocation = true;
        self.webview.loadURL(value.url);
      }
      return self.injectSettings();
    });
  });

  this.webview.addEventListener('did-stop-loading', function() {
    if (!self.ready) return;
    var currentUrl = self.webview.getURL();
    self.settings.set('lastViewed', { url: currentUrl });
  });

  this.webview.addEventListener('did-stop-loading', function() {
    self.ready = true;
  });

  this.webview.addEventListener('new-window', function(e) {
    const protocol = require('url').parse(e.url).protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      if (e.url.indexOf('https://waffle.io') === 0) {
        return self.webview.loadURL(e.url);
      }
      shell.openExternal(e.url);
    }
  });
};

Window.prototype.injectSettings = function() {
  return new Promise((resolve, reject) => {
    let self = this;

    if (!this.webview) return resolve();

    this.settings.get().then(function(settings) {
      var data = JSON.stringify(settings);
      var script = "window.WaffleDesktop = JSON.parse('" +  data + "');";
      self.webview.executeJavaScript(script, function() {
        resolve();
      });
    }).catch(reject);
  });
};

Window.prototype.setApplicationMenu = function() {
  let self = this;
  let appMenu = Menu.buildFromTemplate([
    {
      label: this.appName,
      submenu: [
        {
          label: 'Go Home',
          click: function() {
            if (!self.webview) return;
            self.webview.loadURL('https://waffle.io');
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Notifications',
          submenu: [
            {
              type: 'checkbox',
              label: 'Disable notifications',
              checked: self.settings.checked('prefs.dnd'),
              click() {
                return settingToggle('prefs.dnd');
              }
            },
            {
              type: 'checkbox',
              label: 'Mute sounds',
              checked: self.settings.checked('prefs.mute'),
              click() {
                return settingToggle('prefs.mute');
              }
            },
            {
              type: 'separator'
            },
            {
              type: 'checkbox',
              label: 'Disable Dock Badge',
              checked: self.settings.checked('prefs.dockBadge'),
              click() {
                return settingToggle('prefs.dockBadge');
              }
            },
            {
              type: 'checkbox',
              label: 'Disable Dock Bounce',
              checked: self.settings.checked('prefs.dockBounce'),
              click() {
                return self.settingToggle('prefs.dockBounce');
              }
            }
          ]
        },
        {
          type: 'separator'
        },
        {
          role: 'hide',
          label: 'Hide ' + this.appName
        },
        {
          role: 'hideothers'
        },
        {
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          role: 'quit',
          accelerator: "Command+Q",
          label: 'Quit ' + this.appName,
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: (function() {
            if (process.platform == 'darwin') {
              return 'Ctrl+Command+F';
            } else {
              return 'F11';
            }
          })(),
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
      ]
    },
  ]);

  function settingToggle(name, checked) {
    return self.settings.get(name).then(function(val) {
      if (_.isUndefined(checked)) {
        checked = !self.settings.checked(name);
      }
      val.checked = checked;
      return self.settings.set(name, val);
    }).then(function() {
      return self.injectSettings();
    }).then(function() {
      return checked;
    }).catch(function(err) {
      console.error(err.message);
    });
  }

  Menu.setApplicationMenu(appMenu);
};

/**
 * Settings wrapper
 */
function Settings() {
  this._key = 'settings';
  this._values = {};
}

Settings.prototype._retrieve = function() {
  return new Promise((resolve, reject) => {
    var self = this;
    return storage.get(this._key, function(err, values) {
      if (err) {
        return reject(err);
      }
      self._values = values;
      return resolve(values);
    })
  });
};

Settings.prototype.checked = function(path) {
  var checked = _.get(this._values, path + '.checked') === true;
  console.log('path-' + path);
  console.log('checked-' + checked);
  return checked;
};

Settings.prototype.get = function(path) {
  var self = this;
  return this._retrieve().then(function(settings) {
    if (_.isUndefined(path)) {
      return settings;
    }
    return _.get(settings, path);
  });
};

Settings.prototype.set = function(path, value) {
  var self = this;
  return this._retrieve().then(function(settings) {
    settings = _.set(settings, path, value);
    return self._save(settings);
  });
};

Settings.prototype._save = function(values) {
  return new Promise((resolve, reject) => {
    storage.set(this._key, values, function(err) {
      if (err) {
        return reject(err);
      }
      self._values = values;
      resolve(values);
    });
  });
};

/**
 * On window load
 */

onload = () => {
  var w = new Window();
  w.init();
};
