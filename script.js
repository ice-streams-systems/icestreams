document.addEventListener('DOMContentLoaded', function () {
    const dynamicContent = document.getElementById('dynamic-content');

    // ── Helpers ──────────────────────────────────────────────────────────────

    const isTouchDevice = () => window.matchMedia('(hover: none)').matches;

    const closeAllDropdowns = () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
    };

    const loadContent = (tabName) => {
        closeAllDropdowns();

        const html = contentMap[tabName] || '<h2>Page not found!</h2>';
        dynamicContent.innerHTML = html;

        dynamicContent.style.animation = 'none';
        dynamicContent.offsetHeight; // force reflow
        dynamicContent.style.animation = '';

        dynamicContent.classList.toggle('no-scroll', tabName === 'homepage');
        dynamicContent.scrollTop = 0;
        setTimeout(() => { dynamicContent.scrollTop = 0; }, 120);

        document.querySelectorAll('nav ul li a').forEach(t => t.classList.remove('active'));
        const active = document.querySelector(
            `nav ul li a[data-tab="${tabName}"], nav ul li a#${tabName}`
        );
        if (active) active.classList.add('active');
    };

    // ── Dropdown trigger ("Services") ────────────────────────────────────────
    //
    // Strategy:
    //   Touch devices  — first tap opens the menu; second tap navigates.
    //   Pointer devices — CSS :hover opens the menu; a click navigates.
    //
    // We track state with a `data-dropdown-open` attribute so the second-tap
    // detection survives between event handlers without closure confusion.

    document.querySelectorAll('.dropdown > a').forEach((trigger) => {

        // ── Touch: use touchend for instant, no-delay response ───────────────
        trigger.addEventListener('touchend', function (e) {
            const menu = this.parentElement.querySelector('.dropdown-menu');
            const isOpen = menu.classList.contains('open');

            if (!isOpen) {
                // First tap — open the menu, suppress the ghost click
                e.preventDefault();
                e.stopPropagation();
                closeAllDropdowns();
                menu.classList.add('open');
            }
            // Second tap — do nothing; let the browser fire the natural click
            // which the click handler below will catch and navigate with.
        });

        // ── Click: second tap on touch navigates; pointer devices navigate immediately ──
        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (isTouchDevice()) {
                // Only reach here on second tap (menu already open) — navigate.
                const menu = this.parentElement.querySelector('.dropdown-menu');
                if (menu.classList.contains('open')) {
                    loadContent(this.getAttribute('data-tab') || this.id);
                } else {
                    // Edge case: menu closed somehow, reopen it.
                    closeAllDropdowns();
                    menu.classList.add('open');
                }
                return;
            }

            // Pointer device — CSS :hover already handles open/close.
            // A click should simply navigate to the Services page.
            loadContent(this.getAttribute('data-tab') || this.id);
        });
    });

    // ── Dropdown child items ─────────────────────────────────────────────────

    document.querySelectorAll('.dropdown-menu a').forEach((item) => {

        // touchend gives instant response without the 300 ms click delay
        item.addEventListener('touchend', function (e) {
            e.preventDefault();
            e.stopPropagation();
            loadContent(this.getAttribute('data-tab') || this.id);
        });

        // click covers non-touch devices (and is a safe fallback)
        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            loadContent(this.getAttribute('data-tab') || this.id);
        });
    });

    // ── Close on outside tap / click ─────────────────────────────────────────

    // touchstart for immediate close on touch; click for pointer devices.
    ['touchstart', 'click'].forEach(eventType => {
        document.addEventListener(eventType, function (e) {
            if (!e.target.closest('.dropdown')) {
                closeAllDropdowns();
            }
        }, { passive: eventType === 'touchstart' });
    });

    // ── Non-dropdown nav links ───────────────────────────────────────────────

    document.querySelectorAll('nav ul li a').forEach((tab) => {
        if (tab.closest('.dropdown')) return;
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            loadContent(this.getAttribute('data-tab') || this.id);
        });
    });

    // ── Logo ─────────────────────────────────────────────────────────────────

    document.querySelector('a.logo').addEventListener('click', function (e) {
        e.preventDefault();
        loadContent('homepage');
    });

    // ── Form submission ───────────────────────────────────────────────────────
    //
    // Handles both #request-form and #estimate-form.
    // Forms are injected into #dynamic-content by loadContent(), so we listen
    // on the document and filter by target — this survives re-renders.

    // ─────────────────────────────────────────────────────────────────────────
    // WORKER URL
    // Staging: points at the ISS shared worker on icestreams.io
    // Launch:  swap this for the Rockstar production worker URL once deployed
    //          e.g. 'https://api.rockstarautorepair.com/contact'
    // ─────────────────────────────────────────────────────────────────────────
    const WORKER_URL = 'https://iss-contact-worker.devin-sheridan93.workers.dev';

    document.addEventListener('submit', async function (e) {
        e.preventDefault();

        const form   = e.target;
        const button = form.querySelector('button[type="submit"]');

        // Only handle the two known forms
        if (form.id !== 'request-form' && form.id !== 'estimate-form') return;

        const isRequest = form.id === 'request-form';

        // ── Collect fields ──
        const name    = form.querySelector('[name="name"]')?.value.trim()    || '';
        const email   = form.querySelector('[name="email"]')?.value.trim()   || '';
        const phone   = form.querySelector('[name="phone"]')?.value.trim()   || '';
        const year    = form.querySelector('[name="year"]')?.value.trim()    || '';
        const make    = form.querySelector('[name="make"]')?.value.trim()    || '';
        const model   = form.querySelector('[name="model"]')?.value.trim()   || '';
        const service = form.querySelector('[name="service"]')?.value.trim() || '';

        // ── Build payload the Worker expects ──
        // 'brief' bundles vehicle + service info into the body field.
        // Must be at least 10 chars — validated server-side.
        const brief = `Phone: ${phone}\nVehicle: ${year} ${make} ${model}\n\nService: ${service}`;
        const type  = isRequest ? 'Service Request' : 'Estimate Request';

        // ── Disable button while in flight ──
        const originalLabel = button.textContent;
        button.disabled     = true;
        button.textContent  = 'Sending...';

        try {
            const res = await fetch(WORKER_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    name,
                    email,
                    type,
                    brief,
                    hp: '',   // honeypot — always empty from a real browser
                }),
            });

            const data = await res.json();

            if (data.ok) {
                button.textContent = '✓ Sent!';
                form.reset();
                // Re-enable after a delay so they can submit again if needed
                setTimeout(() => {
                    button.disabled    = false;
                    button.textContent = originalLabel;
                }, 4000);
            } else {
                console.error('Worker error response:', data);
                button.textContent = 'Failed — try again';
                button.disabled    = false;
            }

        } catch (err) {
            console.error('Submit error:', err);
            button.textContent = 'Failed — try again';
            button.disabled    = false;
        }
    });

    // ── Initial load ─────────────────────────────────────────────────────────

    loadContent('homepage');
});
