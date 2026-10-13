import { nativeGameBridge } from './nativeBridge.js';

function cleanShareText(value) {
  return String(value || '').trim();
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
  return { method: 'clipboard' };
}

export async function shareText({ title = 'Makao', text }) {
  const shareTextValue = cleanShareText(text);
  if (!shareTextValue) {
    throw new Error('Missing share text');
  }

  if (nativeGameBridge?.shareText) {
    await nativeGameBridge.shareText({ title, text: shareTextValue });
    return { method: 'native-share' };
  }

  if (navigator.share) {
    await navigator.share({
      title,
      text: shareTextValue
    });
    return { method: 'web-share' };
  }

  return copyToClipboard(shareTextValue);
}
