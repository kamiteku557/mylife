const WEB_PUSH_VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";

interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** VAPID 公開鍵を PushManager 用の Uint8Array に変換する。 */
export function base64UrlToUint8Array(base64UrlString: string): Uint8Array {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const converted = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    converted[index] = rawData.charCodeAt(index);
  }
  return converted;
}

/** 現在環境で Push subscription 登録が可能かどうかを返す。 */
export function isPushSubscriptionSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!("serviceWorker" in navigator)) {
    return false;
  }
  if (!("PushManager" in window)) {
    return false;
  }
  if (!("Notification" in window)) {
    return false;
  }
  if (!window.isSecureContext) {
    return false;
  }
  return WEB_PUSH_VAPID_PUBLIC_KEY.length > 0;
}

/** Service Worker に Push subscription を登録し、API へ送信する。 */
export async function ensurePushSubscription(apiBaseUrl: string): Promise<void> {
  if (!isPushSubscriptionSupported()) {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  if (!apiBaseUrl) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(
        WEB_PUSH_VAPID_PUBLIC_KEY,
      ) as unknown as BufferSource,
    });
  }

  const payload = toPayload(subscription);
  if (!payload) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/push/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `failed to register push subscription: ${response.status}`);
  }
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload | null {
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!keys?.p256dh || !keys.auth || !json.endpoint) {
    return null;
  }
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  };
}
