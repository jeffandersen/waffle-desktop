'use strict';

const electron = require('electron');
const storage = require('electron-json-storage');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const WINDOW_STATE = 'windowState';

let mainWindow;

function createWindow () {
  storage.get(WINDOW_STATE, function(error, bounds) {
    if (error) throw error;

    bounds = bounds || { width: 800, height: 600 };
    bounds.title = "Waffle Desktop";
    mainWindow = new BrowserWindow(bounds);
    if (bounds.maximized) {
      mainWindow.maximize();
    }

    mainWindow.loadURL(`file://${__dirname}/index.html`);

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
