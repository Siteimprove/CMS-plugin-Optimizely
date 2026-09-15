export const isSdkOrigin = origin => /^https:\/\/contentassistant\.[a-z]+\.siteimprove\.com$/.test(origin);

// Observe messages sent by the real integration without replacing the overlay or invoking its queue.
export async function observeDraft(context, cmsOrigin, markers) {
  const evidence = Object.fromEntries(markers.map(marker => [marker, 0]));
  evidence.captures = Object.fromEntries(markers.map(marker => [marker, {}]));
  await context.exposeBinding('__cmsDraftEvidence', ({ frame }, value) => {
    if (isSdkOrigin(new URL(frame.url()).origin) && markers.includes(value?.marker)) {
      evidence[value.marker]++;
      evidence.captures[value.marker] = { imagePresent: value.imagePresent === true, fixedAlternativePresent: value.fixedAlternativePresent === true };
    }
  });
  await context.addInitScript(({ cmsOrigin, markers }) => {
    window.addEventListener('message', event => {
      if (event.origin !== cmsOrigin || event.source !== window.parent || event.data?.si !== 'contentcheck-flat-dom') return;
      const dom = JSON.stringify(event.data.data?.dom ?? null);
      for (const marker of markers)
        if (dom.includes(marker)) window.__cmsDraftEvidence({ marker, imagePresent: dom.includes('live-test-image'),
          fixedAlternativePresent: dom.includes('Blue square for the prepublish test') });
    });
  }, { cmsOrigin, markers });
  return evidence;
}
