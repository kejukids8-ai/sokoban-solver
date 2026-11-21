// push-optimal sokoban, room-by-room: cut the player's hallway row's dead squares, flood-fill rooms,
// solve each room push-optimally with the other rooms' boxes as walls; fallback whole-level BFS over pushes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      if (ch !== '#') {
        wall[i] = 0;
        if ('.*+'.includes(ch)) goals.push(i);
        if ('$*'.includes(ch)) boxes.push(i);
        if ('@+'.includes(ch)) player = i;
      }
    }
  });
  return { w, h, wall, goals: goals.sort((a, b) => a - b), boxes: boxes.sort((a, b) => a - b), player };
}

// squares from which a lone box can reach some goal (reverse pull BFS from goals)
function liveSquares(w, wall, goals) {
  const live = new Uint8Array(wall.length);
  const q = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const x = q[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const y = x - d;
      if (!wall[y] && !wall[y - d] && !live[y]) { live[y] = 1; q.push(y); }
    }
  }
  return live;
}

function reachLow(w, wall, occupied, from, seen, stamp, stack) {
  let low = from;
  let top = 0;
  stack[top++] = from;
  seen[from] = stamp;
  while (top > 0) {
    const p = stack[--top];
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1;
      if (wall[q] === 0 && occupied[q] === 0 && seen[q] !== stamp) { seen[q] = stamp; stack[top++] = q; }
    }
  }
  return low;
}

function frozenBlock(w, wall, occupied, goal, t) {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

function walkTo(w, wall, occupied, from, to) {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array(wall.length);
  const q = [from];
  prev[from] = from;
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    if (p === to) break;
    for (let k = 0; k < 4; k++) {
      const t = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1;
      if (wall[t] || occupied[t] || prev[t] !== -1) continue;
      prev[t] = p;
      how[t] = 'udlr'[k];
      q.push(t);
    }
  }
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

// rooms: cut the player row's non-live squares (the hallway), flood fill the rest
function roomsOf(level, live) {
  const { w, wall, goals, boxes, player } = level;
  const cut = new Uint8Array(wall.length);
  const row = Math.floor(player / w);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) { part[q] = rooms.length; squares.push(q); }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

// push-optimal BFS over pushes within a sub-board (maxStates cap), returns moves or null
function solvePushOptimal(level, maxStates = 250000) {
  const { w, wall, goals, boxes: boxes0, player } = level;
  const size = w * level.h;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(w, wall, goals);
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (bs) => bs.every((b) => goal[b]);
  if (boxes0.some((b) => !live[b])) return null;
  const statesBoxes = [boxes0];
  const statesPlayer = [player];
  const parent = [-1];
  const index = new Map();
  for (const b of boxes0) occupied[b] = 1;
  {
    let kk = reachLow(w, wall, occupied, player, seen, ++stamp, stack);
    for (const bb of boxes0) kk = kk * size + bb;
    index.set(kk, 0);
  }
  for (const b of boxes0) occupied[b] = 0;
  let found = solved(boxes0) ? 0 : -1;
  for (let head = 0; found < 0 && head < statesBoxes.length; head++) {
    const boxes = statesBoxes[head];
    for (const b of boxes) occupied[b] = 1;
    reachLow(w, wall, occupied, statesPlayer[head], seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi];
      for (let k = 0; k < 4; k++) {
        const d = k === 0 ? -w : k === 1 ? w : k === 2 ? -1 : 1;
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(w, wall, occupied, goal, t);
        let key = -1;
        let next = null;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          let kk = reachLow(w, wall, occupied, b, mark, ++stamp, stack);
          for (const bb of next) kk = kk * size + bb;
          key = kk;
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (frozen || index.has(key)) continue;
        if (statesBoxes.length >= maxStates) return null;
        index.set(key, statesBoxes.length);
        statesBoxes.push(next);
        statesPlayer.push(b);
        parent.push(head);
        if (solved(next)) { found = statesBoxes.length - 1; break; }
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;
  const path = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let cur = player;
  let boxes = boxes0;
  for (const s of path) {
    const nb = statesBoxes[s];
    const from = boxes.find((b) => !nb.includes(b));
    const to = nb.find((b) => !boxes.includes(b));
    const d = to - from;
    const dirIdx = d === -w ? 0 : d === w ? 1 : d === -1 ? 2 : 3;
    for (const b of boxes) occupied[b] = 1;
    moves += walkTo(w, wall, occupied, cur, from - d);
    for (const b of boxes) occupied[b] = 0;
    moves += 'udlr'[dirIdx].toUpperCase();
    cur = from;
    boxes = nb;
  }
  return moves;
}

function endOf(w, from, moves) {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

function solveByRooms(level, live) {
  const rooms = roomsOf(level, live);
  if (rooms === null) return solvePushOptimal(level);
  let player = level.player;
  let moves = '';
  for (const room of rooms) {
    const wall = level.wall.slice();
    for (const other of rooms) if (other !== room) for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    const sub = { w: level.w, h: level.h, wall, goals: room.goals.slice().sort((a, b) => a - b), boxes: room.boxes.slice().sort((a, b) => a - b), player };
    const solved = solvePushOptimal(sub);
    if (solved === null) return null;
    moves += solved;
    player = endOf(level.w, player, solved);
    room.done = true;
  }
  return moves;
}

for (const id of readdirSync(I).sort()) {
  const level = parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  const live = liveSquares(level.w, level.wall, level.goals);
  let sol = solveByRooms(level, live);
  if (sol === null) sol = '';
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${sol}\n`);
}
