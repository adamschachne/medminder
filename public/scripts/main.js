'use strict';

const applicationServerPublicKey = '***REMOVED***';

let isSubscribed = false;
let swRegistration = null;

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

if ('serviceWorker' in navigator && 'PushManager' in window) {
  console.log('Service Worker and Push is supported');

  navigator.serviceWorker.register('scripts/sw.js')
  .then(function(swReg) {
    console.log('Service Worker is registered', swReg);
    swRegistration = swReg;
    initializeUI();
  })
  .catch(function(error) {
    console.error('Service Worker Error', error);
  });
} else {
  console.warn('Push messaging is not supported');
}

function initializeUI() {
  // Set the initial subscription value
  swRegistration.pushManager.getSubscription()
  .then(function(subscription) {
    isSubscribed = !(subscription === null);
    updateUI();
  });
}

function updateUI() {
  if (Notification.permission === 'denied') {
    updateSubscriptionOnServer(null);
    $(document).ready(function() {
      if (window.confirm('MedMinder notifications are currently blocked. Click "OK" to learn how to unblock them'))  {
        window.open('https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&hl=en');
        //window.location.href='https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&hl=en';
      }
    });
    return;
  } else {
    // register the user here
    if (!isSubscribed) {
      subscribeUser();
    }
  }
}

function subscribeUser() {
  const applicationServerKey = urlB64ToUint8Array(applicationServerPublicKey);
  swRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey
  })
  .then(function(subscription) {
    updateSubscriptionOnServer(subscription);
    isSubscribed = true;
    updateUI();
  })
  .catch(function(err) {
    updateUI();
  });
}

function unsubscribeUser() {
  swRegistration.pushManager.getSubscription()
  .then(function(subscription) {
    if (subscription) {
      return subscription.unsubscribe();
    }
  })
  .catch(function(error) {
    console.log('Error unsubscribing', error);
  })
  .then(function() {
    updateSubscriptionOnServer(null);
    isSubscribed = false;
    updateUI();
  });
}

function updateSubscriptionOnServer(subscription) {

  var payload = {
    subscription : ""
  };

  if (subscription) {
    payload.subscription = JSON.stringify(subscription);
  }

  $.ajax({
    type: 'POST',
    url: '/register',
    dataType: 'application/json',
    data: payload,
    complete: function(res) {
      console.log(res.responseText)
    }
  })
}

function toggleRegistration() {
  if (isSubscribed) {
    unsubscribeUser();
  } else {
    subscribeUser();
  }
}
