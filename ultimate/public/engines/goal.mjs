const esc=s=>String(s);const yuan=n=>Math.round(n).toLocaleString("zh-CN");
const BASE={
  city:[['一线核心区',2600],['一线其他区',1900],['新一线',1400],['二三线',1000]],
  home:[['合租',1.0],['整租',1.8],['与家人同住',0.35],['学校宿舍',0.2]],
  job:[['互联网/科技',0.18,0.06],['金融/专业服务',0.15,0.05],['制造/工程',0.10,0.03],
       ['餐饮零售/服务',0.20,0.03],['体制内/教师/医护',0.05,0.03],['自由职业/创业',0.35,0.02],['在校学生',0.25,0.10]],
  income:[['4000 以下',3500],['4000-8000',6000],['8000-12000',10000],['12000-20000',16000],['20000 以上',26000]],
  rel:[['单身',0],['恋爱 · 暂无婚姻计划',500],['恋爱 · 有婚姻计划',2200],['已婚',800]],
  commute:[['步行/骑车',80],['地铁公交',260],['打车/自驾',700]],
  risk:[['跌一点就睡不好',0],['能承受短期浮亏',1],['愿意承受明显波动',2]],
  time:[['几乎不想管',0],['每月看一次',1],['愿意每周研究',2]]
};
const FOOD={ '一线核心区':1300,'一线其他区':1150,'新一线':980,'二三线':820 };
const DAILY=350;
// 非必要消费基准：社交、娱乐、购物、服饰。必要支出里没有这一项，但它真实存在，
// 与其在结余上悄悄打一个 35% 的折，不如把它摆出来、让用户自己改。
const LEISURE={ '一线核心区':900,'一线其他区':800,'新一线':700,'二三线':550 };
// 每个孩子的月支出：按年龄段 + 学校类型（[公立, 私立, 国际]，私立/国际已含学费，量级估计可替换）
const KID_STAGE=[['婴幼儿 0-2 岁',[2200,2600,3200]],['幼儿园 3-6 岁',[1600,3800,6500]],
  ['小学 7-12 岁',[800,3500,9000]],['中学 13-18 岁',[1200,4500,12000]],['大学及以上',[2200,3500,6000]]];
const SCHOOL=['公立','私立','国际'];
const SRC={
  budget:'必要支出带：按城市房租量级、餐饮与通勤基准、家庭阶段附加项合成，给出下限—上限区间，避免用户自行填报不准。',
  montecarlo:'蒙特卡洛模拟：对收入波动、支出区间与偶发开销随机抽样，重复 2000 次，达标频率只描述假设情景，不是个人成功概率。',
  lifecycle:'生命周期假说（Modigliani & Brumberg, 1954）：人们按一生收入平滑消费，年轻阶段储蓄率应随收入上行而提高。',
  quadrant:'标准普尔家庭资产象限图：把资产分为要花的钱、保命的钱、生钱的钱、保本升值四层，配置顺序先保障后增值。',
  mpt:'现代投资组合理论（Markowitz, 1952）：在给定风险下追求收益，收益与波动需成对评估，不能只看预期收益。',
  glide:'目标日期/下滑轨道（glide path）：随目标临近逐步降低风险资产比重，避免临门一脚遭遇回撤。',
  gradient:'目标梯度效应（Kivetz, Urminsky & Zheng, 2006）：越接近目标，人越有动力；因此设阶段目标比只设终点更有效。',
  commit:'承诺机制与容错设计：允许一定比例超支（弹性周）可显著降低中途放弃率，优于严格打卡。',
  present:'现时偏差（Laibson, 1997）与心理账户（Thaler, 1985）：人会高估当下消费，结余不会自动变成存款。这里只对可弹性调整的日常支出（餐饮/交通/日用）计提 12% 的超支；房租、学费、赡养费属合同型支出，不打折。',
  line:'红线设计依据：心理账户与行为组合理论（Thaler, 1985; Shefrin & Statman, 2000）——把钱按用途分账并预设不可逾越的界限，比"尽量省"这种模糊目标更能约束实际支出；配合预先承诺（precommitment）可显著降低挪用储蓄的概率。',
  perday:'预算摊薄（mental budgeting）：月预算数字太大难以感知，折算为周/日额度后与真实的消费决策频率对齐，才具备可执行性。',
  sens:'敏感度分析：在同一模型下每次只变动一个变量（储蓄额、目标额、期限），比较概率变化，用于判断下一步动哪个杠杆最有效。',
  audit:'三层核查管线（可靠性设计）：金额交给本地程序计算，AI 无写入权限；产品信息来自带时间戳的结构化数据，AI 只能读；AI 的自由文本解释强制通过输出校验器，拦下具体产品、收益承诺与白名单外的数字。查不到的信息明确留空，显示「待核实」——不是靠一句"别幻觉"，而是让错误在结构上不可发生。'
};
// 数据溯源：每个数字都标"谁说的、什么时候说的"。没有来源的数字 = 不存在的数字。
// source: {org:'来源机构', when:'YYYY-MM-DD', ref:'引用位置'}；查不到就置 null，UI 显示「待核实」，绝不由 AI 现编。
const DATA_SRC={
  cityRent:{org:'公开租房行情（量级估计，可替换）',when:'2026-10',ref:null},
  food:{org:'公开生活成本统计（量级估计）',when:'2026-10',ref:null},
  kid:{org:'公开教育成本统计（量级估计）',when:'2026-10',ref:null},
  ret:{org:'长期历史回报区间（历史≠未来，非承诺）',when:'2026-10',ref:null}
};
const PRODUCTS=[
  {key:'cash',tag:'流动性层',name:'货币基金 / 现金管理类',risk:'R1',fit:0,src:'quadrant',
   note:'随取随用，放 3-6 个月必要支出作为应急垫。',
   where:'银行 App 的活钱管理 / 现金管理专区，或持牌基金销售平台的货币基金频道',
   how:['在筛选里把风险等级限定为 R1，再看产品名称里有没有"货币""现金管理"字样',
        '先小额买一笔试试，确认赎回什么时候到账（多为 T+0 或 T+1）以及单日快赎额度',
        '把应急垫攒满之后，新存的钱再往下两层走，别一直堆在这一层'],
   care:'七日年化收益率、万份收益都是历史浮动值，不是承诺收益；单日快速赎回通常有额度上限。',
   // 结构化产品事实（AI 只能读，不能写；未来由可靠数据接口回填，查不到就 null）
   fact:{fee:null,minBuy:null,redeem:'T+0 或 T+1（以产品说明书为准）',guarantee:false,source:null}},
  {key:'stable',tag:'稳健层',name:'国债逆回购 / 同业存单指数 / 银行理财 R1-R2',risk:'R1-R2',fit:0,src:'mpt',
   note:'波动小，适合 1-3 年内要用的钱。',
   where:'国债逆回购需要券商账户；银行理财在银行 App 的理财专区；同业存单指数基金在持牌基金销售平台',
   how:['买之前先看产品说明书上的三件事：风险等级、期限、是不是净值型',
        '国债逆回购在交易软件里搜"国债逆回购"，按这笔钱闲置多久选 1 天 / 7 天 / 14 天等期限',
        '同业存单指数基金和银行理财按上面算出的金额按月买入即可，不用择时'],
   care:'R1-R2 不等于保本，净值型产品会有小幅波动；看清楚起购金额、封闭期和赎回费规则。',
   fact:{fee:null,minBuy:null,redeem:'以产品说明书为准',guarantee:false,source:null}},
  {key:'growth',tag:'增值层',name:'宽基指数基金定投',risk:'R3',fit:1,src:'glide',
   note:'按月定额分散时点，越接近目标越要降低比重。',
   where:'持牌基金销售平台或券商 App，搜宽基指数（沪深 300、中证 A500、中证 500 这类），不指向任何单只产品',
   how:['选跟踪宽基指数的场外指数基金或 ETF 联接，比较管理费率和跟踪误差，别只看短期排名',
        '设置"定投"，按月自动扣款，金额就用上面算出来的那个数',
        '越接近目标日期，越要把这一层的比重往下滑，别在临门一脚时还满仓'],
   care:'定投只是分散买入时点，既不降低风险也不保证收益；这一层的钱要做好持有 3 年以上的准备。',
   fact:{fee:null,minBuy:null,redeem:'—',guarantee:false,source:null}},
  {key:'protect',tag:'保障层',name:'医疗险 / 意外险（按自身情况评估）',risk:'—',fit:0,src:'quadrant',
   note:'先兜住大额支出风险，再谈增值。',
   where:'保险公司官方渠道，或持牌保险经纪平台',
   how:['先确认医保 / 社保在缴且已生效，这是最便宜的那层',
        '顺序上先百万医疗险、再意外险，用小保费撬动大保额',
        '健康告知逐条如实回答，不要想着"先买了以后再说"'],
   care:'先保障后增值；不要把返还型、分红型当理财买；看清楚免赔额、续保条件和除外责任。',
   fact:{fee:null,minBuy:null,redeem:'—',guarantee:false,source:null}}
];

/* ---------- 输出校验器：AI 文本接入前必须过这三道闸（可靠性的最后防线） ----------
   目标：AI 只负责"解释"，不能产出任何它自己编的数字/产品/承诺。
   1. 禁止具体产品：六位基金代码、机构名、具体产品名，一律拦下。
   2. 禁止收益承诺："保本""稳赚""年化 X%""保证"这类，一律拦下。
   3. 数字只认引擎：AI 文本里出现的金额必须能对上引擎算出的值，否则留空，不采信。 */
const FORBIDDEN_INST=[/易方达|天弘|华夏|招商|工商|建设|农业|支付宝|理财通|天天基金/, /\d{6}/];
const FORBIDDEN_PROMISE=[/保本/,/稳赚/,/保证收益/,/年化\s*\d+/,/预期收益/,/历史收益/];
 // 暴露给测试
function verifyClaim(text,allowedNums){
  const s=String(text||'');
  const hitInst=FORBIDDEN_INST.some(r=>r.test(s));
  const hitPromise=FORBIDDEN_PROMISE.some(r=>r.test(s));
  const nums=[...s.matchAll(/¥?\s*([\d,]+(?:\.\d+)?)/g)].map(m=>Number(m[1].replace(/,/g,'')))
    .filter(n=>Number.isFinite(n)&&n>0);
  const foreign=nums.filter(n=>!(allowedNums||[]).includes(n));
  return {ok:!hitInst&&!hitPromise&&foreign.length===0, hitInst, hitPromise, foreign};
}

/* ---------- 留空语义：查不到 = null = 显示「待核实」，而不是编一个 ---------- */
function factText(t){
  const f=t.fact||{};
  const fee=f.fee!=null?`管理费约 ${f.fee}（${f.source?.org||'待核实'}）`:'费率：待核实';
  const min=f.minBuy!=null?`起购 ¥${yuan(f.minBuy)}`:'起购金额：待核实';
  return `${fee} · ${min}`;
}

/* ---------- 状态 ---------- */
let step='input';
let p={city:0,home:0,job:0,income:2,incomeNum:10000,rent:null,rentTouched:false,saved:0,place:'',
       rel:0,kids:[],extra:[],commute:1,risk:1,time:1,goal:80000,months:24,extraSave:0,leisure:null};
let result=null;

// 具体位置 → 城市档位（接入大模型后可换成真实地理编码，这里先用关键词匹配）
const PLACE=[
  ['南山',0],['福田',0],['罗湖',0],['宝安',1],['龙华',1],['龙岗',1],['光明',1],['坪山',1],['盐田',1],
  ['北京',0],['上海',0],['广州',0],['杭州',2],['成都',2],['武汉',2],['西安',2],['长沙',2],['南京',2],['苏州',2]
];
function placeToTier(text){
  const t=String(text||'').trim();if(!t)return null;
  for(const [k,v] of PLACE)if(t.includes(k))return v;
  return null;
}
const INCOME_STEPS=[4000,6000,8000,10000,12000,16000,20000];

/* ---------- 支出带推导 ---------- */
function rentDefault(profile=p){return Math.round(BASE.city[profile.city][1]*BASE.home[profile.home][1])}
function derive(profile=p){
  const p=profile;
  const city=BASE.city[p.city][0],rent=p.rent!=null&&p.rent!==''?Number(p.rent):rentDefault(p);
  const student=p.job===6&&p.home===3;
  const food=student?900:FOOD[city],daily=student?150:DAILY,traffic=BASE.commute[p.commute][1];
  const relAdd=BASE.rel[p.rel][1];
  const kidsAdd=(p.kids||[]).reduce((s,k)=>s+(KID_STAGE[k.stage]?KID_STAGE[k.stage][1][k.school]:0),0);
  const extraAmt=(p.extra||[]).reduce((s,e)=>s+(Number(e.amt)||0),0);
  const family=relAdd+kidsAdd+extraAmt;
  const leisure=p.leisure!=null&&p.leisure!==''?Math.max(0,Number(p.leisure)):LEISURE[city];
  const income=p.incomeNum!==''&&p.incomeNum!=null&&Number.isFinite(Number(p.incomeNum))?Number(p.incomeNum):BASE.income[p.income][1];
  const mid=rent+food+traffic+daily+family;
  // 刚性 = 合同/义务型支出（房租、学费、赡养费），不会因为"努力"而变少；
  // 弹性 = 餐饮、交通、日用，这才是超支真正发生的地方。
  if(p.expenseOverride!=null){
    const reported=Number(p.expenseOverride),rigid=rent+family,mid=Math.max(reported,rigid),flex=mid-rigid;
    return {rent,food:0,traffic:0,daily:flex,family,relAdd,kidsAdd,extraAmt,income,leisure:0,rigid,flex,lo:rigid+flex*.85,mid,hi:rigid+flex*1.25,budgetConflict:reported<rigid};
  }
  return {rent,food,traffic,daily,family,relAdd,kidsAdd,extraAmt,income,leisure,
    rigid:rent+family,flex:food+traffic+daily,
    lo:rent+family+(food+traffic+daily)*.85,mid:Math.round(mid),hi:rent+family+(food+traffic+daily)*1.25};
}

/* ---------- 蒙特卡洛 ---------- */
// 固定种子随机数（common random numbers）：同一组输入永远得到同一组结果，
// 否则"收入多 500 概率反而降"这种噪声会让用户不再相信这个数字。
let _s=1;
const srand=(seed)=>{_s=seed>>>0};
const rnd=()=>{_s=(_s+0x6D2B79F5)>>>0;let t=_s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296};
const gauss=()=>{let u=0,v=0;while(u===0)u=rnd();while(v===0)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
const SEED=20261017;
// 原型假设的年度收入断档率，未经真实样本校准
const LAYOFF=[0.08,0.04,0.05,0.09,0.01,0.12,0.06];
// 支出也会涨：房租随租约上调、餐饮随物价，按年化 3% 折算到月。
// 少了这一项，两年的模拟会把支出当成冻结的，结果必然偏乐观。
const INFL=0.03/12;

// v10: each path owns a stable stream, independent of the requested horizon.
// All routes use cash accumulation (zero investment returns), differing only in the savings effort.
// "达标" means the balance reaches the goal at least once by the deadline; terminal shortfall is separate.
function simulate(monthlySave,months,plan,goalOverride){
  const G=goalOverride??p.goal,band=derive(),inc=band.income;
  const student=p.job===6&&p.home===3;
  const fixedAllowance=p.job===6&&p.studentWork==='none';
  const vol=fixedAllowance?0:student?0.06:BASE.job[p.job][1],growth=fixedAllowance||student?0:BASE.job[p.job][2]/12;
  const gapP=(fixedAllowance?0:student?0.02:LAYOFF[p.job])/12,N=2000;
  let hit=0,terminalHit=0;const finals=[];
  for(let i=0;i<N;i++){
    srand((SEED+Math.imul(i+1,2654435761))>>>0);
    const persistenceDraw=gauss(),persist=fixedAllowance?1:Math.max(0.5,1+persistenceDraw*(student?0.04:0.11));
    let bal=Math.max(0,Number(p.saved)||0),gapLeft=0,reached=bal>=G;
    for(let m=0;m<months;m++){
      // Fixed draws per month keep prefixes identical for all levers and all deadlines.
      const incomeZ=gauss(),gapRoll=rnd(),gapDuration=rnd(),spendZ=gauss();
      const shockRoll=rnd(),shockSize=rnd(),slipRoll=rnd(),largeRoll=rnd(),largeSize=rnd();
      const trend=inc*persist*(1+growth*m);
      const income=gapLeft>0?trend*0.55:Math.max(0,trend*(1+incomeZ*vol/Math.sqrt(12)));
      if(gapLeft>0)gapLeft--;else if(gapRoll<gapP)gapLeft=2+Math.floor(gapDuration*3);
      const shock=shockRoll<0.06?(student?50+shockSize*150:150+shockSize*550):0;
      const spend=(band.rigid+Math.min(band.flex*1.25,Math.max(band.flex*.85*.95,band.flex*(1+spendZ*0.09)))+shock)*(1+INFL*m);
      const free=income-Math.max(band.rigid,spend+band.leisure-(Number(p.expenseReduction)||0));
      const slip=slipRoll<0.08?0.5:1;
      const save=free<0?free:Math.min(free,Math.max(0,monthlySave)*slip);
      // Rare extra costs happen in their own month, rather than being deducted at month zero.
      const large=largeRoll<0.12/24?(student?200+largeSize*800:2000+largeSize*8000):0;
      bal+=save-large;
      if(bal>=G)reached=true;
    }
    finals.push(bal);if(reached)hit++;if(bal>=G)terminalHit++;
  }
  finals.sort((a,b)=>a-b);
  return {prob:hit/N,terminalProb:terminalHit/N,hits:hit,paths:N,p50:finals[Math.floor(N*.5)]||0,p10:finals[Math.floor(N*.1)]||0};
}

/* ---------- 自然储蓄：不加额外自律时，人实际能存下多少 ---------- */
// 三条口径，全部可以摆到台面上：
//   1) 固定开销（房租/学费/赡养费）是合同型支出，不打折；
//   2) 只有弹性项（餐饮/交通/日用）会超支，按 12% 计提；
//   3) 非必要消费（社交/娱乐/购物）真实存在，按城市给一个默认值，用户可改。
// 原来的做法是对整个结余一刀切只算 65%，三重折损叠加，结果系统性偏悲观。
const FLEX_SLIP=0.12;
function naturalSave(d){
  const base=Math.max(0,d.income-Math.max(d.rigid,d.mid+d.leisure-(Number(p.expenseReduction)||0))-d.flex*FLEX_SLIP);
  const capacity=Math.max(0,d.income-Math.max(d.rigid,d.mid+d.leisure-(Number(p.expenseReduction)||0)));
  return Math.max(0,Math.min(capacity,Math.round((base+(Number(p.extraSave)||0))/50)*50));
}

/* ---------- 敏感度：下一步动哪个杠杆最有效（每个杠杆都能直接点） ---------- */
function sensitivity(nat){
  const base=nat.sim.prob,rows=[];
  const add=(label,prob,note,apply)=>rows.push({label,delta:Math.round((prob-base)*100),note,apply});
  add('每月多存 ¥500',simulate(nat.save+500,p.months,1).prob,`每月先存 ¥${yuan(nat.save+500)}`,
      ()=>{p.extraSave=(Number(p.extraSave)||0)+500});
  const g2=Math.max(.01,Math.round(p.goal*.85*100)/100);
  if(g2<p.goal)add(`目标降到 ¥${yuan(g2)}`,simulate(nat.save,p.months,1,g2).prob,`少攒 ¥${yuan(p.goal-g2)}`,
      ()=>{p.goal=g2});
  add('多给 6 个月',simulate(nat.save,Math.min(360,p.months+6),1).prob,`总共 ${p.months+6} 个月`,
      ()=>{p.months=Math.min(360,p.months+6)});
  return rows.sort((a,b)=>b.delta-a.delta);
}

function buildPlans(){
  const d=derive(),free=Math.max(0,d.income-Math.max(d.rigid,d.mid+d.leisure-(Number(p.expenseReduction)||0)));
  const ns=naturalSave(d);
  const natSim=simulate(ns,p.months,1);
  const names=['冲刺','均衡','宽松'],shares=[1,.8,.6];
  // Protect the full baseline living budget. Never finance a route by silently spending the food budget.
  const capacity=Math.max(0,d.income-Math.max(d.rigid,d.mid+d.leisure-(Number(p.expenseReduction)||0)));
  const plans=shares.map((share,i)=>{
    const save=(Number(p.saved)||0)>=p.goal?0:Math.min(capacity,Math.floor(capacity*share/10)*10+(Number(p.extraSave)||0)),sim=simulate(save,p.months,0);
    const cap=Math.max(0,capacity-save);
    return {id:i,name:names[i],save,prob:sim.prob,terminalProb:sim.terminalProb,p50:sim.p50,p10:sim.p10,
      short:save<Math.max(0,p.goal-(Number(p.saved)||0))/p.months,
      freeCap:cap,entertain:d.leisure,dailyCap:Math.round(cap/DAYS_PER_MONTH),riskLevel:0,
      products:PRODUCTS.filter(t=>t.key!=='growth'),share};
  });
  const natural={save:ns,sim:natSim};
  // Unused crossover sweeps removed: the three visible levers are computed below.
  let advice=null;
  if(free<=0) advice={type:'neg',gap:Math.max(0,Math.round((d.mid+d.leisure-d.income)/100)*100)};
  else if(natSim.prob<0.35){
    const monthsNeeded=Math.ceil(p.months*(p.goal/Math.max(1,natSim.p50)));
    advice={type:'low',reachable:Math.max(0,Math.floor(natSim.p50/100)*100),monthsNeeded:Math.min(360,monthsNeeded)};
  } else if(natSim.prob<0.6) advice={type:'tight',gap:Math.round(Math.max(0,p.goal-natSim.p50)/1000)*1000};
  return {plans,free:capacity,band:d,natural,advice,sens:sensitivity(natural),startingCovered:(Number(p.saved)||0)>=p.goal,identicalRoutes:plans.every(x=>x.save===plans[0].save),sameRoundedProb:plans.every(x=>Math.round(x.prob*100)===Math.round(plans[0].prob*100))};
}

/* ---------- 钱怎么分：给出每层的具体金额，而不是只给一个类别 ---------- */
function allocate(x,d){
  const monthly=Math.max(0,x.save);
  const monthsKeep=(p.kids&&p.kids.length>0)?6:4;            // 有小孩按 6 个月必要支出，其余 4 个月
  const emergency=Math.round(d.mid*monthsKeep);
  const have=Math.max(0,Number(p.saved)||0);
  const gap=Math.max(0,emergency-have);
  // 应急垫没补满之前，新增储蓄优先填它，最多占四成
  const fill=gap>0?Math.min(monthly,Math.max(50,Math.ceil(gap/Math.max(1,p.months)/50)*50)):0;
  const rest=Math.max(0,monthly-fill);
  const allowG=x.products.some(t=>t.key==='growth');
  const eq=allowG?(x.riskLevel===2?0.5:0.3):0;
  const growth=Math.round(rest*eq/50)*50;
  const stable=Math.max(0,rest-growth);
  const protect=Math.round((d.income*0.01)/10)*10;        // 保障层按收入的 1% 量级估，只兜底
  return {monthsKeep,emergency,have,gap,fill,stable,growth,protect,monthly,spare:Math.max(0,have-emergency)};
}
function amtText(a,key){
  if(key==='cash')return a.fill>0?`¥${yuan(a.fill)} / 月 · 先攒到 ¥${yuan(a.emergency)}（${a.monthsKeep} 个月必要支出）`
    :(a.gap>0?`应急垫还差 ¥${yuan(a.gap)}，优先补满`:`已满额 ¥${yuan(a.emergency)}，这层不用再加`);
  if(key==='protect')return a.protect>0?`约 ¥${yuan(a.protect)} / 月（≈ 月收入 1%）`:'先确认医保已生效';
  const v=key==='stable'?a.stable:a.growth;
  return v>0?`¥${yuan(v)} / 月`:'这一层暂时不放钱';
}

/* ---------- 预算：固定开销逐项列出，摊到周和日，并划红线 ---------- */
const WEEKS_PER_MONTH=4.33,DAYS_PER_MONTH=30.4;
function fixedItems(d){
  const rows=[
    {name:'房租',amt:d.rent,note:'合同刚性'},
    {name:'餐饮',amt:d.food,note:'可压缩'},
    {name:'通勤交通',amt:d.traffic,note:'可压缩'},
    {name:'日用杂项',amt:d.daily,note:'可压缩'}
  ];
  if(d.relAdd>0)rows.push({name:'关系 / 婚姻储备',amt:d.relAdd,note:BASE.rel[p.rel][0]});
  if(d.kidsAdd>0)rows.push({name:'孩子（学费已含）',amt:d.kidsAdd,note:`${(p.kids||[]).length} 个`});
  (p.extra||[]).forEach(e=>{const v=Number(e.amt)||0;if(v>0)rows.push({name:e.name||'其他固定支出',amt:v,note:'你填的'})});
  return rows;
}
function budget(x,d){
  const items=fixedItems(d);
  const fixedTotal=items.reduce((s,i)=>s+i.amt,0);
  const save=Math.max(0,x.save),free=Math.max(0,x.freeCap);
  const weekly=free/WEEKS_PER_MONTH,daily=free/DAYS_PER_MONTH;
  return {items,fixedTotal,surplus:d.income-fixedTotal,
    perDayFixed:fixedTotal/DAYS_PER_MONTH,
    save,free,weekly,daily,
    redWeek:weekly*1.15,          // 周内花超这个数就停手
    redDay:daily*1.3,             // 当日上限，超过当天停止非必要消费
    flexDaily:d.flex/DAYS_PER_MONTH,
    rigidShare:d.rigid/Math.max(1,d.income)};
}

/* ---------- 打卡 ---------- */
let checkins=[];
function weeksOf(months){return Math.max(4,Math.round(months*4.33));}


// Cache pure results for identical inputs; always restore p before using legacy simulate().
const calculationCache=new Map();
export function calculate(profile){
 p={city:2,home:0,job:6,commute:1,rel:0,risk:0,time:0,income:2,incomeNum:10000,rent:null,saved:0,kids:[],extra:[],leisure:null,expenseOverride:null,expenseReduction:0,extraSave:0,goal:80000,months:24,...profile};
 const key=JSON.stringify(p),cached=calculationCache.get(key);if(cached){calculationCache.delete(key);calculationCache.set(key,cached);return cached;}
 const result=buildPlans();calculationCache.set(key,result);if(calculationCache.size>24)calculationCache.delete(calculationCache.keys().next().value);return result;
}

export {derive,simulate,verifyClaim,BASE,allocate,budget};
