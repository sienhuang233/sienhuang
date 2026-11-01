import {subscriptionAfterOperation,subscriptionCompletion,pauseSubscriptionContext} from './lib/subscription-agent.mjs';
import {createBillWorkspaces,billImportPeriod} from './lib/bill-workspaces.mjs';
import {peopleContextAfterOperation} from './lib/people-agent.mjs';
import {recentDialogue} from './lib/conversation.mjs';
import {normalizeQuote} from './public/engines/quote.mjs';
import {advancePreview} from './public/engines/weekly.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {initial,summary,apply,risk,uid,day,month,text,describe} from './lib/domain.mjs';
import {plan} from './lib/agent.mjs';
import {recommend} from './lib/tasks.mjs';
import {analyzeBills,billReviewBasis} from './public/engines/bill-analysis.mjs';
const root=resolve(import.meta.dirname),dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));mkdirSync(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(dataDir,'qiancheng.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,salt TEXT,hash TEXT,totp TEXT,data TEXT,revision INTEGER DEFAULT 0,fail INTEGER DEFAULT 0,lock_until INTEGER DEFAULT 0,last_totp INTEGER DEFAULT -1);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,csrf TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS pending(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,args TEXT,revision INTEGER,risk TEXT,expires INTEGER,status TEXT,result TEXT);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,at TEXT,event TEXT,detail TEXT,prev_hash TEXT,hash TEXT);
 CREATE TABLE IF NOT EXISTS conversations(session_token TEXT PRIMARY KEY,user_id TEXT NOT NULL,history TEXT NOT NULL,context TEXT NOT NULL,updated INTEGER);
 CREATE TABLE IF NOT EXISTS limits(k TEXT PRIMARY KEY,n INTEGER,expires INTEGER);
 CREATE TABLE IF NOT EXISTS anonymous_users(user_id TEXT PRIMARY KEY);`);
const workspaces=createBillWorkspaces(db);
const hash=x=>createHash('sha256').update(x).digest('hex');const safe=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
function audit(u,event,detail){const prev=db.prepare('SELECT hash FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 1').get(u)?.hash||'GENESIS',at=new Date().toISOString(),d=JSON.stringify(detail),h=hash([prev,at,event,d].join('|'));db.prepare('INSERT INTO audit(user_id,at,event,detail,prev_hash,hash) VALUES(?,?,?,?,?,?)').run(u,at,event,d,prev,h);}
function limit(k,n,span=60000){const now=Date.now();db.prepare('DELETE FROM limits WHERE expires<?').run(now);const row=db.prepare('SELECT * FROM limits WHERE k=?').get(k);if(row&&row.n>=n)throw Object.assign(Error('操作频繁，请稍后再试'),{status:429});db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=n+1').run(k,now+span);}
function takeModelToken(userId){
 const now=Date.now(),keys=[['ai:'+day()+':'+userId,40],['ai-global:'+day(),500]];
 db.exec('BEGIN IMMEDIATE');try{
  for(const [key,max] of keys){const row=db.prepare('SELECT n,expires FROM limits WHERE k=?').get(key);if(row&&row.expires>now&&row.n>=max)throw Object.assign(Error('今日模型调用额度已用完，暂不能使用模型理解'),{code:'MODEL_QUOTA'});}
  for(const [key] of keys)db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN expires<=? THEN 1 ELSE n+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END').run(key,now+86400000,now,now);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';export function b32(bytes){let bits=0,val=0,out='';for(const b of bytes){val=(val<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(val>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(val<<(5-bits))&31];return out;}
function un32(s){let bits=0,v=0,out=[];for(const c of s){v=(v<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,step=Math.floor(Date.now()/30000)){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',un32(secret)).update(b).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
function checkOtp(u,code){if(!u.totp)throw Error('请先在安全中心绑定验证器');const step=Math.floor(Date.now()/30000);for(const k of [step-1,step,step+1])if(k>u.last_totp&&safe(totp(u.totp,k),String(code))){db.prepare('UPDATE users SET last_totp=?,fail=0 WHERE id=?').run(k,u.id);return;}
 const n=u.fail+1;db.prepare('UPDATE users SET fail=?,lock_until=? WHERE id=?').run(n,n>=5?Date.now()+5*60000:0,u.id);audit(u.id,'verification_failed',{attempt:n});throw Error(n>=5?'验证连续失败，操作锁定5分钟':'验证码无效或已用，请等待下一组验证码');}
const isGuest=u=>!!db.prepare('SELECT user_id FROM anonymous_users WHERE user_id=?').get(u.id);
function current(req){
 const cookie=/\bqc_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1],fallback=String(req.headers['x-qc-guest-session']||'');
 req.sessionIssue=cookie||fallback?'not_found':'missing';
 for(const token of [...new Set([cookie,/^[a-f0-9]{64}$/.test(fallback)?fallback:null].filter(Boolean))]){
  const session=db.prepare('SELECT * FROM sessions WHERE token=?').get(hash(token));if(!session)continue;if(session.expires<=Date.now()){req.sessionIssue='expired';continue;}
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);if(!user||token!==cookie&&!isGuest(user))continue;
  return {...user,session,sessionCredential:token};
 }
 return null;
}
const guestSession=u=>isGuest(u)?{token:u.sessionCredential,userId:u.id}:undefined;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"};
function json(res,status,data,extra={}){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>5*1024*1024)throw Error('请求超过5MB');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function conversationFor(u){const row=db.prepare('SELECT history,context FROM conversations WHERE session_token=? AND user_id=?').get(u.session.token,u.id);return row?{history:recentDialogue(JSON.parse(row.history)),context:JSON.parse(row.context)}:{history:[],context:{}};}
function publicState(u){const s=JSON.parse(u.data),conversation=conversationFor(u);return {workspace:workspaces.metadata(u),conversation:conversation.history,conversationContext:conversation.context,state:s,summary:summary(s),recommendation:recommend(s),revision:u.revision,user:{name:u.name,id:u.id},csrf:u.session.csrf,totpEnabled:!!u.totp,aiEnabled:!!(process.env.BIGMODEL_API_KEY&&process.env.BIGMODEL_MODEL),aiNotice:'模型接收当前会话近期对话、主动引用及当前任务状态；订阅专项仅发送你请求核对的当月扣费依据，不自动发送完整账单或账户余额。不要在对话中输入密码或验证码。'};}
const server=http.createServer(async(req,res)=>{
 try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/health')return json(res,200,{ok:true,version:'1.9.45',bank:'sandbox'});
 if(!path.startsWith('/api/')){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const file=resolve(root,'public',path==='/'?'index.html':'.'+decodeURIComponent(path));if(!file.startsWith(resolve(root,'public')+sep)||!existsSync(file))return json(res,404,{error:'未找到文件'});
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.csv':'text/csv; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'}[extname(file)];if(!mime)return json(res,404,{error:'未找到文件'});
  res.writeHead(200,{...headers,'Content-Type':mime,'Content-Disposition':'inline'});res.end(readFileSync(file));return;
 }
 const mutate=req.method==='POST';if(mutate){const origin=req.headers.origin;let allowed=!origin;if(origin){try{const parsed=new URL(origin);allowed=process.env.PUBLIC_ORIGIN?origin===process.env.PUBLIC_ORIGIN:['http:','https:'].includes(parsed.protocol)&&parsed.host===req.headers.host&&parsed.origin===origin;}catch{}}if(!allowed)throw Object.assign(Error('来源校验失败'),{status:403});if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('请使用JSON请求');}
 const ip=req.socket.remoteAddress;let u=current(req),input=mutate?await body(req):{};
 if(path==='/api/guest'&&mutate){
  if(u)return json(res,200,{ok:true,guestSession:guestSession(u)});
  if(req.headers['x-qc-guest-session'])return json(res,401,{code:'SESSION_REQUIRED',error:'原免注册会话暂时无法恢复，未新建或替换账户。请保留当前页面与草稿，稍后重试'});
  limit('guest:'+ip,10,3600000);const id=uid(),name='guest-'+id.slice(0,8),salt=randomBytes(16).toString('hex'),password=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO users(id,name,salt,hash,data) VALUES(?,?,?,?,?)').run(id,name,salt,scryptSync(password,salt,64).toString('hex'),JSON.stringify(initial()));
  db.prepare('INSERT INTO anonymous_users VALUES(?)').run(id);
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),id,csrf,Date.now()+86400000);
  return json(res,200,{ok:true,guestSession:{token,userId:id}},{'Set-Cookie':`qc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE==='1'?'; Secure':''}`});
 }
 if(path==='/api/register'||path==='/api/login'){
  if(!mutate)throw Error('仅支持POST');limit('auth:'+ip,30,10*60000);
  const name=text(input.username,40),pw=String(input.password||'');if(!/^[\p{L}\p{N}_-]{3,40}$/u.test(name)||pw.length<10||pw.length>128)throw Error('用户名3—40位，密码至少10位');
  if(path.endsWith('register')){
   if(process.env.REGISTRATION_CODE&&!safe(String(input.invite||''),process.env.REGISTRATION_CODE))throw Error('体验邀请码不正确');
   if(db.prepare('SELECT id FROM users WHERE name=?').get(name))throw Error('用户名已存在');const salt=randomBytes(16).toString('hex');
   db.prepare('INSERT INTO users(id,name,salt,hash,data) VALUES(?,?,?,?,?)').run(uid(),name,salt,scryptSync(pw,salt,64).toString('hex'),JSON.stringify(initial()));
  }
  const row=db.prepare('SELECT * FROM users WHERE name=?').get(name);if(!row||!safe(scryptSync(pw,row.salt,64).toString('hex'),row.hash))throw Object.assign(Error('账户或密码不正确'),{status:401});
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),row.id,csrf,Date.now()+7*86400000);audit(row.id,'login',{});
  return json(res,200,{ok:true},{'Set-Cookie':`qc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`});
 }
 if(!u){console.warn('session_unavailable',JSON.stringify({reason:req.sessionIssue,path,method:req.method}));return json(res,401,{code:'SESSION_REQUIRED',error:(req.sessionIssue==='expired'?'当前会话已超过有效期':req.sessionIssue==='missing'?'本次请求没有带上会话凭证':'服务端暂时无法找到原会话')+'。当前输入和草稿仍保留；请先重试，勿清空记录或重复确认'});}
 if(mutate&&!safe(req.headers['x-csrf-token'],u.session.csrf))return json(res,403,{error:'安全令牌失效，请刷新'});
 const requestScope=workspaces.active(u.id);
 if(mutate&&path!=='/api/commit'&&(req.headers['x-qc-workspace']!==undefined||requestScope!=='original'||workspaces.metadata(u).saved.length))workspaces.assertCurrent(u,req.headers['x-qc-workspace']);
 if(path==='/api/state'&&req.method==='GET')return json(res,200,{...publicState(u),guestSession:guestSession(u)});
 if(path==='/api/logout'&&mutate){db.prepare('DELETE FROM conversations WHERE session_token=? AND user_id=?').run(u.session.token,u.id);db.prepare('DELETE FROM sessions WHERE token=?').run(u.session.token);return json(res,200,{ok:true},{'Set-Cookie':'qc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(path==='/api/bill-workspace'&&mutate){
  const target=text(input.scope,100),saved=workspaces.read(u.id,target);
  if(input.revision!==u.revision)throw Object.assign(Error('数据已变化，请刷新后再切换'),{status:409});
  if(target===requestScope)return json(res,200,{ok:true});
  if(!saved)throw Error('找不到这份账单记录');
  db.exec('BEGIN IMMEDIATE');try{workspaces.activate(u,target,saved);audit(u.id,'bill_workspace_switched',{from:requestScope,to:target});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return json(res,200,{ok:true});
 }
 if(path==='/api/audit'&&req.method==='GET')return json(res,200,{rows:db.prepare('SELECT at,event,detail,prev_hash,hash FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 200').all(u.id)});
 if(path==='/api/export'&&req.method==='GET')return json(res,200,{...publicState(u),audit:db.prepare('SELECT at,event,detail,hash FROM audit WHERE user_id=?').all(u.id)});
 if(!mutate)return json(res,404,{error:'未知接口'});limit('user:'+u.id,120);
 if(u.lock_until>Date.now())return json(res,423,{error:'安全锁定中，请5分钟后重试'});
 if(path==='/api/totp/setup'){
  if(!safe(scryptSync(String(input.password||''),u.salt,64).toString('hex'),u.hash))throw Error('账户密码错误');
  if(u.totp)throw Error('已绑定验证器，不允许直接覆盖');const secret=b32(randomBytes(20)),id=uid();
  db.prepare('INSERT INTO pending VALUES(?,?,?,?,?,?,?,?,?)').run(id,u.id,'totp','',u.revision,'red',Date.now()+300000,'pending',JSON.stringify({secret}));
  return json(res,200,{id,secret,uri:`otpauth://totp/Qiancheng:${encodeURIComponent(u.name)}?secret=${secret}&issuer=Qiancheng&digits=6&period=30`});
 }
 if(path==='/api/totp/enable'){
  const p=db.prepare('SELECT * FROM pending WHERE id=? AND user_id=? AND type=?').get(input.id,u.id,'totp');if(!p||p.status!=='pending'||p.expires<Date.now())throw Error('绑定已过期');const secret=JSON.parse(p.result).secret,step=Math.floor(Date.now()/30000);if(![step-1,step,step+1].some(k=>safe(totp(secret,k),String(input.code))))throw Error('验证码不正确');
  db.prepare('UPDATE users SET totp=? WHERE id=?').run(secret,u.id);db.prepare('UPDATE pending SET status=?,result=? WHERE id=?').run('done','{}',p.id);audit(u.id,'totp_enabled',{});return json(res,200,{ok:true});
 }
 if(path==='/api/bill-analysis'){
  const s=JSON.parse(u.data),period=text(input.period||month(),7),report=analyzeBills(s,period);
  if(!report.count)throw Error('先导入本月账单，再分析');
  s.billAnalysisCompleted=true;s.billReports=s.billReports||{};s.billReports[period]={...report,analyzedAt:new Date().toISOString()};
  s.billReviewBasis=billReviewBasis(s,period);s.lastBillPeriod=period;if(s.billDecisions)delete s.billDecisions[period];
  db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(s),u.id,u.revision);
  if(!s.demo&&s.transactions.some(t=>t.importKey)){
   const conversation=conversationFor(u),history=recentDialogue([...conversation.history,{role:'assistant',text:'账单分析完成。可以先查看消费分类和待核对记录；要联动储蓄计划时，再补充真实目标与条件。'}]);
   db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?) ON CONFLICT(session_token) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(u.session.token,u.id,JSON.stringify(history),JSON.stringify({resumeTask:{action:'agent-bill-actions',period}}),Date.now());
  }
  audit(u.id,'bill_analyzed',{period,count:report.count});return json(res,200,{ok:true});
 }
 if(path==='/api/chat'){
  const message=text(input.message,600);if(!message)throw Error('请先输入需求');
  const previous=conversationFor(u),contextInput=input.context&&typeof input.context==='object'&&!Array.isArray(input.context)?input.context:previous.context,context=previous.context.subscriptionFlow&&!contextInput.subscriptionFlow?{...contextInput,subscriptionFlow:{...previous.context.subscriptionFlow,paused:true}}:contextInput;
  if(JSON.stringify(context).length>20000)throw Error('对话条件过长，请重新核对');
  const actualPending=db.prepare("SELECT id FROM pending WHERE user_id=? AND status='pending' AND expires>? AND revision=? LIMIT 1").get(u.id,Date.now(),u.revision);
  const r=await plan(JSON.parse(u.data),message,context,input.quote,previous.history,{...input.view,pending:input.view?.pending===true||!!actualPending},{takeModelToken:()=>takeModelToken(u.id)});
  workspaces.assertCurrent(u,requestScope);
  const reference=normalizeQuote(input.quote),history=recentDialogue([...previous.history,{role:'user',text:message,...(reference?{quote:reference}:{})},{role:'assistant',text:r.reply||'请查看当前任务页面，准备好后继续核对。'}]);
  db.prepare('DELETE FROM conversations WHERE session_token NOT IN (SELECT token FROM sessions WHERE expires>?)').run(Date.now());
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?) ON CONFLICT(session_token) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(u.session.token,u.id,JSON.stringify(history),JSON.stringify(r.context||{}),Date.now());
  audit(u.id,r.blocked?'prompt_blocked':'intent_plan',{mode:r.mode,steps:r.steps,proposalType:r.proposal?.type||null,hasQuote:!!input.quote});return json(res,200,r);
 }

 if(path==='/api/prepare'){
  if(input.type==='subscription'&&db.prepare("SELECT id FROM pending WHERE user_id=? AND status='pending' AND expires>? AND revision=? LIMIT 1").get(u.id,Date.now(),u.revision))throw Error('已有待确认草案，请先处理，订阅操作未覆盖原草案');
  const type=text(input.type),args=input.args||{};if(type==='totp')throw Error('不支持此操作');const s=JSON.parse(u.data);if(type==='advance_time')Object.assign(args,advancePreview(s,args.days));const target=type==='import'?workspaces.importTarget(u,s):workspaces.operationTarget(u,s,type,args);const preview=apply(structuredClone(target.state),type,args),level=risk(['transfer','repay'].includes(type)?workspaces.riskState(u,target.state):target.state,type,args),id=uid();
  db.prepare('INSERT INTO pending VALUES(?,?,?,?,?,?,?,?,?)').run(id,u.id,type,JSON.stringify(args),u.revision,level,Date.now()+300000,'pending','{}');
  if(type==='import'||target.isolated)db.prepare('INSERT INTO bill_import_targets VALUES(?,?,?,?)').run(id,u.id,requestScope,target.scope);
  audit(u.id,'prepared',{id,type,level,revision:u.revision});return json(res,200,{isolated:target.isolated,id,type,label:describe(s,type,args),risk:level,before:summary(s),after:summary(preview.state),result:preview.result,expires:Date.now()+300000,summaryArgs:type==='import'?{count:args.rows.length,source:args.source}:args});
 }
 if(path==='/api/cancel'){
  db.prepare("UPDATE pending SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'").run(input.id,u.id);const cancelledType=db.prepare('SELECT type FROM pending WHERE id=? AND user_id=?').get(input.id,u.id)?.type;
  if(cancelledType!=='import'&&!(cancelledType==='goal'&&input.preserveContext===true)){
   const ctx=conversationFor(u).context,next=cancelledType==='subscription'?pauseSubscriptionContext(ctx):ctx.subscriptionFlow?{subscriptionFlow:{...ctx.subscriptionFlow,paused:true}}:{};
   db.prepare('UPDATE conversations SET context=? WHERE session_token=? AND user_id=?').run(JSON.stringify(next),u.session.token,u.id);
  }audit(u.id,'cancelled',{id:input.id});return json(res,200,{ok:true});
 }
 if(path==='/api/commit'){
  const p=db.prepare('SELECT * FROM pending WHERE id=? AND user_id=?').get(input.id,u.id);if(!p||p.type==='totp')throw Error('操作不存在');if(p.status==='done'){
   const result=JSON.parse(p.result),binding=db.prepare('SELECT * FROM bill_import_targets WHERE pending_id=? AND user_id=?').get(p.id,u.id);
   if(result.workspaceScope&&result.workspaceScope!==requestScope)throw Object.assign(Error('这一步已在另一份记录中完成，请返回对应记录查看结果'),{status:409});
   if((req.headers['x-qc-workspace']!==undefined||requestScope!=='original'||workspaces.metadata(u).saved.length)&&req.headers['x-qc-workspace']!==requestScope&&!(binding?.from_scope===req.headers['x-qc-workspace']&&binding.to_scope===requestScope))workspaces.assertCurrent(u,req.headers['x-qc-workspace']);
   return json(res,200,{...result,replayed:true});
  }
  if(req.headers['x-qc-workspace']!==undefined||requestScope!=='original'||workspaces.metadata(u).saved.length)workspaces.assertCurrent(u,req.headers['x-qc-workspace']);
  if(p.status!=='pending'||p.expires<Date.now())throw Error('草案已取消或过期');if(input.confirm!==true)throw Error('必须明确确认');
  if(p.revision!==u.revision)throw Object.assign(Error('数据已变化，请重新生成草案'),{status:409});const args=JSON.parse(p.args),s=JSON.parse(u.data),level=risk(['transfer','repay'].includes(p.type)?workspaces.riskState(u,s):s,p.type,args);
  if(level==='red'){if(isGuest(u)&&!u.totp)throw Error('本次高风险模拟操作需要验证器；当前免注册会话尚无法完成密码复核绑定，草案和记录已保留，本次未执行');checkOtp(u,input.code);}
  db.exec('BEGIN IMMEDIATE');try{
   const fresh=db.prepare('SELECT revision FROM users WHERE id=?').get(u.id);if(fresh.revision!==p.revision)throw Error('数据已更新，请重试');
   const binding=db.prepare('SELECT * FROM bill_import_targets WHERE pending_id=? AND user_id=?').get(p.id,u.id);
   if(binding)workspaces.assertCurrent(u,binding.from_scope);
   const scope=binding?.to_scope||requestScope,base=scope===requestScope?s:workspaces.read(u.id,scope)||(p.type==='import'?initial():structuredClone(s));
   const next=apply(base,p.type,args);
   if(p.type==='import'){
    // Re-import is an explicit new analysis request. Do not present a previous
    // report as the result of this import if the following analysis fails.
    for(const period of new Set(args.rows.map(t=>t.date.slice(0,7)))){if(next.state.billReports)delete next.state.billReports[period];if(next.state.billDecisions)delete next.state.billDecisions[period];}
    next.state.billAnalysisCompleted=false;next.state.billReviewBasis=null;next.state.lastBillPeriod=billImportPeriod(args.rows,month());
   }
   workspaces.activate(u,scope,next.state);
   const result={ok:true,result:next.result,summary:summary(next.state),workspaceChanged:scope!==requestScope,workspaceScope:scope};
   db.prepare("UPDATE pending SET status='done',result=? WHERE id=?").run(JSON.stringify(result),p.id);let nextContext=p.type==='import'?{resumeTask:{action:'agent-bill-analysis',period:billImportPeriod(args.rows,month())}}:peopleContextAfterOperation(next.state,p.type,args)||{completed:p.type};
   const previousContext=conversationFor(u).context;
   if(p.type==='subscription')nextContext=subscriptionAfterOperation(next.state,args,previousContext);
   else if(previousContext.subscriptionFlow)nextContext={...nextContext,subscriptionFlow:{...previousContext.subscriptionFlow,paused:true}};
   if(p.type==='subscription'){
    const conversation=conversationFor(u),history=recentDialogue([...conversation.history,{role:'assistant',text:subscriptionCompletion(args,nextContext)}]);
    db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?) ON CONFLICT(session_token) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(u.session.token,u.id,JSON.stringify(history),JSON.stringify(nextContext),Date.now());
   }else if(p.type==='import'){
    const conversation=conversationFor(u),history=recentDialogue([...conversation.history,{role:'assistant',text:'账单已导入，尚未完成分析。'}]);
    db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?) ON CONFLICT(session_token) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(u.session.token,u.id,JSON.stringify(history),JSON.stringify(nextContext),Date.now());
   }else db.prepare('UPDATE conversations SET context=? WHERE session_token=? AND user_id=?').run(JSON.stringify(nextContext),u.session.token,u.id);audit(u.id,'executed',{id:p.id,type:p.type,level,result:next.result,summary:result.summary});db.exec('COMMIT');return json(res,200,result);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return json(res,404,{error:'未知接口'});
 }catch(e){json(res,e.status||400,{error:e.message||'请求失败'});}
});
const portArg=process.argv.indexOf('--port');const listenPort=Number(portArg>=0?process.argv[portArg+1]:process.env.PORT||3000);
server.listen(listenPort,'0.0.0.0',()=>console.log('钱程已启动：http://localhost:'+server.address().port+'（银行沙箱）'));
