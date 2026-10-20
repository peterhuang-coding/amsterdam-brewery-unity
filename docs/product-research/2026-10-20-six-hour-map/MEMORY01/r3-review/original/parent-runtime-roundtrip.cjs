// Parent regression: the public pack/load boundary must preserve IEEE-754 values.
// This deliberately knows no coordinate storage implementation details.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const root = path.resolve(process.argv[2] || '.');
const multi = process.argv[3] === 'multichunk';
const runtime = require(path.join(root, 'tools/geo/runtime/geo-runtime.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd27-runtime-number-test-'));
(async () => {
  let server;
  try {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'tools/geo/navigation/real-pub-sample.json')));
    const template = source.layers.roads[0];
    source.layers = {water: [], buildings: [], roads: [{...template,
      id: 'synthetic-signed-zero', sourceId: 'synthetic', localId: 'signed-zero',
      properties: {functie: 'voetpad'}, bounds: ['NEGATIVE_ZERO',0,10,10],
      polygons: [[[['NEGATIVE_ZERO',0],[10,0],[10,10],[0,10],['NEGATIVE_ZERO',0]]]]
    }], bridges: []};
    if(multi) source.layers.roads=Array.from({length:8},(_,i)=>({...template,
      id:'synthetic-chunk-'+i,sourceId:'synthetic',localId:String(i),properties:{i},
      bounds:[i*20+1,1,i*20+11,11],
      polygons:[[[[i*20+1,1],[i*20+11,1],[i*20+11,11],[i*20+1,11],[i*20+1,1]]]]
    }));
    const input = path.join(tmp, 'source.json');
    fs.writeFileSync(input, JSON.stringify(source).replaceAll('"NEGATIVE_ZERO"', '-0.0'));
    const out = path.join(tmp, 'packed');
    const packed = cp.spawnSync('/tmp/amsterdam-d26-geo-tools-venv/bin/python',
      [path.join(root, 'tools/geo/runtime/pack-runtime.py'), '--input', input,
       '--outdir', out, '--chunk-bytes', multi?'64':'1048576'], {encoding: 'utf8', timeout: 30000});
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const relative = url.pathname.replace(/^\/(raw|encoded)\//, '');
      const file = path.resolve(out, relative);
      if (!file.startsWith(out + path.sep) || !fs.existsSync(file)) {
        res.writeHead(404);res.end();return;
      }
      const bytes = fs.readFileSync(file);
      if (url.pathname.startsWith('/encoded/') && file.endsWith('.gz')) res.setHeader('Content-Encoding','gzip');
      res.setHeader('Content-Length',bytes.length);res.writeHead(200);res.end(bytes);
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const port = server.address().port;
    const outcomes = [];
    for (const mode of ['raw','encoded']) {
      const loaded = await runtime.load(`http://127.0.0.1:${port}/${mode}/manifest.json?test=1#fragment`,
        {navigation:false, rendering:false});
      const ring = loaded.data.layers.roads[0].polygons[0][0];
      if(multi){
        assert.equal(loaded.data.layers.roads.length,8);
        for(let i=0;i<8;i++){
          const f=loaded.data.layers.roads[i];assert.equal(f.id,'synthetic-chunk-'+i);
          assert.deepEqual(f.properties,{i});assert.deepEqual([...f.polygons[0][0][0]],[i*20+1,1]);
        }
      }else{
      assert.ok(Object.is(ring[0][0], -0), mode + ': first negative zero was changed');
      assert.ok(Object.is(ring[4][0], -0), mode + ': closing negative zero was changed');
      assert.ok(Object.is(ring[3][0], +0), mode + ': positive zero was changed');
      assert.equal(ring[1][0],10);assert.equal(ring[2][1],10);
      }
      loaded.dispose();outcomes.push({mode,bitExact:true});
    }
    console.log(JSON.stringify({passed:true,case:multi?'multichunk':'signed-zero',outcomes}));
  } finally {
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    fs.rmSync(tmp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
