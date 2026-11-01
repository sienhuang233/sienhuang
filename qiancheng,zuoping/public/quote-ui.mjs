import {normalizeQuote} from './engines/quote.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function quotedMessage(value){const q=normalizeQuote(value);return q?`<blockquote class="message-quote"><b>${esc(q.author)}</b><span>${esc(q.text)}</span>${q.truncated?'<small>较长消息仅引用前2000字</small>':''}</blockquote>`:'';}
export function quoteComposer(value){const q=normalizeQuote(value);return q?`<div class="quote-composer" role="note"><div><b>引用 ${esc(q.author)}</b><span title="${esc(q.text)}">${esc(q.text)}</span>${q.truncated?'<small>仅引用前2000字</small>':''}</div><button type="button" class="small" data-act="clear-quote" aria-label="取消引用">×</button></div>`:'';}
export function installQuoteGestures(doc,onQuote){
 let timer=null,start=null,last=-1,lastAt=0;
 const cancel=()=>{if(timer!==null)clearTimeout(timer);timer=null;start=null;};
 const indexFor=e=>{const bubble=e.target.closest?.('.bubble'),row=bubble?.closest('.chat-message');return row?Number(row.dataset.messageIndex):null;};
 const quote=index=>{const at=Date.now();if(index===last&&at-lastAt<600)return;last=index;lastAt=at;onQuote(index);};
 const down=e=>{cancel();if(e.button!=null&&e.button!==0)return;const index=indexFor(e);if(!Number.isInteger(index)||index<0)return;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=null;quote(index);},500);};
 const move=e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)cancel();};
 const context=e=>{const index=indexFor(e);if(!Number.isInteger(index)||index<0)return;e.preventDefault();cancel();quote(index);};
 const bindings=[['pointerdown',down],['pointermove',move],['pointerup',cancel],['pointercancel',cancel],['scroll',cancel],['contextmenu',context]];
 for(const [event,handler] of bindings)doc.addEventListener(event,handler,event==='scroll');
 return ()=>{cancel();for(const [event,handler] of bindings)doc.removeEventListener(event,handler,event==='scroll');};
}
