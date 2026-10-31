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
 CREATE TABLE IF NOT EXISTS limits(k TEXT PRIMARY KEY,n INTEGER,expires INTEGER);`);
const hash=x=>createHash('sha256').update(x).digest('hex');const safe=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
function audit(u,event,detail){const prev=db.prepare('SELECT hash FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 1').get(u)?.hash||'GENESIS',at=new Date().toISOString(),d=JSON.stringify(detail),h=hash([prev,at,event,d].join('|'));db.prepare('INSERT INTO audit(user_id,at,event,detail,prev_hash,hash) VALUES(?,?,?,?,?,?)').run(u,at,event,d,prev,h);}
function limit(k,n,span=60000){const now=Date.now();db.prepare('DELETE FROM limits WHERE expires<?').run(now);const row=db.prepare('SELECT * FROM limits WHERE k=?').get(k);if(row&&row.n>=n)throw Object.assign(Error('操作频繁，请稍后再试'),{status:429});db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=n+1').run(k,now+span);}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';export function b32(bytes){let bits=0,val=0,out='';for(const b of bytes){val=(val<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(val>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(val<<(5-bits))&31];return out;}
function un32(s){let bits=0,v=0,out=[];for(const c of s){v=(v<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,step=Math.floor(Date.now()/30000)){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',un32(secret)).update(b).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
function checkOtp(u,code){if(!u.totp)throw Error('请先在安全中心绑定验证器');const step=Math.floor(Date.now()/30000);for(const k of [step-1,step,step+1])if(k>u.last_totp&&safe(totp(u.totp,k),String(code))){db.prepare('UPDATE users SET last_totp=?,fail=0 WHERE id=?').run(k,u.id);return;}
 const n=u.fail+1;db.prepare('UPDATE users SET fail=?,lock_until=? WHERE id=?').run(n,n>=5?Date.now()+5*60000:0,u.id);audit(u.id,'verification_failed',{attempt:n});throw Error(n>=5?'验证连续失败，操作锁定5分钟':'验证码无效或已用，请等待下一组验证码');}
function current(req){const token=/\bqc_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];if(!token)return null;const session=db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now());if(!session)return null;const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);return {...user,session};}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'"};
function json(res,status,data,extra={}){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>5*1024*1024)throw Error('请求超过5MB');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function conversationFor(u){const row=db.prepare('SELECT history,context FROM conversations WHERE session_token=? AND user_id=?').get(u.session.token,u.id);return row?{history:recentDialogue(JSON.parse(row.history)),context:JSON.parse(row.context)}:{history:[],context:{}};}
function publicState(u){const s=JSON.parse(u.data),conversation=conversationFor(u);return {conversation:conversation.history,conversationContext:conversation.context,state:s,summary:summary(s),recommendation:recommend(s),revision:u.revision,user:{name:u.name,id:u.id},csrf:u.session.csrf,totpEnabled:!!u.totp,aiEnabled:!!(process.env.BIGMODEL_API_KEY&&process.env.BIGMODEL_MODEL),aiNotice:'模型接收当前会话近期对话、主动引用及当前任务状态；不会自动发送账单明细或账户余额。不要在对话中输入密码或验证码。'};}
const server=http.createServer(async(req,res)=>{
 try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/health')return json(res,200,{ok:true,version:'1.9.21',bank:'sandbox'});
 if(!path.startsWith('/api/')){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const file=resolve(root,'public',path==='/'?'index.html':'.'+decodeURIComponent(path));if(!file.startsWith(resolve(root,'public')+sep)||!existsSync(file))return json(res,404,{error:'未找到文件'});
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.csv':'text/csv; charset=utf-8'}[extname(file)];if(!mime)return json(res,404,{error:'未找到文件'});
  res.writeHead(200,{...headers,'Content-Type':mime,'Content-Disposition':'inline'});res.end(readFileSync(file));return;
 }
 const mutate=req.method==='POST';if(mutate){const origin=req.headers.origin;const expected=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;if(origin&&origin!==expected)throw Object.assign(Error('来源校验失败'),{status:403});if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('请使用JSON请求');}
 const ip=req.socket.remoteAddress;let u=current(req),input=mutate?await body(req):{};
 if(path==='/api/guest'&&mutate){
  limit('guest:'+ip,10,3600000);const id=uid(),name='guest-'+id.slice(0,8),salt=randomBytes(16).toString('hex'),password=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO users(id,name,salt,hash,data) VALUES(?,?,?,?,?)').run(id,name,salt,scryptSync(password,salt,64).toString('hex'),JSON.stringify(initial()));
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),id,csrf,Date.now()+86400000);
  return json(res,200,{ok:true},{'Set-Cookie':`qc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE==='1'?'; Secure':''}`});
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
 if(!u)return json(res,401,{error:'请登录你的独立账户'});
 if(mutate&&!safe(req.headers['x-csrf-token'],u.session.csrf))return json(res,403,{error:'安全令牌失效，请刷新'});
 if(path==='/api/state'&&req.method==='GET')return json(res,200,publicState(u));
 if(path==='/api/logout'&&mutate){db.prepare('DELETE FROM conversations WHERE session_token=? AND user_id=?').run(u.session.token,u.id);db.prepare('DELETE FROM sessions WHERE token=?').run(u.session.token);return json(res,200,{ok:true},{'Set-Cookie':'qc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
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
  audit(u.id,'bill_analyzed',{period,count:report.count});return json(res,200,{ok:true});
 }
 if(path==='/api/chat'){
  limit('ai:'+day()+':'+u.id,40,86400000);limit('ai-global:'+day(),500,86400000);const message=text(input.message,600);if(!message)throw Error('请先输入需求');
  const previous=conversationFor(u),context=input.context&&typeof input.context==='object'&&!Array.isArray(input.context)?input.context:previous.context;
  if(JSON.stringify(context).length>20000)throw Error('对话条件过长，请重新核对');
  const r=await plan(JSON.parse(u.data),message,context,input.quote,previous.history,input.view);
  const reference=normalizeQuote(input.quote),history=recentDialogue([...previous.history,{role:'user',text:message,...(reference?{quote:reference}:{})},{role:'assistant',text:r.reply||'请查看当前任务页面，准备好后继续核对。'}]);
  db.prepare('DELETE FROM conversations WHERE session_token NOT IN (SELECT token FROM sessions WHERE expires>?)').run(Date.now());
  db.prepare('INSERT INTO conversations VALUES(?,?,?,?,?) ON CONFLICT(session_token) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(u.session.token,u.id,JSON.stringify(history),JSON.stringify(r.context||{}),Date.now());
  audit(u.id,r.blocked?'prompt_blocked':'intent_plan',{mode:r.mode,steps:r.steps,proposalType:r.proposal?.type||null,hasQuote:!!input.quote});return json(res,200,r);
 }

 if(path==='/api/prepare'){
  const type=text(input.type),args=input.args||{};if(type==='totp')throw Error('不支持此操作');const s=JSON.parse(u.data);if(type==='advance_time')Object.assign(args,advancePreview(s,args.days));const preview=apply(structuredClone(s),type,args),level=risk(s,type,args),id=uid();
  db.prepare('INSERT INTO pending VALUES(?,?,?,?,?,?,?,?,?)').run(id,u.id,type,JSON.stringify(args),u.revision,level,Date.now()+300000,'pending','{}');
  audit(u.id,'prepared',{id,type,level,revision:u.revision});return json(res,200,{id,type,label:describe(s,type,args),risk:level,before:summary(s),after:summary(preview.state),result:preview.result,expires:Date.now()+300000,summaryArgs:type==='import'?{count:args.rows.length,source:args.source}:args});
 }
 if(path==='/api/cancel'){
  db.prepare("UPDATE pending SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'").run(input.id,u.id);db.prepare('UPDATE conversations SET context=? WHERE session_token=? AND user_id=?').run('{}',u.session.token,u.id);audit(u.id,'cancelled',{id:input.id});return json(res,200,{ok:true});
 }
 if(path==='/api/commit'){
  const p=db.prepare('SELECT * FROM pending WHERE id=? AND user_id=?').get(input.id,u.id);if(!p||p.type==='totp')throw Error('操作不存在');if(p.status==='done')return json(res,200,{...JSON.parse(p.result),replayed:true});
  if(p.status!=='pending'||p.expires<Date.now())throw Error('草案已取消或过期');if(input.confirm!==true)throw Error('必须明确确认');
  if(p.revision!==u.revision)throw Object.assign(Error('数据已变化，请重新生成草案'),{status:409});const args=JSON.parse(p.args),s=JSON.parse(u.data),level=risk(s,p.type,args);
  if(level==='red')checkOtp(u,input.code);
  db.exec('BEGIN IMMEDIATE');try{
   const fresh=db.prepare('SELECT revision FROM users WHERE id=?').get(u.id);if(fresh.revision!==p.revision)throw Error('数据已更新，请重试');
   const next=apply(s,p.type,args);db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next.state),u.id);const result={ok:true,result:next.result,summary:summary(next.state)};
   db.prepare("UPDATE pending SET status='done',result=? WHERE id=?").run(JSON.stringify(result),p.id);db.prepare('UPDATE conversations SET context=? WHERE session_token=? AND user_id=?').run(JSON.stringify(peopleContextAfterOperation(next.state,p.type,JSON.parse(p.args))||{completed:p.type}),u.session.token,u.id);audit(u.id,'executed',{id:p.id,type:p.type,level,result:next.result,summary:result.summary});db.exec('COMMIT');return json(res,200,result);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return json(res,404,{error:'未知接口'});
 }catch(e){json(res,e.status||400,{error:e.message||'请求失败'});}
});
const portArg=process.argv.indexOf('--port');const listenPort=Number(portArg>=0?process.argv[portArg+1]:process.env.PORT||3000);
server.listen(listenPort,'0.0.0.0',()=>console.log('钱程已启动：http://localhost:'+server.address().port+'（银行沙箱）'));
