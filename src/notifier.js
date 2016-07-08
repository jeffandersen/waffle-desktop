window.onload = function() {
  var remote = require('electron').remote;
  var ipc = require('electron').ipcRenderer;

  var $body = window.angular.element('body');
  var injector = $body.injector();
  var $rootScope = injector.get('$rootScope');

  var notifier = new Notifier({
    $scope: window.angular.element('body').injector().get('$rootScope'),
    webview: remote.getCurrentWindow(),
    app: window.Application,
    injector: injector,
    window: window,
    ipc: ipc,
  });

  notifier.init();
};

function Notifier(opts) {
  opts = opts || {};

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
  this.getAccessToken();
  this.getProjectInfo();
  this.listen();
};

/**
 * Identify project info
 */
Notifier.prototype.getProjectInfo = function() {
  this.project = this.$scope.repo;
  this.username = this.$scope.username;
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

  // Clear unread badge when focused
  this.window.onfocus = function() {
    self.clearUnread();
  };

  // Listen for ui-view element to be added to the page, then show window
  this.showWindowOnLoad();

  // Listen for notifications
  this.$scope.$on('waffle.alert.info', function(evt, el) {
    var $el = $(el);
    var href = $el.attr('href');
    var opts = { path: href };

    var defaultTitle = self.$scope.repo;
    var defaultBody = $el.text();
    if (!self.accessToken) {
      return self.send(defaultTitle, defaultBody, opts);
    }

    var parts = href.slice(1).split('/');
    var cardId = parts[parts.length - 1];

    self.cards(function(cards) {
      var target = cards.filter(function(card) {
        return card._id === cardId;
      })[0];

      if (!target) {
        return self.send(defaultTitle, defaultBody, opts);
      }

      self.send(target.githubMetadata.title, defaultBody, opts);
    });
  });
};

/**
 * Show window on load
 */
Notifier.prototype.showWindowOnLoad = function() {
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
    console.log('tick');
    if (sec > timeout) {
      self.clearCrashTimer();
      if (typeof test === 'function' && !test()) {
        console.log('crash');
        self.ipc.send('crash', reason || 'unknown');
      } else {
        console.log('passed');
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
 * Retrieve list of cards
 *
 * @param {function} cb
 */
Notifier.prototype.cards = function(cb) {
  this.getProjectInfo();
  this.getAccessToken();

  var path = [
    this.username,
    this.project,
    'cards',
  ];

  $.ajax({
    type: 'GET',
    url: this.endpoint + '/' + path.join('/'),
    headers: {
      'Authorization': 'Bearer ' + this.accessToken,
    }
  }).done(cb);
};

/**
 * Send desktop notification
 *
 * @param {string} title
 * @param {string} body
 */
Notifier.prototype.send = function(title, body, opts) {
  let self = this;

  this.unreadCount++;

  if (!this.flag('dnd')) {
    var n = new Notification(title, {
      body: body,
      silent: this.flag('mute'),
    });

    if (opts.path) {
      n.onclick = function() {
        self.navigateToPath(opts.path);
      };
    }
    return;
  }

  if (!this.flag('dockBounce')) {
    this.ipc.send('bounceDock');
  }
  if (!this.flag('dockBadge')) {
    this.ipc.send('unreadCount', this.unreadCount);
  }

  return n;
};

Notifier.prototype.navigateToPath = function(path) {
  var $location = this.injector.get("$location");
  if ($location) {
    this.$scope.$apply(function() {
      $location.url(path);
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
