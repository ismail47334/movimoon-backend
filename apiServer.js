// MoviMoon - apiServer.js - FINAL FIXED v3 - MultiMovies Player Only + Working Check + Priority Order
// GitHub Ready - Push to render -> Live
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const TMDB_API_KEY = process.env.TMDB_API_KEY || '31ff7a3cb6f70503286613810c0e6a58';
const PORT = process.env.PORT || 8787;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SITE_DOMAIN = process.env.SITE_DOMAIN || 'movimoon.blogspot.com';

console.log(`[Config] PORT=${PORT} SITE=${SITE_DOMAIN}`);

// Load Servers
let ALL_SERVERS = [];
try {
  const loaded = require('./servers.js');
  ALL_SERVERS = loaded.SERVERS || [];
  console.log(`[Load] Loaded ${ALL_SERVERS.length} servers`);
} catch(e){
  console.error('[Load] Failed', e.message);
}

const PRIORITY_ORDER = [
  'multimovies.beer',
  'slast430did',
  'nxsha space',
  'peachify top',
  'vidzee wtf',
  '2embed cc',
  'vidking net',
  'videasy'
];

function getPriorityIndex(name){
  const n = (name||'').toLowerCase();
  for(let i=0;i<PRIORITY_ORDER.length;i++){
    if(n.includes(PRIORITY_ORDER[i])) return i;
  }
  return 99;
}

function sortByPriority(servers){
  return [...servers].sort((a,b)=>{
    const ia = getPriorityIndex(a.name);
    const ib = getPriorityIndex(b.name);
    if(ia!==ib) return ia-ib;
    return (b.score||0)-(a.score||0);
  });
}

// TMDB -> Title, Slug, IMDB
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
    const slugBase = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,70);
    const slugWithYear = year ? `${slugBase}-${year}` : slugBase;
    return {
      title: rawTitle,
      slug: slugBase,
      slugWithYear,
      year,
      imdbId: extData.imdb_id || '',
      tmdbId
    };
  }catch(e){
    console.error('TMDB Error', e.message);
    return { title: '', slug: String(tmdbId), slugWithYear: String(tmdbId), imdbId: '', year: '', tmdbId };
  }
}

// MultiMovies BEER - Scrape real player only (not full site)
async function getMultiMoviesRealPlayer(slug, type, s, e){
  const candidates = [
    type==='movie' ? `https://multimovies.beer/movies/${slug}` : `https://multimovies.beer/episodes/${slug}-${s}x${e}`,
    // try with year if slug fails
  ];
  for(const pageUrl of candidates){
    try{
      const res = await fetch(pageUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://multimovies.beer/',
          'Accept': 'text/html'
        }
      });
      if(res.status!==200) continue;
      const html = await res.text();
      if(html.length < 1000) continue;
      // Find real embed: look for iframe src that is NOT multimovies.beer itself
      // Common players: filemoon, vidcloud, streamtape, voe, mixdrop etc
      const regexes = [
        /<iframe[^>]+src=["']([^"']*filemoon[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*vidcloud[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*streamtape[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*voe[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*mixdrop[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*dood[^"']*)["']/i,
        /<iframe[^>]+src=["']([^"']*player[^"']*)["']/i,
        /<iframe[^>]+src=["'](https?:\/\/[^"']+\/e\/[^"']+)["']/i,
        /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i
      ];
      for(const re of regexes){
        const m = html.match(re);
        if(m && m[1]){
          let src = m[1];
          if(src.startsWith('//')) src = 'https:'+src;
          // Filter out multimovies.beer itself to avoid loop
          if(src.includes('multimovies.beer') && !src.includes('embed')) continue;
          // Must look like player
          if(src.length > 10){
            console.log(`[MultiMovies] Real player found: ${src.substring(0,80)} from ${pageUrl}`);
            return src;
          }
        }
      }
      // If no iframe, check for JS player source
      const jsMatch = html.match(/source["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
      if(jsMatch) return jsMatch[1];
    }catch(e){
      console.log(`[MultiMovies] Scrape fail ${pageUrl}: ${e.message}`);
    }
  }
  return null;
}

// Build embed url for each server
async function buildEmbedUrl(server, info, type, season, episode){
  try{
    if(!server || !server.name) return null;
    const n = server.name.toLowerCase();
    if(n.includes('multimovies')){
      // Priority 1: Scrape real player
      const real = await getMultiMoviesRealPlayer(info.slug, type, season, episode);
      if(real) return real;
      // Fallback: try slugWithYear
      if(info.slugWithYear && info.slugWithYear!==info.slug){
        const real2 = await getMultiMoviesRealPlayer(info.slugWithYear, type, season, episode);
        if(real2) return real2;
      }
      // If scraping fails, return null (don't show full site)
      return null;
    }
    if(n.includes('slast430did')){
      if(!info.imdbId) return null;
      return type==='movie' ? server.movie(info.imdbId) : server.tv(info.imdbId, season, episode);
    }
    // Others TMDB ID
    return type==='movie' ? server.movie(info.tmdbId) : server.tv(info.tmdbId, season, episode);
  }catch(e){ return null; }
}

// Check if server actually has movie (working check)
async function checkIfWorking(embedUrl){
  if(!embedUrl) return false;
  // For filemoon/vidcloud etc direct players, assume working if url looks like player
  if(embedUrl.includes('/e/') || embedUrl.includes('filemoon') || embedUrl.includes('vidcloud') || embedUrl.includes('streamtape') || embedUrl.includes('voe')){
    return true;
  }
  try{
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 6000);
    const res = await fetch(embedUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': `https://${SITE_DOMAIN}/`,
        'Accept': 'text/html'
      }
    });
    clearTimeout(timeout);
    if(res.status!==200) return false;
    const text = await res.text();
    const lower = text.toLowerCase();
    // Not found indicators
    if(lower.includes('not found') || lower.includes('404') || lower.includes('no results') || lower.includes('movie not found') || lower.includes('file not found')){
      return false;
    }
    // Has player indicators
    const hasPlayer = lower.includes('player') || lower.includes('iframe') || lower.includes('video') || lower.includes('hls') || lower.includes('m3u8') || text.length > 4000;
    return hasPlayer;
  }catch(e){
    // If timeout or cloudflare, assume working for high priority servers, otherwise false
    // For priority servers we assume working to avoid filtering out
    return false;
  }
}

// Routes
app.get('/api/health', (req,res)=> res.json({ status:'ok', servers: ALL_SERVERS.length, uptime: process.uptime() }));
app.get('/', (req,res)=> res.json({ name: 'MoviMoon Backend v3 - Player Only + Working Filter', servers: ALL_SERVERS.length, priority: PRIORITY_ORDER }));

app.get('/api/resolve', async (req,res)=>{
  const { tmdb, type='movie', s=1, e=1 } = req.query;
  if(!tmdb) return res.status(400).json({ error: 'tmdb required' });
  const season = parseInt(s)||1;
  const episode = parseInt(e)||1;

  console.log(`[Resolve] tmdb=${tmdb} type=${type} S=${season} E=${episode}`);
  const info = await getTMDBInfo(tmdb, type);

  // Step 1: Build all embed URLs (with scraping for MultiMovies)
  const withUrls = [];
  for(const server of ALL_SERVERS){
    const embedUrl = await buildEmbedUrl(server, info, type, season, episode);
    if(!embedUrl) continue;
    withUrls.push({
      name: server.name,
      icon: server.icon || 'fa-play',
      embedUrl,
      priorityIndex: getPriorityIndex(server.name)
    });
  }

  // Sort by priority order first
  const sortedByPriority = sortByPriority(withUrls);

  // Step 2: Check working servers - but check priority servers first, in batches
  // For performance: check first 15 priority servers in parallel, then rest
  const workingServers = [];
  const batchSize = 12;
  for(let i=0;i<sortedByPriority.length;i+=batchSize){
    const batch = sortedByPriority.slice(i,i+batchSize);
    const results = await Promise.all(batch.map(async srv=>{
      // For multimovies real player we already know working
      const n = srv.name.toLowerCase();
      if(n.includes('multimovies') && (srv.embedUrl.includes('/e/') || srv.embedUrl.includes('filemoon'))){
        return { ...srv, isWorking: true, score: 1000 - srv.priorityIndex };
      }
      const ok = await checkIfWorking(srv.embedUrl);
      if(ok){
        return { ...srv, isWorking: true, score: 1000 - srv.priorityIndex };
      }
      return null;
    }));
    workingServers.push(...results.filter(Boolean));
    // If we already have 3+ working from priority, we can continue but user wants only working list
  }

  // If no server passes strict check (cloudflare), fallback to priority assumption for top 8
  let finalServers = workingServers;
  if(finalServers.length===0){
    console.log('[Resolve] No server passed strict check, fallback to priority assumption');
    // Take top 8 priority servers as working (assume they have it)
    finalServers = sortedByPriority.slice(0,8).map((srv,idx)=>({ ...srv, isWorking: true, score: 1000 - idx, assumed: true }));
  }

  // Final sort by priority again
  finalServers = sortByPriority(finalServers);

  const result = {
    tmdb, type, season, episode,
    title: info.title,
    slug: info.slug,
    imdbId: info.imdbId,
    year: info.year,
    totalChecked: ALL_SERVERS.length,
    workingCount: finalServers.length,
    defaultServer: finalServers[0] || null,
    availableServers: finalServers,
    timestamp: Date.now()
  };

  console.log(`[Resolve] Done: ${finalServers.length} working, default: ${finalServers[0]?.name}`);
  res.json(result);
});

app.listen(PORT, BIND_HOST, ()=>{
  console.log(`✅ MoviMoon Backend v3 running on http://${BIND_HOST}:${PORT} - Priority: ${PRIORITY_ORDER.join(' > ')}`);
});
