import {readFileSync} from 'node:fs';
// 版本号从 server.mjs 读取，避免每次发版都要改测试里的硬编码字符串。
export function serverVersion(){
 const src=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
 const m=src.match(/version:\s*'([^']+)'/);
 if(!m)throw Error('无法从 server.mjs 读取版本号');
 return m[1];
}
