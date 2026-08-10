/* ============================================================================
   gurushaktividya.com
   Cloudflare Worker serving the site for महाशक्ति सिद्धविद्या.

   What it does
     /            home: newest video as hero + grid of recent videos
     /v/<id>      a page per video: player, description, share, related
     /sitemap.xml every video page, for search engines
     /robots.txt
     /healthz     plain "ok", handy for DNS checks

   Video data comes from the channel's public Atom feed, fetched at the edge
   and cached for 30 minutes. No API key, no client-side JavaScript, and the
   page still renders if YouTube is unreachable.
   ========================================================================== */

const CHANNEL_ID = "UCe_2vUdbwJynzXWj-pV2ALg";
const HANDLE     = "Mahashaktisiddhvidya";
const CHANNEL_URL= "https://www.youtube.com/@" + HANDLE;
const UPLOADS    = "UU" + CHANNEL_ID.slice(2);
const PLAYLIST_URL = "https://www.youtube.com/playlist?list=" + UPLOADS;
const FEED_URL   = "https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID;
const SITE       = "https://gurushaktividya.com";
const CACHE_SECONDS = 1800;

/* ---------------------------------------------------------------- helpers */
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const unxml = s => String(s == null ? "" : s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, "&");

const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_HI = ["जनवरी","फ़रवरी","मार्च","अप्रैल","मई","जून","जुलाई","अगस्त","सितम्बर","अक्तूबर","नवम्बर","दिसम्बर"];

function fmtDate(iso, hi) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.getDate() + " " + (hi ? MONTHS_HI[d.getMonth()] : MONTHS_EN[d.getMonth()]) + " " + d.getFullYear();
}

function fmtViews(n, hi) {
  n = Number(n) || 0;
  if (!n) return "";
  if (hi) {
    if (n >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, "") + " करोड़ बार देखा गया";
    if (n >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, "") + " लाख बार देखा गया";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + " हज़ार बार देखा गया";
    return n + " बार देखा गया";
  }
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K views";
  return n + " views";
}

/* Bilingual span pair. The page ships both languages; CSS decides. */
const T = (en, hi) => `<span class="t-en">${en}</span><span class="t-hi">${hi}</span>`;

const thumb = (id, big) => `https://i.ytimg.com/vi/${id}/${big ? "maxresdefault" : "hqdefault"}.jpg`;
const thumbFallback = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const waShare = (title, url) =>
  "https://api.whatsapp.com/send?text=" + encodeURIComponent(title + "\n" + url);

/* ------------------------------------------------------------- feed fetch */
async function fetchFeed() {
  const attempts = [
    { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      headers: { "accept": "application/atom+xml,application/xml;q=0.9,*/*;q=0.8" } },
    { headers: { "accept": "*/*", "user-agent": "Mozilla/5.0 (compatible; gurushaktividya.com)" } }
  ];
  let last = { status: 0, note: "no attempt" };
  for (const opts of attempts) {
    try {
      const res = await fetch(FEED_URL, opts);
      const body = res.ok ? await res.text() : "";
      last = { status: res.status, bytes: body.length, note: res.ok ? "ok" : "non-2xx" };
      if (res.ok && body.indexOf("<entry>") !== -1) return { xml: body, info: last };
    } catch (err) {
      last = { status: -1, note: "threw: " + (err && err.message ? err.message : String(err)) };
    }
  }
  return { xml: "", info: last };
}

async function getVideos() {
  const { xml } = await fetchFeed();
  return xml ? parseFeed(xml) : [];
}

function parseFeed(xml) {
  const out = [];
  const entries = xml.split("<entry>").slice(1);
  for (const raw of entries) {
    const block = raw.split("</entry>")[0];
    const pick = re => { const m = block.match(re); return m ? m[1] : ""; };
    const id = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!id) continue;
    out.push({
      id,
      title: unxml(pick(/<media:title>([\s\S]*?)<\/media:title>/) || pick(/<title>([\s\S]*?)<\/title>/)),
      published: pick(/<published>([^<]+)<\/published>/),
      description: unxml(pick(/<media:description>([\s\S]*?)<\/media:description>/)),
      views: pick(/<media:statistics[^>]*views="(\d+)"/)
    });
  }
  return out;
}

/* ------------------------------------------------------------------- CSS */
const CSS = `
:root{
  --ivory:#FFF8EC;--sandal:#FFF0D2;--sandal-2:#FBE3B4;--paper:#FFFDF7;
  --ink:#2E1608;--ink-soft:#6E4726;--ink-line:rgba(46,22,8,.16);
  --marigold:#F5910D;--marigold-2:#FFC02E;--gold:#C98A05;
  --kumkum:#C2183C;--kumkum-dk:#9E0E31;--tulsi:#12784E;--peacock:#0B5A78;--peacock-dk:#06303F;
  --cream:#FFF6E2;--cream-2:rgba(255,246,226,.84);
  --display:"Marcellus","Times New Roman",serif;
  --sans:"Karla","Helvetica Neue",Arial,sans-serif;
  --deva:"Noto Sans Devanagari",var(--sans);
  --deva-display:"Tiro Devanagari Sanskrit","Noto Sans Devanagari",serif;
  --pad:clamp(18px,5vw,64px);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--ivory);color:var(--ink);font-family:var(--sans);
  font-size:17px;line-height:1.7;-webkit-font-smoothing:antialiased;overflow-x:clip}
img{max-width:100%;display:block}
a{color:inherit}
h1,h2,h3{margin:0;font-family:var(--display);font-weight:400;line-height:1.25}
p{margin:0 0 1em}
:focus-visible{outline:2px solid var(--kumkum);outline-offset:3px}

/* bilingual switch, pure CSS */
.sr-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;margin:0}
.t-hi{display:contents !important}
.t-en{display:none !important}
#lang:checked ~ * .t-hi{display:none !important}
#lang:checked ~ * .t-en{display:contents !important}
.t-hi{font-family:var(--deva);letter-spacing:0;line-height:1.8}
h1 .t-hi,h2 .t-hi,h3 .t-hi,.card b .t-hi,.hero-v h2 .t-hi{font-family:var(--deva-display);line-height:1.45}
.lang{display:inline-flex;align-items:center;border:1px solid var(--sandal-2);border-radius:999px;
  background:#fff;overflow:hidden;cursor:pointer;user-select:none;flex:none}
.lang span{padding:9px 13px;font-size:13px;font-weight:700;color:var(--ink-soft);white-space:nowrap}
.lang .s-hi{font-family:var(--deva);background:var(--kumkum);color:#fff}
#lang:checked ~ * .lang .s-hi{background:transparent;color:var(--ink-soft)}
#lang:checked ~ * .lang .s-en{background:var(--kumkum);color:#fff}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:46px;
  padding:13px 22px;border-radius:999px;border:1px solid transparent;text-decoration:none;
  font-size:14px;font-weight:700;transition:transform .18s,box-shadow .18s}
.btn svg{width:18px;height:18px;fill:currentColor;flex:none}
.btn:hover{transform:translateY(-2px)}
.btn-yt{background:#E23A33;color:#fff;box-shadow:0 10px 24px -12px rgba(226,58,51,.9)}
.btn-gold{background:linear-gradient(135deg,var(--marigold-2),var(--marigold));color:#3B1A00;
  box-shadow:0 10px 24px -12px rgba(245,145,13,.9)}
.btn-wa{background:#1FA855;color:#fff}
.btn-line{border-color:var(--sandal-2);background:#fff;color:var(--ink)}
.btn-ghost{border-color:rgba(255,246,226,.5);color:var(--cream);background:rgba(255,255,255,.1)}
.btn-sm{min-height:38px;padding:9px 15px;font-size:12.5px}

/* masthead */
.masthead{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;
  padding:10px var(--pad);background:rgba(255,248,236,.94);backdrop-filter:blur(12px);
  border-bottom:2px solid var(--sandal-2)}
.mark{display:flex;align-items:center;gap:11px;text-decoration:none;margin-right:auto;min-width:0}
.mark svg{width:36px;height:36px;flex:none}
.mark b{display:block;font-family:var(--deva-display);font-size:17px;color:var(--kumkum-dk);
  line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mark small{display:block;font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-soft)}

/* hero */
.hero{position:relative;overflow:hidden;color:var(--cream);padding:clamp(34px,6vw,64px) var(--pad);
  background:radial-gradient(120% 95% at 50% 0%,rgba(255,208,80,.5),transparent 60%),
    linear-gradient(150deg,#9E0E31,#C2183C 38%,#E4571B 72%,#F5910D 100%)}
.hero::before{content:"";position:absolute;inset:-30% -20% auto -20%;height:180%;
  background:repeating-conic-gradient(from 0deg at 50% 20%,rgba(255,246,226,.13) 0 1.6deg,transparent 1.6deg 9deg);
  -webkit-mask-image:radial-gradient(58% 58% at 50% 20%,#000,transparent 74%);
  mask-image:radial-gradient(58% 58% at 50% 20%,#000,transparent 74%);pointer-events:none}
.hero > *{position:relative;z-index:1}
.jai{font-family:var(--deva-display);font-size:clamp(15px,2vw,19px);color:var(--marigold-2);
  text-align:center;margin:0 0 14px}
.hero h1{font-size:clamp(28px,5.2vw,50px);color:#FFFDF7;text-align:center;
  font-family:var(--deva-display);text-shadow:0 2px 20px rgba(120,8,30,.4)}
.hero h1 .t-en{font-family:var(--display)}
.hero .handle{text-align:center;font-size:12.5px;letter-spacing:.13em;text-transform:uppercase;
  color:#FFE9B8;font-weight:700;margin:14px 0 0}

/* featured video */
.hero-v{max-width:1000px;margin:clamp(26px,4vw,40px) auto 0;display:grid;
  grid-template-columns:1.25fr .75fr;gap:clamp(18px,3vw,32px);align-items:center;
  background:rgba(46,10,4,.24);border:1px solid rgba(255,246,226,.3);border-radius:12px;padding:clamp(14px,2vw,20px)}
.hero-v .shot{position:relative;display:block;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:#1a0d06}
.hero-v .shot img{width:100%;height:100%;object-fit:cover}
.hero-v h2{font-size:clamp(19px,2.3vw,27px);color:#FFFDF7;margin-bottom:10px}
.hero-v .meta{font-size:13px;color:#FFE9B8;margin-bottom:16px}
.hero-v .row{display:flex;flex-wrap:wrap;gap:10px}
.tagline{display:inline-block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  font-weight:700;color:#3B1A00;background:var(--marigold-2);padding:5px 11px;border-radius:4px;margin-bottom:12px}
.play{position:absolute;inset:0;margin:auto;width:66px;height:66px;border-radius:50%;background:#E23A33;
  display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(0,0,0,.7);transition:transform .2s}
.play svg{width:26px;height:26px;fill:#fff;margin-left:3px}
.shot:hover .play{transform:scale(1.09)}

/* sections */
.section{padding:clamp(40px,6vw,80px) var(--pad)}
.wrap{max-width:1120px;margin:0 auto}
.eyebrow{font-size:12px;letter-spacing:.19em;text-transform:uppercase;color:var(--kumkum-dk);font-weight:700;margin-bottom:10px}
.section h2{font-size:clamp(25px,3.2vw,38px);margin-bottom:12px}
.section .sub{color:var(--ink-soft);max-width:64ch;margin-bottom:28px}

/* video grid */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
.card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--sandal-2);
  border-radius:10px;overflow:hidden;transition:.18s}
.card:hover{transform:translateY(-3px);border-color:var(--marigold);box-shadow:0 16px 30px -20px rgba(46,22,8,.6)}
.card .shot{position:relative;display:block;aspect-ratio:16/9;background:#f0e6d2}
.card .shot img{width:100%;height:100%;object-fit:cover}
.card .shot .play{width:52px;height:52px}
.card .shot .play svg{width:20px;height:20px}
.card .body{padding:14px 15px 15px;display:flex;flex-direction:column;flex:1}
.card b{font-weight:700;font-size:15.5px;line-height:1.4;display:block;margin-bottom:8px}
.card a.tt{text-decoration:none}
.card a.tt:hover b{color:var(--kumkum-dk)}
.card .meta{font-size:12.5px;color:var(--ink-soft);margin-bottom:12px}
.card .actions{margin-top:auto;display:flex;gap:8px;flex-wrap:wrap}

/* subject tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:14px}
.tile{display:flex;align-items:center;gap:13px;text-decoration:none;padding:16px;border-radius:9px;
  border:1px solid var(--sandal-2);background:#fff;transition:.18s}
.tile:hover{transform:translateY(-3px);border-color:var(--marigold)}
.tile i{width:40px;height:40px;border-radius:11px;flex:none;display:grid;place-items:center;
  font-family:var(--deva-display);font-size:19px;color:#fff;font-style:normal}
.tile b{display:block;font-size:15.5px}
.tile span{display:block;font-size:12.5px;color:var(--ink-soft)}
.tile .go{margin-left:auto;color:var(--kumkum)}

/* video page */
.vwrap{max-width:960px;margin:0 auto;padding:clamp(22px,4vw,44px) var(--pad)}
.crumb{font-size:13.5px;color:var(--ink-soft);margin-bottom:18px}
.crumb a{color:var(--kumkum-dk)}
.frame{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#140a04;
  box-shadow:0 26px 50px -30px rgba(46,22,8,.7)}
.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.vtitle{font-size:clamp(22px,3vw,34px);margin:24px 0 10px}
.vmeta{font-size:14px;color:var(--ink-soft);margin-bottom:18px}
.vshare{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px}
.vdesc{white-space:pre-wrap;background:var(--paper);border:1px solid var(--sandal-2);
  border-left:4px solid var(--marigold);border-radius:8px;padding:18px;font-size:15.5px;
  color:var(--ink-soft);max-height:340px;overflow:auto}
.vdesc .t-hi{font-family:var(--deva)}

/* coming soon */
#soon{background:radial-gradient(800px 420px at 80% 0%,rgba(11,90,120,.5),transparent 60%),
  linear-gradient(160deg,#07394B,var(--peacock-dk) 75%);color:var(--cream)}
#soon h2{color:var(--cream)}
#soon .eyebrow{color:var(--marigold-2)}
#soon .sub{color:var(--cream-2)}
.soon-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:1px;
  background:rgba(255,246,226,.24);border:1px solid rgba(255,246,226,.24);border-radius:9px;overflow:hidden}
.soon-grid div{background:rgba(3,26,35,.6);padding:20px 18px}
.soon-grid b{display:block;font-family:var(--display);font-size:17.5px;font-weight:400;margin-bottom:6px}
.soon-grid b .t-hi{font-family:var(--deva-display)}
.soon-grid p{margin:0;font-size:14.5px;color:var(--cream-2)}
.contact{margin-top:24px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}

/* footer */
.footer{background:linear-gradient(160deg,#6E0A24,#8E1226 60%,#B3421A);color:var(--cream);
  padding:clamp(34px,5vw,56px) var(--pad) 24px}
.foot-links{display:flex;flex-wrap:wrap;gap:12px 26px;margin-bottom:20px;font-size:15px}
.foot-links a{text-decoration:none}
.colophon{border-top:1px solid rgba(255,246,226,.28);padding-top:16px;font-size:12.5px;color:var(--cream-2)}
.note{font-size:12px;color:rgba(255,246,226,.6);margin:8px 0 0;max-width:80ch}

@media (max-width:820px){
  .hero-v{grid-template-columns:1fr}
  .hero-v .info{order:2}
}
@media (max-width:760px){
  .masthead{padding:9px 14px}
  .mark svg{width:31px;height:31px}
  .mark b{font-size:15px}
  .mark small{display:none}
  .grid{grid-template-columns:1fr;gap:16px}
  .hero-v .row .btn,.contact .btn{width:100%}
  .play{width:54px;height:54px}
  .play svg{width:21px;height:21px}
}`;

/* ------------------------------------------------------------- fragments */
const HEAD = (title, desc, canonical, extra) => `<!DOCTYPE html>
<html lang="hi"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://i.ytimg.com">
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Karla:wght@400;500;700&family=Tiro+Devanagari+Sanskrit&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${extra || ""}
</head><body>
<input type="checkbox" id="lang" class="sr-input" aria-label="Show this page in English">`;

const MASTHEAD = `
<header class="masthead">
  <a class="mark" href="/">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#C2183C" stroke-width="1.6"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#F5910D" stroke-width="1.2"/>
      <polygon points="50,18 79,68 21,68" fill="none" stroke="#2E1608" stroke-width="1.3"/>
      <polygon points="50,82 21,32 79,32" fill="none" stroke="#2E1608" stroke-width="1.3"/>
      <circle cx="50" cy="50" r="4" fill="#C2183C"/>
    </svg>
    <span>
      <b>${T("Mahashakti Siddhvidya", "महाशक्ति सिद्धविद्या")}</b>
      <small>gurushaktividya.com</small>
    </span>
  </a>
  <label class="lang" for="lang"><span class="s-hi">हिं</span><span class="s-en">EN</span></label>
</header>`;

const PLAY_ICON = `<span class="play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>`;
const YT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.9-.5-5.8a3 3 0 0 0-2.1-2.1C18.5 3.6 12 3.6 12 3.6s-6.5 0-8.4.5A3 3 0 0 0 1.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 8.4.5 8.4.5s6.5 0 8.4-.5a3 3 0 0 0 2.1-2.1C23 15.9 23 12 23 12zM9.8 15.5v-7l6.2 3.5-6.2 3.5z"/></svg>`;
const WA_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4 2.5 1 3 .8 3.6.8.5 0 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2z"/></svg>`;

const SUBJECTS = `
<section class="section">
  <div class="wrap">
    <p class="eyebrow">${T("By subject", "विषय अनुसार")}</p>
    <h2>${T("Principal subjects", "साधना के प्रमुख विषय")}</h2>
    <p class="sub">${T(
      "Each subject opens a search inside the channel, so every video on that theme appears together.",
      "प्रत्येक विषय चैनल के भीतर उसी विषय की खोज खोलता है, जिससे उस विषय के समस्त वीडियो एक साथ मिलते हैं।")}</p>
    <div class="tiles">
      ${[
        ["%E0%A4%B9%E0%A4%A8%E0%A5%81%E0%A4%AE%E0%A4%BE%E0%A4%A8", "#C2183C", "ह", "Hanumān sādhana", "हनुमान साधना", "Kavach and guarded mantras", "कवच एवं गुप्त मंत्र"],
        ["%E0%A4%AD%E0%A5%88%E0%A4%B0%E0%A4%B5", "#7A2E9C", "भै", "Bhairav sādhana", "भैरव साधना", "Ākāsh Bhairav and guarded mantras", "आकाश भैरव एवं गुप्त मंत्र"],
        ["%E0%A4%A8%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%A3", "#B36A06", "न", "Navārṇa and Durgā kavach", "नवार्ण एवं दुर्गा कवच", "The method of siddhi", "सिद्धि की विधि"],
        ["%E0%A4%B8%E0%A4%BE%E0%A4%A7%E0%A4%A8%E0%A4%BE", "#12784E", "सा", "Sādhana guidance", "साधना मार्गदर्शन", "For those beginning", "आरम्भ करने वालों हेतु"]
      ].map(([q, c, gl, en, hi, sen, shi]) => `
      <a class="tile" href="${CHANNEL_URL}/search?query=${q}" target="_blank" rel="noopener">
        <i style="background:${c}">${gl}</i>
        <span><b>${T(en, hi)}</b><span>${T(sen, shi)}</span></span>
        <span class="go">↗</span>
      </a>`).join("")}
    </div>
  </div>
</section>`;

const SOON = `
<section class="section" id="soon">
  <div class="wrap">
    <p class="eyebrow">${T("Coming soon", "शीघ्र आ रहा है")}</p>
    <h2>${T("The full website is being built", "पूर्ण वेबसाइट निर्माणाधीन है")}</h2>
    <p class="sub">${T(
      "Until then every presentation from the channel can be watched here. The finished site will carry the following.",
      "तब तक चैनल की समस्त प्रस्तुतियाँ इसी पृष्ठ से देखी जा सकती हैं। आगे इस वेबसाइट पर यह सब उपलब्ध होगा।")}</p>
    <div class="soon-grid">
      <div><b>${T("Sādhana library", "साधना विवरण")}</b>
        <p>${T("Method, observances and materials, set out in order.", "विधि, नियम एवं सामग्री की क्रमबद्ध सूची।")}</p></div>
      <div><b>${T("Panchāṅga and muhūrta", "पंचांग एवं मुहूर्त")}</b>
        <p>${T("Tithi, nakṣatra and the periods suited to each sādhana.", "तिथि, नक्षत्र तथा साधना हेतु उपयुक्त काल।")}</p></div>
      <div><b>${T("Event registration", "कार्यक्रम पंजीकरण")}</b>
        <p>${T("Online registration for śibira, dīkṣā and satsaṅga.", "शिबिर, दीक्षा एवं सत्संग हेतु ऑनलाइन पंजीकरण।")}</p></div>
      <div><b>${T("Contact and questions", "सम्पर्क एवं जिज्ञासा")}</b>
        <p>${T("A way to send questions and receive replies.", "प्रश्न भेजने तथा उत्तर पाने की व्यवस्था।")}</p></div>
    </div>
    <div class="contact">
      <a class="btn btn-gold" href="mailto:contact@gurushaktividya.com">${T("Get in touch", "सम्पर्क करें")}</a>
      <span style="font-size:14px;color:var(--cream-2)">contact@gurushaktividya.com</span>
    </div>
  </div>
</section>`;

const FOOTER = `
<footer class="footer">
  <div class="wrap">
    <div class="foot-links">
      <a href="/">${T("Home", "मुख पृष्ठ")}</a>
      <a href="${CHANNEL_URL}" target="_blank" rel="noopener">YouTube</a>
      <a href="mailto:contact@gurushaktividya.com">${T("Contact", "सम्पर्क")}</a>
    </div>
    <div class="colophon">
      © ${new Date().getFullYear()} gurushaktividya.com · ${T("Mahashakti Siddhvidya", "महाशक्ति सिद्धविद्या")}
      <p class="note">${T(
        "Videos and their descriptions belong to the Mahashakti Siddhvidya YouTube channel and are shown here with links to the original.",
        "वीडियो तथा उनके विवरण महाशक्ति सिद्धविद्या यूट्यूब चैनल के हैं और यहाँ मूल स्रोत के लिंक सहित प्रस्तुत हैं।")}</p>
    </div>
  </div>
</footer>
</body></html>`;

/* -------------------------------------------------------------- card html */
function videoCard(v) {
  const url = SITE + "/v/" + v.id;
  const dateEn = fmtDate(v.published, false), dateHi = fmtDate(v.published, true);
  const viewsEn = fmtViews(v.views, false), viewsHi = fmtViews(v.views, true);
  const metaEn = [dateEn, viewsEn].filter(Boolean).join(" · ");
  const metaHi = [dateHi, viewsHi].filter(Boolean).join(" · ");
  return `<article class="card">
    <a class="shot" href="/v/${esc(v.id)}" aria-label="${esc(v.title)}">
      <img src="${thumbFallback(v.id)}" alt="" loading="lazy" width="480" height="360">
      ${PLAY_ICON}
    </a>
    <div class="body">
      <a class="tt" href="/v/${esc(v.id)}"><b>${esc(v.title)}</b></a>
      <div class="meta">${T(esc(metaEn), esc(metaHi))}</div>
      <div class="actions">
        <a class="btn btn-yt btn-sm" href="/v/${esc(v.id)}">${T("Watch", "देखें")}</a>
        <a class="btn btn-wa btn-sm" href="${esc(waShare(v.title, url))}" target="_blank" rel="noopener">
          ${WA_ICON}${T("Share", "साझा करें")}</a>
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------- home */
function homePage(videos) {
  const featured = videos[0];
  const rest = videos.slice(1);

  const hero = featured ? `
  <div class="hero-v">
    <a class="shot" href="/v/${esc(featured.id)}" aria-label="${esc(featured.title)}">
      <img src="${thumb(featured.id, true)}" alt="" width="1280" height="720"
           onerror="this.src='${thumbFallback(featured.id)}'">
      ${PLAY_ICON}
    </a>
    <div class="info">
      <span class="tagline">${T("Newest", "नवीनतम प्रस्तुति")}</span>
      <h2>${esc(featured.title)}</h2>
      <p class="meta">${T(
        esc([fmtDate(featured.published, false), fmtViews(featured.views, false)].filter(Boolean).join(" · ")),
        esc([fmtDate(featured.published, true), fmtViews(featured.views, true)].filter(Boolean).join(" · ")))}</p>
      <div class="row">
        <a class="btn btn-gold" href="/v/${esc(featured.id)}">${T("Watch now", "अभी देखें")}</a>
        <a class="btn btn-ghost" href="${esc(waShare(featured.title, SITE + "/v/" + featured.id))}"
           target="_blank" rel="noopener">${WA_ICON}${T("Share", "साझा करें")}</a>
      </div>
    </div>
  </div>` : `
  <div class="hero-v">
    <a class="shot" href="${PLAYLIST_URL}" target="_blank" rel="noopener"
       style="display:grid;place-items:center;background:linear-gradient(150deg,#8E1226,#E4571B)">
      ${PLAY_ICON}
    </a>
    <div class="info">
      <h2>${T("Watch every presentation", "समस्त प्रस्तुतियाँ देखें")}</h2>
      <p class="meta">${T("Opens on YouTube", "यूट्यूब पर खुलेगा")}</p>
      <div class="row"><a class="btn btn-gold" href="${PLAYLIST_URL}" target="_blank" rel="noopener">
        ${T("Open the channel", "चैनल खोलें")}</a></div>
    </div>
  </div>`;

  const list = rest.length ? `
  <section class="section">
    <div class="wrap">
      <p class="eyebrow">${T("Presentations", "प्रस्तुतियाँ")}</p>
      <h2>${T("Recent videos", "हाल की प्रस्तुतियाँ")}</h2>
      <p class="sub">${T(
        "This list comes straight from the channel and refreshes itself whenever a new video is published.",
        "यह सूची सीधे चैनल से आती है और नया वीडियो प्रकाशित होते ही स्वयं अद्यतन हो जाती है।")}</p>
      <div class="grid">${rest.map(videoCard).join("")}</div>
      <div style="margin-top:26px">
        <a class="btn btn-yt" href="${CHANNEL_URL}?sub_confirmation=1" target="_blank" rel="noopener">
          ${YT_ICON}${T("Subscribe on YouTube", "चैनल की सदस्यता लें")}</a>
      </div>
    </div>
  </section>` : "";

  return HEAD(
    "महाशक्ति सिद्धविद्या · Guru Shakti Vidya",
    "साधना, मंत्र एवं कवच की प्रस्तुतियाँ। महाशक्ति सिद्धविद्या चैनल के नवीनतम वीडियो।",
    SITE + "/"
  ) + MASTHEAD + `
<section class="hero">
  <p class="jai">।। जय माँ जगदम्बा ।।</p>
  <h1>${T("Mahashakti Siddhvidya", "महाशक्ति सिद्धविद्या")}</h1>
  <p class="handle">@${HANDLE}</p>
  ${hero}
</section>` + list + SUBJECTS + SOON + FOOTER;
}

/* ------------------------------------------------------------- video page */
function videoPage(v, others) {
  const url = SITE + "/v/" + v.id;
  const desc = (v.description || "").slice(0, 5000);
  const ld = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.title,
    description: desc.slice(0, 500),
    thumbnailUrl: [thumbFallback(v.id)],
    uploadDate: v.published,
    embedUrl: "https://www.youtube.com/embed/" + v.id,
    url: url
  };
  const more = others.filter(o => o.id !== v.id).slice(0, 6);

  return HEAD(
    v.title + " · महाशक्ति सिद्धविद्या",
    desc.replace(/\s+/g, " ").slice(0, 160) || v.title,
    url,
    `<meta property="og:image" content="${esc(thumbFallback(v.id))}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>`
  ) + MASTHEAD + `
<div class="vwrap">
  <p class="crumb"><a href="/">${T("Home", "मुख पृष्ठ")}</a> › ${T("Video", "वीडियो")}</p>
  <div class="frame">
    <iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?rel=0"
      title="${esc(v.title)}"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>
  </div>
  <h1 class="vtitle">${esc(v.title)}</h1>
  <p class="vmeta">${T(
    esc([fmtDate(v.published, false), fmtViews(v.views, false)].filter(Boolean).join(" · ")),
    esc([fmtDate(v.published, true), fmtViews(v.views, true)].filter(Boolean).join(" · ")))}</p>
  <div class="vshare">
    <a class="btn btn-wa" href="${esc(waShare(v.title, url))}" target="_blank" rel="noopener">
      ${WA_ICON}${T("Share on WhatsApp", "व्हाट्सएप पर साझा करें")}</a>
    <a class="btn btn-yt" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">
      ${YT_ICON}${T("Watch on YouTube", "यूट्यूब पर देखें")}</a>
    <a class="btn btn-line" href="/">${T("All videos", "समस्त वीडियो")}</a>
  </div>
  ${desc ? `<div class="vdesc">${esc(desc)}</div>` : ""}
</div>
${more.length ? `<section class="section"><div class="wrap">
  <p class="eyebrow">${T("More", "और भी")}</p>
  <h2>${T("Other presentations", "अन्य प्रस्तुतियाँ")}</h2>
  <div class="grid">${more.map(videoCard).join("")}</div>
</div></section>` : ""}
` + FOOTER;
}

/* ----------------------------------------------------------------- routes */
const html = (body, seconds) => new Response(body, {
  headers: {
    "content-type": "text/html; charset=UTF-8",
    "cache-control": "public, max-age=" + (seconds || 300),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  }
});

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/healthz") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    if (path === "/debug/feed") {
      const { xml, info } = await fetchFeed();
      const vids = xml ? parseFeed(xml) : [];
      const lines = [
        "feed url   : " + FEED_URL,
        "http status: " + info.status,
        "bytes      : " + (info.bytes || 0),
        "note       : " + info.note,
        "parsed     : " + vids.length + " videos",
        "first      : " + (vids[0] ? vids[0].id + "  " + vids[0].title : "(none)"),
        "",
        "If parsed is 0 the site falls back to the channel link.",
        "Delete this route once everything is working."
      ];
      return new Response(lines.join("\n"),
        { headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "no-store" } });
    }

    if (path === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`,
        { headers: { "content-type": "text/plain" } });
    }

    if (path === "/sitemap.xml") {
      const videos = await getVideos();
      const urls = [`<url><loc>${SITE}/</loc><priority>1.0</priority></url>`]
        .concat(videos.map(v => `<url><loc>${SITE}/v/${v.id}</loc></url>`));
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`,
        { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
    }

    const vm = path.match(/^\/v\/([A-Za-z0-9_-]{6,20})$/);
    if (vm) {
      const videos = await getVideos();
      const found = videos.find(v => v.id === vm[1]);
      const v = found || { id: vm[1], title: "महाशक्ति सिद्धविद्या", published: "", description: "", views: "" };
      return html(videoPage(v, videos), 1800);
    }

    if (path === "/") {
      return html(homePage(await getVideos()), 120);
    }

    return html(homePage(await getVideos()), 120);
  }
};

  
