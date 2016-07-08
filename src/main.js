'use strict';

const _ = require('lodash');
const electron = require('electron');
const storage = require('electron-json-storage');
const ipcMain  = require('electron').ipcMain;

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const WINDOW_STATE = 'windowState';

let mainWindow;

function createWindow () {
  storage.get(WINDOW_STATE, function(err, bounds) {
    if (err) bounds = null;

    var defaults = {
      width: 800,
      height: 600,
      show: false,
      backgroundColor: '#DFDFDF',
      title: 'Waffle Desktop'
    };

    mainWindow = new BrowserWindow(defaults);

    if (bounds) {
      mainWindow.setBounds(_.defaults(bounds, defaults));
    }

    if (bounds && bounds.maximized) {
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

    var windows = [];
    ipcMain.on('newWindow', function(e) {
      var child = new BrowserWindow(mainWindow.getBounds());
      child.loadURL(`file://${__dirname}/index.html`);
      windows.push(child);
    });

    ipcMain.on('crash', function(evt, reason) {
      console.error('crashed due to timeout: ' + reason);
      if (process.env.NODE_ENV !== 'development') {
        app.quit();
      }
    });

    mainWindow.on('close', function () {
      bounds = mainWindow.getBounds();
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
