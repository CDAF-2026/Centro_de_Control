/* global React, CDAF_DATA, CDAF_ICONS */
// Centro Deportivo AF — marketing components

const { useState, useEffect } = React;
const D = window.CDAF_DATA;
const { TennisBall, PadelRacket, Calendar, Pin, Clock, ArrowUpRight, Instagram, Facebook, Whatsapp } = window.CDAF_ICONS;

// ---------- Buttons -------------------------------------------------------
function Btn({ variant = 'primary', children, ...props }) {
  return React.createElement('button', { className: `cdaf-btn cdaf-btn--${variant}`, ...props }, children);
}
function GhostLink({ children, ...props }) {
  return React.createElement('button', { className: 'cdaf-btn cdaf-btn--ghost', ...props },
    children,
    React.createElement('span', { className: 'cdaf-arr' }, '↗')
  );
}

// ---------- Top bar -------------------------------------------------------
function TopBar({ active, onNav, onReserve }) {
  return React.createElement('header', { className: 'topbar' },
    React.createElement('div', { className: 'container topbar__inner' },
      React.createElement('a', { className: 'topbar__logo', href: '#home', onClick: e => { e.preventDefault(); onNav('Inicio'); } },
        React.createElement('img', { src: D.brand.logo, alt: D.brand.name })
      ),
      React.createElement('nav', { className: 'topbar__nav' },
        D.nav.slice(0, 4).map(n =>
          React.createElement('a', {
            key: n.label, href: n.href,
            className: active === n.label ? 'active' : '',
            onClick: e => { e.preventDefault(); onNav(n.label); },
          }, n.label)
        )
      ),
      React.createElement(Btn, { variant: 'primary', onClick: onReserve }, 'RESERVAR')
    )
  );
}

// ---------- Hero ----------------------------------------------------------
function Hero({ onReserve }) {
  return React.createElement('section', { className: 'hero' },
    React.createElement('div', { className: 'hero__photo' }),
    React.createElement('div', { className: 'hero__scrim' }),
    React.createElement('a', { className: 'hero__live', href: '#live' },
      React.createElement('span', { className: 'dot' }),
      '¡En Vivo!'
    ),
    React.createElement('div', { className: 'container hero__inner' },
      React.createElement('div', { className: 'eyebrow' }, 'Centro Deportivo · Llanogrande'),
      React.createElement('h1', { className: 'hero__title' },
        React.createElement('span', { className: 'stroke' }, 'Compromiso'),
        React.createElement('span', { className: 'solid' }, 'con el juego.')
      ),
      React.createElement('p', { className: 'hero__sub' },
        'Tenis y pádel de alto rendimiento en un club premium en Llanogrande, Rionegro. ',
        'Torneos, clases y canchas disponibles para reserva todos los días.'
      ),
      React.createElement('div', { className: 'hero__ctas' },
        React.createElement(Btn, { variant: 'primary', onClick: onReserve }, 'RESERVAR CANCHA'),
        React.createElement(Btn, { variant: 'charcoal' }, 'VER PROGRAMAS')
      )
    ),
    React.createElement('div', { className: 'hero__stencils' },
      D.values.map(v => React.createElement('span', { key: v }, v))
    )
  );
}

// ---------- Categories ----------------------------------------------------
function Categories({ onPick }) {
  return React.createElement('section', { className: 'section', id: 'programs' },
    React.createElement('div', { className: 'container' },
      React.createElement('h2', { className: 'section-title' },
        React.createElement('span', { className: 'accent' }, '01 '), 'Programas'
      ),
      React.createElement('div', { className: 'cats' },
        D.categories.map(c =>
          React.createElement('article', { key: c.id, className: 'cat', onClick: () => onPick(c.title) },
            React.createElement('div', { className: 'cat__photo', style: { backgroundImage: `url(${c.photo})` } }),
            React.createElement('div', { className: 'cat__body' },
              React.createElement('h3', { className: 'cat__title' }, c.title),
              React.createElement(GhostLink, null, 'Ver más')
            )
          )
        )
      )
    )
  );
}

// ---------- Staff ---------------------------------------------------------
function Staff() {
  return React.createElement('section', { className: 'section section--dark', id: 'staff' },
    React.createElement('div', { className: 'container' },
      React.createElement('h2', { className: 'section-title', style: { color: '#fff' } },
        React.createElement('span', { className: 'accent' }, '02 '), 'Staff'
      ),
      React.createElement('div', { className: 'staff-grid' },
        D.staff.map(s =>
          React.createElement('article', { key: s.name, className: 'staff' },
            React.createElement('div', { className: 'staff__photo', style: { backgroundImage: `url(${s.photo})` } }),
            React.createElement('div', { className: 'staff__body' },
              React.createElement('h3', { className: 'staff__name' }, s.name),
              React.createElement('div', { className: 'staff__role' }, s.role)
            )
          )
        )
      )
    )
  );
}

// ---------- Events split --------------------------------------------------
function Events({ onReserve }) {
  return React.createElement('section', { className: 'section section--dark', id: 'events' },
    React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'events' },
        React.createElement('div', { className: 'events__copy' },
          React.createElement('div', { className: 'eyebrow' }, 'Eventos y servicios'),
          React.createElement('h2', { className: 'section-title', style: { color: '#fff' } },
            'Torneos, alquiler ', React.createElement('span', { className: 'accent' }, '& eventos.')
          ),
          React.createElement('p', null,
            'En el ', React.createElement('strong', null, 'Centro Deportivo Alejandro Falla'),
            ' organizamos torneos de tenis y pádel para adultos y niños, abarcando diversas categorías para adaptarnos a todos los niveles.'
          ),
          React.createElement('p', null,
            'Ponemos a disposición nuestras canchas para alquiler y ofrecemos nuestros servicios logísticos para la organización de eventos institucionales, empresariales y celebraciones privadas.'
          ),
          React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 18 } },
            React.createElement(Btn, { variant: 'primary', onClick: onReserve }, 'RESERVAR'),
            React.createElement(Btn, { variant: 'outline', style: { color: '#fff', borderColor: '#fff' } }, 'TORNEOS')
          )
        ),
        React.createElement('div', { className: 'events__sports' },
          D.sports.map(sp =>
            React.createElement('article', { key: sp.id, className: 'sport' },
              React.createElement('div', { className: 'sport__photo', style: { backgroundImage: `url(${sp.photo})` } }),
              React.createElement('div', { className: 'sport__scrim' }),
              React.createElement('div', { className: 'sport__title' }, sp.title),
              React.createElement('a', { className: 'sport__cta', onClick: e => { e.preventDefault(); onReserve(); }, href: '#' }, 'Reservar')
            )
          )
        )
      )
    )
  );
}

// ---------- Gallery -------------------------------------------------------
function Gallery() {
  return React.createElement('section', { className: 'section section--gray', id: 'gallery' },
    React.createElement('div', { className: 'container' },
      React.createElement('h2', { className: 'section-title' },
        React.createElement('span', { className: 'accent' }, '03 '), 'Galería'
      ),
      React.createElement('div', { className: 'gallery' },
        D.gallery.map(g =>
          React.createElement('div', { key: g.src, className: 'gal' },
            React.createElement('img', { src: g.src, alt: g.caption }),
            React.createElement('div', { className: 'gal__cap' }, g.caption)
          )
        ),
        // a couple of extras to fill the grid
        React.createElement('div', { className: 'gal' },
          React.createElement('img', { src: 'https://centrodeportivoaf.com/wp-content/uploads/2024/01/padel-home2.jpg', alt: 'Pádel' }),
          React.createElement('div', { className: 'gal__cap' }, 'Pádel · canchas')
        ),
        React.createElement('div', { className: 'gal' },
          React.createElement('img', { src: 'https://centrodeportivoaf.com/wp-content/uploads/2024/08/ninos.jpg', alt: 'Academia' }),
          React.createElement('div', { className: 'gal__cap' }, 'Academia · niños')
        )
      ),
      React.createElement('div', { style: { textAlign: 'center', marginTop: 28 } },
        React.createElement(GhostLink, null, 'Ver galería completa')
      )
    )
  );
}

// ---------- Sponsors ------------------------------------------------------
function Sponsors() {
  return React.createElement('section', { className: 'section section--gray', style: { paddingTop: 0 } },
    React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'eyebrow', style: { textAlign: 'center' } }, 'Patrocinadores'),
      React.createElement('div', { className: 'sponsors' },
        D.sponsors.map(s => React.createElement('div', { key: s, className: 'sponsor' }, s))
      )
    )
  );
}

// ---------- Footer --------------------------------------------------------
function Footer() {
  return React.createElement('footer', { className: 'footer' },
    React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'footer__inner' },
        React.createElement('div', { className: 'footer__logo' },
          React.createElement('img', { src: D.brand.logo, alt: D.brand.name })
        ),
        React.createElement('nav', { className: 'footer__links' },
          ['INICIO', 'RESERVAS', 'ENCUÉNTRANOS', 'NOSOTROS', 'POLÍTICAS', 'CONTACTO', 'REGLAMENTO INTERNO'].map(l =>
            React.createElement('a', { key: l, href: '#' }, l)
          )
        ),
        React.createElement('div', { className: 'footer__socials' },
          React.createElement('a', { href: D.brand.facebook, 'aria-label': 'Facebook' }, React.createElement(Facebook, { size: 18 })),
          React.createElement('a', { href: D.brand.instagram, 'aria-label': 'Instagram' }, React.createElement(Instagram, { size: 18 })),
          React.createElement('a', { href: D.brand.whatsapp, 'aria-label': 'WhatsApp' }, React.createElement(Whatsapp, { size: 18 }))
        )
      ),
      React.createElement('div', { className: 'footer__bottom' },
        React.createElement('span', null, '© 2026 Centro Deportivo Alejandro Falla · Todos los derechos reservados.'),
        React.createElement('span', null, D.brand.location)
      )
    )
  );
}

// ---------- Reserve modal -------------------------------------------------
function ReserveModal({ onClose, onConfirm }) {
  const [sport, setSport] = useState('Tenis');
  const [date,  setDate]  = useState('2026-06-12');
  const [time,  setTime]  = useState('18:00');
  const [name,  setName]  = useState('');

  return React.createElement('div', { className: 'modal-backdrop', onClick: e => e.target === e.currentTarget && onClose() },
    React.createElement('div', { className: 'modal' },
      React.createElement('button', { className: 'modal__close', onClick: onClose, 'aria-label': 'Cerrar' }, '×'),
      React.createElement('h3', { className: 'modal__title' }, 'Reservar cancha'),
      React.createElement('p', { className: 'modal__sub' }, 'Disponibilidad en tiempo real · cancelación gratis hasta 4h antes.'),
      React.createElement('div', { className: 'modal__field' },
        React.createElement('label', null, 'Nombre'),
        React.createElement('input', { value: name, onChange: e => setName(e.target.value), placeholder: 'Tu nombre' })
      ),
      React.createElement('div', { className: 'modal__row' },
        React.createElement('div', { className: 'modal__field' },
          React.createElement('label', null, 'Disciplina'),
          React.createElement('select', { value: sport, onChange: e => setSport(e.target.value) },
            React.createElement('option', null, 'Tenis'),
            React.createElement('option', null, 'Pádel')
          )
        ),
        React.createElement('div', { className: 'modal__field' },
          React.createElement('label', null, 'Fecha'),
          React.createElement('input', { type: 'date', value: date, onChange: e => setDate(e.target.value) })
        )
      ),
      React.createElement('div', { className: 'modal__field' },
        React.createElement('label', null, 'Hora'),
        React.createElement('select', { value: time, onChange: e => setTime(e.target.value) },
          ['06:00','08:00','10:00','14:00','16:00','18:00','20:00'].map(t => React.createElement('option', { key: t }, t))
        )
      ),
      React.createElement('div', { className: 'modal__actions' },
        React.createElement(Btn, { variant: 'outline', onClick: onClose }, 'CANCELAR'),
        React.createElement(Btn, { variant: 'primary', onClick: () => onConfirm({ sport, date, time, name }) }, 'CONFIRMAR ↗')
      )
    )
  );
}

// ---------- App shell -----------------------------------------------------
function App() {
  const [active, setActive] = useState('Inicio');
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState(null);

  function reserve() { setModal(true); }
  function confirm(p) {
    setModal(false);
    setToast(`✓ ${p.sport} confirmado · ${p.date} ${p.time}`);
    setTimeout(() => setToast(null), 2800);
  }

  return React.createElement(React.Fragment, null,
    React.createElement(TopBar, { active, onNav: setActive, onReserve: reserve }),
    React.createElement(Hero, { onReserve: reserve }),
    React.createElement(Categories, { onPick: t => setToast(`Programa: ${t}`) || setTimeout(() => setToast(null), 1800) }),
    React.createElement(Staff),
    React.createElement(Events, { onReserve: reserve }),
    React.createElement(Gallery),
    React.createElement(Sponsors),
    React.createElement(Footer),
    React.createElement('a', { className: 'fab-wa', href: D.brand.whatsapp, 'aria-label': 'WhatsApp', target: '_blank', rel: 'noopener' },
      React.createElement(Whatsapp, { size: 28 })
    ),
    modal && React.createElement(ReserveModal, { onClose: () => setModal(false), onConfirm: confirm }),
    toast && React.createElement('div', { className: 'toast' }, toast)
  );
}

Object.assign(window, { CDAF_App: App });
