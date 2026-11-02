const left=c=>Math.max(0,Math.round(c.amount*100)-Math.round(c.paid*100)-Math.round(c.offset*100));
export function nextDue(s,now=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})){
 const current=s.simulatedDate||now;
 const item=s.cases.filter(c=>left(c)>0&&c.dueDate>current&&c.reminderDays>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
 if(!item)return null;return {caseId:item.id,date:item.dueDate,days:Math.round((Date.parse(item.dueDate)-Date.parse(current))/86400000)};
}
export function sampleDue(s,now=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})){
 return new Date(Date.parse((s.simulatedDate||now)+'T12:00:00Z')+7*86400000).toISOString().slice(0,10);
}
