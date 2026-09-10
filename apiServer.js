// MoviMoon - apiServer.js - FIXED v2 - GitHub Ready for Render (Port 8787)
// No heavy puppeteer, No fetch checking (avoid Cloudflare block), Super Fast Resolve
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// CORS: Allow your main site + blogspot + localhost
const allowedOrigins = [
  'https://movimoon.blogspot.com',
  'https://cinevol.blogspot.com',
  'http://localhost:3000',
  'http://localhost:5173'
];
app.use(cors({
  origin: function(origin, cb){
    if(!origin) return cb(null, true);
    // allow all for embed player, but you can restrict later
    return cb(null, true);
  }
}));
app.use(express.json());

// ===== CONFIG =====
const TMDB_API_KEY = process.env.TMDB_API_KEY || '31ff7a3cb6f70503286613810c0e6a58';
const PORT = process.env.PORT || 8787;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const SITE_DOMAIN = process.env.SITE_DOMAIN || 'movimoon.blogspot.com';
const REFERER = `https://${SITE_DOMAIN}/`;

console.log(`[Config] PORT=${PORT} SITE=${SITE_DOMAIN}`);

// Load 61 Servers
let ALL_SERVERS = [];
try {
  const loaded = require('./servers.js');
  ALL_SERVERS = loaded.SERVERS || [];
  console.log(`[Load] Loaded ${ALL_SERVERS.length} servers`);
} catch(e){
  console.error('[Load] Failed:', e.message);
  ALL_SERVERS = [];
}

// Scoring for priority
function getScore(name){
  const n = (name||'').toLowerCase();
  if(n.includes('multimovies')) return 200;
  if(n.includes('slast430did')) return 199;
  if(n.includes('vidfast')) return 100;
  if(n.includes('vidsrc xyz')) return 95;
  if(n.includes('vidlink')) return 90;
  if(n.includes('superembed')) return 85;
  return 50;
}

function getPrioritizedServers(){
  const priority = [];
  const rest = [];
  for(const s of ALL_SERVERS){
    const isPriority = s.name && (s.name.includes('MultiMovies') || s.name.includes('Slast430did'));
    if(isPriority){
      if(s.name.includes('MultiMovies')) priority.unshift(s);
      else priority.push(s);
    } else rest.push(s);
  }
  // sort rest by score
  rest.sort((a,b)=> getScore(b.name)-getScore(a.name));
  return [...priority, ...rest];
}

const SERVERS = getPrioritizedServers();

// TMDB Helper - Title + IMDB conversion
async function getTMDBInfo(tmdbId, type){
  try{
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    const extUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const extRes = await fetch(extUrl, { timeout: 8000 });
    const extData = await extRes.json().catch(()=>({}));
    
    const rawTitle = data.title || data.name || '';
    // For MultiMovies BEER: needs slug like "fight-club" or "fight-club-1999"
    const year = (data.release_date || data.first_air_date || '').split('-')[0] || '';
    const slugBase = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,60);
    // Some implementations use title-year, keep both
    const slug = slugBase;
    const slugWithYear = year ? `${slugBase}-${year}` : slugBase;

    return {
      title: rawTitle,
      slug: slug,
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

function buildEmbedUrl(server, info, type, season, episode){
  try{
    if(server.name && server.name.includes('MultiMovies')){
      // uses title slug
      const titleParam = info.slug || info.tmdbId;
      // Try slug first, fallback to slugWithYear if your beer site needs it
      return type==='movie' ? server.movie(titleParam) : server.tv(titleParam, season, episode);
    }
    if(server.name && server.name.includes('Slast430did')){
      if(!info.imdbId) return null; // will be filtered if no imdb
      return type==='movie' ? server.movie(info.imdbId) : server.tv(info.imdbId, season, episode);
    }
    // Others: TMDB ID
    return type==='movie' ? server.movie(info.tmdbId) : server.tv(info.tmdbId, season, episode);
  }catch(e){ return null; }
}

// Routes
app.get('/api/health', (req,res)=>{
  res.json({ status:'ok', uptime: process.uptime(), port: PORT, servers: SERVERS.length, domain: SITE_DOMAIN });
});
app.get('/health', (req,res)=> res.json({ status:'ok' }));

app.get('/', (req,res)=>{
  res.json({
    name: 'MoviMoon Smart Backend v2 - 61 Servers',
    port: PORT,
    totalServers: SERVERS.length,
    priority: ['MultiMovies BEER (Title)', 'Slast430did COM (IMDB)'],
    endpoints: {
      resolve: '/api/resolve?tmdb=550&type=movie',
      resolveTV: '/api/resolve?tmdb=1399&type=tv&s=1&e=1'
    }
  });
});

app.get('/api/resolve', async (req,res)=>{
  const { tmdb, type='movie', s=1, e=1 } = req.query;
  if(!tmdb) return res.status(400).json({ error: 'tmdb query param required' });
  
  const season = parseInt(s) || 1;
  const episode = parseInt(e) || 1;
  
  console.log(`[Resolve] tmdb=${tmdb} type=${type} S=${season} E=${episode}`);
  const info = await getTMDBInfo(tmdb, type);
  
  const workingServers = [];
  for(const server of SERVERS){
    const embedUrl = buildEmbedUrl(server, info, type, season, episode);
    if(!embedUrl) continue;
    workingServers.push({
      name: server.name,
      icon: server.icon || 'fa-play',
      embedUrl,
      score: getScore(server.name),
      type: server.name.includes('MultiMovies') ? 'title' : server.name.includes('Slast430did') ? 'imdb' : 'tmdb'
    });
  }
  // sort by score
  workingServers.sort((a,b)=> b.score - a.score);
  
  // default = first available (priority will be first because of sorting)
  const result = {
    tmdb, type, season, episode,
    title: info.title,
    slug: info.slug,
    slugWithYear: info.slugWithYear,
    imdbId: info.imdbId,
    year: info.year,
    totalChecked: SERVERS.length,
    workingCount: workingServers.length,
    defaultServer: workingServers[0] || null,
    availableServers: workingServers,
    timestamp: Date.now()
  };
  res.json(result);
});

app.listen(PORT, BIND_HOST, ()=>{
  console.log(`✅ MoviMoon Backend running on http://${BIND_HOST}:${PORT} - ${SERVERS.length} servers`);
});
