export class DraftStore {
 constructor(){this.connection=null;this.pending=Promise.resolve();}
 async open(){if(this.connection)return this.connection;this.connection=await new Promise((resolve,reject)=>{const request=indexedDB.open('anna-resume-editor',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return this.connection;}
 async read(){const db=await this.open();return new Promise((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').get('hannavitko/anna-vitko-resume');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
 write(state){const task=this.pending.catch(()=>{}).then(async()=>{const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(state,'hannavitko/anna-vitko-resume');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});});this.pending=task;return task;}
}
