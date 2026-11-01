// Desktop Enter sends; IME candidate selection and Shift+Enter never send.
export function installChatKeyboard(doc,onSend,isDesktop=()=>globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches===true){
 const handler=e=>{
  if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.keyCode===229||e.repeat||!isDesktop())return;
  const box=e.target;if(box?.name!=='message'||!['chatForm','homeChatForm'].includes(box.form?.id))return;
  e.preventDefault();onSend(box.value);
 };
 doc.addEventListener('keydown',handler);return ()=>doc.removeEventListener('keydown',handler);
}
