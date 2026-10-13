import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4174';
const outputDir = path.resolve(process.argv[3] || 'output/menu-development');
fs.mkdirSync(outputDir, { recursive: true });

const modes = ['Nowa gra', 'Ustawienia', 'Dołącz'];
const sequence = [
  ['Nowa gra', 'Ustawienia'],
  ['Ustawienia', 'Dołącz'],
  ['Dołącz', 'Nowa gra'],
  ['Nowa gra', 'Dołącz'],
  ['Dołącz', 'Ustawienia'],
  ['Ustawienia', 'Nowa gra']
];

function metrics() {
  const card = document.querySelector('.home-card');
  const rect = card.getBoundingClientRect();
  const controls = [...card.querySelectorAll('button, textarea')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => {
      const controlRect = element.getBoundingClientRect();
      return {
        name: element.innerText || element.getAttribute('aria-label'),
        width: controlRect.width,
        height: controlRect.height,
        fullyVisible: controlRect.top >= 0
          && controlRect.left >= 0
          && controlRect.bottom <= innerHeight
          && controlRect.right <= innerWidth
      };
    });
  return {
    card: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
    scrollHeight: card.scrollHeight,
    clientHeight: card.clientHeight,
    documentOverflow: {
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight
    },
    controls
  };
}

function transitionSample() {
  const card = document.querySelector('.home-card');
  const rect = card.getBoundingClientRect();
  const cardAnimations = card.getAnimations()
    .filter((animation) => animation.id === 'home-menu-card-development')
    .map((animation) => ({
      id: animation.id,
      playState: animation.playState,
      currentTime: Number(animation.currentTime),
      progress: animation.effect.getComputedTiming().progress,
      playbackRate: animation.playbackRate
    }));
  return {
    at: performance.now(),
    cardRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: rect.x + (rect.width / 2),
      centerY: rect.y + (rect.height / 2)
    },
    cardAnimations,
    menuPseudoAnimations: document.getAnimations().filter((animation) => (
      String(animation.effect?.pseudoElement || '').includes('home-menu-card')
    )).length
  };
}

async function sampleCadence(page, mode) {
  return page.evaluate(async (nextMode) => {
    const deltas = [];
    await new Promise((resolve) => {
      let start;
      let previous;
      const tick = (time) => {
        if (start === undefined) {
          start = time;
          previous = time;
        } else {
          deltas.push(time - previous);
          previous = time;
        }
        if (time - start >= 760) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      [...document.querySelectorAll('[role="tab"]')]
        .find((element) => element.textContent.trim() === nextMode)
        ?.click();
    });
    return {
      frameCount: deltas.length,
      maxDelta: Math.max(0, ...deltas),
      over20ms: deltas.filter((delta) => delta > 20).length,
      deltas
    };
  }, mode);
}

async function waitForStablePaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

const browser = await chromium.launch({ headless: true });
const result = {
  ok: false,
  url,
  settled: {},
  transitions: [],
  cadence: [],
  portrait: {},
  reducedMotion: null,
  rapid: null,
  rapidReturn: null,
  keyboardRapid: null,
  errors: []
};

try {
  const context = await browser.newContext({ viewport: { width: 891, height: 411 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') result.errors.push(message.text());
  });
  page.on('pageerror', (error) => result.errors.push(String(error)));
  await page.goto(url, { waitUntil: 'networkidle' });

  for (const mode of modes) {
    await page.getByRole('tab', { name: mode }).click();
    await page.waitForTimeout(700);
    await waitForStablePaint(page);
    result.settled[mode] = await page.evaluate(metrics);
    await page.screenshot({ path: path.join(outputDir, `landscape-${mode.replaceAll(' ', '-').toLowerCase()}.png`) });
  }

  for (const [from, to] of sequence) {
    await page.getByRole('tab', { name: from }).click();
    await page.waitForTimeout(700);
    await page.getByRole('tab', { name: to }).click();
    await page.waitForFunction(() => document.querySelector('.home-card')?.getAnimations()
      .some((animation) => animation.id === 'home-menu-card-development'));
    const samples = [];
    for (let elapsed = 0; elapsed <= 680; elapsed += 40) {
      if (elapsed) await page.waitForTimeout(40);
      samples.push(await page.evaluate(transitionSample));
      if (from === 'Dołącz' && to === 'Nowa gra' && [0, 80, 200, 400, 640].includes(elapsed)) {
        await page.screenshot({ path: path.join(outputDir, `develop-${String(elapsed).padStart(3, '0')}ms.png`) });
      }
    }
    result.transitions.push({
      from,
      to,
      samples,
      startsSingleCardAnimation: samples[0].cardAnimations.length === 1,
      oneLiveCardAnimation: samples.every((sample) => sample.cardAnimations.length <= 1),
      noMenuPseudoLayers: samples.every((sample) => sample.menuPseudoAnimations === 0),
      cleanedUp: samples.at(-1).cardAnimations.length === 0,
      monotonicWidth: samples.slice(1).every((sample, index) => {
        const delta = sample.cardRect.width - samples[index].cardRect.width;
        const expectedDelta = samples.at(-1).cardRect.width - samples[0].cardRect.width;
        return expectedDelta >= 0 ? delta >= -0.05 : delta <= 0.05;
      }),
      monotonicHeight: samples.slice(1).every((sample, index) => {
        const delta = sample.cardRect.height - samples[index].cardRect.height;
        const expectedDelta = samples.at(-1).cardRect.height - samples[0].cardRect.height;
        return expectedDelta >= 0 ? delta >= -0.05 : delta <= 0.05;
      }),
      centerDrift: {
        x: Math.max(...samples.map((sample) => sample.cardRect.centerX))
          - Math.min(...samples.map((sample) => sample.cardRect.centerX)),
        y: Math.max(...samples.map((sample) => sample.cardRect.centerY))
          - Math.min(...samples.map((sample) => sample.cardRect.centerY))
      }
    });
  }

  await page.getByRole('tab', { name: 'Nowa gra' }).click();
  await page.waitForTimeout(700);
  for (const mode of ['Dołącz', 'Nowa gra', 'Ustawienia']) {
    result.cadence.push({ mode, ...await sampleCadence(page, mode) });
  }

  result.rapid = await page.evaluate(async () => {
    const click = (name) => [...document.querySelectorAll('[role="tab"]')]
      .find((element) => element.textContent.trim() === name)?.click();
    const selectedName = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
    const start = performance.now();
    let sawIntermediateTarget = false;
    let finalTargetCommitAt = null;
    let maxMenuPlaybackRate = 1;
    const selectedEvents = [];
    const observer = new MutationObserver(() => {
      const name = selectedName();
      selectedEvents.push({ name, at: performance.now() - start });
      if (name !== 'Ustawienia') sawIntermediateTarget = true;
      if (sawIntermediateTarget && name === 'Ustawienia' && finalTargetCommitAt === null) {
        finalTargetCommitAt = performance.now();
      }
    });
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      observer.observe(tab, { attributes: true, attributeFilter: ['aria-selected'] });
    }
    const sampleRate = window.setInterval(() => {
      for (const animation of document.getAnimations()) {
        if (animation.id === 'home-menu-card-development') {
          maxMenuPlaybackRate = Math.max(maxMenuPlaybackRate, animation.playbackRate);
        }
      }
    }, 8);

    click('Dołącz');
    setTimeout(() => click('Nowa gra'), 80);
    setTimeout(() => click('Ustawienia'), 160);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    window.clearInterval(sampleRate);
    observer.disconnect();
    return {
      selected: selectedName(),
      selectedEvents,
      finalTargetCommitAfterLastTap: finalTargetCommitAt === null
        ? null
        : finalTargetCommitAt - (start + 160),
      maxMenuPlaybackRate,
      runningMenuAnimations: document.getAnimations().filter((animation) => (
        animation.id === 'home-menu-card-development'
      )).length
    };
  });

  result.rapidReturn = await page.evaluate(async () => {
    const click = (name) => [...document.querySelectorAll('[role="tab"]')]
      .find((element) => element.textContent.trim() === name)?.click();
    const selectedName = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
    let maxMenuPlaybackRate = 1;
    const sampleRate = window.setInterval(() => {
      for (const animation of document.getAnimations()) {
        if (animation.id === 'home-menu-card-development') {
          maxMenuPlaybackRate = Math.max(maxMenuPlaybackRate, animation.playbackRate);
        }
      }
    }, 8);

    click('Dołącz');
    setTimeout(() => click('Ustawienia'), 80);
    setTimeout(() => click('Dołącz'), 160);
    await new Promise((resolve) => setTimeout(resolve, 900));

    window.clearInterval(sampleRate);
    return {
      selected: selectedName(),
      maxMenuPlaybackRate,
      runningMenuAnimations: document.getAnimations().filter((animation) => (
        animation.id === 'home-menu-card-development'
      )).length
    };
  });

  await page.getByRole('tab', { name: 'Nowa gra' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('tab', { name: 'Nowa gra' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(70);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(70);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1100);
  result.keyboardRapid = {
    selected: await page.getByRole('tab', { selected: true }).innerText(),
    focused: await page.evaluate(() => document.activeElement?.textContent.trim()),
    runningMenuAnimations: await page.evaluate(() => document.getAnimations().filter((animation) => (
      animation.id === 'home-menu-card-development'
    )).length)
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  for (const mode of modes) {
    await page.getByRole('tab', { name: mode }).click();
    await page.waitForTimeout(700);
    result.portrait[mode] = await page.evaluate(metrics);
  }
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 891, height: 411 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(url, { waitUntil: 'networkidle' });
  await reducedPage.getByRole('tab', { name: 'Dołącz' }).click();
  result.reducedMotion = {
    menuAnimations: await reducedPage.evaluate(() => document.getAnimations().filter((animation) => (
      animation.id === 'home-menu-card-development'
    )).length),
    selected: await reducedPage.getByRole('tab', { selected: true }).innerText()
  };
  await reducedContext.close();

  const settledMetrics = [...Object.values(result.settled), ...Object.values(result.portrait)];
  const geometryOk = settledMetrics.every((state) => (
    state.scrollHeight === state.clientHeight
    && state.documentOverflow.x === 0
    && state.documentOverflow.y === 0
    && state.controls.every((control) => control.fullyVisible && control.width >= 44 && control.height >= 44)
  ));
  result.ok = geometryOk
    && result.transitions.every((transition) => (
      transition.startsSingleCardAnimation
      && transition.oneLiveCardAnimation
      && transition.noMenuPseudoLayers
      && transition.cleanedUp
      && transition.monotonicWidth
      && transition.monotonicHeight
      && transition.centerDrift.x <= 0.05
      && transition.centerDrift.y <= 0.05
    ))
    && result.rapid.selected === 'Ustawienia'
    && result.rapid.runningMenuAnimations === 0
    && Number.isFinite(result.rapid.finalTargetCommitAfterLastTap)
    && result.rapid.finalTargetCommitAfterLastTap <= 250
    && result.rapid.maxMenuPlaybackRate >= 2.4
    && result.rapidReturn.selected === 'Dołącz'
    && result.rapidReturn.runningMenuAnimations === 0
    && result.rapidReturn.maxMenuPlaybackRate >= 2.4
    && result.keyboardRapid.selected === 'Nowa gra'
    && result.keyboardRapid.focused === 'Nowa gra'
    && result.keyboardRapid.runningMenuAnimations === 0
    && result.cadence.every((cadence) => cadence.maxDelta <= 20 && cadence.over20ms === 0)
    && result.reducedMotion.menuAnimations === 0
    && result.reducedMotion.selected === 'Dołącz'
    && result.errors.length === 0;
} finally {
  fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
