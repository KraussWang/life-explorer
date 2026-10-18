import * as THREE from 'three';

const up=new THREE.Vector3(0,1,0);
const forward=new THREE.Vector3(0,0,-1);
const wanted=new THREE.Quaternion();
const heading=new THREE.Vector3();

// Keep translation on the body's facing axis while it turns toward input.
export function advanceFacing(player,direction,dt,turnRate,distance){
 wanted.setFromAxisAngle(up,Math.atan2(-direction.x,-direction.z));
 player.quaternion.slerp(wanted,1-Math.exp(-dt*turnRate));
 heading.copy(forward).applyQuaternion(player.quaternion);
 const travel=distance*Math.max(0,heading.dot(direction));
 player.position.addScaledVector(heading,travel);
 return travel;
}
