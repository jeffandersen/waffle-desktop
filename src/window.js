const storage = require('electron-json-storage');
const electron = require('electron');
const request = require('request');
const semver = require('semver');
const url = require('url');
const remote = electron.remote;
const shell = electron.shell;
const Menu = remote.Menu;
const MenuItem = remote.MenuItem;
const ipc = electron.ipcRenderer;

const packageJson = require('../package.json');
const notification = require('./notification');

function WaffleDesktop(opts) {
  opts = opts || {};
  this.appName = 'Waffle Desktop';
  this.ready = false;
  this.initialLocation = false;
  this.webview = null;
  this.projectsList = [];
  this.returnBtn = opts.returnBtn;
  this.settings = new Settings();
}

/**
 * Initialize application menu and start listening for events
 */
WaffleDesktop.prototype.init = function() {
  let self = this;
  this.settings.get().then(function(settings) {
    self.webview = document.getElementById('webview');
    self.setApplicationMenu();
    self.listen();
  }).then(function() {
    return self.checkForUpdate();
  }).catch(function(err) {
    throw err;
  });
};

WaffleDesktop.prototype.navigate = function(url) {
  if (!this.webview) return;
  this.webview.loadURL(url);
};

/**
 * Listen to events inside the webview
 */
WaffleDesktop.prototype.listen = function() {
  let self = this;

  if (!this.webview) return;

  // Events from other threads
  this.webview.addEventListener('ipc-message', this.handleMessage.bind(this));

  // Webview dom is ready
  this.webview.addEventListener('dom-ready', function() {
    var currentUrl = self.webview.getURL();

    // Only open devtools in development
    if (process.env.NODE_ENV === 'development') {
      webview.openDevTools();
    }

    // Load last viewed location
    self.loadLastViewed();
  });

  this.webview.addEventListener('did-stop-loading', function() {
    if (!self.ready) return;

    // Only store location when at waffle.io
    if (self.withinWaffle()) {
      var currentUrl = self.webview.getURL();
      self.settings.set('lastViewed', { url: currentUrl });
      self.returnBtn.style.display = 'none';
    } else {
      self.returnBtn.style.display = 'block';
    }
  });

  this.webview.addEventListener('did-stop-loading', function() {
    self.ready = true;
  });

  // Listen for new window request
  this.webview.addEventListener('new-window', function(e) {
    const protocol = require('url').parse(e.url).protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      if (self.withinWaffle(e.url)) {
        return self.navigate(e.url);
      }
      shell.openExternal(e.url);
    }
  });

  this.returnBtn.onclick = function() {
    self.navigate('https://waffle.io');
    self.returnBtn.style.display = 'none';
  };
};

/**
 * Handle inbound message from another thread
 *
 * @param {object} v - Event
 */
WaffleDesktop.prototype.handleMessage = function(v) {
  switch (v.channel) {
    case 'projectsList':
      this.projectsList = v.args[0];
      this.setApplicationMenu();
    break;
    case 'currentLocation':
      this.settings.set('lastViewed', { url: v.args[0] });
    break;
    case 'currentProject':
      this.setTitle(v.args[0]);
    break;
  }
};

/**
 * Set the application window title
 *
 * @param {string} title
 */
WaffleDesktop.prototype.setTitle = function(title) {
  var defaultTitle = this.appName;
  title = title || defaultTitle;

  if (!this.withinWaffle()) {
    title = defaultTitle;
  } else {
    title = title.indexOf('undefined/undefined') > -1? defaultTitle : title;
  }

  document.title = title;
};

/**
 * Check for update against last published version
 */
WaffleDesktop.prototype.checkForUpdate = function() {
  return new Promise((resolve) => {
    var self = this;
    request({
      method: 'GET',
      url: 'http://waffledesktop.com/latest.json',
      json: true,
    }, function(err, res) {
      if (res && res.statusCode === 200 && res.body) {
        self.latestVersion = res.body.version;

        // Only notify of new version
        if (semver.gt(self.latestVersion, packageJson.version)) {
          return self.settings.get('notifiedUpdates').then(function(versions) {
            versions = versions || [];
            // Only notify once
            if (versions.indexOf(self.latestVersion) === -1) {
              versions.push(self.latestVersion);
              self.updateNotification(self.latestVersion, res.body.downloadUrl);
              return self.settings.set('notifiedUpdates', versions);
            }
          });
        }
      }
      resolve();
    });
  });
};

/**
 * Send notification of update available
 *
 * @param {string} latestVersion - Semver of newest version
 * @param {string} url - Download url
 */
WaffleDesktop.prototype.updateNotification = function(latestVersion, url) {
  if (this.hasNotifiedUpdate) return;
  var self = this;

  this.hasNotifiedUpdate = true;

  return setTimeout(function() {
    return notification.send('Update available', body, {
      silent: false,
      dockBounce: true,
      onclick: function() {
        self.webview.loadURL(url);
      }
    });
  }, 5 * 1000);
};

/**
 * Determine if webview is viewing a waffle.io page
 *
 * @param {string} url
 */
WaffleDesktop.prototype.withinWaffle = function(url) {
  if (!this.webview) return false;
  var currentUrl = url? url : this.webview.getURL();
  return currentUrl && currentUrl.indexOf('https://waffle.io') === 0;
};

/**
 * Navigate the path within waffle, using pushstate
 *
 * @param {string} path
 */
WaffleDesktop.prototype.navigatePath = function(path) {
  path = path.indexOf('/') === 0? path : '/' + path;

  // Trigger url redirection if not already within waffle.io
  if (!this.withinWaffle()) {
    return self.navigate('https://waffle.io' + path);
  }

  var args = "'" + path + "'";
  var script = "window.WaffleDesktopNotifier.navigateToPath(" + args + ");";
  self.webview.executeJavaScript(script);
};

/**
 * Inject settings information onto the page
 */
WaffleDesktop.prototype.injectSettings = function() {
  return new Promise((resolve, reject) => {
    let self = this;

    if (!this.webview) return resolve();
    if (!this.withinWaffle()) return resolve();

    this.settings.get().then(function(settings) {
      var data = JSON.stringify(settings);
      var script = "window.WaffleDesktop = JSON.parse('" +  data + "');";
      self.webview.executeJavaScript(script, function() {
        resolve();
      });
    }).catch(reject);
  });
};

/**
 * Set application menu in menubar
 */
WaffleDesktop.prototype.setApplicationMenu = function() {
  let self = this;
  let appMenu = Menu.buildFromTemplate([
    {
      label: this.appName,
      submenu: [
        {
          label: 'Go Home',
          click: function() {
            if (!self.webview) return;
            self.navigate('https://waffle.io');
          }
        },
        {
          label: 'Go to Github',
          click: function() {
            if (!self.webview) return;
            self.navigate('https://github.com');
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
      label: 'Projects',
      submenu: (function() {
        var list;
        if (self.projectsList.length < 1) {
          list = [
            {
              label: 'Loading...',
              enabled: false
            }
          ];
        } else {
          list = self.projectsList.map(function(proj, i) {
            return {
              label: proj.lowerCaseName,
              accelerator: 'Cmd+' + (i + 1),
              click() {
                self.navigatePath('/' + proj.lowerCaseName);
              },
              // TODO support deciding which are visible
              visible: i <= 8
            }
          });
        }

        return [
          {
            label: 'New window',
            accelerator: 'Command+N',
            click() {
              ipc.send('newWindow');
            }
          },
          {
            type: 'separator'
          },
        ].concat(list);
      })()
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          selector: "undo:"
        },
        {
          label: "Redo",
          accelerator: "Shift+CmdOrCtrl+Z",
          selector: "redo:"
        },
        {
          type: "separator"
        },
        {
          label: "Cut",
          accelerator: "CmdOrCtrl+X",
          selector: "cut:"
        },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          selector: "copy:"
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          selector: "paste:"
        },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:"
        }
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

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    appMenu.popup(remote.getCurrentWindow());
  }, false);

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
 * Restore window to last viewed location
 */
WaffleDesktop.prototype.loadLastViewed = function(force) {
  if (!this.webview) return;
  if (!force && !this.withinWaffle()) return;

  var self = this;
  var currentUrl = this.webview.getURL();
  this.settings.get('lastViewed').then(function(value) {
    var url = value && value.url;
    if (!self.initialLocation && url && url !== currentUrl) {
      self.initialLocation = true;
      self.navigate(value.url);
    }
    return self.injectSettings();
  });
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
  var wd = new WaffleDesktop({
    returnBtn: document.getElementById('returnToWaffle')
  });
  wd.init();
};
