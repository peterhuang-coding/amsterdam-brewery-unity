(function(root){
  'use strict';
  const B=root.Backstage;
  class BackstageScene{
    constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d');this.view={scale:1,x:0,y:0};this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;}
    rect(x,y,w,h,color){this.c.fillStyle=color;this.c.fillRect(x,y,w,h);}
    line(points,color,width=1){const c=this.c;c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();}
    ellipse(x,y,rx,ry,color){const c=this.c;c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
    ring(x,y,rx,ry,color,width=2){const c=this.c;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.stroke();}
    text(t,x,y,size=16,color='#e9dfd1',align='center',font='sans-serif'){const c=this.c;c.fillStyle=color;c.font=`${size}px ${font}`;c.textAlign=align;c.fillText(t,x,y);}
    polygon(points,color){const c=this.c;c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill();}
    glow(x,y,rx,ry,color){const c=this.c;c.save();c.translate(x,y);c.scale(1,ry/rx);const g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore();}
    camera(r,overview){
      const narrow=this.canvas.getBoundingClientRect().width<600;
      const scale=overview ? .46 : narrow ? 1.8 : 1.06;
      const x=overview?(1100-B.WIDTH*scale)/2:Math.min(0,Math.max(1100-B.WIDTH*scale,550-r.p.x*scale));
      const y=overview?(640-B.HEIGHT*scale)/2:Math.min(0,Math.max(640-B.HEIGHT*scale,340-r.p.y*scale));
      return {scale,x,y};
    }
    worldPoint(x,y,r,overview){const v=r?this.camera(r,overview):this.view;return {x:(x-v.x)/v.scale,y:(y-v.y)/v.scale};}
    person(x,y,color,time=0,hero=false){
      const walk=this.reduced?0:Math.sin(time*12)*3;
      this.ellipse(x,y+5,14,7,'#05182088');
      this.line([[x-5,y-1],[x-6-walk,y+9]],'#122631',5);this.line([[x+5,y-1],[x+6+walk,y+9]],'#122631',5);
      this.rect(x-10,y-25,20,27,color);this.rect(x-12,y-21,5,18,'#d3a18a');this.rect(x+8,y-21,5,18,'#d3a18a');
      this.ellipse(x,y-33,9,10,'#d1a68d');this.rect(x-9,y-42,18,6,hero?'#ecbd78':'#302939');
      this.rect(x-6,y-40,13,3,hero?'#f4ce8e':'#392b38');
      if(hero){this.rect(x-8,y-24,13,20,'#366775');this.rect(x-7,y-21,11,3,'#92b8b0');this.rect(x+4,y-29,3,12,'#e2bc75');}
    }
    block(w){
      const {x,y,w:width,h}=w;
      if(w.kind==='water'){
        this.rect(x,y,width,h,'#173c4b');this.rect(x,y-5,width,5,'#9b927d');
        for(let i=0;i<width;i+=40)this.rect(x+i,y+27+(i%3)*10,24,2,'#bc7d9644');return;
      }
      const c=this.c;
      if(['delivery','works','closing'].includes(w.kind)){
        const works=w.kind==='works',color=works?'#b99368':w.kind==='delivery'?'#8b8270':'#83798c';
        this.rect(x+5,y+h-4,width,9,'#091b2855');this.rect(x,y,width,h,'#263e49');
        c.strokeStyle=color;c.lineWidth=2;c.strokeRect(x,y,width,h);
        if(w.kind==='delivery'){
          for(let xx=x+5;xx<x+width-10;xx+=36){const boxWidth=Math.min(30,x+width-5-xx);this.rect(xx,y-10,boxWidth,h+5,color);this.rect(xx+boxWidth/2-2,y-10,4,h+5,'#c0b390');this.line([[xx,y-10],[xx+boxWidth,y-10]],'#ded0a5',2);}
        }else{
          for(const xx of [x+8,x+width-8])this.line([[xx,y+h-2],[xx,y-18]],color,5);
          this.rect(x,y-16,width,14,color);
          for(let xx=x+5;xx<x+width-5;xx+=22)this.line([[xx,y-14],[Math.min(x+width-2,xx+10),y-4]],works?'#343c3c':'#cbbdca',5);
          if(works){this.ellipse(x+width/2,y-21,5,5,'#efc183');this.glow(x+width/2,y-21,20,15,'#efc18338');}
        }
        return;
      }
      if(w.kind==='glass'){
        this.rect(x+6,y+8,width,h,'#07232c55');this.rect(x,y-28,width,h+28,'#8fc8b733');
        c.strokeStyle='#acd8c0';c.lineWidth=2;c.strokeRect(x,y-28,width,h+28);
        for(let xx=x+12;xx<x+width;xx+=32)this.line([[xx,y-28],[xx,y+h]],'#91b4b966');return;
      }
      if(w.kind==='plants'){
        this.rect(x,y,width,h,'#6d7d62');this.rect(x,y+h-10,width,10,'#82644b');
        for(let i=12;i<width;i+=24){this.ellipse(x+i,y+20,13,22,'#527b67');this.ellipse(x+i+4,y+12,8,14,'#a1bf8c');}return;
      }
      const tall=['windows','house','shop','club'].includes(w.kind),height=tall?76:w.kind==='speaker'?45:22;
      const base=w.kind==='club'?'#42364e':w.kind==='windows'?'#673e53':tall?'#465360':'#526573';
      this.rect(x+10,y+h-4,width+3,14,'#091b2855');this.rect(x,y-height,width,h+height,base);
      this.rect(x,y+h-22,width,22,'#293342');
      this.polygon([[x,y-height],[x+15,y-height-14],[x+width+15,y-height-14],[x+width,y-height]],'#63707b');
      this.polygon([[x+width,y-height],[x+width+15,y-height-14],[x+width+15,y+h-15],[x+width,y+h]],'#283743');
      if(tall){
        if(w.kind==='windows')for(let i=0;i<6;i++){
          const bx=x+i*105,colors=['#694153','#4b4b60','#794b60','#50526b','#74485a','#535266'];
          this.rect(bx+1,y-height,103,h+height-22,colors[i]);
          this.polygon([[bx+8,y-height],[bx+25,y-height-12],[bx+25,y-height-22],[bx+40,y-height-22],[bx+40,y-height-32],[bx+64,y-height-32],[bx+64,y-height-22],[bx+79,y-height-22],[bx+79,y-height-12],[bx+96,y-height]],colors[i]);
          this.line([[bx+1,y-height],[bx+1,y+h-22]],'#b2859240',2);
        }
        for(let xx=x+15;xx<x+width-28;xx+=56){
          const red=w.kind==='windows';
          this.rect(xx,y-height+20,32,50,'#243343');this.rect(xx+4,y-height+24,24,40,red?'#d87e96':'#d5b888');
          this.rect(xx+14,y-height+23,3,43,'#495052');this.rect(xx+3,y-height+45,27,3,'#495052');
          if(red){this.rect(xx+6,y-height+23,4,45,'#a55971');this.rect(xx+23,y-height+23,4,45,'#a55971');if(Math.round((xx-x-15)/56)%4===0)this.person(xx+16,y-height+62,'#795f7d');else if(Math.round((xx-x-15)/56)%3===0)this.rect(xx+5,y-height+25,22,38,'#91526b');}
          this.polygon([[xx,y+h],[xx+32,y+h],[xx+75,y+h+90],[xx+15,y+h+90]],red?'#c66c8a13':'#eab5780d');
        }
        const name=w.kind==='windows'?'DE NACHT · 红灯运河街':w.kind==='club'?'NO SIGNAL':w.kind==='shop'?'SUPERMARKT / 员工也算人':'房间有人住';
        this.rect(x+12,y+h-38,width-24,25,'#213442');this.text(name,x+width/2,y+h-20,w.kind==='club'?20:13,w.kind==='windows'?'#f5a9bb':'#e6c894','center','Georgia');
        if(w.kind==='club'){this.line([[x+15,y+h-42],[x+width-15,y+h-42]],'#bc89d0',3);this.rect(x+width/2-26,y+h-22,52,22,'#151f2d');}
      }else if(w.kind==='speaker'){
        this.ellipse(x+width/2,y+10,21,24,'#1c2734');this.ellipse(x+width/2,y+62,27,28,'#1a2632');
      }else{
        for(let xx=x+9;xx<x+width-9;xx+=26){this.rect(xx,y+5,18,h-17,'#8b8d7a');this.rect(xx+3,y+7,12,4,'#d6b97d');}
        this.line([[x,y+h-13],[x+width,y+h-13]],'#a8b8ab',3);
      }
    }
    item(item,time){
      const {x,y,kind}=item,t=B.TYPES[kind];this.glow(x,y+3,25,15,t.color+'35');this.ellipse(x,y+4,13,6,'#12232c99');
      if(kind==='barrel'){
        this.rect(x-13,y-24,26,29,'#a77a50');this.ellipse(x,y-24,13,7,'#d8ae77');this.ellipse(x,y+3,13,6,'#705340');
        this.rect(x-14,y-19,28,3,'#78949b');this.rect(x-14,y-1,28,3,'#78949b');
      }else if(kind==='bottle'){
        this.rect(x-5,y-27,10,9,'#e7ca7e');this.rect(x-8,y-19,16,24,'#b89754');this.rect(x-6,y-11,12,10,'#ead6a0');
      }else if(kind==='hops'){
        this.rect(x-10,y-20,20,23,'#819e7f');this.line([[x-9,y-21],[x+9,y-21]],'#d7dcbb',3);this.text('✿',x,y-3,16,'#e2ddb0');
      }else if(kind==='parcel'){
        const bob=this.reduced?0:Math.sin(time*2)*2;this.rect(x-19,y-22+bob,38,27,'#746482');this.rect(x-20,y-24+bob,40,6,'#d0b3cb');this.rect(x-5,y-19+bob,10,23,'#dca9bd');this.text('?',x,y-35+bob,20,'#f4c5d7');
      }else{this.rect(x-10,y-13,20,18,'#91b7ba');this.ellipse(x,y-5,5,5,'#334650');}
    }
    actor(a,time){
      const {x,y}=a;
      if(a.mode==='investigate'){
        this.ring(x,y+3,29,17,'#e7c080',2);
        this.text('听声追查',x,y-49,13,'#edcd93');
        if(this.noise){const d=Math.hypot(this.noise.x-x,this.noise.y-y);if(d>1){const dx=(this.noise.x-x)/d,dy=(this.noise.y-y)/d;this.line([[x+dx*32,y+dy*32],[x+dx*50,y+dy*50]],'#edcd93',3);}}
      }
      if(a.mode==='windup'){this.glow(x,y,110,65,'#db786c38');this.c.setLineDash([6,5]);this.line([[x,y],[this.player.x,this.player.y]],'#f59b83',3);this.c.setLineDash([]);this.text('!',x,y-49,25,'#ffb292');}
      if(a.type==='cleaner'){
        this.ellipse(x,y+6,23,13,'#0b22307c');this.rect(x-22,y-20,44,28,'#678394');this.ellipse(x,y-19,22,12,'#98acac');this.rect(x-13,y-19,26,6,a.mode==='investigate'?'#edcd93':a.mode==='patrol'?'#d9bc7c':'#ed8a86');
        this.ellipse(x-22,y+4,7,7,'#233544');this.ellipse(x+22,y+4,7,7,'#233544');this.text('失物',x,y+3,9,'#e0d5b3');
      }else if(a.type==='gull'){
        const flap=this.reduced?0:Math.sin(time*10)*6;this.ellipse(x,y,12,5,'#cfd4cc');this.line([[x-25,y-9-flap],[x,y],[x+25,y-9-flap]],'#e0e5d6',4);this.rect(x+9,y-2,10,3,'#dfba6f');
      }else this.person(x,y,a.type==='guard'?'#596e83':['#ad759b','#a6a277','#7ba9af'][Math.floor(a.homeX)%3],time);
      if(a.stun>0){this.text('✦',x-19,y-38,16,'#a6dbd1');this.text('✧',x+18,y-29,14,'#eed099');}
    }
    streetBarrel(barrel,r){
      const {x,y}=barrel,held=r.street.dragging===barrel.id,near=this.dragTarget===barrel.id,color=held?'#d7efd3':'#96d6cb';
      this.ellipse(x,y+5,25,12,'#0b22309c');this.ring(x,y,28,28,color,held?3:2);
      this.rect(x-18,y-32,36,36,'#467a79');this.ellipse(x,y-32,18,9,'#8ab7ac');this.ellipse(x,y-32,12,5,'#264d54');
      this.rect(x-19,y-25,38,4,'#b1d1bd');this.rect(x-19,y-2,38,4,'#b1d1bd');
      this.line([[x-17,y-24],[x-25,y-24],[x-25,y-13],[x-17,y-13]],color,3);this.line([[x+17,y-24],[x+25,y-24],[x+25,y-13],[x+17,y-13]],color,3);
      this.text('空',x,y-9,13,'#e0e3c6');
      this.text(held?'拖行中 · R 放下':near&&!r.auto?.enabled?'空桶 · R 拖动':'可拖空桶',x,y+45,held||near?14:12,color);
    }
    sound(noise,time){
      const pulse=this.reduced?0:(time*1.4)%1;
      this.glow(noise.x,noise.y,65,45,'#e7c08030');
      for(let i=0;i<3;i++){const radius=22+(i+pulse)*20;this.ring(noise.x,noise.y,radius,radius*.7,['#e7c080a0','#e7c08075','#e7c08040'][i],2);}
      this.line([[noise.x-10,noise.y-2],[noise.x+9,noise.y-9]],'#e4d3ab',6);this.line([[noise.x+8,noise.y-9],[noise.x+17,noise.y-13]],'#afc8b7',4);
      this.text('空瓶声 · '+Math.ceil(noise.life)+'s',noise.x,noise.y-65,14,'#f1d199');
    }
    draw(r,options={}){
      const c=this.c,p=r.p,time=this.reduced?0:r.time,street=B.streetInfo?.(r);this.player=p;this.noise=r.street?.noise;this.dragTarget=B.dragTarget?.(r)?.id;
      const narrow=this.canvas.getBoundingClientRect().width<600;
      this.view=this.camera(r,options.overview);const {scale,x:tx,y:ty}=this.view;
      c.clearRect(0,0,1100,640);this.rect(0,0,1100,640,'#142e3b');c.save();c.translate(tx,ty);c.scale(scale,scale);
      this.rect(45,65,B.WIDTH-90,B.HEIGHT-130,'#294753');
      for(const z of B.ZONES){this.rect(z.x,z.y,z.w,z.h,z.color+'38');this.line([[z.x,z.y+z.h],[z.x+z.w,z.y+z.h]],z.color,2);}
      for(let y=80;y<1340;y+=30)for(let x=60+(y%60);x<2160;x+=60){this.line([[x,y],[x+52,y],[x+52,y+23]],'#60747d26',1);}
      for(let i=0;i<35;i++){const x=110+(i*199)%1980,y=300+(i*127)%950;this.ellipse(x,y,38+i%3*17,8,'#132e3f50');this.line([[x-20,y],[x+17,y]],'#87969428',1);}
      // A bridge and wayfinding remain fixed even when cargo patterns change.
      this.rect(590,631,120,87,'#887f72');for(let x=596;x<710;x+=18)this.line([[x,635],[x,714]],'#b5a38b',3);
      for(const x of [590,710])this.line([[x,627],[x,721]],'#cfbd9c',5);
      this.text('← 红灯运河街',850,610,16,'#c5a5b1');this.text('夜店 / 分拣场 →',860,775,16,'#b6bcc0');
      this.text('后场入口',225,1265,15,'#9aacaa');
      for(const light of [{x:465,y:265,color:'#d5798c48'},{x:1150,y:820,color:'#ad84c948'},{x:1480,y:1160,color:'#e8b97538'},{x:650,y:800,color:'#f4bc8145'}])this.glow(light.x,light.y,190,100,light.color);
      // Nightclub floor uses light and moving bodies as readable spatial obstacles.
      for(let x=1110;x<1380;x+=54)for(let y=830;y<1150;y+=54)this.rect(x,y,49,49,((x+y)/54|0)%2?'#ad84c912':'#a791b815');
      this.rect(1645,205,435,335,'#9ac8a524');this.glow(1820,440,240,130,'#acc69a28');
      for(const f of r.patches){this.ellipse(f.x,f.y,86,57,'#a8d6d465');for(let i=0;i<8;i++)this.ellipse(f.x+Math.cos(i*2.1)*55,f.y+Math.sin(i*2.1)*28,12,8,'#d9f0df80');}
      if(this.noise)this.sound(this.noise,time);
      const held=r.street?.barrels?.find(b=>b.id===r.street.dragging);
      if(held)this.line([[held.x,held.y-19],[p.x,p.y-15]],'#b5dfca',4);
      this.glow(B.EXIT.x,B.EXIT.y,76,48,'#dbbf8d3d');this.ellipse(B.EXIT.x,B.EXIT.y,40,22,'#244838');this.line([[B.EXIT.x-27,B.EXIT.y],[B.EXIT.x+27,B.EXIT.y]],'#d3d49a',3);this.text('↖ 回酒馆',B.EXIT.x,B.EXIT.y+44,16,'#e5d2a9');
      this.rect(B.LEVER.x-10,B.LEVER.y-21,20,32,'#596e74');this.line([[B.LEVER.x,B.LEVER.y-7],[B.LEVER.x+12,B.LEVER.y-28]],r.opened?'#a2d3a5':'#e6bd7e',5);
      this.text(r.opened?'闸门已开':'维护拉杆',B.LEVER.x,B.LEVER.y+28,13,'#c5c5ac');
      if(!r.opened){this.rect(B.GATE.x,B.GATE.y-32,B.GATE.w,54,'#566773');for(let x=B.GATE.x+6;x<B.GATE.x+B.GATE.w;x+=14)this.line([[x,B.GATE.y-31],[x,B.GATE.y+21]],'#9daba6',3);}
      const objects=[...B.WALLS,...(street?.walls||[])].map(w=>({y:w.y+w.h,draw:()=>this.block(w)}));
      for(const barrel of r.street?.barrels||[])objects.push({y:barrel.y,draw:()=>this.streetBarrel(barrel,r)});
      for(const item of r.items)if(item.state==='world')objects.push({y:item.y,draw:()=>this.item(item,time)});
      for(const a of r.actors)objects.push({y:a.y,draw:()=>this.actor(a,time)});
      const cart=B.flowerCart(r);
      objects.push({y:cart.y,draw:()=>{
        this.person(cart.x-29,cart.y,'#8ca88b',time);
        this.rect(cart.x-8,cart.y-23,44,25,'#9f855e');this.rect(cart.x-5,cart.y-20,38,17,'#263f3f');
        this.line([[cart.x-24,cart.y-17],[cart.x-8,cart.y-10]],'#b4c4ae',4);
        for(const xx of [cart.x,cart.x+29])this.ellipse(xx,cart.y+5,6,7,'#172c35');
        this.text('↗ 温室搬花车',cart.x,cart.y-53,14,'#d5d9af');
      }});
      objects.push({y:B.NOOR.y,draw:()=>{this.person(B.NOOR.x,B.NOOR.y,'#aa7d9d');this.text('Noor',B.NOOR.x,B.NOOR.y-56,15,'#edd3db');this.text('夜班刚结束',B.NOOR.x,B.NOOR.y+30,12,'#bbacbb');}});
      objects.push({y:405,draw:()=>{this.person(1990,405,'#8dba9c');this.text('温室住客',1990,345,14,'#d0e1c0');}});
      objects.push({y:265,draw:()=>{this.rect(1985,213,50,45,'#354d48');this.rect(1989,217,42,35,'#c1c398');this.glow(2010,260,45,27,'#decc8c50');this.text('↗ 酒馆屋顶',2010,287,13,'#ded3a0');}});
      objects.push({y:p.y,draw:()=>{if(p.inv===0||Math.sin(r.time*30)>-.3){this.glow(p.x,p.y,36,22,'#e8c58d37');this.person(p.x,p.y,'#d4a969',options.moving?time:0,true);this.line([[p.x+8,p.y-15],[p.x+8+p.fx*23,p.y-15+p.fy*23]],'#e3cda6',4);}}});
      objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
      for(const f of r.fx){c.globalAlpha=Math.min(1,f.life*5);this.line([[f.x,f.y-12],[f.x2,f.y2-12]],f.kind==='hook'?'#f0cf93':'#95cfcc',f.kind==='hook'?3:14);this.ellipse(f.x2,f.y2-12,7,7,'#f4d896');c.globalAlpha=1;}
      for(const z of B.ZONES){this.text(z.name,z.x+z.w/2,z.y+z.h-18,options.overview?25:17,'#d0c5b780','center','Georgia');}
      if(options.aim&&!options.overview){c.strokeStyle='#e7c897aa';c.lineWidth=1.5;c.beginPath();c.arc(options.aim.x,options.aim.y,13,0,Math.PI*2);c.stroke();this.line([[options.aim.x-20,options.aim.y],[options.aim.x-8,options.aim.y]],'#e7c897aa',1.5);}
      c.restore();
      // Fixed HUD is separate from the moving world.
      const gradient=c.createLinearGradient(0,0,0,street?140:100);gradient.addColorStop(0,'#101e2bf0');gradient.addColorStop(1,'transparent');c.fillStyle=gradient;c.fillRect(0,0,1100,street?140:100);
      const z=B.zone(r);this.text(z.name,28,narrow?49:38,narrow?34:24,'#f2dfc3','left','Georgia');
      if(street){
        this.text('今晚 · '+street.title,29,narrow?83:64,narrow?26:15,'#edc997','left');
        if(!narrow)this.text(street.hint,29,88,12,'#b8c9c5','left');
        if(r.street&&street.id!=='legacy')this.text(`空瓶 ${r.street.baits}/3${r.street.lureCooldown>0?' · '+r.street.lureCooldown.toFixed(1)+'s':''} · ${held?'拖桶中 · 步速降低':'青环 = 可拖空桶'}`,29,112,narrow?23:12,'#b9d9c8','left');
      }
      else if(!narrow)this.text(z.sub,29,64,12,'#b8bab6','left');
      this.miniMap(r);
      const near=B.nearest(r);
      this.rect(22,586,1056,38,'#172c3cea');
      this.text(r.auto?.enabled?(r.status!=='active'?'这一趟已结束':r.auto.event?'时间暂停 · 选择下一步行动':'自动探索中 · 重要的事会停下来问你'):near?near.label:narrow?'WASD 移动 · E 互动 · M 地图':r.message,40,610,narrow?26:14,near?'#e4d29c':'#c1cbd0','left');
      if(options.overview){this.rect(360,19,380,34,'#172a38ee');this.text(r.street?.barrels?.length?'全图 · 青环为空桶 · M 返回':'城市背面 · M 返回跟随视角',550,42,15,'#e6d5b9');}
    }
    miniMap(r){
      const x=900,y=20,w=172,h=109,s=w/B.WIDTH;
      this.rect(x-6,y-6,w+12,h+12,'#102431dc');
      for(const z of B.ZONES)this.rect(x+z.x*s,y+z.y*s,z.w*s,z.h*s,z.color);
      for(const wall of B.streetInfo?.(r)?.walls||[])this.rect(x+wall.x*s,y+wall.y*s,Math.max(2,wall.w*s),Math.max(2,wall.h*s),'#d4b382');
      for(const barrel of r.street?.barrels||[])this.ring(x+barrel.x*s,y+barrel.y*s,3,3,'#a6e1cd',1.5);
      if(r.street?.noise)this.ring(x+r.street.noise.x*s,y+r.street.noise.y*s,5,5,'#edcd93',1.5);
      this.ellipse(x+B.EXIT.x*s,y+B.EXIT.y*s,3,3,'#e0c485');
      this.ellipse(x+B.NOOR.x*s,y+B.NOOR.y*s,3,3,'#e2a1c2');
      if(!r.discovered.includes('greenhouse'))this.text('?',x+1850*s,y+390*s,13,'#e0e4ba');
      this.ellipse(x+r.p.x*s,y+r.p.y*s,4,4,'#fff0c9');
      this.text('M 全图',x+w,y+h+18,11,'#b8c2c6','right');
    }
  }
  root.BackstageScene=BackstageScene;
})(window);
