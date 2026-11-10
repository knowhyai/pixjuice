/* Deterministic horizontal crate-opening reel. Zero dependencies, shared with the offline ZIP. */
(function(root){
  "use strict";
  var rarities=['Common','Uncommon','Rare','Epic','Legendary','Mythic','Relic'];
  var rates=[.5,.25,.14,.07,.025,.012,.003];
  var pools=[['wooden-sword','health-potion','steel-blade','cloak','lantern','crown','excalibur'],['moonstone','vial','feather','pendant','orb','mantle','relic'],['coal','elixir','rune','tome','amulet','beacon','heart']];
  var cases=['ironbound','moonveil','ember'].map(function(id,i){return {id:id,price:100,items:pools[i].map(function(item,j){return {id:item,rarity:rarities[j],probability:rates[j]};})};});
  function pick(config,rng){
    var sum=config.items.reduce(function(n,it){return n+it.probability;},0);
    if(!config.items.length || Math.abs(sum-1)>1e-8 || config.items.some(function(it){return !Number.isFinite(it.probability)||it.probability<0;}))throw Error('Invalid crate probabilities');
    var x=rng();if(!Number.isFinite(x)||x<0||x>=1)throw Error('RNG must return [0,1)');
    for(var i=0;i<config.items.length;i++){x-=config.items[i].probability;if(x<0)return config.items[i];}
    return config.items[config.items.length-1];
  }
  function openCase(config,rng){
    rng=rng||Math.random;
    var item=pick(config,rng), winnerIndex=38, cards=[];
    for(var i=0;i<46;i++)cards.push(pick(config,rng));
    cards[winnerIndex]=item;
    return {item:item,reel:{cards:cards,winnerIndex:winnerIndex}};
  }
  function stopOffset(reel,viewport,cardWidth,gap){return viewport/2-(reel.winnerIndex*(cardWidth+gap)+cardWidth/2);}
  root.PixCase={cases:cases,rarities:rarities,openCase:openCase,stopOffset:stopOffset};
})(typeof window!=='undefined'?window:globalThis);
