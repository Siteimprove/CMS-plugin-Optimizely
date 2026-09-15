(() => {
  if (window.__overlayEvidence) throw new Error('Overlay loaded twice');
  const evidence = window.__overlayEvidence = { commands: [], rechecks: [], previewHeadings: [], url: null };
  let preview;
  const panel = document.createElement('aside');
  panel.id = 'controlled-overlay';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:white;padding:12px;border:2px solid black';
  const url = document.createElement('output');
  url.id = 'overlay-context';
  panel.append(url);
  const recheck = document.createElement('button');
  recheck.textContent = 'Stub Recheck';
  recheck.onclick = () => {
    evidence.rechecks.push(evidence.url);
    // This endpoint belongs to the stub, not to Optimizely or the real Siteimprove overlay.
    fetch('/__overlay_stub/recheck', { method: 'POST', body: JSON.stringify({ url: evidence.url }) });
  };
  panel.append(recheck);
  const prepublish = document.createElement('button');
  prepublish.textContent = 'Inspect preview callback';
  prepublish.onclick = () => evidence.previewHeadings.push(preview?.()?.querySelector('h1')?.textContent?.trim() ?? null);
  panel.append(prepublish);
  document.body.append(panel);
  function push(command) {
    const [name, value] = command;
    evidence.commands.push(name);
    if (name === 'input' || name === 'domain') {
      evidence.url = value;
      url.textContent = value;
      command[3]?.();
    } else if (name === 'registerPrepublishCallback') preview = value;
    else if (name === 'clear') { evidence.url = null; command[1]?.(); }
    else if (name !== 'onHighlight' && name !== 'applyDefaultHighlighting')
      throw new Error('Unimplemented plugin command: ' + name);
  }
  const pending = window._si || [];
  window._si = { push };
  pending.forEach(push);
})();
