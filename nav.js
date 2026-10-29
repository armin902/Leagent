const mount = document.querySelector('#navMount');
const routes = [['/','Home'],['/lease','Lease reader'],['/board','Move-in board'],['/social','Social hub'],['/calendar','Calendar']];
const response = await fetch('/api/me');
const { user } = await response.json();
const bar = document.createElement('div'); bar.className = 'topbar appbar';
const brand = document.createElement('a'); brand.className = 'brand'; brand.href = '/'; brand.innerHTML = '<span class="brandmark">L</span> leagent<span class="branddot">.</span>'; bar.append(brand);
const menu = document.createElement('button'); menu.className = 'menu-button'; menu.type = 'button'; menu.setAttribute('aria-label','Open navigation'); menu.setAttribute('aria-expanded','false'); menu.innerHTML = '<span></span><span></span><span></span>'; bar.append(menu);
const account = document.createElement('div'); account.className = 'account-controls';
if (user) { const welcome = document.createElement('span'); welcome.textContent = `Hi, ${user.name.split(' ')[0]}`; account.append(welcome); const logout = document.createElement('button'); logout.type = 'button'; logout.textContent = 'Log out'; logout.addEventListener('click', async () => { await fetch('/api/logout',{method:'POST'}); location.href='/'; }); account.append(logout); }
else { const login = document.createElement('a'); login.href='/login'; login.textContent='Log in'; account.append(login); const signup=document.createElement('a');signup.href='/signup';signup.className='button primary small';signup.textContent='Create account';account.append(signup); }
bar.append(account); mount.append(bar);
const drawer = document.createElement('nav'); drawer.className = 'menu-drawer'; drawer.setAttribute('aria-label','Services'); drawer.hidden = true;
for (const [href,label] of routes) { const link = document.createElement('a'); link.href=href; link.textContent=label; if (location.pathname === href) link.className='active'; drawer.append(link); }
mount.append(drawer);
function closeMenu() { drawer.hidden=true; menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open navigation'); }
menu.addEventListener('click', () => { const open=drawer.hidden; drawer.hidden=!open; menu.setAttribute('aria-expanded',String(open)); menu.setAttribute('aria-label',open?'Close navigation':'Open navigation'); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeMenu(); });
document.addEventListener('click', e => { if (!mount.contains(e.target)) closeMenu(); });
