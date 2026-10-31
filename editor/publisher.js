import './full-editor.js?v=full-v4';
import {GitHubPublisher} from './github-client.js';
import {RememberedSession} from './remember-session.js';
const remembered=new RememberedSession();
const OWNER='hannavitko';
const PUBLIC_URL='https://hannavitko.github.io/anna-vitko-resume/';
const $=selector=>document.querySelector(selector);
const tokenLink=document.querySelector('.owner-login .help a');if(tokenLink){const url=new URL(tokenLink.href);url.searchParams.set('name','Resume editor '+new Date().toISOString().slice(0,19).replace('T',' '));tokenLink.href=url.href;}
let client=null,busy=false,dirty=0,publishedDirty=0,monitor=0,loginAttempt=0;
const status=$('#owner-status'),publishButton=$('#owner-publish');
function setStatus(text,kind=''){status.textContent=text;status.dataset.kind=kind;}
function revision(){return document.querySelector('meta[name="resume-revision"]').content;}
function setRevision(doc,value){let meta=doc.querySelector('meta[name="resume-revision"]');if(!meta){meta=doc.createElement('meta');meta.name='resume-revision';doc.head.append(meta);}meta.content=value;}
function lock(forgetRemembered=false){loginAttempt++;monitor++;client?.clear();client=null;busy=false;document.body.classList.add('editor-locked');$('#owner-token').value='';$('#owner-login-error').textContent='';publishButton.disabled=true;$('#owner-login-submit').disabled=false;$('#owner-login-submit').textContent='Войти в редактор';setStatus('Войдите через GitHub, чтобы публиковать изменения.');if(forgetRemembered){$('#owner-remember').checked=false;if(!remembered.forget())$('#owner-login-error').textContent='Вход закрыт. Браузер не дал удалить сохранённый ключ: очистите данные этого сайта в настройках браузера.';}}
function cleanClone(rev){
  const doc=document.implementation.createHTMLDocument('');doc.documentElement.replaceWith(document.documentElement.cloneNode(true));
  doc.body.classList.remove('editing');doc.body.classList.add('editor-locked');
  doc.querySelectorAll('[contenteditable],[spellcheck]').forEach(el=>{el.removeAttribute('contenteditable');el.removeAttribute('spellcheck');});
  doc.querySelectorAll('dialog').forEach(el=>el.removeAttribute('open'));
  doc.querySelector('#content-list')?.replaceChildren();
  doc.querySelector('#record-error')?.replaceChildren();
  doc.querySelectorAll('input').forEach(el=>{el.value='';el.removeAttribute('value');});
  doc.querySelectorAll('textarea').forEach(el=>el.textContent='');
  const remember=doc.querySelector('#owner-remember');remember.checked=false;remember.removeAttribute('checked');
  doc.querySelector('#link-list')?.replaceChildren();doc.querySelector('#cert-preview')?.removeAttribute('src');
  const toggle=doc.querySelector('#edit-toggle');toggle.textContent='Редактировать';toggle.classList.remove('active');toggle.setAttribute('aria-pressed','false');
  doc.querySelector('#save-status').textContent='Черновик сохраняется на этом устройстве';
  const toast=doc.querySelector('#toast');toast.hidden=true;toast.textContent='';
  doc.querySelector('#owner-login-error').textContent='';doc.querySelector('#owner-login-submit').disabled=false;doc.querySelector('#owner-login-submit').textContent='Войти в редактор';
  doc.querySelector('#owner-publish').disabled=true;doc.querySelector('#owner-publish').textContent='Опубликовать';
  doc.querySelector('#owner-status').textContent='Войдите через GitHub, чтобы публиковать изменения.';doc.querySelector('#owner-status').removeAttribute('data-kind');
  doc.querySelector('#owner-check').hidden=true;doc.querySelector('#owner-identity').textContent='';
  doc.querySelector('meta[name="resume-draft-migration"]')?.remove();setRevision(doc,rev);return doc;
}
function publicCopy(source){
  const doc=document.implementation.createHTMLDocument('');doc.documentElement.replaceWith(source.documentElement.cloneNode(true));
  doc.body.classList.remove('editor-locked','owner-editor','editing');
  doc.querySelectorAll('#resume [data-edit]').forEach(el=>{if(!el.textContent.trim()&&!el.querySelector('img'))el.remove();});doc.querySelector('#portrait[hidden]')?.remove();
  doc.title='Анна Витко — резюме-портфолио';
  doc.querySelector('meta[name="robots"]')?.remove();
  doc.querySelector('meta[name="description"]')?.setAttribute('content','Анна Витко — маркетолог. B2B и B2C, стратегия, продвижение, аналитика и запуск продуктов.');
  doc.querySelectorAll('script,.toolbar,.owner-header,.owner-login,#owner-style,#photo-input,.edit-add-row,.add-tool-inline,.remove-added,.photo-button,#links-dialog,#reset-dialog,#entry-dialog,#experience-dialog,[data-editor-only],#toast').forEach(el=>el.remove());
  for(const el of doc.querySelectorAll('*'))for(const attribute of [...el.attributes])if(attribute.name.startsWith('data-')&&!['data-certificate'].includes(attribute.name))el.removeAttribute(attribute.name);
  doc.querySelectorAll('[contenteditable],[spellcheck]').forEach(el=>{el.removeAttribute('contenteditable');el.removeAttribute('spellcheck');});
  const certScript=doc.createElement('script');certScript.textContent="document.addEventListener('click',e=>{const a=e.target.closest('a[data-certificate]');if(!a)return;e.preventDefault();const dialog=document.querySelector('#cert-dialog');dialog.querySelector('img').src=a.querySelector('img').src;dialog.querySelector('h2').textContent=a.querySelector('img').alt;dialog.showModal();});document.querySelector('#cert-close').addEventListener('click',()=>document.querySelector('#cert-dialog').close());";doc.body.append(certScript);
  return doc;
}
const serialize=doc=>'<!doctype html>\n'+doc.documentElement.outerHTML;
function capture(rev){const source=cleanClone(rev);return [{path:'index.html',content:serialize(publicCopy(source))},{path:'editor/index.html',content:serialize(source)}];}
async function checkLive(expected,generation){
  const start=Date.now();
  while(Date.now()-start<180000&&generation===monitor&&client){
    try{const url=new URL(PUBLIC_URL);url.searchParams.set('version',expected);url.searchParams.set('check',Date.now());const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});if(response.ok){const page=new DOMParser().parseFromString(await response.text(),'text/html');if(page.querySelector('meta[name="resume-revision"]')?.content===expected){setStatus(dirty===publishedDirty?'Опубликовано. Общая ссылка обновлена.':'Версия опубликована. Есть новые неопубликованные правки.','success');$('#owner-check').hidden=true;return true;}}}catch{}
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(generation===monitor&&client){setStatus('Изменения сохранены в GitHub. Публикация ещё идёт — можно проверить готовность позже.');$('#owner-check').hidden=false;}
  return false;
}
async function signIn(key,rememberKey,automatic=false){
  $('#owner-token').value='';
  await window.resumeDraftReady;
  if(!key.startsWith('github_pat_')){$('#owner-login-error').textContent='Введите ограниченный ключ GitHub (fine-grained personal access token).';return;}
  const attempt=++loginAttempt,button=$('#owner-login-submit');button.disabled=true;button.textContent=automatic?'Восстанавливаю вход…':'Проверяю GitHub…';$('#owner-login-error').textContent='';
  const candidate=new GitHubPublisher(key);
  try{const identity=await candidate.authenticate();
    const path='/repos/'+OWNER+'/anna-vitko-resume/contents/editor/index.html?ref='+identity.head;
    const source=await candidate.request(path,'GET',undefined,'raw');
    const current=new DOMParser().parseFromString(source,'text/html').querySelector('meta[name="resume-revision"]')?.content;
    if(current!==revision())throw new Error('Открыта старая версия редактора. Обновите страницу и войдите ещё раз. Локальный черновик не удалён.');
    if(attempt!==loginAttempt){candidate.clear();return;}
    let storageNotice='';
    if(rememberKey){try{remembered.save(key);}catch{storageNotice=' Браузер не разрешил запомнить ключ: сохраните его у себя для следующего входа.';}}
    else if(!remembered.forget())storageNotice=' Не удалось удалить сохранённый вход. Очистите данные сайта в настройках браузера.';
    client=candidate;document.body.classList.remove('editor-locked');$('#owner-identity').textContent='GitHub · '+identity.login;publishButton.disabled=false;
    setStatus('Черновик. Кнопка «Опубликовать» обновит общую ссылку.'+storageNotice);
    if($('#edit-toggle').getAttribute('aria-pressed')!=='true')$('#edit-toggle').click();
  }catch(error){candidate.clear();if(attempt!==loginAttempt)return;
    if(automatic&&[401,403,404].includes(error.status)){remembered.forget();$('#owner-remember').checked=false;}
    $('#owner-login-error').textContent=error.message||'Не удалось войти в редактор.';
  }finally{key='';if(attempt===loginAttempt){button.disabled=false;button.textContent='Войти в редактор';}}
}
function restoreSignIn(){let key=remembered.read();if(!key)return;$('#owner-remember').checked=true;signIn(key,true,true);key='';}
$('#owner-login-form').addEventListener('submit',e=>{e.preventDefault();signIn($('#owner-token').value.trim(),$('#owner-remember').checked);});
$('#owner-logout').addEventListener('click',()=>lock(true));
document.addEventListener('resume:change',()=>{dirty++;if(!busy&&client)setStatus('Есть неопубликованные правки. Нажмите «Опубликовать».');});
$('#resume').addEventListener('input',()=>{dirty++;if(!busy&&client)setStatus('Есть неопубликованные правки. Черновик сохраняется на этом устройстве.');});
$('#resume').addEventListener('click',e=>{if(e.target.closest('[data-remove-added]'))dirty++;});
$('#reset-confirm').addEventListener('click',()=>{dirty++;if(client&&!busy)setStatus('Есть неопубликованные правки.');});
$('#entry-form').addEventListener('submit',()=>{dirty++;});$('#experience-form').addEventListener('submit',()=>{dirty++;});$('#links-form').addEventListener('submit',()=>{dirty++;});$('#photo-input').addEventListener('change',()=>{dirty++;});
publishButton.addEventListener('click',async()=>{
  if(!client||busy)return;busy=true;publishButton.disabled=true;publishButton.textContent='Публикую…';$('#owner-check').hidden=true;
  let nextRevision;
  try{
    // Ending edit mode sorts courses and flushes the current draft before serializing it.
    if($('#edit-toggle').getAttribute('aria-pressed')==='true')$('#edit-toggle').click();
    nextRevision=crypto.randomUUID();const files=capture(nextRevision),snapshotDirty=dirty;
    await client.publish(files,message=>setStatus(message));
    setRevision(document,nextRevision);publishedDirty=snapshotDirty;document.dispatchEvent(new Event('resume:published'));
    setStatus('Сохранено в GitHub. Жду обновления общей ссылки…');const generation=++monitor;
    if($('#edit-toggle').getAttribute('aria-pressed')!=='true')$('#edit-toggle').click();
    await checkLive(nextRevision,generation);
  }catch(error){setStatus(error.message||'Публикация не завершена. Черновик сохранён на этом устройстве.','error');if(client&&$('#edit-toggle').getAttribute('aria-pressed')!=='true')$('#edit-toggle').click();}
  finally{busy=false;publishButton.disabled=!client;publishButton.textContent='Опубликовать';}
});
$('#owner-check').addEventListener('click',async()=>{if(!client||busy)return;busy=true;publishButton.disabled=true;$('#owner-check').hidden=true;setStatus('Проверяю опубликованную версию…');try{await checkLive(revision(),++monitor);}finally{busy=false;publishButton.disabled=!client;}});
window.addEventListener('pagehide',()=>{loginAttempt++;client?.clear();client=null;});window.addEventListener('pageshow',e=>{if(e.persisted){lock();restoreSignIn();}});
lock();restoreSignIn();
