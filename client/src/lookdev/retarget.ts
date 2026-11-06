// Retargets animations from Quaternius' Universal Animation Library rig (UE-mannequin bone names)
// onto any VRM humanoid, using world-space rest rotations (the same approach as three-vrm's
// Mixamo example).
import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

const MAP: Record<string, VRMHumanBoneName> = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  Head: 'head',
  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes',
};
for (const side of ['l', 'r'] as const) {
  const S = side === 'l' ? 'left' : 'right';
  MAP[`thumb_01_${side}`] = `${S}ThumbMetacarpal` as VRMHumanBoneName;
  MAP[`thumb_02_${side}`] = `${S}ThumbProximal` as VRMHumanBoneName;
  MAP[`thumb_03_${side}`] = `${S}ThumbDistal` as VRMHumanBoneName;
  for (const [src, dst] of [
    ['index', 'Index'],
    ['middle', 'Middle'],
    ['ring', 'Ring'],
    ['pinky', 'Little'],
  ] as const) {
    MAP[`${src}_01_${side}`] = `${S}${dst}Proximal` as VRMHumanBoneName;
    MAP[`${src}_02_${side}`] = `${S}${dst}Intermediate` as VRMHumanBoneName;
    MAP[`${src}_03_${side}`] = `${S}${dst}Distal` as VRMHumanBoneName;
  }
}

// Rigify "DEF-" bones (Quaternius library 1). GLTFLoader strips the dots: "DEF-thigh.L" -> "DEF-thighL".
const RIGIFY: Record<string, VRMHumanBoneName> = {
  'DEF-hips': 'hips',
  'DEF-spine001': 'spine',
  'DEF-spine002': 'chest',
  'DEF-spine003': 'upperChest',
  'DEF-neck': 'neck',
  'DEF-head': 'head',
};
for (const [side, S] of [
  ['L', 'left'],
  ['R', 'right'],
] as const) {
  Object.assign(RIGIFY, {
    [`DEF-shoulder${side}`]: `${S}Shoulder`,
    [`DEF-upper_arm${side}`]: `${S}UpperArm`,
    [`DEF-forearm${side}`]: `${S}LowerArm`,
    [`DEF-hand${side}`]: `${S}Hand`,
    [`DEF-thigh${side}`]: `${S}UpperLeg`,
    [`DEF-shin${side}`]: `${S}LowerLeg`,
    [`DEF-foot${side}`]: `${S}Foot`,
    [`DEF-toe${side}`]: `${S}Toes`,
    [`DEF-thumb01${side}`]: `${S}ThumbMetacarpal`,
    [`DEF-thumb02${side}`]: `${S}ThumbProximal`,
    [`DEF-thumb03${side}`]: `${S}ThumbDistal`,
  });
  for (const [src, dst] of [
    ['index', 'Index'],
    ['middle', 'Middle'],
    ['ring', 'Ring'],
    ['pinky', 'Little'],
  ] as const) {
    RIGIFY[`DEF-f_${src}01${side}`] = `${S}${dst}Proximal` as VRMHumanBoneName;
    RIGIFY[`DEF-f_${src}02${side}`] = `${S}${dst}Intermediate` as VRMHumanBoneName;
    RIGIFY[`DEF-f_${src}03${side}`] = `${S}${dst}Distal` as VRMHumanBoneName;
  }
}
Object.assign(MAP, RIGIFY);

/** Source rig facing: +1 if its toes point to +Z in rest pose, -1 for -Z. */
function sourceFacing(source: THREE.Object3D): number {
  const foot = source.getObjectByName('foot_l') ?? source.getObjectByName('DEF-footL');
  const ball = source.getObjectByName('ball_l') ?? source.getObjectByName('DEF-toeL');
  if (!foot || !ball) return 1;
  const a = foot.getWorldPosition(new THREE.Vector3());
  const b = ball.getWorldPosition(new THREE.Vector3());
  return b.z >= a.z ? 1 : -1;
}

export function retargetClip(clip: THREE.AnimationClip, source: THREE.Object3D, vrm: VRM): THREE.AnimationClip {
  source.updateMatrixWorld(true);
  const tracks: THREE.KeyframeTrack[] = [];
  const isVRM0 = vrm.meta?.metaVersion === '0';
  // VRM0 normalized space is turned 180 degrees; a source facing -Z needs the same flip.
  const flip = (isVRM0 ? -1 : 1) * sourceFacing(source) < 0;
  const restInv = new THREE.Quaternion();
  const parentRest = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();

  const hipsSrc = source.getObjectByName('pelvis') ?? source.getObjectByName('DEF-hips');
  const srcHipsY = hipsSrc ? hipsSrc.getWorldPosition(new THREE.Vector3()).y : 1;
  const vrmHipsY = vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 1;
  const posScale = vrmHipsY / Math.max(1e-6, srcHipsY);

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const boneName = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    const vrmBone = MAP[boneName];
    if (!vrmBone) continue;
    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBone);
    const srcNode = source.getObjectByName(boneName);
    if (!vrmNode || !srcNode) continue;
    srcNode.getWorldQuaternion(restInv).invert();
    srcNode.parent!.getWorldQuaternion(parentRest);

    if (track instanceof THREE.QuaternionKeyframeTrack && prop === 'quaternion') {
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        q.fromArray(track.values, i).premultiply(parentRest).multiply(restInv);
        if (flip) {
          q.x = -q.x;
          q.z = -q.z;
        }
        q.toArray(values, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.quaternion`, track.times, values));
    } else if (track instanceof THREE.VectorKeyframeTrack && prop === 'position' && vrmBone === 'hips') {
      const parentWorld = srcNode.parent!.matrixWorld;
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        v.fromArray(track.values, i).applyMatrix4(parentWorld).multiplyScalar(posScale);
        if (flip) {
          v.x = -v.x;
          v.z = -v.z;
        }
        v.toArray(values, i);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.position`, track.times, values));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
