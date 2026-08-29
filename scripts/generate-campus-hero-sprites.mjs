import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CAMPUS_HEROES } from '../web/js/campus-heroes.mjs';

const details = {
  'basketball-ace': { hair: '#2a1c18', accent: '#ffcf35', prop: '●', badge: '23' },
  'track-sprinter': { hair: '#26344a', accent: '#42e8ff', prop: '≋', badge: 'GO' },
  'street-dancer': { hair: '#3c174b', accent: '#ff67c7', prop: '♪', badge: 'B' },
  'kendo-captain': { hair: '#18243c', accent: '#c8dcff', prop: '╱', badge: '剣' },
  'science-maker': { hair: '#26344a', accent: '#d9ff68', prop: '⚗', badge: 'LAB' },
  'code-maker': { hair: '#241548', accent: '#94eaff', prop: '</>', badge: '01' },
  'math-strategist': { hair: '#5b3c14', accent: '#fff07a', prop: '△', badge: 'π' },
  'chess-tactician': { hair: '#2b3543', accent: '#dcecff', prop: '♜', badge: '♟' },
  'astronomy-observer': { hair: '#202655', accent: '#b5c5ff', prop: '★', badge: '∞' },
  'puzzle-detective': { hair: '#49301d', accent: '#ffd178', prop: '?', badge: '!' },
  'language-magician': { hair: '#4a1743', accent: '#ffd0f4', prop: 'A', badge: '字' },
  'nature-researcher': { hair: '#243a1d', accent: '#c9ef74', prop: '⌁', badge: '葉' },
};

function sprite(hero, pose) {
  const d = details[hero.id];
  const attack = pose === 'attack';
  const frontArm = attack ? 'M615 510 Q760 490 860 398' : 'M615 510 Q680 560 690 660';
  const backArm = attack ? 'M407 510 Q330 590 300 650' : 'M407 510 Q350 550 340 655';
  const frontLeg = attack ? 'M580 745 Q720 765 830 690' : 'M580 745 Q620 820 610 890';
  const backLeg = attack ? 'M465 745 Q400 810 360 870' : 'M465 745 Q420 820 430 890';
  const propX = attack ? 864 : 714;
  const propY = attack ? 360 : 645;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="${hero.name} ${attack ? '攻擊' : '待機'}">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="10" flood-opacity=".28"/></filter></defs>
  <g filter="url(#s)" stroke="#1e2635" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
    <path d="${backLeg}" fill="none" stroke="${hero.color}" stroke-width="92"/><path d="${frontLeg}" fill="none" stroke="${hero.color}" stroke-width="96"/>
    <path d="${backArm}" fill="none" stroke="${hero.color}" stroke-width="86"/><path d="${frontArm}" fill="none" stroke="${hero.color}" stroke-width="90"/>
    <path d="M420 455 Q510 410 610 455 L650 735 Q520 790 385 730Z" fill="${hero.color}"/>
    <path d="M446 472 Q510 444 575 470 L575 700 Q510 728 440 698Z" fill="#fff" opacity=".22" stroke="none"/>
    <circle cx="510" cy="345" r="135" fill="#ffd5b2"/>
    <path d="M384 337 Q390 170 514 185 Q650 192 640 350 L590 292 Q520 332 442 285Z" fill="${d.hair}"/>
    <path d="M395 258 Q445 155 535 190 Q615 207 635 280" fill="none" stroke="${d.accent}" stroke-width="26"/>
    <path d="M460 355 l24 0 M540 355 l24 0"/><path d="M486 412 Q512 435 540 412" fill="none" stroke-width="16"/>
    <path d="M438 534 Q510 560 585 534" fill="none" stroke="${d.accent}" stroke-width="18"/>
    <rect x="465" y="570" width="94" height="72" rx="18" fill="${d.accent}"/><text x="512" y="625" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="34" fill="#1e2635" stroke="none">${d.badge}</text>
    <circle cx="${propX}" cy="${propY}" r="62" fill="${d.accent}"/><text x="${propX}" y="${propY + 20}" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="54" fill="#1e2635" stroke="none">${d.prop}</text>
  </g>
  ${attack ? `<path d="M760 350 l130 -80 M785 410 l165 -10 M760 470 l130 80" stroke="${d.accent}" stroke-width="26" stroke-linecap="round" opacity=".9"/>` : ''}
</svg>`;
}

for (const hero of CAMPUS_HEROES) {
  const directory = path.join('web', 'assets', 'battle', 'campus-heroes', hero.id);
  await mkdir(directory, { recursive: true });
  await Promise.all(['idle', 'attack'].map(pose => writeFile(path.join(directory, `${pose}.svg`), sprite(hero, pose), 'utf8')));
}
