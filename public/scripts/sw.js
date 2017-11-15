'use strict';

self.addEventListener('push', function(event) {
  // console.log('[Service Worker] Push Received.');
  // console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);
  var data = {
    "msg" : "Hello from MedMinder!"
  }

  if (event.data) {
    var text = event.data.text();
    try {
      data = JSON.parse(text);
    }
    catch(err) {
      //console.log(err)
    }
  }

  const title = 'MedMinder';
  const options = {
    body: data.msg,
    icon: '/images/med-minder-logo.png',
    badge: '/images/med-minder-logo.png'
  };
  const notificationPromise = self.registration.showNotification(title, options);
  event.waitUntil(notificationPromise);
});

self.addEventListener('notificationclick', function(event) {
  console.log(event.data)
  event.notification.close();
  event.waitUntil(async function() {
    const allClients = await clients.matchAll({
      includeUncontrolled: true
    });

    let currentClient;
    for (const client of allClients) {
      const url = new URL(client.url);

      if (url.pathname == '/') {
        client.focus();
        currentClient = client;
        break;
      }
    }

    if (!currentClient) {
      currentClient = await clients.openWindow('/');//clients.openWindow('/chat/');
    }
    // Send a message to the client. handled on navigator.serviceWorker.addEventListener('message', event => {})
    // currentClient.postMessage({
    //   msg: "Hey I just got a fetch from you!",
    //   url: event.request.url
    // });
  }());
});