import { Capacitor, registerPlugin } from '@capacitor/core';

export const nativeGameBridge = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  ? registerPlugin('NativeGame')
  : null;

export const isAndroidNativeShell = Boolean(nativeGameBridge);

export async function getPendingNativeInviteText() {
  if (!nativeGameBridge?.getPendingInvite) return '';
  const result = await nativeGameBridge.getPendingInvite();
  return String(result?.text || '');
}

export function addNativeInviteListener(callback) {
  if (!nativeGameBridge?.addListener) return () => {};

  let listenerHandle = null;
  let cancelled = false;
  const listener = nativeGameBridge.addListener('inviteReceived', (event) => {
    callback(String(event?.text || ''));
  });

  Promise.resolve(listener)
    .then((handle) => {
      if (cancelled) {
        handle?.remove?.();
        return;
      }
      listenerHandle = handle;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (listenerHandle?.remove) {
      listenerHandle.remove();
      return;
    }
    Promise.resolve(listener)
      .then(handle => handle?.remove?.())
      .catch(() => {});
  };
}

export async function setNativeReactGameActive(active) {
  if (!nativeGameBridge?.setReactGameActive) return false;
  const result = await nativeGameBridge.setReactGameActive({ active: Boolean(active) });
  return Boolean(result?.ok);
}

export function addNativeBackButtonListener(callback) {
  if (!nativeGameBridge?.addListener) return () => {};

  let listenerHandle = null;
  let cancelled = false;
  const listener = nativeGameBridge.addListener('androidBackPressed', callback);

  Promise.resolve(listener)
    .then((handle) => {
      if (cancelled) {
        handle?.remove?.();
        return;
      }
      listenerHandle = handle;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (listenerHandle?.remove) {
      listenerHandle.remove();
      return;
    }
    Promise.resolve(listener)
      .then(handle => handle?.remove?.())
      .catch(() => {});
  };
}
