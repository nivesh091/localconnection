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

  // Handle immediate call notification dismissal from remote action
  if (data.action === 'close_call' && data.callId) {
    var closeCallId = data.callId;
    event.waitUntil(
      self.registration.getNotifications().then(function (notifications) {
        notifications.forEach(function (n) {
          if (n.tag === 'call_' + closeCallId || (n.data && n.data.callId === closeCallId)) {
            n.close();
          }
        });
      })
    );
    return;
  }

  var title = data.title || data.appName || 'सूचना';
  var senderName = data.sender_name || data.senderName;
  if (!data.title && senderName) {
    title = senderName;
  }

  var body = data.body || data.message || 'आपको एक नया संदेश मिला है।';
  var icon = data.icon || '/pwa-192x192.png';
  var badge = data.badge || '/favicon.ico';
  var callId = data.callId || data.call_id || (data.data && (data.data.callId || data.data.call_id)) || '';
  var isIncomingCall = data.type === 'incoming_call' || (data.data && data.data.type === 'incoming_call') || (data.tag && data.tag.startsWith('call_'));
  var isMissedCall = data.type === 'missed_call' || (data.data && data.data.type === 'missed_call') || (data.tag && data.tag.startsWith('missed_call_'));

  var tag =
    data.tag ||
    (callId ? (isMissedCall ? 'missed_call_' + callId : 'call_' + callId) : data.message_id ? 'msg_' + data.message_id : data.comment_id ? 'cmt_' + data.comment_id : 'kaammitra_notification');

  var conversationId = data.conversationId || data.conversation_id || (data.data && (data.data.conversationId || data.data.conversation_id)) || '';
  var senderId = data.senderId || data.sender_id || (data.data && (data.data.senderId || data.data.sender_id)) || '';
  var targetType = data.targetType || data.target_type || '';
  var targetId = data.targetId || data.target_id || '';
  var commentId = data.commentId || data.comment_id || '';

  var targetUrl = data.url || (data.data && data.data.url) || '';
  if (!targetUrl) {
    if (callId && isIncomingCall) {
      targetUrl = '/#call=' + encodeURIComponent(callId);
    } else if (targetType === 'worker' && targetId) {
      targetUrl = '/#worker=' + encodeURIComponent(targetId) + (commentId ? '&comment=' + encodeURIComponent(commentId) : '');
    } else if (targetType === 'requirement' && targetId) {
      targetUrl = '/#requirement=' + encodeURIComponent(targetId) + (commentId ? '&comment=' + encodeURIComponent(commentId) : '');
    } else if (conversationId && senderId) {
      targetUrl = '/#chat?c=' + encodeURIComponent(conversationId) + '&u=' + encodeURIComponent(senderId);
    } else {
      targetUrl = '/#messages';
    }
  }

  // Handle stale call events safely (prevent ghost rings if device was offline or push delayed)
  var callTimestamp = (data.data && data.data.timestamp) || data.timestamp;
  if (isIncomingCall && callTimestamp && Date.now() - callTimestamp > 45000) {
    console.log('[SW] Stale incoming call notification ignored (>45s old)');
    return;
  }

  var options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    renotify: true,
    requireInteraction: Boolean(isIncomingCall),
    data: {
      url: targetUrl,
      conversationId: conversationId,
      senderId: senderId,
      targetType: targetType,
      targetId: targetId,
      commentId: commentId,
      callId: callId,
      isIncomingCall: isIncomingCall,
      isMissedCall: isMissedCall,
      messageId: data.message_id || data.messageId,
      timestamp: Date.now(),
    },
    vibrate: isIncomingCall ? [500, 250, 500, 250, 500] : [200, 100, 200],
    actions: isIncomingCall
      ? [
          { action: 'answer', title: 'कॉल उठाएं (Answer)' },
          { action: 'decline', title: 'अस्वीकार (Decline)' },
        ]
      : [],
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
  var callId = notificationData.callId || '';
  var isIncomingCall = notificationData.isIncomingCall;
  var action = event.action;

  // Handle explicit decline action from notification action button
  if (action === 'decline' && callId) {
    // Dismiss all notifications for this call
    event.waitUntil(
      self.registration.getNotifications().then(function (notifications) {
        notifications.forEach(function (n) {
          if (n.tag === 'call_' + callId || (n.data && n.data.callId === callId)) {
            n.close();
          }
        });
      })
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // 1. If a window is already open, focus it and navigate/post message
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          if (callId) {
            client.postMessage({
              type: 'NAVIGATE_CALL',
              callId: callId,
              url: targetUrl,
            });
          } else if (targetType && targetId) {
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
    var title = event.data.title || event.data.appName || 'सूचना';
    var options = event.data.options || {};
    self.registration.showNotification(title, options);
  } else if (event.data && event.data.type === 'CLOSE_CALL_NOTIFICATION') {
    var callIdToClose = event.data.callId;
    if (callIdToClose) {
      self.registration.getNotifications().then(function (notifications) {
        notifications.forEach(function (n) {
          if (n.tag === 'call_' + callIdToClose || (n.data && n.data.callId === callIdToClose)) {
            n.close();
          }
        });
      });
    }
  }
});
