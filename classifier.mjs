let state={catRules:[]}; const CAT_NAME={food:"饮食",transit:"通勤",social:"社交娱乐",subs:"数字订阅",shop:"购物",life:"生活服务",person:"人情转账",unk:"待确认",other:"其他"};
var LEX={
  food:{s:['外卖','餐饮','餐厅','饭店','食堂','快餐','小吃','烧烤','火锅','烤肉','自助','奶茶','咖啡','面包','蛋糕','甜品','早餐','午餐','晚餐','夜宵','麻辣烫','炒饭','盖饭','拌饭','便当','拉面','米线','汉堡','炸鸡','寿司','包子','饺子','烤串','小串','串串','面筋','泡菜卷','荷叶饭','菜市场','生鲜','熟食','零食','食品','水果','打拋饭','油边','饭团','麻辣香锅','黄焖鸡','螺蛳粉','酸辣粉',
        '肯德基','麦当劳','塔斯汀','华莱士','德克士','必胜客','汉堡王','蜜雪冰城','喜茶','奈雪','茶百道','古茗','沪上阿姨','霸王茶姬','茶颜悦色','CoCo','coco','益禾堂','甜啦啦','幸运咖','库迪','瑞幸','luckin','星巴克','Manner','老乡鸡','乡村基','海底捞','沙县','兰州拉面','绝味','周黑鸭','紫燕百味鸡','盒马','叮咚','朴朴','每日优鲜','大润发','沃尔玛','永辉','罗森','全家','美宜佳','便利蜂'],
        w:['饭','面','粉','菜','茶','餐','肉','粥','饼','汤','串','烤冷面','煎饼','手抓饼','炸串','铁板','臭豆腐','凉皮','肉夹馍']},
  transit:{s:['地铁','公交','滴滴','打车','出租车','高铁','火车','机票','航班','12306','共享单车','哈啰','青桔','美团单车','电单车','骑行','加油','停车','ETC','乘车码','出行','网约车','客运','车票','车费','车站','轻轨','有轨电车','星辰智行','智行','松果','美团骑行'],
        w:['行程','快车','专车','顺风车','钱包']},
  social:{s:['电影','影院','KTV','ktv','剧本杀','密室','探案','桌游','酒吧','演出','演唱会','景区','景点','旅游','民宿','酒店','健身房','按摩','游戏','点卡','直播','打赏','聚餐','请客','生日','礼物','红包','份子','团建','聚会','娃娃','网吧','台球','游泳','滑雪','露营','夜之幕'],
        w:['团建','聚会','门票','票','娱乐']},
  subs:{s:['连续包月','自动续费','自动续订','会员','VIP','vip','绿钻','黄金会员','大会员','订阅','续订','包月','月卡','年卡','PLUS','plus','网盘','Apple服务','App Store','云服务','腾讯云','阿里云','爱奇艺','腾讯视频','优酷','芒果','网易云','QQ音乐','Spotify','Steam','联通','中国移动','中国电信','话费','流量包','手机充值','交费'],
        w:['充值','续费','会员']},
  shop:{s:['拼多多','淘宝','天猫','京东','唯品会','得物','闲鱼','苏宁','银泰','商场','数码','电器','服装','优衣库','名创优品','屈臣氏','小米','华为','苹果','宜家','代购','海淘','电商','商城','网购','百货','便利店','超市','文具','书店','旗舰店','专营店','服饰','鞋','箱包','家居','日用','自行车','电动车','vivo','OPPO','oppo','荣耀','realme','联想','戴尔','按摩仪','耳机','充电宝','数码配件','7ELEVEN','7-ELEVEn','7-11','车行','单车世界','捷安特','喜德盛','美利达'],
        w:['订单','购物车','自营','下单','便利店']},
  life:{s:['理发','美发','造型','美容','美甲','洗衣','干洗','快递','邮寄','打印','文印','印务','图文','快印','维修','物业','水电','燃气','暖气','宽带','网费','房租','房贷','电费','水费','燃气费','国家电网','南方电网','自来水','物业','保洁','搬家','医院','药房','药店','诊所','体检','挂号','牙科','门诊','校园卡','一卡通','学费','教材','培训','考试','吹风机','共享'],
        w:['快递','打印','充值','医药','复印']}
};
/* 原始分类（支付宝「交易分类」/ 微信「交易类型」）→ 类别先验分 */
var RAW_MAP=[
  [/餐饮美食|餐饮/,['food',3]],[/交通出行|出行/,['transit',3]],[/购物|服饰装扮/,['shop',2.5]],
  [/文化休闲|休闲娱乐/,['social',3]],[/生活服务|医疗健康/,['life',2.5]],[/教育学习/,['life',2]],
  [/充值提现/,['subs',1.5]],[/转账红包|转账|群收款|红包/,['social',1]],[/投资理财|理财/,['other',1]]
];
var FIELD_W={merchant:1,desc:0.8,note:0.5};
function lexHits(text,field){
  var out=[];
  if(!text) return out;
  Object.keys(LEX).forEach(function(cat){
    var cfg=LEX[cat];
    cfg.s.forEach(function(k){ if(text.indexOf(k)>=0) out.push({cat:cat,kw:k,w:3*FIELD_W[field]}); });
    cfg.w.forEach(function(k){ if(text.indexOf(k)>=0) out.push({cat:cat,kw:k,w:1*FIELD_W[field]}); });
  });
  return out;
}
/* 商品说明里常有单号/数字，做归一化后用于「同类商品」规则匹配 */
function goodsKey(s){
  return String(s||'').replace(/\d{6,}/g,'').replace(/[0-9a-fA-F]{12,}/g,'').replace(/[\s\-_()（）:：,，.。/*]/g,'').slice(0,24);
}
function catRuleFor(tx){
  var list=state.catRules||[];
  for(var i=0;i<list.length;i++){
    var r=list[i];
    if(r.scope==='merchant' && r.merchant===tx.merchant) return r;
    if(r.scope==='goods' && r.merchant===tx.merchant && goodsKey(tx.desc).indexOf(r.goods)>=0) return r;
  }
  return null;
}
function classify(tx){
  var rule=catRuleFor(tx);
  if(rule) return {cat:rule.cat,why:'你之前把「'+rule.merchant+'」'+(rule.scope==='merchant'?'（全部）':'的这类商品')+'标为「'+CAT_NAME[rule.cat]+'」',src:'rule'};
  var scores={}, why={};
  function add(cat,w,label){
    scores[cat]=(scores[cat]||0)+w;
    if(!why[cat]) why[cat]=[];
    if(label) why[cat].push(label);
  }
  /* 1 原始分类：支付宝的「交易分类」可信度高，微信「交易类型」只作弱先验 */
  var raw=String(tx.rawCat||'')+' '+String(tx.rawType||'');
  if(tx.rawCat){
    for(var i=0;i<RAW_MAP.length;i++){
      if(RAW_MAP[i][0].test(tx.rawCat)){
        var isAli=/餐饮|出行|购物|休闲|服务|健康|学习|提现|红包|理财/.test(tx.rawCat);
        add(RAW_MAP[i][1][0], isAli?RAW_MAP[i][1][1]:Math.min(1,RAW_MAP[i][1][1]/2), '原始分类「'+tx.rawCat+'」');
        break;
      }
    }
  }
  if(tx.rawType && !tx.rawCat){
    for(var j=0;j<RAW_MAP.length;j++){
      if(RAW_MAP[j][0].test(tx.rawType)){ add(RAW_MAP[j][1][0],1,'交易类型「'+tx.rawType+'」'); break; }
    }
  }
  /* 2 商户名 / 商品说明 / 备注 */
  [['merchant',tx.merchant],['desc',tx.desc],['note',tx.note]].forEach(function(p){
    lexHits(p[1],p[0]).forEach(function(h){
      add(h.cat,h.w,(p[0]==='merchant'?'商户':p[0]==='desc'?'商品':'备注')+'含「'+h.kw+'」');
    });
  });
  /* 3 转账给个人：只有当商品说明里没说出用途时才归「人情转账」
     —— 房租 / AA聚餐 这类有明确用途的，按用途走 */
  var lexBest=0;
  Object.keys(scores).forEach(function(k){ if(scores[k]>lexBest) lexBest=scores[k]; });
  if(lexBest<2 && /转账|群收款|红包/.test(String(tx.rawType||'')) &&
     !/有限公司|股份|有限|店|馆|城|超市|商场|商户|科技|中心|医院|大学|平台|电商|出行|数码|控股/.test(String(tx.merchant||''))){
    add('person',3,'交易类型「'+tx.rawType+'」，收款方像个人不像商户');
  }
  var best=null,second=null;
  Object.keys(scores).forEach(function(k){
    if(!best||scores[k]>scores[best]){ second=best; best=k; }
    else if(!second||scores[k]>scores[second]){ second=k; }
  });
  if(!best || scores[best]<2){
    var hint='';
    if(/转账|红包|群收款/.test(String(tx.rawType||''))) hint='收款方是个人（交易类型：'+tx.rawType+'），账单里没写用途';
    else if(!tx.desc) hint='账单里没有商品说明，只有商户名';
    else hint='「'+String(tx.merchant).slice(0,12)+'」不在已知词典里，线索不足';
    return {cat:'unk',why:hint+'，不猜',src:'none'};
  }
  if(second && scores[best]-scores[second]<0.5)
    return {cat:'unk',why:'线索冲突：「'+CAT_NAME[best]+'」与「'+CAT_NAME[second]+'」都说得通，等你确认',src:'conflict'};
  return {cat:best,why:why[best].slice(0,2).join(' + '),src:'lex'};
}

export {classify,CAT_NAME};export function setRules(r){state.catRules=r;}