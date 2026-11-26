(() => {
  const token = location.hash.slice(1);
  if (!token) return;
  const panel = document.getElementById('portalSignIn');
  const emailForm = document.getElementById('portalEmailForm');
  const codeForm = document.getElementById('portalCodeForm');
  const email = document.getElementById('portalEmail');
  const code = document.getElementById('portalCode');
  const notice = document.getElementById('portalSignInNotice');
  const retry = document.getElementById('portalSignInRetry');
  const key = 'vecta.garage.session.v1';
  let session = '', challenge = '', grant;
  try { session = localStorage.getItem(key) || ''; } catch {}
  const ready = new Promise(resolve => { grant = resolve; });
  window.VectaPortalSignIn = {ready, session: () => session};
  async function api(action, body = {}) {
    const response = await fetch('/api/job-progress', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(20000), body:JSON.stringify({action, ...body})});
    const data = await response.json();
    if (!response.ok) throw Object.assign(Error(data.error || 'Please try again.'), {status:response.status});
    return data;
  }
  function enter() {
    panel.hidden = true;
    document.body.classList.remove('portal-locked');
    grant();
  }
  function showEmail(message) {
    emailForm.hidden = false;
    codeForm.hidden = true;
    notice.textContent = message;
    email.focus();
  }
  async function check() {
    retry.hidden = true;
    try {
      await api('portal-access', {token, session});
      enter();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showEmail(error.status === 403 ? 'Use the email address you booked with.' : '');
      } else {
        notice.textContent = error.message;
        retry.hidden = false;
      }
    }
  }
  function submit(form, handler) {
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      try { await handler(); } catch (error) { notice.textContent = error.message; }
      finally { button.disabled = false; }
    };
  }
  submit(emailForm, async () => {
    const data = await api('portal-request-code', {token, email:email.value});
    challenge = data.challenge;
    emailForm.hidden = true;
    codeForm.hidden = false;
    notice.textContent = 'Check your inbox for the six-digit code. It expires in 10 minutes.';
    code.value = '';
    code.focus();
  });
  submit(codeForm, async () => {
    const data = await api('garage-verify', {challenge, code:code.value});
    await api('portal-access', {token, session:data.session});
    session = data.session;
    try { localStorage.setItem(key, session); } catch {}
    enter();
  });
  document.getElementById('portalChangeEmail').onclick = () => showEmail('');
  retry.onclick = check;
  document.body.classList.add('portal-locked');
  panel.hidden = false;
  check();
})();
