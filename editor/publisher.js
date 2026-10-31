import {GitHubPublisher} from './github-client.js';
const OWNER='hannavitko';
const PUBLIC_URL='https://hannavitko.github.io/anna-vitko-resume/';
const $=selector=>document.querySelector(selector);
let client=null,busy=false,dirty=0,publishedDirty=0,monitor=0;
const status=$('#owner-status'),publishButton=$('#owner-publish');
function setStatus(text,kind=''){status.textContent=text;status.dataset.kind=kind;}
function revision(){return document.querySelector('meta[name="resume-revision"]').content;}
function setRevision(doc,value){let meta=doc.querySelector('meta[name="resume-revision"]');if(!meta){meta=doc.createElement('meta');meta.name='resume-revision';doc.head.append(meta);}meta.content=value;}
function lock(){monitor++;client?.clear();client=null;busy=false;document.body.classList.add('editor-locked');$('#owner-token').value='';$('#owner-login-error').textContent='';publishButton.disabled=true;setStatus('Войдите через GitHub, чтобы публиковать изменения.');}
function cleanClone(rev){
  const doc=document.implementation.createHTMLDocument('');doc.documentElement.replaceWith(document.documentElement.cloneNode(true));
  doc.body.classList.remove('editing');doc.body.classList.add('editor-locked');
  doc.querySelectorAll('[contenteditable],[spellcheck]').forEach(el=>{el.removeAttribute('contenteditable');el.removeAttribute('spellcheck');});
  doc.querySelectorAll('dialog').forEach(el=>el.removeAttribute('open'));
  doc.querySelectorAll('input').forEach(el=>{el.value='';el.removeAttribute('value');});
  doc.querySelectorAll('textarea').forEach(el=>el.textContent='');
  doc.querySelector('#link-list')?.replaceChildren();doc.querySelector('#cert-preview')?.removeAttribute('src');
  const toggle=doc.querySelector('#edit-toggle');toggle.textContent='Редактировать';toggle.classList.remove('active');toggle.setAttribute('aria-pressed','false');
  doc.querySelector('#save-status').textContent='Черновик сохраняется на этом устройстве';
  const toast=doc.querySelector('#toast');toast.hidden=true;toast.textContent='';
  doc.querySelector('#owner-login-error').textContent='';doc.querySelector('#owner-login-submit').disabled=false;doc.querySelector('#owner-login-submit').textContent='Войти в редактор';
  doc.querySelector('#owner-publish').disabled=true;doc.querySelector('#owner-publish').textContent='Опубликовать';
  doc.querySelector('#owner-status').textContent='Войдите через GitHub, чтобы публиковать изменения.';doc.querySelector('#owner-status').removeAttribute('data-kind');
  doc.querySelector('#owner-check').hidden=true;doc.querySelector('#owner-identity').textContent='';
  setRevision(doc,rev);return doc;
}
function publicCopy(source){
  const doc=document.implementation.createHTMLDocument('');doc.documentElement.replaceWith(source.documentElement.cloneNode(true));
  doc.body.classList.remove('editor-locked','owner-editor','editing');
  doc.title='Анна Витко — резюме-портфолио';
  doc.querySelectorAll('script,.toolbar,.owner-header,.owner-login,#owner-style,#photo-input,.edit-add-row,.add-tool-inline,.remove-added,.photo-button,#links-dialog,#reset-dialog,#entry-dialog,#toast').forEach(el=>el.remove());
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
$('#owner-login-form').addEventListener('submit',async e=>{
  e.preventDefault();let key=$('#owner-token').value.trim();$('#owner-token').value='';
  if(!key.startsWith('github_pat_')){$('#owner-login-error').textContent='Введите ограниченный ключ GitHub (fine-grained personal access token).';return;}
  const button=$('#owner-login-submit');button.disabled=true;button.textContent='Проверяю GitHub…';$('#owner-login-error').textContent='';
  const candidate=new GitHubPublisher(key);key='';
  try{const identity=await candidate.authenticate();
    // A freshly opened editor must match the source currently on GitHub; an old cached page must not overwrite a newer revision.
    const path='/repos/'+OWNER+'/anna-vitko-resume/contents/editor/index.html?ref='+identity.head;
    const source=await candidate.request(path,'GET',undefined,'raw');
    const current=new DOMParser().parseFromString(source,'text/html').querySelector('meta[name="resume-revision"]')?.content;
    if(current!==revision())throw new Error('Открыта старая версия редактора. Обновите страницу и войдите ещё раз. Локальный черновик не удалён.');
    // The base commit is checked again immediately before writing.
    client=candidate;document.body.classList.remove('editor-locked');$('#owner-identity').textContent='GitHub · '+identity.login;publishButton.disabled=false;
    setStatus('Черновик. Кнопка «Опубликовать» обновит общую ссылку.');
    if($('#edit-toggle').getAttribute('aria-pressed')!=='true')$('#edit-toggle').click();
  }catch(error){candidate.clear();$('#owner-login-error').textContent=error.message||'Не удалось войти в редактор.';}
  finally{button.disabled=false;button.textContent='Войти в редактор';}
});
$('#owner-logout').addEventListener('click',lock);
$('#resume').addEventListener('input',()=>{dirty++;if(!busy&&client)setStatus('Есть неопубликованные правки. Черновик сохраняется на этом устройстве.');});
$('#resume').addEventListener('click',e=>{if(e.target.closest('[data-remove-added]'))dirty++;});
$('#reset-confirm').addEventListener('click',()=>{dirty++;if(client&&!busy)setStatus('Есть неопубликованные правки.');});
$('#entry-form').addEventListener('submit',()=>{dirty++;});$('#links-form').addEventListener('submit',()=>{dirty++;});$('#photo-input').addEventListener('change',()=>{dirty++;});
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
window.addEventListener('pagehide',()=>{client?.clear();client=null;});window.addEventListener('pageshow',e=>{if(e.persisted)lock();});
lock();
