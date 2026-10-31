const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const features=[
 {number:'①',name:'目标教练',question:'想攒的钱，现在做得到吗？',example:'我想两年攒2万去旅行',action:'example-goal',
  short:'说出目标，补齐收入和生活条件；比较三条路线，再落实到月分配、周预算和打卡。',
  when:'想旅行、买电脑，或为一件重要的事攒钱，却不知道每月该存多少。',
  steps:['了解收入、住房和必要开支，核对你的现实条件。','计算三条储蓄路线；目标偏难时，说清差距并比较调整办法。','选定路线后，列出每月资金分配、每周可花额度和行动打卡。'],
  result:'一条你亲自选择、能按周执行的储蓄计划。'},
 {number:'②',name:'账单体检',question:'钱花在哪？下个月具体怎么改？',example:'分析账单，找找调整空间',action:'example-bills',
  short:'选自己的月账单或虚拟样本，找出可调整项目；接受建议后，更新目标预算与每周行动。',
  when:'总觉得钱花得快，想找一两件真正能坚持的改进，而不是一味少花钱。',
  steps:['先选择导入自己的账单，或用明确虚构的样本体验。','看消费结构，核对订阅、疑似重复和用途不明的转账。','把你接受的建议写成次数、金额上限与每周行动，并反馈给目标教练。'],
  result:'一项有账单依据、金额明确、可以打卡的预算改进。'},
 {number:'③',name:'人情往来',question:'谁欠谁多少？什么时候合适提醒？',example:'给小王垫付100元',action:'example-debts',
  short:'把垫付、借入和借出记清楚；到期先核对是否归还，再选三种提醒话术，支持部分归还与抵消。',
  when:'替同学垫钱、AA聚餐或朋友借还款，想记清金额，也想把关系照顾好。',
  steps:['核对对方、用途、金额与日期，分清约定日期和个人期望。','到期先问是否已经归还；未收到的钱不会提前计入可用资金。','需要提醒时，从三种授权助手话术中选一句，再由你确认模拟发送。'],
  result:'清楚的待收待还记录，以及由你掌握分寸的后续处理。'}
];
function completed(s,index){return index===0?!!s.coachRoute:index===1?!!(s.billAnalysisCompleted||s.billReviewBasis):!!(s.peopleSceneCompleted||s.cases?.length);}
export function scenarioCards(state,detailed=false){
 return `<section class="card feature-overview ${detailed?'feature-detailed':''}" id="scenes"><div class="row"><div><div class="eyebrow">不知道从哪开始？先选一个问题</div><h2>三个场景，围绕同一笔钱</h2></div>${detailed?'':'<button class="small" data-act="to-intro">查看完整功能介绍 →</button>'}</div><div class="scenario-grid">${features.map((f,i)=>`<article class="scenario-card feature-card"><div class="feature-heading"><span class="scenario-number">${f.number}</span><h3>${f.name}</h3></div><b class="feature-question">${f.question}</b>${detailed?`<p>${f.when}</p><ol class="feature-steps">${f.steps.map(step=>`<li>${step}</li>`).join('')}</ol><p class="feature-result"><b>最后得到：</b>${f.result}</p>`:`<p>${f.short}</p>`}<div class="feature-example"><small>可以对钱程说</small><span>“${f.example}”</span></div><div class="row feature-actions"><span class="badge ${completed(state,i)?'':'warn'}">${completed(state,i)?'已体验':'可体验'}</span><button class="small" data-act="${f.action}">体验${f.name} →</button></div></article>`).join('')}</div></section>`;
}
export function featureIntro(){
 const rows=[
  ['目标教练','把攒钱愿望变成计划：比较三条路线，给出月分配、周预算和打卡。','说出目标 → 补齐金额、期限和生活条件 → 核对模拟 → 选路线执行。','我想两年攒2万去旅行','example-goal'],
  ['账单体检','看钱花在哪，找可调整支出；采纳具体建议后，更新目标预算和每周行动。','选自己的账单或虚构样本 → 分析消费 → 修改、确认一项节流行动。','分析账单，找找调整空间','example-bills'],
  ['人情往来','记录垫付、借入借出、部分归还和互欠抵消；到期先核对，再选提醒话术。','说出一笔往来 → 核对对象、金额和日期 → 到期核对到账 → 记录或模拟提醒。','给小王垫付100元','example-debts']
 ];
 return `<section class="intro-simple"><h1>功能介绍</h1><p class="muted">选一个想解决的问题。点击体验，会把示例直接发给钱程助手。</p>${rows.map(([name,feature,steps,example,action],i)=>`<section class="card intro-scene"><h2>${i+1}. ${name}</h2><p>${feature}</p><p class="intro-process"><b>怎么体验：</b>${steps}</p><button class="primary intro-try" data-act="${action}">体验${name} →</button><small>发送：“${example}”</small></section>`).join('')}<p class="footnote">真实账单可免注册导入。虚构样本与真实数据分开；转账、购买、取消订阅及提醒发送均为模拟。模拟比例不是个人真实成功概率；提醒仅在页面打开时检查。</p><button data-act="to-home">返回开始</button></section>`;
}
