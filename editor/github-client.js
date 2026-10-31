export class GitHubError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'GitHubError'; this.status = status; }
}
export class GitHubPublisher {
  #token;
  constructor(token, {owner='hannavitko', repo='anna-vitko-resume', branch='main', fetcher=fetch, api='https://api.github.com'}={}) {
    this.#token=token; this.owner=owner; this.repo=repo; this.branch=branch; this.fetcher=(...args)=>fetcher(...args); this.api=api;
    this.prefix=`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`; this.head=null;
  }
  clear(){this.#token='';this.head=null;}
  async request(path, method='GET', body, format='json') {
    if(!this.#token)throw new GitHubError('Войдите в редактор ещё раз.');
    let response;
    try {response=await this.fetcher(this.api+path,{method,headers:{'Accept':format==='raw'?'application/vnd.github.raw+json':'application/vnd.github+json','Authorization':'Bearer '+this.#token,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(45000)});}
    catch{throw new GitHubError('Не удалось связаться с GitHub. Проверьте соединение и повторите попытку.');}
    if(!response.ok){
      const messages={401:'Ключ недействителен или истёк. Создайте новый ограниченный ключ в GitHub.',403:'GitHub не разрешил запись. Проверьте доступ к anna-vitko-resume и разрешение Contents: Read and write.',404:'Репозиторий недоступен для этого ключа. Выберите anna-vitko-resume в настройках ключа.',409:'На GitHub уже есть более новая версия. Обновите редактор перед публикацией.',422:'Версия на GitHub изменилась или запись отклонена. Обновите редактор и проверьте права ключа.'};
      throw new GitHubError(messages[response.status]||`GitHub временно не принял запрос (${response.status}). Попробуйте позже.`,response.status);
    }
    return response.status===204?null:format==='raw'?response.text():response.json();
  }
  async authenticate(){
    const user=await this.request('/user');
    if(user.login?.toLowerCase()!==this.owner.toLowerCase())throw new GitHubError('Этот редактор доступен только аккаунту '+this.owner+'.');
    const repository=await this.request(this.prefix);
    if(!repository.permissions?.push)throw new GitHubError('У ключа нет доступа для записи в anna-vitko-resume.');
    const ref=await this.request(this.prefix+'/git/ref/heads/'+encodeURIComponent(this.branch));this.head=ref.object.sha;
    return {login:user.login,head:this.head};
  }
  async publish(files,onStage=()=>{}){
    if(!this.head)throw new GitHubError('Войдите в редактор перед публикацией.');
    if(!Array.isArray(files)||files.length!==2||!files.some(f=>f.path==='index.html')||!files.some(f=>f.path==='editor/index.html'))throw new GitHubError('Неполный набор файлов для публикации.');
    onStage('Проверяю актуальность версии…');
    const ref=await this.request(this.prefix+'/git/ref/heads/'+encodeURIComponent(this.branch));
    if(ref.object.sha!==this.head)throw new GitHubError('Резюме уже обновлено в другой вкладке или на GitHub. Ваш черновик сохранён на этом устройстве. Обновите редактор перед публикацией.',409);
    const parent=await this.request(this.prefix+'/git/commits/'+this.head);
    onStage('Загружаю изменения в GitHub…');
    const blobs=await Promise.all(files.map(async file=>{const blob=await this.request(this.prefix+'/git/blobs','POST',{content:file.content,encoding:'utf-8'});return {path:file.path,mode:'100644',type:'blob',sha:blob.sha};}));
    const tree=await this.request(this.prefix+'/git/trees','POST',{base_tree:parent.tree.sha,tree:blobs});
    const commit=await this.request(this.prefix+'/git/commits','POST',{message:'Update resume from owner editor',tree:tree.sha,parents:[this.head]});
    onStage('Сохраняю публичную страницу и редактор…');
    await this.request(this.prefix+'/git/refs/heads/'+encodeURIComponent(this.branch),'PATCH',{sha:commit.sha,force:false});
    this.head=commit.sha;return {sha:commit.sha};
  }
}
