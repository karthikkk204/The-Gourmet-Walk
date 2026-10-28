import { useEffect, useState } from 'react';

const NAV = [
  ['home', 'Home'],
  ['tours', 'Tours'],
  ['about', 'About'],
  ['contact', 'Contact'],
  ['portfolio', 'Portfolio Page'],
  ['shop', 'Shop'],
  ['book', 'Book Online'],
  ['admin', 'Admin'],
];

const CART_STORAGE_KEY = 'gourmet-walk-cart';
const IMG = (name) => `/images/${name}.jpg`;
const PRODUCTS = [
  { id: 'p1', name: 'Regional Flavor Maps', price: 90, category: 'Cookbooks', imageUrl: IMG('p1'), description: 'A beautifully illustrated guide to the flavors and traditions of the region.' },
  { id: 'p2', name: 'The Artisan Pantry', price: 45, category: 'Gourmet Foods', imageUrl: IMG('p2'), description: 'A curated collection of pantry staples from independent makers.' },
  { id: 'p3', name: 'Global Street Bites', price: 55, category: 'Cookbooks', imageUrl: IMG('p3'), description: 'Stories and recipes inspired by the world’s most memorable street food.' },
  { id: 'p4', name: 'Copper Tasting Spoon', price: 30, category: 'Culinary Merchandise', imageUrl: IMG('p4'), description: 'A hand-finished copper spoon for thoughtful tastings.' },
  { id: 'p5', name: 'Olivewood Serving Board', price: 85, category: 'Culinary Merchandise', imageUrl: IMG('p5'), description: 'A one-of-a-kind serving board crafted from olivewood.' },
  { id: 'p6', name: 'Canvas Market Tote', price: 25, category: 'Culinary Merchandise', imageUrl: IMG('p6'), description: 'A sturdy everyday tote for market finds and culinary essentials.' },
  { id: 'p7', name: 'Aged Balsamic Glaze', price: 70, category: 'Gourmet Foods', imageUrl: IMG('p7'), description: 'A rich, slow-aged balsamic glaze from a family-run producer.' },
  { id: 'p8', name: 'Smoked Sea Salt', price: 20, category: 'Gourmet Foods', imageUrl: IMG('p8'), description: 'Small-batch sea salt gently smoked for a deep, savory finish.' },
  { id: 'p9', name: 'Artisan Truffle Honey', price: 60, category: 'Gourmet Foods', imageUrl: IMG('p9'), description: 'Fragrant local honey infused with earthy seasonal truffle.' },
];

const FAQs = [
  ['How do I reserve a food walk?', 'Choose Book Online or send us a private-tour inquiry. Our concierge will confirm availability and details.'],
  ['How many guests can join a tour?', 'Scheduled walks are intentionally intimate and welcome up to eight guests per departure.'],
  ['Can you accommodate dietary needs?', 'Yes. Include your dietary requirements in the inquiry form and our team will plan accordingly.'],
  ['Do you offer private and corporate experiences?', 'We create tailored private tastings, team retreats, chef experiences, and full-day culinary itineraries.'],
];

const tours = [
  { image: 'walks', title: 'Market-to-table walking tour', text: 'Follow the aromas through historic market streets and taste the city one artisan stop at a time.' },
  { image: 'tastings', title: 'Sommelier cellar tasting', text: 'Meet independent vintners for a guided flight of regional wines and thoughtfully paired bites.' },
  { image: 'events', title: 'Private celebrations & events', text: 'Gather your favorite people around a bespoke menu, a local chef, and a memorable table.' },
  { image: 'custom', title: 'A journey made for you', text: 'A personal itinerary shaped around your pace, palate, neighborhood, and occasion.' },
];

const makers = [
  { image: 'bakery', type: 'Heritage Bakery', year: 'Est. 1936', name: 'Forno & Vecchia Spiga', text: 'Third-generation sourdough and stone-ground ancient grains baked daily in a wood-fired hearth.' },
  { image: 'dairy', type: 'Artisan Dairy', year: 'Est. 1968', name: 'Caseificio Val Montone', text: 'Pasture-grazed milk and carefully aged cheeses from a family devoted to regional traditions.' },
  { image: 'cellar', type: 'Biodynamic Cellars', year: 'Est. 1971', name: 'Tenuta San Lorenzo', text: 'Terraced limestone vineyards and expressive wines, paired during our afternoon itineraries.' },
];

const portfolioItems = [
  ['pf1', 'Gourmet Corporate Events', 'Professionally organized culinary gatherings for teams and clients, blending local flavors with engaging experiences.'],
  ['pf2', 'Curated Itinerary Development', 'Personalized food-focused itineraries shaped around your destination, schedule, and favorite flavors.'],
  ['pf3', 'Private Chef Experiences', 'An intimate introduction to local kitchens, seasonal ingredients, and the people behind each dish.'],
  ['pf4', 'Neighborhood Food Walks', 'A thoughtful route through the small producers and family-run tables that give a neighborhood its character.'],
  ['pf5', 'Sommelier Tastings', 'Private cellar visits and guided tastings led by passionate local wine experts.'],
  ['pf6', 'Market & Kitchen Stories', 'Hands-on visits with artisans, cooks, and growers who keep culinary traditions alive.'],
];

async function readApiResponse(response) {
  const body = await response.text();
  let result;
  try {
    result = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`The API returned an invalid response (${response.status}). Check that the API server is running.`);
  }
  if (!response.ok) {
    throw new Error(result?.message || `The API request failed (${response.status}).`);
  }
  if (result === null) {
    throw new Error('The API returned an empty response.');
  }
  return result;
}

function formatMoney(minor, currency = 'INR') {
  const amount = Number(minor);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function getDateTimePartsInZone(date, timeZone) {
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsedDate.valueOf())) throw new RangeError('A valid date and time is required.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsedDate);
  return Object.fromEntries(parts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
}

function getBusinessDate(date, timeZone) {
  const parts = getDateTimePartsInZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatBusinessDateTime(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function businessDateTimeToIso(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Choose a valid date and time.');
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const targetParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };
  const target = Date.UTC(
    targetParts.year,
    targetParts.month - 1,
    targetParts.day,
    targetParts.hour,
    targetParts.minute,
  );
  let timestamp = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getDateTimePartsInZone(new Date(timestamp), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const nextTimestamp = timestamp + target - observedAsUtc;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }

  const resolved = getDateTimePartsInZone(new Date(timestamp), timeZone);
  if (Object.entries(targetParts).some(([part, expected]) => resolved[part] !== expected)) {
    throw new Error(`That local time is not valid in ${timeZone}.`);
  }
  return new Date(timestamp).toISOString();
}

function businessDateTimeInputValue(date, timeZone) {
  const parts = getDateTimePartsInZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function createRequestToken() {
  return crypto.randomUUID();
}

function createAccessToken() {
  return crypto.getRandomValues(new Uint8Array(32))
    .reduce((token, byte) => token + byte.toString(16).padStart(2, '0'), '');
}

function readHashParams() {
  return new URLSearchParams(window.location.hash.split('?')[1] || '');
}

function Link({ to, children, className = '', onClick }) {
  return <a className={className} href={`#${to}`} onClick={onClick}>{children}</a>;
}

function Wrap({ children, className = '' }) {
  return <div className={`wrap ${className}`}>{children}</div>;
}

function ButtonLink({ to, children, className = '' }) {
  return <Link to={to} className={`button ${className}`}>{children}</Link>;
}

function Logo() {
  return (
    <Link to="home" className="brand" aria-label="The Gourmet Walk home">
      <svg width="25" height="31" viewBox="0 0 22 28" aria-hidden="true">
        <path d="M11 0C4.9 0 0 4.8 0 10.8 0 19 11 28 11 28s11-9 11-17.2C22 4.8 17.1 0 11 0Z" fill="#b5552a" />
        <circle cx="11" cy="10.5" r="4" fill="#f9f6f0" />
      </svg>
      <span>The<br />Gourmet<br />Walk</span>
    </Link>
  );
}

function Header({ page, cartCount }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={`site-header ${page === 'home' ? 'home-header' : ''}`}>
      <Wrap className="header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV.map(([key, label]) => <Link key={key} to={key} className={page === key ? 'active' : ''}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <a className="account-dot" href="#contact" aria-label="Contact concierge" />
          <Link to="cart" className="bag-icon" aria-label={`Shopping cart, ${cartCount} items`}>
            <svg viewBox="0 0 20 22" aria-hidden="true"><path d="M3 7h14l1 14H2L3 7Z" /><path d="M6 7V5a4 4 0 0 1 8 0v2" /></svg>
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </Link>
          <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </Wrap>
      {open && <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(([key, label]) => <Link key={key} to={key} onClick={() => setOpen(false)}>{label}</Link>)}</nav>}
    </header>
  );
}

function Footer({ page, business }) {
  return (
    <footer>
      <div className="footer-orange">
        <Wrap className="footer-contact">
          <strong>Contact</strong>
          <div>{business?.locationLabel || business?.address || 'Meeting point details shared after booking'}</div>
          <div>{business?.hours || 'Hours vary by experience'}<br /><a href="mailto:experiences@thegourmetwalk.com">Contact the concierge</a></div>
        </Wrap>
        <Wrap className="copyright">© 2026 The Gourmet Walk. All rights reserved.</Wrap>
      </div>
      <nav className="footer-nav" aria-label="Footer navigation">
        <Wrap className="footer-links">{NAV.map(([key, label]) => <Link key={key} to={key} className={page === key ? 'active' : ''}>{label}</Link>)}</Wrap>
      </nav>
    </footer>
  );
}

function FAQ() {
  const [selected, setSelected] = useState(0);
  return (
    <section className="faq-section">
      <Wrap>
        <p className="eyebrow muted">Essential information</p>
        <h2 className="section-title small-title">Inquiries & reservations FAQ</h2>
        <div className="faq-list">
          {FAQs.map(([question, answer], index) => (
            <div className="faq-item" key={question}>
              <button type="button" aria-expanded={selected === index} onClick={() => setSelected(selected === index ? -1 : index)}>
                {question}<span aria-hidden="true">{selected === index ? '−' : '+'}</span>
              </button>
              {selected === index && <p>{answer}</p>}
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

function ProductCard({ product, compact = false, onAdd }) {
  return (
    <article className={`product-card ${compact ? 'compact-product' : ''}`}>
      <div className="product-image"><img src={product.imageUrl || IMG(product.id)} alt={product.name} loading="lazy" /></div>
      <p className="product-name">{product.name}</p>
      <p className="product-price">{formatMoney(Math.round(Number(product.price) * 100))}</p>
      {onAdd && <button type="button" className="button add-cart-button" onClick={() => onAdd(product.id)}>Add to cart</button>}
    </article>
  );
}

function Home({ products, addToCart, productError }) {
  return (
    <main>
      <section className="hero-heading">
        <Wrap>
          <h1 className="big-type">Gourmet</h1>
          <div className="hero-subline"><p className="big-type">One bite<br />at a time</p><ButtonLink to="book">Book a tour</ButtonLink></div>
        </Wrap>
      </section>
      <Wrap className="hero-photo"><img src={IMG('hero')} alt="An inviting spread of artisan food" /></Wrap>
      <Wrap className="taste-section">
        <div><h2 className="big-type">Taste<br />craft</h2><ButtonLink to="tours">All<br />tours</ButtonLink></div>
        <div className="experience-list">
          {tours.map((tour) => <article className="experience-row" key={tour.title}>
            <img src={IMG(tour.image)} alt="" loading="lazy" />
            <div><span className="eyebrow">{tour.title}</span><p>{tour.text}</p></div>
            <span className="round-mark" aria-hidden="true">↗</span>
          </article>)}
        </div>
      </Wrap>
      <Wrap className="pantry-section">
        <p className="eyebrow accent">Artisanal provisions & goods</p>
        <div className="section-heading"><h2 className="section-title">Regional pantry</h2><ButtonLink to="shop" className="outline-button">View all<br />provisions</ButtonLink></div>
        {products.length ? <div className="product-strip">{products.slice(0, 7).map((product) => <ProductCard key={product.id} product={product} compact onAdd={addToCart} />)}</div> : <p className="data-notice">{productError || 'The shop catalog is unavailable.'}</p>}
      </Wrap>
      <section className="purpose-section">
        <Wrap className="purpose-grid"><h2 className="big-type">Purpose</h2><div><p className="eyebrow">● Our philosophy</p><p className="purpose-copy">We champion heritage kitchens, artisan producers, and neighborhood trattorias. Every culinary walk is a celebration of authentic regional flavors and timeless generational recipes.</p><ButtonLink to="about">About<br />us</ButtonLink></div></Wrap>
      </section>
      <section className="journal-section"><Wrap><h2 className="big-type">Tasting<br />journal</h2><div className="journal-grid">{['tj1', 'tj2', 'tj3'].map((name) => <img key={name} src={IMG(name)} alt="A moment from a Gourmet Walk tasting" loading="lazy" />)}</div></Wrap></section>
      <Wrap className="bespoke-section">
        <div className="bespoke-images"><img src={IMG('table')} alt="A table set for a private tasting" loading="lazy" /><img src={IMG('wine')} alt="A glass of regional wine" loading="lazy" /></div>
        <div className="bespoke-caption"><h2 className="big-type">Bespoke</h2><div><ul className="eyebrow"><li>● Private tours</li><li>● Custom menus</li><li>● Corporate dining</li></ul><ButtonLink to="contact">Plan<br />an event</ButtonLink></div></div>
      </Wrap>
      <FAQ />
    </main>
  );
}

function Tours() {
  return (
    <main><Wrap className="page-wrap">
      <div className="eyebrow muted page-kicker"><span>Curated expeditions</span><span>[ 01 — Tours ]</span></div>
      <h1 className="section-title display-title">Culinary journeys through historic quarters & secret tasting rooms</h1>
      <div className="intro-copy"><p>We design intimate walking food tours, private cellar tastings, and bespoke culinary itineraries that immerse you in the authentic flavours, artisan traditions, and culinary heritage of the city.</p><p>Led by master sommeliers, culinary historians, and passionate local food writers. Limited to eight guests per departure to ensure unparalleled access to working kitchens and master producers.</p></div>
      <hr className="heavy-rule" />
      <p className="eyebrow">▪ Scheduled experiences</p>
      <h2 className="section-title tour-heading">Curated walking tours & chef tastings</h2>
      <div className="tour-grid">{tours.map((tour, index) => <article key={tour.title} className="tour-card"><img src={IMG(tour.image)} alt="" loading="lazy" /><div className="eyebrow accent">0{index + 1} / Small-group experience</div><h3>{tour.title}</h3><p>{tour.text}</p><ButtonLink to="book">Explore & book</ButtonLink></article>)}</div>
      <hr className="heavy-rule private-rule" />
      <div className="private-grid"><div><p className="eyebrow">Private & corporate experiences</p><h2 className="section-title">Tailored tours & executive culinary experiences</h2><p>Whether hosting key clients, rewarding high-performing teams, or celebrating an intimate milestone, our private dining journeys deliver unrivaled access to premier artisanal kitchens, private dining rooms, and master vintners.</p></div><div className="private-note"><strong>Custom itinerary inquiry</strong><p>Provide your event details and preferred dates. Our culinary concierge will assemble a personalized itinerary proposal within 24 hours.</p><ButtonLink to="contact">Plan a private tour</ButtonLink></div></div>
    </Wrap></main>
  );
}

function About() {
  return (
    <main><Wrap className="page-wrap">
      <div className="about-intro"><h1 className="section-title display-title">Our story & culinary ethos</h1><div><p className="eyebrow">The Gourmet Walk • Founded 2018</p><p>The Gourmet Walk was born from an uncompromising reverence for culinary heritage, neighborhood artisans, and the intimate stories simmered across generations. We bridge curious travelers with authentic culinary masters.</p><p className="muted">Every tasting journey is curated to celebrate living traditions, seasonal provenance, and community memory through guided walking explorations across hidden gastronomic enclaves.</p><ButtonLink to="tours">Explore the<br />journeys</ButtonLink></div></div>
      <p className="eyebrow accent makers-kicker">Roots & collaborations</p>
      <div className="makers-heading"><h2 className="section-title display-title">The purveyors<br />& kitchens</h2><p>Our guided walks are built upon deep-rooted bonds with neighborhood masters, heirloom growers, and family-owned ateliers who uphold culinary integrity through generations.</p></div>
      <div className="maker-grid">{makers.map((maker) => <article key={maker.name}><img src={IMG(maker.image)} alt="" loading="lazy" /><div className="maker-meta"><span>{maker.type}</span><span>{maker.year}</span></div><h3>{maker.name}</h3><p>{maker.text}</p></article>)}</div>
      <div className="ethos-grid"><h2 className="section-title">Our guided tour ethos</h2><div><p className="eyebrow accent">▪ Core principles & values</p><p>We believe food is culture, memory, and heritage. Every culinary journey connects guests directly with master artisans, family-run kitchens, and generational recipes while honoring the communities we explore.</p><ul><li><b>Small group intimacy:</b> Capped at eight guests for an immersive connection with kitchen masters.</li><li><b>Cultural respect:</b> Dedicated to preserving traditional foodways and supporting authentic local purveyors.</li><li><b>Sensory discovery:</b> Multi-layered tastings designed to engage aroma, texture, history, and terroir.</li></ul><ButtonLink to="tours">Explore our tours</ButtonLink></div></div>
    </Wrap></main>
  );
}

function InquiryForm() {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [selectedExperiences, setSelectedExperiences] = useState([]);
  const [dietary, setDietary] = useState('None');
  const experiences = ['Private Food Walk', 'Bespoke Multi-Day Itinerary', 'Corporate Dining Event', 'Chef’s Table & Tasting Masterclass'];

  function toggleExperience(value) {
    setSelectedExperiences((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submitInquiry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus('submitting');
    setMessage('');
    const formData = new FormData(form);
    const inquiry = Object.fromEntries(formData.entries());
    inquiry.experienceTypes = selectedExperiences;
    inquiry.dietaryRequirements = dietary;
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inquiry),
      });
      const result = await readApiResponse(response);
      setStatus('success');
      setMessage('Thank you — our concierge will reply within 24 business hours.');
      form.reset();
      setSelectedExperiences([]);
      setDietary('None');
    } catch (error) {
      setStatus('error');
      setMessage(error.message === 'Failed to fetch'
        ? 'The booking service is unavailable. Start the API server and check your MySQL setup.'
        : error.message);
    }
  }

  return (
    <form className="inquiry-form" onSubmit={submitInquiry}>
      <div className="form-row"><Field label="First name" name="firstName" required /><Field label="Last name" name="lastName" required /></div>
      <div className="form-row"><Field label="Email address" name="email" type="email" required /><Field label="Phone number" name="phone" type="tel" /></div>
      <fieldset><legend>Experience type * (choose at least one)</legend>{experiences.map((experience) => <label className="check-option" key={experience}><input type="checkbox" checked={selectedExperiences.includes(experience)} onChange={() => toggleExperience(experience)} />{experience}</label>)}</fieldset>
      {selectedExperiences.length === 0 && status !== 'idle' && <p className="form-hint">Choose at least one experience type.</p>}
      <div className="form-row"><Field label="Preferred date" name="preferredDate" type="date" /><Field label="Party size" name="partySize" type="number" min="1" max="100" /></div>
      <label className="form-field">Dietary requirements & preferences<select value={dietary} onChange={(event) => setDietary(event.target.value)}><option>None</option><option>Vegetarian</option><option>Vegan</option><option>Gluten-free</option><option>Other — please explain in notes</option></select></label>
      <label className="form-field">Specific interests, neighborhoods or notes<textarea name="notes" rows="4" maxLength="3000" /></label>
      <button className="button submit-button" type="submit" disabled={status === 'submitting'}>{status === 'submitting' ? 'Submitting…' : 'Submit inquiry'}</button>
      {message && <p role="status" className={`form-message ${status}`}>{message}</p>}
    </form>
  );
}

function Field({ label, name, type = 'text', required = false, ...props }) {
  return <label className="form-field">{label}{required && ' *'}<input name={name} type={type} required={required} {...props} /></label>;
}

function BusinessMap({ business, error }) {
  const locationIsValid = Number.isFinite(business?.latitude) && Number.isFinite(business?.longitude);
  const mapEmbedUrl = locationIsValid
    ? `https://maps.google.com/maps?hl=en&q=${business.latitude},${business.longitude}&z=15&output=embed`
    : '';

  const directionsUrl = business?.directionsUrl || (locationIsValid
    ? `https://www.google.com/maps/dir/?api=1&destination=${business.latitude},${business.longitude}`
    : '');

  return (
    <div>
      {locationIsValid
        ? <iframe
          className="interactive-map"
          src={mapEmbedUrl}
          title={business.locationIsReference
            ? 'Google Map showing an approximate Chicago city reference, not a verified tour meeting point'
            : 'Google Map showing the configured Gourmet Walk meeting point'}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        : <div className="map-placeholder map-unconfigured">
          <strong>Meeting point not configured</strong>
          <p>{error || 'Set BUSINESS_LATITUDE and BUSINESS_LONGITUDE to the verified meeting point before deploying the map.'}</p>
        </div>}
      {directionsUrl && <a className="directions-link" href={directionsUrl} target="_blank" rel="noreferrer">Open directions ↗</a>}
      {business?.locationIsReference && <p className="map-address">Approximate Chicago city reference only; this is not a verified business address or tour meeting point.</p>}
      {!business?.locationIsReference && business?.address && <p className="map-address">{business.address}</p>}
    </div>
  );
}

function Contact({ business, businessError }) {
  return (
    <main>
      <Wrap className="contact-intro"><h1 className="section-title display-title">Concierge & private tours</h1><div><p className="eyebrow bordered-label">Bespoke culinary inquiries</p><p className="contact-lead">Whether you require custom culinary itineraries, private cellar buyouts, corporate dining curation, or offline payment arrangements, our dedicated concierge team orchestrates every detail with unmatched gastronomic precision.</p><p className="eyebrow">Direct desk assistance</p><p className="muted">Personalized itinerary consultation within 24 hours of inquiry.</p><p className="eyebrow">Offline & corporate accounts</p><p className="muted">Direct bank transfers, corporate billing invoices, and private group contracts accommodated upon request.</p></div></Wrap>
      <section className="contact-panel"><Wrap className="contact-grid"><div><p className="eyebrow">▪ Custom itineraries & private walks</p><h2 className="section-title display-title">Plan your private food walk</h2><p>Whether you require a bespoke culinary itinerary, an intimate private food tour, or an exclusive corporate dining experience, our curators tailor every tasting, pairing, and neighborhood route to your exact preferences.</p><p className="eyebrow">Experience types</p><p className="muted">Private Tastings, Corporate Retreats, Chef Masterclasses & Full-Day Gastronomic Journeys</p><p className="eyebrow">Direct response</p><p className="muted">All inquiries receive a personalized consultation and curated route proposal within 24 business hours.</p></div><InquiryForm /></Wrap></section>
      <Wrap className="location-section"><p className="eyebrow accent">Concierge & location</p><h2 className="section-title display-title">Direct inquiries & meeting guidance</h2><div className="location-grid"><div><p className="eyebrow accent">Concierge desk & departure point</p><h3>{business?.locationLabel || business?.address || 'Meeting point details shared after booking'}</h3><p className="muted">{business?.locationIsReference ? 'This approximate Chicago reference is not the verified business address. The actual tour meeting point will be confirmed with each reservation.' : 'Tour meeting point details are confirmed with each reservation.'}</p><p className="eyebrow accent">Operating hours</p><h3>{business?.hours || 'Hours vary by experience'}</h3><p className="muted">Private culinary guides and sommelier appointments are available upon request.</p><a className="email-link" href="mailto:experiences@thegourmetwalk.com">experiences@thegourmetwalk.com</a></div><BusinessMap business={business} error={businessError} /></div></Wrap>
    </main>
  );
}

function Portfolio() {
  return <main><Wrap className="page-wrap"><h1 className="section-title display-title portfolio-title">Portfolio</h1><div className="portfolio-grid">{portfolioItems.map(([image, title, description], index) => <article key={title}><img src={IMG(image)} alt="" loading="lazy" /><div className="portfolio-heading"><h2>{title}</h2><span>0{index + 1}</span></div><p>{description}</p></article>)}</div></Wrap></main>;
}

function Shop({ products, error, addToCart }) {
  const [category, setCategory] = useState('All Products');
  const categories = ['All Products', 'Gourmet Foods', 'Culinary Merchandise', 'Cookbooks'];
  const visibleProducts = category === 'All Products' ? products : products.filter((product) => product.category === category);
  return (
    <main><Wrap className="shop-page">
      <p className="breadcrumb"><Link to="home">Home</Link> › All products</p>
      <div className="shop-banner"><img src={IMG('shopbanner')} alt="Artisan provisions and gourmet goods" /></div>
      <h1 className="shop-title">{category}</h1>
      <div className="shop-layout"><aside className="shop-sidebar"><strong>Browse by</strong>{categories.map((item) => <button key={item} type="button" className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}<p className="eyebrow">Thoughtfully sourced</p><p className="muted">Every item celebrates the makers and flavors we love to share.</p></aside>      <div><p className="product-count">{error ? 'Catalog unavailable' : `${visibleProducts.length} products`}</p>{error ? <p className="data-notice">{error}</p> : visibleProducts.length ? <div className="shop-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} />)}</div> : <p className="data-notice">{products.length ? 'No products in this collection yet.' : 'The shop catalog is being loaded.'}</p>}</div></div>
    </Wrap></main>
  );
}

function CartPage({ products, cart, setCart, currency }) {
  const lines = cart.map(({ id, quantity }) => {
    const product = products.find((item) => item.id === id);
    return product ? { product, quantity, unitPrice: Math.round(Number(product.price) * 100) } : null;
  }).filter(Boolean);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  function setQuantity(id, quantity) {
    setCart((current) => quantity < 1
      ? current.filter((item) => item.id !== id)
      : current.map((item) => item.id === id ? { ...item, quantity: Math.min(quantity, 20) } : item));
  }

  return (
    <main><Wrap className="cart-page">
      <p className="eyebrow accent">Artisanal provisions</p><h1 className="section-title display-title">Your cart</h1>
      {cart.length === 0
      ? <div className="cart-empty"><p>Your basket is waiting for something delicious.</p><ButtonLink to="shop">Explore the shop</ButtonLink></div>
      : <div className="cart-layout"><div className="cart-lines">{lines.map(({ product, quantity, unitPrice }) => <article className="cart-line" key={product.id}><img src={product.imageUrl || IMG(product.id)} alt={product.name} /><div className="cart-line-info"><h2>{product.name}</h2><p>{formatMoney(unitPrice, currency)}</p><label>Quantity<input type="number" min="1" max="20" value={quantity} onChange={(event) => setQuantity(product.id, Number(event.target.value))} /></label></div><strong>{formatMoney(unitPrice * quantity, currency)}</strong><button className="text-button" type="button" onClick={() => setQuantity(product.id, 0)}>Remove</button></article>)}</div><aside className="cart-summary"><h2 className="section-title">Order summary</h2><div><span>Subtotal</span><strong>{formatMoney(subtotal, currency)}</strong></div><p>Taxes and delivery are calculated securely at checkout.</p><ButtonLink to="checkout" className="full-button">Continue to checkout</ButtonLink><Link to="shop" className="continue-shopping">Continue shopping</Link></aside></div>}
    </Wrap></main>
  );
}

function Checkout({ products, cart, setCart, commerceConfig }) {
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(createRequestToken);
  const [confirmationToken, setConfirmationToken] = useState(createAccessToken);

  useEffect(() => {
    let active = true;
    if (cart.length === 0) {
      setQuote(null);
      setQuoteError('');
      return () => { active = false; };
    }
    fetch('/api/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    })
      .then(readApiResponse)
      .then((result) => {
      if (active) {
        setQuote(result);
        setQuoteError('');
      }
      })
      .catch((error) => {
      if (active) setQuoteError(error.message === 'Failed to fetch'
        ? 'Checkout service is unavailable. Please try again later.'
        : error.message);
      });
    return () => { active = false; };
  }, [cart]);

  async function submitCheckout(event) {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const customer = Object.fromEntries(formData.entries());
    try {
      const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ customer, items: cart, confirmationToken }),
      });
      const order = await readApiResponse(response);
      if (order.checkoutUrl) {
      window.location.assign(order.checkoutUrl);
      return;
      }
      setCart([]);
      setStatus('success');
      setMessage(order.testModeNotice || 'Your order has been received.');
      window.location.hash = `#order?reference=${encodeURIComponent(order.reference)}&token=${encodeURIComponent(order.confirmationToken)}`;
      setIdempotencyKey(createRequestToken());
      setConfirmationToken(createAccessToken());
    } catch (error) {
      setStatus('error');
      setMessage(error.message === 'Failed to fetch'
      ? 'Checkout service is unavailable. Your payment was not processed.'
      : error.message);
    }
  }

  const validCart = cart.length > 0 && cart.every(({ id }) => products.some((product) => product.id === id));
  const currency = commerceConfig?.currency || 'INR';

  return (
    <main><Wrap className="checkout-page">
      <p className="breadcrumb"><Link to="cart">Your cart</Link> › Secure checkout</p>
      <h1 className="section-title display-title">Delivery & checkout</h1>
      {window.location.hash.includes('payment=cancelled') && <p className="form-message error">Payment was cancelled. No charge was made; you can safely try again.</p>}
      {cart.length === 0
      ? <div className="cart-empty"><p>Your cart is empty.</p><ButtonLink to="shop">Visit the shop</ButtonLink></div>
      : <div className="checkout-layout"><form className="checkout-form" onSubmit={submitCheckout}><h2 className="section-title">Customer & delivery details</h2><div className="form-row"><Field label="First name" name="firstName" required autoComplete="given-name" /><Field label="Last name" name="lastName" required autoComplete="family-name" /></div><div className="form-row"><Field label="Email" name="email" type="email" required autoComplete="email" /><Field label="Phone" name="phone" type="tel" required autoComplete="tel" /></div><Field label="Address line 1" name="addressLine1" required autoComplete="address-line1" /><Field label="Address line 2" name="addressLine2" autoComplete="address-line2" /><div className="form-row"><Field label="City" name="city" required autoComplete="address-level2" /><Field label="State / region" name="region" required autoComplete="address-level1" /></div><div className="form-row"><Field label="Postal code" name="postalCode" required autoComplete="postal-code" /><label className="form-field">Country<select name="country" autoComplete="country-name" defaultValue="India" required><option>India</option><option>United States</option><option>United Kingdom</option><option>Canada</option><option>Australia</option><option>Other — enter in address line 2</option></select></label></div>{message && status !== 'success' && <p role="alert" className={`form-message ${status}`}>{message}</p>}{quoteError && <p className="admin-error" role="alert">{quoteError}</p>}<button type="submit" className="button submit-button" disabled={status === 'submitting' || !quote || !validCart}>{status === 'submitting' ? 'Preparing secure checkout…' : commerceConfig?.paymentMode === 'stripe' ? 'Continue to secure payment' : 'Place test order'}</button>{commerceConfig?.demoPaymentsEnabled && <p className="payment-disclaimer">Test checkout is enabled — no payment is collected. Configure Stripe test keys to enable real hosted test payments.</p>}</form><aside className="cart-summary"><h2 className="section-title">Order summary</h2>{quote ? <><div className="checkout-items">{quote.items.map((item) => <div key={item.id}><span>{item.name} × {item.quantity}</span><strong>{formatMoney(item.unitPrice * item.quantity, currency)}</strong></div>)}</div><div><span>Subtotal</span><strong>{formatMoney(quote.totals.subtotal, currency)}</strong></div><div><span>Tax</span><strong>{formatMoney(quote.totals.tax, currency)}</strong></div><div><span>Shipping</span><strong>{quote.totals.shipping === 0 ? 'Free' : formatMoney(quote.totals.shipping, currency)}</strong></div><div className="total-row"><span>Total</span><strong>{formatMoney(quote.totals.total, currency)}</strong></div></> : <p>{quoteError || 'Calculating your order…'}</p>}</aside></div>}
    </Wrap></main>
  );
}

function OrderConfirmation() {
  const parameters = readHashParams();
  const reference = parameters.get('reference') || '';
  const token = parameters.get('token') || '';
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!reference || !token) {
      setError('Order confirmation link is incomplete.');
      setLoading(false);
      return () => { active = false; };
    }
    async function loadOrder(attempt = 0) {
      try {
      const response = await fetch(`/api/orders/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`);
      const result = await readApiResponse(response);
      if (!active) return;
      setOrder(result);
      setLoading(false);
      if (result.paymentStatus === 'unpaid' && attempt < 4) {
        window.setTimeout(() => loadOrder(attempt + 1), 2500);
      }
      } catch (requestError) {
      if (active) {
        setError(requestError.message);
        setLoading(false);
      }
      }
    }
    loadOrder();
    return () => { active = false; };
  }, [reference, token]);

  return <main><Wrap className="confirmation-page">{loading ? <p role="status">Loading your order confirmation…</p> : error ? <div className="cart-empty"><h1 className="section-title">Confirmation unavailable</h1><p>{error}</p><ButtonLink to="shop">Return to shop</ButtonLink></div> : order && <div className="confirmation-card"><p className="eyebrow accent">Order {order.reference}</p><h1 className="section-title display-title">{order.paymentStatus === 'paid' || order.paymentStatus === 'test_paid' ? 'Thank you for your order' : 'Order received'}</h1><p>{order.paymentStatus === 'test_paid' ? 'This test-mode order was saved successfully. No payment was collected.' : order.paymentStatus === 'paid' ? 'Your payment has been verified.' : 'Your order is awaiting payment verification. This page will refresh automatically.'}</p><p className="order-status">Order status: <strong>{order.status}</strong> · Payment: <strong>{order.paymentStatus}</strong></p><div className="confirmation-items">{order.items.map((item) => <div key={item.id}><span>{item.name} × {item.quantity}</span><strong>{formatMoney(item.unitPrice * item.quantity, order.currency)}</strong></div>)}</div><div className="confirmation-total"><span>Total</span><strong>{formatMoney(order.total, order.currency)}</strong></div><ButtonLink to="home">Continue exploring</ButtonLink></div>}</Wrap></main>;
}

function BookingConfirmation({ business }) {
  const parameters = readHashParams();
  const reference = parameters.get('reference') || '';
  const token = parameters.get('token') || '';
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancellationEmail, setCancellationEmail] = useState('');

  useEffect(() => {
    let active = true;
    if (!reference || !token) {
      setError('Booking confirmation link is incomplete.');
      return () => { active = false; };
    }
    fetch(`/api/bookings/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}`)
      .then(readApiResponse)
      .then((result) => { if (active) setBooking(result); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [reference, token]);

  async function cancelBooking(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cancellationEmail, cancellationToken: token }),
      });
      await readApiResponse(response);
      setCancelled(true);
      setBooking((current) => ({ ...current, status: 'cancelled' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const timeZone = business?.timeZone || 'America/Chicago';
  return <main><Wrap className="confirmation-page"><div className="confirmation-card"><p className="eyebrow accent">Reservation {reference || 'details'}</p><h1 className="section-title display-title">{cancelled || booking?.status === 'cancelled' ? 'Booking cancelled' : 'Tour request received'}</h1>{error && <p className="admin-error" role="alert">{error}</p>}{booking && <><p>Your reservation is <strong>{booking.status}</strong>; it is not confirmed until the concierge approves it.</p><dl className="booking-confirm-details"><div><dt>Experience</dt><dd>{booking.tourName}</dd></div><div><dt>Date & time</dt><dd>{formatBusinessDateTime(booking.startsAt, timeZone)} ({timeZone})</dd></div><div><dt>Guests</dt><dd>{booking.guestCount}</dd></div><div><dt>Estimated total</dt><dd>{formatMoney(booking.totalMinor, booking.currency)}</dd></div></dl><p className="muted">You may cancel at least {booking.cancellationHours} hours before the tour begins.</p>{booking.status !== 'cancelled' && <form className="cancel-booking-form" onSubmit={cancelBooking}><Field label="Booking email (to confirm cancellation)" name="cancellationEmail" type="email" required value={cancellationEmail} onChange={(event) => setCancellationEmail(event.target.value)} /><button className="button outline-button" type="submit" disabled={busy}>{busy ? 'Cancelling…' : 'Cancel reservation'}</button></form>}</>}<p>Keep this private confirmation link to view or cancel your reservation.</p><ButtonLink to="book">Browse tour schedules</ButtonLink></div></Wrap></main>;
}

function Book({ tours, tourError, commerceConfig, business }) {
  const timeZone = business?.timeZone || 'America/Chicago';
  const [date, setDate] = useState(() => getBusinessDate(new Date(), timeZone));
  const [availabilityInitialized, setAvailabilityInitialized] = useState(false);
  const [dayTours, setDayTours] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState(null);
  const [guestCount, setGuestCount] = useState(1);
  const [bookingMessage, setBookingMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createRequestToken);
  const [cancellationToken, setCancellationToken] = useState(createRequestToken);

  useEffect(() => {
    if (availabilityInitialized || !tours.length) return;
    const slots = tours.flatMap((tour) => (tour.slots || [])
      .filter((slot) => slot.availableGuests >= tour.minimumGuests));
    if (slots.length > 0 && !slots.some((slot) => getBusinessDate(slot.startsAt, timeZone) === date)) {
      slots.sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
      setDate(getBusinessDate(slots[0].startsAt, timeZone));
    }
    setAvailabilityInitialized(true);
  }, [availabilityInitialized, date, timeZone, tours]);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    fetch(`/api/tours?date=${encodeURIComponent(date)}`)
      .then(readApiResponse)
      .then((result) => { if (active) setDayTours(result); })
      .catch((error) => {
        if (active) {
          setBookingMessage(error.message === 'Failed to fetch'
            ? 'Tour availability could not be reached. Please try again later.'
            : error.message);
          setDayTours([]);
        }
      })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [date]);

  function chooseSlot(tour, slot) {
    setSelected({ tour, slot });
    setGuestCount(tour.minimumGuests);
    setBookingMessage('');
    setIdempotencyKey(createRequestToken());
    setCancellationToken(createRequestToken());
  }

  async function submitBooking(event) {
    event.preventDefault();
    setSubmitting(true);
    setBookingMessage('');
    const customer = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        ...customer,
        tourId: selected.tour.id,
        slotId: selected.slot.id,
        guestCount,
        cancellationToken,
      }),
      });
      const result = await readApiResponse(response);
      window.location.hash = `#booking-confirm?reference=${encodeURIComponent(result.reference)}&token=${encodeURIComponent(result.cancellationToken)}`;
    } catch (error) {
      setBookingMessage(error.message === 'Failed to fetch' ? 'Booking service is unavailable. Try again later.' : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTotal = selected ? selected.tour.priceMinor * guestCount : 0;
  const today = getBusinessDate(new Date(), timeZone);

  return (
    <main><Wrap className="book-page"><p className="breadcrumb"><Link to="home">Home</Link> › Experiences</p><div className="booking-intro"><p className="eyebrow accent">Small-group food journeys</p><h1 className="section-title display-title">Explore & reserve a tour</h1><p>Choose an experience and date to see its published schedule and available seats. Reservations stay pending until confirmed by our concierge.</p></div><div className="tour-date-filter"><label className="form-field">Choose a date<input type="date" min={today} value={date} onChange={(event) => { setDate(event.target.value); setSelected(null); setBookingMessage(''); }} /></label><p className="muted">All times are shown in {timeZone}. Your meeting details will be shared after the concierge confirms your reservation.</p></div>{loadingSlots && <p role="status">Checking tour availability…</p>}{tourError && <p className="data-notice">{tourError}</p>}{bookingMessage && !selected && <p className="admin-error" role="alert">{bookingMessage}</p>}{!loadingSlots && dayTours.length === 0 && <p className="admin-empty">{tours.length ? 'No tours are available on this date. Check another date or contact our concierge.' : 'No tours are available yet. Please check back soon.'}</p>}<div className="booking-grid">{dayTours.map((tour, index) => <article className="booking-card" key={tour.id}><img src={IMG(['b1', 'b2', 'b3'][index % 3])} alt="" /><h2>{tour.name}</h2><p className="tour-price">{formatMoney(tour.priceMinor, tour.currency)} <span>per guest</span></p><p>{tour.durationMinutes} minutes · {tour.minimumGuests}–{tour.maximumGuests} guests</p><p className="muted">{tour.description}</p><div className="slot-list"><strong>Available times</strong>{tour.slots.length ? tour.slots.map((slot) => <button key={slot.id} type="button" disabled={slot.availableGuests < tour.minimumGuests} className={selected?.slot.id === slot.id ? 'selected-slot' : ''} onClick={() => chooseSlot(tour, slot)}>{new Date(slot.startsAt).toLocaleTimeString([], { timeZone, hour: 'numeric', minute: '2-digit' })} · {slot.availableGuests} seats</button>) : <p className="muted">No remaining times for this date.</p>}</div></article>)}</div>{selected && <section className="booking-form-panel"><p className="eyebrow accent">Reserve a place</p><h2 className="section-title">{selected.tour.name}</h2><p>{formatBusinessDateTime(selected.slot.startsAt, timeZone)} ({timeZone}) · {formatMoney(selected.tour.priceMinor, selected.tour.currency)} per guest</p><form className="inquiry-form" onSubmit={submitBooking}><div className="form-row"><Field label="First name" name="firstName" required /><Field label="Last name" name="lastName" required /></div><div className="form-row"><Field label="Email" name="email" type="email" required /><Field label="Phone" name="phone" type="tel" required /></div><label className="form-field">Guests<input type="number" min={selected.tour.minimumGuests} max={Math.min(selected.tour.maximumGuests, selected.slot.availableGuests)} value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} required /></label><label className="form-field">Dietary requirements<select name="dietaryRequirements" defaultValue="None"><option>None</option><option>Vegetarian</option><option>Vegan</option><option>Gluten-free</option><option>Other — explain in notes</option></select></label><label className="form-field">Notes<textarea name="notes" rows="3" maxLength="3000" /></label><p className="booking-total">Estimated total <strong>{formatMoney(selectedTotal, selected.tour.currency)}</strong></p>{bookingMessage && <p className="admin-error" role="alert">{bookingMessage}</p>}<button className="button submit-button" type="submit" disabled={submitting || guestCount < selected.tour.minimumGuests || guestCount > selected.tour.maximumGuests || guestCount > selected.slot.availableGuests}>{submitting ? 'Requesting reservation…' : 'Request reservation'}</button><p className="payment-disclaimer">No payment is collected for tour reservations. Your request remains pending until our concierge confirms it.</p></form></section>}<div className="book-note"><h2 className="section-title">Made to be savored</h2><p>Have a particular date or an idea you’d like to explore? Tell our concierge what you have in mind.</p><ButtonLink to="contact">Plan a private experience</ButtonLink></div><span className="sr-only">Payment mode: {commerceConfig?.paymentMode || 'unavailable'}</span></Wrap></main>
  );
}

const INQUIRY_STATUSES = ['new', 'contacted', 'confirmed', 'closed'];

function formatExperienceTypes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatInquiryDate(value) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Not specified'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function InquiryReply({ inquiry, onSent }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendReply(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const result = await readApiResponse(response);
      setMessage('');
      setEnabled(false);
      setFeedback(`Reply sent to ${result.sentTo}.`);
      onSent(inquiry.id, result.status);
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="inquiry-reply">
    <label className="reply-toggle">
      <input type="checkbox" checked={enabled} onChange={(event) => {
        setEnabled(event.target.checked);
        setFeedback('');
      }} />
      <span>Reply to this inquiry by email ({inquiry.email})</span>
    </label>
    {enabled && <form className="reply-form" onSubmit={sendReply}>
      <label className="form-field">Your reply<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength="5000" rows="5" required /></label>
      <button className="button" type="submit" disabled={busy || !message.trim()}>{busy ? 'Sending reply…' : 'Send email reply'}</button>
    </form>}
    {feedback && <p className={feedback.startsWith('Reply sent') ? 'reply-success' : 'admin-error'} role={feedback.startsWith('Reply sent') ? 'status' : 'alert'}>{feedback}</p>}
  </div>;
}

function AdminPage({ commerceConfig, business }) {
  const [auth, setAuth] = useState('checking');
  const [inquiries, setInquiries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminTours, setAdminTours] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [section, setSection] = useState('inquiries');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAdminData() {
    const endpoints = ['/api/admin/inquiries', '/api/admin/orders', '/api/admin/tours', '/api/admin/bookings'];
    const results = await Promise.all(endpoints.map(async (url) => {
      const response = await fetch(url);
      return readApiResponse(response);
    }));
    setInquiries(results[0]);
    setOrders(results[1]);
    setAdminTours(results[2]);
    setBookings(results[3]);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/session')
      .then(async (response) => response.status === 401 ? null : readApiResponse(response))
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          setAuth('signed-out');
          return;
        }
        setAuth('signed-in');
        await loadAdminData();
      })
      .catch((requestError) => {
        if (active) {
          setAuth('signed-out');
          setError(requestError.message === 'Failed to fetch'
            ? 'The admin service is unavailable. Check that the API server is running.'
            : requestError.message);
        }
      });
    return () => { active = false; };
  }, []);

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      await readApiResponse(response);
      setPassword('');
      setAuth('signed-in');
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message === 'Failed to fetch'
        ? 'The admin service is unavailable. Check that the API server is running.'
        : requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' });
      if (!response.ok) await readApiResponse(response);
      setInquiries([]);
      setOrders([]);
      setAdminTours([]);
      setBookings([]);
      setAuth('signed-out');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function adminRequest(url, method, data) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return readApiResponse(response);
  }

  async function changeInquiryStatus(id, status) {
    try {
      await adminRequest(`/api/admin/inquiries/${encodeURIComponent(id)}/status`, 'PATCH', { status });
      setInquiries((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function changeBookingStatus(id, status) {
    try {
      await adminRequest(`/api/admin/bookings/${encodeURIComponent(id)}/status`, 'PATCH', { status });
      setBookings((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function changeOrderStatus(reference, status) {
    try {
      await adminRequest(`/api/admin/orders/${encodeURIComponent(reference)}/status`, 'PATCH', { status });
      setOrders((current) => current.map((item) => item.reference === reference ? { ...item, status } : item));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function createTour(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await adminRequest('/api/admin/tours', 'POST', {
        ...data,
        durationMinutes: Number(data.durationMinutes),
        minimumGuests: Number(data.minimumGuests),
        maximumGuests: Number(data.maximumGuests),
        currency: business?.tourCurrency || commerceConfig?.currency || 'INR',
      });
      form.reset();
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function createTourSlot(tourId, event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await adminRequest(`/api/admin/tours/${encodeURIComponent(tourId)}/slots`, 'POST', {
        startsAt: businessDateTimeToIso(String(data.get('startsAt')), business?.timeZone || 'America/Chicago'),
        capacity: Number(data.get('capacity')),
      });
      form.reset();
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function changeTour(tourId, active) {
    try {
      await adminRequest(`/api/admin/tours/${encodeURIComponent(tourId)}`, 'PATCH', { active });
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function changeSlot(slot, active, capacity = slot.capacity) {
    try {
      await adminRequest(`/api/admin/tour-slots/${encodeURIComponent(slot.id)}`, 'PATCH', {
        active,
        capacity,
      });
      await loadAdminData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const visibleInquiries = inquiries.filter((inquiry) => {
    const matchesStatus = filter === 'all' || inquiry.status === filter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [
      inquiry.firstName, inquiry.lastName, inquiry.email, inquiry.phone, inquiry.notes,
    ].some((value) => typeof value === 'string' && value.toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });
  const tourTimeZone = business?.timeZone || 'America/Chicago';
  const tourCurrency = business?.tourCurrency || commerceConfig?.currency || 'INR';

  if (auth === 'checking') return <main><Wrap className="admin-page"><p role="status">Checking administrator session…</p></Wrap></main>;

  if (auth === 'signed-out') {
    return <main className="admin-background"><Wrap className="admin-page"><div className="admin-login">
      <p className="eyebrow accent">The Gourmet Walk</p><h1 className="section-title display-title">Admin sign in</h1>
      <p className="muted">Manage contact requests, shop orders, tours and reservations.</p>
      <form className="admin-login-form" onSubmit={submitLogin}>
        <Field label="Username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button type="submit" className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div></Wrap></main>;
  }

  return <main className="admin-background"><Wrap className="admin-page">
    <div className="admin-title-row"><div><p className="eyebrow accent">Private concierge</p><h1 className="section-title display-title">Admin dashboard</h1><p className="muted">Manage guests, orders, tour listings and schedule availability.</p></div><button type="button" className="button outline-button" onClick={signOut} disabled={busy}>Sign out</button></div>
    <nav className="admin-tabs" aria-label="Admin sections">{[['inquiries', `Inquiries (${inquiries.length})`], ['orders', `Orders (${orders.length})`], ['tours', `Tours (${adminTours.length})`], ['bookings', `Bookings (${bookings.length})`]].map(([key, label]) => <button type="button" key={key} className={section === key ? 'selected' : ''} onClick={() => { setSection(key); setError(''); }}>{label}</button>)}</nav>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {section === 'inquiries' && <section className="admin-section"><h2 className="section-title">Contact inquiries</h2>
      <div className="admin-summary"><strong>{inquiries.length}</strong><span>Total inquiries</span><strong>{inquiries.filter((item) => item.status === 'new').length}</strong><span>Awaiting reply</span></div>
      <div className="admin-toolbar"><label className="form-field">Search inquiries<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone or notes" /></label><label className="form-field">Filter by status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
      {visibleInquiries.length === 0 ? <p className="admin-empty">{inquiries.length ? 'No inquiries match your search.' : 'No contact inquiries have been received yet.'}</p> : <div className="inquiry-list">{visibleInquiries.map((inquiry) => <article className="inquiry-card" key={inquiry.id}><div className="inquiry-heading"><div><p className="eyebrow accent">Inquiry #{inquiry.id}</p><h2>{inquiry.firstName} {inquiry.lastName}</h2></div><label className="form-field status-field">Status<select value={inquiry.status} onChange={(event) => changeInquiryStatus(inquiry.id, event.target.value)}>{INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div><div className="inquiry-contact"><a href={`mailto:${encodeURIComponent(inquiry.email)}`}>{inquiry.email}</a>{inquiry.phone && <a href={`tel:${encodeURIComponent(inquiry.phone)}`}>{inquiry.phone}</a>}<span>Received {formatInquiryDate(inquiry.createdAt)}</span></div><dl className="inquiry-details"><div><dt>Experience</dt><dd>{formatExperienceTypes(inquiry.experienceTypes).join(', ') || 'Not specified'}</dd></div><div><dt>Preferred date</dt><dd>{formatInquiryDate(inquiry.preferredDate)}</dd></div><div><dt>Party size</dt><dd>{inquiry.partySize || 'Not specified'}</dd></div><div><dt>Dietary needs</dt><dd>{inquiry.dietaryRequirements || 'None'}</dd></div></dl>{inquiry.notes && <div className="inquiry-notes"><strong>Notes</strong><p>{inquiry.notes}</p></div>}<InquiryReply inquiry={inquiry} onSent={(id, status) => setInquiries((current) => current.map((item) => item.id === id ? { ...item, status } : item))} /></article>)}</div>}
    </section>}
    {section === 'orders' && <section className="admin-section"><h2 className="section-title">Shop orders</h2>{orders.length === 0 ? <p className="admin-empty">No shop orders have been placed yet.</p> : <div className="inquiry-list">{orders.map((order) => {
      const items = formatExperienceTypes(order.items);
      return <article className="inquiry-card" key={order.reference}><div className="inquiry-heading"><div><p className="eyebrow accent">Order {order.reference}</p><h2>{order.firstName} {order.lastName}</h2></div><label className="form-field status-field">Fulfilment<select value={order.status} onChange={(event) => changeOrderStatus(order.reference, event.target.value)}><option value="pending">pending</option><option value="confirmed" disabled={!['paid', 'test_paid'].includes(order.paymentStatus)}>confirmed</option><option value="cancelled">cancelled</option></select></label></div><div className="inquiry-contact"><a href={`mailto:${encodeURIComponent(order.email)}`}>{order.email}</a><a href={`tel:${encodeURIComponent(order.phone)}`}>{order.phone}</a><span>Payment: {order.paymentStatus} ({order.paymentProvider})</span><span>{formatInquiryDate(order.createdAt)}</span></div><div className="inquiry-notes"><strong>Delivery address</strong><p>{[order.addressLine1, order.addressLine2, order.city, order.region, order.postalCode, order.country].filter(Boolean).join(', ')}</p></div><div className="inquiry-notes"><strong>Items</strong><p>{items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p><p>Total: {formatMoney(order.total, order.currency)}</p></div></article>;
    })}</div>}</section>}
    {section === 'tours' && <section className="admin-section">
      <h2 className="section-title">Tour availability</h2>
      <form className="tour-editor-form" onSubmit={createTour}>
        <p className="eyebrow accent">Add a published experience</p>
        <Field label="Tour name" name="name" required maxLength="150" />
        <label className="form-field">Description<textarea name="description" rows="3" maxLength="3000" required /></label>
        <div className="form-row">
          <Field label={`Price per guest (${tourCurrency})`} name="price" type="number" step="0.01" min="0" required />
          <Field label="Duration in minutes" name="durationMinutes" type="number" min="15" max="1440" defaultValue="120" required />
        </div>
        <div className="form-row">
          <Field label="Minimum guests" name="minimumGuests" type="number" min="1" max="50" defaultValue="1" required />
          <Field label="Maximum guests" name="maximumGuests" type="number" min="1" max="50" defaultValue="8" required />
        </div>
        <button className="button">Save tour</button>
      </form>
      {adminTours.length === 0
        ? <p className="admin-empty">No tours are published yet. Add real tour details above before opening schedule slots.</p>
        : <div className="admin-tour-list">{adminTours.map((tour) => <article className="inquiry-card" key={tour.id}>
          <div className="inquiry-heading">
            <div><p className="eyebrow accent">{formatMoney(tour.priceMinor, tour.currency)} per guest · {tour.durationMinutes} min</p><h2>{tour.name}</h2></div>
            <button type="button" className="button outline-button" onClick={() => changeTour(tour.id, !tour.active)}>{tour.active ? 'Unpublish' : 'Publish'}</button>
          </div>
          <p>{tour.description}</p>
          <p className="muted">{tour.minimumGuests}–{tour.maximumGuests} guests</p>
          <form className="slot-create-form" onSubmit={(event) => createTourSlot(tour.id, event)}>
            <label className="form-field">Open date & time ({tourTimeZone})
              <input type="datetime-local" name="startsAt" min={businessDateTimeInputValue(new Date(Date.now() + 60000), tourTimeZone)} required />
            </label>
            <Field label="Seat capacity" name="capacity" type="number" min="1" max="500" defaultValue={tour.maximumGuests} required />
            <button className="button">Open time slot</button>
          </form>
          {tour.slots.map((slot) => <div className="admin-slot" key={slot.id}>
            <span>{formatBusinessDateTime(slot.startsAt, tourTimeZone)} · {slot.reservedGuests}/{slot.capacity} seats reserved · {slot.active ? 'open' : 'closed'}</span>
            <input aria-label={`Capacity for ${formatBusinessDateTime(slot.startsAt, tourTimeZone)}`} type="number" min={Math.max(1, slot.reservedGuests)} max="500" defaultValue={slot.capacity} onBlur={(event) => { const capacity = Number(event.currentTarget.value); if (capacity !== slot.capacity) changeSlot(slot, slot.active, capacity); }} />
            <button type="button" className="text-button" onClick={() => changeSlot(slot, !slot.active)} disabled={slot.active && slot.reservedGuests > 0}>{slot.active ? 'Close slot' : 'Reopen slot'}</button>
          </div>)}
        </article>)}</div>}
    </section>}
    {section === 'bookings' && <section className="admin-section"><h2 className="section-title">Tour reservations</h2>{bookings.length === 0 ? <p className="admin-empty">No tour reservations have been received yet.</p> : <div className="inquiry-list">{bookings.map((booking) => <article className="inquiry-card" key={booking.id}><div className="inquiry-heading"><div><p className="eyebrow accent">Reservation {booking.reference}</p><h2>{booking.firstName} {booking.lastName} · {booking.guestCount} guests</h2></div><label className="form-field status-field">Status<select value={booking.status} onChange={(event) => changeBookingStatus(booking.id, event.target.value)}>{['pending', 'confirmed', 'cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div><div className="inquiry-contact"><a href={`mailto:${encodeURIComponent(booking.email)}`}>{booking.email}</a><a href={`tel:${encodeURIComponent(booking.phone)}`}>{booking.phone}</a><span>{booking.tourName}</span><span>{formatBusinessDateTime(booking.startsAt, tourTimeZone)} ({tourTimeZone})</span></div><dl className="inquiry-details"><div><dt>Guests</dt><dd>{booking.guestCount}</dd></div><div><dt>Total</dt><dd>{formatMoney(booking.totalMinor, booking.currency)}</dd></div><div><dt>Dietary needs</dt><dd>{booking.dietaryRequirements}</dd></div></dl>{booking.notes && <div className="inquiry-notes"><strong>Notes</strong><p>{booking.notes}</p></div>}</article>)}</div>}</section>}
  </Wrap></main>;
}

const PAGES = {
  home: Home, tours: Tours, about: About, contact: Contact, portfolio: Portfolio,
  shop: Shop, cart: CartPage, checkout: Checkout, order: OrderConfirmation,
  book: Book, 'booking-confirm': BookingConfirmation, admin: AdminPage,
};

function readCartFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === 'string'
      && Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const readPage = () => {
    const hash = window.location.hash.slice(1).split('?')[0];
    return PAGES[hash] ? hash : 'home';
  };
  const [page, setPage] = useState(readPage);
  const [products, setProducts] = useState([]);
  const [productError, setProductError] = useState('');
  const [cart, setCart] = useState(readCartFromStorage);
  const [commerceConfig, setCommerceConfig] = useState(null);
  const [tours, setTours] = useState([]);
  const [tourError, setTourError] = useState('');
  const [business, setBusiness] = useState(null);
  const [businessError, setBusinessError] = useState('');

  useEffect(() => {
    const updatePage = () => {
      setPage(readPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);

  useEffect(() => {
    document.title = `${page === 'home' ? '' : `${NAV.find(([key]) => key === page)?.[1] || page} · `}The Gourmet Walk`;
  }, [page]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    let active = true;
    const fetchResource = async (url, setter, errorSetter, fallback) => {
      try {
        const response = await fetch(url);
        const value = await readApiResponse(response);
        if (active) setter(value);
      } catch (error) {
        if (active) errorSetter(error.message === 'Failed to fetch' ? fallback : error.message);
      }
    };
    fetchResource('/api/products', setProducts, setProductError, 'The shop catalog is unavailable.');
    fetchResource('/api/checkout/config', setCommerceConfig, setProductError, 'Checkout settings could not be loaded.');
    fetchResource('/api/tours', setTours, setTourError, 'Tour schedules could not be loaded. Please contact the concierge.');
    fetchResource('/api/config/business', setBusiness, setBusinessError, 'Business location details could not be loaded.');
    return () => { active = false; };
  }, []);

  function addToCart(id) {
    setCart((current) => {
      const exists = current.some((item) => item.id === id);
      return exists
        ? current.map((item) => item.id === id ? { ...item, quantity: Math.min(item.quantity + 1, 20) } : item)
        : [...current, { id, quantity: 1 }];
    });
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const Page = PAGES[page];
  const pageProps = {
    products, error: productError, productError, addToCart, cart, setCart, cartCount,
    currency: commerceConfig?.currency || 'INR', commerceConfig,
    tours, tourError, business, businessError,
  };
  return <><Header page={page} cartCount={cartCount} /><Page {...pageProps} /><Footer page={page} business={business} /></>;
}
