const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');let p=u.pathname;
if(p.startsWith('/encoded-sample')){p='/sample/sample-runtime.json.gz';res.setHeader('Content-Encoding','gzip');}
if(p.startsWith('/encoded-full')){p='/full/runtime.json.gz';res.setHeader('Content-Encoding','gzip');}
const f=path.join(root,p);if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',p.endsWith('.html')?'text/html;charset=utf-8':p.endsWith('.js')?'text/javascript':p.endsWith('.gz')?'application/gzip':'application/json');
fs.stat(f,(err,s)=>{if(err||!s.isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Length',s.size);let z=fs.createReadStream(f);z.on('error',()=>res.destroy());res.on('close',()=>z.destroy());z.pipe(res);});});
server.listen(18863,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,root,port:18863})));