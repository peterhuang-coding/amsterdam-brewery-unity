# Renderer frame contract (public synthetic test input)

PubScene(canvas) needs canvas.getContext('2d'), global devicePixelRatio=1, matchMedia returns shared {matches:true/false}. VM global window may equal sandbox; constructor sets backing size1100x640 and applies pixel ratio. Use real scene source. Old test-street-atmosphere.js contains finite numeric-index checks, save/restore/style/gradient recorder.

PubScene.draw(state,timestamp,selectedId,cityView) uses only these fields for a normal pub frame:
state.phase='night', day1..3, cash45, batches[{beer:'blond',cups:6},{beer:'stout',cups:2}], upgrades[], promises{lotte:false}, music:false, night{elapsed:0,orders:[],pours:[]}.
cityView may be null for night. No core dependency is supplied because this package is renderer-only. A synthetic VM Reopening object may expose BEERS.blond={name:'金色艾尔',short:'金色艾尔'}, BEERS.stout={name:'运河黑啤',short:'黑啤'} and pourProgress(state,p)=max(0,min(1,(state.night.elapsed-p.startedAt)/p.duration)); actual runtime API already exists and cannot be modified. Never mock the new guest rendering itself.

Synthetic waiting order example (not natural-save provenance):
{"id":"guest-m","name":"Marta","person":"marta","beer":"blond","arrival":0,"patience":26,"status":"waiting","budget":12,"quote":"先倒一杯。","portrait":""}
Other named person values bram and lotte; person null with name Noor or regular generic name must not acquire an invented named identity. Other status values future/served/lost. All display reads should be from actual order fields. More than3 guests is not a legal gameplay requirement; runtime max3 seats (stage upgrade max2). Preserve order filter and seat mapping.

Synthetic pour: {customerId:'guest-m',beer:'stout',price:10,quality:1,aged:false,startedAt:1,duration:4}. This deliberately can differ from requested beer to test truthful desired-beer label and exact customer matching. Parent separately uses real Reopening lifecycle for runtime acceptance. No mutation to either data object.

Source pointers at 231a132: scene.draw429-end. Only wall block436-442, lamp block496-501 and counter shell503-505 are editable. Guest/stool529-547 and pour548-552 are strictly readonly. Shared primitives14-19 readonly. Old recorder in test-street-atmosphere.js31-180. For day pub use intro or prep with cityView=null; night/summary/ending use night palette. Reopening synthetic API is a test fixture only, never a production change. For stock/regression fixtures compare actual bottle counts, text and tap/pour operations from PubScene.draw and verify frozen source state stays unchanged. Baseline old test file has no exports; use a local recorder in the new test, do not edit old tests. Do not require an absent real core file: supplied frame contract is intentional for renderer-only unit tests. Parent separately checks real game lifecycle.
