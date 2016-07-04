const storage = require('electron-json-storage');
const remote = require('electron').remote;
const Menu = remote.Menu;
const MenuItem = remote.MenuItem;

function Window() {
  this.appName = 'Waffle Desktop';
  this.visible = false;
  this.initialLocation = false;
  this.webview = null;
  this.settings = {};
}

Window.prototype.init = function() {
  let self = this;
  this.getSettings().then(function(settings) {
    self.webview = document.getElementById('webview');
    self.setApplicationMenu(settings);
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
    self.get('lastViewed').then(function(value) {
      var url = value && value.url;
      if (!self.initialLocation && url && url !== currentUrl) {
        self.initialLocation = true;
        self.webview.loadURL(value.url);
      }
      return self.injectSettings();
    });
  });

  this.webview.addEventListener('did-stop-loading', function() {
    if (!self.visible) return;
    var currentUrl = self.webview.getURL();
    self.set('lastViewed', { url: currentUrl });
  });

  this.webview.addEventListener('did-stop-loading', function() {
    const indicator = document.querySelector('.loading');
    self.webview.style.visibility = 'visible';
    setTimeout(function() {
      self.visible = true;
      indicator.style.display = 'none';
    }, 500);
  });
};

Window.prototype.set = function(key, value) {
  return new Promise((resolve, reject) => {
    storage.set(key, value, function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

Window.prototype.get = function(key) {
  return new Promise((resolve, reject) => {
    storage.get(key, function(err, value) {
      if (err) return reject(err);
      resolve(value);
    });
  });
};

Window.prototype.getSettings = function() {
  return new Promise((resolve, reject) => {
    let self = this;
    this.get('settings').then(function(settings) {
      settings = settings || {};
      settings.dnd = settings.dnd || { checked: false };
      settings.mute = settings.mute || { checked: true };
      self.settings = settings;
      resolve(settings);
    }).catch(reject);
  });
};

Window.prototype.changeSetting = function(name, value) {
  return new Promise((resolve, reject) => {
    let self = this;
    this.getSettings().then(function(settings) {
      settings[name] = value;
      storage.set('settings', settings, function(err) {
        if (err) return reject(err);
        self.injectSettings().then(resolve).catch(reject);
      });
    }).catch(reject);
  });
};

Window.prototype.injectSettings = function() {
  return new Promise((resolve, reject) => {
    let self = this;

    if (!this.webview) return resolve();

    storage.get('settings', function(err, settings) {
      if (err) return reject(err);
      var data = JSON.stringify(settings);
      var script = "window.WaffleDesktop = JSON.parse('" +  data + "');";
      self.webview.executeJavaScript(script, function() {
        resolve();
      });
    });
  });
};

Window.prototype.setApplicationMenu = function(settings) {
  let self = this;
  let appMenu = Menu.buildFromTemplate([
    {
      label: this.appName,
      submenu: [
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
            if (focusedWindow)
              focusedWindow.reload();
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: (function() {
            if (process.platform == 'darwin')
              return 'Ctrl+Command+F';
            else
              return 'F11';
          })(),
          click: function(item, focusedWindow) {
            if (focusedWindow)
              focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
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
    {
      label: 'Settings',
      submenu: [
        {
          type: 'checkbox',
          label: 'Mute sounds',
          checked: !!settings.mute.checked,
          click() {
            var mute = settings.mute;
            mute.checked = !mute.checked;
            self.changeSetting('mute', mute);
          }
        },
        {
          type: 'checkbox',
          label: 'Disable notifications',
          checked: !!settings.dnd.checked,
          click() {
            var dnd = settings.dnd;
            dnd.checked = !dnd.checked;
            self.changeSetting('dnd', dnd);
          }
        }
      ]
    },
  ]);

  Menu.setApplicationMenu(appMenu);
};

/**
 * On window load
 */

onload = () => {
  var w = new Window();
  w.init();
};
