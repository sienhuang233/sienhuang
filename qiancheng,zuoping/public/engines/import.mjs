import {decodeText,readZip,parseXlsx} from './file-reader.mjs';
export function csvRows(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell.trim());if(row.some(Boolean))rows.push(row);if(quoted)throw Error('CSV引号未闭合');return rows;}
export function normalize(rows){
 const hi=rows.findIndex(r=>r.some(c=>/交易时间|交易日期|交易创建时间/.test(String(c))));if(hi<0)throw Error('缺少交易时间表头');
 const h=rows[hi].map(String),idx=keys=>h.findIndex(c=>keys.some(k=>c.includes(k))),ti=idx(['交易时间','交易日期','交易创建时间']),ai=idx(['金额']),di=idx(['收/支','收支','资金流向']),ni=idx(['交易对方','商户']),desc=idx(['商品','说明']),status=idx(['当前状态','交易状态']),id=idx(['交易单号','交易订单号','交易号']),rt=idx(['交易类型']),rc=idx(['交易分类']),note=idx(['备注']);
 if(ai<0||di<0)throw Error('必须有金额、收/支列，缺失方向不可自动猜测');let out=[],rejected=[],skipped=0,occ=new Map();
 for(let i=hi+1;i<rows.length;i++){
  const r=rows[i];if(!r||!r[ai])continue;if(status>=0&&/关闭|失败|撤销|未支付|等待/.test(r[status])){skipped++;continue;}
  let d=String(r[ti]||'').trim();if(/^\d{5}(\.\d+)?$/.test(d)){d=new Date(Date.UTC(1899,11,30)+Math.round(Number(d)*86400000)).toISOString().replace('T',' ');}
  const m=d.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/),direction=String(r[di]||'').trim();
  if(!m){if(r[ai])rejected.push(i+1);continue;}let dir=/收入|转入/.test(direction)?'in':/支出|转出/.test(direction)?'out':/中性|不计|^\/$|^-$/.test(direction)?'neutral':null;
  if(!dir){rejected.push(i+1);continue;}
  const amount=String(r[ai]).replace(/[¥￥,，\s元]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){rejected.push(i+1);continue;}
  const v={date:`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`,time:[m[4]||'00',m[5]||'00',m[6]||'00'].map(x=>x.padStart(2,'0')).join(':'),merchant:String(r[ni]||'未知商户'),desc:String(r[desc]||''),amount,direction:dir,externalId:String(r[id]||'').replace(/^['\t]/,''),rawType:String(r[rt]||''),rawCat:String(r[rc]||''),note:String(r[note]||'')};
  const key=JSON.stringify(v),n=occ.get(key)||0;occ.set(key,n+1);v.occurrence=n;out.push(v);
 }
 if(rejected.length)throw Error(`第 ${rejected.slice(0,8).join('、')} 行日期、金额或收支方向不明确，请修正后再导入；没有写入任何流水。`);
 if(!out.length)throw Error('未发现有效交易');return {rows:out,skipped};
}
export async function readStatement(file){
 if(file.size>5*1024*1024)throw Error('单文件限5MB');if(/\.xls$/i.test(file.name))throw Error('请将旧版.xls另存为.xlsx或CSV');let bytes=new Uint8Array(await file.arrayBuffer()),rows;
 if(/\.xlsx$/i.test(file.name))rows=await parseXlsx(bytes);
 else if(/\.zip$/i.test(file.name)){
  const z=readZip(bytes),files=z.names.filter(n=>/\.(csv|txt|xlsx)$/i.test(n));if(files.length!==1)throw Error('压缩包须恰好包含一份账单；请解压后逐份导入');const b=await z.read(files[0]);rows=/xlsx$/i.test(files[0])?await parseXlsx(b):csvRows(decodeText(b));
 }else if(/\.(csv|txt)$/i.test(file.name))rows=csvRows(decodeText(bytes));else throw Error('支持CSV、TXT、XLSX或未加密ZIP');
 return normalize(rows);
}
