import json,pathlib,sys,copy
p=pathlib.Path(__file__).parent;sys.path.insert(0,str(p/'sample'));import pack_geo
doc=json.loads((p/'sample/sample-input.json').read_text());out=[]
def points(d):d['layers']['water'][0]['polygons'][0][0]=[[0,0],[1,0],[0,0],[1,0],[0,0]]
def complete(d):d['source']['complete']='false'
def projection(d):d['projection']['type']='wrong'
for name,change in [('two_distinct_vertices',points),('string_completeness',complete),('invalid_projection',projection)]:
 d=copy.deepcopy(doc);change(d)
 try:pack_geo.pack_document(d,.05);out.append({'name':name,'rejected':False})
 except Exception as e:out.append({'name':name,'rejected':True,'error':str(e)})
(p/'packer-schema-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2));sys.exit(0 if all(x['rejected']for x in out)else 1)
