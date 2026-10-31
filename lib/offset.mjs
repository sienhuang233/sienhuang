
    // Inspired by EvenUp's computeBalances / simplifyDebts; see 参考与许可.txt.
    // Only net debts with the same counterparty; amounts are integer cents.
    const cents=n=>Math.round(Number(n||0)*100);
    const nameKey=n=>String(n||'').trim().toLocaleLowerCase();
    const remainingCents=c=>Math.max(0,cents(c.amount)-cents(c.paid)-cents(c.offset));
    const offsetEligible=c=>c.confirmed&&['借入','借款','垫付','AA'].includes(c.kind)&&nameKey(c.recipient)&&remainingCents(c)>0;
    const offsetStamp=cases=>JSON.stringify(cases.map(c=>[c.id,c.recipient,c.kind,c.amount,c.paid,c.offset,c.confirmed,c.dueDate,c.repaymentUncertain]));
    function nettingGroups(cases){
      const groups=new Map();
      for(const c of cases){if(!offsetEligible(c))continue;const key=nameKey(c.recipient);
        if(!groups.has(key))groups.set(key,{key,name:c.recipient.trim(),bills:[],oweCents:0,receiveCents:0});
        const g=groups.get(key);g.bills.push(c);g[c.kind==='借入'?'oweCents':'receiveCents']+=remainingCents(c);
      }
      return [...groups.values()].map(g=>({...g,maxCents:Math.min(g.oweCents,g.receiveCents),netCents:g.receiveCents-g.oweCents}));
    }
    function makeOffsetPlan(cases,key,amountCents){
      const g=nettingGroups(cases).find(g=>g.key===key);
      if(!g||!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>g.maxCents)throw Error('抵消金额须大于 0，且不能超过双方可抵消金额。');
      if(g.bills.some(c=>c.repaymentUncertain))throw Error('有账单的还款情况尚未核实，请先在该账单中核对实际还款。');
      const order=(a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||String(a.events?.at(-1)?.at||'').localeCompare(String(b.events?.at(-1)?.at||''))||String(a.id).localeCompare(String(b.id));
      const incoming=g.bills.filter(c=>c.kind==='借入').slice().sort(order).map(c=>({c,left:remainingCents(c)}));
      const outgoing=g.bills.filter(c=>c.kind!=='借入').slice().sort(order).map(c=>({c,left:remainingCents(c)}));
      const pairs=[];let i=0,j=0,left=amountCents;
      while(left>0&&i<incoming.length&&j<outgoing.length){
        const a=incoming[i],b=outgoing[j],take=Math.min(a.left,b.left,left);
        pairs.push({inId:a.c.id,outId:b.c.id,amount:take/100,inBefore:a.left/100,outBefore:b.left/100,inAfter:(a.left-take)/100,outAfter:(b.left-take)/100});
        a.left-=take;b.left-=take;left-=take;if(a.left===0)i++;if(b.left===0)j++;
      }
      if(left!==0)throw Error('余额不一致，请重新核对。');
      return {...g,amountCents,pairs,fingerprint:offsetStamp(g.bills),afterOweCents:g.oweCents-amountCents,afterReceiveCents:g.receiveCents-amountCents};
    }
    const billSnapshot=c=>({id:c.id,recipient:c.recipient,kind:c.kind,amount:c.amount,paid:c.paid,offset:c.offset,dueDate:c.dueDate||'',purpose:c.purpose||''});
    function applyOffsetPlan(source,plan,batchId,at){
      if(source.offsets.some(o=>(o.batchId||o.id)===batchId))throw Error('这次抵消已记录，请勿重复提交。');
      const fresh=makeOffsetPlan(source.cases,plan.key,plan.amountCents);
      if(fresh.fingerprint!==plan.fingerprint)throw Error('账单已变化，请重新预览抵消金额。');
      const next=JSON.parse(JSON.stringify(source));
      fresh.pairs.forEach((p,i)=>{const a=next.cases.find(c=>c.id===p.inId),b=next.cases.find(c=>c.id===p.outId);
        const record={...p,id:`${batchId}-${i+1}`,batchId,recipient:fresh.name,at,version:2,inBill:billSnapshot(a),outBill:billSnapshot(b),summary:{beforeOwe:fresh.oweCents/100,beforeReceive:fresh.receiveCents/100,afterOwe:fresh.afterOweCents/100,afterReceive:fresh.afterReceiveCents/100,total:fresh.amountCents/100}};
        a.offset=(cents(a.offset)+cents(p.amount))/100;b.offset=(cents(b.offset)+cents(p.amount))/100;
        a.events.unshift({at,text:`与${b.recipient}的${b.kind}账单（${b.id}）抵消 ¥${p.amount.toFixed(2)}；待还 ¥${p.inBefore.toFixed(2)} → ¥${p.inAfter.toFixed(2)}；抵消批次 ${batchId}`});
        b.events.unshift({at,text:`与${a.recipient}的借入账单（${a.id}）抵消 ¥${p.amount.toFixed(2)}；待收 ¥${p.outBefore.toFixed(2)} → ¥${p.outAfter.toFixed(2)}；抵消批次 ${batchId}`});
        next.offsets.push(record);
      });
      return next;
    }
    function undoOffsetBatch(source,batchId,at){
      const rows=source.offsets.filter(o=>(o.batchId||o.id)===batchId);
      if(!rows.length||rows.some(o=>o.revoked))throw Error('这次抵消已撤销或不存在。');
      const amounts=new Map();
      for(const o of rows)for(const id of [o.inId,o.outId])amounts.set(id,(amounts.get(id)||0)+cents(o.amount));
      for(const [id,n] of amounts){const c=source.cases.find(c=>c.id===id);if(!c||cents(c.offset)<n)throw Error('关联账单缺失或金额不一致，无法撤销，请核对备份。');}
      const next=JSON.parse(JSON.stringify(source));
      for(const [id,n] of amounts){const c=next.cases.find(c=>c.id===id);c.offset=(cents(c.offset)-n)/100;c.events.unshift({at,text:`撤销抵消批次 ${batchId}，本笔未结清金额恢复 ¥${(n/100).toFixed(2)}；实际还款记录不变`});}
      for(const o of next.offsets)if((o.batchId||o.id)===batchId){o.revoked=true;o.revokedAt=at;}
      return next;
    }
    
export {nettingGroups,makeOffsetPlan,applyOffsetPlan,undoOffsetBatch,remainingCents};
