// Only this browser profile retains the opt-in credential. Never include it in a published document.
export const REMEMBER_KEY='anna-resume-editor:github:hannavitko/anna-vitko-resume';
export class RememberedSession {
  constructor(storageProvider=()=>localStorage){this.storageProvider=storageProvider;}
  read(){
    try{const value=this.storageProvider().getItem(REMEMBER_KEY);if(!value)return '';const entry=JSON.parse(value);if(entry?.v===1&&typeof entry.token==='string'&&entry.token.startsWith('github_pat_'))return entry.token;this.forget();}catch{}
    return '';
  }
  save(token){
    if(typeof token!=='string'||!token.startsWith('github_pat_'))throw new Error('Недопустимый формат ключа.');
    const storage=this.storageProvider();storage.setItem(REMEMBER_KEY,JSON.stringify({v:1,token}));
    if(this.read()!==token)throw new Error('Браузер не сохранил ключ.');
  }
  forget(){try{this.storageProvider().removeItem(REMEMBER_KEY);return true;}catch{return false;}}
}
