gsap.registerPlugin(ScrollTrigger);

/* Pinned timeline for the hero section */
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".scroll-section",
    start: "top top",
    end: "+=300%",       // how long the pinned scroll lasts
    scrub: true,
    pin: true,
    anticipatePin: 1
  }
});

/* 1) Expand the video from right half → fullscreen */
tl.to(".video-panel", {
  left: 0,
  width: "100vw",
  ease: "power3.out",
  duration: 0.35
}, 0);

/* 2) Fade/blur the left content away as video grows */
tl.to(".content", {
  opacity: 0,
  filter: "blur(1px)",
  ease: "power2.out",
  duration: 0.25
}, 0.15);

// 3) Bring in and expand the inner overlay card (centered by wrapper)
tl.fromTo(".hero-overlay",
  {
    opacity: 0,
    scale: 0.92,
    width: 0,
    height: 0,
    borderRadius: "50%"
  },
  {
    opacity: 1,
    scale: 1,
    width: () => Math.min(window.innerWidth * 0.8, 1200) + "px",
    height: () => Math.min(window.innerHeight * 0.8, 700) + "px",
    borderRadius: "24px",
    ease: "power3.out",
    duration: 0.35,
    immediateRender: false
  },
  0.25
);

// 4) Subtle horizontal drift while pinned
tl.to(".hero-overlay", {
  xPercent: -8,      // drift ~8% of its width left
  ease: "none",
  duration: 0.35
}, 0.55);

// 4b) Reset position before fading out (so it stays centered)
tl.to(".hero-overlay", {
  xPercent: 0,
  ease: "power1.inOut",
  duration: 0.15
}, 0.85);

// 5) Fade/blur out near the end (while centered again)
tl.to(".hero-overlay", {
  opacity: 0,
  scale: 0.98,
  filter: "blur(2px)",
  duration: 0.25,
  ease: "power2.in"
}, 0.9);


/* (Optional) keep a small hold so the video stays clean at the end */
tl.to({}, { duration: 0.05 });

/* Recalculate sizes if the viewport changes while pinned */
window.addEventListener('resize', () => ScrollTrigger.refresh());



(function(){
  const GRID = document.getElementById('grid');
  const FILTERS_EL = document.getElementById('filters');
  const SENTINEL = document.getElementById('sentinel');
  const SCROLL_UP = document.getElementById('scrollUp');
  const SECTION = document.getElementById('works');

  const OVERLAY = document.getElementById('overlay');
  const OVERLAY_CONTENT = document.querySelector('#overlay .overlay-content');
  const OVERLAY_STAGE = document.getElementById('overlayStage');
  const OVERLAY_CLOSE = document.getElementById('overlayClose');

  const PAGE_SIZE = 9; // initial
  const CHUNK = 6;     // infinite scroll increment

  const CATEGORIES = ['All', 'Lyric videos', 'AMVs', 'IRL'];

  let currentCategory = 'All';
  let cursor = 0;
  let filtered = [];
  let observer;

  // ---------- Utilities ----------
  function normalizeCategory(cat){ return (cat || '').toLowerCase(); }

  function filterDB(cat){
    if(!window.VIDEO_DB) return [];
    if(cat === 'All') return [...window.VIDEO_DB];
    return window.VIDEO_DB.filter(v => v.category && normalizeCategory(v.category) === normalizeCategory(cat));
  }

  function clearGrid(){
    GRID.innerHTML = '';
    cursor = 0;
  }

  function buildFilters(){
    CATEGORIES.forEach(cat => {
      const b = document.createElement('button');
      b.className = 'filter-pill' + (cat === 'All' ? ' active' : '');
      b.textContent = cat;
      b.dataset.cat = cat;
      b.addEventListener('click', () => onFilterChange(cat, b));
      FILTERS_EL.appendChild(b);
    });
  }

  function onFilterChange(cat, btn){
    if(currentCategory === cat) return;
    // visual press animation on the pill
    gsap.fromTo(btn, {scale:0.94}, {scale:1, duration:0.18, ease:'power2.out'});

    // deactivate/activate pills
    FILTERS_EL.querySelectorAll('.filter-pill').forEach(el => el.classList.toggle('active', el === btn));

    // fade current items out, then swap content and fade in
    const items = Array.from(GRID.children);
    if(items.length){
      gsap.to(items, {opacity:0, y:8, duration:0.18, stagger:0.01, ease:'power1.out', onComplete: () => {
        clearGrid();
        currentCategory = cat;
        filtered = filterDB(currentCategory);
        renderMore(PAGE_SIZE);
        gsap.fromTo(GRID.children, {opacity:0, y:8}, {opacity:1, y:0, duration:0.28, stagger:0.04, ease:'power1.out'});
      }});
    }else{
      // no items yet
      clearGrid();
      currentCategory = cat;
      filtered = filterDB(currentCategory);
      renderMore(PAGE_SIZE);
      gsap.fromTo(GRID.children, {opacity:0, y:8}, {opacity:1, y:0, duration:0.28, stagger:0.04, ease:'power1.out'});
    }
  }

  function ensureObserver(){
    if(observer) observer.disconnect();
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          renderMore(CHUNK);
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(SENTINEL);
  }

  function createCard(item){
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.setAttribute('aria-label', `${item.title || 'video'} (${item.category})`);

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = item.title || 'video';

    card.appendChild(img);

    // Generate thumbnail (async)
    getThumbnail(item).then(src => {
      if(src){ img.src = src; }
      card.classList.add('loaded');
    }).catch(() => {
      card.classList.add('loaded');
    });

    // Click -> open overlay
    card.addEventListener('click', () => openOverlay(item));

    return card;
  }

  // Thumbnail generation
  async function getThumbnail(item){
    if(item.type === 'youtube'){
      const id = extractYouTubeId(item.url);
      if(id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      return null;
    }
    // HTML5 video: try to capture a frame
    try{
      const frameUrl = await captureVideoFrame(item.url, 1.0);
      return frameUrl;
    }catch(e){
      console.warn('Thumbnail capture failed; fallback.', e);
      return null;
    }
  }

  function captureVideoFrame(url, atSeconds=0.5){
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.src = url + (url.includes('?') ? '&' : '?') + 't=' + Math.random(); // bust cache

      const canvas = document.createElement('canvas');
      const cleanup = () => {
        video.pause();
        video.src = '';
      };

      let seeked = false;
      video.addEventListener('loadeddata', () => {
        try{
          // Set canvas size
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if(video.readyState >= 2){
            // Seek a little into the video for a nicer frame
            video.currentTime = Math.min(Math.max(atSeconds, 0.1), (video.duration || atSeconds));
          }
        }catch(err){ /* ignore */ }
      }, { once:true });

      video.addEventListener('seeked', () => {
        if(seeked) return;
        seeked = true;
        try{
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataURL = canvas.toDataURL('image/jpeg', 0.85);
          cleanup();
          resolve(dataURL);
        }catch(err){
          cleanup();
          reject(err);
        }
      });

      video.addEventListener('error', (e) => {
        cleanup();
        reject(new Error('Video load error'));
      });

      // safety timeout
      setTimeout(() => {
        if(!seeked){
          try{ cleanup(); }catch{}
          reject(new Error('Thumbnail timeout'));
        }
      }, 6000);
    });
  }

  function extractYouTubeId(url){
    try{
      const u = new URL(url);
      if(u.hostname.includes('youtu.be')){
        return u.pathname.slice(1);
      }
      if(u.hostname.includes('youtube.com')){
        if(u.searchParams.get('v')) return u.searchParams.get('v');
        const paths = u.pathname.split('/');
        const idx = paths.indexOf('embed');
        if(idx >= 0 && paths[idx+1]) return paths[idx+1];
      }
      return null;
    }catch{ return null; }
  }

  function renderMore(count){
    if(filtered.length === 0) return;
    const frag = document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const item = filtered[cursor % filtered.length];
      frag.appendChild(createCard(item));
      cursor++;
    }
    GRID.appendChild(frag);
  }

  // ---------- Overlay logic ----------
  let ytAPIReady = false;
  let ytPlayer = null;

  function ensureYTApi(){
    return new Promise((resolve) => {
      if(ytAPIReady){ resolve(); return; }
      // inject script once
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => { ytAPIReady = true; resolve(); };
    });
  }

  function openOverlay(item){
    document.body.style.overflow = 'hidden';
    OVERLAY.classList.add('active');
    gsap.fromTo(OVERLAY.querySelector('.overlay-content'), {scale:0.96, opacity:0}, {scale:1, opacity:1, duration:0.2, ease:'power1.out'});

    // Wipe stage
    OVERLAY_STAGE.innerHTML = '';
    ytPlayer = null;

    // helper: show an 'Enable sound' prompt inside overlay-content
    function showSoundPrompt(){
      // remove existing if any
      const existing = OVERLAY.querySelector('.sound-prompt');
      if(existing) existing.remove();
      const btn = document.createElement('button');
      btn.className = 'sound-prompt';
      btn.type = 'button';
      btn.textContent = 'Enable sound';
      OVERLAY.querySelector('.overlay-content').appendChild(btn);
      // animate in
      try{ gsap.fromTo(btn, {y:8, opacity:0}, {y:0, opacity:1, duration:0.22, ease:'power2.out'}); }catch(e){}
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // Unmute YouTube player if present
        if(ytPlayer && typeof ytPlayer.unMute === 'function'){
          try{ ytPlayer.unMute(); ytPlayer.playVideo(); }catch(e){}
        }else{
          // For HTML5 video
          const vid = OVERLAY_STAGE.querySelector('video');
          if(vid){
            vid.muted = false;
            vid.play().catch(()=>{});
          }
        }
        // remove the button
        btn.remove();
      });
    }

    if(item.type === 'youtube'){
      const id = extractYouTubeId(item.url);
      ensureYTApi().then(() => {
        const div = document.createElement('div');
        div.id = 'yt-player-container';
        OVERLAY_STAGE.appendChild(div);
        ytPlayer = new YT.Player('yt-player-container', {
          videoId: id,
          playerVars: {
            'autoplay': 1,
            'controls': 0,
            'modestbranding': 1,
            'rel': 0,
            'fs': 0,
            'disablekb': 1,
            'origin': location.origin,
            'playsinline': 1
          },
          events: {
            'onReady': (e) => {
              try{
                // Start muted so autoplay is allowed, then show prompt to enable sound.
                try{
                if(typeof e.target.setPlaybackQuality === 'function'){
                  try{ e.target.setPlaybackQuality('hd1080'); }catch(e){}
                  setTimeout(()=>{ try{ e.target.setPlaybackQuality('hd1080'); }catch(e){} }, 700);
                }
              }catch(e){}
              e.target.mute();
              e.target.playVideo();
              }catch(e){}
              // show the enable-sound prompt to allow the user to unmute
              showSoundPrompt();
            },
            'onError': (err) => {
              console.warn('YouTube embed error:', err && err.data);
              OVERLAY_STAGE.innerHTML = '<div style="color:#fff; padding:16px; text-align:center;">This video cannot be played here (embed disabled). Try another or replace the URL in db.js.</div>';
            }
          }
        });

        OVERLAY_STAGE.onclick = () => {
          if(!ytPlayer) return;
          const state = ytPlayer.getPlayerState();
          if(state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
          else ytPlayer.playVideo();
        };
      }).catch(err => {
        console.warn('YT API load failed', err);
        OVERLAY_STAGE.innerHTML = '<div style="color:#fff; padding:16px; text-align:center;">Unable to load player.</div>';
      });
    }else{
      const vid = document.createElement('video');
      vid.src = item.url;
      vid.autoplay = true;
      vid.muted = true; // start muted to allow autoplay
      vid.controls = false;
      vid.playsInline = true;
      vid.setAttribute('webkit-playsinline', '');
      vid.style.width = '100%';
      vid.style.height = '100%';
      vid.style.objectFit = 'cover';
      OVERLAY_STAGE.appendChild(vid);

      // Try to play (muted) for visual
      vid.play().catch(()=>{});

      // show the enable-sound prompt so the user can unmute
      showSoundPrompt();

      // Clicking overlay toggles play/pause. When user clicks to play we unmute so audio plays.
      OVERLAY_STAGE.onclick = () => {
        if(vid.paused){
          vid.muted = false;
          vid.play().catch(()=>{});
        }else{
          vid.pause();
        }
      };
    }
  }

function closeOverlay(){
    OVERLAY.classList.remove('active');
    document.body.style.overflow = '';
    OVERLAY_STAGE.innerHTML = '';
    if(ytPlayer){ try{ ytPlayer.destroy(); }catch{} ytPlayer = null; }
  }

  OVERLAY_CLOSE.addEventListener('click', closeOverlay);
  OVERLAY.addEventListener('click', (e) => {
    // click backdrop closes; clicks inside content do not
    if(e.target.classList.contains('overlay-backdrop')){
      closeOverlay();
    }
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && OVERLAY.classList.contains('active')) closeOverlay();
  });

  // ---------- Scroll up only to section start ----------
  SCROLL_UP.addEventListener('click', () => {
    SECTION.scrollIntoView({behavior:'smooth', block:'start'});
  });

  // ---------- Init ----------
  function init(){
    buildFilters();
    filtered = filterDB(currentCategory);
    renderMore(PAGE_SIZE);
    ensureObserver();

    
  // show scroll-up button only when #works is visible
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(entry.isIntersecting) SCROLL_UP.classList.add('visible');
      else SCROLL_UP.classList.remove('visible');
    });
  }, { threshold: 0.05 });
  sectionObserver.observe(SECTION);
// entrance animation
    gsap.from('.title', {y:10, opacity:0, duration:0.35, ease:'power1.out'});
    gsap.from('.filter-pill', {opacity:0, y:6, duration:0.3, stagger:0.05, ease:'power1.out'});
    gsap.from('#grid .card', {opacity:0, y:10, duration:0.25, stagger:0.04, ease:'power1.out'});
  }

  if(document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();