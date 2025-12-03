// public/widget.js
(function () {
  const id = 'deckmage-widget';
  let container = document.getElementById(id);

  if (!container) {
    console.warn('DeckMage: No element with id="deckmage-widget" found');
    return;
  }

  // Optional: let shops customize height and colors
  const height = container.getAttribute('data-height') || '1100px';
  const bg = container.getAttribute('data-bg') || '#ffffff';

  const iframe = document.createElement('iframe');
  iframe.src = 'https://deck-mage.netlify.app/?embed=true';
  iframe.width = '100%';
  iframe.height = height;
  iframe.style.border = 'none';
  iframe.style.borderRadius = '12px';
  iframe.style.boxShadow = '0 10px 30px rgba(0,0,0,0.1)';
  iframe.style.background = bg;
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';

  container.appendChild(iframe);

  // Auto-resize iframe (optional but looks pro)
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://deck-mage.netlify.app') return;
    if (e.data.type === 'deckmage-resize') {
      iframe.height = e.data.height + 'px';
    }
  });
})();