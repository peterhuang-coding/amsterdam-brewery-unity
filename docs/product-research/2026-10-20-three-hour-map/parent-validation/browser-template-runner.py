"""Run one existing independent browser template, retain exact code/log/result."""
import argparse,json,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--template',type=pathlib.Path,required=True);p.add_argument('--config',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=False)
code=a.template.read_text().replace('CONFIG',json.dumps(json.loads(a.config.read_text())))
(a.out/'run-code.js').write_text(code)
r=subprocess.run(['bash','/Users/peter_mini/.codex/skills/playwright/scripts/playwright_cli.sh','-s=amsterdam-d28-runtime','run-code',code],capture_output=True,text=True,timeout=240)
log=r.stdout+r.stderr;(a.out/'run.log').write_text(log)
if '### Result\n' not in log: print(log);raise SystemExit(r.returncode or 1)
result=json.loads(log.split('### Result\n',1)[1].split('\n###',1)[0]);(a.out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False)[:12000]);raise SystemExit(r.returncode)
