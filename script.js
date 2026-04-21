/* ── Ripple no clique do CTA ── */
const cta = document.getElementById('cta-btn');
if (cta) {
  cta.addEventListener('click', (e) => {
    const ripple = document.createElement('span');
    const rect   = cta.getBoundingClientRect();
    const size   = Math.max(rect.width, rect.height) * 1.8;
    ripple.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      left:${e.clientX - rect.left - size/2}px;
      top:${e.clientY - rect.top - size/2}px;
      background:rgba(255,255,255,0.15);
      border-radius:50%;
      transform:scale(0);
      pointer-events:none;
      animation:rpl .6s ease-out forwards;
    `;
    cta.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

const s = document.createElement('style');
s.textContent = '@keyframes rpl{to{transform:scale(1);opacity:0}}';
document.head.appendChild(s);
