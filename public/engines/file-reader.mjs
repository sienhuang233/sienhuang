function decodeText(bytes){
  var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var out='';
  try{ out = new TextDecoder('utf-8').decode(u8); }
  catch(e){ out=''; }
  var broken = !out || (out.match(/\uFFFD/g)||[]).length > 1;
  if(broken){
    // 回退中文常见编码：gb18030 覆盖 gbk / gb2312
    ['gb18030','gbk','big5'].forEach(function(enc){
      if(broken){
        try{
          var s=new TextDecoder(enc).decode(u8);
          if(s && (s.match(/\uFFFD/g)||[]).length===0){ out=s; broken=false; }
        }catch(e){}
      }
    });
  }
  if(!out){
    try{ out=String.fromCharCode.apply(null,u8.subarray(0,Math.min(u8.length,200000))); }catch(e){ out=''; }
  }
  return out.replace(/^\uFEFF/,'');
}

/* ========== 极简 ZIP 读取（xlsx 本质是一个 zip） ========== */
function readZip(bytes){
  var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var len = u8.length, eocd=-1;
  for(var i=len-22; i>=0 && i>=len-22-65535; i--){
    if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; }
  }
  if(eocd<0) throw new Error('不是有效的 zip / xlsx 文件');
  var count = dv.getUint16(eocd+10,true);
  var cdOff = dv.getUint32(eocd+16,true);
  if(count>1000) throw new Error("压缩包文件过多");
  var expanded=0;
  var names=[], map={}, p=cdOff;
  for(var n=0; n<count; n++){
    if(p+46>len || dv.getUint32(p,true)!==0x02014b50) break;
    var nlen=dv.getUint16(p+28,true), elen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true);
    var usize=dv.getUint32(p+24,true); expanded+=usize;
    if(expanded>20*1024*1024 || usize>10*1024*1024 || (dv.getUint16(p+8,true)&1)) throw new Error("加密或解压后过大的ZIP不支持");
    var csize=dv.getUint32(p+20,true);
    var lho=dv.getUint32(p+42,true);
    var name='';
    try{ name=new TextDecoder('utf-8').decode(u8.subarray(p+46,p+46+nlen)); }catch(e){ name=''; }
    if(!map[name]) names.push(name);
    map[name]={method:dv.getUint16(p+10,true), csize:csize, lho:lho};
    p += 46+nlen+elen+clen;
  }
  return {
    names:names,
    has:function(n){ return !!map[n]; },
    find:function(re){ for(var i=0;i<names.length;i++){ if(re.test(names[i])) return names[i]; } return null; },
    read:function(n){
      var e=map[n];
      if(!e) return Promise.reject(new Error('缺少 '+n));
      var lho=e.lho;
      var lnlen=dv.getUint16(lho+26,true), lelen=dv.getUint16(lho+28,true);
      var start=lho+30+lnlen+lelen;
      var raw=u8.subarray(start, Math.min(start+e.csize, len));
      if(e.method===0) return Promise.resolve(raw);
      if(e.method===8) return inflateRaw(raw);
      return Promise.reject(new Error('不支持的压缩方式'));
    }
  };
}

/* ========== 解压：优先用浏览器原生 DecompressionStream，没有则用内置实现 ========== */
function inflateRaw(u8){
  if(typeof DecompressionStream!=='undefined'){
    try{
      var ds=new DecompressionStream('deflate-raw');
      var w=ds.writable.getWriter();
      var r=ds.readable.getReader();
      var chunks=[], decodedLength=0;
      w.write(u8); w.close();
      return (function pump(){
        return r.read().then(function(res){
          if(res.done){
            var total=0; chunks.forEach(function(c){ total+=c.length; });
            var out=new Uint8Array(total), o=0;
            chunks.forEach(function(c){ out.set(c,o); o+=c.length; });
            return out;
          }
          decodedLength+=res.value.length;if(decodedLength>10*1024*1024){r.cancel();throw new Error("解压数据超过10MB");}
          chunks.push(new Uint8Array(res.value));
          return pump();
        });
      })();
    }catch(e){ /* 退回内置实现 */ }
  }
  try{ return Promise.resolve(inflateJS(u8)); }
  catch(e){ return Promise.reject(e); }
}
function inflateJS(data){
  var pos=0, bb=0, bc=0, out=new Uint8Array(Math.max(1024, data.length*4)), olen=0;
  function push(b){
    if(olen>=10*1024*1024)throw new Error("解压数据超过10MB");
    if(olen>=out.length){ var n=new Uint8Array(out.length*2); n.set(out); out=n; }
    out[olen++]=b;
  }
  function bits(n){
    while(bc<n){ if(pos>=data.length)throw new Error("压缩数据不完整"); bb |= data[pos++]<<bc; bc+=8; }
    var v = bb & ((1<<n)-1);
    bb >>>= n; bc -= n;
    return v;
  }
  function huff(lengths){
    var maxLen=0, i;
    for(i=0;i<lengths.length;i++) if(lengths[i]>maxLen) maxLen=lengths[i];
    var count=[], symbols=[], b;
    for(b=0;b<=maxLen;b++) count[b]=0;
    for(i=0;i<lengths.length;i++) count[lengths[i]]++;
    count[0]=0;
    var offs=[]; offs[1]=0;
    for(b=1;b<maxLen;b++) offs[b+1]=offs[b]+count[b];
    for(i=0;i<lengths.length;i++) if(lengths[i]) symbols[offs[lengths[i]]++]=i;
    return {count:count, symbols:symbols, maxLen:maxLen};
  }
  function sym(h){
    var code=0, first=0, index=0, len, c;
    for(len=1; len<=15; len++){
      code |= bits(1);
      c = h.count[len]||0;
      if(code - first < c) return h.symbols[index + (code - first)];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw new Error('压缩数据损坏');
  }
  var LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  var LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  var DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  var last;
  do{
    last = bits(1);
    var type = bits(2);
    if(type===0){
      if(bc>0){ bb=0; bc=0; }
      var ln = data[pos] | (data[pos+1]<<8); pos+=4;
      for(var k=0;k<ln;k++) push(data[pos+k]);
      pos+=ln;
    }else if(type===1||type===2){
      var lit, dist;
      if(type===1){
        var l1=[]; for(var i=0;i<288;i++) l1[i] = i<144?8 : i<256?9 : i<280?7 : 8;
        lit=huff(l1);
        var d1=[]; for(var j=0;j<30;j++) d1[j]=5;
        dist=huff(d1);
      }else{
        var hlit=bits(5)+257, hdist=bits(5)+1, hclen=bits(4)+4;
        var order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
        var cl=[]; for(var q=0;q<19;q++) cl[q]=0;
        for(var q2=0;q2<hclen;q2++) cl[order[q2]]=bits(3);
        var clh=huff(cl);
        var lens=[], n2=0;
        while(n2 < hlit+hdist){
          var s=sym(clh), rep, val;
          if(s<16){ lens[n2++]=s; }
          else if(s===16){ rep=3+bits(2); val=lens[n2-1]; while(rep--) lens[n2++]=val; }
          else if(s===17){ rep=3+bits(3); while(rep--) lens[n2++]=0; }
          else { rep=11+bits(7); while(rep--) lens[n2++]=0; }
        }
        lit=huff(lens.slice(0,hlit));
        dist=huff(lens.slice(hlit));
      }
      for(;;){
        var cs=sym(lit);
        if(cs===256) break;
        if(cs<256){ push(cs); }
        else{
          cs-=257;
          if(cs>=29) throw new Error('压缩数据损坏');
          var length = LB[cs] + bits(LE[cs]);
          var ds2 = sym(dist);
          var distance = DB[ds2] + bits(DE[ds2]);
          for(var m=0;m<length;m++) push(out[olen-distance]);
        }
      }
    }else throw new Error('压缩数据损坏');
  }while(!last);
  return out.subarray(0,olen);
}
function u8str(u8){
  try{ return new TextDecoder('utf-8').decode(u8); }
  catch(e){
    var s='', chunk=8000;
    for(var i=0;i<u8.length;i+=chunk) s+=String.fromCharCode.apply(null,u8.subarray(i,i+chunk));
    return s;
  }
}

/* ========== xlsx → 二维数组 ========== */
function colNum(ref){
  var m=String(ref||'').match(/^([A-Z]+)/);
  if(!m) return -1;
  var s=m[1], n=0;
  for(var i=0;i<s.length;i++) n=n*26+(s.charCodeAt(i)-64);
  return n-1;
}
function sheetToRows(xml, shared){
  var rows=[], rowRe=/<row\b[^>]*>([\s\S]*?)<\/row>/g, rm;
  while((rm=rowRe.exec(xml))){
    var body=rm[1], cells=[], ci=0;
    var cellRe=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
    while((cm=cellRe.exec(body))){
      var attrs=cm[1]||'', inner=cm[2]||'';
      var ri=colNum((attrs.match(/r="([A-Z]+\d+)"/)||[])[1]);
      if(ri>=0) ci=ri;
      var t=(attrs.match(/t="([^"]+)"/)||[])[1]||'';
      var v='';
      if(t==='s'){
        var si=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        v = shared[parseInt(si,10)] || '';
      }else if(t==='inlineStr'){
        var parts=inner.match(/<t[^>]*>([\s\S]*?)<\/t>/g)||[];
        v = parts.map(function(p){ return p.replace(/<[^>]+>/g,''); }).join('');
      }else{
        var vv=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        v = vv===undefined?'':String(vv);
      }
      cells[ci]=unescXML(v).trim();
      ci++;
    }
    rows.push(cells);
  }
  return rows;
}
function unescXML(s){
  return String(s).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):'�';}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}
function parseXlsx(bytes){
  var z=readZip(bytes);
  var p1 = z.has('xl/workbook.xml') ? z.read('xl/workbook.xml') : null;
  var p2 = z.has('xl/_rels/workbook.xml.rels') ? z.read('xl/_rels/workbook.xml.rels') : null;
  return Promise.all([p1,p2]).then(function(res){
    var wbXml = res[0]?u8str(res[0]):'', relXml = res[1]?u8str(res[1]):'', sheetPath=null;
    if(wbXml){
      var sm = wbXml.match(/<sheet\b[^>]*>/g)||[];
      var rid = (sm[0]||'').match(/r:id="([^"]+)"/) ? sm[0].match(/r:id="([^"]+)"/)[1] : null;
      if(rid && relXml){
        var relRe=/<Relationship\b[^>]*>/g, r;
        while((r=relRe.exec(relXml))){
          if(r[0].indexOf('Id="'+rid+'"')>=0){
            var target=(r[0].match(/Target="([^"]+)"/)||[])[1];
            if(target){
              sheetPath = target.charAt(0)==='/' ? target.slice(1)
                        : 'xl/'+target.replace(/^\.?\//,'');
              break;
            }
          }
        }
      }
    }
    if(!sheetPath) sheetPath = z.find(/^xl\/worksheets\/sheet1\.xml$/) || z.find(/^xl\/worksheets\/.*\.xml$/);
    if(!sheetPath) throw new Error('这个 xlsx 里没有找到工作表');
    var pShared = z.has('xl/sharedStrings.xml') ? z.read('xl/sharedStrings.xml') : null;
    return Promise.all([z.read(sheetPath), pShared]);
  }).then(function(r2){
    var shared=[];
    if(r2[1]){
      var sx=u8str(r2[1]);
      var siRe=/<si>([\s\S]*?)<\/si>/g, m;
      while((m=siRe.exec(sx))){
        var ts=m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g)||[];
        shared.push(ts.map(function(p){ return p.replace(/<[^>]+>/g,''); }).join(''));
      }
    }
    return sheetToRows(u8str(r2[0]), shared);
  });
}


export {decodeText,readZip,parseXlsx};
