// VER-DÉ — PayPal / card Founding Access checkout
(function(){
  var buy = document.getElementById('buy');
  if(!buy) return;

  function unlockFounderAccess(token){
    localStorage.setItem('verde_founder_access', token);
    document.querySelectorAll('.catalog-thumb[data-locked]').forEach(function(btn){
      btn.removeAttribute('data-locked');
      btn.querySelectorAll('.thumb-badge,.lock-note').forEach(function(el){ el.remove(); });
      btn.setAttribute('aria-label', btn.getAttribute('data-title') || 'film');
    });
    document.querySelectorAll('.vertical-link[data-locked], .text-watch[data-locked]').forEach(function(a){
      a.removeAttribute('data-locked');
    });
  }

  async function verifyToken(token){
    try{
      var r = await fetch('/api/paypal-verify?token=' + encodeURIComponent(token), {cache:'no-store'});
      if(!r.ok) return false;
      var data = await r.json();
      if(data.valid) unlockFounderAccess(token);
      return Boolean(data.valid);
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
              unlockFounderAccess(token);
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
