export function captureScroll(doc,win){
 return {main:doc.querySelector('.main')?.scrollTop||0,window:win.scrollY||0,chat:doc.querySelector('.chat-scroll')?.scrollTop||0};
}
export function restoreScroll(doc,win,snapshot,{sceneChanged=false,focus=null,chatChanged=false}={}){
 const main=doc.querySelector('.main'),chat=doc.querySelector('.chat-scroll');
 const toTop=sceneChanged||focus==='page-top';
 if(main)main.scrollTop=toTop?0:snapshot.main;
 if(toTop)win.scrollTo({top:0,behavior:'auto'});
 else if(!focus&&(win.scrollY||0)!==snapshot.window)win.scrollTo({top:snapshot.window,behavior:'auto'});
 if(focus&&focus!=='page-top')doc.querySelector(focus)?.scrollIntoView({block:'start',behavior:'auto'});
 if(chat)chat.scrollTop=chatChanged?chat.scrollHeight:snapshot.chat;
}
export function installViewport(win,doc,onResize=()=>{}){
 const viewport=win.visualViewport;
 const sync=()=>{
  const height=viewport?.height||win.innerHeight,editing=/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName||'');
  doc.documentElement.style.setProperty('--chat-viewport-height',height+'px');
  doc.documentElement.style.setProperty('--app-viewport-height',height+'px');
  doc.documentElement.style.setProperty('--app-viewport-top',(editing?viewport?.offsetTop||0:0)+'px');
  doc.documentElement.classList.toggle('compact-chat-viewport',height<330&&win.matchMedia('(max-width:900px)').matches);onResize();
 };
 const pan=()=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName||''))sync();};
 sync();viewport?.addEventListener('resize',sync);viewport?.addEventListener('scroll',pan);win.addEventListener('resize',sync);
 return ()=>{viewport?.removeEventListener('resize',sync);viewport?.removeEventListener('scroll',pan);win.removeEventListener('resize',sync);};
}
