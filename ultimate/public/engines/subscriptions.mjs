export const SUBSCRIPTION_REQUEST='帮我分析当前账单月份的订阅，并带我核对一项是否需要保留。';
export const validBillPeriod=p=>/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(p||''));
const services=[['腾讯视频','video'],['爱奇艺','video'],['QQ音乐','music'],['网易云音乐','music']];
export function subscriptionEvidence(s,period){
 if(!validBillPeriod(period))throw Error('请选择有效的账单月份');
 const groups=new Map();
 for(const t of s.transactions){
  if(!t.date.startsWith(period)||t.excluded||t.duplicateOf||t.direction!=='out'||t.kind!=='expense')continue;
  const content=[t.merchant,t.desc,t.rawType,t.rawCat].join(' '),known=services.find(([name])=>content.toLowerCase().includes(name.toLowerCase()));
  if(t.cat!=='subs'&&!/会员|订阅|包月|自动续费|连续扣费/.test(content)&&!(known&&/充值/.test(content)))continue;
  const name=known?.[0]||t.merchant;if(!name)continue;
  const row=groups.get(name)||{name,group:known?.[1]||'other',cents:0,count:0,dates:[],transactionIds:[],recurringHint:false,status:s.subscriptions.find(x=>x.name===name)?.status||'unreviewed'};
  row.cents+=t.cents;row.count++;row.dates.push(t.date);row.transactionIds.push(t.id);row.recurringHint||=/连续包月|自动续费|连续扣费|代扣/.test(content);groups.set(name,row);
 }
 return [...groups.values()].map(x=>({...x,dates:[...new Set(x.dates)].sort()}));
}
export function isSubscriptionRequest(q){
 return /订阅|会员|连续扣费|续费|代扣|包月|退订|网易云|QQ音乐|爱奇艺|腾讯视频/.test(q);
}
export function isSubscriptionMainline(q){
 return /^钱程推荐(?:下一步)?[：:]/.test(q)||/返回(?:账单建议|预算建议|主线)/.test(q)||/返回(?:账单|预算|主线)|预算建议|预算调整|预览.*(?:调整|预算)|转账(?:的)?用途|转账核对|人情往来|(?:我想|我要|帮我|设置|设定|修改).*(?:攒|存钱|储蓄目标)|核对.*(?:转账|垫付|到账)|记录.*(?:人情|垫付)|(?:分析|导入)(?:这份|自己的|本月)?账单(?!.*订阅)/.test(q)&&!isSubscriptionRequest(q);
}
