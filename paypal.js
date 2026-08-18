(function(){
  var buy = document.getElementById('buy');

  function normTitle(s){
    return String(s || '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function applyFilms(films){
    var byTitle = {};
    Object.keys(films || {}).forEach(function(k){ byTitle[normTitle(k)] = films[k]; });

    document.querySelectorAll('[data-locked]').forEach(function(el){
      var entry = byTitle[normTitle(el.getAttribute('data-title'))];
      if(!entry){
        console.warn('VER-DÉ: no manifest entry for', el.getAttribute('data-title'));
        return;
      }
      if(entry.type === 'rail'){
        el.dataset.rail = entry.rail === 'movements' ? 'movements' : '';
        if(entry.rail === 'episodes') el.dataset.playlist = 'true';
        window.VERDE_RAILS = window.VERDE_RAILS || {};
        window.VERDE_RAILS[entry.rail] = entry.items;
      } else {
        el.dataset.video = 'https://www.youtube-nocookie.com/embed/' + entry.id;
        if(entry.vertical) el.dataset.vertical = 'true';
      }
      el.removeAttribute('data-locked');
      el.querySelectorAll('.thumb-badge,.lock-note').forEach(function(x){ x.remove(); });
      var gp = el.querySelector('.gate-panel');
      if(gp) gp.remove();
      if(el.classList.contains('catalog-thumb')){
        el.setAttribute('aria-label', el.getAttribute('data-title') || 'film');
      }
    });
  }

  function unlockFounderAccess(token, films){
    if(token) localStorage.setItem('verde_founder_access', token);
    applyFilms(films);
  }

  async function verifyToken(token){
    try{
      var r = await fetch('/api/films?token=' + encodeURIComponent(token), {cache:'no-store'});
      if(!r.ok) return false;
      var data = await r.json();
      if(data.valid && data.films){ unlockFounderAccess(token, data.films); return true; }
      return false;
    }catch(e){ return false; }
  }

  (async function(){
    var q = new URLSearchParams(window.location.search);
    var token = q.get('access') || localStorage.getItem('verde_founder_access');
    if(!token) return;
    var ok = await verifyToken(token);
    if(ok && q.has('access')){
      q.delete('access');
      var clean = window.location.pathname + (q.toString() ? '?' + q.toString() : '') + window.location.hash;
      history.replaceState({}, document.title, clean);
    }
  })();

  if(!buy) return;

  buy.addEventListener('click', async function(){
    if(document.getElementById('paypalMount')) return;
    buy.disabled = true;
    buy.textContent = 'Loading payment…';

    var mount = document.createElement('div');
    mount.id = 'paypalMount';
    mount.style.maxWidth = '420px';
    mount.style.marginTop = '14px';
    buy.parentNode.insertBefore(mount, buy);
    buy.style.display = 'none';

    try{
      var cr = await fetch('/api/paypal-client', {cache:'no-store'});
      var cd = await cr.json();
      if(!cr.ok || !cd.clientId) throw new Error('PayPal is not configured.');

      await new Promise(function(resolve, reject){
        var sc = document.createElement('script');
        sc.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(cd.clientId) + '&currency=USD&components=buttons&enable-funding=card';
        sc.onload = resolve;
        sc.onerror = reject;
        document.head.appendChild(sc);
      });

      await paypal.Buttons({
        style: { layout:'vertical', shape:'rect', label:'paypal' },
        createOrder: function(){
          return fetch('/api/paypal-order', {method:'POST'})
            .then(function(r){ return r.json(); })
            .then(function(data){
              if(!data.id) throw new Error(data.error || 'Could not start PayPal checkout.');
              return data.id;
            });
        },
        onApprove: function(data){
          return fetch('/api/paypal-capture', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({orderID:data.orderID})
          }).then(function(r){ return r.json().then(function(body){ return {ok:r.ok,body:body}; }); })
            .then(function(result){
              if(!result.ok || !result.body.accessToken) throw new Error(result.body.error || 'Payment could not be verified.');
              var token = result.body.accessToken;
              localStorage.setItem('verde_founder_access', token);
              var url = new URL(window.location.href);
              url.searchParams.set('access', token);
              window.location.href = url.toString();
            });
        },
        onCancel: function(){
          buy.style.display = '';
          buy.disabled = false;
          buy.textContent = 'Get lifetime access';
          mount.remove();
        },
        onError: function(err){
          console.error(err);
          buy.style.display = '';
          buy.disabled = false;
          buy.textContent = 'Get lifetime access';
          mount.remove();
          alert('PayPal checkout could not be completed. Please try again.');
        }
      }).render('#paypalMount');
    }catch(err){
      console.error(err);
      buy.style.display = '';
      buy.disabled = false;
      buy.textContent = 'Get lifetime access';
      mount.remove();
      alert('PayPal checkout is unavailable right now.');
    }
  });
})();
