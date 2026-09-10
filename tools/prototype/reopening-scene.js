/* A small, state-driven pub. All essential interactions also live in the DOM. */
(function (root) {
  'use strict';
  class PubScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = 1100 * scale;
      canvas.height = 640 * scale;
      this.ctx.scale(scale, scale);
    }
    rect(x,y,w,h,color) { this.ctx.fillStyle=color; this.ctx.fillRect(x,y,w,h); }
    ellipse(x,y,rx,ry,color) { const c=this.ctx;c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill(); }
    line(points,color,width=1) { const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke(); }
    text(value,x,y,size,color,font='Georgia',align='center') { const c=this.ctx;c.font=`${size}px ${font}`;c.fillStyle=color;c.textAlign=align;c.fillText(value,x,y); }
    bottle(x,y,color,scale=1) { const c=this.ctx;c.save();c.translate(x,y);c.scale(scale,scale);this.rect(-5,-43,10,13,color);this.rect(-9,-31,18,31,color);this.rect(-4,-44,8,3,'#cfa762');this.rect(-7,-20,14,13,'#ddcf98');this.rect(-4,-36,2,9,'#ffffff25');this.rect(-6,-27,2,21,'#ffffff15');this.text('TK',0,-10,7,'#3e4933');c.restore(); }
    drawCanal(state,time) {
      const c=this.ctx,f=state.forage;
      c.clearRect(0,0,1100,640);
      const water=c.createLinearGradient(0,0,0,640);water.addColorStop(0,'#224856');water.addColorStop(1,'#54897e');
      this.rect(0,0,1100,640,water);
      // A top-down canal: three lanes lead towards the boat's catching line.
      this.rect(0,0,155,640,'#78785c');this.rect(945,0,155,640,'#78785c');
      for(let y=0;y<660;y+=36){this.rect(0,y,151,2,'#4b5946');this.rect(949,y,151,2,'#4b5946');}
      this.rect(141,0,17,640,'#c6b991');this.rect(942,0,17,640,'#c6b991');
      for(let i=0;i<4;i++){
        const x=i%2?1005:55,y=85+Math.floor(i/2)*240;
        this.ellipse(x,y,34,42,'#315e48');this.ellipse(x-12,y-12,24,31,'#698565');this.rect(x-3,y+30,6,37,'#635941');
      }
      for(let i=0;i<37;i++){const x=169+(i*71)%760,y=(i*41+time*19)%640;this.rect(x,y,12+(i%4)*15,2,'#d2dbc12a');}
      for(const x of [420,680]){c.setLineDash([12,18]);this.line([[x,55],[x,585]],'#d5d8ac22',2);c.setLineDash([]);}
      this.rect(165,313,770,224,'#c2d39213');this.line([[166,313],[934,313]],'#c6d69555',2);this.line([[166,537],[934,537]],'#c6d69555',2);
      this.text('打捞区 · 漂进浅绿色水面再收网',550,563,17,'#d7e3bb','sans-serif');
      const lanes=[290,550,810];
      for(const item of f.items.filter(i=>i.status==='floating')){
        const x=lanes[item.lane],y=33+560*Reopening.forageProgress(state,item);
        this.ellipse(x,y+20,37,8,'#153e463b');
        if(item.kind==='hops'){
          this.rect(x-23,y-20,46,42,'#b7a274');this.line([[x-23,y-20],[x+23,y+22]],'#8b8255',2);
          for(let k=0;k<4;k++)this.ellipse(x+(k%2)*16-8,y+Math.floor(k/2)*14-8,9,12,k%2?'#547b42':'#87a459');
          this.text('酒花',x,y+49,15,'#e2dfad','sans-serif');
        }else if(item.kind==='bottle'){
          this.bottle(x,y+19,'#63834c',1.3);this.text('密封瓶',x,y+49,15,'#e2dfad','sans-serif');
        }else{
          for(const bx of [x-29,x+29]){c.strokeStyle='#b2b9a4';c.lineWidth=3;c.beginPath();c.arc(bx,y+8,19,0,Math.PI*2);c.stroke();}
          this.line([[x-29,y+8],[x-10,y-14],[x+7,y+8],[x-29,y+8],[x+8,y-17],[x+29,y+8]],'#b0895d',4);this.line([[x+8,y-17],[x+10,y-29],[x+22,y-29]],'#bdbdab',3);
          this.text('清运费 €2',x,y+49,15,'#e7b491','sans-serif');
        }
      }
      const bx=lanes[f.lane];
      c.fillStyle='#ad8051';c.beginPath();c.moveTo(bx,437);c.quadraticCurveTo(bx-58,490,bx-40,534);c.lineTo(bx+40,534);c.quadraticCurveTo(bx+58,490,bx,437);c.fill();
      this.rect(bx-32,486,64,9,'#dbc28f');this.ellipse(bx,486,15,20,'#2e4d45');this.ellipse(bx,469,12,12,'#c8a476');
      this.line([[bx+20,480],[bx+53,419]],'#d5c298',5);c.strokeStyle='#d5c298';c.lineWidth=2;c.beginPath();c.ellipse(bx+66,402,24,29,.5,0,Math.PI*2);c.stroke();
      this.rect(358,45,384,77,'#163e43e8');this.text('NOORD / 北岸运河',550,74,21,'#e2d1a6','Georgia');this.text('城市更新中，贵重物品请自行打捞。',550,99,14,'#b7cbb0','sans-serif');
      this.text('有用收获 '+f.haul+' / 3',550,607,18,'#f0d497','sans-serif');
    }
    draw(state, timestamp, selectedId) {
      const c=this.ctx;
      const time=this.reduced.matches?0:timestamp/1000;
      if(state.phase==='forage'){this.drawCanal(state,time);return;}
      const night=['night','summary','ending'].includes(state.phase);
      c.clearRect(0,0,1100,640);
      // Deep green woodwork and plaster, with a warm copper light at night.
      const wall=c.createLinearGradient(0,0,0,450);
      wall.addColorStop(0,night?'#233c38':'#668273');wall.addColorStop(1,night?'#3f4f39':'#9ba58b');
      this.rect(0,0,1100,460,wall);
      this.rect(0,0,1100,21,'#223c36');
      for(let x=10;x<1100;x+=85){this.rect(x,22,3,420,night?'#ffffff04':'#1f49390a');}

      // Three tall windows look out over the canal, behind the bar.
      c.save();c.beginPath();c.rect(57,64,366,292);c.clip();
      const sky=c.createLinearGradient(0,65,0,290);sky.addColorStop(0,night?'#142e42':'#aac9c8');sky.addColorStop(1,night?'#627b7e':'#ede0b4');
      this.rect(57,64,366,292,sky);
      if(night){this.ellipse(358,103,13,13,'#efddb0');for(let n=0;n<10;n++)this.rect(70+(n*53)%335,79+(n*17)%71,1.5,1.5,'#f0dfbcaa');}
      const colors=night?['#3b4749','#5c5149','#3b5152','#675b4f']:['#9c7c62','#b39676','#6f8c84','#b49c83'];
      for(let i=0;i<7;i++){
        const x=47+i*59,h=95+(i%3)*14,y=257-h;
        this.rect(x,y,49,h,colors[i%4]);
        const gable=[[x-3,y+3],[x+8,y+3],[x+8,y-10],[x+16,y-10],[x+16,y-22],[x+31,y-22],[x+31,y-10],[x+39,y-10],[x+39,y+3],[x+51,y+3]];
        c.fillStyle=colors[i%4];c.beginPath();gable.forEach((p,j)=>j?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();
        for(let row=0;row<3;row++)for(let col=0;col<2;col++){const wx=x+9+col*21,wy=y+15+row*27;this.rect(wx-2,wy-2,13,18,'#d0c5a033');this.rect(wx,wy,9,14,night&&((row+col+i)%3!==0)?'#e1b96d':'#3d666a');}
        this.rect(x+20,238,10,19,'#3a5752');
      }
      this.rect(57,257,366,14,night?'#475c59':'#b1aa8f');this.rect(57,271,366,85,night?'#244e60':'#5b969c');
      for(let i=0;i<15;i++){const x=55+(i*53+time*(i%2?3:-2))%365;this.rect(x,281+i*5,15+(i%4)*9,1,night?'#e4c27823':'#e5e1bc50');}
      const bx=70+(time*7)%350;this.ellipse(bx,310,30,4,'#123a4a50');this.rect(bx-26,300,52,6,'#4c5651');this.rect(bx-18,290,29,10,night?'#6e6d5a':'#c0b791');this.rect(bx-15,293,9,4,'#e7d3a0');
      c.restore();
      this.rect(45,48,390,13,'#243e36');this.rect(45,353,390,17,'#263d32');
      for(let x=47;x<436;x+=124){this.rect(x,54,11,311,'#2b4336');this.rect(x+10,55,2,296,'#93a78455');}
      this.rect(53,186,374,9,'#334d3c');this.rect(35,368,412,16,'#4c5540');this.rect(38,369,403,3,'#a8986d');
      // Plants on the sill, with three visible stems for quiet city life.
      for(const x of [91,385]){this.rect(x-15,348,30,20,'#9d7650');for(let k=0;k<5;k++){this.line([[x,350],[x+(k-2)*9,321-(k%2)*10]],'#345542',2);this.ellipse(x+(k-2)*10,323-(k%2)*9,7,13,k%2?'#759174':'#3c6851');}}

      // The old enamel sign stays the visual centre as the shop improves.
      this.rect(480,64,296,100,'#172f2e');this.rect(487,71,282,86,'#a77f49');this.rect(490,74,276,80,'#263b32');
      this.text('TWEEDE KANS',628,109,24,'#e1c890');this.text('BEER · DEBT · SECOND CHANCES',628,131,8,'#a4ac82','monospace');
      this.line([[507,140],[749,140]],'#b99d6444');
      // Shelves hold actual remaining beer rather than a decorative inventory.
      const blond=state.batches.filter(b=>b.beer==='blond').reduce((n,b)=>n+b.cups,0);
      const stout=state.batches.filter(b=>b.beer==='stout').reduce((n,b)=>n+b.cups,0);
      for(let row=0;row<2;row++){
        const y=238+row*96;this.rect(479,y,304,13,'#594a35');this.rect(479,y,304,3,'#b49a64');
        const amount=row?stout:blond;for(let i=0;i<Math.min(amount,12);i++)this.bottle(497+i*24,y,row?'#544037':'#708c4b',.75);
        if(amount===0)this.text('—',630,y-20,14,'#899277');
        this.text(row?'CANAL STOUT':'GOLDEN ALE',487,y+27,8,'#c4c297','monospace','left');this.text(`${amount} GLASSES`,776,y+27,8,'#c4c297','monospace','right');
      }
      // Chalkboard: music and reopening are visible in the place itself.
      this.rect(840,107,176,215,'#937149');this.rect(847,114,162,201,'#253c37');this.text(night?'VANAVOND':'BINNENKORT',928,144,11,'#adbd9d','monospace');this.line([[865,158],[990,158]],'#9cb39355');
      this.text(state.day===3?'WE ZIJN OPEN':'NOG '+(4-state.day)+' NACHTEN',929,188,15,'#e6d09b');this.text(state.music?'LIVE MUZIEK':'TOT SNEL, BUREN',929,226,11,state.music?'#e1b670':'#9aad92','monospace');this.text('ALE   /   STOUT',929,271,10,'#c6c4a1','monospace');
      if(state.promises.lotte){this.rect(980,319,82,53,'#e2d3a2');this.text('LOTTE',1021,338,11,'#535b41');this.text('1 × STOUT',1021,355,9,'#535b41','monospace');}

      // Warm hanging lamps. Changes in light give the day/night transition weight.
      for(const x of [257,652,952]){
        this.line([[x,0],[x,50]],'#252e26',3);this.ellipse(x,56,33,9,'#64543b');this.rect(x-34,56,68,14,'#8d7952');this.ellipse(x,70,33,8,night?'#e4b971':'#bca06b');
        if(night){const glow=c.createRadialGradient(x,78,0,x,128,180);glow.addColorStop(0,'#e9bd6b2a');glow.addColorStop(1,'#e9bd6b00');this.rect(x-180,70,360,320,glow);}
      }
      // Back counter, taps and glassware.
      this.rect(10,398,1080,38,'#67543a');this.rect(10,398,1080,7,'#a99668');this.rect(24,436,1052,195,'#3b392c');
      for(let x=40;x<1070;x+=128){this.rect(x,452,113,156,'#454330');this.rect(x+5,457,103,146,'#303d2d');this.rect(x+10,462,93,134,'#384332');}
      this.rect(15,612,1072,18,'#242a25');
      for(let i=0;i<(state.upgrades.includes('doubleTap')?2:1);i++){
        const tx=489+i*72;this.rect(tx-20,391,51,7,'#293c39');this.rect(tx,332,14,64,'#b28b4c');this.rect(tx+3,334,3,56,'#ebcc7e');this.line([[tx+7,338],[tx+7,322],[tx+35,322],[tx+35,341]],'#bd9c60',10);this.rect(tx+31,336,9,11,'#3f493a');this.rect(tx+1,302,12,23,'#324d38');this.ellipse(tx+7,300,10,11,'#b7a064');
      }
      for(let i=0;i<5;i++){this.rect(626+i*24,375-i%2*3,15,25,'#d3dac03a');this.line([[626+i*24,375-i%2*3],[626+i*24,399],[641+i*24,399],[641+i*24,375-i%2*3]],'#b2c3b077',1);}
      this.rect(812,365,85,32,'#34443a');this.rect(820,352,70,24,'#8b9a7c');this.rect(827,358,31,11,'#273c31');this.text('€'+state.cash,842,367,8,'#d6d8a8','monospace');
      this.ellipse(151,393,44,8,'#443e2d');for(let i=0;i<9;i++)this.ellipse(122+(i*17)%62,379+(i%3)*4,9,7,['#778349','#536c43','#93a25a'][i%3]);
      if(state.upgrades.includes('cellar')){this.ellipse(78,527,42,56,'#79603c');for(const y of [496,552])this.rect(38,y,80,7,'#34483a');this.line([[66,475],[62,582]],'#c09a6033',2);this.text('AGED',78,531,10,'#dcc08b','monospace');}
      if(state.upgrades.includes('stage')||state.music){this.rect(920,517,3,97,'#8d9a87');this.line([[897,614],[944,614]],'#6d8070',4);this.ellipse(921,512,8,12,'#bcc2a5');this.line([[910,507],[882,528]],'#b2b398',3);this.ellipse(998,560,23,31,'#ac7c46');this.ellipse(998,558,6,8,'#4b4935');this.rect(994,507,7,55,'#a68a58');if(state.music){this.text('♪',967,469+Math.sin(time)*3,24,'#d9bd7b');this.text('♫',1020,490+Math.cos(time)*3,17,'#d9bd7b');}}

      // Guests occupy stools and react to waiting; their controls are below.
      const guests=state.night?state.night.orders.filter(o=>o.status==='waiting'):[];
      const seats=[240,437,720];
      seats.forEach((x,i)=>{
        this.rect(x-18,565,6,68,'#34362d');this.rect(x+16,565,6,68,'#34362d');this.line([[x-18,611],[x+20,611]],'#857854',4);this.ellipse(x,565,39,12,'#8a6948');
        const guest=guests[i];if(!guest)return;
        const colors={lotte:'#ab785d',bram:'#617f79',marta:'#ae9e68'};
        const skin=guest.person==='bram'?'#b99572':guest.person==='marta'?'#d3b38a':'#c5a37d';
        const coat=colors[guest.person]||['#657c7f','#997653','#899a74'][i%3];
        this.ellipse(x,529,36,39,coat);this.rect(x-27,491,54,39,coat);this.ellipse(x,465,25,32,skin);
        this.ellipse(x,443,26,15,guest.person==='marta'?'#c6c4a5':guest.person==='lotte'?'#79483d':'#424d43');
        if(guest.person==='bram'){this.rect(x-24,468,48,15,'#695b46');this.ellipse(x,483,19,13,'#695b46');}
        this.ellipse(x-9,463,2,2,'#3c4435');this.ellipse(x+9,463,2,2,'#3c4435');
        const left=guest.patience-(state.night.elapsed-guest.arrival);this.line([[x-5,477],[x, left<8?474:480],[x+5,477]],'#865f46',1.5);
        if(guest.id===selectedId){this.ellipse(x,416,4,4,'#f1cf8a');this.line([[x-8,410],[x,420],[x+8,410]],'#f1cf8a',2);}
      });
      // Small glasses fill at each active tap. Spilled pours visibly flash amber.
      if(state.night)state.night.pours.forEach((p,i)=>{
        const x=529+i*72,fill=Reopening.pourProgress(state,p);this.rect(x-13,362,26,36,'#d9ddc729');this.rect(x-11,396-30*fill,22,30*fill,p.beer==='stout'?'#6a4831':'#d6a443');this.rect(x-11,394-30*fill,22,3,'#ece0bf');this.line([[x-13,362],[x-13,398],[x+13,398],[x+13,362]],'#c8d5bfa0',1.5);
        this.line([[x-4,346],[x-4,389-30*fill]],p.beer==='stout'?'#775738':'#d6a443',2);
      });
      if(state.phase==='brew'){
        this.ellipse(731,381,42,10,'#273d30');this.rect(692,338,78,44,'#a77b43');this.ellipse(731,338,39,10,'#c69b5c');this.ellipse(731,326,28,8,'#bd995f');this.rect(727,314,8,9,'#d5b67a');
        for(let i=0;i<3;i++){const rise=(time*22+i*16)%55;this.ellipse(716+i*15+Math.sin(time+i)*3,316-rise,4+rise*.08,8,'#e5d7ac26');}
      }
      // Soft vignette grounds the frame without obscuring controls.
      const shade=c.createLinearGradient(0,500,0,640);shade.addColorStop(0,'#182f2100');shade.addColorStop(1,'#0c181755');this.rect(0,500,1100,140,shade);
    }
  }
  root.PubScene=PubScene;
})(window);
