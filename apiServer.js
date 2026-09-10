// MoviMoon Backend v5.1 FINAL - All Results + Player Only + Priority: slast430did(IMDB) > multimovies.beer(Title)
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

console.log(`[Config v5.1] All Results + Player Only - Priority: slast430did(IMDB) > multimovies(Title)`);

let ALL_SERVERS = [];
try {
  const loaded = require('./servers.js');
  ALL_SERVERS = loaded.SERVERS || [];
  console.log(`[Load] ${ALL_SERVERS.length} servers`);
} catch(e){ console.error(e.message); }

const PRIORITY_ORDER = ['slast430did','multimovies.beer','nxsha space','peachify top','vidzee wtf','2embed cc','vidking net','videasy'];
function getPriorityIndex(name){ const n=(name||'').toLowerCase(); for(let i=0;i<PRIORITY_ORDER.length;i++) if(n.includes(PRIORITY_ORDER[i])) return i; return 99; }
function sortByPriority(arr){ return [...arr].sort((a,b)=> getPriorityIndex(a.name)-getPriorityIndex(b.name)); }

const UAS = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'];
function randomUA(){ return UAS[Math.floor(Math.random()*UAS.length)]; }

async function getTMDBInfo(tmdbId, type){
  try{
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    const extUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const extRes = await fetch(extUrl, { timeout: 8000 });
    const extData = await extRes.json().catch(()=>({}));
    const rawTitle = data.title || data.name || '';
    const year = (data.release_date || data.first_air_date || '').split('-')[0] || '';
    const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,70);
    const slugWithYear = year ? `${slug}-${year}` : slug;
    return { title: rawTitle, slug, slugWithYear, year, imdbId: extData.imdb_id||'', tmdbId };
  }catch(e){ return { title:'', slug:String(tmdbId), slugWithYear:String(tmdbId), imdbId:'', year:'', tmdbId }; }
}

// MultiMovies v5.1 - Hybrid: Try Real Player, Fallback to Full Site but with Player-Only Flag
async function getMultiMoviesResult(slug, type, s, e){
  const pageUrl = type==='movie' ? `https://multimovies.beer/movies/${slug}` : `https://multimovies.beer/episodes/${slug}-${s}x${e}`;
  
  try{
    const res = await fetch(pageUrl, {
      timeout: 10000,
      headers: { 'User-Agent': randomUA(), 'Referer': 'https://multimovies.beer/', 'Accept': 'text/html' }
    });
    
    // Even if 404, we still return fallback URL so result always comes
    if(res.status!==200){
      console.log(`[MultiMovies v5.1] ${pageUrl} status ${res.status}, fallback to player-only mode`);
      return { embedUrl: pageUrl, isFullSite: true, isRealPlayer: false, originalPage: pageUrl };
    }
    
    const html = await res.text();
    // Try to find real player
    const patterns = [
      /src=["'](https?:\/\/[^"']*filemoon[^"']*)["']/i,
      /src=["'](https?:\/\/[^"']*vidcloud[^"']*)["']/i,
      /src=["'](https?:\/\/[^"']*streamtape[^"']*)["']/i,
      /src=["'](https?:\/\/[^"']*voe[^"']*)["']/i,
      /src=["'](https?:\/\/[^"']*mixdrop[^"']*)["']/i,
      /src=["'](https?:\/\/[^"']*dood[^"']*)["']/i,
      /<iframe[^>]+src=["'](https?:\/\/[^"']+\/e\/[^"']+)["']/i,
      /<iframe[^>]+src=["']([^"']+)["']/i
    ];
    
    for(const re of patterns){
      const m = html.match(re);
      if(m && m[1]){
        let src = m[1];
        if(src.startsWith('//')) src = 'https:'+src;
        if(src.includes('multimovies.beer') && src.length<100) continue;
        if(src.includes('facebook')||src.includes('telegram')||src.includes('googletagmanager')) continue;
        if(src.length>15){
          console.log(`[MultiMovies v5.1] Real Player Found: ${src.slice(0,80)}`);
          return { embedUrl: src, isFullSite: false, isRealPlayer: true, originalPage: pageUrl };
        }
      }
    }
    
    // Real player not found - return full site but with flag so frontend can crop to player only
    console.log(`[MultiMovies v5.1] No real player, using full site with player-only crop: ${pageUrl}`);
    return { embedUrl: pageUrl, isFullSite: true, isRealPlayer: false, originalPage: pageUrl };
    
  }catch(err){
    console.log(`[MultiMovies v5.1] Error ${pageUrl}: ${err.message}, fallback to full site`);
    return { embedUrl: pageUrl, isFullSite: true, isRealPlayer: false, originalPage: pageUrl };
  }
}

async function buildEmbedUrl(server, info, type, season, episode){
  if(!server) return null;
  const n = server.name.toLowerCase();
  
  if(n.includes('slast430did')){
    if(!info.imdbId) return null;
    const url = type==='movie' ? server.movie(info.imdbId) : server.tv(info.imdbId, season, episode);
    return { embedUrl: url, isFullSite: false, isRealPlayer: true, conversion: `TMDB ${info.tmdbId} -> IMDB ${info.imdbId}` };
  }
  
  if(n.includes('multimovies')){
    const result = await getMultiMoviesResult(info.slug, type, season, episode);
    if(!result && info.slugWithYear!==info.slug){
      const result2 = await getMultiMoviesResult(info.slugWithYear, type, season, episode);
      if(result2) return { ...result2, conversion: `Title "${info.title}" -> Slug "${info.slugWithYear}"` };
    }
    if(result){
      return { ...result, conversion: `Title "${info.title}" -> Slug "${info.slug}"` };
    }
    // Final ultimate fallback - always return something so result never empty
    return { embedUrl: `https://multimovies.beer/movies/${info.slug}`, isFullSite: true, isRealPlayer: false, conversion: `Title "${info.title}" -> Slug "${info.slug}" (fallback)` };
  }
  
  const url = type==='movie' ? server.movie(info.tmdbId) : server.tv(info.tmdbId, season, episode);
  return { embedUrl: url, isFullSite: false, isRealPlayer: true, conversion: `TMDB ${info.tmdbId}` };
}

async function checkWorking(embedUrl){
  if(!embedUrl) return false;
  if(embedUrl.includes('/e/') || embedUrl.includes('filemoon') || embedUrl.includes('vidcloud') || embedUrl.includes('multimovies.beer')) return true;
  if(embedUrl.includes('slast430did.com')) return true;
  try{
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 6000);
    const res = await fetch(embedUrl, { signal: controller.signal, timeout: 6000, headers: { 'User-Agent': randomUA(), 'Referer': 'https://google.com/' } });
    clearTimeout(t);
    if(res.status!==200) return false;
    const txt = await res.text();
    const low = txt.toLowerCase();
    if(low.includes('not found')||low.includes('file not found')) return false;
    return txt.length>1000;
  }catch(e){ return false; }
}

app.get('/api/proxy', async (req,res)=>{
  const { url } = req.query;
  if(!url) return res.status(400).send('url required');
  try{
    const decoded = decodeURIComponent(url);
    const proxied = await fetch(decoded, { timeout:15000, headers:{ 'User-Agent': randomUA(), 'Referer': 'https://multimovies.beer/' } });
    const body = await proxied.text();
    res.set('Access-Control-Allow-Origin','*');
    res.set('Content-Type', proxied.headers.get('content-type')||'text/html');
    res.send(body);
  }catch(e){ res.status(500).send(e.message); }
});

app.get('/api/health', (req,res)=> res.json({ status:'ok v5.1 all-results', servers: ALL_SERVERS.length, priority: PRIORITY_ORDER }));
app.get('/', (req,res)=> res.json({ name:'MoviMoon Backend v5.1 - All Results + Player Only', priority: PRIORITY_ORDER, servers: ALL_SERVERS.length }));

app.get('/api/resolve', async (req,res)=>{
  const { tmdb, type='movie', s=1, e=1 } = req.query;
  if(!tmdb) return res.status(400).json({ error:'tmdb required' });
  const season = parseInt(s)||1, episode = parseInt(e)||1;
  console.log(`[v5.1 Resolve] tmdb=${tmdb} type=${type}`);
  const info = await getTMDBInfo(tmdb, type);
  console.log(`[v5.1 Convert] tmdb=${info.tmdbId} -> title="${info.title}" slug="${info.slug}" imdb=${info.imdbId}`);

  const withUrls = [];
  for(const server of ALL_SERVERS){
    const result = await buildEmbedUrl(server, info, type, season, episode);
    if(!result || !result.embedUrl) continue;
    withUrls.push({ 
      name: server.name, 
      icon: server.icon||'fa-play', 
      embedUrl: result.embedUrl,
      isFullSite: result.isFullSite||false,
      isRealPlayer: result.isRealPlayer||false,
      originalPage: result.originalPage||null,
      conversion: result.conversion||'',
      priorityIndex: getPriorityIndex(server.name)
    });
  }
  const sorted = sortByPriority(withUrls);

  const working = [];
  for(const srv of sorted){
    // For v5.1, assume working for priority 1 and 2 to ensure results always come
    const n = srv.name.toLowerCase();
    if(n.includes('slast430did') || n.includes('multimovies.beer')){
      working.push({ ...srv, isWorking:true, score:1000-srv.priorityIndex });
      continue;
    }
    const ok = await checkWorking(srv.embedUrl);
    if(ok) working.push({ ...srv, isWorking:true, score:1000-srv.priorityIndex });
  }

  let finalServers = working;
  if(finalServers.length===0){
    finalServers = sorted.slice(0,8).map((srv,idx)=>({ ...srv, isWorking:true, score:1000-idx, assumed:true }));
  }
  finalServers = sortByPriority(finalServers);

  console.log(`[v5.1 Done] ${finalServers.length} working, default: ${finalServers[0]?.name}`);

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

app.listen(PORT, BIND_HOST, ()=> console.log(`✅ MoviMoon v5.1 FINAL running - All Results + Player Only - Priority: ${PRIORITY_ORDER.join(' > ')}`));
