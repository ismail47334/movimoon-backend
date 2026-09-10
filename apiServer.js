// MoviMoon Backend v5 FINAL - Priority: slast430did (IMDB) > multimovies.beer (Title) + Proxy + Working Filter
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const TMDB_API_KEY = process.env.TMDB_API_KEY || '31ff7a3cb6f70503286613810c0e6a58';
const PORT = process.env.PORT || 8787;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SITE_DOMAIN = process.env.SITE_DOMAIN || 'movimoon.blogspot.com';

console.log(`[Config v5] PORT=${PORT} DOMAIN=${SITE_DOMAIN} Priority: slast430did > multimovies.beer`);

let ALL_SERVERS = [];
try {
  const loaded = require('./servers.js');
  ALL_SERVERS = loaded.SERVERS || [];
  console.log(`[Load] ${ALL_SERVERS.length} servers`);
} catch(e){ console.error(e.message); }

// NEW PRIORITY ORDER - slast430did = 1st (IMDB), multimovies.beer = 2nd (Title)
const PRIORITY_ORDER = [
  'slast430did',          // 1 - IMDB based
  'multimovies.beer',     // 2 - Title based, player only
  'nxsha space',
  'peachify top',
  'vidzee wtf',
  '2embed cc',
  'vidking net',
  'videasy'
];

function getPriorityIndex(name){
  const n = (name||'').toLowerCase();
  for(let i=0;i<PRIORITY_ORDER.length;i++) if(n.includes(PRIORITY_ORDER[i])) return i;
  return 99;
}
function sortByPriority(arr){ return [...arr].sort((a,b)=> getPriorityIndex(a.name)-getPriorityIndex(b.name)); }

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];
function randomUA(){ return UAS[Math.floor(Math.random()*UAS.length)]; }

// TMDB -> Title + IMDB Conversion
async function getTMDBInfo(tmdbId, type){
  try{
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    if(data.status_code===34) throw new Error('TMDB not found');
    const extUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const extRes = await fetch(extUrl, { timeout: 8000 });
    const extData = await extRes.json().catch(()=>({}));
    
    const rawTitle = data.title || data.name || '';
    const year = (data.release_date || data.first_air_date || '').split('-')[0] || '';
    const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,70);
    const slugWithYear = year ? `${slug}-${year}` : slug;
    
    return {
      title: rawTitle,
      slug, // for multimovies.beer
      slugWithYear,
      year,
      imdbId: extData.imdb_id || '', // for slast430did.com
      tmdbId
    };
  }catch(e){
    console.error('TMDB Error', e.message);
    return { title:'', slug:String(tmdbId), slugWithYear:String(tmdbId), imdbId:'', year:'', tmdbId };
  }
}

// MultiMovies BEER - Title Based + Player Only Scraper
async function getMultiMoviesRealPlayer(slug, type, s, e){
  const pages = [
    type==='movie' ? `https://multimovies.beer/movies/${slug}` : `https://multimovies.beer/episodes/${slug}-${s}x${e}`,
  ];
  for(const pageUrl of pages){
    try{
      const res = await fetch(pageUrl, {
        timeout: 12000,
        headers: { 'User-Agent': randomUA(), 'Referer': 'https://multimovies.beer/', 'Accept': 'text/html' }
      });
      if(res.status!==200) continue;
      const html = await res.text();
      if(html.length<800) continue;
      const patterns = [
        /src=["'](https?:\/\/[^"']*filemoon[^"']*)["']/i,
        /src=["'](https?:\/\/[^"']*vidcloud[^"']*)["']/i,
        /src=["'](https?:\/\/[^"']*streamtape[^"']*)["']/i,
        /src=["'](https?:\/\/[^"']*voe[^"']*)["']/i,
        /src=["'](https?:\/\/[^"']*mixdrop[^"']*)["']/i,
        /src=["'](https?:\/\/[^"']*dood[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']+)["']/i
      ];
      for(const re of patterns){
        const m = html.match(re);
        if(m && m[1]){
          let src = m[1];
          if(src.startsWith('//')) src = 'https:'+src;
          if(src.includes('multimovies.beer') && src.length<100) continue;
          if(src.includes('facebook')||src.includes('telegram')||src.includes('googletag')) continue;
          if(src.length>15){
            console.log(`[MultiMovies Title->Player] ${src.slice(0,80)}`);
            return src;
          }
        }
      }
    }catch(e){ console.log('MultiMovies scrape err', e.message); }
  }
  return null;
}

async function buildEmbedUrl(server, info, type, season, episode){
  if(!server) return null;
  const n = server.name.toLowerCase();
  
  // 1st Priority: slast430did.com - IMDB based
  if(n.includes('slast430did')){
    if(!info.imdbId){
      console.log(`[Slast430did] No IMDB ID for tmdb=${info.tmdbId}, skipping`);
      return null;
    }
    console.log(`[Slast430did] TMDB ${info.tmdbId} -> IMDB ${info.imdbId}`);
    return type==='movie' ? server.movie(info.imdbId) : server.tv(info.imdbId, season, episode);
  }
  
  // 2nd Priority: multimovies.beer - Title based + Player Only
  if(n.includes('multimovies')){
    console.log(`[MultiMovies] Title slug: ${info.slug} (from "${info.title}")`);
    const real = await getMultiMoviesRealPlayer(info.slug, type, season, episode);
    if(real) return real;
    if(info.slugWithYear!==info.slug){
      const real2 = await getMultiMoviesRealPlayer(info.slugWithYear, type, season, episode);
      if(real2) return real2;
    }
    return null; // Don't return full site
  }
  
  // Others: TMDB based
  return type==='movie' ? server.movie(info.tmdbId) : server.tv(info.tmdbId, season, episode);
}

async function checkWorking(embedUrl){
  if(!embedUrl) return false;
  if(embedUrl.includes('/e/') || embedUrl.includes('filemoon') || embedUrl.includes('vidcloud')) return true;
  try{
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 7000);
    const res = await fetch(embedUrl, {
      signal: controller.signal,
      timeout: 7000,
      headers: { 'User-Agent': randomUA(), 'Referer': 'https://google.com/', 'Accept': 'text/html' }
    });
    clearTimeout(t);
    if(res.status!==200) return false;
    const txt = await res.text();
    const low = txt.toLowerCase();
    if(low.includes('not found')||low.includes('file not found')||low.includes('404')) return false;
    return txt.length>1500;
  }catch(e){ return false; }
}

// Proxy Endpoints for Bypass
app.get('/api/proxy', async (req,res)=>{
  const { url, referer } = req.query;
  if(!url) return res.status(400).send('url required');
  try{
    const decoded = decodeURIComponent(url);
    if(!decoded.startsWith('http')) return res.status(400).send('invalid');
    const targetReferer = referer ? decodeURIComponent(referer) : 'https://google.com/';
    const proxied = await fetch(decoded, { timeout:15000, headers:{ 'User-Agent': randomUA(), 'Referer': targetReferer } });
    const body = await proxied.text();
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type', proxied.headers.get('content-type')||'text/html');
    res.send(body);
  }catch(e){ res.status(500).send(e.message); }
});

app.get('/api/hls-proxy', async (req,res)=>{
  const { url } = req.query;
  if(!url) return res.status(400).send('url required');
  try{
    const decoded = decodeURIComponent(url);
    const r = await fetch(decoded, { timeout:15000, headers:{ 'User-Agent': randomUA() } });
    let text = await r.text();
    const baseUrl = decoded.substring(0, decoded.lastIndexOf('/')+1);
    text = text.replace(/^(?!#)(.+)$/gm, (m,p1)=>{
      if(p1.startsWith('http')) return `/api/hls-proxy?url=${encodeURIComponent(p1)}`;
      return `/api/hls-proxy?url=${encodeURIComponent(baseUrl+p1)}`;
    });
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type','application/vnd.apple.mpegurl');
    res.send(text);
  }catch(e){ res.status(500).send(e.message); }
});

app.get('/api/health', (req,res)=> res.json({ status:'ok v5', servers: ALL_SERVERS.length, priority: PRIORITY_ORDER }));
app.get('/', (req,res)=> res.json({ name:'MoviMoon Backend v5 FINAL', priority: PRIORITY_ORDER, servers: ALL_SERVERS.length }));

app.get('/api/resolve', async (req,res)=>{
  const { tmdb, type='movie', s=1, e=1 } = req.query;
  if(!tmdb) return res.status(400).json({ error:'tmdb required' });
  const season = parseInt(s)||1, episode = parseInt(e)||1;
  console.log(`[v5 Resolve] tmdb=${tmdb} type=${type} -> Priority: slast430did(IMDB) > multimovies(Title)`);
  const info = await getTMDBInfo(tmdb, type);
  console.log(`[v5 TMDB Convert] tmdb=${info.tmdbId} -> title="${info.title}" slug="${info.slug}" imdb=${info.imdbId}`);

  const withUrls = [];
  for(const server of ALL_SERVERS){
    const embedUrl = await buildEmbedUrl(server, info, type, season, episode);
    if(!embedUrl) continue;
    withUrls.push({ name: server.name, icon: server.icon||'fa-play', embedUrl, priorityIndex: getPriorityIndex(server.name), conversionType: server.name.toLowerCase().includes('slast430did')?'TMDB->IMDB':server.name.toLowerCase().includes('multimovies')?'Title':'TMDB' });
  }
  const sorted = sortByPriority(withUrls);

  const working = [];
  const batchSize = 8;
  for(let i=0;i<sorted.length;i+=batchSize){
    const batch = sorted.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(async srv=>{
      if(srv.name.toLowerCase().includes('multimovies') && srv.embedUrl.includes('/e/')) return { ...srv, isWorking:true, score:1000-srv.priorityIndex };
      if(srv.name.toLowerCase().includes('slast430did')) return { ...srv, isWorking:true, score:1000-srv.priorityIndex }; // slast always assumed working if IMDB exists
      const ok = await checkWorking(srv.embedUrl);
      if(ok) return { ...srv, isWorking:true, score:1000-srv.priorityIndex };
      return null;
    }));
    working.push(...results.filter(Boolean));
  }

  let finalServers = working;
  if(finalServers.length===0){
    finalServers = sorted.slice(0,8).map((srv,idx)=>({ ...srv, isWorking:true, score:1000-idx, assumed:true }));
  }
  finalServers = sortByPriority(finalServers);

  console.log(`[v5 Done] ${finalServers.length} working, default: ${finalServers[0]?.name} (${finalServers[0]?.conversionType})`);

  res.json({
    tmdb, type, season, episode,
    title: info.title, slug: info.slug, imdbId: info.imdbId, year: info.year,
    totalChecked: ALL_SERVERS.length,
    workingCount: finalServers.length,
    priority: PRIORITY_ORDER,
    conversions: { slast430did: `TMDB ${tmdb} -> IMDB ${info.imdbId}`, multimovies: `Title "${info.title}" -> Slug "${info.slug}"` },
    defaultServer: finalServers[0]||null,
    availableServers: finalServers,
    timestamp: Date.now()
  });
});

app.listen(PORT, BIND_HOST, ()=> console.log(`✅ MoviMoon v5 FINAL running on http://${BIND_HOST}:${PORT} - Priority: ${PRIORITY_ORDER.join(' > ')}`));
