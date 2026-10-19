"""Independent full lossless runtime format verifier; never calls candidate code."""
import argparse,gzip,hashlib,json,pathlib,struct,time
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--packed',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();start=time.monotonic()
raw=a.source.read_bytes();source_sha=hashlib.sha256(raw).hexdigest();d=json.loads(raw);del raw
m=json.loads((a.packed/'manifest.json').read_text());assert m['sourceSha256']==source_sha
assert m['data']=={k:v for k,v in d.items() if k!='layers'}
assert set(m['layerOrder'])==set(d['layers']) and len(m['layerOrder'])==len(set(m['layerOrder']))
source_features=((layer,f) for layer in m['layerOrder'] for f in d['layers'][layer]);counts={k:0 for k in m['layerOrder']};pairs=features=polygons=rings=0;geometry=hashlib.sha256();largest_coord=largest_meta=0;download=0
for index,c in enumerate(m['chunks']):
 assert c['index']==index and c['pairOffset']==pairs
 encoded=(a.packed/c['coords']).read_bytes();meta_encoded=(a.packed/c['metadata']).read_bytes();download+=len(encoded)+len(meta_encoded)
 coords=gzip.decompress(encoded);meta_bytes=gzip.decompress(meta_encoded)
 assert len(coords)==c['coordBytes'] and len(encoded)==c['coordCompressedBytes']
 assert len(meta_bytes)==c['metadataBytes'] and len(meta_encoded)==c['metadataCompressedBytes']
 assert hashlib.sha256(coords).hexdigest()==c['coordSha256']
 assert hashlib.sha256(meta_bytes).hexdigest()==c['metadataSha256']
 md=json.loads(meta_bytes);assert len(md['features'])==c['features'] and md['pairOffset']==pairs
 largest_coord=max(largest_coord,len(coords));largest_meta=max(largest_meta,len(meta_bytes))
 enc=m['coordEncoding'];assert enc in ['int32-millimetres','float64-le']
 values=iter(struct.iter_unpack('<ii' if enc=='int32-millimetres' else '<dd',coords));chunk_pairs=0
 for f in md['features']:
  layer,orig=next(source_features);assert m['layerOrder'][f['l']]==layer
  assert set(orig)=={'id','sourceId','localId','properties','bounds','polygons'},('Unrepresented source fields',orig['id'],set(orig))
  assert f['id']==orig['id'] and f['s']==orig['sourceId'] and f['u']==orig['localId'] and f['p']==orig['properties'] and f['b']==orig['bounds']
  assert f['g']==[[len(r) for r in po] for po in orig['polygons']]
  assert f['o']==pairs
  for po in orig['polygons']:
   polygons+=1
   for ring in po:
    rings+=1
    for expected in ring:
     x,y=next(values)
     if enc=='int32-millimetres':x/=1000;y/=1000
     assert len(expected)==2 and struct.pack('<dd',x,y)==struct.pack('<dd',*expected),(orig['id'],pairs,expected,[x,y],'IEEE-754 mismatch')
     geometry.update(struct.pack('<dd',x,y));pairs+=1;chunk_pairs+=1
  features+=1;counts[layer]+=1
 assert next(values,None) is None and chunk_pairs==c['pairCount']
assert next(source_features,None) is None
assert pairs==m['pairCount'] and pairs*2==m['ordinateCount'] and features==m['featureCount'] and counts==m['layerCounts']
assert geometry.hexdigest()==m['geometrySha256'] and download==m['totalDownloadBytes']
out={'all_exact':True,'source_sha256':source_sha,'geometry_sha256':geometry.hexdigest(),'features':features,'polygons':polygons,'rings':rings,'pairs':pairs,'layer_counts':counts,'encoding':m['coordEncoding'],'chunks':len(m['chunks']),'total_download_bytes':download,'largest_coord_bytes':largest_coord,'largest_metadata_bytes':largest_meta,'target_chunk_bytes':m['chunkBytesTarget'],'seconds':time.monotonic()-start};a.out.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
