var notification = exports;

/**
 * Send desktop notification
 *
 * @param {string} title
 * @param {string} body
 * @param {object} opts
 */
notification.send = function(title, body, opts) {
  opts = opts || {};

  var ctx = opts.context || {};

  var n = new Notification(title, {
    body: body,
    silent: typeof opts.silent === 'boolean' ? opts.silent : false
  });

  if (typeof opts.onclick === 'function') {
    n.onclick = opts.onclick;
  }

  if (ctx.ipc && typeof ctx.ipc.send === 'function') {
    if (opts.dockBounce) {
      ctx.ipc.send('bounceDock');
    }
    if (opts.dockBadge && ctx.unreadCount) {
      ctx.ipc.send('unreadCount', this.unreadCount);
    }
  }

  return n;
};
