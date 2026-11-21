# sokoban-solver

![license MIT](https://img.shields.io/badge/license-MIT-green)
![node >= 22](https://img.shields.io/badge/node-%3E%3D22-blue)
[![sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/competitions/sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/kejukids8-ai/sokoban-solver/rank.svg)](https://make.fun/competitions/sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/kejukids8-ai/sokoban-solver/reward.svg)](https://make.fun/competitions/sokoban-solver-01-run-20261121)

A push-optimal sokoban solver for make.fun competition `sokoban-solver-01-run-20261121`.

## How it works

The solver treats each drawn level as a set of rooms separated by a hallway (the player's row, cut at its dead squares),
flood-fills the rooms, and solves them one at a time with a breadth-first search over pushes (dead-square and frozen
2x2 deadlock pruning, player-region normalization); the other rooms' boxes stand as walls, on their goals once solved.
A box never leaves its room, so the rooms' push optima add up to the level's optimum. Levels that are no room set fall
back to a whole-level push-BFS.

`main.ts` reads `/input/<id>/level.txt` and writes `/output/<id>/solution.txt` (LURD moves, pushes uppercase).

## Layout

- `main.ts` — the solver and driver
- `LICENSE` — MIT
