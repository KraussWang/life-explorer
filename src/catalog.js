import images from '../public/atlas/images.json' with {type:'json'};

export const categories={all:'全部',evolution:'演化生物',plant:'环境植物',marine:'海洋生物'};
export const rarities={common:'普通',rare:'稀有',key:'关键节点'};
// Catalog identity is independent of playable species. A model variant is not a new species.
const entry=(id,name,latin,category,rarity,model,trait,habitat,description,extra={})=>({
 id,name,latin,category,rarity,model,trait,habitat,description,
 era:'生命演化 · 代表形态',unlock:{type:'archive',hint:'后续生态章节开放后，通过演化或实地探索发现。'},
 image:images[id]||{kind:'model-render',source:model,hero:['fish','lungfish','amphibian','whale','tyrannosaur','elephant'].includes(id)?1:0,views:['正面','侧面','背面','顶部'].map((label,i)=>({label,image:`/atlas/${id}-${i}.webp`}))},...extra,
});
const evolution=id=>({type:'evolution',species:id,hint:'沿演化路线到达这一生命形态。'});
const explore=(environment,kind)=>({type:'exploration',environment,kind,hint:environment==='primordial'?'藻类生长后，靠近海底的对应植物观察。':'在扇贝浅海栖息地靠近对应生物观察。'});
export const catalog=[
 entry('cell','单细胞','Primordial cell','evolution','common','/models/cell.glb','细胞膜 · 物质交换','原始海洋 · 热液喷口附近','细胞膜划出了内外两个世界，微小生命开始探索富含营养的海洋。',{unlock:evolution('cell')}),
 entry('flagellate','鞭毛细胞','Flagellate','evolution','common','/models/flagellate.glb','鞭毛运动 · 主动觅食','原始海洋 · 冷流交汇处','运动结构使细胞能够主动寻找营养，也让聚集与协作成为可能。',{unlock:evolution('flagellate')}),
 entry('colony','多细胞集合体','Cellular colony','evolution','rare','/models/colony.glb','聚集协作 · 细胞分工','早期生命海洋 · 稀疏藻丛','细胞的聚集改变了生命的尺度，协作与分工孕育出新的身体结构。',{unlock:evolution('colony')}),
 entry('worm','蠕虫状祖先','Bilateral ancestor','evolution','rare','/atlas/worm.glb','两侧对称 · 协调运动','早期生命海洋 · 海底','身体轴线与协调运动，为防御滤食、底栖觅食和主动游泳提供了不同的可能。',{unlock:evolution('worm')}),
 entry('bivalve','扇贝','Pecten sp.','marine','key','/models/bivalve-lod.glb','双壳防护 · 滤食策略','浅海大陆架 · 沙质或泥质海底','两片壳保护柔软的身体。以防御和滤食为方向，种群在海底开辟自己的生活方式。',{unlock:evolution('bivalve'),variants:[{name:'带骨骼动画',url:'/atlas/models/bivalve-rig.glb'}]}),
 entry('slug','海蛞蝓','Nudibranchia','marine','common','/models/slug.glb','柔软身体 · 底栖觅食','早期生命海洋 · 藻丛与岩礁','柔软的身体在海床上移动，探索软体动物主动觅食的生活方式。',{unlock:evolution('slug')}),
 entry('fish','原始鱼型','Early fish form','evolution','rare','/models/fish-lod.glb','体轴支撑 · 摆尾推进','早期生命海洋 · 开阔水体','支撑身体的轴线与摆尾推进，拓展了生命在开阔水体中的活动空间。',{unlock:evolution('fish'),variants:[{name:'带骨骼动画',url:'/atlas/models/fish-rig.glb'}]}),
 entry('filament','丝状藻类','Filamentous algae','plant','common','/models/algae/filament-2.glb','丝状生长 · 光合作用','早期生命海洋 · 岩石表面','细长的藻丝依附海底生长，为逐渐复杂的生态系统提供基础。',{unlock:explore('primordial','filament')}),
 entry('leaf','叶片状海藻','Foliose algae','plant','common','/models/algae/leaf-reused.glb','叶状结构 · 附着生长','早期生命海洋 · 浅水岩脊','舒展的叶片增加与水体和光线接触的面积，在浅水中形成庇护空间。',{unlock:explore('primordial','leaf')}),
 entry('fanweed','扇形海草','Fan-shaped seaweed','plant','key','/atlas/models/fanweed.glb','扇状叶片 · 随流摆动','扇贝浅海 · 沙地与岩礁','扇状叶片在水流中展开，成为浅海环境中醒目的植物形态。',{unlock:explore('scallop','fanweed')}),
 entry('waterweed','水草','Aquatic vegetation','plant','common','/habitats/scallop/models/waterweed-lod.glb','丛生枝叶 · 水下庇护','扇贝浅海 · 海床','水下枝叶在海床上形成丛落，为浅海小型生命提供庇护。',{unlock:explore('scallop','waterweed')}),
 entry('algae','浅海藻类','Shallow-water algae','plant','common','/habitats/scallop/models/algae.glb','附着生长 · 光合作用','扇贝浅海 · 岩礁边缘','依附基底的藻类参与浅海生态系统的物质循环。',{unlock:explore('scallop','algae')}),
 entry('starfish','海星','Asteroidea','marine','rare','/habitats/scallop/models/starfish.glb','辐射对称 · 底栖生活','扇贝浅海 · 沙质海底','海星的身体结构展现了海洋动物与两侧对称形态不同的生活方式。',{unlock:explore('scallop','starfish')}),
 entry('lungfish','非洲肺鱼','Protopterus sp.','evolution','rare','/atlas/models/lungfish.glb','延长躯体 · 肺呼吸','淡水水域 · 季节性浅水环境','肺鱼代表鱼类中独特的一支，展示水生生活与空气呼吸相结合的策略。'),
 entry('amphibian','原始两栖形态','Early tetrapod form','evolution','key','/atlas/models/amphibian.glb','四肢支撑 · 水陆活动','浅水湿地 · 水陆交界','肢体支撑拓展了活动空间。这是一种代表形态，不对应确定的化石物种。'),
 entry('chordate','早期脊索动物','Early chordate form','evolution','rare','/atlas/models/chordate.glb','体轴支撑 · 水中运动','海洋 · 开阔水体','沿身体长轴的支撑结构，为更复杂的游动方式提供基础。'),
 entry('finfish','有鳍鱼类','Finned fish form','evolution','rare','/atlas/models/finfish.glb','鳍的分化 · 游动控制','海洋 · 中下层水体','分化的鳍参与推进、转向和平衡，拓展鱼类的运动方式。',{variants:[{name:'带骨骼动画',url:'/atlas/models/finfish-rig.glb'}]}),
 entry('whale','鲸类','Cetacea','marine','key','/atlas/models/whale.glb','水生哺乳动物 · 尾部推进','海洋 · 开阔水域','鲸类代表哺乳动物适应水生生活的一条路线。'),
 entry('coral-tube','管状珊瑚','Tubular coral form','marine','common','/atlas/models/coral-tube.glb','管状群体 · 固着生活','海洋 · 岩礁基底','珊瑚属于动物。群体结构为海底增添复杂的栖息空间。'),
 entry('coral-mass','团块珊瑚','Massive coral form','marine','rare','/atlas/models/coral-mass.glb','群体生长 · 立体结构','海洋 · 岩礁','团块状群体形成复杂的表面与间隙，为其他生命提供栖息空间。'),
 entry('shrub','灌木','Shrub form','plant','common','/atlas/models/shrub.glb','低矮枝丛 · 陆地生长','陆地 · 灌丛环境','低矮分枝的植物形态，丰富了陆地生态系统的垂直结构。'),
 entry('bush','丛生植物','Bush-like vegetation','plant','common','/atlas/models/bush.glb','密集分枝 · 丛生形态','陆地 · 植被边缘','密集的枝叶构成丛生结构，为地表生物提供遮蔽。'),
 entry('tree','树状植物','Arborescent vegetation','plant','rare','/atlas/models/tree.glb','木质支撑 · 树冠结构','陆地 · 林地','向上生长的支撑结构将枝叶带到更高处，形成多层次的陆地环境。'),
 entry('tyrannosaur','霸王龙','Tyrannosaurus rex','evolution','key','/atlas/models/tyrannosaur.glb','两足支撑 · 大型捕食','白垩纪晚期 · 陆地','大型兽脚类恐龙的一种代表，展现陆地脊椎动物的形态多样性。'),
 entry('elephant','象','Elephantidae','evolution','key','/atlas/models/elephant.glb','长鼻 · 四肢承重','陆地 · 林地与草原','长鼻与承重四肢体现大型陆生哺乳动物不同的取食与运动方式。'),
];
export const catalogById=Object.fromEntries(catalog.map(s=>[s.id,s]));
export function isDiscovered(state,entry){return entry.unlock.type==='evolution'?state.unlocked.includes(entry.unlock.species):(state.discoveries||[]).includes(entry.id);}
export function recordDiscovery(state,id){const entry=catalogById[id];if(!entry||entry.unlock.type!=='exploration'||isDiscovered(state,entry))return false;(state.discoveries??=[]).push(id);return true;}

// Evaluate proximity to actual scene instances, never a timer or atlas click.
export function nearbyDiscoveries(world,position){
 const close=(p,r=4)=>Math.hypot(p[0]-position.x,p[1]-position.y,p[2]-position.z)<r;
 if(world.algae){
  const growth=world.algae.currentGrowth;
  return ['filament','leaf'].filter(id=>(id==='leaf'?world.algae.leaves:world.algae.placements).some(p=>growth>p.start+.04&&close(p.position)));
 }
 return ['fanweed','waterweed','algae','starfish'].filter(id=>(world.manifest.instances?.[id]||[]).some(p=>close(p.p,3.5)));
}
