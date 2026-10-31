export const QUOTE_LIMIT=2000;
export function normalizeQuote(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.text!=='string')return null;
 const source=value.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();if(!source)return null;
 const role=value.role==='user'?'user':'assistant';
 return {role,author:String(value.author|| (role==='user'?'我':'钱程')).trim().slice(0,40),text:source.slice(0,QUOTE_LIMIT),truncated:source.length>QUOTE_LIMIT||value.truncated===true};
}
export function isQuoteQuestion(message){
 const q=String(message||'').trim();
 return /为什么|为何|什么意思|解释|怎么理解|如何理解|能说明|说清楚|这段.*(?:意思|说)|这里.*(?:意思|怎么)/.test(q)&&!/^(?:请|帮我)?(?:把|将|修改|改成|调整|确认|转给|转账|借给|垫付|预留|购买|模拟)/.test(q);
}
export function quoteFallback(reference){
 if(/模拟|概率|比例/.test(reference.text))return '你引用的是情景模拟结果：它比较假设路径中的达标情况，不是个人真实成功概率；应结合收入、开销和期限核对。当前没有得到模型对这条追问的进一步解释。';
 if(/每周|每日|周预算|日预算/.test(reference.text))return '你引用的周、日额度是同一笔生活预算的不同视角，不能相加当作两份钱。当前没有得到模型对这条追问的进一步解释。';
 return '已收到你引用的消息和问题，但当前未得到模型对引用内容的进一步解释。可以重试，或说清想核对的目标、金额与条件。';
}
