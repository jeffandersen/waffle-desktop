window.onload = function() {
  var remote = require('electron').remote;
  var ipc = require('electron').ipcRenderer;
  var notification = require('./notification');

  // Show window immediately if angular not found
  if (!window.angular) {
    ipc.send("showMainWindow");
    return;
  }

  var $body = window.angular.element('body');
  var injector = $body.injector();
  var $rootScope = injector.get('$rootScope');

  window.WaffleDesktopNotifier = new Notifier({
    notification: require('./notification'),
    $scope: window.angular.element('body').injector().get('$rootScope'),
    webview: remote.getCurrentWindow(),
    app: window.Application,
    injector: injector,
    window: window,
    ipc: ipc,
  });

  window.WaffleDesktopNotifier.init();
};

function Notifier(opts) {
  opts = opts || {};

  this.send = opts.notification.send.bind(null);
  this.ipc = opts.ipc;
  this.app = opts.app;
  this.$scope = opts.$scope;
  this.injector = opts.injector;
  this.window = opts.window;
  this.webview = opts.webview;

  this.endpoint = this.app.waffleApi.provider.baseApiUrl;

  if (!this.app) {
    throw new Error('missing application');
  }
  if (!this.$scope) {
    throw new Error('missing $scope');
  }

  this.displayed = false;
  this.unreadCount = 0;
}

/**
 * Initialize data and listeners
 */
Notifier.prototype.init = function() {
  var self = this;

  // Listen for ui-view element to be added to the page, then show window
  this.showWindowOnLoad(function() {
    self.getAccessToken();
    self.getProjectInfo();
    self.listen();
  });
};

/**
 * Identify project info
 */
Notifier.prototype.getProjectInfo = function() {
  console.log('repo', this.$scope.repo);
  this.project = this.$scope.repo;
  this.username = this.$scope.username;
  console.log('un', this.username, 'pj', this.project);
  this.ipc.sendToHost('currentProject', this.username + '/' + this.project);

  // Get columns and cards
  this.$board = window.angular.element('.board-body').scope() || {};

  // Get list of boards
  this.getProjectList();
};

/**
 * Get projects list
 */
Notifier.prototype.getProjectList = function() {
  var self = this;
  $.ajax({
    url: 'https://api.waffle.io/user/projects',
    headers: {
      authorization: 'Bearer ' + this.accessToken,
    }
  }).done(function(data) {
    self.ipc.sendToHost('projectsList', data || []);
  });
};

/**
 * Identify the access token
 */
Notifier.prototype.getAccessToken = function() {
  var session = this.app.session;
  var user = session.user;
  var credentials = user.credentials || [];

  var credential = credentials.filter(function(c) {
    return c.scope === '*';
  })[0];

  this.accessToken = credential.accessToken || null;

  return this.accessToken;
};

/**
 * Listen for notification events
 */
Notifier.prototype.listen = function() {
  var self = this;

  // Watch for location changes
  var location = this.window.location;
  setInterval(function() {
    self.getProjectInfo();
    var current = self.window.location;
    if (current.href !== location.href) {
      location = self.window.location;
      self.ipc.send('currentLocation', location.href);
    }
  }, 3000);

  // Clear unread badge when focused
  this.window.onfocus = function() {
    self.clearUnread();
  };

  // Listen for notifications
  this.$scope.$on('waffle.alert.info', function(evt, el) {
    var $el = $(el);
    var href = $el.attr('href');
    var opts = { path: href };

    var defaultTitle = self.$scope.repo;
    var defaultBody = $el.text();

    if (defaultBody.indexOf(self.username) === 0) {
      //return; // Don't show you your own
    }

    if (!self.accessToken) {
      return self.send(defaultTitle, defaultBody, opts);
    }

    var body;
    var parts = href.slice(1).split('/');
    var cardId = parts[parts.length - 1];
    var card = self._identifyCard(cardId);

    if (!card) {
      return self.send(defaultTitle, defaultBody, opts);
    }

    var title = card.githubMetadata.title;
    var prefix = '#' + card.githubMetadata.number + ' ';

    if (defaultBody.indexOf('moved') > -1) {
      var parts = defaultBody.split(' moved ');
      var name = parts[0];
      body = 'moved to ' + card.column + ' by ' + name;
    } else if (defaultBody.indexOf('assigned') > -1) {
      var parts = defaultBody.split(' assigned ');
      var name = parts[0];
      body = 'assignment(s) changed by ' + name;
    }

    title = prefix + title;
    self.send(title, body || defaultBody, opts);
  });
};

/**
 * Find card in board
 */
Notifier.prototype._identifyCard = function(id) {
  var card;

  var board = this.$board.board || {};
  var columns = board.columns || [];
  columns.forEach(function(col) {
    var cd = col.cards.filter(function(c) {
      return c._id === id;
    })[0];
    if (cd && !card) {
      cd.column = col.displayName;
      card = cd;
    }
  });
  return card;
};

/**
 * Show window on load
 */
Notifier.prototype.showWindowOnLoad = function(cb) {
  var self = this;
  this.crashTimer(30, 'window failed to load');

  // Show if not assumed waiting for a board
  var pathname = window.location.pathname.substr(1);
  if (pathname.split('/').length !== 3) {
    return show();
  }

  // Observe the page for board loaded
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(e) {
      if (e.addedNodes) {
        e.addedNodes.forEach(function(n) {
          if (n.localName === 'ui-view') {
            observer.disconnect();
            show();
          }
        });
      }
    });
  });
  observer.observe(document.body, { subtree: true, childList: true });

  function show() {
    setTimeout(function() {
      self.ipc.send("showMainWindow");
      cb();
    }, 500);
    self.clearCrashTimer();
  }
};

/**
 * App crash timeout
 */
Notifier.prototype.crashTimer = function(timeout, reason, test) {
  if (typeof timeout === 'function') {
    test = timeout;
    reason = null;
    timeout = null;
  }
  if (typeof timeout === 'string') {
    reason = timeout;
    timeout = null;
    test = null;
  }

  timeout = parseInt(timeout, 10);
  timeout = isNaN(timeout)? 30 : timeout;

  this.clearCrashTimer();

  var sec = 0;
  var self = this;
  this._crashTimer = setInterval(function() {
    if (sec > timeout) {
      self.clearCrashTimer();
      if (typeof test === 'function' && !test()) {
        self.ipc.send('crash', reason || 'unknown');
      }
    }
    sec++;
  }, 1000);
};

Notifier.prototype.clearCrashTimer = function() {
  clearInterval(this._crashTimer);
};

/**
 * Clear unread cound
 */
Notifier.prototype.clearUnread = function() {
  this.unreadCount = 0;
  this.ipc.send('unreadCount', this.unreadCount);
};

/**
 * Send desktop notification
 *
 * @param {string} title
 * @param {string} body
 */
Notifier.prototype.send = function(title, body, opts) {
  opts = opts || {};
  let self = this;

  this.unreadCount++;

  return notification.send(title, body, {
    context : this,
    onclick: function() {
      if (!opts.path) return;
      return self.navigateToPath(opts.path);
    },
    silent: this.flag('mute'),
    dockBounce: this.flag('dockBounce'),
    dockBadge: this.flag('dockBadge')
  });
};

Notifier.prototype.navigateToPath = function(path) {
  var self = this;
  var $location = this.injector.get("$location");
  if ($location) {
    this.$scope.$apply(function() {
      $location.url(path);
      self.ipc.sendToHost('currentProject', path.slice(1));
    });
  }
};

Notifier.prototype.flag = function(key) {
  var settings = this.window.WaffleDesktop || {};
  var prefs = settings.prefs || {};
  var value = prefs[key] || {};
  var checked = typeof value.checked === 'undefined'? false : value.checked;
  return checked;
};
