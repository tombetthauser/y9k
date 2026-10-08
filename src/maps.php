<?php

declare(strict_types=1);

return [
    '----' => [
    'map' => <<<'MAP'
+-----------+
|           |
|           |
|           |
|           |
|           |
+-----------+
MAP,
    'smap' => <<<'SPOTMAP'
+--A--I--E--+
|           |
C           H
|           |
G           D
|           |
+--F--J--B--+
SPOTMAP,
    'spots' => [
        ['letter' => 'A', 'wall' => 0, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 0, 'col' => 3],
        ['letter' => 'B', 'wall' => 2, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 6, 'col' => 9],
        ['letter' => 'C', 'wall' => 3, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 2, 'col' => 0],
        ['letter' => 'D', 'wall' => 1, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 4, 'col' => 12],
        ['letter' => 'E', 'wall' => 0, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 0, 'col' => 9],
        ['letter' => 'F', 'wall' => 2, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 6, 'col' => 3],
        ['letter' => 'G', 'wall' => 3, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 4, 'col' => 0],
        ['letter' => 'H', 'wall' => 1, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 2, 'col' => 12],
        ['letter' => 'I', 'wall' => 0, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 0, 'col' => 6],
        ['letter' => 'J', 'wall' => 2, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 6, 'col' => 6],
    ],
    'text' => 'You are in a room with no doors.'
],
    'd---' => [
    'map' => <<<'MAP'
+----   ----+
|           |
|           |
|           |
|           |
|           |
+-----------+
MAP,
    'smap' => <<<'SPOTMAP'
+-A--   --E-+
|           |
C           H
|           |
G           D
|           |
+--F--I--B--+
SPOTMAP,
    'spots' => [
        ['letter' => 'A', 'wall' => 0, 'x' => -111, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 0, 'col' => 2],
        ['letter' => 'B', 'wall' => 2, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 6, 'col' => 9],
        ['letter' => 'C', 'wall' => 3, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 2, 'col' => 0],
        ['letter' => 'D', 'wall' => 1, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 4, 'col' => 12],
        ['letter' => 'E', 'wall' => 0, 'x' => 111, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 0, 'col' => 10],
        ['letter' => 'F', 'wall' => 2, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 6, 'col' => 3],
        ['letter' => 'G', 'wall' => 3, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 4, 'col' => 0],
        ['letter' => 'H', 'wall' => 1, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 2, 'col' => 12],
        ['letter' => 'I', 'wall' => 2, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 6, 'col' => 6],
    ],
    'text' => 'You are in a room with one door to the north.'
],
    '-d--' => [
    'map' => <<<'MAP'
+-----------+
|           |
|           |
|            
|           |
|           |
+-----------+
MAP,
    'smap' => <<<'SPOTMAP'
+--A--I--E--+
|           H
C           |
|            
G           |
|           D
+--F--J--B--+
SPOTMAP,
    'spots' => [
        ['letter' => 'A', 'wall' => 0, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 0, 'col' => 3],
        ['letter' => 'B', 'wall' => 2, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 6, 'col' => 9],
        ['letter' => 'C', 'wall' => 3, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 2, 'col' => 0],
        ['letter' => 'D', 'wall' => 1, 'x' => 122, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 5, 'col' => 12],
        ['letter' => 'E', 'wall' => 0, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 0, 'col' => 9],
        ['letter' => 'F', 'wall' => 2, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 6, 'col' => 3],
        ['letter' => 'G', 'wall' => 3, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 4, 'col' => 0],
        ['letter' => 'H', 'wall' => 1, 'x' => -122, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 1, 'col' => 12],
        ['letter' => 'I', 'wall' => 0, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 0, 'col' => 6],
        ['letter' => 'J', 'wall' => 2, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 6, 'col' => 6],
    ],
    'text' => 'You are in a room with one door to the east.'
],
    '--d-' => [
    'map' => <<<'MAP'
+-----------+
|           |
|           |
|           |
|           |
|           |
+----   ----+
MAP,
    'smap' => <<<'SPOTMAP'
+--A--I--E--+
|           |
C           H
|           |
G           D
|           |
+-F--   --B-+
SPOTMAP,
    'spots' => [
        ['letter' => 'A', 'wall' => 0, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 0, 'col' => 3],
        ['letter' => 'B', 'wall' => 2, 'x' => -111, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 6, 'col' => 10],
        ['letter' => 'C', 'wall' => 3, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 2, 'col' => 0],
        ['letter' => 'D', 'wall' => 1, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 4, 'col' => 12],
        ['letter' => 'E', 'wall' => 0, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 0, 'col' => 9],
        ['letter' => 'F', 'wall' => 2, 'x' => 111, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 6, 'col' => 2],
        ['letter' => 'G', 'wall' => 3, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 4, 'col' => 0],
        ['letter' => 'H', 'wall' => 1, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 2, 'col' => 12],
        ['letter' => 'I', 'wall' => 0, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 0, 'col' => 6],
    ],
    'text' => 'You are in a room with one door to the south.'
],
    '---d' => [
    'map' => <<<'MAP'
+-----------+
|           |
|           |
            |
|           |
|           |
+-----------+
MAP,
    'smap' => <<<'SPOTMAP'
+--A--I--E--+
C           |
|           H
            |
|           D
G           |
+--F--J--B--+
SPOTMAP,
    'spots' => [
        ['letter' => 'A', 'wall' => 0, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 0, 'col' => 3],
        ['letter' => 'B', 'wall' => 2, 'x' => -83, 'y' => 23, 'xmin' => null, 'xmax' => -42, 'row' => 6, 'col' => 9],
        ['letter' => 'C', 'wall' => 3, 'x' => 122, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 1, 'col' => 0],
        ['letter' => 'D', 'wall' => 1, 'x' => 61, 'y' => 23, 'xmin' => 0, 'xmax' => null, 'row' => 4, 'col' => 12],
        ['letter' => 'E', 'wall' => 0, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 0, 'col' => 9],
        ['letter' => 'F', 'wall' => 2, 'x' => 83, 'y' => 23, 'xmin' => 42, 'xmax' => null, 'row' => 6, 'col' => 3],
        ['letter' => 'G', 'wall' => 3, 'x' => -122, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 5, 'col' => 0],
        ['letter' => 'H', 'wall' => 1, 'x' => -61, 'y' => 23, 'xmin' => null, 'xmax' => 0, 'row' => 2, 'col' => 12],
        ['letter' => 'I', 'wall' => 0, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 0, 'col' => 6],
        ['letter' => 'J', 'wall' => 2, 'x' => 0, 'y' => 23, 'xmin' => -42, 'xmax' => 42, 'row' => 6, 'col' => 6],
    ],
    'text' => 'You are in a room with one door to the east.'
],
    'dddd' => [
    'map' => <<<'MAP'
    +   +
    |   |   
+---+   +---+

+---+   +---+
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with four doors to the north, east, south and west.'
],
    '-ddd' => [
    'map' => <<<'MAP'

   
+-----------+

+---+   +---+
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with three doors to the east, south and west.'
],
    'd-dd' => [
    'map' => <<<'MAP'
    +   +
    |   |   
+---+   |
        |
+---+   |
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with three doors to the north, south and west.'
],
    'dd-d' => [
    'map' => <<<'MAP'
    +   +
    |   |   
+---+   +---+
        
+-----------+


MAP,
    'text' => 'You are in a hallway with three doors to the north, east and west.'
],
    'ddd-' => [
    'map' => <<<'MAP'
    +   +
    |   |   
    |   +---+
    |
    |   +---+
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with three doors to the north, east and south.'
],
    'dd--' => [
    'map' => <<<'MAP'
    +   +
    |   |   
    |   +---+
    |
    +-------+


MAP,
    'text' => 'You are in a hallway with two doors to the north and east.'
],
    '-dd-' => [
    'map' => <<<'MAP'


    +-------+
    |
    |   +---+
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with two doors to the east and south.'
],
    '--dd' => [
    'map' => <<<'MAP'

   
+-------+
        |
+---+   |
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with two doors to the south and west.'
],
    'd--d' => [
    'map' => <<<'MAP'
    +   +
    |   |   
+---+   |
        |
+-------+
   

MAP,
    'text' => 'You are in a hallway with two doors to the west and north.'
],
    'd-d-' => [
    'map' => <<<'MAP'
    +   +
    |   |   
    |   |
    |   |
    |   |
    |   |   
    +   +
MAP,
    'text' => 'You are in a hallway with two doors to the north and south.'
],
    '-d-d' => [
    'map' => <<<'MAP'


+-----------+

+-----------+


MAP,
    'text' => 'You are in a hallway with two doors to the east and west.'
],
];
?>