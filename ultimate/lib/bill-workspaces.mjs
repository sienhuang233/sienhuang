import {initial,uid} from './domain.mjs';

// Business rules continue to see exactly one ledger. Archived ledgers never
// enter summary(), importRows(), the planner, or model context.
export function hasSimulation(s){
 return !!(s.demo||s.simulatedDate||s.transactions.some(t=>t.simulated||t.source==='demo')||s.subscriptions.some(x=>x.simulated&&x.source==='demo'));
}
export function billImportPeriod(rows,fallback){
 const periods=rows.map(t=>t.date.slice(0,7)).sort();
 return periods.includes(fallback)?fallback:periods.at(-1)||fallback;
}
export function createBillWorkspaces(db){
 db.exec(`CREATE TABLE IF NOT EXISTS bill_workspace_active(user_id TEXT PRIMARY KEY,scope TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bill_workspace_states(user_id TEXT,scope TEXT,data TEXT NOT NULL,updated INTEGER,PRIMARY KEY(user_id,scope));
 CREATE TABLE IF NOT EXISTS bill_workspace_conversations(user_id TEXT,session_token TEXT,scope TEXT,history TEXT,context TEXT,updated INTEGER,PRIMARY KEY(user_id,session_token,scope));
 CREATE TABLE IF NOT EXISTS bill_import_targets(pending_id TEXT PRIMARY KEY,user_id TEXT,from_scope TEXT,to_scope TEXT);`);
 const active=userId=>db.prepare('SELECT scope FROM bill_workspace_active WHERE user_id=?').get(userId)?.scope||'original';
 const read=(userId,scope)=>{const row=db.prepare('SELECT data FROM bill_workspace_states WHERE user_id=? AND scope=?').get(userId,scope);return row?JSON.parse(row.data):null;};
 const label=s=>hasSimulation(s)?'模拟记录':'真实账单';
 function metadata(u){
  const scope=active(u.id),s=JSON.parse(u.data);
  return {active:scope,label:label(s),hasSimulation:hasSimulation(s),saved:db.prepare('SELECT scope,data FROM bill_workspace_states WHERE user_id=? AND scope<>? ORDER BY updated DESC').all(u.id,scope).map(r=>({scope:r.scope,label:label(JSON.parse(r.data))}))};
 }
 function importTarget(u,s){
  const from=active(u.id);
  if(!hasSimulation(s))return {from,scope:from,state:s,isolated:false};
  const saved=db.prepare('SELECT scope,data FROM bill_workspace_states WHERE user_id=? AND scope<>? ORDER BY updated DESC').all(u.id,from).find(r=>r.scope.startsWith('real-')&&!hasSimulation(JSON.parse(r.data)));
  return {from,scope:saved?.scope||'real-'+uid(),state:saved?JSON.parse(saved.data):initial(),isolated:true};
 }
 function assertCurrent(u,scope){
  if(active(u.id)!==scope)throw Object.assign(Error('账单数据来源已切换，请刷新后重试；本次没有执行操作'),{status:409});
 }
 // Called inside the same transaction as the business commit. A failed import
 // leaves both the active ledger and all archived ledgers unchanged.
 function activate(u,scope,state){
  const from=active(u.id);
  if(from!==scope){
   const now=Date.now();
   db.prepare('INSERT INTO bill_workspace_states VALUES(?,?,?,?) ON CONFLICT(user_id,scope) DO UPDATE SET data=excluded.data,updated=excluded.updated').run(u.id,from,u.data,now);
   db.prepare('INSERT INTO bill_workspace_conversations SELECT user_id,session_token,?,history,context,updated FROM conversations WHERE user_id=? ON CONFLICT(user_id,session_token,scope) DO UPDATE SET history=excluded.history,context=excluded.context,updated=excluded.updated').run(from,u.id);
   db.prepare('DELETE FROM conversations WHERE user_id=?').run(u.id);
   db.prepare('INSERT INTO conversations SELECT session_token,user_id,history,context,updated FROM bill_workspace_conversations WHERE user_id=? AND scope=?').run(u.id,scope);
   db.prepare('INSERT INTO bill_workspace_active VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET scope=excluded.scope').run(u.id,scope);
  }
  db.prepare('UPDATE users SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(state),u.id);
 }
 return {active,read,metadata,importTarget,assertCurrent,activate};
}
