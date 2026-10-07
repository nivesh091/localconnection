// KaamMitra Custom Push & Background Notification Service Worker Script
// Loaded by Workbox via importScripts('/sw-push.js')

self.addEventListener('push', function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  var title = data.title || 'काम मित्र (KaamMitra)';
  var senderName = data.sender_name || data.senderName;
  if (!data.title && senderName) {
    title = senderName;
  }

  var body = data.body || data.message || 'आपको एक नया संदेश मिला है।';
  var icon = data.icon || '/pwa-192x192.png';
  var badge = data.badge || '/favicon.ico';
  var tag =
    data.tag ||
    (data.message_id ? 'msg_' + data.message_id : data.comment_id ? 'cmt_' + data.comment_id : 'kaammitra_notification');

  var conversationId = data.conversationId || data.conversation_id || '';
  var senderId = data.senderId || data.sender_id || '';
  var targetType = data.targetType || data.target_type || '';
  var targetId = data.targetId || data.target_id || '';
  var commentId = data.commentId || data.comment_id || '';

  var targetUrl = data.url || '';
  if (!targetUrl) {
    if (targetType === 'worker' && targetId) {
      targetUrl = '/#worker=' + encodeURIComponent(targetId) + (commentId ? '&comment=' + encodeURIComponent(commentId) : '');
    } else if (targetType === 'requirement' && targetId) {
      targetUrl = '/#requirement=' + encodeURIComponent(targetId) + (commentId ? '&comment=' + encodeURIComponent(commentId) : '');
    } else if (conversationId && senderId) {
      targetUrl = '/#chat?c=' + encodeURIComponent(conversationId) + '&u=' + encodeURIComponent(senderId);
    } else {
      targetUrl = '/#messages';
    }
  }

  var options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    renotify: true,
    data: {
      url: targetUrl,
      conversationId: conversationId,
      senderId: senderId,
      targetType: targetType,
      targetId: targetId,
      commentId: commentId,
      messageId: data.message_id || data.messageId,
      timestamp: Date.now(),
    },
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var notificationData = event.notification.data || {};
  var targetUrl = notificationData.url || '/#messages';
  var targetType = notificationData.targetType || '';
  var targetId = notificationData.targetId || '';
  var commentId = notificationData.commentId || '';
  var conversationId = notificationData.conversationId || '';
  var senderId = notificationData.senderId || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 1. If a window is already open, focus it and post a navigation message
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if (targetType && targetId) {
            client.postMessage({
              type: 'NAVIGATE_TARGET',
              targetType: targetType,
              targetId: targetId,
              commentId: commentId,
              url: targetUrl,
            });
          } else if (conversationId && senderId) {
            client.postMessage({
              type: 'NAVIGATE_CHAT',
              conversationId: conversationId,
              senderId: senderId,
              url: targetUrl,
            });
          }
          return;
        }
      }
      // 2. Otherwise open a new window directly to the target URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    var title = event.data.title || 'काम मित्र (KaamMitra)';
    var options = event.data.options || {};
    self.registration.showNotification(title, options);
  }
});
