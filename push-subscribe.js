// PinkCity Properties — push subscription helper
// Load the Supabase UMD script BEFORE this file (same CDN tag already used on
// index.html / dashboard.html), then include this file:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="push-subscribe.js"></script>
//   <button onclick="enablePushNotifications(['new_listings','price_drops'])">Get listing alerts</button>
//
// For dashboard.html (team topics), pass currentUser.id explicitly since that page
// already tracks the logged-in user itself:
//   enablePushNotifications(['new_leads','verification_needed'], currentUser.id)
//
// Note: each page's own `const sb = ...` is scoped inside an IIFE and not reusable
// here, so this file creates its own lightweight client with the same public
// project URL/anon key already used across the site.

const VAPID_PUBLIC_KEY = 'BJlPJv40GQPL4SrPZv_6xVCSJYjDqBTBnW3kL7Y6IckAqWi5I-lXj6RNwb3Z23-QMQrdeSHgkY_ZB9mn9X9XLWU';
const _pushSb = window.supabase.createClient(
  'https://mfpnndrszjygespcfdbo.supabase.co',
  'sb_publishable_BN03ClNsFtgDS32FbAFckQ_vSGfFccf'
);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function enablePushNotifications(topics, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported in this browser.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notifications were not enabled.');
    return;
  }

  // sw.js already lives at the site root with push handling built in.
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Always start fresh: an existing subscription may have been created against
  // an older VAPID key pair, in which case it looks "enabled" but silently
  // fails to deliver. Unsubscribing first guarantees we're always subscribing
  // with the current key, not blindly reusing whatever was cached before.
  const existing = await registration.pushManager.getSubscription();
  let staleEndpoint = null;
  if (existing) {
    staleEndpoint = existing.endpoint;
    try { await existing.unsubscribe(); } catch (e) { console.warn('Could not unsubscribe old subscription:', e); }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  // Clean up the old row so the system doesn't keep trying a dead endpoint.
  if (staleEndpoint && staleEndpoint !== subscription.endpoint) {
    await _pushSb.from('push_subscriptions').delete().eq('endpoint', staleEndpoint);
  }

  const raw = subscription.toJSON();

  const { error } = await _pushSb.from('push_subscriptions').upsert(
    {
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
      topics,
      user_id: userId || null,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('Push subscription save failed:', error);
    alert('Could not enable notifications. Please try again.');
    return;
  }

  alert('Notifications enabled!');
}
