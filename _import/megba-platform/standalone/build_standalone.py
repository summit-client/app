#!/usr/bin/env python3
"""Generate a self-contained MEGBA landing page (single HTML file).

The logo PNG is inlined as a base64 data URI so the file has zero external
dependencies, it works when opened directly, dragged onto Netlify, or pasted
into a Wix "Embed HTML / Custom Code" element.
"""
import base64
import pathlib

ROOT = pathlib.Path("/Users/work/New Folder With Items/megba-platform")
OUT = ROOT / "standalone" / "megba-standalone.html"
OUT.parent.mkdir(parents=True, exist_ok=True)

MAPLE = ("M383.8 351.7c2.5-2.8 105.9-92.8 105.9-92.8l-17.5-8.9c-10.3-4.7-8.3-11.1-6-19.4l15.4-56.4"
         "-51.9 11.1c-5.2 1-8.6-2.3-9.4-5.4l-6.7-23.5-41.1 46c-5.8 6.1-17.7 6.1-14.1-8.9l17.7-93.9"
         "-27.6 15.4c-7.7 4.4-15.4 5.1-19.9-3.2L256 24l-45.4 87.2c-4.5 8.4-12.2 7.7-19.9 3.2l-27.6-15.4"
         "17.7 93.9c3.6 15-8.3 15-14.1 8.9l-41.1-46-6.7 23.5c-.8 3.1-4.2 6.4-9.4 5.4l-51.9-11.1 15.4 56.4"
         "c2.3 8.3 4.3 14.7-6 19.4L22.3 258.9s103.4 90 105.9 92.8c5.1 4.4 3.4 7 1.7 12.8l-4.5 14.9 88.5-15.1"
         "c4.9 0 8.4 2.8 8.3 6.7l-2.4 96.1h16.4l-2.4-96.1c-.1-3.9 3.4-6.7 8.3-6.7l88.5 15.1-4.5-14.9"
         "c-1.7-5.8-3.4-8.4 1.7-12.8z")

# Vector logo emblem (globe + grid + nodes + maple + family + mountain).
EMBLEM = ('<svg class="emblem" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">'
          '<defs><clipPath id="mg"><circle cx="60" cy="62" r="46"/></clipPath></defs>'
          '<circle cx="60" cy="62" r="46" fill="#fff" stroke="#c3ccc6" stroke-width="1.4"/>'
          '<g clip-path="url(#mg)" stroke="#dbe1dc" stroke-width="1">'
          '<line x1="14" y1="48" x2="106" y2="48"/><line x1="14" y1="62" x2="106" y2="62"/>'
          '<line x1="14" y1="76" x2="106" y2="76"/><ellipse cx="60" cy="62" rx="18" ry="46"/>'
          '<ellipse cx="60" cy="62" rx="34" ry="46"/><line x1="60" y1="16" x2="60" y2="108"/></g>'
          '<g fill="#9DB29A" stroke="#9DB29A" stroke-width="1">'
          '<line x1="92" y1="40" x2="99" y2="30"/><line x1="92" y1="40" x2="103" y2="44"/>'
          '<circle cx="92" cy="40" r="2.4"/><circle cx="99" cy="30" r="1.9"/><circle cx="103" cy="44" r="1.6"/></g>'
          '<g transform="translate(46.7 1.6) scale(0.052)" fill="#CB1F2A"><path d="' + MAPLE + '"/></g>'
          '<g fill="#8CA389"><circle cx="60" cy="52" r="5.4"/>'
          '<path d="M60 58C52 58 47 64 47 74l3 0c1-8 5-11 10-11s9 3 10 11l3 0c0-10-5-16-13-16z"/>'
          '<circle cx="46" cy="60" r="4.3"/><path d="M46 65c-6 0-10 5-10 13l3 0c1-6 4-9 7-9s6 3 7 9l3 0c0-8-4-13-10-13z"/>'
          '<circle cx="74" cy="60" r="4.3"/><path d="M74 65c-6 0-10 5-10 13l3 0c1-6 4-9 7-9s6 3 7 9l3 0c0-8-4-13-10-13z"/></g>'
          '<g clip-path="url(#mg)"><path d="M18 108 L44 78 L58 94 L70 82 L102 108 Z" fill="#c6cec9"/>'
          '<path d="M44 78 L58 94 L48 108 L30 108 Z" fill="#a9b3ad"/></g></svg>')

FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
           '<rect width="64" height="64" rx="14" fill="#1E3A2B"/>'
           '<circle cx="32" cy="33" r="23" fill="none" stroke="#9DB29A" stroke-width="1.4" opacity="0.5"/>'
           '<g fill="#DCE6D9"><circle cx="32" cy="30" r="3.1"/>'
           '<path d="M32 33.5c-4 0-7 3.2-7 8h3c.4-4 2-5.6 4-5.6s3.6 1.6 4 5.6h3c0-4.8-3-8-7-8z"/>'
           '<circle cx="24" cy="35" r="2.5"/><circle cx="40" cy="35" r="2.5"/></g>'
           '<g transform="translate(24.6 3.2) scale(0.0315)" fill="#CB1F2A"><path d="' + MAPLE + '"/></g>'
           '<path d="M13 53 L27 37 L35 45 L43 38 L51 53 Z" fill="#c9d1cc"/></svg>')
favicon_uri = "data:image/svg+xml;base64," + base64.b64encode(FAVICON.encode("utf-8")).decode("ascii")

# Official vector logo lockup, embedded so the file stays self-contained.
LOGO_SVG = (ROOT / "public" / "logo-megba.svg").read_text(encoding="utf-8")
logo_uri = "data:image/svg+xml;base64," + base64.b64encode(LOGO_SVG.encode("utf-8")).decode("ascii")

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mount Etna Global Behaviour Academy, Behaviour Science Without Borders</title>
<meta name="description" content="MEGBA equips schools, educators, families, technicians, and professionals with practical behaviour-science education, consultation, and multilingual digital learning grounded in Canadian standards of practice, shared internationally." />
<link rel="icon" href="__FAVICON__" />
<style>
:root{
  --forest:#1E3A2B; --forest-700:#14261B; --sage:#9DB29A; --sage-100:#E9EEE8;
  --ivory:#FFFFFF; --stone:#E6E8EA; --charcoal:#191B1D; --muted:#5c626b;
  --ember:#C25A34; --maple:#CB1F2A; --maple-600:#a5121c; --card:#ffffff; --border:#E6E8EA;
  --radius:14px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--charcoal);background:var(--ivory);line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:inherit;font-weight:700;letter-spacing:-.012em;line-height:1.14;margin:0}
.hero h1{line-height:1.08}
a{color:inherit}
img{max-width:100%;display:block}
.container{max-width:1160px;margin:0 auto;padding:0 22px}
.eyebrow{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:var(--ember);margin:0 0 12px}
.btn{display:inline-flex;align-items:center;gap:.5rem;border:0;border-radius:999px;padding:13px 26px;
  font-size:.95rem;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s,transform .2s}
.btn-primary{background:var(--forest);color:var(--ivory)}
.btn-primary:hover{background:#24462F;transform:translateY(-1px)}
.btn-accent{background:var(--maple);color:#fff}
.btn-accent:hover{background:var(--maple-600)}
.btn-outline{background:transparent;border:1px solid rgba(30,58,43,.3);color:var(--forest)}
.btn-outline:hover{background:rgba(30,58,43,.06)}
:focus-visible{outline:2px solid var(--forest);outline-offset:2px;border-radius:4px}

/* header */
header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
  border-top:3px solid var(--maple);border-bottom:1px solid var(--border)}
.nav{display:flex;align-items:center;justify-content:space-between;height:70px;gap:16px}
.brand{display:inline-flex;align-items:center;text-decoration:none}
.brand-logo{height:48px;width:auto;display:block}
.chip{background:#fff;border-radius:12px;padding:8px 14px;display:inline-flex}
@media(max-width:560px){.brand-logo{height:38px}}
.nav-links{display:flex;align-items:center;gap:6px}
.nav-links a{padding:8px 12px;border-radius:999px;font-size:.9rem;font-weight:500;text-decoration:none;color:#333}
.nav-links a:hover{background:rgba(30,58,43,.06);color:var(--forest)}
.menu-btn{display:none;background:none;border:0;font-size:1.6rem;color:var(--forest);cursor:pointer}
@media(max-width:860px){
  .nav-links{display:none;position:absolute;top:73px;left:0;right:0;flex-direction:column;align-items:stretch;
    background:var(--ivory);border-bottom:1px solid var(--border);padding:10px 22px 18px}
  .nav-links.open{display:flex}
  .nav-links a{padding:12px 8px}
  .menu-btn{display:block}
}

/* sections */
section{padding:76px 0}
.topo{background-image:radial-gradient(ellipse 120% 80% at 50% 0%,rgba(30,58,43,.06),transparent 60%)}
.hero{text-align:center;border-bottom:1px solid var(--border)}
.hero h1{font-size:clamp(2.6rem,6vw,4rem);margin-bottom:20px}
.hero .accent{color:var(--maple)}
.badge{display:inline-flex;align-items:center;gap:8px;background:var(--sage-100);color:var(--forest-700);
  font-size:.78rem;font-weight:600;padding:6px 14px;border-radius:999px;margin-bottom:22px}
.badge .star{color:var(--maple)}
.lead{max-width:720px;margin:0 auto 30px;font-size:1.13rem;color:var(--muted)}
.hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.strip{border-top:1px solid var(--border);background:rgba(255,255,255,.6)}
.strip .container{display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:center;padding-top:16px;padding-bottom:16px;
  font-size:.86rem;color:var(--muted)}
.strip span{display:flex;align-items:center;gap:10px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--maple)}
.head{max-width:640px}
.head h2{font-size:clamp(1.9rem,4vw,2.4rem);margin-top:6px}
.head p{color:var(--muted);font-size:1.05rem;margin:14px 0 0}
.center{margin-left:auto;margin-right:auto;text-align:center}
.grid{display:grid;gap:22px}
.g3{grid-template-columns:repeat(3,1fr)}
.g2{grid-template-columns:repeat(2,1fr)}
@media(max-width:860px){.g3{grid-template-columns:1fr}.g2{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:26px;
  box-shadow:0 8px 24px -14px rgba(20,38,27,.2)}
.card h3{font-size:1.25rem;margin-bottom:6px}
.card .tag{font-size:.85rem;font-weight:600;color:var(--ember);margin-bottom:12px}
.card p{color:var(--muted);font-size:.95rem;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.chip{border:1px solid var(--border);background:#fff;border-radius:999px;padding:8px 15px;font-size:.9rem}
.alt{background:#f5f6f7}
.dark{background:var(--forest-700);color:var(--ivory)}
.dark h2{color:var(--ivory)} .dark .eyebrow{color:var(--sage)}
.dark p{color:rgba(250,246,236,.75)}
.cred{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:30px}
@media(max-width:860px){.cred{grid-template-columns:repeat(2,1fr)}}
.cred .item{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);border-radius:12px;padding:18px}
.cred .item strong{font-size:1.1rem}.cred .item span{display:block;font-size:.82rem;color:rgba(250,246,236,.7);margin-top:4px}
.fw{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.fw span{border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 12px;font-size:.78rem;color:rgba(250,246,236,.85)}
.region{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);
  background:#fff;border-radius:12px;padding:13px 16px;font-size:.95rem}
.pill{border-radius:999px;padding:3px 11px;font-size:.72rem;font-weight:600}
.p-current{background:var(--forest);color:var(--ivory)}
.p-remote{background:var(--sage);color:var(--forest-700)}
.p-outreach{background:var(--ember);color:#fff}
.p-future{background:var(--stone);color:var(--charcoal)}
.cta-band{background:var(--forest);color:var(--ivory);border-radius:20px;padding:56px 28px;text-align:center}
.cta-band .eyebrow{color:var(--sage)}
.cta-band h2{color:var(--ivory);font-size:clamp(1.8rem,4vw,2.4rem)}
.cta-band p{color:rgba(250,246,236,.82);max-width:560px;margin:14px auto 26px}
footer{background:#0f1c14;color:rgba(250,246,236,.75);font-size:.9rem}
footer .container{padding-top:48px;padding-bottom:40px}
.disc{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);border-radius:12px;padding:16px;
  font-size:.82rem;margin:26px 0}
.legal{border-top:1px solid rgba(255,255,255,.1);padding-top:20px;margin-top:8px;display:flex;
  flex-wrap:wrap;justify-content:space-between;gap:12px;font-size:.82rem}

/* Micro-interactions, native, tactile feel */
.card{transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
.card:hover{transform:translateY(-3px);box-shadow:0 16px 34px -18px rgba(20,38,27,.34);border-color:#d6cfbd}
.btn:active{transform:translateY(0) scale(.97)}
.chip{transition:border-color .2s,color .2s,background .2s}
.chip:hover{border-color:var(--forest);color:var(--forest)}
.region{transition:border-color .2s,transform .2s}
.region:hover{border-color:var(--forest);transform:translateY(-1px)}
.nav-links a{transition:background .2s,color .2s}
.cred .item{transition:background .2s,border-color .2s}
.cred .item:hover{background:rgba(255,255,255,.09)}
@media (prefers-reduced-motion:reduce){
  .card:hover,.region:hover,.btn:active{transform:none}
}

/* Language toggle */
.nav-right{display:flex;align-items:center;gap:8px}
.lang{position:relative}
.lang-btn{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid var(--border);
  border-radius:999px;padding:7px 12px;font-size:.85rem;font-weight:600;color:var(--forest);cursor:pointer;transition:background .2s}
.lang-btn:hover{background:rgba(30,58,43,.05)}
.lang-menu{display:none;position:absolute;right:0;top:46px;background:#fff;border:1px solid var(--border);
  border-radius:14px;box-shadow:0 16px 34px -18px rgba(20,38,27,.34);padding:6px;min-width:210px;z-index:60;max-height:340px;overflow:auto}
.lang-menu.open{display:block}
.lang-menu button{display:flex;width:100%;justify-content:space-between;gap:10px;background:none;border:0;
  border-radius:9px;padding:9px 12px;font-size:.9rem;text-align:left;cursor:pointer;color:var(--charcoal)}
.lang-menu button:hover{background:rgba(30,58,43,.06)}
.lang-menu button .en{color:var(--muted);font-size:.78rem}
.lang-menu button .rev{color:var(--forest);font-weight:700}
.lang-menu button[aria-current=true]{font-weight:700;color:var(--forest)}
.lang-note{padding:9px 12px 5px;font-size:.72rem;color:var(--muted);border-top:1px solid var(--border);margin-top:4px}
/* hide Google Translate chrome */
.goog-te-banner-frame.skiptranslate,.goog-te-gadget-icon,.goog-logo-link,.goog-te-gadget span{display:none!important}
.goog-te-gadget{height:0!important;overflow:hidden;font-size:0!important}
body{top:0!important;position:static!important}
#goog-gt-tt,.goog-te-balloon-frame{display:none!important}
.goog-text-highlight{background:none!important;box-shadow:none!important}
#google_translate_element{position:absolute;left:-9999px;height:0;width:0;overflow:hidden}

/* Scroll-reveal */
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}

/* Header elevation + active nav */
header.scrolled{box-shadow:0 6px 20px -14px rgba(20,38,27,.4)}
.nav-links a.active{background:rgba(30,58,43,.08);color:var(--forest)}

/* Expandable academy cards */
.acard{display:flex;flex-direction:column}
.expand{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-top:14px;background:none;
  border:0;padding:6px 0;font-size:.86rem;font-weight:600;color:var(--forest);cursor:pointer}
.expand .chev{transition:transform .25s}
.acard.open .expand .chev{transform:rotate(180deg)}
.acard-detail{max-height:0;overflow:hidden;opacity:0;transition:max-height .3s ease,opacity .3s ease}
.acard.open .acard-detail{max-height:420px;opacity:1;margin-top:12px}
.mini-chips{display:flex;flex-wrap:wrap;gap:6px}
.mini-chips span{border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:.76rem;color:var(--charcoal)}
.deliv{margin-top:12px;font-size:.82rem;color:var(--muted)}
.deliv strong{color:var(--charcoal)}

/* FAQ accordion */
.faq{max-width:760px;margin:34px auto 0;border:1px solid var(--border);border-radius:16px;background:#fff;overflow:hidden}
.faq-item+.faq-item{border-top:1px solid var(--border)}
.faq-q{display:flex;width:100%;align-items:center;justify-content:space-between;gap:16px;background:none;border:0;
  padding:18px 22px;font-size:1rem;font-weight:600;text-align:left;cursor:pointer;color:var(--charcoal)}
.faq-q:hover{background:rgba(30,58,43,.04)}
.faq-q .chev{transition:transform .25s;color:var(--forest);flex:none}
.faq-item.open .faq-q .chev{transform:rotate(180deg)}
.faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
.faq-item.open .faq-a{max-height:440px}
.faq-a p{margin:0;padding:0 22px 20px;color:var(--muted);font-size:.95rem}

/* Back to top */
.totop{position:fixed;right:20px;bottom:20px;z-index:55;width:44px;height:44px;border:0;border-radius:999px;
  background:var(--forest);color:var(--ivory);font-size:1.1rem;cursor:pointer;opacity:0;pointer-events:none;
  transform:translateY(10px);transition:opacity .25s,transform .25s;box-shadow:0 10px 24px -12px rgba(20,38,27,.5)}
.totop.show{opacity:1;pointer-events:auto;transform:none}
.totop:hover{background:#24462F}
@media (prefers-reduced-motion:reduce){.totop{transition:none}}
</style>
</head>
<body>

<header>
  <div class="container nav">
    <a href="#top" class="brand" aria-label="Mount Etna Global Behaviour Academy, home"><img class="brand-logo" alt="Mount Etna Global Behaviour Academy" src="__LOGO__"></a>
    <div class="nav-right">
      <div class="lang">
        <button class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false" onclick="toggleLang(event)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="display:block"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/></svg>
          <span id="lang-current">EN</span>
        </button>
        <div class="lang-menu" id="lang-menu" role="menu" aria-label="Choose language">
          <button role="menuitem" onclick="setLang('en','EN')">English <span class="en">English</span></button>
          <button role="menuitem" onclick="setLang('it','IT')">Italiano <span class="en rev">Italian &middot; reviewed</span></button>
          <button role="menuitem" onclick="setLang('bg','BG')">&#1041;&#1098;&#1083;&#1075;&#1072;&#1088;&#1089;&#1082;&#1080; <span class="en rev">Bulgarian &middot; reviewed</span></button>
          <button role="menuitem" onclick="setLang('fr','FR')">Fran&ccedil;ais <span class="en">French</span></button>
          <button role="menuitem" onclick="setLang('es','ES')">Espa&ntilde;ol <span class="en">Spanish</span></button>
          <button role="menuitem" onclick="setLang('de','DE')">Deutsch <span class="en">German</span></button>
          <button role="menuitem" onclick="setLang('ro','RO')">Rom&acirc;n&#259; <span class="en">Romanian</span></button>
          <button role="menuitem" onclick="setLang('pl','PL')">Polski <span class="en">Polish</span></button>
          <button role="menuitem" onclick="setLang('cs','CS')">&#268;e&#353;tina <span class="en">Czech</span></button>
          <button role="menuitem" onclick="setLang('pt','PT')">Portugu&ecirc;s <span class="en">Portuguese</span></button>
          <div class="lang-note">Italian &amp; Bulgarian are professionally reviewed. Other languages use automatic translation (Google).</div>
        </div>
      </div>
      <nav class="nav-links" id="nav" aria-label="Primary">
        <a href="#academies" data-t="nav_acad">Academies</a>
        <a href="#services" data-t="nav_serv">Services</a>
        <a href="#credentials" data-t="nav_cred">Credentials</a>
        <a href="#regions" data-t="nav_prac">Practice</a>
        <a href="#platform" data-t="nav_plat">Platform</a>
        <a href="#faq">FAQ</a>
        <a class="btn btn-primary" href="#contact" style="padding:9px 18px" data-t="cta_partner">Partner With MEGBA</a>
      </nav>
      <button class="menu-btn" aria-label="Toggle menu" onclick="document.getElementById('nav').classList.toggle('open')">&#9776;</button>
    </div>
  </div>
</header>
<div id="google_translate_element" aria-hidden="true"></div>

<a id="top"></a>
<section class="hero topo">
  <div class="container">
    <span class="badge"><span class="star">&#10022;</span> <span data-t="badge">International behaviour-science academy</span></span>
    <h1><span data-t="h1a">Behaviour Science </span><span class="accent" data-t="h1b">Without Borders.</span></h1>
    <p class="lead" data-t="lead">Mount Etna Global Behaviour Academy helps schools, educators, families, technicians, and
      professionals build practical behaviour-science knowledge through international consultation,
      professional training, parent coaching, and multilingual digital learning, grounded in
      Canadian standards of practice, shared internationally.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#contact" data-t="cta_partner">Partner With MEGBA</a>
      <a class="btn btn-outline" href="#academies" data-t="cta_explore">Explore the Academies</a>
    </div>
  </div>
</section>
<div class="strip">
  <div class="container">
    <span>BCBA expertise</span>
    <span><i class="dot"></i>Ontario Registered Behaviour Analysts</span>
    <span><i class="dot"></i>International Behavior Analysts</span>
    <span><i class="dot"></i>Multilingual platform</span>
    <span><i class="dot"></i>School &amp; organization partnerships</span>
    <span><i class="dot"></i>Virtual &amp; in-person delivery</span>
  </div>
</div>

<section id="who">
  <div class="container">
    <div class="head"><p class="eyebrow">Who we serve</p><h2>One academy, many communities</h2>
      <p>From international schools to individual families, MEGBA meets each audience where they are.</p></div>
    <div class="chips">
      <span class="chip">International schools</span><span class="chip">School administrators</span>
      <span class="chip">Teachers &amp; educational assistants</span><span class="chip">Behaviour analysts</span>
      <span class="chip">Behaviour technicians</span><span class="chip">Allied health professionals</span>
      <span class="chip">Parents &amp; caregivers</span><span class="chip">Children &amp; youth</span>
      <span class="chip">Nonprofit organizations</span><span class="chip">Government &amp; community partners</span>
      <span class="chip">Clinics &amp; behaviour-service organizations</span>
    </div>
  </div>
</section>

<section id="academies" class="alt">
  <div class="container">
    <div class="head"><p class="eyebrow">Our five academies</p><h2>Behaviour science, made practical</h2>
      <p>Five academies share one multilingual platform, from classroom lessons to professional continuing education.</p></div>
    <div class="grid g3" style="margin-top:34px">
      <div class="card acard">
        <div class="tag">For children &amp; youth</div><h3>Student Academy</h3>
        <p>Emotional regulation, social skills, self-advocacy, communication, and independence.</p>
        <button class="expand" aria-expanded="false" onclick="toggleCard(this)">Focus &amp; delivery <span class="chev" aria-hidden="true">&#9662;</span></button>
        <div class="acard-detail">
          <div class="mini-chips"><span>Emotional regulation</span><span>Social skills</span><span>Self-advocacy</span><span>Communication</span><span>Independence</span><span>Peer relationships</span></div>
          <p class="deliv"><strong>Delivery:</strong> In-school curriculum, small-group learning, and digital modules.</p>
        </div>
      </div>
      <div class="card acard">
        <div class="tag">For families</div><h3>Parent Academy</h3>
        <p>Practical, jargon-free strategies through coaching, cohorts, and self-paced courses.</p>
        <button class="expand" aria-expanded="false" onclick="toggleCard(this)">Focus &amp; delivery <span class="chev" aria-hidden="true">&#9662;</span></button>
        <div class="acard-detail">
          <div class="mini-chips"><span>Reinforcement-based parenting</span><span>Routines</span><span>Communication</span><span>Regulation</span><span>School collaboration</span><span>Home implementation</span></div>
          <p class="deliv"><strong>Delivery:</strong> Live cohorts, one-to-one &amp; group coaching, webinars, self-paced.</p>
        </div>
      </div>
      <div class="card acard">
        <div class="tag">For educators</div><h3>Teacher Academy</h3>
        <p>Classroom behaviour, inclusion, prevention, and functional-assessment fundamentals.</p>
        <button class="expand" aria-expanded="false" onclick="toggleCard(this)">Focus &amp; delivery <span class="chev" aria-hidden="true">&#9662;</span></button>
        <div class="acard-detail">
          <div class="mini-chips"><span>Classroom behaviour</span><span>Inclusion</span><span>Prevention</span><span>FBA fundamentals</span><span>Classroom data</span><span>Team collaboration</span></div>
          <p class="deliv"><strong>Delivery:</strong> On-site &amp; virtual workshops, self-paced PD, coaching.</p>
        </div>
      </div>
      <div class="card acard">
        <div class="tag">For professionals</div><h3>Clinical Academy</h3>
        <p>Continuing education, supervision, ethics, and technician development.</p>
        <button class="expand" aria-expanded="false" onclick="toggleCard(this)">Focus &amp; delivery <span class="chev" aria-hidden="true">&#9662;</span></button>
        <div class="acard-detail">
          <div class="mini-chips"><span>Continuing education</span><span>Supervision</span><span>Ethics</span><span>Technician development</span><span>Early intervention</span><span>Interdisciplinary care</span></div>
          <p class="deliv"><strong>Delivery:</strong> Live cohorts, self-paced modules, learning communities, CEUs where approved.</p>
        </div>
      </div>
      <div class="card acard">
        <div class="tag">For everyone</div><h3>Digital Academy</h3>
        <p>Multilingual delivery, progress tracking, certificates, dashboards, and reporting.</p>
        <button class="expand" aria-expanded="false" onclick="toggleCard(this)">Focus &amp; delivery <span class="chev" aria-hidden="true">&#9662;</span></button>
        <div class="acard-detail">
          <div class="mini-chips"><span>Course delivery</span><span>Multilingual learning</span><span>Progress tracking</span><span>Certificates</span><span>Dashboards</span><span>White-label</span></div>
          <p class="deliv"><strong>Delivery:</strong> Web &amp; mobile, custom subdomains, exportable reports.</p>
        </div>
      </div>
      <div class="card" style="background:rgba(30,58,43,.05);border-style:dashed;border-color:rgba(30,58,43,.35)">
        <h3 style="color:var(--forest)">One platform</h3><p>Every academy runs on the same multilingual infrastructure, standards, and values.</p></div>
    </div>
  </div>
</section>

<section id="services">
  <div class="container">
    <div class="head"><p class="eyebrow">Services</p><h2>Consultation, training, and technology</h2>
      <p>From school-wide consultation to individual parent coaching, a connected set of services.</p></div>
    <div class="grid g3" style="margin-top:34px">
      <div class="card"><h3>School Behaviour Consultation</h3><p>School-wide support, classroom observations, MTSS, and behaviour-support planning, collaborative and educational.</p></div>
      <div class="card"><h3>Teacher &amp; Staff Training</h3><p>Live, on-site, or self-paced professional development with post-workshop coaching.</p></div>
      <div class="card"><h3>Parent &amp; Caregiver Coaching</h3><p>Warm, practical coaching that turns behaviour science into everyday family routines.</p></div>
      <div class="card"><h3>IBT &amp; Technician Training</h3><p>A structured pathway to foundational behaviour-technician competencies, with organization cohorts.</p></div>
      <div class="card"><h3>Institutional Licensing</h3><p>License the platform and academies for your whole organization, with dashboards and reporting.</p></div>
      <div class="card"><h3>White-Label Solutions</h3><p>Deliver MEGBA learning under your own brand, on your own subdomain.</p></div>
    </div>
  </div>
</section>

<section id="credentials" class="dark">
  <div class="container">
    <div class="head"><p class="eyebrow">Professional credentials</p>
      <h2 style="max-width:640px">Credentialed, clinically informed expertise</h2>
      <p>Our team includes professionals holding distinct credentials. We present each accurately and display only credentials we have formally verified, credentials are not interchangeable.</p></div>
    <div class="cred">
      <div class="item"><strong>BCBA</strong><span>Board Certified Behavior Analyst</span></div>
      <div class="item"><strong>RBA (Ontario)</strong><span>Registered Behaviour Analyst</span></div>
      <div class="item"><strong>IBA</strong><span>International Behavior Analyst</span></div>
      <div class="item"><strong>IBT</strong><span>International Behavior Technician</span></div>
    </div>
    <div class="fw">
      <span>Applied Behaviour Analysis</span><span>NDBI</span><span>ESDM</span><span>PECS</span>
      <span>Triple P</span><span>Functional Behaviour Assessment</span><span>Positive behaviour support</span>
      <span>Social-emotional learning</span><span>Behaviour Skills Training</span><span>Culturally responsive practice</span>
    </div>
    <div class="cred" style="margin-top:24px">
      <div class="item"><strong>ABAI</strong><span>Member, Association for Behavior Analysis International</span></div>
      <div class="item"><strong>IBAO</strong><span>Affiliated, International Behavior Analysis Organization (supports IBA pathways)</span></div>
      <div class="item"><strong>IBA-accredited</strong><span>Registered Behaviour Analysts (RBAs) &amp; BCBAs</span></div>
      <div class="item"><strong>Trained in</strong><span>PECS&reg;, ESDM, and Triple P</span></div>
    </div>
  </div>
</section>

<section id="regions" class="alt">
  <div class="container">
    <div style="max-width:680px;margin:0 auto;text-align:center;background:#fff;border:1px solid var(--border);border-radius:18px;padding:44px 28px;box-shadow:0 10px 26px -16px rgba(20,38,27,.22)">
      <p class="eyebrow" data-t="prac_eyebrow">Where we practise</p>
      <h2 style="font-size:clamp(1.9rem,4vw,2.4rem)" data-t="prac_h2">Currently serving Ontario, Canada</h2>
      <p style="color:var(--muted);font-size:1.08rem;margin:18px auto 0;max-width:560px" data-t="prac_lead">
        We deliver Canadian standards of behaviour-science practice, shared internationally,
        expanding to Bulgaria in 2027. We offer virtual services worldwide, along with in-person
        field visits.
      </p>
      <div class="chips" style="justify-content:center">
        <span class="chip" style="background:var(--forest);color:var(--ivory);border-color:var(--forest)">Ontario, Canada</span>
        <span class="chip">Bulgaria &middot; 2027</span>
        <span class="chip">Virtual worldwide</span>
        <span class="chip">In-person field visits</span>
      </div>
    </div>
  </div>
</section>

<section id="platform">
  <div class="container">
    <div class="head"><p class="eyebrow" data-t="plat_eyebrow">Multilingual technology</p><h2 data-t="plat_h2">One platform. Multiple languages. Global reach.</h2>
      <p>Courses, resources, certificates, progress, consultation, and institutional reporting in one multilingual environment. The enabled language list is editable, and localized content is professionally reviewed before release.</p></div>
    <div class="chips">
      <span class="chip">English</span><span class="chip">Fran&ccedil;ais</span><span class="chip">Espa&ntilde;ol</span>
      <span class="chip">Italiano</span><span class="chip">Deutsch</span><span class="chip">&#1041;&#1098;&#1083;&#1075;&#1072;&#1088;&#1089;&#1082;&#1080;</span>
      <span class="chip">Rom&acirc;n&#259;</span><span class="chip">Polski</span><span class="chip">&#268;e&#353;tina</span><span class="chip">Portugu&ecirc;s</span>
    </div>
  </div>
</section>

<section id="faq" class="alt">
  <div class="container">
    <div class="head center" style="margin-left:auto;margin-right:auto"><p class="eyebrow">FAQ</p><h2>Frequently asked questions</h2></div>
    <div class="faq">
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>Does MEGBA provide clinical (ABA) services?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>Our core work is education, training, and consultation. Where a jurisdiction recognizes BCBA or IBA credentialing on its own, or where families choose to fund services privately, MEGBA can also provide direct behaviour-analytic (ABA) services. Where local law requires other regulated licensure, we work within those requirements rather than replacing them.</p></div></div>
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>What does MEGBA focus on?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>We focus on training local professionals and teachers and building international capacity to deliver high-quality, neuroaffirming ABA services, so strong support stays in the community for the long term.</p></div></div>
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>Where does MEGBA operate?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>We operate in Ontario, Canada, and are expanding to Bulgaria in 2027. We offer virtual services worldwide, along with in-person field visits.</p></div></div>
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>What credentials does the team hold?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>Our team includes professionals holding credentials such as BCBA, Ontario Registered Behaviour Analysts (RBAs), International Behavior Analysts (IBAs), and International Behavior Technicians (IBTs). Each credential is presented accurately, and only verified credentials are displayed.</p></div></div>
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>How many languages do you work in?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>Our team speaks 7+ languages, and the platform is built to deliver in at least 10. Italian and Bulgarian are professionally reviewed (alongside English); other languages are available through automatic translation while review is in progress.</p></div></div>
      <div class="faq-item"><button class="faq-q" aria-expanded="false" onclick="toggleFaq(this)"><span>Can we run training under our own brand?</span><span class="chev" aria-hidden="true">&#9662;</span></button><div class="faq-a"><p>Yes. We offer white-label training delivered through SummitClient.io, our EMR and learning platform, with custom branding, a subdomain, configurable languages, and branded certificates. SummitClient.io is currently accepting beta testers.</p></div></div>
    </div>
  </div>
</section>

<section id="contact">
  <div class="container">
    <div class="cta-band">
      <p class="eyebrow" data-t="cta_eyebrow">Partner pathways</p>
      <h2 data-t="cta_h2">Let's build behaviour-informed schools, families, and communities.</h2>
      <p data-t="cta_lead">Whether you're a school, organization, professional, or family, there's a pathway into MEGBA. Tell us your context and we'll shape a plan around it.</p>
      <div class="hero-cta">
        <a class="btn btn-accent" href="mailto:megba@mountetnachildservices.com?subject=MEGBA%20partnership%20enquiry" data-t="cta_email">Email Us</a>
        <a class="btn btn-outline" style="border-color:rgba(255,255,255,.3);color:var(--ivory)" href="mailto:megba@mountetnachildservices.com?subject=Request%20a%20consultation" data-t="cta_consult">Request a Consultation</a>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div class="brand"><span class="chip"><img class="brand-logo" alt="Mount Etna Global Behaviour Academy" src="__LOGO__"></span></div>
    <div class="disc">MEGBA provides education, training, and consultation, and, where a jurisdiction recognizes BCBA or IBA credentialing or where families fund services privately, direct behaviour-analytic (ABA) services. Our education and training work within local legal, medical, and regulated clinical requirements rather than replacing them.</div>
    <div class="disc" style="border-color:rgba(203,31,42,.35)">Accuracy note: MEGBA displays only formally verified credentials, accreditations, CEUs, and training approvals. Training described as "RBT-aligned" is designed to align with applicable behaviour-technician training requirements; eligibility, certification, and examination are governed by the relevant credentialing body and may vary by jurisdiction.</div>
    <div class="legal">
      <span>&copy; 2026 Mount Etna Global Behaviour Academy. All rights reserved.</span>
      <span>Part of the Mount Etna ecosystem &middot; megba@mountetnachildservices.com</span>
    </div>
  </div>
</footer>

<button id="toTop" class="totop" aria-label="Back to top" onclick="window.scrollTo({top:0,behavior:'smooth'})">&#8593;</button>

<script>
/* Close mobile menu after tapping a link */
document.querySelectorAll('#nav a').forEach(function(a){
  a.addEventListener('click',function(){document.getElementById('nav').classList.remove('open');});
});

/* ---- Interaction polish ---- */
function toggleCard(btn){var c=btn.closest('.acard');var o=c.classList.toggle('open');btn.setAttribute('aria-expanded',o?'true':'false');}
function toggleFaq(btn){var it=btn.closest('.faq-item');var o=it.classList.toggle('open');btn.setAttribute('aria-expanded',o?'true':'false');}
/* Scroll reveal (progressive enhancement: reveal class only added by JS) */
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els=document.querySelectorAll('.card,.head,.cta-band,.faq');
  if(reduce||!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});return;}
  els.forEach(function(e){e.classList.add('reveal');});
  var io=new IntersectionObserver(function(ents){ents.forEach(function(en){if(en.isIntersecting){var t=en.target;t.classList.add('in');io.unobserve(t);t.addEventListener('transitionend',function h(){t.classList.remove('reveal','in');t.removeEventListener('transitionend',h);});}});},{threshold:.1,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal').forEach(function(e){io.observe(e);});
})();
/* Header elevation, back-to-top, scrollspy */
var hdr=document.querySelector('header'),toTop=document.getElementById('toTop');
var navmap=[].map.call(document.querySelectorAll('.nav-links a:not(.btn)[href^="#"]'),function(a){return {a:a,id:a.getAttribute('href').slice(1)};});
function onScroll(){
  var y=window.scrollY||document.documentElement.scrollTop;
  if(hdr)hdr.classList.toggle('scrolled',y>8);
  if(toTop)toTop.classList.toggle('show',y>500);
  var cur=null;
  navmap.forEach(function(m){var el=document.getElementById(m.id);if(el&&el.getBoundingClientRect().top<=140)cur=m;});
  navmap.forEach(function(m){m.a.classList.toggle('active',m===cur);});
}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();

/* ---- Language toggle (automatic translation via Google Translate) ---- */
function toggleLang(e){e.stopPropagation();var m=document.getElementById('lang-menu');var open=m.classList.toggle('open');document.getElementById('lang-btn').setAttribute('aria-expanded',open?'true':'false');}
document.addEventListener('click',function(e){var l=document.querySelector('.lang');if(l&&!l.contains(e.target)){document.getElementById('lang-menu').classList.remove('open');}});
/* Professionally-reviewed translations (Italian & Bulgarian) overlaid on the
   automatic translation for the key headline copy. */
var REVIEWED={
  it:{
    badge:"Accademia internazionale di scienza del comportamento",
    h1a:"La scienza del comportamento ", h1b:"senza confini.",
    lead:"Mount Etna Global Behaviour Academy aiuta scuole, educatori, famiglie, tecnici e professionisti a sviluppare conoscenze pratiche di scienza del comportamento attraverso consulenza internazionale, formazione professionale, coaching per i genitori e apprendimento digitale multilingue, secondo gli standard canadesi di pratica, condivisi a livello internazionale.",
    cta_partner:"Collabora con MEGBA", cta_explore:"Esplora le accademie",
    nav_acad:"Accademie", nav_serv:"Servizi", nav_cred:"Credenziali", nav_prac:"Dove operiamo", nav_plat:"Piattaforma",
    prac_eyebrow:"Dove operiamo", prac_h2:"Attualmente operativi in Ontario, Canada",
    prac_lead:"Offriamo standard canadesi di pratica della scienza del comportamento, condivisi a livello internazionale, con espansione in Bulgaria nel 2027. Offriamo servizi virtuali in tutto il mondo e visite in presenza.",
    plat_eyebrow:"Tecnologia multilingue", plat_h2:"Un'unica piattaforma. Più lingue. Portata globale.",
    cta_eyebrow:"Percorsi di collaborazione", cta_h2:"Costruiamo insieme scuole, famiglie e comunità informate sul comportamento.",
    cta_lead:"Che tu sia una scuola, un'organizzazione, un professionista o una famiglia, esiste un percorso in MEGBA. Raccontaci il tuo contesto e costruiremo un piano su misura.",
    cta_email:"Scrivici", cta_consult:"Richiedi una consulenza"
  },
  bg:{
    badge:"Международна академия по поведенческа наука",
    h1a:"Поведенческа наука ", h1b:"без граници.",
    lead:"Mount Etna Global Behaviour Academy помага на училища, преподаватели, семейства, техници и специалисти да изградят практически знания по поведенческа наука чрез международно консултиране, професионално обучение, коучинг за родители и многоезично дигитално обучение, според канадските стандарти на практика, споделяни в международен план.",
    cta_partner:"Партнирайте с MEGBA", cta_explore:"Разгледайте академиите",
    nav_acad:"Академии", nav_serv:"Услуги", nav_cred:"Квалификации", nav_prac:"Дейност", nav_plat:"Платформа",
    prac_eyebrow:"Къде работим", prac_h2:"В момента обслужваме Онтарио, Канада",
    prac_lead:"Предлагаме канадски стандарти на поведенческа практика, споделяни в международен план, с разширяване в България през 2027 г. Предлагаме виртуални услуги по целия свят и посещения на място.",
    plat_eyebrow:"Многоезична технология", plat_h2:"Една платформа. Много езици. Глобален обхват.",
    cta_eyebrow:"Възможности за партньорство", cta_h2:"Нека изградим училища, семейства и общности, информирани за поведението.",
    cta_lead:"Независимо дали сте училище, организация, специалист или семейство, има път към MEGBA. Разкажете ни за вашия контекст и ще изготвим план според нуждите ви.",
    cta_email:"Пишете ни", cta_consult:"Заявете консултация"
  }
};
/* Reviewed elements are excluded from Google Translate so our human copy is the
   single source of truth (no race between machine + reviewed text). */
document.querySelectorAll('[data-t]').forEach(function(el){el.setAttribute('data-en',el.textContent);el.classList.add('notranslate');el.setAttribute('translate','no');});
var overlayTimer=null;
function applyOverlay(code){var d=REVIEWED[code];if(!d)return;document.querySelectorAll('[data-t]').forEach(function(el){var k=el.getAttribute('data-t');if(d[k]!=null)el.textContent=d[k];});}
function restoreEN(){document.querySelectorAll('[data-t]').forEach(function(el){var o=el.getAttribute('data-en');if(o!=null)el.textContent=o;});}
function stopOverlay(){if(overlayTimer){clearInterval(overlayTimer);overlayTimer=null;}}
function startOverlay(code){stopOverlay();var n=0;applyOverlay(code);overlayTimer=setInterval(function(){applyOverlay(code);if(++n>14)stopOverlay();},350);}
function applyLang(code,tries){tries=tries||0;var c=document.querySelector('.goog-te-combo');if(c){c.value=code;c.dispatchEvent(new Event('change'));}else if(tries<50){setTimeout(function(){applyLang(code,tries+1);},150);}}
function setLang(code,label){
  var cur=document.getElementById('lang-current'); if(cur) cur.textContent=label;
  document.getElementById('lang-menu').classList.remove('open');
  document.getElementById('lang-btn').setAttribute('aria-expanded','false');
  document.documentElement.lang=code;
  var v='/en/'+code;
  document.cookie='googtrans='+v+';path=/';
  try{document.cookie='googtrans='+v+';path=/;domain=.'+location.hostname;}catch(e){}
  if(code==='en'){ stopOverlay(); applyLang('en',0); setTimeout(restoreEN,500); }
  else { applyLang(code,0); if(REVIEWED[code]){ startOverlay(code); } else { stopOverlay(); } }
}
function googleTranslateElementInit(){
  new google.translate.TranslateElement({pageLanguage:'en',includedLanguages:'en,fr,es,it,de,bg,ro,pl,cs,pt',autoDisplay:false},'google_translate_element');
}
</script>
<script src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"></script>
</body>
</html>
"""

HTML = HTML.replace("__LOGO__", logo_uri).replace("__FAVICON__", favicon_uri)
OUT.write_text(HTML, encoding="utf-8")
# index.html mirror so the folder can be dragged straight onto Netlify.
(OUT.parent / "index.html").write_text(HTML, encoding="utf-8")
print("Wrote", OUT, "and index.html", f"({len(HTML)//1024} KB)")
