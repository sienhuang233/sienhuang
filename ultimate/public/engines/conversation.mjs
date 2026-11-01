export function goalPrompt(d={}){if(d.target&&d.months)return '目标信息已齐全，请核对并确认保存。';return (!d.target&&!d.months?'你想攒多少钱，打算多久攒到？':!d.target?'你想攒多少钱？':'你打算多久攒到？')+'可以直接对我说。';}
export function isNextStepMessage(value){
 const q=String(value||'').trim();
 return /^(?:下一步|接下来|继续|推荐任务|我该做什么|继续下一步)[？?。！!\s]*$/.test(q)||/^钱程推荐(?:下一步)?(?:[：:][^\n]{1,120})?[？?。！!\s]*$/.test(q);
}
export function nextStepText(task,context={}){
 let title=task?.title||'帮我找到下一步';
 if(context.intent==='goal_details')title=!context.months?'补齐目标期限':!context.target?'补齐目标金额':'核对目标';
 if(context.intent==='coach_profile')title=context.profileReady?'核对生活条件':context.profileOfferPersona?'试试武汉在校生':'继续补齐生活条件';
 if(context.intent==='transfer_purpose')title='核对这笔转账的用途';
 if(context.intent==='payment_interview')title=({kind:'选择这次支付指令',name:'补充对方姓名',amount:'补充付款金额',share:'核对AA对方份额',date:'补充归还日期',date_type:'核对日期性质'})[context.stage]||'继续补充这次支付';
 if(context.intent==='people_link')title=context.stage==='share'?'核对已有流水的待收份额':context.stage==='date_type'?'核对归还日期性质':'补充这笔往来的归还日期';
 if(context.intent==='people_date')title=context.stage==='date_type'?'核对新日期性质':'补充剩余款项的归还日期';
 if(context.intent==='people_options')title='选择未归还款项的处理方式';
 if(context.intent==='transfer')title='补充这笔转账的金额';
 return '钱程推荐：'+String(title).slice(0,120);
}
export function composerMessage(value,task,context={}){
 return String(value||'').trim()||nextStepText(task,context);
}

export function transferPurposeText(t,now=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})){
 const month=now.slice(0,7),previous=new Date(now.slice(0,7)+'-01T12:00:00Z');previous.setUTCMonth(previous.getUTCMonth()-1);
 const period=t.date?.slice(0,7)===month?'本月':t.date?.slice(0,7)===previous.toISOString().slice(0,7)?'上个月':t.date?'在'+t.date:'';
 const amount=(t.cents/100).toLocaleString('zh-CN',{maximumFractionDigits:2});
 return `你${period}有一笔${amount}元转账，这是垫付、AA、送礼，还是其他用途？`;
}
export function isContinuationMessage(value){if(/^(?:好|好的|好吧|嗯|可以|就这样)[。！!\s]*$/.test(String(value||'').trim()))return true;return /^(?:(?:好的?|那就?)[，,、\s]*)?(?:继续(?:吧|呀|啊|一下)?|接着说|接着讲|往下说|继续说|继续讲|继续上(?:一个(?:指令|任务)?|一步)|继续刚才(?:的|那个)?(?:任务|问题|指令)?|接着上一步)[？?。！!\s]*$/.test(String(value||'').trim());}

export function billSourceTask(s={}){const allowed=s.demo||!s.openingKnown&&!s.transactions?.length&&!s.cases?.length;return {action:allowed?'load-sample-bill':'route-to-bills',title:allowed?'导入虚拟账单':'导入自己的真实账单'};}
