// Anonymous credentials stay in this tab; registered accounts remain HttpOnly-cookie only.
// Never create a replacement identity or replay a mutation after an uncertain response.
export function createSessionClient({state=()=>null,fetchImpl=(...args)=>fetch(...args),storage}={}){
 const key='qc-guest-session';let credential=null,guestRequest=null;
 try{storage??=globalThis.sessionStorage;const saved=JSON.parse(storage?.getItem(key)||'null');if(/^[a-f0-9]{64}$/.test(saved?.token||'')&&typeof saved.userId==='string')credential=saved;}catch{}
 function clear(){credential=null;try{storage?.removeItem(key);}catch{}}
 function remember(value){if(!/^[a-f0-9]{64}$/.test(value?.token||'')||typeof value.userId!=='string')return;credential={token:value.token,userId:value.userId};try{storage?.setItem(key,JSON.stringify(credential));}catch{}}
 async function send(path,body){
  const current=state(),auth=credential&&(!current?.user?.id||current.user.id===credential.userId)&&!['login','register'].includes(path)?credential:null;
  const headers={...(auth?{'X-QC-Guest-Session':auth.token}:{})};
  if(body!==undefined)Object.assign(headers,{'Content-Type':'application/json','X-CSRF-Token':current?.csrf||'','X-QC-Workspace':current?.workspace?.active||'original'});
  let response;try{response=await fetchImpl('/api/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('暂时无法连接服务，当前输入和草稿已保留，请恢复连接后重试');}
  let result;try{result=await response.json();}catch{throw Error('服务暂未返回有效结果，当前草稿已保留；请重试并核对执行状态');}
  if(!response.ok){const error=Error(result.error||'请求未完成，请重试');error.status=response.status;error.code=result.code;throw error;}
  if(['login','register','logout'].includes(path))clear();
  if(result.guestSession){remember(result.guestSession);delete result.guestSession;}
  return result;
 }
 return {request(path,body){if(path!=='guest')return send(path,body);if(!guestRequest)guestRequest=send(path,body).finally(()=>{guestRequest=null;});return guestRequest;}};
}
