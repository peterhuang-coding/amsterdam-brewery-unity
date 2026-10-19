"""Loopback-only parent harness: exact raw bytes and browser-decoded HTTP gzip."""
import argparse,functools,http.server,pathlib,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--code',type=pathlib.Path,required=True);p.add_argument('--assets',type=pathlib.Path,required=True);p.add_argument('--port',type=int,default=18865);a=p.parse_args()
roots={'code':a.code.resolve(),'raw':a.assets.resolve(),'encoded':a.assets.resolve()}
html=b'''<!doctype html><meta charset="utf-8"><title>D27 independent runtime acceptance</title><style>body{font:16px system-ui;margin:16px;background:#f5eee2}canvas{display:block;border:1px solid #aaa;width:1100px;height:640px}</style><h1>Independent full-data runtime acceptance</h1><canvas></canvas><pre id="result"></pre><script src="/code/tools/geo/navigation/geo-navigation.js"></script><script src="/code/tools/geo/renderer/geo-map-renderer.js"></script><script src="/code/tools/geo/runtime/geo-runtime.js"></script>'''
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  u=urllib.parse.urlsplit(self.path);path=urllib.parse.unquote(u.path)
  if path=='/parent.html':body=html;mime='text/html; charset=utf-8';encoding=None
  else:
   bits=path.strip('/').split('/',1)
   if len(bits)!=2 or bits[0] not in roots:self.send_error(404);return
   mode,rel=bits;root=roots[mode];file=(root/rel).resolve()
   if not file.is_relative_to(root) or not file.is_file():self.send_error(404);return
   body=file.read_bytes();encoding='gzip' if mode=='encoded' and file.suffix=='.gz' else None
   mime='application/javascript' if file.suffix=='.js' else 'application/json' if file.suffix=='.json' else 'application/octet-stream'
   if urllib.parse.parse_qs(u.query).get('corrupt')==['1'] and body:body=bytes([body[0]^1])+body[1:]
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
  if encoding:self.send_header('Content-Encoding',encoding)
  self.end_headers();self.wfile.write(body)
 def log_message(self,fmt,*args):print(self.log_date_time_string(),fmt%args,flush=True)
print({'port':a.port,'code':str(a.code),'assets':str(a.assets)},flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
