'use strict';

const electron = require('electron');
const storage = require('electron-json-storage');
const ipcMain  = require('electron').ipcMain;

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const WINDOW_STATE = 'settings.windowState';

let mainWindow;

function createWindow () {
  storage.get(WINDOW_STATE, function(err, bounds) {
    if (err) {
      console.log(error);
      return app.quit();
    }

    bounds = bounds || { width: 800, height: 600 };
    bounds.title = "Waffle Desktop";
    bounds.show = false;
    bounds.backgroundColor = '#dfdfdf';
    mainWindow = new BrowserWindow(bounds);
    if (bounds.maximized) {
      mainWindow.maximize();
    }

    mainWindow.loadURL(`file://${__dirname}/index.html`);

    ipcMain.on('showMainWindow', function() {
      mainWindow.show();
    });
    ipcMain.on('hideMainWindow', function() {
      mainWindow.hide();
    });
    ipcMain.on('unreadCount', function(evt, unread) {
      app.dock.setBadge(unread > 0 ? '' + unread : '');
    });
    ipcMain.on('bounceDock', function() {
      app.dock.bounce();
    });
    ipcMain.on('crash', function(evt, reason) {
      console.error('crashed due to timeout: ' + reason);
      if (process.env.NODE_ENV !== 'development') {
        app.quit();
      }
    });

    mainWindow.on('close', function () {
      var bounds = mainWindow.getBounds();
      storage.set(WINDOW_STATE, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: mainWindow.isMaximized()
      });
    });
    mainWindow.on('closed', function () {
      mainWindow = null;
    });
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
