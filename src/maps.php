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