import assert from 'node:assert/strict';
import test from 'node:test';

import { filterAppLogcat, findAppLogcatErrors } from '../android_logcat_filter.mjs';

const PACKAGE_NAME = 'pl.makao.zeznajomymi';
const RAW = [
  '08-26 11:00:00.001  1111  1112 E AndroidRuntime: FATAL EXCEPTION: main',
  '08-26 11:00:00.002  1111  1112 E AndroidRuntime: Process: pl.makao.zeznajomymi, PID: 1111',
  '08-26 11:00:00.003  1111  1112 E AndroidRuntime: java.lang.NullPointerException: makao crash',
  '08-26 11:00:00.004  2222  2223 E AndroidRuntime: FATAL EXCEPTION: main',
  '08-26 11:00:00.005  2222  2223 E AndroidRuntime: Process: com.microsoft.office.outlook, PID: 2222',
  '08-26 11:00:00.006  3333  3334 E ActivityManager: ANR in com.brave.browser',
  '08-26 11:00:00.007  1000  1001 E ActivityManager: ANR in pl.makao.zeznajomymi',
  '08-26 11:00:00.008  1111  1112 E Capacitor/Console: TypeError: bad move',
  '08-26 11:00:00.009  4444  4445 E Bluetooth: HCI_ERR_PAGE_TIMEOUT'
].join('\n');

test('filter keeps Makao PID and package-scoped system lines only', () => {
  const filtered = filterAppLogcat(RAW, { packageName: PACKAGE_NAME, pids: ['1111'] });

  assert.match(filtered, /makao crash/);
  assert.match(filtered, /ANR in pl\.makao\.zeznajomymi/);
  assert.match(filtered, /Capacitor\/Console/);
  assert.doesNotMatch(filtered, /outlook/);
  assert.doesNotMatch(filtered, /brave/);
  assert.doesNotMatch(filtered, /Bluetooth/);
});

test('error scan still catches native, ANR and JavaScript failures for Makao', () => {
  const filtered = filterAppLogcat(RAW, { packageName: PACKAGE_NAME, pids: '1111' });
  const errors = findAppLogcatErrors(filtered);

  assert.ok(errors.some(line => line.includes('FATAL EXCEPTION')));
  assert.ok(errors.some(line => line.includes('ANR in pl.makao.zeznajomymi')));
  assert.ok(errors.some(line => line.includes('TypeError')));
  assert.ok(errors.some(line => line.includes('NullPointerException')));
});
