const form = document.querySelector('#authForm');
const error = document.querySelector('#formError');
const signup = location.pathname === '/signup';
const next = new URLSearchParams(location.search).get('next');
const destination = next && /^\/(lease|board|social|calendar)$/.test(next) ? next : '/lease';
form.addEventListener('submit', async event => {
  event.preventDefault(); error.textContent = '';
  const button=form.querySelector('button[type="submit"]'); button.disabled=true;
  const input=Object.fromEntries(new FormData(form));
  try { const response=await fetch(signup?'/api/register':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Sign-in failed.'); location.href=destination; }
  catch(e){error.textContent=e.message;button.disabled=false;}
});
const info = await (await fetch('/api/me')).json();
const googleNote=document.querySelector('#googleNote');
if (info.googleClientId) {
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{ if(!window.google?.accounts?.id){googleNote.textContent='Google sign-in could not load.';return;} window.google.accounts.id.initialize({client_id:info.googleClientId,callback:async({credential})=>{error.textContent='';try{const response=await fetch('/api/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Google sign-in failed.');location.href=destination;}catch(e){error.textContent=e.message;}}});window.google.accounts.id.renderButton(document.querySelector('#googleButton'),{theme:'outline',size:'large',text:'continue_with',width:300});};
  script.onerror=()=>{googleNote.textContent='Google sign-in could not load.';};document.head.append(script);
} else { const button=document.createElement('button');button.type='button';button.className='google-placeholder';button.textContent='Continue with Google';button.disabled=true;document.querySelector('#googleButton').append(button);googleNote.textContent='Google sign-in will be available once a Google client ID is configured.'; }
