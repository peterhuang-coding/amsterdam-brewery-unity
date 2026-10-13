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
    poly(points,color) { const c=this.ctx;c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fill(); }
    ring(x,y,r,color,width=2) { const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke(); }
    text(value,x,y,size,color,font='Georgia',align='center') { const c=this.ctx;c.font=`${size}px ${font}`;c.fillStyle=color;c.textAlign=align;c.fillText(value,x,y); }
    bottle(x,y,color,scale=1) { const c=this.ctx;c.save();c.translate(x,y);c.scale(scale,scale);this.rect(-5,-43,10,13,color);this.rect(-9,-31,18,31,color);this.rect(-4,-44,8,3,'#cfa762');this.rect(-7,-20,14,13,'#ddcf98');this.rect(-4,-36,2,9,'#ffffff25');this.rect(-6,-27,2,21,'#ffffff15');this.text('TK',0,-10,7,'#3e4933');c.restore(); }
    // Transform-free variant for signs drawn inside the already-transformed
    // city camera, so the active camera matrix is never overwritten mid-frame.
    bottleAt(x,y,color,s=1){const r=(dx,dy,w,h,col)=>this.rect(x+dx*s,y+dy*s,w*s,h*s,col);r(-5,-43,10,13,color);r(-9,-31,18,31,color);r(-4,-44,8,3,'#cfa762');r(-7,-20,14,13,'#ddcf98');r(-4,-36,2,9,'#ffffff25');r(-6,-27,2,21,'#ffffff15');this.text('TK',x,y-10*s,7*s,'#3e4933');}
    tulips(x,y,bouquet,size=1) {
      const colors=bouquet.palette==='cool'?['#aa9dc4','#c7c0d6','#897aa7']:bouquet.palette==='warm'?['#ce815d','#e2b864','#bf6555']:['#cc8068','#b6a4c4','#dfbb6d'];
      for(let i=0;i<5;i++){
        const fx=x+(i-2)*5*size,fy=y-(21+i%3*4)*size;
        this.line([[x,y],[fx,fy]],'#52724c',1.6*size);
        this.ellipse(fx-3*size,fy+9*size,3*size,6*size,'#729363');
        this.ellipse(fx,fy,4*size,5*size,colors[i%3]);
        this.ellipse(fx-2.5*size,fy-2*size,2*size,4*size,colors[i%3]);
        this.ellipse(fx+2.5*size,fy-2*size,2*size,4*size,colors[i%3]);
      }
      if(bouquet.wrap==='paper'){
        const c=this.ctx;c.fillStyle='#dcc7a0';c.beginPath();c.moveTo(x-11*size,y-12*size);c.lineTo(x+11*size,y-12*size);c.lineTo(x+4*size,y+4*size);c.lineTo(x-4*size,y+4*size);c.closePath();c.fill();
        this.line([[x-10*size,y-11*size],[x+3*size,y+3*size]],'#ae9976',size);
      }else{
        this.line([[x-5*size,y-4*size],[x+5*size,y-4*size]],'#be846f',3*size);
        this.line([[x,y-4*size],[x-7*size,y+3*size],[x-8*size,y-3*size],[x,y-4*size],[x+8*size,y-3*size],[x+7*size,y+3*size]],'#dfb19a',1.5*size);
      }
    }
    bicycle(bike,bouquet) {
      const x=bike.x,y=bike.y;
      this.ellipse(x,y+11,30,6,'#1c434044');
      for(const wx of [x-15,x+15]){this.ellipse(wx,y+7,10,10,'#283f3d');this.ellipse(wx,y+7,7,7,'#a8b6a0');this.ellipse(wx,y+7,5.5,5.5,'#657d70');}
      this.line([[x-15,y+7],[x-6,y-7],[x+3,y+7],[x-15,y+7],[x+8,y-8],[x+15,y+7]],'#bb8254',3);
      this.line([[x+8,y-8],[x+9,y-16],[x+17,y-16]],'#d7c49b',2);
      this.line([[x-11,y-9],[x-2,y-9]],'#35433b',3);
      this.rect(x+16,y-12,16,11,'#b2986e');this.line([[x+16,y-12],[x+32,y-12],[x+29,y-1],[x+18,y-1],[x+16,y-12]],'#dec89a',1.5);
      for(let i=0;i<3;i++)this.line([[x+19+i*4,y-11],[x+20+i*3,y-2]],'#7f7857',1);
      if(bouquet&&bouquet.stored)this.tulips(x+24,y-8,bouquet,.65);
    }
    cityWorldPoint(x,y) {
      const view=this.cityTransform||{scale:1,tx:0,ty:0};
      return {x:(x-view.tx)/view.scale,y:(y-view.ty)/view.scale};
    }
    // Deterministic integer hash: fixed stone/water accents per cell, never Math.random.
    cityRand(seed){let z=(Math.imul(seed|0,2654435761)^0x9e3779b9)>>>0;z=Math.imul(z^(z>>>16),2246822519)>>>0;z^=z>>>13;return((z^0x68bc9a41)>>>0)/4294967296;}
    // Warm cut-stone coping frames a cool, tonally banded canal. Footprints
    // (land, water, crossings) are unchanged; this is rendering only.
    drawQuayWater(w,night,t){
      const P=this.cityPalette,horizontal=w.w>=w.h;
      this.rect(w.x-7,w.y-7,w.w+14,w.h+14,night?'#b3a683':'#dccfaa');
      const cap=night?'#8f886d':'#c0b18b';
      if(horizontal){
        this.rect(w.x-7,w.y-7,w.w+14,6,cap);this.rect(w.x-7,w.y+w.h+1,w.w+14,6,cap);
        for(let qx=w.x+18;qx<w.x+w.w-6;qx+=26){
          this.line([[qx,w.y-6],[qx,w.y-1]],night?'#00000026':'#7a6c4c2b',1);
          this.line([[qx,w.y+w.h+2],[qx,w.y+w.h+6]],night?'#00000026':'#7a6c4c2b',1);
        }
      }else{
        this.rect(w.x-7,w.y-7,6,w.h+14,cap);this.rect(w.x+w.w+1,w.y-7,6,w.h+14,cap);
        for(let qy=w.y+18;qy<w.y+w.h-6;qy+=26){
          this.line([[w.x-6,qy],[w.x-1,qy]],night?'#00000026':'#7a6c4c2b',1);
          this.line([[w.x+w.w+2,qy],[w.x+w.w+6,qy]],night?'#00000026':'#7a6c4c2b',1);
        }
      }
      this.rect(w.x,w.y,w.w,w.h,night?'#235d6c':P.CANAL_BLUE);
      // Limited tonal bands and a few restrained static highlights read as water.
      if(horizontal){
        this.rect(w.x,w.y+Math.round(w.h*.24),w.w,Math.max(3,Math.round(w.h*.13)),night?'#1b4855':'#2c7d89');
        this.rect(w.x,w.y+Math.round(w.h*.6),w.w,Math.max(2,Math.round(w.h*.08)),night?'#ffffff14':'#d8eef022');
        for(let k=0;k<3;k++){
          const hx=w.x+24+this.cityRand(w.x+k*97+3)*(w.w-80);
          const hy=w.y+8+this.cityRand(w.y+k*53+9)*(w.h-18);
          this.line([[hx,hy],[hx+20+this.cityRand(k+w.y+5)*18,hy]],night?'#d6ece816':'#ffffff26',1.4);
        }
      }else{
        this.rect(w.x+Math.round(w.w*.24),w.y,Math.max(3,Math.round(w.w*.13)),w.h,night?'#1b4855':'#2c7d89');
        this.rect(w.x+Math.round(w.w*.62),w.y,Math.max(2,Math.round(w.w*.09)),w.h,night?'#ffffff14':'#d8eef022');
        for(let k=0;k<2;k++){
          const vx=w.x+8+this.cityRand(w.x+k*61+4)*(w.w-16);
          const vy=w.y+24+this.cityRand(w.y+k*43+7)*(w.h-70);
          this.line([[vx,vy],[vx,vy+22+this.cityRand(k+w.x+3)*20]],night?'#d6ece816':'#ffffff26',1.4);
        }
      }
      // Cool shadow where the water surface meets the stone edge.
      this.rect(w.x,w.y,w.w,3,night?'#0a2029bb':'#1139445e');
      this.rect(w.x,w.y+w.h-3,w.w,3,night?'#0a2029bb':'#1139445e');
      this.rect(w.x,w.y,3,w.h,night?'#0a202977':'#11394433');
      this.rect(w.x+w.w-3,w.y,3,w.h,night?'#0a202977':'#11394433');
      const flecks=Math.floor(w.w*w.h/1500);
      for(let i=0;i<flecks;i++){
        const fx=w.x+((i*41+t*5)%Math.max(1,w.w-16)),fy=w.y+(i*59)%w.h;
        this.rect(fx,fy,13,2,night?'#d9ecea24':'#eef7ee33');
      }
    }
    drawCity(view,time) {
      const C=window.City,c=this.ctx,night=!!view.afterHours;
      // Overview (zoom 1/2) keeps the whole-city map; the close street camera
      // follows the avatar at ~2.6x the overview scale.
      const street=view.camera==='street';
      const base=Math.min(1100/C.WIDTH,640/C.HEIGHT);
      const scale=base*(street?2.6:(view.zoom||1));
      const spanW=1100/scale,spanH=640/scale;
      const tx=scale*C.WIDTH<=1100?(1100-scale*C.WIDTH)/2:-Math.max(0,Math.min(C.WIDTH-spanW,view.position.x-spanW/2))*scale;
      const ty=scale*C.HEIGHT<=640?(640-scale*C.HEIGHT)/2:-Math.max(0,Math.min(C.HEIGHT-spanH,view.position.y-spanH/2))*scale;
      this.cityTransform={scale,tx,ty};
      const INK='#183b48',CANAL_BLUE='#378e9b',BRICK='#b86b4c',SAND='#e2d4b0',LAMP='#ffd184',SLATE='#253d49';
      // Stone/path/coping/water tones keep quay, street and canal distinct.
      const STONE=night?'#ab9f80':'#d6c9a6';
      const PATH=night?'#bdb18f':'#e4d8b5';
      const QUAY=night?'#8f886c':'#bfb08c';
      this.cityPalette={INK,CANAL_BLUE,BRICK,SAND,LAMP,SLATE};
      // Reduced-motion frames at a fixed view must be identical for every time.
      const t=(this.reduced&&this.reduced.matches)?0:time;
      c.clearRect(0,0,1100,640);this.rect(0,0,1100,640,night?'#102733':INK);
      c.save();c.translate(tx,ty);c.scale(scale,scale);
      this.rect(0,0,C.WIDTH,C.HEIGHT,night?'#123745':'#23505c');
      for(let i=0;i<80;i++)this.rect((i*139+t*9)%C.WIDTH,(i*83)%C.HEIGHT,20+i%4*13,2,night?'#9fc3c018':'#b9d6bd20');
      const land=C.LAND;this.rect(land.x-7,land.y-7,land.w+14,land.h+14,night?'#6f6c54':'#9b906f');this.rect(land.x,land.y,land.w,land.h,STONE);
      this.line([[land.x,land.y+1],[land.x+land.w,land.y+1]],night?'#fff4d618':'#fff6df24',1);
      // Street surfaces are clipped at canals. Crossings are drawn separately.
      c.save();c.beginPath();c.rect(land.x,land.y,land.w,land.h);c.clip();
      // Sparse scattered cut-stone seams: deterministic and subordinate to paths.
      for(let gx=0;gx<Math.round(land.w/58);gx++)for(let gy=0;gy<Math.round(land.h/58);gy++){
        const k=gx*73+gy*131+7;
        if(this.cityRand(k)>0.26)continue;
        const jx=land.x+gx*58+8+Math.floor(this.cityRand(k+1)*36);
        const jy=land.y+gy*58+8+Math.floor(this.cityRand(k+2)*36);
        this.line(this.cityRand(k+3)>.5?[[jx,jy],[jx+9,jy]]:[[jx,jy],[jx,jy+9]],night?'#00000026':'#8a7c5822',1);
      }
      for(const x of [190,390,590,890,1190,1490,1650]){this.rect(x-19,40,38,1040,PATH);this.line([[x,40],[x,1080]],night?'#9c9272':'#c1b48e',1);}
      for(const y of [270,520,690,890,1040]){this.rect(70,y-18,1660,36,PATH);this.line([[70,y],[1730,y]],night?'#9c9272':'#c1b48e',1);}
      // Small public greens give the quays room to breathe.
      for(const park of [{x:92,y:64,w:260,h:158},{x:1160,y:530,w:220,h:155},{x:150,y:860,w:215,h:140}]){
        this.rect(park.x,park.y,park.w,park.h,'#84966b');
        this.line([[park.x+15,park.y+park.h/2],[park.x+park.w-15,park.y+park.h/2]],'#c4bd91',13);
        for(let i=0;i<8;i++){const x=park.x+25+(i%4)*(park.w-50)/3,y=park.y+25+Math.floor(i/4)*(park.h-50);this.ellipse(x+4,y+6,15,18,'#425a4845');this.ellipse(x,y,14,19,i%2?'#527655':'#6c865c');this.ellipse(x-4,y-5,8,11,'#94a776');}
      }
      c.restore();
      for(const water of C.WATERS)this.drawQuayWater(water,night,t);
      // Wide district lettering belongs to the overview; the close street view
      // keeps labels sparse so facades, the route and doors stay dominant.
      if(!street){
        this.text('H E T   I J',460,393,26,'#c2d6be80','Georgia');
        this.text('NOORD',1260,67,27,'#405b4b','Georgia');this.text('JORDAAN',285,490,24,'#52624a','Georgia');
        this.text('CENTRUM',770,503,21,'#687056','Georgia');this.text('DE PIJP',865,862,25,'#52624a','Georgia');this.text('SCIENCE PARK',1445,865,20,'#52624a','Georgia');
      }
      for(const crossing of C.CROSSINGS){
        if(crossing.kind==='ferry'){
          c.setLineDash([7,9]);this.line([[crossing.x+crossing.w/2,crossing.y],[crossing.x+crossing.w/2,crossing.y+crossing.h]],'#e8d6a3',3);c.setLineDash([]);
          for(const y of [crossing.y,crossing.y+crossing.h-13]){this.rect(crossing.x-15,y,crossing.w+30,13,'#736c4b');this.rect(crossing.x-15,y+2,crossing.w+30,2,'#d4bd87');}
          this.text('免费渡轮',crossing.x+crossing.w+10,crossing.y+100,17,'#e4d8ac','sans-serif','left');
        }else{
          // Worn timber deck inside the unchanged crossing footprint; stone
          // abutments and fascia give the bridge depth without a new crossing.
          const g=crossing.x,top=crossing.y,gw=crossing.w,gh=crossing.h,horizontal=gw>gh;
          this.rect(g,top,gw,gh,'#b8ab84');
          if(horizontal){
            this.rect(g-4,top+2,4,gh-4,QUAY);this.rect(g+gw,top+2,4,gh-4,QUAY);
            this.rect(g,top,gw,4,'#63705b');this.rect(g,top+gh-4,gw,4,'#45503e');
            this.rect(g+3,top+5,gw-6,1.6,'#ffffff1a');
            for(let px=g+14;px<g+gw-8;px+=18)this.line([[px,top+6],[px,top+gh-6]],'#0000001a',1);
          }else{
            this.rect(g+2,top-4,gw-4,4,QUAY);this.rect(g+2,top+gh,gw-4,4,QUAY);
            this.rect(g,top,4,gh,'#63705b');this.rect(g+gw-4,top,4,gh,'#45503e');
            this.rect(g+5,top+3,1.6,gh-6,'#ffffff1a');
            for(let py=top+14;py<top+gh-8;py+=18)this.line([[g+6,py],[g+gw-6,py]],'#0000001a',1);
          }
        }
      }
      // Intentional 2.5D canal facades: shadow, side depth, tall windows,
      // stepped/pitched roofs and a readable real door on every destination.
      this.drawHouses(C,view,night,t);
      // Lotte rehearses on the narrow bridge just east of the pub: a visible
      // musician with a guitar marks the bridge meeting point (not a door).
      this.drawBridgeMusician(516,624,night,t,street);
      // Working boats and cranes distinguish the north bank from the café streets.
      this.line([[1310,285],[1310,209],[1370,209]],'#b99756',7);this.line([[1310,234],[1360,209]],'#b99756',3);this.line([[1368,211],[1368,250]],'#405d51',2);
      for(const mooring of [{x:1090,y:374},{x:480,y:735},{x:1080,y:568}]){this.ellipse(mooring.x,mooring.y,12,29,'#244e53');this.ellipse(mooring.x,mooring.y-2,9,24,'#af9060');this.rect(mooring.x-6,mooring.y-8,12,16,'#d5c49b');}
      for(let i=0;i<9;i++){const x=155+(i*157)%1500,y=260+(i%3)*215;if(C.walkable(x,y)){this.ellipse(x,y+4,5,4,'#43594444');this.rect(x-3,y-3,6,10,['#728465','#977550','#596f73'][i%3]);this.ellipse(x,y-7,4,4,'#c4a575');}}
      // Market awnings and café tables identify working destinations at a glance.
      for(let i=0;i<4;i++){const x=840+i*48,y=1070;this.rect(x,y,40,16,'#615d42');this.rect(x-3,y-20,46,22,i%2?'#bd8b59':'#668568');for(let k=0;k<4;k++)this.rect(x-3+k*12,y-20,6,22,'#e3d0a3');}
      for(const x of [685,775]){this.ellipse(x,956,12,8,'#755f3f');this.ellipse(x,956,10,6,'#d6bd84');for(const dx of [-18,18])this.rect(x+dx-3,953,6,8,'#646a48');}
      if(night){
        this.rect(0,0,C.WIDTH,C.HEIGHT,'#091c3d83');
        for(const lamp of [{x:335,y:610},{x:566,y:705},{x:867,y:473},{x:777,y:923},{x:1293,y:1030},{x:1535,y:934}]){
          const glow=c.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,66);glow.addColorStop(0,'#eab85a3d');glow.addColorStop(1,'#eab85a00');
          this.rect(lamp.x-66,lamp.y-66,132,132,glow);this.line([[lamp.x,lamp.y+9],[lamp.x,lamp.y-14]],'#293e3e',3);this.ellipse(lamp.x,lamp.y-16,5,6,'#f0cd84');
        }
      }
      if(view.path&&view.path.length){
        // A dark underlay keeps the warm route dashes readable on every surface.
        const routePoints=[[view.position.x,view.position.y],...view.path.map(p=>[p.x,p.y])];
        c.setLineDash([10,9]);c.lineDashOffset=-t*12;
        this.line(routePoints,'#102c385c',8);this.line(routePoints,'#f6d88f',5);
        c.setLineDash([]);c.lineDashOffset=0;
      }
      if(view.garden&&!night){
        const e=window.FlowerNetwork.ENTRY;
        this.rect(e.x-30,e.y-45,60,28,'#72917b');this.rect(e.x-20,e.y-40,40,20,'#b9d6c0');
        this.line([[e.x-30,e.y-45],[e.x,e.y-59],[e.x+30,e.y-45]],'#3f6350',4);
        this.text(view.garden.known?'温室侧门':'玻璃屋后的门',e.x,e.y+20,14,'#294b51','sans-serif');
        if(!view.garden.pump)this.ellipse(e.x+20,e.y-4,20,8,'#527f8b');
        const cart=view.flowerCart;if(cart){this.rect(cart.x-14,cart.y-7,28,16,'#927752');this.ellipse(cart.x-12,cart.y+10,5,5,'#294b51');this.ellipse(cart.x+12,cart.y+10,5,5,'#294b51');this.tulips(cart.x,cart.y-8,{palette:'mixed',wrap:'paper'},.8);this.text('搬花车',cart.x,cart.y-32,12,'#294b51','sans-serif');}
      }
      const p=view.position;
      for(const place of Object.values(C.PLACES)){
        const active=view.target===place.id||view.mode==='place'&&view.place===place.id,known=p.visited.includes(place.id);
        const distance=Math.hypot(place.x-p.x,place.y-p.y);
        // Close street view labels only the door you are near (or walking to);
        // the overview keeps all seven destination labels.
        const labelled=!street||active||distance<=300,dim=street&&!labelled;
        this.ellipse(place.x,place.y,active?27:dim?13:20,active?27:dim?13:20,active?'#f0cd82':'#214a48');
        this.ellipse(place.x,place.y,active?23:dim?9:16,active?23:dim?9:16,known?'#305b48':'#56694f');
        this.text(place.icon,place.x,place.y+(dim?5:7),dim?13:21,'#efdbac','sans-serif');
        if(street&&distance<92)this.ring(place.x,place.y,26+Math.sin(t*3)*2,'#ffd184b8',2);
        if(!labelled)continue;
        const labelWidth=Math.max(120,place.name.length*15+25),labelY=place.id==='market'?place.y-48:place.y+34;
        this.rect(place.x-labelWidth/2,labelY-18,labelWidth,29,active?'#edd5a0':'#ece0bfec');
        this.text(place.name,place.x,labelY+2,16,active?'#244334':'#3e5647','sans-serif');
      }
      const isFerry=C.onFerry(p.x,p.y),mounted=p.bike&&p.bike.mounted;
      if(p.bike&&!mounted)this.bicycle(p.bike.pushing?{...p.bike,x:p.bike.x+19,y:p.bike.y+5}:p.bike,view.bouquet);
      this.ellipse(p.x,p.y+9,isFerry?25:15,isFerry?12:7,'#1c434060');
      if(street&&!isFerry)this.ring(p.x,p.y+9,19+Math.sin(t*3)*1.5,'#ffd184aa',2);
      if(isFerry){this.ellipse(p.x,p.y+6,21,32,'#b9945a');this.rect(p.x-12,p.y-9,24,26,'#e4cd9b');}
      this.ellipse(p.x,p.y,10,14,'#1d4140');this.ellipse(p.x,p.y-15,9,9,'#d4aa73');this.rect(p.x-9,p.y-22,18,6,'#ce8e4c');
      if(mounted){
        this.bicycle(p.bike,view.bouquet);
        this.line([[p.x-4,p.y+2],[p.x-9,p.y+8],[p.x,p.y+10]],'#253d37',4);this.line([[p.x+4,p.y+2],[p.x+9,p.y+6],[p.x+4,p.y+13]],'#253d37',4);
        this.line([[p.x+6,p.y-8],[p.x+15,p.y-14]],'#d4aa73',3);
      }else{
        this.line([[p.x-4,p.y+11],[p.x-5,p.y+19],[p.x-8,p.y+19]],'#253d37',4);this.line([[p.x+4,p.y+11],[p.x+5,p.y+19],[p.x+8,p.y+19]],'#253d37',4);
      }
      if(p.bike?.pushing){this.line([[p.x+6,p.y-7],[p.x+27,p.y-9]],'#d4aa73',3);this.text('推行',p.x,p.y-51,11,'#eee1b3','sans-serif');}
      if(view.bouquet&&!view.bouquet.stored)this.tulips(p.x+16,p.y+3,view.bouquet,.7);
      this.text('你',p.x,p.y-35,16,'#fff1c8','sans-serif');
      c.restore();
      this.rect(22,18,240,34,night?'#132e3aed':'#e4d6afea');this.text(night?(street?'深夜 · 街头视角':'深夜 · 全城地图'):(street?'白天 · 街头视角':'白天 · 全城地图'),36,40,15,night?'#e6c784':'#355749','sans-serif','left');
      const notes=Array.isArray(view.notes)?view.notes.filter(note=>typeof note==='string').slice(-3):[];
      if(notes.length){
        this.rect(22,62,322,39+notes.length*23,night?'#183038ed':'#e9dcb9ed');this.text('地图笔记',36,85,12,night?'#dabc82':'#5c6b4e','sans-serif','left');
        notes.forEach((note,i)=>this.text(note.length>21?note.slice(0,20)+'…':note,36,109+i*23,13,night?'#d9d1ae':'#465c4c','sans-serif','left'));
      }
      this.text('N',1068,43,13,'#e6d5a9','monospace');this.line([[1068,52],[1068,78]],'#e6d5a9',2);this.line([[1062,58],[1068,50],[1074,58]],'#e6d5a9',2);
      this.text('AMSTERDAM / 游戏街区示意',1072,621,10,'#d4d6b4','monospace','right');
    }
    // ------------------------------------------------------------------
    // 2.5D canal houses. Every destination keeps its collision footprint
    // (rendering only): shadow + side depth face face south toward the quay.
    drawHouses(C,view,night,time){
      const P=this.cityPalette;
      const styles={
        pub:{wall:P.BRICK,shade:'#8f513a',trim:P.SAND,roof:P.SLATE,gable:'stepped',door:true,warm:true,brick:true,sign:'pub'},
        coffee:{wall:P.SAND,shade:'#c2b087',trim:'#f2e8cd',roof:'#3d5055',gable:'stepped',door:true,sign:'KOFFIE'},
        noord:{wall:'#7d5c43',shade:'#5d432f',trim:P.SAND,roof:P.INK,gable:'pitched',door:true,sign:'NOORD · VEER'},
        market:{wall:'#c98e63',shade:'#a46f4b',trim:P.SAND,roof:P.SLATE,gable:'pitched',door:true,shop:true,brick:true,sign:'ALBERT CUYP'},
        flowers:{wall:P.SAND,shade:'#c2b087',trim:'#f2e8cd',roof:'#77414d',gable:'stepped',door:true,shop:true,florist:true,sign:'BLOEMEN'},
        lab:{wall:'#d6d8c3',shade:'#aeb299',trim:'#eef0e0',roof:P.INK,gable:'flat',door:true,sign:'UvA'}
      };
      const deco=[
        {wall:P.BRICK,shade:'#8f513a',trim:'#dcc49b',roof:P.SLATE,gable:'stepped'},
        {wall:P.SAND,shade:'#c2b087',trim:'#e9dfc2',roof:'#435257',gable:'stepped'},
        {wall:'#a56b4e',shade:'#82523b',trim:'#d9c8a4',roof:P.INK,gable:'pitched'},
        {wall:'#c7b78e',shade:'#a1916a',trim:'#e7dcbd',roof:'#44433f',gable:'stepped'}
      ];
      C.BUILDINGS.forEach((b,i)=>{
        const destination=Boolean(styles[b.id]);
        this.drawFacade(b,styles[b.id]||deco[i%deco.length],night,destination,i,time);
      });
      // The bought window bouquet hangs beside the pub door, not a prop door.
      if(view.display){const f=C.BUILDINGS.find(b=>b.id==='pub');this.tulips(f.x+18,f.y+f.h-2,view.display,.55);}
    }
    drawFacade(b,st,night,destination,seed,time){
      const P=this.cityPalette,x=b.x,y=b.y,w=b.w,h=b.h,cx=x+w/2,ground=y+h;
      const H=destination?Math.min(96,72+Math.round(h*.3)):Math.min(72,h+12);
      const rise=st.gable==='flat'?10:26;
      // Ground shadow on the quay.
      this.ellipse(cx,ground+5,w*.62,11,'#102d3840');
      // Side depth face (light comes from upper-left).
      this.poly([[x+w,ground-H],[x+w+12,ground-H-9],[x+w+12,ground-3],[x+w,ground+1]],st.shade);
      // Front wall and plinth.
      this.rect(x,ground-H,w,H,st.wall);
      this.rect(x+w-5,ground-H,5,H,st.shade+'66');
      // Crisp upper-left light and a few restrained brick courses; opaque
      // windows and the plinth are drawn over them afterwards.
      this.line([[x+2,ground-H+1],[x+w-2,ground-H+1]],night?'#fff6dd12':'#fff3d238',1);
      if(!night)this.rect(x,ground-H,Math.round(w*.42),H,'#fff7e210');
      if(st.brick)for(let by=ground-H+13;by<ground-12;by+=14)this.line([[x+5,by],[x+w-5,by]],night?'#ffffff07':'#6e3f2c1c',1);
      this.rect(x,ground-8,w,8,st.trim);this.rect(x,ground-8,w,2,st.shade);
      // Roof: Amsterdam stepped gable, pitched tile roof or a flat lab slab.
      if(st.gable==='stepped'){
        this.poly([[x+w+12,ground-H-9],[cx+10,ground-H-9],[cx+14,ground-H-rise+2],[x+w+12,ground-H-rise-4]],st.shade);
        this.rect(x-3,ground-H,w+6,5,st.shade);
        this.rect(cx-14,ground-H-8,28,8,st.roof);this.rect(cx-11,ground-H-16,22,8,st.roof);
        this.rect(cx-8,ground-H-24,16,8,st.roof);this.rect(cx-4,ground-H-31,8,8,st.roof);
        this.rect(cx-2,ground-H-34,4,4,st.shade);
      }else if(st.gable==='pitched'){
        this.poly([[x-3,ground-H],[x+w+3,ground-H],[cx,ground-H-rise]],st.roof);
        this.poly([[x+w+3,ground-H],[x+w+13,ground-H-9],[cx+10,ground-H-rise-5],[cx,ground-H-rise]],st.shade);
        this.rect(x-3,ground-H,w+6,4,st.shade);
      }else{
        this.rect(x-4,ground-H-9,w+8,9,st.roof);this.rect(x-4,ground-H-9,w+8,3,st.shade);
      }
      const lit=(r,col)=>st.warm||night&&(seed*7+r*5+col*3)%4===0;
      const glass=(r,col)=>!night?'#2f6875':lit(r,col)?P.LAMP:'#22475a';
      if(st.shop){
        // Ground-floor shopfront under a striped awning.
        this.rect(x-3,ground-42,w+6,6,'#718469');
        for(let s=0;s<Math.ceil((w+6)/13);s++)this.rect(x-3+s*13,ground-42,7,6,'#e1d0a8');
        this.rect(x-3,ground-46,w+6,5,'#5d7058');
        this.rect(x+8,ground-31,w-16,23,st.trim);this.rect(x+10,ground-29,w-20,19,'#33554f');
        this.rect(x+8,ground-31,w-16,3,'#ffffff22');
      }else{
        // Two rows of tall canal-house windows.
        const cols=Math.max(2,Math.min(4,Math.floor(w/28)));
        for(let r=0;r<2;r++)for(let col=0;col<cols;col++){
          const wx=x+11+col*((w-22)/cols),wy=ground-H+(r?42:12),ww=Math.min(12,(w-22)/cols-7);
          if(destination&&r===1&&Math.abs(wx-cx)<13)continue; // the real door occupies the centre
          this.rect(wx-1.5,wy-2,ww+3,23,st.trim);this.rect(wx,wy,ww,19,glass(r,col));
          if(!night)this.rect(wx+1,wy+1,ww-2,3,'#ffffff26');
          this.line([[wx+ww/2,wy],[wx+ww/2,wy+19]],'#0f242b55',1);this.line([[wx,wy+9],[wx+ww,wy+9]],'#0f242b55',1);
          this.rect(wx-2.5,wy+19,ww+5,2,st.shade);
          if(night&&lit(r,col))this.rect(wx+2,wy+2,2,5,'#fff3cf88');
        }
      }
      if(destination)this.drawDoor(x,cx,ground,st,night);else this.rect(cx-7,ground-H+8,14,17,st.shade+'55');
      // Signage identifies each real place; decorative houses stay anonymous.
      if(st.sign==='pub'){
        this.rect(cx-35,ground-H+9,70,19,'#20302b');this.rect(cx-35,ground-H+9,70,2,'#caa85f');this.rect(cx-35,ground-H+26,70,2,'#caa85f');
        this.bottleAt(cx-25,ground-H+20,'#7a9452',.34);
        this.text('TWEEDE KANS',cx+6,ground-H+22,8,'#f0d79b','Georgia');
      }else if(st.sign){
        this.rect(cx-30,ground-H+9,60,16,night?'#e9dcc0':'#f0e6cc');
        this.text(st.sign,cx,ground-H+20,st.sign.length>7?6.5:8,P.INK,'monospace');
      }
      if(st.florist){
        for(let bunch=0;bunch<3;bunch++){
          const fx=x+14+bunch*36,fy=ground+9;
          this.rect(fx-10,fy-3,20,11,'#9b8057');this.tulips(fx,fy,{palette:['warm','cool','mixed'][bunch],wrap:'ribbon'},.8);
        }
      }else if(b.id==='market'){
        for(let k=0;k<3;k++){this.rect(x+14+k*26,ground+3,22,9,'#8a6741');for(let j=0;j<3;j++)this.ellipse(x+19+k*26+j*6+(j===1?2:0),ground+2,3.4,3.4,['#b8553f','#d6a93f','#7b8c4a'][j]);}
      }else if(b.id==='noord'){
        this.line([[x+w-12,ground-H+30],[x+w-12,ground-36]],'#5a4630',3);this.ellipse(x+w-12,ground-38,6,6,'#e7d4a6');this.ellipse(x+w-12,ground-38,3,3,'#c8513f');
      }
    }
    drawDoor(x,cx,ground,st,night){
      const P=this.cityPalette,dx=cx-9;
      this.rect(dx-6,ground-2,30,5,'#b39f76');                 // stoop
      if(!night)this.rect(dx-5,ground-2,28,1,'#fff2d233');
      this.rect(dx-3,ground-31,24,31,st.trim);                // frame
      this.rect(dx-3,ground-31,24,3,st.shade);
      this.rect(dx,ground-29,18,29,st.warm?'#2c4a33':'#2b3c42');
      this.rect(dx+2,ground-27,14,11,'#6d8b92');              // upper glass
      if(!night)this.rect(dx+2,ground-27,14,2,'#c8e4e24d');
      this.rect(dx+2,ground-14,14,12,st.warm?'#3c5c40':'#39494f');
      this.ellipse(dx+14.5,ground-13,1.7,1.7,P.LAMP);
      // Wall lantern makes the entrance conspicuous at every hour.
      this.line([[dx+24,ground-38],[dx+24,ground-30]],'#3a2c20',2);
      if(night){const c=this.ctx,glow=c.createRadialGradient(dx+24,ground-31,0,dx+24,ground-31,40);glow.addColorStop(0,'#ffd18455');glow.addColorStop(1,'#ffd18400');this.rect(dx-16,ground-71,80,80,glow);}
      this.ellipse(dx+24,ground-31,3.6,5,P.LAMP);
    }
    drawBridgeMusician(x,y,night,time,street){
      const P=this.cityPalette;
      this.ellipse(x,y+10,14,5,'#102d3840');
      this.ellipse(x,y+7,13,5,'#7c5a36');this.rect(x-13,y+2,26,5,'#8f6c45');
      this.ellipse(x-4,y+6,1.8,1.8,P.LAMP);this.ellipse(x+3,y+6,1.8,1.8,'#e8e0c4');
      this.ellipse(x-2,y-6,7,11,'#77484f');                   // coat
      this.ellipse(x-3,y-17,5,5,'#d4aa73');                   // head
      this.ellipse(x-7,y-20,6,5,'#352a26');                   // hair
      this.ellipse(x+6,y-2,5.5,4.5,'#9a6a3c');this.ellipse(x+6,y-2,2.6,2.2,'#5d3f22');
      this.line([[x+9,y-5],[x+16,y-15]],'#9a6a3c',2.5);this.line([[x+16,y-15],[x+19,y-18]],'#c9a86a',2);
      this.text('♪',x+15,y-24+(street?Math.sin(time*2)*2:0),street?15:10,night?P.LAMP:'#9a7434','sans-serif');
      if(street)this.text('♫',x-16,y-26+Math.cos(time*1.7)*2,11,night?'#ffe3ad':'#a87f45','sans-serif');
    }
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
    draw(state, timestamp, selectedId, cityView) {
      const c=this.ctx;
      const time=this.reduced.matches?0:timestamp/1000;
      if(['prep','summary'].includes(state.phase)&&cityView&&(cityView.mode==='map'||cityView.place!=='pub')){this.drawCity(cityView,time);return;}
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
      if(cityView&&cityView.display){this.rect(237,348,26,21,'#bb9670');this.tulips(250,351,cityView.display,1.5);}

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
